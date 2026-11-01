'use strict';

// UI preferences only. Document text, paths and heading titles stay in memory.
const MINI_DEFAULTS = Object.freeze({ miniOutlineMode: 'auto', miniOutlineSide: 'right', miniOutlineHover: false, miniOutlineDepth: 2, miniOutlineTransparent: false, miniOutlineDoubleClick: false, miniOutlineWidth: 0, miniOutlineTitleLines: 2, miniOutlineStartup: false });
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
    miniOutlineStartup: settings.miniOutlineStartup === true };
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

class MiniOutlinePanel {
  constructor(manager, view) {
    this.manager = manager; this.plugin = manager.plugin; this.adapter = manager.adapter; this.view = view;
    this.doc = view.containerEl.ownerDocument; this.language = this.plugin.settings.settingsLanguage; this.generation = 0; this.rows = new Map();
    this.root = this.el(view.containerEl, 'div', 'cozy-mini-toc');
    this.launcher = this.button(this.root, 'list-tree', this.t('打开迷你目录', 'Open mini outline'), () => this.toggle());
    this.launcher.classList.add('cozy-mini-launcher'); this.launcher.setAttribute('aria-expanded', 'false');
    this.panel = this.el(this.root, 'section', 'cozy-mini-panel'); this.panel.hidden = true;
    this.panel.setAttribute('aria-label', this.t('迷你目录', 'Mini outline'));
    const header = this.el(this.panel, 'div', 'cozy-mini-header');
    header.setAttribute('role', 'toolbar'); header.setAttribute('aria-label', this.t('目录操作', 'Outline controls'));
    this.pin = this.button(header, 'pin', this.t('固定目录', 'Pin outline'), () => {
      if (this.state) {
        this.state.pinned = !this.state.pinned; this.updatePin();
        if (!this.state.pinned) this.close(true);
      }
    });
    this.searchToggle = this.button(header, 'search', this.t('搜索章节', 'Search headings'), () => this.toggleSearch());
    this.searchToggle.setAttribute('aria-expanded', 'false');
    this.back = this.button(header, 'corner-up-left', this.t('回到朗读位置', 'Return to reading'), async () => {
      if (!await this.valid()) return;
      this.state.manual = false; await this.adapter.returnReading(this.view, this.data); this.update(true);
    });
    this.edgeButtons = [];
    const addEdges = (parent, cls) => {
      for (const [end, icon, label] of [[false, 'arrow-up-to-line', this.t('到文档顶部', 'Go to document top')], [true, 'arrow-down-to-line', this.t('到文档底部', 'Go to document bottom')]]) {
        const button = this.button(parent, icon, label, () => this.locateEdge(end));
        button.classList.add(cls); this.edgeButtons.push(button);
      }
    };
    addEdges(header, 'cozy-mini-edge-primary');
    this.optionsToggle = this.button(header, 'ellipsis', this.t('目录选项', 'Outline options'), () => {
      this.tools.hidden = !this.tools.hidden; this.optionsToggle.setAttribute('aria-expanded', String(!this.tools.hidden));
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
    addEdges(tools, 'cozy-mini-edge-secondary');
    this.optionsClose = this.button(tools, 'x', this.t('关闭目录', 'Close outline'), () => this.close(true));
    this.optionsClose.classList.add('cozy-mini-close-secondary');
    this.status = this.el(this.panel, 'div', 'cozy-mini-status'); this.status.setAttribute('role', 'status');
    this.list = this.el(this.panel, 'div', 'cozy-mini-list'); this.list.setAttribute('role', 'group');
    this.list.setAttribute('aria-label', this.t('章节', 'Sections'));
    this.more = this.button(this.panel, 'chevrons-down', this.t('显示更多章节', 'Show more headings'), () => { this.limit += 200; this.draw(); });
    this.more.hidden = true;
    this.list.addEventListener('scroll', () => { if (this.state) this.state.scroll = this.list.scrollTop; });
    for (const name of ['wheel', 'touchstart', 'pointerdown']) this.list.addEventListener(name, () => { if (this.state) this.state.manual = true; }, { passive: true });
    this.touchControls = false;
    this.pointerMode = event => {
      if (!['mouse', 'touch', 'pen'].includes(event.pointerType)) return;
      const touch = event.pointerType !== 'mouse';
      if (touch === this.touchControls) return;
      this.touchControls = touch; this.panel.classList.toggle('is-touch-controls', touch);
    };
    this.outside = event => {
      this.pointerMode(event);
      if (this.actionMenu && event.target?.closest?.('.menu')) return;
      if (this.opened && !this.state?.pinned && !this.root.contains(event.target) && !event.target?.closest?.('[data-cozy-mini-toggle]')) this.close();
    };
    this.doc.addEventListener('pointerdown', this.outside, true);
    // Track input changes, not pointer coordinates or every movement. Hybrids may report both capabilities.
    this.doc.addEventListener('pointerover', this.pointerMode, { capture: true, passive: true });
    this.panel.addEventListener('keydown', event => this.keydown(event));
    this.launcher.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && this.settings().miniOutlineHover) this.hoverTimer = setTimeout(() => this.open(), 350);
    });
    this.root.addEventListener('pointerleave', () => { clearTimeout(this.hoverTimer); });
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
    this.pin.setAttribute('aria-label', this.state.pinned ? this.t('取消固定并收起目录', 'Unpin and close outline') : this.t('固定目录', 'Pin outline'));
  }
  mouseDoubleClick(pointerType) {
    return this.settings().miniOutlineDoubleClick && pointerType === 'mouse' && !this.doc.body.classList.contains('is-mobile')
      && this.doc.defaultView.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
  }
  configure() {
    const settings = this.settings(); this.root.dataset.side = settings.miniOutlineSide;
    this.root.dataset.background = settings.miniOutlineTransparent ? 'transparent' : 'solid';
    this.root.style.setProperty('--cozy-mini-title-lines', String(settings.miniOutlineTitleLines));
    if (settings.miniOutlineWidth) this.root.style.setProperty('--cozy-mini-width', `${settings.miniOutlineWidth}px`);
    else this.root.style.removeProperty('--cozy-mini-width');
    this.launcher.hidden = settings.miniOutlineStartup || settings.miniOutlineMode === 'off' || (settings.miniOutlineMode === 'auto' && otherOutlineEnabled(this.plugin.app));
    const headers = [...this.view.containerEl.querySelectorAll(PANE_BARS), ...[...this.doc.querySelectorAll(FLOATING_BARS)]
      .filter(el => !this.view.containerEl.contains(el) && !el.closest('.workspace-leaf-content'))];
    if (headers.length !== this.observedHeaders?.length || headers.some((el, i) => el !== this.observedHeaders?.[i])) {
      this.resizeObserver?.disconnect(); this.resizeObserver?.observe(this.view.containerEl); this.barObserver?.disconnect();
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
  }
  toggle() { if (this.opened) this.close(true); else return this.open(); }
  async open({ pin = false } = {}) {
    if (this.destroyed || !this.view.file) return;
    this.manager.cancelStartup();
    if (pin) { this.state = this.manager.state(this.view.file.path); this.state.pinned = true; this.updatePin(); }
    this.opened = true; this.panel.hidden = false; this.launcher.setAttribute('aria-expanded', 'true');
    this.layout();
    if (this.loading && this.loadingFile === this.view.file) return;
    if (!this.data || this.file !== this.view.file || this.invalid || !this.adapter.valid(this.view, this.data)) await this.load();
    else this.update();
  }
  close(focus = false, cancelStartup = true) {
    if (this.opened && cancelStartup) this.manager.cancelStartup();
    this.headingAction = (this.headingAction || 0) + 1;
    clearTimeout(this.hoverTimer); clearTimeout(this.reloadTimer);
    this.dismissMenu();
    this.opened = false; this.panel.hidden = true; this.launcher.setAttribute('aria-expanded', 'false');
    this.tools.hidden = true; this.optionsToggle.setAttribute('aria-expanded', 'false');
    if (this.loading) { this.generation++; this.loading = false; this.invalid = true; }
    this.layout();
    if (focus && !this.launcher.hidden) this.launcher.focus({ preventScroll: true });
  }
  layout() {
    if (this.destroyed) return;
    const host = this.view.containerEl.getBoundingClientRect(), win = this.doc.defaultView;
    const viewport = win.visualViewport, bottom = Math.min(host.bottom, (viewport?.offsetTop || 0) + (viewport?.height || win.innerHeight));
    let top = Math.max(host.top + 44, (viewport?.offsetTop || 0) + 12);
    const entryHeight = this.launcher.hidden ? 0 : this.launcher.getBoundingClientRect().height;
    const width = this.opened ? this.panel.getBoundingClientRect().width : (this.launcher.getBoundingClientRect().width || 32);
    if (this.opened) this.panel.classList.toggle('is-compact', width < 240);
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
  }
  async load(force = false) {
    this.dismissMenu();
    const generation = ++this.generation, file = this.view.file;
    const cancelled = () => this.destroyed || !this.opened || generation !== this.generation || file !== this.view.file;
    this.loading = true; this.loadingFile = file; this.invalid = false; this.data = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true;
    this.setLoading(true);
    this.status.textContent = this.t('正在读取目录…', 'Loading outline…');
    try {
      const data = await this.adapter.load(this.view, cancelled, force);
      if (cancelled()) return;
      if (!data) { this.invalid = true; this.error(); return; }
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
    } catch { if (!cancelled()) { this.invalid = true; this.error(); } }
    finally { if (generation === this.generation) this.loading = false; }
  }
  setLoading(loading) {
    this.pin.disabled = this.searchToggle.disabled = this.search.disabled = this.depth.disabled = loading;
    this.edgeButtons.forEach(button => { button.disabled = loading; });
    if (loading) this.back.disabled = true;
  }
  applyDepth() { this.state.collapsed = new Set(this.data.entries.map((_, i) => i).filter(i => this.parents[i].length >= this.state.depth - 1)); }
  invalidate() {
    this.dismissMenu();
    this.invalid = true; this.generation++; this.loading = false; this.data = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true; this.setLoading(true);
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
      title.addEventListener('pointerdown', event => { pointerType = event.pointerType || 'mouse'; });
      title.addEventListener('dblclick', event => {
        if (!current() || startingRead || !this.mouseDoubleClick(event.pointerType || pointerType)) return;
        event.preventDefault(); event.stopPropagation(); startingRead = true;
        const action = this.headingAction;
        Promise.resolve(navigation).then(async () => {
          if (current() && action === this.headingAction && this.mouseDoubleClick(event.pointerType || pointerType)) await this.read(index, true);
        }).catch(() => this.error()).finally(() => { startingRead = false; });
      });
      const more = this.button(row, 'ellipsis', this.t('章节操作', 'Section actions'), event => {
        this.sectionMenu(event, index, more);
      });
      more.classList.add('cozy-mini-action'); more.setAttribute('aria-haspopup', 'menu');
      row.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); this.sectionMenu(event, index, more); });
      this.rows.set(index, { row, title, more });
    }
    if (query && !indices.length) this.el(this.list, 'p').textContent = this.t('没有匹配的章节', 'No matching headings');
    this.more.hidden = indices.length <= this.limit; this.list.scrollTop = top;
    this.positionKey = null; this.update();
  }
  dismissMenu() {
    const menu = this.actionMenu; this.actionMenu = null; menu?.hide(); clearTimeout(this.menuCloseTimer);
    this.panel.classList.remove('has-open-menu');
  }
  sectionMenu(event, index, anchor) {
    if (!this.data || this.invalid) return;
    this.dismissMenu();
    const data = this.data, expanded = this.expandedTitles.has(index);
    const scoped = action => async () => {
      if (this.destroyed || this.data !== data || !await this.valid()) return;
      try { await action(); } catch { this.error(); }
    };
    let menu;
    menu = this.manager.menu(event, [
      { label: this.t('从本节朗读', 'Read from this section'), icon: 'play', disabled: this.adapter.busy(), action: scoped(() => this.read(index, true)) },
      { label: this.t('只朗读本节', 'Read this section only'), icon: 'audio-lines', disabled: this.adapter.busy(), action: scoped(() => this.read(index, false)) },
      { label: expanded ? this.t('收起标题', 'Collapse heading') : this.t('展开完整标题', 'Show full heading'), icon: 'wrap-text', action: scoped(async () => {
        if (expanded) this.expandedTitles.delete(index); else this.expandedTitles.add(index);
        this.rows.get(index)?.row.classList.toggle('is-expanded', !expanded);
        if (!this.opened) await this.open();
        this.rows.get(index)?.more.focus({ preventScroll: true });
      }) },
    ], anchor, () => {
      this.menuCloseTimer = setTimeout(() => {
        if (this.actionMenu === menu) { this.actionMenu = null; this.panel.classList.remove('has-open-menu'); }
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
    if (this.adapter.busy() || !await this.valid()) return;
    this.state.manual = false; await this.adapter.read(this.view, this.data, index, remaining);
  }
  update(force = false) {
    if (!this.opened || !this.data || this.invalid || this.destroyed) return;
    const { reading = -1, browsing = -1 } = this.adapter.positions(this.view, this.data);
    const busy = this.adapter.busy(), key = `${reading}/${browsing}/${busy}`;
    if (!force && key === this.positionKey) return;
    const changed = this.reading !== reading; this.reading = reading; this.positionKey = key;
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
    if (event.target === this.search || event.target === this.depth || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.rows.values()].map(r => r.title), index = buttons.indexOf(this.doc.activeElement);
    if (!buttons.length) return;
    event.preventDefault(); event.stopPropagation(); this.state.manual = true;
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  }
  destroy() {
    this.destroyed = true; this.generation++;
    this.dismissMenu();
    for (const timer of [this.hoverTimer, this.scrollTimer, this.reloadTimer, this.layoutTimer]) clearTimeout(timer);
    this.doc.removeEventListener('pointerdown', this.outside, true); this.view.containerEl.removeEventListener('scroll', this.scroll, true);
    this.doc.removeEventListener('pointerover', this.pointerMode, true);
    this.doc.defaultView?.removeEventListener('resize', this.resize); this.doc.defaultView?.visualViewport?.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect(); this.barObserver?.disconnect(); this.structureObserver?.disconnect();
    this.root.remove(); this.data = null; this.rows.clear();
  }
}

class MiniOutlineManager {
  constructor(plugin, adapter, { setIcon, Menu }) {
    this.plugin = plugin; this.adapter = adapter; this.setIcon = setIcon; this.Menu = Menu; this.panels = new Map(); this.states = new Map();
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
      if (sourceFile && sourceFile !== view.file) { panel.close(false, false); panel.invalidate(); }
    }
    this.queueStartup();
  }
  toggle(view = this.adapter.activeView()) {
    this.sync(); const panel = this.panels.get(view);
    for (const other of this.panels.values()) if (other !== panel && !other.state?.pinned) other.close();
    if (panel) return panel.toggle();
  }
  invalidate(file) { for (const [view, panel] of this.panels) if (!file || view.file?.path === file.path) panel.invalidate(); }
  update() {
    if (this.startupPending) this.queueStartup();
    for (const panel of this.panels.values()) { try { panel.update(); } catch { panel.invalidate(); panel.error(); } }
  }
  destroy() { this.destroyed = true; clearTimeout(this.timer); this.cancelStartup(); for (const panel of this.panels.values()) panel.destroy(); this.panels.clear(); this.states.clear(); }
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
  let buttonSetting, buttonDropdown;
  const updateButtonSetting = () => {
    const startup = plugin.settings.miniOutlineStartup === true;
    buttonSetting.settingEl.hidden = startup; buttonDropdown.setDisabled(startup);
  };
  new Setting(container).setName(t('启动时打开迷你目录', 'Open mini outline on startup'))
    .setDesc(t('默认关闭。工作区恢复后，为当前文档自动打开并固定目录，同时隐藏侧边目录按钮。不启动朗读；手动收起后本次不再自动弹出。', 'Off by default. After the workspace restores, open and pin the current document outline and hide its edge button. Does not start speech. Dismissing it prevents further automatic opening during this session.'))
    .addToggle(toggle => toggle.setValue(plugin.settings.miniOutlineStartup === true).onChange(async value => {
      plugin.settings.miniOutlineStartup = value; updateButtonSetting(); await save('miniOutlineStartup', value);
    }));
  buttonSetting = new Setting(container).setName(t('迷你目录按钮', 'Mini outline button'))
    .setDesc(t('在文档侧边显示目录按钮，点击打开迷你目录。自动模式下，启用 Floating TOC 等浮动目录插件时隐藏此按钮；仍可通过朗读工具栏或命令打开迷你目录，不影响其他插件。', 'Show a button at the document edge to open the mini outline. Auto hides it when Floating TOC or another supported floating outline is enabled. The reading toolbar and command can still open the mini outline; other plugins are unaffected.'))
    .addDropdown(d => {
      buttonDropdown = d;
      options(d, { auto: t('自动（推荐）', 'Auto (recommended)'), always: t('始终显示', 'Always show'), off: t('隐藏按钮', 'Hide button') })
        .setValue(normalizeMiniSettings(plugin.settings).miniOutlineMode).onChange(v => save('miniOutlineMode', v));
    });
  buttonSetting.settingEl.addClass('cozy-reader-conditional'); updateButtonSetting();
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
    .setDesc(t('超出的文字省略；仍可在章节菜单中展开完整标题。', 'Longer titles are truncated; the section menu can still reveal the full heading.'))
    .addDropdown(d => options(d, { 1: t('一行（紧凑）', 'One line (compact)'), 2: t('两行（默认）', 'Two lines (default)'), 3: t('三行', 'Three lines'), 4: t('四行', 'Four lines') })
      .setValue(String(normalizeMiniSettings(plugin.settings).miniOutlineTitleLines)).onChange(v => save('miniOutlineTitleLines', Number(v))));
  const advanced = container.createEl('details', { cls: 'cozy-mini-settings-advanced' });
  advanced.createEl('summary', { text: t('更多目录选项', 'More outline options') });
  new Setting(advanced).setName(t('目录位置', 'Outline side')).addDropdown(d => options(d, { left: t('左侧', 'Left'), right: t('右侧', 'Right') })
    .setValue(normalizeMiniSettings(plugin.settings).miniOutlineSide).onChange(v => save('miniOutlineSide', v)));
  new Setting(advanced).setName(t('默认展开层级', 'Default expanded levels')).addDropdown(d => options(d, { 1: '1', 2: '2', 3: '3', 6: t('全部', 'All') })
    .setValue(String(normalizeMiniSettings(plugin.settings).miniOutlineDepth)).onChange(v => save('miniOutlineDepth', Number(v))));
  new Setting(advanced).setName(t('透明背景', 'Transparent background'))
    .setDesc(t('适合桌面端文档留白较宽时使用。操作目录时增强底色；手机和平板仍保留实色背景，不降低文字和图标的清晰度。', 'For wider document margins on desktop. The background becomes more opaque while interacting. Phones and tablets retain a solid background; text and icons stay fully opaque.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineTransparent === true).onChange(v => save('miniOutlineTransparent', v)));
  new Setting(advanced).setName(t('双击标题开始朗读', 'Double-click heading to read'))
    .setDesc(t('默认关闭，仅鼠标操作生效。开启后，单击目录标题只定位并保留目录，双击从该节继续朗读；点击目录外可收起未固定的目录。触屏请使用章节菜单。', 'Off by default; mouse only. When enabled, a single click navigates and keeps the outline open; a double-click starts reading from that section onward. Click outside to dismiss an unpinned outline. Use the section menu on touch screens.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineDoubleClick === true).onChange(v => save('miniOutlineDoubleClick', v)));
  new Setting(advanced).setName(t('鼠标悬停展开目录', 'Open outline on hover')).setDesc(t('默认关闭；触屏始终通过点击展开。', 'Off by default; touch devices always use tap.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineHover === true).onChange(v => save('miniOutlineHover', v)));
}
module.exports = { MINI_DEFAULTS, normalizeMiniSettings, otherOutlineEnabled, headingParents, headingAt, MiniOutlinePanel, MiniOutlineManager, registerMiniOutline, addMiniOutlineSettings };
