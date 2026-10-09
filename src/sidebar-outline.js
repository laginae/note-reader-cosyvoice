'use strict';
const { setIcon, Notice, Menu, loadPdfJs } = require('obsidian');
const { createHash } = require('crypto');
const { outlineSections } = require('./reader-selection');
const { captureHtmlOutline, htmlSectionText } = require('./html-outline');
const { getHtmlReaderDocument } = require('./html-text');
const { currentSourceRanges } = require('./markdown-source');
const { scanPdfOutline, sectionRange } = require('./pdf-outline');
const { PdfOutlineCache } = require('./pdf-outline-cache');
const { htmlReadingTarget } = require('./html-highlights');
const { currentDocumentHighlightElement } = require('./dom-highlights');

class SidebarOutline {
  constructor(plugin, doc, onLayout = () => {}) {
    this.plugin = plugin; this.entries = []; this.states = new Map(); this.generation = 0;
    this.root = doc.createElement('section'); this.root.className = 'note-reader-sidebar-outline';
    this.releasePointer = () => { this.pointerBusy = false; };
    this.root.addEventListener('pointerdown', () => { this.pointerBusy = true; });
    doc.addEventListener('pointerup', this.releasePointer);
    doc.addEventListener('pointercancel', this.releasePointer);
    const header = this.el(this.root, 'div', 'note-reader-outline-header');
    this.summary = this.el(header, 'strong');
    this.enlarge = this.button(header, 'maximize-2', () => {
      this.enlarged = !this.enlarged; onLayout(this.enlarged);
      this.enlarge.setAttribute('aria-pressed', String(this.enlarged));
    });
    this.expand = this.button(header, 'unfold-vertical', () => this.setExpanded(true));
    this.collapse = this.button(header, 'fold-vertical', () => this.setExpanded(false));
    this.follow = this.button(header, 'locate-fixed', () => {
      if (!this.state.manual || !this.state.follow) this.state.follow = !this.state.follow;
      this.state.manual = false; this.updateCurrent(true);
    });
    this.pdfButton = this.button(header, 'bookmark', () => plugin.openPdfOutline(this.file));
    this.reload = this.button(header, 'refresh-cw', () => { this.signature = null; this.refresh(); });
    this.search = this.el(this.root, 'input'); this.search.type = 'search';
    this.search.addEventListener('input', () => { this.state.query = this.search.value; this.draw(); });
    this.status = this.el(this.root, 'div', 'note-reader-cosyvoice-muted'); this.status.setAttribute('role', 'status');
    this.list = this.el(this.root, 'div', 'note-reader-outline-list');
    this.list.addEventListener('scroll', () => { if (this.state) this.state.scroll = this.list.scrollTop; });
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) this.list.addEventListener(event, () => {
      if (this.state) this.state.manual = true;
    }, { passive: true });
  }
  el(parent, tag, cls) {
    const el = parent.ownerDocument.createElement(tag); if (cls) el.className = cls;
    parent.appendChild(el); return el;
  }
  t(zh, en) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  // Obsidian supplies the tooltip from aria-label; title would add a second native tooltip.
  label(el, label) { el.setAttribute('aria-label', label); }
  button(parent, icon, action) {
    const button = this.el(parent, 'button', 'clickable-icon'); button.type = 'button'; setIcon(button, icon);
    button.addEventListener('click', event => void this.plugin.runUserAction('Outline', () => action(event)));
    return button;
  }
  refresh() {
    if (this.destroyed) return;
    const file = this.plugin.getCurrentReadableFile?.();
    const view = file?.extension === 'md'
      ? (this.plugin.findMarkdownViewForFile?.(file) || this.plugin.getActiveMarkdownView?.({ notify: false }))
      : this.plugin.app?.workspace?.getLeavesOfType?.('html-view')?.find(leaf => leaf.view.file?.path === file?.path)?.view;
    const text = file?.extension === 'md' && view?.file?.path === file.path ? view.editor.getValue() : '';
    const htmlDoc = /^(html|htm)$/i.test(file?.extension || '') ? getHtmlReaderDocument(view) : null;
    const headings = text ? this.plugin.app.metadataCache?.getFileCache(file)?.headings : [];
    const signature = JSON.stringify([file?.path, file?.stat?.mtime, file?.stat?.size, text, headings, this.plugin.settings.settingsLanguage]);
    if (signature === this.signature && htmlDoc === this.htmlDoc) { this.updateCurrent(); return; }
    this.signature = signature; this.generation++; this.cancelTask();
    this.file = file; this.path = file?.path; this.mtime = file?.stat?.mtime; this.size = file?.stat?.size; this.view = view;
    this.text = text; this.htmlDoc = htmlDoc; this.entries = []; this.model = null; this.current = -1;
    this.state = this.states.get(this.path) || { collapsed: new Set(), initialized: false, query: '', scroll: 0, follow: true };
    this.states.delete(this.path); this.states.set(this.path, this.state);
    while (this.states.size > 20) this.states.delete(this.states.keys().next().value);
    this.summary.textContent = this.t('文档大纲', 'Document outline');
    this.label(this.enlarge, this.t('大纲专注视图', 'Outline focus view'));
    this.label(this.expand, this.t('展开全部', 'Expand all')); this.label(this.collapse, this.t('折叠全部', 'Collapse all'));
    this.label(this.follow, this.t('跟随朗读位置', 'Follow reading')); this.label(this.pdfButton, this.t('编辑 PDF 书签', 'Edit PDF bookmarks'));
    this.label(this.reload, this.t('刷新大纲', 'Refresh outline'));
    this.pdfButton.hidden = file?.extension !== 'pdf';
    this.search.placeholder = this.t('搜索标题', 'Search headings'); this.label(this.search, this.search.placeholder);
    this.search.value = this.state.query;
    if (file?.extension === 'pdf') {
      this.status.textContent = this.t('正在读取大纲…', 'Loading outline…'); this.draw();
      if (file.stat && this.plugin.app?.vault) void this.loadPdf(this.generation);
    } else {
      this.entries = htmlDoc ? captureHtmlOutline(htmlDoc) : outlineSections(text, headings);
      this.ready();
    }
  }
  async loadPdf(token) {
    const file = this.file, mtime = this.mtime, size = file.stat.size;
    const current = () => !this.destroyed && token === this.generation && file.stat.mtime === mtime && file.stat.size === size;
    let task, pdf;
    try {
      const cache = this.plugin.pdfOutlineCache ||= new PdfOutlineCache();
      let cached = cache.get(file);
      if (!cached) {
        if (size > 200 * 1024 * 1024) throw new Error('PDF exceeds 200 MB.');
        const bytes = await this.plugin.app.vault.readBinary(file);
        if (!current()) return;
        const lib = await loadPdfJs(); if (!current()) return;
        task = this.task = lib.getDocument({ data: new Uint8Array(bytes.slice(0)) }); pdf = await task.promise;
        const model = await scanPdfOutline(pdf, { isCurrent: current, progress: (page, total) => {
          if (current()) this.status.textContent = this.t('本地分析', 'Local analysis') + ' ' + page + '/' + total;
        } });
        if (!current()) return;
        cached = { model, entries: model.entries.map(entry => ({ ...entry, enabled: true })),
          sourceDigest: createHash('sha256').update(new Uint8Array(bytes)).digest('hex') };
        cache.set(file, cached);
      }
      if (!current()) return;
      this.model = cached.model;
      // Do not navigate using unsaved bookmark-editor changes.
      this.entries = cached.model.entries; this.ready();
    } catch (error) {
      if (current()) this.status.textContent = error.message;
    } finally {
      try { if (pdf) await pdf.destroy(); else if (task) await task.destroy(); } catch (_) { /* Already cancelled. */ }
      if (this.task === task) this.task = null;
    }
  }
  ready() {
    const shape = JSON.stringify(this.entries.map(e => [e.title, e.level, e.from, e.page, e.offset]));
    if (this.state.shape && this.state.shape !== shape) { this.state.collapsed.clear(); this.state.initialized = false; }
    this.state.shape = shape;
    if (!this.state.initialized) {
      const levels = [];
      this.entries.forEach((entry, i) => {
        while (levels.length && levels.at(-1) >= entry.level) levels.pop();
        if (levels.length >= 1) this.state.collapsed.add(i);
        levels.push(entry.level);
      });
      this.state.initialized = true;
    }
    this.status.textContent = !this.entries.length ? this.t('未找到可用标题', 'No headings available')
      : this.entries.some(e => e.inferred) ? this.t('含自动识别标题', 'Includes detected headings') : '';
    this.draw();
  }
  setExpanded(expanded) {
    this.state.collapsed = new Set(expanded ? [] : this.entries.map((_, i) => i)); this.draw();
  }
  draw() {
    const top = this.state.scroll || 0, query = this.search.value.trim().toLocaleLowerCase();
    this.list.replaceChildren(); this.rows = new Map();
    const parents = [], visible = new Set();
    this.parents = this.entries.map((entry, i) => {
      while (parents.length && this.entries[parents.at(-1)].level >= entry.level) parents.pop();
      const chain = parents.slice(); parents.push(i);
      if (query && entry.title.toLocaleLowerCase().includes(query)) { visible.add(i); chain.forEach(n => visible.add(n)); }
      return chain;
    });
    this.entries.forEach((entry, index) => {
      if (query ? !visible.has(index) : this.parents[index].some(n => this.state.collapsed.has(n))) return;
      const row = this.el(this.list, 'div', 'note-reader-outline-item');
      row.style.setProperty('--outline-depth', String(this.parents[index].length));
      const children = this.entries[index + 1]?.level > entry.level;
      const toggle = this.button(row, this.state.collapsed.has(index) && !query ? 'chevron-right' : 'chevron-down', () => {
        if (this.state.collapsed.has(index)) this.state.collapsed.delete(index); else this.state.collapsed.add(index);
        this.draw();
      });
      toggle.classList.toggle('is-leaf', !children); toggle.disabled = !children || Boolean(query);
      toggle.setAttribute('aria-expanded', String(!this.state.collapsed.has(index) || Boolean(query)));
      this.label(toggle, this.t('展开或折叠 ', 'Expand or collapse ') + entry.title);
      const title = this.button(row, 'heading', () => this.locate(index));
      title.classList.add('note-reader-outline-title'); title.textContent = entry.title;
      this.label(title, this.t('定位：', 'Go to: ') + entry.title);
      const play = this.button(row, 'play', () => this.read(true, index));
      this.label(play, this.t('从本节朗读：', 'Read from: ') + entry.title);
      const more = this.button(row, 'ellipsis', event => {
        const menu = new Menu();
        menu.addItem(item => item.setTitle(this.t('只朗读本节', 'Read this section only')).setIcon('audio-lines')
          .setDisabled(this.plugin.activeSession?.kind === 'audio-export')
          .onClick(() => this.plugin.runUserAction('Read section', () => this.read(false, index))));
        menu.showAtMouseEvent(event);
      });
      this.label(more, this.t('章节操作', 'Section actions'));
      this.rows.set(index, { row, title, play, more });
    });
    if (query && !this.rows.size) this.el(this.list, 'p', 'note-reader-cosyvoice-muted').textContent = this.t('没有匹配的标题', 'No matching headings');
    this.list.scrollTop = top; this.updateCurrent();
  }
  updateCurrent(force = false) {
    if (!this.state) return;
    const session = this.plugin.activeSession;
    let current = -1;
    if (session && this.path && session.filePath === this.path && session.kind !== 'audio-export'
      && (session.fileMtime == null || session.fileMtime === this.mtime)) {
      const source = session.markdownSource;
      const ranges = source?.text !== undefined && source.text !== this.text ? []
        : currentSourceRanges(source, { index: session.currentChunkIndex });
      if (ranges.length) this.entries.forEach((entry, i) => { if (entry.from <= ranges[0].from) current = i; });
      if (this.htmlDoc && session.chunks?.[session.currentChunkIndex]) {
        const target = htmlReadingTarget(session, this.plugin.getCurrentReadingHighlight?.() || { index: session.currentChunkIndex }, this.plugin.settings);
        const element = currentDocumentHighlightElement(this.htmlDoc, target.text)
          || currentDocumentHighlightElement(this.htmlDoc, session.chunks[session.currentChunkIndex]);
        if (element) this.entries.forEach((entry, i) => {
          if (entry.element === element || entry.element.contains(element) || (entry.element.compareDocumentPosition(element) & 4)) current = i;
        });
      }
      // Use an unambiguous literal prefix; never guess a same-page heading from page number alone.
      const page = session.chunkPageNumbers?.[session.currentChunkIndex];
      if (this.file?.extension === 'pdf' && page) {
        const source = this.model?.pages.find(p => p.number === page)?.text || '';
        const prefix = session.chunks?.[session.currentChunkIndex]?.trim().slice(0, 80);
        const offset = prefix && source.indexOf(prefix);
        const unique = prefix && prefix.length >= 12 && offset >= 0 && source.indexOf(prefix, offset + 1) < 0;
        if (unique || !this.entries.some(e => e.page === page)) this.entries.forEach((entry, i) => {
          if (entry.page < page || (unique && entry.page === page && entry.offset <= offset)) current = i;
        });
      }
    }
    const changed = current !== this.current; this.current = current;
    this.follow.setAttribute('aria-pressed', String(this.state.follow));
    this.label(this.follow, this.state.manual && this.state.follow ? this.t('恢复跟随朗读位置', 'Resume following reading') : this.t('跟随朗读位置', 'Follow reading'));
    for (const [index, item] of this.rows || []) {
      item.row.classList.toggle('is-current', index === current);
      if (index === current) item.title.setAttribute('aria-current', 'location'); else item.title.removeAttribute('aria-current');
      item.play.disabled = item.more.disabled = session?.kind === 'audio-export';
    }
    if ((changed || force) && current >= 0 && this.state.follow && !this.state.manual && !this.search.value) {
      const ancestors = this.parents[current] || [];
      if (ancestors.some(i => this.state.collapsed.has(i))) {
        ancestors.forEach(i => this.state.collapsed.delete(i)); this.draw();
      }
      const row = this.rows.get(current)?.row;
      if (row && (row.offsetTop < this.list.scrollTop || row.offsetTop + row.offsetHeight > this.list.scrollTop + this.list.clientHeight))
        this.list.scrollTop = Math.max(0, row.offsetTop - this.list.clientHeight / 2);
    }
  }
  valid(index) {
    const entry = this.entries[index];
    if (!entry || this.plugin.getCurrentReadableFile?.()?.path !== this.path || this.file?.path !== this.path
      || this.file?.stat?.mtime !== this.mtime || this.file?.stat?.size !== this.size
      || (this.file.extension === 'md' && (this.view?.file?.path !== this.path || this.view.editor.getValue() !== this.text))
      || (this.htmlDoc && (getHtmlReaderDocument(this.view) !== this.htmlDoc || !entry.element.isConnected
        || entry.element.textContent.replace(/\s+/g, ' ').trim() !== entry.title))) {
      this.signature = null; this.refresh(); new Notice(this.t('文档已变化，请重新选择章节。', 'Document changed. Choose the section again.')); return null;
    }
    return entry;
  }
  async locate(index) {
    const entry = this.valid(index); if (!entry) return;
    if (this.file.extension === 'pdf') return this.plugin.app.workspace.openLinkText(
      this.path + '#page=' + entry.page + '&offset=' + Math.round(entry.x) + ',' + Math.round(entry.y) + ',0', '', false);
    if (this.view?.leaf) await this.plugin.app.workspace?.revealLeaf?.(this.view.leaf);
    if (!this.valid(index)) return;
    if (this.htmlDoc) return entry.element.scrollIntoView({ block: 'start' });
    if (this.view.getMode?.() === 'preview') this.view.previewMode?.applyScroll(entry.line);
    else { const from = this.view.editor.offsetToPos(entry.from); this.view.editor.scrollIntoView({ from, to: from }, true); }
  }
  async read(remaining, index) {
    if (this.plugin.activeSession?.kind === 'audio-export') return;
    const entry = this.valid(index); if (!entry) return;
    if (this.file.extension === 'pdf') return this.plugin.readCurrentPdf(this.file, { outlineRange: {
      ...sectionRange(this.entries, index, this.model.pages, remaining), fileMtime: this.mtime, title: entry.title } });
    if (this.htmlDoc) return this.plugin.startReading(htmlSectionText(this.htmlDoc, entry, captureHtmlOutline(this.htmlDoc), remaining),
      entry.title, { file: this.file, sourceKind: 'html', plainText: true });
    return this.plugin.startReading(this.text.slice(entry.from, remaining ? undefined : entry.to), entry.title,
      { file: this.file, sourceKind: 'markdown', sourceText: this.text, sourceOffset: entry.from });
  }
  destroy() {
    this.destroyed = true; this.generation++; this.cancelTask(); this.root.remove();
    this.root.ownerDocument.removeEventListener('pointerup', this.releasePointer);
    this.root.ownerDocument.removeEventListener('pointercancel', this.releasePointer);
    this.states.clear(); this.text = ''; this.entries = []; this.view = this.htmlDoc = null;
  }
  cancelTask() {
    const task = this.task; this.task = null;
    if (task) void Promise.resolve().then(() => task.destroy()).catch(() => {});
  }
}
module.exports = { SidebarOutline };
