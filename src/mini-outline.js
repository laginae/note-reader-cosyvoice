'use strict';

// UI preferences only. Document text, paths and heading titles stay in memory.
const MINI_DEFAULTS = Object.freeze({ miniOutlineMode: 'auto', miniOutlineSide: 'right', miniOutlineHover: false, miniOutlineDepth: 2 });
const OTHER_OUTLINES = ['floating-toc', 'dynamic-outline', 'subtle-toc', 'heading-scroller', 'slick-outline', 'hovered-table-of-content', 'ink-floating-toc', 'gogoga-outline'];
function normalizeMiniSettings(settings = {}) {
  return { miniOutlineMode: ['auto', 'always', 'off'].includes(settings.miniOutlineMode) ? settings.miniOutlineMode : 'auto',
    miniOutlineSide: settings.miniOutlineSide === 'left' ? 'left' : 'right', miniOutlineHover: settings.miniOutlineHover === true,
    miniOutlineDepth: [1, 2, 3, 6].includes(Number(settings.miniOutlineDepth)) ? Number(settings.miniOutlineDepth) : 2 };
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
    this.el(header, 'strong').textContent = this.t('文档目录', 'Document outline');
    this.pin = this.button(header, 'pin', this.t('固定目录', 'Pin outline'), () => {
      if (this.state) { this.state.pinned = !this.state.pinned; this.pin.setAttribute('aria-pressed', String(this.state.pinned)); }
    });
    this.back = this.button(header, 'locate-fixed', this.t('回到朗读位置', 'Return to reading'), async () => {
      if (!await this.valid()) return;
      this.state.manual = false; await this.adapter.returnReading(this.view, this.data); this.update(true);
    });
    this.button(header, 'x', this.t('关闭目录', 'Close outline'), () => this.close(true));
    this.search = this.el(this.panel, 'input', 'cozy-mini-search'); this.search.type = 'search';
    this.search.placeholder = this.t('搜索章节', 'Search headings'); this.search.setAttribute('aria-label', this.search.placeholder);
    this.search.addEventListener('input', () => { if (this.data) { this.state.query = this.search.value; this.limit = 200; this.draw(); } });
    const tools = this.el(this.panel, 'div', 'cozy-mini-tools');
    this.depth = this.el(tools, 'select'); this.depth.setAttribute('aria-label', this.t('展开层级', 'Expanded levels'));
    for (const [value, label] of [[1, this.t('一级', 'One level')], [2, this.t('两级', 'Two levels')], [3, this.t('三级', 'Three levels')], [6, this.t('全部', 'All levels')]]) {
      const option = this.el(this.depth, 'option'); option.value = String(value); option.textContent = label;
    }
    this.depth.addEventListener('change', () => { if (this.data) { this.state.depth = Number(this.depth.value); this.applyDepth(); this.draw(); } });
    this.button(tools, 'refresh-cw', this.t('刷新目录', 'Refresh outline'), () => this.load(true));
    this.status = this.el(this.panel, 'div', 'cozy-mini-status'); this.status.setAttribute('role', 'status');
    this.list = this.el(this.panel, 'div', 'cozy-mini-list'); this.list.setAttribute('role', 'group');
    this.list.setAttribute('aria-label', this.t('章节', 'Sections'));
    this.more = this.button(this.panel, 'chevrons-down', this.t('显示更多章节', 'Show more headings'), () => { this.limit += 200; this.draw(); });
    this.more.hidden = true;
    this.list.addEventListener('scroll', () => { if (this.state) this.state.scroll = this.list.scrollTop; });
    for (const name of ['wheel', 'touchstart', 'pointerdown']) this.list.addEventListener(name, () => { if (this.state) this.state.manual = true; }, { passive: true });
    this.outside = event => { if (this.opened && !this.state?.pinned && !this.root.contains(event.target) && !event.target?.closest?.('[data-cozy-mini-toggle]')) this.close(); };
    this.doc.addEventListener('pointerdown', this.outside, true);
    this.panel.addEventListener('keydown', event => this.keydown(event));
    this.launcher.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && this.settings().miniOutlineHover) this.hoverTimer = setTimeout(() => this.open(), 350);
    });
    this.root.addEventListener('pointerleave', () => { clearTimeout(this.hoverTimer); });
    this.scroll = event => {
      if (this.root.contains(event.target) || !this.opened || this.scrollTimer) return;
      this.scrollTimer = setTimeout(() => { this.scrollTimer = null; this.update(); }, 100);
    };
    this.view.containerEl.addEventListener('scroll', this.scroll, true);
    this.resize = () => this.layout();
    this.doc.defaultView?.addEventListener('resize', this.resize);
    this.doc.defaultView?.visualViewport?.addEventListener('resize', this.resize);
    const Observer = this.doc.defaultView?.ResizeObserver;
    if (Observer) { this.resizeObserver = new Observer(this.resize); this.resizeObserver.observe(view.containerEl); }
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
  configure() {
    const settings = this.settings(); this.root.dataset.side = settings.miniOutlineSide;
    this.launcher.hidden = settings.miniOutlineMode === 'off' || (settings.miniOutlineMode === 'auto' && otherOutlineEnabled(this.plugin.app));
    const headers = [...this.view.containerEl.querySelectorAll('.note-reader-native-toolbar,.note-reader-mobile-dock,.view-header')];
    if (this.resizeObserver && (headers.length !== this.observedHeaders?.length || headers.some((el, i) => el !== this.observedHeaders?.[i]))) {
      this.resizeObserver.disconnect(); this.resizeObserver.observe(this.view.containerEl);
      headers.forEach(el => this.resizeObserver.observe(el)); this.observedHeaders = headers;
    }
    this.layout();
  }
  toggle() { if (this.opened) this.close(true); else return this.open(); }
  async open() {
    if (this.destroyed) return;
    this.opened = true; this.panel.hidden = false; this.launcher.setAttribute('aria-expanded', 'true');
    this.layout();
    if (!this.data || this.file !== this.view.file || this.invalid || !this.adapter.valid(this.view, this.data)) await this.load();
    else this.update();
  }
  close(focus = false) {
    clearTimeout(this.hoverTimer); clearTimeout(this.reloadTimer);
    this.opened = false; this.panel.hidden = true; this.launcher.setAttribute('aria-expanded', 'false');
    if (this.loading) { this.generation++; this.loading = false; this.invalid = true; }
    if (focus && !this.launcher.hidden) this.launcher.focus({ preventScroll: true });
  }
  layout() {
    const host = this.view.containerEl.getBoundingClientRect(), win = this.doc.defaultView;
    const viewport = win.visualViewport, bottom = Math.min(host.bottom, (viewport?.offsetTop || 0) + (viewport?.height || win.innerHeight));
    let top = Math.max(host.top + 44, (viewport?.offsetTop || 0) + 12);
    for (const el of this.view.containerEl.querySelectorAll('.note-reader-native-toolbar,.note-reader-mobile-dock,.view-header')) {
      const rect = el.getBoundingClientRect(); if (rect.height && rect.top < top + 100) top = Math.max(top, rect.bottom + 8);
    }
    this.root.style.setProperty('--cozy-mini-top', `${Math.max(8, top - host.top)}px`);
    const entryHeight = this.launcher.hidden ? 0 : this.launcher.getBoundingClientRect().height;
    this.root.style.setProperty('--cozy-mini-height', `${Math.max(80, bottom - top - entryHeight - 100)}px`);
  }
  async load(force = false) {
    const generation = ++this.generation, file = this.view.file;
    const cancelled = () => this.destroyed || !this.opened || generation !== this.generation || file !== this.view.file;
    this.loading = true; this.invalid = false; this.data = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true;
    this.setLoading(true);
    this.status.textContent = this.t('正在读取目录…', 'Loading outline…');
    try {
      const data = await this.adapter.load(this.view, cancelled, force);
      if (cancelled()) return;
      if (!data) { this.invalid = true; this.error(); return; }
      this.data = data; this.file = file; this.limit = 200;
      this.parents = headingParents(data.entries);
      this.state = this.manager.state(file.path);
      // Keep state for unchanged heading structure; never persist heading text.
      const shape = JSON.stringify(data.entries.map(e => [e.title, e.level]));
      if (this.state.shape !== shape) { this.state.shape = shape; this.applyDepth(); }
      this.search.value = this.state.query; this.depth.value = String(this.state.depth);
      this.pin.setAttribute('aria-pressed', String(this.state.pinned));
      this.setLoading(false);
      this.status.textContent = data.entries.length ? (data.entries.some(e => e.inferred || e.approximate)
        ? this.t('包含自动识别或按页定位的章节', 'Includes detected or page-level headings') : '')
        : this.t('未找到可用章节', 'No headings available');
      this.draw();
    } catch { if (!cancelled()) { this.invalid = true; this.error(); } }
    finally { if (generation === this.generation) this.loading = false; }
  }
  setLoading(loading) { this.pin.disabled = this.search.disabled = this.depth.disabled = loading; if (loading) this.back.disabled = true; }
  applyDepth() { this.state.collapsed = new Set(this.data.entries.map((_, i) => i).filter(i => this.parents[i].length >= this.state.depth - 1)); }
  invalidate() {
    this.invalid = true; this.generation++; this.loading = false; this.data = null; this.rows.clear(); this.list.replaceChildren(); this.more.hidden = true; this.setLoading(true);
    if (this.opened) { clearTimeout(this.reloadTimer); this.reloadTimer = setTimeout(() => this.load(), 180); }
  }
  draw() {
    if (!this.data) return;
    const query = this.state.query.trim().toLocaleLowerCase(), visible = new Set(), top = this.state.scroll;
    if (query) this.data.entries.forEach((entry, i) => { if (entry.title.toLocaleLowerCase().includes(query)) { visible.add(i); this.parents[i].forEach(p => visible.add(p)); } });
    this.list.replaceChildren(); this.rows.clear();
    const indices = this.data.entries.map((_, i) => i).filter(i => query ? visible.has(i) : !this.parents[i].some(p => this.state.collapsed.has(p)));
    for (const index of indices.slice(0, this.limit)) {
      const entry = this.data.entries[index], row = this.el(this.list, 'div', 'cozy-mini-row');
      row.style.setProperty('--cozy-mini-depth', String(Math.min(6, this.parents[index].length)));
      const children = this.data.entries[index + 1]?.level > entry.level;
      const toggle = this.button(row, this.state.collapsed.has(index) ? 'chevron-right' : 'chevron-down', this.t('展开或折叠章节', 'Expand or collapse section'), () => {
        if (this.state.collapsed.has(index)) this.state.collapsed.delete(index); else this.state.collapsed.add(index); this.draw();
      });
      toggle.disabled = !children || Boolean(query); toggle.classList.toggle('cozy-mini-leaf', !children);
      toggle.setAttribute('aria-expanded', String(!this.state.collapsed.has(index)));
      const title = this.button(row, 'heading', this.t('定位：', 'Go to: ') + entry.title, async () => {
        if (!await this.valid()) return;
        this.state.manual = true; this.adapter.pauseFollow(this.view);
        await this.adapter.locate(this.view, this.data, index);
        if (!this.state.pinned) this.close();
      });
      title.classList.add('cozy-mini-title'); title.textContent = entry.title;
      const read = this.button(row, 'play', this.t('从本节朗读：', 'Read from: ') + entry.title, () => this.read(index, true));
      const more = this.button(row, 'ellipsis', this.t('章节操作', 'Section actions'), event => {
        this.manager.menu(event, [{ label: this.t('只朗读本节', 'Read this section only'), action: () => this.read(index, false).catch(() => this.error()) }]);
      });
      this.rows.set(index, { row, title, read, more });
    }
    if (query && !indices.length) this.el(this.list, 'p').textContent = this.t('没有匹配的章节', 'No matching headings');
    this.more.hidden = indices.length <= this.limit; this.list.scrollTop = top;
    this.positionKey = null; this.update();
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
      refs.title.setAttribute('aria-label', (i === reading ? this.t('正在朗读；定位：', 'Speaking; go to: ') : this.t('定位：', 'Go to: ')) + this.data.entries[i].title);
      refs.read.disabled = refs.more.disabled = busy;
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
    for (const timer of [this.hoverTimer, this.scrollTimer, this.reloadTimer]) clearTimeout(timer);
    this.doc.removeEventListener('pointerdown', this.outside, true); this.view.containerEl.removeEventListener('scroll', this.scroll, true);
    this.doc.defaultView?.removeEventListener('resize', this.resize); this.doc.defaultView?.visualViewport?.removeEventListener('resize', this.resize);
    this.resizeObserver?.disconnect();
    this.root.remove(); this.data = null; this.rows.clear();
  }
}

class MiniOutlineManager {
  constructor(plugin, adapter, { setIcon, Menu }) { this.plugin = plugin; this.adapter = adapter; this.setIcon = setIcon; this.Menu = Menu; this.panels = new Map(); this.states = new Map(); }
  state(path) {
    const state = this.states.get(path) || { query: '', collapsed: new Set(), scroll: 0, depth: normalizeMiniSettings(this.plugin.settings).miniOutlineDepth, pinned: false, manual: false };
    this.states.delete(path); this.states.set(path, state); while (this.states.size > 40) this.states.delete(this.states.keys().next().value); return state;
  }
  menu(event, items) { const menu = new this.Menu(); for (const item of items) menu.addItem(row => row.setTitle(item.label).setIcon('audio-lines').onClick(() => Promise.resolve(item.action()).catch(() => {}))); menu.showAtMouseEvent(event); }
  schedule() { if (this.destroyed || this.timer) return; this.timer = setTimeout(() => { this.timer = null; this.sync(); }, 150); }
  sync() {
    if (this.destroyed) return;
    const views = this.adapter.views().filter(view => view?.file && view.containerEl?.ownerDocument);
    for (const [view, panel] of this.panels) if (!views.includes(view) || !view.containerEl.isConnected) { panel.destroy(); this.panels.delete(view); }
    for (const view of views) {
      const previous = this.panels.get(view);
      if (previous && previous.language !== this.plugin.settings.settingsLanguage) { previous.destroy(); this.panels.delete(view); }
      if (!this.panels.has(view)) this.panels.set(view, new MiniOutlinePanel(this, view));
      const panel = this.panels.get(view); panel.configure();
      if (panel.file && panel.file !== view.file) { panel.close(); panel.invalidate(); }
    }
  }
  toggle(view = this.adapter.activeView()) {
    this.sync(); const panel = this.panels.get(view);
    for (const other of this.panels.values()) if (other !== panel && !other.state?.pinned) other.close();
    if (panel) return panel.toggle();
  }
  invalidate(file) { for (const [view, panel] of this.panels) if (!file || view.file?.path === file.path) panel.invalidate(); }
  update() { for (const panel of this.panels.values()) { try { panel.update(); } catch { panel.invalidate(); panel.error(); } } }
  destroy() { this.destroyed = true; clearTimeout(this.timer); for (const panel of this.panels.values()) panel.destroy(); this.panels.clear(); this.states.clear(); }
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
  plugin.app.workspace.onLayoutReady?.(() => manager.schedule());
  return manager;
}
function addMiniOutlineSettings(plugin, container, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese', t = (cn, en) => zh ? cn : en;
  const options = (dropdown, entries) => { for (const [key, label] of Object.entries(entries)) dropdown.addOption(key, label); return dropdown; };
  const save = async (key, value) => { plugin.settings[key] = value; await plugin.saveSettings(); plugin.miniOutline?.sync(); };
  new Setting(container).setName(t('迷你目录', 'Mini outline'))
    .setDesc(t('未朗读时也可导航。自动模式在检测到已启用的浮动目录插件时隐藏边缘入口；仍可从朗读栏或命令打开。不修改其他插件。', 'Navigate without playback. Auto hides the edge button when a known floating outline is enabled; toolbar and command access remain. Other plugins are unchanged.'))
    .addDropdown(d => options(d, { auto: t('自动（推荐）', 'Auto (recommended)'), always: t('始终显示入口', 'Always show entry'), off: t('关闭边缘入口', 'Hide edge entry') })
      .setValue(normalizeMiniSettings(plugin.settings).miniOutlineMode).onChange(v => save('miniOutlineMode', v)));
  new Setting(container).setName(t('目录位置', 'Outline side')).addDropdown(d => options(d, { left: t('左侧', 'Left'), right: t('右侧', 'Right') })
    .setValue(normalizeMiniSettings(plugin.settings).miniOutlineSide).onChange(v => save('miniOutlineSide', v)));
  new Setting(container).setName(t('鼠标悬停展开目录', 'Open outline on hover')).setDesc(t('默认关闭；触屏始终通过点击展开。', 'Off by default; touch devices always use tap.'))
    .addToggle(tg => tg.setValue(plugin.settings.miniOutlineHover === true).onChange(v => save('miniOutlineHover', v)));
  new Setting(container).setName(t('默认展开层级', 'Default expanded levels')).addDropdown(d => options(d, { 1: '1', 2: '2', 3: '3', 6: t('全部', 'All') })
    .setValue(String(normalizeMiniSettings(plugin.settings).miniOutlineDepth)).onChange(v => save('miniOutlineDepth', Number(v))));
}
module.exports = { MINI_DEFAULTS, normalizeMiniSettings, otherOutlineEnabled, headingParents, headingAt, MiniOutlinePanel, MiniOutlineManager, registerMiniOutline, addMiniOutlineSettings };
