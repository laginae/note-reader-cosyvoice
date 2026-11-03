'use strict';

// UI preferences only. Document text, paths and heading titles stay in memory.
const MINI_DEFAULTS = Object.freeze({ miniOutlineMode: 'auto', miniOutlineSide: 'right', miniOutlineHover: false, miniOutlineDepth: 2, miniOutlineTransparent: false, miniOutlineDoubleClick: false, miniOutlineWidth: 0, miniOutlineTitleLines: 2, miniOutlineStartup: false, miniOutlinePlaybackDisplay: 'toolbar', miniOutlineCollapsedStyle: 'auto' });
const PANE_BARS = '.note-reader-native-toolbar,.note-reader-mobile-dock,.view-header,.pdf-toolbar,#editingToolbarModalBar,#editingToolbarPopoverBar';
const FLOATING_BARS = '#editingToolbarModalBar,#editingToolbarPopoverBar';
const OTHER_OUTLINES = ['floating-toc', 'dynamic-outline', 'subtle-toc', 'heading-scroller', 'slick-outline', 'hovered-table-of-content', 'ink-floating-toc', 'gogoga-outline'];
function normalizeMiniSettings(settings = {}) {
  const width = ['number', 'string'].includes(typeof settings.miniOutlineWidth) ? Number(settings.miniOutlineWidth) : NaN;
  return { miniOutlineMode: ['auto', 'always', 'off'].includes(settings.miniOutlineMode) ? settings.miniOutlineMode : 'auto',
    miniOutlineSide: settings.miniOutlineSide === 'left' ? 'left' : 'right', miniOutlineHover: settings.miniOutlineHover === true,
    miniOutlineDepth: [1, 2, 3, 6].includes(Number(settings.miniOutlineDepth)) ? Number(settings.miniOutlineDepth) : 2,
    miniOutlineTransparent: settings.miniOutlineTransparent === true, miniOutlineDoubleClick: settings.miniOutlineDoubleClick === true,
    miniOutlineWidth: Number.isFinite(width) && width > 0 ? Math.max(180, Math.min(600, Math.round(width / 10) * 10)) : 0,
    miniOutlineTitleLines: [1, 2, 3, 4, '1', '2', '3', '4'].includes(settings.miniOutlineTitleLines) ? Number(settings.miniOutlineTitleLines) : 2,
    miniOutlineStartup: settings.miniOutlineStartup === true,
    miniOutlinePlaybackDisplay: settings.miniOutlinePlaybackDisplay === 'session' ? 'session' : 'toolbar',
    miniOutlineCollapsedStyle: ['auto', 'rail', 'icon'].includes(settings.miniOutlineCollapsedStyle) ? settings.miniOutlineCollapsedStyle : 'auto' };
}
function otherOutlineEnabled(app) {
  const enabled = app?.plugins?.enabledPlugins;
  return OTHER_OUTLINES.some(id => enabled?.has?.(id) || (!enabled && app?.plugins?.plugins?.[id]));
}
function headingParents(entries) {
  const stack = [];
  return entries.map((entry, i) => {
    while (stack.length && entries[stack.at(-1)].level >= entry.level) stack.pop();
    const parents = stack.slice(); stack.push(i); return parents;
  });
}
function headingAt(entries, offset, field = 'offset') {
  if (!Number.isFinite(offset)) return -1;
  let result = -1;
  entries.forEach((entry, i) => { if (Number.isFinite(entry[field]) && entry[field] <= offset) result = i; });
  return result;
}

function railHeadings(entries, limit = 24) {
  if (!entries.length) return [];
  const levels = [...new Set(entries.map(entry => entry.level))].sort((a, b) => a - b);
  let indices = [];
  for (const level of levels) {
    const next = entries.map((entry, i) => entry.level <= level || i === 0 ? i : -1).filter(i => i >= 0);
    if (next.length > limit && indices.length) break;
    indices = next;
    if (indices.length >= limit) break;
  }
  // Preserve chapter order, not page percentages. Dense outlines summarize shallower sections.
  return indices.length <= limit ? indices : Array.from({ length: limit }, (_, i) => indices[Math.floor(i * (indices.length - 1) / (limit - 1))]);
}

class MiniOutlinePanel {
  constructor(manager, view) {
    this.manager = manager; this.plugin = manager.plugin; this.adapter = manager.adapter; this.view = view;
    this.doc = view.containerEl.ownerDocument; this.language = this.plugin.settings.settingsLanguage; this.generation = 0; this.rows = new Map();
    this.root = this.el(view.containerEl, 'div', 'cozy-mini-toc');
    this.launcher = this.button(this.root, 'list-tree', this.t('打开迷你目录', 'Open mini outline'), event => this.toggle({ focus: event.detail === 0 }));
    this.launcher.classList.add('cozy-mini-launcher'); this.launcher.setAttribute('aria-expanded', 'false');
    this.panel = this.el(this.root, 'section', 'cozy-mini-panel'); this.panel.hidden = true;
    this.panel.setAttribute('aria-label', this.t('迷你目录', 'Mini outline'));
    const header = this.header = this.el(this.panel, 'div', 'cozy-mini-header');
    header.setAttribute('role', 'toolbar'); header.setAttribute('aria-label', this.t('目录操作', 'Outline controls'));
    this.pin = this.button(header, 'pin', this.t('固定目录', 'Pin outline'), () => {
      if (this.state) {
        this.state.pinned = !this.state.pinned; this.updatePin();
        if (!this.state.pinned) {
          this.manager.collapsedEntryRequested = true;
          if (this.touchInput()) this.close(true); else this.scheduleCollapse();
        } else clearTimeout(this.collapseTimer);
      }
    });
    this.pause = this.manager.playback.button(header);
    this.searchToggle = this.button(header, 'search', this.t('搜索章节', 'Search headings'), () => this.toggleSearch());
    this.searchToggle.setAttribute('aria-expanded', 'false');
    this.back = this.button(header, 'corner-up-left', this.t('回到朗读位置', 'Return to reading'), async () => {
      if (!await this.valid()) return;
      this.state.manual = false; this.selectedSection = null; await this.adapter.returnReading(this.view, this.data); this.update(true);
    });
    this.edgeButtons = [];
    const addEdges = (parent, cls) => {
      for (const [end, icon, label] of [[false, 'arrow-up-to-line', this.t('到文档顶部', 'Go to document top')], [true, 'arrow-down-to-line', this.t('到文档底部', 'Go to document bottom')]]) {
        const button = this.button(parent, icon, label, () => this.locateEdge(end));
        button.classList.add(cls); button.hidden = cls === 'cozy-mini-edge-primary'; this.edgeButtons.push(button);
      }
    };
    addEdges(header, 'cozy-mini-edge-primary');
    this.optionsToggle = this.button(header, 'ellipsis', this.t('目录选项', 'Outline options'), () => {
      this.tools.hidden = !this.tools.hidden; this.optionsToggle.setAttribute('aria-expanded', String(!this.tools.hidden));
      this.updateSectionControls(); this.layoutControls();
      this.scheduleCollapse();
    });
    this.optionsToggle.setAttribute('aria-expanded', 'false');
    this.closeButton = this.button(header, 'x', this.t('关闭目录', 'Close outline'), () => this.close(true));
    this.closeButton.classList.add('cozy-mini-close');
    this.search = this.el(this.panel, 'input', 'cozy-mini-search'); this.search.type = 'search'; this.search.hidden = true;
    this.search.placeholder = this.t('搜索章节', 'Search headings'); this.search.setAttribute('aria-label', this.search.placeholder);
    this.search.addEventListener('input', () => { if (this.data) { this.state.query = this.search.value; this.limit = 200; this.draw(); } });
    const tools = this.tools = this.el(this.panel, 'div', 'cozy-mini-tools'); tools.hidden = true;
    this.depth = this.el(tools, 'select'); this.depth.setAttribute('aria-label', this.t('展开层级', 'Expanded levels'));
    for (const [value, label] of [[1, this.t('一级', 'One level')], [2, this.t('两级', 'Two levels')], [3, this.t('三级', 'Three levels')], [6, this.t('全部', 'All levels')]]) {
      const option = this.el(this.depth, 'option'); option.value = String(value); option.textContent = label;
    }
    this.depth.addEventListener('change', () => { if (this.data) { this.state.depth = Number(this.depth.value); this.applyDepth(); this.draw(); } });
    this.button(tools, 'refresh-cw', this.t('刷新目录', 'Refresh outline'), () => this.load(true));
    this.optionEdges = this.el(tools, 'div', 'cozy-mini-option-edges');
    addEdges(this.optionEdges, 'cozy-mini-edge-secondary');
    this.optionsClose = this.button(tools, 'x', this.t('关闭目录', 'Close outline'), () => this.close(true));
    this.optionsClose.classList.add('cozy-mini-close-secondary');
    this.sectionTools = this.el(tools, 'div', 'cozy-mini-section-tools'); this.sectionTools.setAttribute('role', 'group');
    this.sectionLabel = this.el(this.sectionTools, 'span', 'cozy-mini-section-label');
    const sectionCommands = this.sectionCommands = this.el(this.sectionTools, 'div', 'cozy-mini-section-commands');
    this.sectionButtons = [
      ['play', this.t('从本节朗读', 'Read from this section')],
      ['audio-lines', this.t('只朗读本节', 'Read this section only')],
      ['wrap-text', this.t('展开完整标题', 'Show full heading')],
    ].map(([icon, label], slot) => this.button(sectionCommands, icon, label, () => {
      const action = this.sectionActions(this.currentSectionIndex())[slot];
      if (action && !action.disabled) return action.action();
    }));
    this.sectionMenuToggle = this.button(this.sectionTools, 'chevron-down', this.t('章节操作', 'Section actions'), event => {
      this.sectionMenu(event, this.currentSectionIndex(), this.sectionMenuToggle);
    });
    this.sectionMenuToggle.hidden = true; this.sectionMenuToggle.setAttribute('aria-haspopup', 'menu');
    this.status = this.el(this.panel, 'div', 'cozy-mini-status'); this.status.setAttribute('role', 'status');
    this.list = this.el(this.panel, 'div', 'cozy-mini-list'); this.list.setAttribute('role', 'group');
    this.list.setAttribute('aria-label', this.t('章节', 'Sections'));
    this.more = this.button(this.panel, 'chevrons-down', this.t('显示更多章节', 'Show more headings'), () => { this.limit += 200; this.draw(); });
    this.more.hidden = true;
    this.list.addEventListener('scroll', () => { if (this.state) this.state.scroll = this.list.scrollTop; });
    for (const name of ['wheel', 'touchstart', 'pointerdown']) this.list.addEventListener(name, () => { if (this.state) this.state.manual = true; }, { passive: true });
    this.touchControls = this.touchInput(); this.panel.classList.toggle('is-touch-controls', this.touchControls);
    this.pointerMode = event => {
      if (!['mouse', 'touch', 'pen'].includes(event.pointerType)) return;
      this.lastPointerType = event.pointerType;
      const touch = this.touchInput();
      if (touch === this.touchControls) return;
      this.touchControls = touch; this.panel.classList.toggle('is-touch-controls', touch);
      clearTimeout(this.hoverTimer); clearTimeout(this.collapseTimer); this.updateLauncher(); this.scheduleLayout();
    };
    this.outside = event => {
      this.keyboardControls = false;
      this.pointerMode(event);
      if (this.actionMenu && event.target?.closest?.('.menu')) return;
      if (this.opened && !this.state?.pinned && !this.root.contains(event.target) && !event.target?.closest?.('[data-cozy-mini-toggle]')) this.close();
    };
    this.doc.addEventListener('pointerdown', this.outside, true);
    // Track input changes, not pointer coordinates or every movement. Hybrids may report both capabilities.
    this.doc.addEventListener('pointerover', this.pointerMode, { capture: true, passive: true });
    this.keyboardMode = () => { this.keyboardControls = true; };
    this.doc.addEventListener('keydown', this.keyboardMode, true);
    this.panel.addEventListener('keydown', event => this.keydown(event));
    this.launcher.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && !this.touchInput() && !this.launcher.hidden && (this.railVisible || this.settings().miniOutlineHover)) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = setTimeout(() => {
          if (!this.destroyed && !this.launcher.hidden) void this.open().catch(() => { if (!this.destroyed) this.error(); });
        }, 200);
      }
    });
    this.root.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') { this.pointerInside = true; clearTimeout(this.collapseTimer); }
    });
    this.root.addEventListener('pointerleave', () => {
      this.pointerInside = false; clearTimeout(this.hoverTimer); this.scheduleCollapse();
    });
    this.root.addEventListener('focusin', () => { if (this.keyboardControls) clearTimeout(this.collapseTimer); });
    this.root.addEventListener('focusout', () => {
      clearTimeout(this.focusTimer); this.focusTimer = setTimeout(() => this.scheduleCollapse(), 0);
    });
    this.scroll = event => {
      if (this.root.contains(event.target) || this.scrollTimer) return;
      this.scrollTimer = setTimeout(() => { this.scrollTimer = null; this.layout(); this.update(); }, 100);
    };
    this.view.containerEl.addEventListener('scroll', this.scroll, true);
    this.resize = () => this.scheduleLayout();
    this.doc.defaultView?.addEventListener('resize', this.resize);
    this.doc.defaultView?.visualViewport?.addEventListener('resize', this.resize);
    const Observer = this.doc.defaultView?.ResizeObserver;
    if (Observer) { this.resizeObserver = new Observer(this.resize); this.resizeObserver.observe(view.containerEl); }
    const Mutations = this.doc.defaultView?.MutationObserver;
    if (Mutations) {
      // Observe toolbar changes, not text content or playback ticks. Never mutate a third-party toolbar.
      this.barObserver = new Mutations(() => this.scheduleLayout());
      this.structureObserver = new Mutations(records => {
        if (records.some(record => !this.root.contains(record.target) && [...record.addedNodes, ...record.removedNodes]
          .some(node => node.nodeType === 1 && (node.matches(PANE_BARS) || node.querySelector(PANE_BARS))))) this.scheduleLayout(true);
      });
      this.structureObserver.observe(view.containerEl, { childList: true, subtree: true });
      if (this.doc.body !== view.containerEl) this.structureObserver.observe(this.doc.body, { childList: true });
    }
    this.setLoading(true);
    this.configure();
  }
  settings() { return normalizeMiniSettings(this.plugin.settings); }
  touchInput() {
    if (this.doc.body.classList.contains('is-mobile')) return true;
    if (this.lastPointerType) return this.lastPointerType !== 'mouse';
    return this.doc.defaultView.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches !== true;
  }
  scheduleCollapse() {
    clearTimeout(this.collapseTimer);
    if (this.destroyed || !this.opened || this.touchInput() || this.state?.pinned || this.pointerInside) return;
    this.collapseTimer = setTimeout(() => {
      if (!this.destroyed && this.opened && !this.state?.pinned && !this.pointerInside && !this.actionMenu
        && this.search.hidden && this.tools.hidden && !(this.keyboardControls && this.root.contains(this.doc.activeElement))) this.close();
    }, 250);
  }
  updateLauncher() {
    const settings = this.settings();
    this.launcher.hidden = !!this.opened || settings.miniOutlineMode === 'off'
      || (settings.miniOutlineMode === 'auto' && otherOutlineEnabled(this.plugin.app))
      || (settings.miniOutlineStartup && !this.manager.collapsedEntryRequested);
    const data = !this.invalid && this.file === this.view.file ? this.data : null;
    const rail = !!data?.entries.length && (settings.miniOutlineCollapsedStyle === 'rail'
      || (settings.miniOutlineCollapsedStyle === 'auto' && !this.touchInput()));
    this.launcher.classList.toggle('is-touch-control', this.touchInput());
    this.launcher.classList.toggle('is-rail', rail); this.railVisible = rail;
    const limit = this.railLimit || 24;
    if (this.railData !== (rail ? data : null) || this.renderedRailLimit !== limit || this.launcherStyle !== (rail ? 'rail' : 'icon')) {
      this.railData = rail ? data : null; this.renderedRailLimit = limit; this.launcherStyle = rail ? 'rail' : 'icon';
      this.launcher.replaceChildren(); this.railMarks = [];
      if (rail) {
        const wrap = this.el(this.launcher, 'span', 'cozy-mini-rail'); wrap.setAttribute('aria-hidden', 'true');
        const indices = railHeadings(data.entries, limit), minLevel = Math.min(...indices.map(i => data.entries[i].level));
        this.railMarks = indices.map((index, slot) => {
          const mark = this.el(wrap, 'span', 'cozy-mini-rail-mark');
          mark.style.setProperty('--cozy-rail-depth', String(Math.max(0, Math.min(3, data.entries[index].level - minLevel))));
          return { mark, index, end: indices[slot + 1] ?? data.entries.length };
        });
      } else this.manager.setIcon(this.launcher, 'list-tree');
    }
    this.launcher.setAttribute('aria-label', this.t('打开迷你目录', 'Open mini outline')
      + (rail ? this.t(`，共 ${data.entries.length} 个章节`, `, ${data.entries.length} sections`) : ''));
    this.updateRailPositions();
  }
  updateRailPositions() {
    for (const { mark, index, end } of this.railMarks || []) {
      mark.classList.toggle('is-browsing', this.browsing >= index && this.browsing < end);
      mark.classList.toggle('is-reading', this.reading >= index && this.reading < end);
    }
  }
  t(zh, en) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  el(parent, tag, cls) { const el = this.doc.createElement(tag); if (cls) el.className = cls; parent.appendChild(el); return el; }
  button(parent, icon, label, action) {
    const el = this.el(parent, 'button', 'clickable-icon'); el.type = 'button'; this.manager.setIcon(el, icon);
    el.setAttribute('aria-label', label);
    el.addEventListener('click', event => {
      event.stopPropagation();
      Promise.resolve().then(() => action(event)).catch(() => this.error());
    });
    return el;
  }
  error() { this.status.textContent = this.t('文档可能已变化，请刷新目录后重试。', 'The document may have changed. Refresh the outline and retry.'); }
  updatePin() {
    this.pin.setAttribute('aria-pressed', String(this.state.pinned));
    this.pin.setAttribute('aria-label', this.state.pinned ? this.t('取消固定目录', 'Unpin outline') : this.t('固定目录', 'Pin outline'));
  }
  mouseDoubleClick(pointerType) {
    return this.settings().miniOutlineDoubleClick && pointerType === 'mouse' && !this.doc.body.classList.contains('is-mobile')
      && this.doc.defaultView.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
  }
  configure() {
    const settings = this.settings(); this.root.dataset.side = settings.miniOutlineSide;
    this.root.dataset.background = settings.miniOutlineTransparent ? 'transparent' : 'solid';
    this.root.dataset.playbackDisplay = settings.miniOutlinePlaybackDisplay;
    this.root.style.setProperty('--cozy-mini-title-lines', String(settings.miniOutlineTitleLines));
    if (settings.miniOutlineWidth) this.root.style.setProperty('--cozy-mini-width', `${settings.miniOutlineWidth}px`);
    else this.root.style.removeProperty('--cozy-mini-width');
    this.updateLauncher();
    const headers = [...this.view.containerEl.querySelectorAll(PANE_BARS), ...[...this.doc.querySelectorAll(FLOATING_BARS)]
      .filter(el => !this.view.containerEl.contains(el) && !el.closest('.workspace-leaf-content'))];
    if (headers.length !== this.observedHeaders?.length || headers.some((el, i) => el !== this.observedHeaders?.[i])) {
      this.resizeObserver?.disconnect(); this.resizeObserver?.observe(this.view.containerEl); this.barObserver?.disconnect();
      this.resizeObserver?.observe(this.header); this.resizeObserver?.observe(this.sectionTools);
      headers.forEach(el => {
        this.resizeObserver?.observe(el);
        this.barObserver?.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      });
      this.observedHeaders = headers;
    }
    this.layout();
  }
  scheduleLayout(configure = false) {
    if (this.destroyed) return;
    this.needsConfigure ||= configure;
    if (this.layoutTimer) return;
    this.layoutTimer = setTimeout(() => {
      this.layoutTimer = null;
      const refresh = this.needsConfigure; this.needsConfigure = false;
      if (refresh) this.configure(); else this.layout();
    }, 40);
  }
  toggleSearch() {
    this.search.hidden = !this.search.hidden; this.searchToggle.setAttribute('aria-expanded', String(!this.search.hidden));
    if (this.state) this.state.searchOpen = !this.search.hidden;
    if (!this.search.hidden) this.search.focus({ preventScroll: true });
    else {
      this.search.value = '';
      if (this.data) { this.state.query = ''; this.limit = 200; this.draw(); }
      this.searchToggle.focus({ preventScroll: true });
    }
    this.scheduleCollapse();
  }
  toggle(options) { if (this.opened) this.close(true); else return this.open(options); }
  async open({ pin = false, focus = false } = {}) {
    if (this.destroyed || !this.view.file) return;
    clearTimeout(this.hoverTimer); clearTimeout(this.collapseTimer);
    this.manager.cancelStartup();
    if (pin) { this.state = this.manager.state(this.view.file.path); this.state.pinned = true; this.updatePin(); }
    this.opened = true; this.panel.hidden = false; this.launcher.setAttribute('aria-expanded', 'true');
    this.updateLauncher();
    this.layout();
    if (this.loading && this.loadingFile === this.view.file && !this.collapsedLoading) return;
    if (!this.data || this.file !== this.view.file || this.invalid || !this.adapter.valid(this.view, this.data)) await this.load();
    else this.update(true);
    if (focus && this.opened && !this.destroyed) {
      this.keyboardControls = true;
      (this.rows.get(this.browsing)?.title || this.rows.values().next().value?.title || this.closeButton).focus({ preventScroll: true });
    }
  }
  close(focus = false, cancelStartup = true) {
    if (this.opened && cancelStartup) this.manager.cancelStartup();
    this.headingAction = (this.headingAction || 0) + 1;
    this.selectedSection = null; this.positionKey = null;
    clearTimeout(this.hoverTimer); clearTimeout(this.reloadTimer); clearTimeout(this.collapseTimer); clearTimeout(this.railUpdateTimer); this.railUpdateTimer = null;
    if (this.opened && cancelStartup) this.manager.collapsedEntryRequested = true;
    this.dismissMenu();
    this.opened = false; this.panel.hidden = true; this.launcher.setAttribute('aria-expanded', 'false');
    this.tools.hidden = true; this.optionsToggle.setAttribute('aria-expanded', 'false');
    if (this.loading) { this.generation++; this.loading = false; this.invalid = true; }
    this.updateLauncher(); this.update();
    this.layout();
    if (focus && !this.launcher.hidden) this.launcher.focus({ preventScroll: true });
  }
  layoutControls() {
    if (!this.opened || this.destroyed) return;
    const win = this.doc.defaultView;
    const size = element => {
      const style = win.getComputedStyle(element);
      const extra = style.boxSizing === 'border-box' ? 0 : ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .reduce((total, key) => total + (parseFloat(style[key]) || 0), 0);
      // Close uses an auto spacer; its resolved free space is not required button width.
      const marginLeft = element === this.closeButton ? 0 : parseFloat(style.marginLeft) || 0;
      return (element.getBoundingClientRect().width || Math.max(parseFloat(style.width) || 0, parseFloat(style.minWidth) || 0) + extra)
        + marginLeft + (parseFloat(style.marginRight) || 0);
    };
    const available = element => {
      const style = win.getComputedStyle(element);
      return (element.clientWidth || element.getBoundingClientRect().width)
        - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    };
    const gap = element => parseFloat(win.getComputedStyle(element).columnGap) || 0;
    const primary = this.edgeButtons.slice(0, 2), secondary = this.edgeButtons.slice(2);
    const controls = [...this.header.children].filter(button => primary.includes(button) || win.getComputedStyle(button).display !== 'none');
    const required = controls.reduce((total, button) => total + size(button), 0) + gap(this.header) * (controls.length - 1);
    const room = available(this.header), fit = room > 0 && required > 0 && required + 1 <= room;
    for (const button of primary) button.hidden = !fit;
    for (const button of secondary) button.hidden = fit;
    this.optionEdges.hidden = fit;
    if (this.tools.hidden) return;
    const touch = this.touchControls || this.doc.body.classList.contains('is-mobile')
      || win.matchMedia?.('(pointer: coarse), (max-width: 600px)')?.matches === true;
    const labelWidth = 8 * (parseFloat(win.getComputedStyle(this.sectionLabel).fontSize) || 12);
    const actionWidth = this.sectionButtons.reduce((total, button) => total + size(button), 0)
      + gap(this.sectionCommands) * (this.sectionButtons.length - 1);
    const compact = touch || labelWidth + actionWidth + gap(this.sectionTools) + 1 > available(this.sectionTools);
    const focused = this.doc.activeElement;
    this.sectionCommands.hidden = compact; this.sectionMenuToggle.hidden = !compact;
    if (compact && this.sectionCommands.contains(focused)) this.sectionMenuToggle.focus({ preventScroll: true });
    else if (!compact && focused === this.sectionMenuToggle) this.sectionButtons.find(button => !button.disabled)?.focus({ preventScroll: true });
  }
  layout() {
    if (this.destroyed) return;
    const host = this.view.containerEl.getBoundingClientRect(), win = this.doc.defaultView;
    const viewport = win.visualViewport, bottom = Math.min(host.bottom, (viewport?.offsetTop || 0) + (viewport?.height || win.innerHeight));
    let top = Math.max(host.top + 44, (viewport?.offsetTop || 0) + 12);
    const entryHeight = this.launcher.hidden ? 0 : this.launcher.getBoundingClientRect().height;
    const width = this.opened ? this.panel.getBoundingClientRect().width : (this.launcher.getBoundingClientRect().width || 32);
    this.layoutControls();
    const left = this.settings().miniOutlineSide === 'left' ? host.left + 10 : host.right - 10 - width;
    const bars = (this.observedHeaders || []).map(el => {
      const rect = el.getBoundingClientRect(), style = win.getComputedStyle(el);
      return rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' ? rect : null;
    }).filter(Boolean).sort((a, b) => a.top - b.top);
    for (const rect of bars) {
      if (rect.left < left + width && rect.right > left && rect.bottom > top - 8 && rect.top < top + Math.max(entryHeight, 44) + 8) top = Math.max(top, rect.bottom + 8);
    }
    this.root.style.setProperty('--cozy-mini-top', `${Math.max(8, top - host.top)}px`);
    this.root.style.setProperty('--cozy-mini-height', `${Math.max(80, bottom - top - entryHeight - 100)}px`);
    const railLimit = host.height > 0 ? Math.max(3, Math.min(24, Math.floor((bottom - top - 116) / 7))) : 24;
    if (railLimit !== this.railLimit) { this.railLimit = railLimit; this.updateLauncher(); }
  }
  ensureCollapsed() {
    const settings = this.settings();
    if (this.destroyed || this.opened || this.loading || this.launcher.hidden || !this.manager.collapsedEntryRequested
      || this.manager.startupView() !== this.view || typeof this.adapter.loadCollapsed !== 'function'
      || settings.miniOutlineCollapsedStyle === 'icon' || (settings.miniOutlineCollapsedStyle === 'auto' && this.touchInput())) return;
    if (this.data && this.file === this.view.file && !this.invalid && this.adapter.valid(this.view, this.data)) return;
    if (this.collapsedAttempt?.file === this.view.file && this.collapsedAttempt.generation === this.generation) return;
    void this.load(false, true);
  }
  async load(force = false, collapsed = false) {
    this.dismissMenu();
    const generation = ++this.generation, file = this.view.file;
    const cancelled = () => this.destroyed || generation !== this.generation || file !== this.view.file
      || (collapsed ? this.opened || this.launcher.hidden || this.manager.startupView() !== this.view : !this.opened);
    this.loading = true; this.collapsedLoading = collapsed; this.loadingFile = file; this.invalid = false; this.data = null; this.selectedSection = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true;
    this.reading = this.browsing = -1;
    this.updateLauncher();
    this.setLoading(true);
    this.status.textContent = this.t('正在读取目录…', 'Loading outline…');
    try {
      const data = await (collapsed ? this.adapter.loadCollapsed(this.view, cancelled) : this.adapter.load(this.view, cancelled, force));
      if (cancelled()) return;
      if (!data) { this.invalid = true; if (!collapsed) this.error(); return; }
      this.data = data; this.file = file; this.limit = 200; this.expandedTitles = new Set();
      const { miniOutlineTitle } = require('./mini-outline-title');
      this.titles = data.entries.map(entry => miniOutlineTitle(entry.title, data.kind) || this.t('未命名章节', 'Untitled section'));
      this.parents = headingParents(data.entries);
      this.state = this.manager.state(file.path);
      // Keep state for unchanged heading structure; never persist heading text.
      const shape = JSON.stringify(data.entries.map(e => [e.title, e.level]));
      if (this.state.shape !== shape) { this.state.shape = shape; this.applyDepth(); }
      this.search.value = this.state.query; this.depth.value = String(this.state.depth);
      this.search.hidden = !this.state.query && !this.state.searchOpen;
      this.searchToggle.setAttribute('aria-expanded', String(!this.search.hidden));
      this.updatePin();
      this.setLoading(false);
      this.status.textContent = data.entries.length ? (data.entries.some(e => e.inferred || e.approximate)
        ? this.t('包含自动识别或按页定位的章节', 'Includes detected or page-level headings') : '')
        : this.t('未找到可用章节', 'No headings available');
      this.draw();
      this.updateLauncher();
    } catch { if (!cancelled()) { this.invalid = true; if (!collapsed) this.error(); } }
    finally {
      if (collapsed && !cancelled()) this.collapsedAttempt = { file, generation };
      if (generation === this.generation) { this.loading = false; this.collapsedLoading = false; }
    }
  }
  setLoading(loading) {
    this.pin.disabled = this.searchToggle.disabled = this.search.disabled = this.depth.disabled = loading;
    this.edgeButtons.forEach(button => { button.disabled = loading; });
    if (loading) this.back.disabled = true;
    this.updateSectionControls();
  }
  applyDepth() { this.state.collapsed = new Set(this.data.entries.map((_, i) => i).filter(i => this.parents[i].length >= this.state.depth - 1)); }
  invalidate() {
    this.dismissMenu();
    this.invalid = true; this.generation++; this.loading = false; this.data = null; this.selectedSection = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true; this.setLoading(true);
    this.reading = this.browsing = -1;
    this.positionKey = null; this.updateLauncher();
    if (this.opened) { clearTimeout(this.reloadTimer); this.reloadTimer = setTimeout(() => this.load(), 180); }
  }
  draw() {
    if (!this.data) return;
    const query = this.state.query.trim().toLocaleLowerCase(), visible = new Set(), top = this.state.scroll;
    if (query) this.data.entries.forEach((entry, i) => { if (this.titles[i].toLocaleLowerCase().includes(query) || entry.title.toLocaleLowerCase().includes(query)) { visible.add(i); this.parents[i].forEach(p => visible.add(p)); } });
    this.list.replaceChildren(); this.rows.clear();
    const indices = this.data.entries.map((_, i) => i).filter(i => query ? visible.has(i) : !this.parents[i].some(p => this.state.collapsed.has(p)));
    this.list.classList.toggle('cozy-mini-flat', !this.parents.some(parents => parents.length));
    for (const index of indices.slice(0, this.limit)) {
      const entry = this.data.entries[index], row = this.el(this.list, 'div', 'cozy-mini-row');
      row.style.setProperty('--cozy-mini-depth', String(Math.min(6, this.parents[index].length)));
      row.classList.toggle('is-expanded', this.expandedTitles.has(index));
      const children = this.data.entries[index + 1]?.level > entry.level;
      const toggle = this.button(row, this.state.collapsed.has(index) ? 'chevron-right' : 'chevron-down', this.t('展开或折叠章节', 'Expand or collapse section'), () => {
        if (this.state.collapsed.has(index)) this.state.collapsed.delete(index); else this.state.collapsed.add(index); this.draw();
      });
      toggle.disabled = !children || Boolean(query); toggle.classList.toggle('cozy-mini-leaf', !children);
      toggle.setAttribute('aria-expanded', String(!this.state.collapsed.has(index)));
      const data = this.data;
      let pointerType = 'mouse', navigation, startingRead = false;
      const current = () => !this.destroyed && this.opened && this.data === data && title.isConnected;
      const title = this.button(row, 'heading', this.t('定位：', 'Go to: ') + this.titles[index], event => {
        if (event.detail > 1) return;
        this.selectSection(index);
        const action = this.headingAction = (this.headingAction || 0) + 1;
        const keepOpen = event.detail > 0 && this.mouseDoubleClick(event.pointerType || pointerType);
        navigation = (async () => {
          if (!current() || !await this.valid()) return;
          this.state.manual = true; this.adapter.pauseFollow(this.view);
          await this.adapter.locate(this.view, data, index);
          // Keep the first mouse click available for a native double-click; navigation itself is immediate.
          if (current() && action === this.headingAction && !this.state.pinned && !keepOpen) this.close();
        })();
        return navigation;
      });
      title.classList.add('cozy-mini-title'); title.replaceChildren();
      this.el(title, 'span', 'cozy-mini-label').textContent = this.titles[index];
      title.addEventListener('pointerdown', event => { pointerType = event.pointerType || 'mouse'; this.selectSection(index); });
      title.addEventListener('focus', () => this.selectSection(index));
      title.setAttribute('aria-keyshortcuts', 'Shift+F10');
      title.addEventListener('dblclick', event => {
        if (!current() || startingRead || !this.mouseDoubleClick(event.pointerType || pointerType)) return;
        event.preventDefault(); event.stopPropagation(); startingRead = true;
        const action = this.headingAction;
        Promise.resolve(navigation).then(async () => {
          if (current() && action === this.headingAction && this.mouseDoubleClick(event.pointerType || pointerType)) await this.read(index, true);
        }).catch(() => this.error()).finally(() => { startingRead = false; });
      });
      row.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); this.selectSection(index); this.sectionMenu(event, index, title); });
      this.rows.set(index, { row, title });
    }
    if (query && !indices.length) this.el(this.list, 'p').textContent = this.t('没有匹配的章节', 'No matching headings');
    this.more.hidden = indices.length <= this.limit; this.list.scrollTop = top;
    this.positionKey = null; this.update();
  }
  dismissMenu() {
    const menu = this.actionMenu; this.actionMenu = null; menu?.hide(); clearTimeout(this.menuCloseTimer);
    this.panel.classList.remove('has-open-menu');
  }
  selectSection(index) {
    if (!this.data?.entries[index] || this.invalid) return;
    this.selectedSection = { data: this.data, index }; this.updateSectionControls();
  }
  currentSectionIndex() {
    if (!this.data || this.invalid || this.file !== this.view.file || this.destroyed) return -1;
    const selected = this.selectedSection?.data === this.data ? this.selectedSection.index : -1;
    return [selected, this.browsing, this.reading].find(index => Number.isInteger(index) && index >= 0 && index < this.data.entries.length) ?? -1;
  }
  updateSectionControls() {
    const index = this.currentSectionIndex(), items = this.sectionActions(index);
    const caption = index >= 0 ? this.t('章节：', 'Section: ') + this.titles[index] : this.t('当前没有可操作的章节', 'No section available');
    this.sectionLabel.textContent = caption; this.sectionTools.setAttribute('aria-label', caption);
    this.sectionMenuToggle.disabled = !items.length;
    this.sectionMenuToggle.setAttribute('aria-label', this.t('章节操作：', 'Section actions: ') + (index >= 0 ? this.titles[index] : caption));
    this.sectionButtons.forEach((button, slot) => {
      button.disabled = !items[slot] || items[slot].disabled;
      if (items[slot]) button.setAttribute('aria-label', items[slot].label);
    });
    this.sectionButtons[2].setAttribute('aria-pressed', String(index >= 0 && this.expandedTitles.has(index)));
  }
  sectionActions(index) {
    if (!this.data?.entries[index] || this.invalid || this.file !== this.view.file) return [];
    const data = this.data, epoch = this.headingAction, expanded = this.expandedTitles.has(index);
    const scoped = action => async () => {
      if (this.destroyed || !this.opened || this.data !== data || this.headingAction !== epoch || !await this.valid()
        || this.destroyed || !this.opened || this.data !== data || this.headingAction !== epoch || this.file !== this.view.file) return;
      try { await action(); } catch { this.error(); }
    };
    return [
      { label: this.t('从本节朗读', 'Read from this section'), icon: 'play', disabled: this.sectionReadPending || this.adapter.busy(), action: scoped(() => this.read(index, true)) },
      { label: this.t('只朗读本节', 'Read this section only'), icon: 'audio-lines', disabled: this.sectionReadPending || this.adapter.busy(), action: scoped(() => this.read(index, false)) },
      { label: expanded ? this.t('收起标题', 'Collapse heading') : this.t('展开完整标题', 'Show full heading'), icon: 'wrap-text', action: scoped(async () => {
        const show = !this.expandedTitles.has(index);
        if (show) this.expandedTitles.add(index); else this.expandedTitles.delete(index);
        this.state.manual = true;
        if (show && !this.rows.has(index)) {
          this.state.query = ''; this.search.value = ''; this.parents[index].forEach(parent => this.state.collapsed.delete(parent));
          this.limit = Math.max(this.limit, Math.ceil((index + 1) / 200) * 200); this.draw();
        }
        this.rows.get(index)?.row.classList.toggle('is-expanded', show);
        const refs = this.rows.get(index);
        refs?.title.focus({ preventScroll: true });
        if (show && refs && this.list.clientHeight && (refs.row.offsetTop < this.list.scrollTop
          || refs.row.offsetTop + refs.row.offsetHeight > this.list.scrollTop + this.list.clientHeight)) this.list.scrollTop = refs.row.offsetTop;
        this.updateSectionControls();
      }) },
    ];
  }
  sectionMenu(event, index, anchor) {
    const items = this.sectionActions(index);
    if (!items.length) return;
    this.dismissMenu();
    const data = this.data, keyboard = event.type === 'keydown' || (event.type === 'click' && event.detail === 0);
    let menu;
    menu = this.manager.menu(event, items, anchor, () => {
      this.menuCloseTimer = setTimeout(() => {
        if (this.actionMenu === menu) {
          this.actionMenu = null; this.panel.classList.remove('has-open-menu');
          if (keyboard && this.opened && this.data === data && !this.destroyed
            && (this.doc.activeElement === this.doc.body || this.doc.activeElement?.closest?.('.menu'))) {
            const target = anchor?.isConnected && !anchor.hidden && !anchor.parentElement?.hidden ? anchor : this.rows.get(index)?.title;
            target?.focus({ preventScroll: true });
          }
          this.scheduleCollapse();
        }
      }, 0);
    });
    this.actionMenu = menu; this.panel.classList.add('has-open-menu');
  }
  async locateEdge(end) {
    const data = this.data, action = this.headingAction = (this.headingAction || 0) + 1;
    const current = () => !this.destroyed && this.opened && this.data === data && action === this.headingAction;
    if (!current() || !await this.valid()) return;
    this.state.manual = true; this.adapter.pauseFollow(this.view);
    await this.adapter.locateEdge(this.view, data, end, () => !current());
    if (current() && !this.state.pinned) this.close();
  }
  async valid() {
    if (this.data && !this.invalid && this.file === this.view.file && this.adapter.valid(this.view, this.data)) return true;
    this.invalidate(); this.error(); return false;
  }
  async read(index, remaining) {
    const data = this.data, epoch = this.headingAction;
    if (this.sectionReadPending || this.adapter.busy() || !this.opened) return;
    this.sectionReadPending = true; this.updateSectionControls();
    try {
      if (!await this.valid() || this.destroyed || !this.opened || this.data !== data || this.headingAction !== epoch
        || this.file !== this.view.file || !data?.entries[index]) return;
      this.state.manual = false; await this.adapter.read(this.view, data, index, remaining);
    } finally { this.sectionReadPending = false; if (!this.destroyed) this.updateSectionControls(); }
  }
  update(force = false) {
    if (!this.data || this.invalid || this.destroyed || this.file !== this.view.file) return;
    if (!this.opened) {
      if (this.launcher.hidden || !this.railVisible) return;
      if (!force) {
        if (!this.railUpdateTimer) this.railUpdateTimer = setTimeout(() => {
          this.railUpdateTimer = null;
          try { this.update(true); } catch { if (!this.destroyed) { this.invalidate(); this.error(); } }
        }, 180);
        return;
      }
    }
    const { reading = -1, browsing = -1 } = this.adapter.positions(this.view, this.data);
    const busy = this.adapter.busy(), key = `${reading}/${browsing}/${busy}`;
    if (!force && key === this.positionKey) return;
    const changed = this.reading !== reading; this.reading = reading; this.browsing = browsing; this.positionKey = key;
    this.updateRailPositions();
    if (!this.opened) return;
    this.updateSectionControls();
    this.back.disabled = reading < 0;
    for (const [i, refs] of this.rows) {
      refs.row.classList.toggle('is-reading', i === reading); refs.row.classList.toggle('is-browsing', i === browsing);
      if (i === browsing) refs.title.setAttribute('aria-current', 'location'); else refs.title.removeAttribute('aria-current');
      refs.title.setAttribute('aria-label', (i === reading ? this.t('正在朗读；定位：', 'Speaking; go to: ') : this.t('定位：', 'Go to: ')) + this.titles[i]);
    }
    if ((changed || force) && reading >= 0 && !this.state.manual && !this.state.query) {
      if (reading >= this.limit) { this.limit = Math.ceil((reading + 1) / 200) * 200; this.draw(); return; }
      const ancestors = this.parents[reading] || [];
      if (ancestors.some(i => this.state.collapsed.has(i))) { ancestors.forEach(i => this.state.collapsed.delete(i)); this.draw(); return; }
      const row = this.rows.get(reading)?.row;
      if (row && (row.offsetTop < this.list.scrollTop || row.offsetTop + row.offsetHeight > this.list.scrollTop + this.list.clientHeight)) this.list.scrollTop = Math.max(0, row.offsetTop - this.list.clientHeight / 2);
    }
  }
  keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true); return; }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const entry = [...this.rows.entries()].find(([, refs]) => refs.row.contains(event.target));
      if (entry) { event.preventDefault(); event.stopPropagation(); this.selectSection(entry[0]); this.sectionMenu(event, entry[0], entry[1].title); }
      return;
    }
    if (event.target === this.search || event.target === this.depth || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.rows.values()].map(r => r.title), index = buttons.indexOf(this.doc.activeElement);
    if (!buttons.length) return;
    event.preventDefault(); event.stopPropagation(); this.state.manual = true;
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  }
  destroy() {
    this.destroyed = true; this.generation++;
    this.manager.playback.forget(this.pause);
    this.dismissMenu();
    for (const timer of [this.hoverTimer, this.scrollTimer, this.reloadTimer, this.layoutTimer, this.collapseTimer, this.focusTimer, this.railUpdateTimer]) clearTimeout(timer);
    this.doc.removeEventListener('pointerdown', this.outside, true); this.view.containerEl.removeEventListener('scroll', this.scroll, true);
    this.doc.removeEventListener('pointerover', this.pointerMode, true);
    this.doc.removeEventListener('keydown', this.keyboardMode, true);
    this.doc.defaultView?.removeEventListener('resize', this.resize); this.doc.defaultView?.visualViewport?.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect(); this.barObserver?.disconnect(); this.structureObserver?.disconnect();
    this.root.remove(); this.data = this.railData = null; this.railMarks = []; this.selectedSection = null; this.rows.clear();
  }
}

class MiniOutlineManager {
  constructor(plugin, adapter, { setIcon, Menu }) {
    this.plugin = plugin; this.adapter = adapter; this.setIcon = setIcon; this.Menu = Menu; this.panels = new Map(); this.states = new Map();
    this.playback = new (require('./playback-controls').PlaybackControls)(plugin, adapter, setIcon);
    this.layoutReady = false; this.startupEnabled = false; this.startupPending = false;
  }
  state(path) {
    const state = this.states.get(path) || { query: '', collapsed: new Set(), scroll: 0, depth: normalizeMiniSettings(this.plugin.settings).miniOutlineDepth, pinned: false, manual: false };
    this.states.delete(path); this.states.set(path, state); while (this.states.size > 40) this.states.delete(this.states.keys().next().value); return state;
  }
  menu(event, items, anchor, onHide) {
    const menu = new this.Menu();
    for (const item of items) menu.addItem(row => {
      row.setTitle(item.label).setIcon(item.icon || 'audio-lines').setDisabled(Boolean(item.disabled))
        .onClick(() => Promise.resolve(item.action()).catch(() => {}));
    });
    if (onHide) menu.onHide(onHide);
    if (anchor && event.detail === 0 && event.type !== 'contextmenu') {
      const rect = anchor.getBoundingClientRect(); menu.showAtPosition({ x: rect.left, y: rect.bottom });
    } else menu.showAtMouseEvent(event);
    return menu;
  }
  schedule() { if (this.destroyed || this.timer) return; this.timer = setTimeout(() => { this.timer = null; this.sync(); }, 150); }
  ready() { if (!this.destroyed) { this.layoutReady = true; this.schedule(); } }
  cancelStartup() { clearTimeout(this.startupTimer); this.startupTimer = null; this.startupPending = false; }
  startupView() {
    // Automatic opening never falls back to a reader's last document in a background pane.
    const workspace = this.plugin.app.workspace;
    const view = workspace ? workspace.activeLeaf?.view : this.adapter.activeView();
    return this.panels.has(view) && view.containerEl.isConnected ? view : null;
  }
  queueStartup() {
    if (this.destroyed || !this.layoutReady || !this.startupPending || this.startupTimer || !this.startupEnabled || this.adapter.busy()) return;
    const view = this.startupView();
    if (!view?.file) return;
    const file = view.file;
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.openStartup(view, file);
    }, 350);
  }
  async openStartup(view, file) {
    if (this.destroyed || !this.layoutReady || !this.startupPending || !normalizeMiniSettings(this.plugin.settings).miniOutlineStartup) return;
    if (this.startupView() !== view || view.file !== file || this.adapter.busy()) { this.queueStartup(); return; }
    const panel = this.panels.get(view);
    this.cancelStartup();
    try { await panel.open({ pin: true }); }
    catch { if (!panel.destroyed && panel.opened && view.file === file) panel.error(); }
  }
  sync() {
    if (this.destroyed) return;
    const previousPanel = this.currentPanel, previousFile = this.currentFile;
    const followPinned = previousPanel?.opened && previousPanel.state?.pinned;
    const startup = normalizeMiniSettings(this.plugin.settings).miniOutlineStartup;
    if (startup !== this.startupEnabled) {
      this.cancelStartup(); this.startupEnabled = startup; this.startupPending = startup;
    }
    const views = this.adapter.views().filter(view => view?.file && view.containerEl?.ownerDocument);
    for (const [view, panel] of this.panels) if (!views.includes(view) || !view.containerEl.isConnected) { panel.destroy(); this.panels.delete(view); }
    for (const view of views) {
      const previous = this.panels.get(view);
      if (previous && previous.language !== this.plugin.settings.settingsLanguage) { previous.destroy(); this.panels.delete(view); }
      if (!this.panels.has(view)) this.panels.set(view, new MiniOutlinePanel(this, view));
      const panel = this.panels.get(view); panel.configure();
      const sourceFile = panel.loading ? panel.loadingFile : panel.file;
      if (sourceFile && sourceFile !== view.file) {
        panel.close(false, false); panel.file = panel.loadingFile = null; panel.invalidate();
      }
    }
    // Carry an open pin to the active document only, never a remembered reading source.
    const view = this.startupView(), panel = this.panels.get(view);
    if (panel) {
      if (panel !== previousPanel || view.file !== previousFile) panel.collapsedAttempt = null;
      this.currentPanel = panel; this.currentFile = view.file;
      if (followPinned && (panel !== previousPanel || view.file !== previousFile)) {
        const file = view.file;
        void panel.open({ pin: true }).catch(() => {
          if (!panel.destroyed && panel.opened && view.file === file) panel.error();
        });
      }
      panel.ensureCollapsed();
    }
    this.playback.sync([...this.panels.keys()]); this.queueStartup();
  }
  toggle(view = this.adapter.activeView()) {
    this.sync(); const panel = this.panels.get(view);
    for (const other of this.panels.values()) if (other !== panel && !other.state?.pinned) other.close();
    if (panel) return panel.toggle();
  }
  invalidate(file) {
    for (const [view, panel] of this.panels) if (!file || view.file?.path === file.path) panel.invalidate();
    if (this.collapsedEntryRequested) this.schedule();
  }
  update() {
    this.playback.update();
    if (this.startupPending) this.queueStartup();
    for (const panel of this.panels.values()) { try { panel.update(); } catch { panel.invalidate(); panel.error(); } }
  }
  destroy() { this.destroyed = true; clearTimeout(this.timer); this.cancelStartup(); for (const panel of this.panels.values()) panel.destroy(); this.panels.clear(); this.states.clear(); this.currentPanel = this.currentFile = null; this.playback.destroy(); }
}
function registerMiniOutline(plugin, adapter) {
  const { setIcon, Menu } = require('obsidian');
  const manager = plugin.miniOutline = new MiniOutlineManager(plugin, adapter, { setIcon, Menu });
  plugin.register(() => manager.destroy());
  plugin.addCommand({ id: 'toggle-mini-outline', name: plugin.settings.settingsLanguage === 'chinese' ? '打开/关闭迷你目录' : 'Toggle mini outline', icon: 'list-tree', callback: () => manager.toggle() });
  for (const event of ['layout-change', 'active-leaf-change', 'file-open']) plugin.registerEvent(plugin.app.workspace.on(event, () => manager.schedule()));
  plugin.registerEvent(plugin.app.workspace.on('editor-change', (_editor, view) => manager.invalidate(view?.file)));
  if (plugin.app.metadataCache?.on) plugin.registerEvent(plugin.app.metadataCache.on('changed', file => manager.invalidate(file)));
  if (plugin.app.vault?.on) plugin.registerEvent(plugin.app.vault.on('modify', file => manager.invalidate(file)));
  plugin.app.workspace.onLayoutReady?.(() => manager.ready());
  return manager;
}
function addMiniOutlineSettings(plugin, container, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese', t = (cn, en) => zh ? cn : en;
  const options = (dropdown, entries) => { for (const [key, label] of Object.entries(entries)) dropdown.addOption(key, label); return dropdown; };
  const save = async (key, value) => { plugin.settings[key] = value; await plugin.saveSettings(); plugin.miniOutline?.sync(); };
  container.createEl('h3', { cls: 'cozy-reader-settings-heading', text: t('迷你目录', 'Mini outline') });
  new Setting(container).setName(t('启动时打开迷你目录', 'Open mini outline on startup'))
    .setDesc(t('默认关闭。工作区恢复后，为当前文档自动打开并固定目录，展开时不显示侧边入口。不启动朗读；手动收起后不再自动弹出，是否显示入口由下面的设置决定。', 'Off by default. After the workspace restores, open and pin the current document outline, hiding its edge entry while expanded. Does not start speech. After manual dismissal it stays collapsed; the setting below controls its entry.'))
    .addToggle(toggle => toggle.setValue(plugin.settings.miniOutlineStartup === true).onChange(value => save('miniOutlineStartup', value)));
  new Setting(container).setName(t('迷你目录按钮', 'Mini outline button'))
    .setDesc(t('在文档侧边显示目录按钮，点击打开迷你目录。自动模式下，启用 Floating TOC 等浮动目录插件时隐藏此按钮；仍可通过朗读工具栏或命令打开迷你目录，不影响其他插件。', 'Show a button at the document edge to open the mini outline. Auto hides it when Floating TOC or another supported floating outline is enabled. The reading toolbar and command can still open the mini outline; other plugins are unaffected.'))
    .addDropdown(d => {
      options(d, { auto: t('自动（推荐）', 'Auto (recommended)'), always: t('始终显示', 'Always show'), off: t('隐藏按钮', 'Hide button') })
        .setValue(normalizeMiniSettings(plugin.settings).miniOutlineMode).onChange(v => save('miniOutlineMode', v));
    });
  const widthSetting = new Setting(container).setName(t('目录宽度', 'Outline width'))
    .setDesc(t('180–600 像素，超出当前文档窗格时自动缩小。较窄时，顶部／底部按钮移至目录选项。恢复默认后，桌面使用 300 像素，触屏或窄窗口使用 340 像素。', '180–600 pixels, limited to the current document pane. In narrow outlines, top/bottom actions move into Outline options. Reset restores 300 pixels on desktop and 340 on touch screens or narrow windows.'));
  widthSetting.settingEl.addClass('cozy-mini-width-setting');
  let widthSlider;
  const defaultWidth = () => container.ownerDocument?.defaultView?.matchMedia?.('(pointer: coarse), (max-width: 600px)')?.matches ? 340 : 300;
  widthSetting.addSlider(slider => {
    widthSlider = slider;
    slider.setLimits(180, 600, 10).setValue(normalizeMiniSettings(plugin.settings).miniOutlineWidth || defaultWidth()).setDynamicTooltip()
      .onChange(value => changeWidth(value));
  });
  const widthLabel = widthSetting.controlEl.createEl('span', { cls: 'cozy-mini-width-value' });
  const updateWidthLabel = width => { widthLabel.textContent = width ? `${width} px` : t('默认', 'Default'); };
  const changeWidth = async value => {
    const width = normalizeMiniSettings({ miniOutlineWidth: value }).miniOutlineWidth;
    updateWidthLabel(width); widthSlider.setValue(width || defaultWidth());
    plugin.settings.miniOutlineWidth = width; plugin.miniOutline?.sync();
    await plugin.saveSettings();
  };
  updateWidthLabel(normalizeMiniSettings(plugin.settings).miniOutlineWidth);
  widthSetting.addExtraButton(button => button.setIcon('rotate-ccw').setTooltip(t('恢复默认宽度', 'Reset outline width')).onClick(() => changeWidth(0)));
  new Setting(container).setName(t('标题显示行数', 'Heading display lines'))
    .setDesc(t('超出的文字省略；可右键标题，或在顶部目录选项中展开该节的完整标题。', 'Longer titles are truncated; right-click a heading or use Outline options to reveal its full title.'))
    .addDropdown(d => options(d, { 1: t('一行（紧凑）', 'One line (compact)'), 2: t('两行（默认）', 'Two lines (default)'), 3: t('三行', 'Three lines'), 4: t('四行', 'Four lines') })
      .setValue(String(normalizeMiniSettings(plugin.settings).miniOutlineTitleLines)).onChange(v => save('miniOutlineTitleLines', Number(v))));
  const advanced = container.createEl('details', { cls: 'cozy-mini-settings-advanced' });
  advanced.createEl('summary', { text: t('更多目录选项', 'More outline options') });
  new Setting(advanced).setName(t('收起样式', 'Collapsed appearance'))
    .setDesc(t('自动：鼠标操作显示章节短线，触屏显示目录图标。短线按章节顺序排列，并非页码或进度百分比；章节较多时显示概要。首次尚无目录数据时使用图标，不额外解析 PDF。', 'Auto uses chapter lines for a mouse and an outline icon for touch. Lines show chapter order, not page numbers or progress percentages; dense outlines are summarized. An icon is used until headings are loaded, without extra PDF parsing.'))
    .addDropdown(d => options(d, { auto: t('自动（推荐）', 'Auto (recommended)'), rail: t('章节短线', 'Chapter lines'), icon: t('目录图标', 'Outline icon') })
      .setValue(normalizeMiniSettings(plugin.settings).miniOutlineCollapsedStyle).onChange(v => save('miniOutlineCollapsedStyle', v)));
  new Setting(advanced).setName(t('播放按钮显示方式', 'Playback button visibility'))
    .setDesc(t('默认随顶栏自动隐藏：鼠标进入目录或使用键盘操作时显示，移出后仅保留固定提示。也可选择有朗读会话时常显。触屏始终可见；不影响播放或独立悬浮按钮。', 'By default, follow the header: show on hover or keyboard interaction, leaving only the pinned indicator otherwise. Alternatively, keep the button visible during a reading session. Always visible on touch screens; does not affect playback or the separate floating button.'))
    .addDropdown(d => options(d, { toolbar: t('随顶栏自动隐藏（默认）', 'Follow header (default)'), session: t('朗读时常显', 'Visible during reading') })
      .setValue(normalizeMiniSettings(plugin.settings).miniOutlinePlaybackDisplay).onChange(v => save('miniOutlinePlaybackDisplay', v)));
  new Setting(advanced).setName(t('目录位置', 'Outline side')).addDropdown(d => options(d, { left: t('左侧', 'Left'), right: t('右侧', 'Right') })
    .setValue(normalizeMiniSettings(plugin.settings).miniOutlineSide).onChange(v => save('miniOutlineSide', v)));
  new Setting(advanced).setName(t('默认展开层级', 'Default expanded levels')).addDropdown(d => options(d, { 1: '1', 2: '2', 3: '3', 6: t('全部', 'All') })
    .setValue(String(normalizeMiniSettings(plugin.settings).miniOutlineDepth)).onChange(v => save('miniOutlineDepth', Number(v))));
  new Setting(advanced).setName(t('透明背景', 'Transparent background'))
    .setDesc(t('适合桌面端文档留白较宽时使用。操作目录时增强底色；手机和平板仍保留实色背景，不降低文字和图标的清晰度。', 'For wider document margins on desktop. The background becomes more opaque while interacting. Phones and tablets retain a solid background; text and icons stay fully opaque.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineTransparent === true).onChange(v => save('miniOutlineTransparent', v)));
  new Setting(advanced).setName(t('双击标题开始朗读', 'Double-click heading to read'))
    .setDesc(t('默认关闭，仅鼠标操作生效。开启后，单击目录标题只定位并保留目录，双击从该节继续朗读；点击目录外可收起未固定的目录。触屏请使用顶部目录选项中的章节操作。', 'Off by default; mouse only. When enabled, a single click navigates and keeps the outline open; a double-click starts reading from that section onward. Click outside to dismiss an unpinned outline. On touch screens use the section actions in Outline options.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineDoubleClick === true).onChange(v => save('miniOutlineDoubleClick', v)));
  new Setting(advanced).setName(t('鼠标悬停展开目录图标', 'Open outline icon on hover')).setDesc(t('图标入口默认仅点击展开；开启后也可悬停展开。章节短线始终支持鼠标停留后展开。取消固定后，鼠标移出目录会自动收起；触屏始终通过点击操作。', 'The icon opens by click unless enabled here. Chapter lines always expand after a short mouse hover. Unpinned outlines collapse after the pointer leaves; touch devices always use tap.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineHover === true).onChange(v => save('miniOutlineHover', v)));
}
module.exports = { MINI_DEFAULTS, normalizeMiniSettings, otherOutlineEnabled, headingParents, headingAt, railHeadings, MiniOutlinePanel, MiniOutlineManager, registerMiniOutline, addMiniOutlineSettings };
