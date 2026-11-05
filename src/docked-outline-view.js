'use strict';

const { ItemView, Menu, setIcon } = require('obsidian');
const { DOCKED_OUTLINE_TYPE } = require('./docked-outline');
const { desktopMiniAdapter } = require('./mini-outline-adapter');
const { headingParents } = require('./mini-outline');
const { miniOutlineTitle } = require('./mini-outline-title');
const { getHtmlReaderDocument } = require('./html-text');

const PAGE_SIZE = 400;
function preferences(value = {}) {
  return { controlsOpen: value?.controlsOpen === true, doubleClickRead: value?.doubleClickRead === true,
    showLevelLabels: value?.showLevelLabels === true,
    titleLines: [1, 2, 3, 4].includes(value?.titleLines) ? value.titleLines : 2 };
}

class DockedOutlineView extends ItemView {
  constructor(leaf, plugin, manager) {
    super(leaf);
    this.plugin = plugin; this.manager = manager; this.adapter = desktopMiniAdapter(plugin);
    this.prefs = preferences(); this.states = new Map(); this.rows = new Map(); this.generation = 0;
    this.dirty = true; this.closed = true;
  }
  t(zh, en) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  getViewType() { return DOCKED_OUTLINE_TYPE; }
  getDisplayText() { return this.t('目录与朗读', 'Outline and reader'); }
  getIcon() { return 'list-tree'; }
  getState() { return { ...this.prefs }; }
  async setState(state, result) {
    this.prefs = preferences(state); this.applyPreferences();
    if (super.setState) await super.setState(this.getState(), result);
  }
  changePreferences(change) {
    this.prefs = preferences({ ...this.prefs, ...change }); this.applyPreferences();
    this.plugin.app.workspace.requestSaveLayout?.();
  }
  applyPreferences() {
    if (!this.root) return;
    this.root.style.setProperty('--cozy-outline-title-lines', String(this.prefs.titleLines));
    this.root.classList.toggle('show-level-labels', this.prefs.showLevelLabels);
    this.controls.hidden = !this.prefs.controlsOpen;
    this.disclosure.setAttribute('aria-expanded', String(this.prefs.controlsOpen));
    setIcon(this.disclosureIcon, this.prefs.controlsOpen ? 'chevron-down' : 'chevron-right');
  }
  async onOpen() {
    this.closed = false; this.build(); this.manager.views.add(this);
    const workspace = this.plugin.app.workspace;
    for (const event of ['active-leaf-change', 'file-open', 'layout-change']) {
      this.registerEvent(workspace.on(event, () => this.schedule()));
    }
    this.registerEvent(workspace.on('editor-change', (_editor, view) => {
      if (view === this.source) this.invalidate();
    }));
    if (this.plugin.app.metadataCache?.on) this.registerEvent(this.plugin.app.metadataCache.on('changed', file => {
      if (file === this.sourceFile) this.invalidate();
    }));
    if (this.plugin.app.vault?.on) this.registerEvent(this.plugin.app.vault.on('modify', file => {
      if (file === this.sourceFile) this.invalidate();
    }));
    this.registerDomEvent(this.root.ownerDocument, 'visibilitychange', () => this.schedule());
    await this.refresh();
  }
  onResize() { this.schedule(); }
  async onClose() { this.dispose(); }
  dispose() {
    this.closed = true; this.generation++; clearTimeout(this.timer); clearTimeout(this.positionTimer);
    this.unbindSource?.(); this.unbindSource = null; this.manager.views.delete(this);
    this.states.clear(); this.rows.clear(); this.data = null; this.source = null;
    this.root?.remove(); this.root = null;
  }
  visible() {
    return !this.closed && !!this.root?.isConnected && !this.root.ownerDocument.hidden
      && this.containerEl.getClientRects().length > 0;
  }
  currentSource() {
    const active = this.plugin.app.workspace.activeLeaf?.view;
    const views = this.adapter.views();
    if (active?.file) return views.includes(active) ? active : null;
    return views.includes(this.source) ? this.source : this.adapter.activeView() || null;
  }
  invalidate() { this.dirty = true; this.generation++; this.schedule(); }
  schedule() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.refresh(); }, 120);
  }
  el(parent, tag, cls, text) {
    const el = parent.ownerDocument.createElement(tag); if (cls) el.className = cls;
    if (text != null) el.textContent = text; parent.appendChild(el); return el;
  }
  button(parent, icon, label, action) {
    const button = this.el(parent, 'button', 'clickable-icon'); button.type = 'button';
    this.label(button, label); setIcon(button, icon);
    button.addEventListener('click', event => { event.preventDefault(); action(event); }); return button;
  }
  label(el, text) { el.setAttribute('aria-label', text); }
  action(label, fn) { void this.plugin.runUserAction(label, fn); }
  build() {
    this.contentEl.replaceChildren(); this.contentEl.classList.add('cozy-outline-content');
    this.root = this.el(this.contentEl, 'section', 'cozy-outline-reader');
    this.label(this.root, this.getDisplayText());
    this.fileTitle = this.el(this.root, 'div', 'cozy-outline-file');
    const toolbar = this.el(this.root, 'div', 'cozy-outline-tools');
    this.searchButton = this.button(toolbar, 'search', this.t('搜索标题', 'Search headings'), () => {
      this.search.hidden = !this.search.hidden;
      if (!this.search.hidden) this.search.focus();
      else if (this.state) { this.search.value = ''; this.state.query = ''; this.draw(); }
      this.searchButton.setAttribute('aria-expanded', String(!this.search.hidden));
    });
    this.searchButton.setAttribute('aria-expanded', 'false');
    this.button(toolbar, 'list-tree', this.t('展开层级', 'Heading depth'), event => this.depthMenu(event));
    this.returnButton = this.button(toolbar, 'corner-up-left', this.t('回到朗读位置', 'Return to reading'), () => {
      if (!this.source) return;
      this.action('Return to reading', async () => { await this.adapter.returnReading(this.source); this.updatePositions(true); });
    });
    this.button(toolbar, 'ellipsis', this.t('目录选项', 'Outline options'), event => this.optionsMenu(event));
    this.search = this.el(this.root, 'input', 'cozy-outline-search'); this.search.type = 'search'; this.search.hidden = true;
    this.search.placeholder = this.t('搜索标题', 'Search headings'); this.label(this.search, this.search.placeholder);
    this.search.addEventListener('input', () => {
      if (this.state) { this.state.query = this.search.value; this.state.scroll = 0; this.limit = PAGE_SIZE; this.draw(); }
    });
    this.search.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.searchButton.click(); this.searchButton.focus(); event.stopPropagation(); }
    });
    const band = this.el(this.root, 'div', 'cozy-outline-transport');
    this.disclosure = this.el(band, 'button', 'cozy-outline-disclosure'); this.disclosure.type = 'button';
    this.disclosureIcon = this.el(this.disclosure, 'span');
    this.el(this.disclosure, 'span', '', this.t('朗读控制', 'Reading controls'));
    this.disclosure.addEventListener('click', () => this.changePreferences({ controlsOpen: !this.prefs.controlsOpen }));
    this.pause = this.button(band, 'pause', this.t('暂停', 'Pause'), () => this.adapter.togglePlayback());
    this.stop = this.button(band, 'square', this.t('停止', 'Stop'), () => this.adapter.stopPlayback());
    this.controls = this.el(this.root, 'div', 'cozy-outline-controls');
    this.sectionTitle = this.el(this.controls, 'div', 'cozy-outline-section');
    const actions = this.el(this.controls, 'div', 'cozy-outline-section-actions');
    this.readFrom = this.button(actions, 'play', this.t('从当前节继续朗读', 'Read from current section'), () => this.read(this.sectionIndex(), true));
    this.el(this.readFrom, 'span', '', this.t('从本节继续', 'Read from section'));
    this.readOnly = this.button(actions, 'text-select', this.t('只读当前节', 'Read this section only'), () => this.read(this.sectionIndex(), false));
    this.el(this.readOnly, 'span', '', this.t('只读本节', 'Read section only'));
    const audio = this.el(this.controls, 'div', 'cozy-outline-audio');
    this.back = this.button(audio, 'rotate-ccw', this.t('后退 5 秒', 'Back 5 seconds'), () => this.action('Seek', () => this.adapter.seekPlaybackBy(-5)));
    this.forward = this.button(audio, 'rotate-cw', this.t('前进 5 秒', 'Forward 5 seconds'), () => this.action('Seek', () => this.adapter.seekPlaybackBy(5)));
    this.speed = this.el(audio, 'select'); this.label(this.speed, this.t('播放倍速', 'Playback speed'));
    for (const speed of [0.5, 0.75, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2, 2.5, 3]) {
      const option = this.el(this.speed, 'option', '', speed + 'x'); option.value = String(speed);
    }
    this.speed.addEventListener('change', () => this.action('Set playback speed', () => this.plugin.setPlaybackSpeed(Number(this.speed.value))));
    this.nowPlaying = this.el(this.controls, 'div', 'cozy-outline-now-playing');
    this.status = this.el(this.root, 'div', 'cozy-outline-status'); this.status.setAttribute('role', 'status');
    this.list = this.el(this.root, 'div', 'cozy-outline-list'); this.list.setAttribute('role', 'list');
    this.label(this.list, this.t('文档目录', 'Document outline'));
    this.list.addEventListener('scroll', () => { if (this.state) this.state.scroll = this.list.scrollTop; });
    this.count = this.el(this.root, 'div', 'cozy-outline-count');
    this.applyPreferences(); this.updatePlayback();
  }
  bindSource(view) {
    this.unbindSource?.(); this.unbindSource = null;
    if (!view?.containerEl) return;
    const update = () => {
      if (this.positionTimer || !this.visible()) return;
      this.positionTimer = setTimeout(() => { this.positionTimer = null; this.updatePositions(); }, 150);
    };
    view.containerEl.addEventListener('scroll', update, true);
    const loaded = () => { if (/^html?$/.test(view.file?.extension)) this.invalidate(); };
    view.containerEl.addEventListener('load', loaded, true);
    const html = /^html?$/.test(view.file?.extension) ? getHtmlReaderDocument(view) : null;
    html?.addEventListener('scroll', update, true);
    this.unbindSource = () => {
      view.containerEl.removeEventListener('scroll', update, true);
      view.containerEl.removeEventListener('load', loaded, true);
      html?.removeEventListener('scroll', update, true);
    };
  }
  observeHtml() {
    if (!this.visible() || this.loading || !/^html?$/.test(this.source?.file?.extension)) return;
    const doc = getHtmlReaderDocument(this.source);
    if (doc !== this.data?.doc || doc?.readyState !== this.htmlReadyState) this.invalidate();
  }
  async refresh() {
    if (!this.visible()) { this.generation++; this.loading = false; return; }
    const source = this.currentSource(), file = source?.file;
    if (source === this.source && file === this.sourceFile && !this.dirty && !this.force
      && file?.stat?.mtime === this.data?.mtime && file?.stat?.size === this.data?.size) { this.updatePlayback(); return; }
    if (this.loading && !this.dirty && source === this.source && file === this.sourceFile) return;
    const token = ++this.generation;
    if (source !== this.source) this.bindSource(source);
    this.source = source; this.sourceFile = file; this.data = null; this.selected = -1;
    this.fileTitle.textContent = file?.basename || file?.name || this.t('未打开文档', 'No document open');
    this.state = this.states.get(file?.path) || { collapsed: new Set(), query: '', scroll: 0 };
    if (file) {
      this.states.delete(file.path); this.states.set(file.path, this.state);
      while (this.states.size > 20) this.states.delete(this.states.keys().next().value);
    }
    this.search.value = this.state.query; this.search.hidden = !this.state.query;
    this.searchButton.setAttribute('aria-expanded', String(!this.search.hidden));
    this.limit = PAGE_SIZE; this.dirty = false; const force = this.force; this.force = false;
    this.rows.clear(); this.list.replaceChildren(); this.count.textContent = '';
    this.status.textContent = file ? this.t('正在读取目录…', 'Loading outline…') : this.t('打开 Markdown、PDF 或 HTML 文档', 'Open a Markdown, PDF or HTML document');
    this.updatePlayback(); if (!file) return;
    this.loading = true;
    const cancelled = () => this.closed || token !== this.generation || !this.visible() || this.currentSource() !== source;
    try {
      const data = await this.adapter.load(source, cancelled, force);
      if (cancelled()) return;
      if (!data) { this.dirty = true; return; }
      this.data = data; this.parents = headingParents(data.entries);
      if (data.kind === 'html') { this.htmlReadyState = data.doc?.readyState; this.bindSource(source); }
      this.titles = data.entries.map(entry => miniOutlineTitle(entry.title, data.kind));
      const shape = JSON.stringify(data.entries.map(entry => [entry.title, entry.level, entry.from, entry.page, entry.offset]));
      if (this.state.shape && this.state.shape !== shape) { this.state.collapsed.clear(); this.state.scroll = 0; }
      this.state.shape = shape;
      this.status.textContent = !data.entries.length ? this.t('未找到可用标题', 'No headings available')
        : data.entries.some(entry => entry.inferred) ? this.t('含自动识别标题，请核对', 'Includes detected headings; review before use') : '';
      this.draw(); this.updatePlayback();
    } catch {
      if (!cancelled()) this.status.textContent = this.t('目录读取失败，请刷新重试', 'Could not load outline. Refresh to retry.');
    } finally { if (token === this.generation) this.loading = false; }
  }
  expand(open) {
    if (!this.data) return;
    this.state.collapsed = new Set(open ? [] : this.data.entries.map((_, index) => index));
    this.limit = PAGE_SIZE; this.draw();
  }
  depthMenu(event) {
    const menu = new Menu();
    menu.addItem(item => item.setTitle(this.t('展开全部', 'Expand all')).onClick(() => this.expand(true)));
    menu.addItem(item => item.setTitle(this.t('折叠全部', 'Collapse all')).onClick(() => this.expand(false)));
    for (const depth of [2, 3]) menu.addItem(item => item.setTitle(this.t(`展开至 ${depth} 级`, `Expand to ${depth} levels`)).onClick(() => {
      if (!this.data) return;
      this.state.collapsed = new Set(this.parents.flatMap((parents, index) => parents.length >= depth - 1 ? [index] : []));
      this.limit = PAGE_SIZE; this.draw();
    }));
    menu.showAtMouseEvent(event);
  }
  draw(focusIndex) {
    if (!this.data || this.closed) return;
    this.positionKey = null;
    const scroll = this.state.scroll, query = this.state.query.trim().toLocaleLowerCase(), matched = new Set();
    if (query) this.titles.forEach((title, i) => { if (title.toLocaleLowerCase().includes(query)) { matched.add(i); this.parents[i].forEach(p => matched.add(p)); } });
    const indices = this.data.entries.map((_, i) => i).filter(i => query ? matched.has(i) : !this.parents[i].some(p => this.state.collapsed.has(p)));
    this.rows.clear(); this.list.replaceChildren();
    for (const index of indices.slice(0, this.limit)) {
      const entry = this.data.entries[index], children = this.parents[index + 1]?.includes(index);
      const row = this.el(this.list, 'div', 'cozy-outline-row'); row.setAttribute('role', 'listitem');
      row.style.setProperty('--outline-depth', String(Math.min(6, this.parents[index].length)));
      const folded = this.state.collapsed.has(index) && !query;
      const toggle = this.button(row, folded ? 'chevron-right' : 'chevron-down', this.t('展开或折叠', 'Expand or collapse') + ': ' + this.titles[index], () => {
        if (this.state.collapsed.has(index)) this.state.collapsed.delete(index); else this.state.collapsed.add(index);
        this.draw(index);
      });
      toggle.classList.add('cozy-outline-fold'); toggle.hidden = !children;
      if (children) toggle.setAttribute('aria-expanded', String(!folded));
      this.el(row, 'span', 'cozy-outline-level', 'H' + entry.level).setAttribute('aria-hidden', 'true');
      const title = this.el(row, 'button', 'cozy-outline-title'); title.type = 'button';
      this.el(title, 'span', '', this.titles[index]); this.label(title, this.titles[index]);
      title.addEventListener('click', () => this.locate(index));
      title.addEventListener('dblclick', event => { if (this.prefs.doubleClickRead) { event.preventDefault(); this.read(index, true); } });
      row.addEventListener('contextmenu', event => { event.preventDefault(); this.sectionMenu(index, event); });
      title.addEventListener('keydown', event => {
        const keys = [...this.rows.keys()], current = keys.indexOf(index);
        let next;
        if (event.key === 'ArrowDown') next = keys[Math.min(current + 1, keys.length - 1)];
        else if (event.key === 'ArrowUp') next = keys[Math.max(0, current - 1)];
        else if (event.key === 'Home') next = keys[0];
        else if (event.key === 'End') next = keys.at(-1);
        else if ((event.key === 'ArrowRight' && folded || event.key === 'ArrowLeft' && !folded) && children) { event.preventDefault(); toggle.click(); }
        else if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); this.sectionMenu(index, event, title); }
        if (next !== undefined) { event.preventDefault(); this.rows.get(next)?.title.focus(); }
      });
      this.rows.set(index, { row, title });
    }
    if (indices.length > this.limit) {
      const more = this.el(this.list, 'button', 'cozy-outline-more', this.t('显示更多标题', 'Show more headings'));
      more.addEventListener('click', () => { const next = indices[this.limit]; this.limit += PAGE_SIZE; this.draw(next); });
    }
    this.count.textContent = (indices.length === this.data.entries.length ? String(indices.length) : indices.length + ' / ' + this.data.entries.length)
      + this.t(' 个标题', ' headings');
    if (query && !indices.length) this.el(this.list, 'div', 'cozy-outline-empty', this.t('没有匹配的标题', 'No matching headings'));
    this.list.scrollTop = scroll; this.updatePositions();
    if (focusIndex !== undefined) this.rows.get(focusIndex)?.title.focus({ preventScroll: true });
  }
  sectionIndex() { return this.selected >= 0 ? this.selected : this.positions?.browsing >= 0 ? this.positions.browsing : 0; }
  current(data) {
    return data && data === this.data && !this.closed && this.source === this.currentSource() && this.adapter.valid(this.source, data);
  }
  locate(index) {
    const data = this.data; if (!this.current(data)) { this.invalidate(); return; }
    this.selected = index; this.adapter.pauseFollow(this.source);
    this.action('Locate section', async () => { await this.adapter.locate(this.source, data, index); this.updatePositions(); });
  }
  read(index, remaining) {
    const data = this.data;
    if (!this.current(data) || !data.entries[index]) { this.invalidate(); return; }
    if (this.adapter.busy() || this.readPending) return;
    const source = this.source; this.readPending = true; this.priorSession = this.plugin.activeSession;
    this.updatePlayback();
    this.action('Read section', async () => {
      try { await this.adapter.read(source, data, index, remaining, { keepControls: true }); }
      finally { this.readPending = false; this.updatePlayback(); }
    });
  }
  sectionMenu(index, event, target) {
    const data = this.data, menu = new Menu();
    for (const [remaining, label] of [[false, this.t('只读本节', 'Read this section only')], [true, this.t('从本节继续朗读', 'Read from this section')]]) {
      menu.addItem(item => item.setTitle(label).setIcon('play').setDisabled(this.adapter.busy() || !!this.readPending).onClick(() => {
        if (data === this.data) this.read(index, remaining);
      }));
    }
    if (target) { const rect = target.getBoundingClientRect(); menu.showAtPosition({ x: rect.left, y: rect.bottom }); }
    else menu.showAtMouseEvent(event);
  }
  optionsMenu(event) {
    const menu = new Menu();
    menu.addItem(item => item.setTitle(this.t('刷新目录', 'Refresh outline')).setIcon('refresh-cw')
      .onClick(() => { this.force = true; this.invalidate(); }));
    menu.addSeparator();
    menu.addItem(item => item.setTitle(this.t('显示标题级别标签（H1、H2…）', 'Show heading level labels (H1, H2...)')).setChecked(this.prefs.showLevelLabels)
      .onClick(() => this.changePreferences({ showLevelLabels: !this.prefs.showLevelLabels })));
    menu.addItem(item => item.setTitle(this.t('双击从本节继续朗读', 'Double-click to read from section')).setChecked(this.prefs.doubleClickRead)
      .onClick(() => this.changePreferences({ doubleClickRead: !this.prefs.doubleClickRead })));
    menu.addSeparator();
    for (const lines of [1, 2, 3, 4]) menu.addItem(item => item.setTitle(this.t('标题显示行数：', 'Title lines: ') + lines)
      .setChecked(this.prefs.titleLines === lines).onClick(() => this.changePreferences({ titleLines: lines })));
    menu.showAtMouseEvent(event);
  }
  updatePositions(reveal = false) {
    if (!this.visible() || !this.data) return;
    this.positions = this.adapter.positions(this.source, this.data);
    const { reading, browsing } = this.positions;
    const key = `${reading}:${browsing}:${this.selected}`;
    if (!reveal && this.positionKey === key) return;
    this.positionKey = key;
    for (const [index, { row, title }] of this.rows) {
      row.classList.toggle('is-reading', reading === index); row.classList.toggle('is-browsing', browsing === index);
      if (browsing === index) title.setAttribute('aria-current', 'location'); else title.removeAttribute('aria-current');
      this.label(title, this.titles[index] + (reading === index ? this.t('，正在朗读', ', reading') : ''));
    }
    this.sectionTitle.textContent = this.titles[this.sectionIndex()] || this.t('没有可朗读章节', 'No readable section');
    if (reveal && reading >= 0) {
      this.parents[reading].forEach(p => this.state.collapsed.delete(p)); this.state.query = ''; this.search.value = '';
      this.limit = Math.max(this.limit, reading + 1); this.draw(); this.rows.get(reading)?.row.scrollIntoView({ block: 'nearest' });
    }
  }
  updatePlayback() {
    if (!this.visible()) return;
    if (this.source !== this.currentSource() || this.sourceFile !== this.source?.file) this.schedule();
    if (this.readPending && this.plugin.activeSession !== this.priorSession) this.readPending = false;
    const playback = this.adapter.playback();
    this.pause.hidden = this.stop.hidden = !playback.active;
    this.pause.disabled = !playback.canToggle; this.stop.disabled = !playback.canStop;
    const icon = playback.paused ? 'play' : 'pause';
    if (this.pause.dataset.icon !== icon) { setIcon(this.pause, icon); this.pause.dataset.icon = icon; }
    this.label(this.pause, playback.paused ? this.t('继续朗读', 'Resume reading') : this.t('暂停朗读', 'Pause reading'));
    this.back.disabled = this.forward.disabled = !playback.canSeek;
    this.returnButton.disabled = !playback.active;
    this.readFrom.disabled = this.readOnly.disabled = !this.data?.entries.length || this.adapter.busy() || !!this.readPending;
    this.speed.value = String(this.plugin.settings.playbackSpeed || 1);
    this.nowPlaying.textContent = playback.active ? this.t('正在朗读：', 'Reading: ') + (playback.title || '') : '';
    this.updatePositions();
  }
}

module.exports = { DockedOutlineView, preferences };
