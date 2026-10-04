'use strict';

const { setIcon, Notice } = require('obsidian');
const { outlineSections } = require('./reader-selection');
const { currentSourceRanges } = require('./markdown-source');
const { estimatePlayback, formatDuration } = require('./playback-estimate');
const { getHtmlReaderDocument } = require('./html-text');
const { captureHtmlOutline, htmlSectionText } = require('./html-outline');

function node(parent, tag, className = '') {
  const element = parent.ownerDocument.createElement(tag);
  element.className = className; parent.appendChild(element); return element;
}

class NativeReaderToolbar {
  constructor(plugin, view, close) {
    this.plugin = plugin; this.view = view; this.close = close; this.labels = [];
    this.isPdf = view.getViewType?.() === 'pdf' || view.file?.extension === 'pdf';
    this.isHtml = view.getViewType?.() === 'html-view';
    this.isWeb = view.getViewType?.() === 'webviewer';
    this.root = view.contentEl.ownerDocument.createElement('div');
    this.root.className = 'note-reader-native-toolbar'; this.root.setAttribute('role', 'region');
    this.root.tabIndex = 0;
    this.root.addEventListener('keydown', event => this.handleKeydown(event));
    this.documentKeydown = event => {
      if (this.view.getMode?.() !== 'preview' || this.root.contains(event.target)) return;
      const doc = this.root.ownerDocument;
      const inReadingPane = this.view.contentEl.contains(event.target)
        || (event.target === doc.body && this.plugin.app.workspace.activeLeaf?.view === this.view);
      if (inReadingPane) this.handleKeydown(event, true);
    };
    this.root.ownerDocument.addEventListener('keydown', this.documentKeydown);
    this.root.addEventListener('pointerdown', event => {
      this.captureSelection();
      if (event.button === 0 && !event.target.closest('button, input, select, textarea, a, [contenteditable]')) {
        this.root.focus({ preventScroll: true });
      }
    }, true);
    view.contentEl.parentElement.insertBefore(this.root, view.contentEl);
    const controls = node(this.root, 'div', 'note-reader-native-controls');
    this.play = this.button(controls, 'play', ['Read file', '朗读全文'], () => plugin.activeSession ? plugin.pauseOrResume() : this.read('entire'), true);
    this.stop = this.button(controls, 'square', ['Stop', '停止'], () => plugin.stopReading(), true);
    this.previous = this.button(controls, 'skip-back', ['Previous segment', '上一段'], () => plugin.jumpToAdjacentChunk(-1), true);
    this.back = this.button(controls, 'rotate-ccw', ['Back 5 seconds (Left Arrow)', '后退 5 秒（左方向键）'], () => plugin.seekCurrentAudioBySeconds(-5), true);
    this.forward = this.button(controls, 'rotate-cw', ['Forward 5 seconds (Right Arrow)', '前进 5 秒（右方向键）'], () => plugin.seekCurrentAudioBySeconds(5), true);
    this.next = this.button(controls, 'skip-forward', ['Next segment', '下一段'], () => plugin.jumpToAdjacentChunk(1), true);
    this.back.setAttribute('aria-keyshortcuts', 'ArrowLeft'); this.forward.setAttribute('aria-keyshortcuts', 'ArrowRight');
    const progress = node(controls, 'div', 'note-reader-native-progress');
    this.progress = node(progress, 'input'); this.progress.type = 'range'; this.progress.min = '0'; this.progress.max = '1000'; this.progress.step = '1';
    this.progress.addEventListener('pointerdown', () => { this.scrubbing = true; });
    this.progress.addEventListener('input', () => { this.scrubbing = true; });
    this.progress.addEventListener('pointerup', () => { this.scrubbing = false; });
    this.progress.addEventListener('change', () => {
      const value = Number(this.progress.value) / 1000; this.scrubbing = false; this.seek(value);
    });
    for (const event of ['blur', 'pointercancel']) this.progress.addEventListener(event, () => { this.scrubbing = false; this.render(); });
    this.time = node(progress, 'span', 'note-reader-native-time');
    this.speed = node(controls, 'select', 'note-reader-native-speed');
    for (const value of [0.5, 0.75, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2, 2.5, 3]) {
      const option = node(this.speed, 'option'); option.value = String(value); option.textContent = `${value}x`;
    }
    this.speed.addEventListener('change', () => this.action(() => plugin.setPlaybackSpeed(Number(this.speed.value))));
    this.outlineButton = this.button(controls, 'list-tree', ['Outline', '大纲'], () => {
      if (this.isPdf) { plugin.openPdfOutline(view.file); return; }
      this.outline.hidden = !this.outline.hidden; this.outlineButton.setAttribute('aria-expanded', String(!this.outline.hidden));
      if (!this.outline.hidden) this.refreshOutline();
    });
    this.chatButton = this.button(controls, 'messages-square', ['Read Copilot chat (click: choose; right-click: latest reply)', 'Copilot 聊天朗读（左键选择；右键朗读最近回答）'], () => plugin.openCopilotChat(view.file));
    this.chatButton.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      if (!this.chatButton.disabled && !this.chatButton.hidden) void this.action(() => plugin.readLatestCopilotReply());
    });
    this.moreButton = this.button(controls, 'ellipsis', ['More controls', '更多控制'], () => {
      this.more.hidden = !this.more.hidden; this.moreButton.setAttribute('aria-expanded', String(!this.more.hidden));
    });
    this.button(controls, 'x', ['Hide reading toolbar', '隐藏朗读工具栏'], close);
    this.outline = node(this.root, 'div', 'note-reader-native-options'); this.outline.hidden = true;
    this.outlineButton.hidden = this.isWeb;
    this.heading = node(this.outline, 'select', 'note-reader-native-heading');
    this.heading.addEventListener('change', () => this.locateHeading());
    this.section = this.button(this.outline, 'audio-lines', ['Read this section', '只朗读这一节'], () => this.readHeading(false));
    this.fromSection = this.button(this.outline, 'list-start', ['Read from this section', '从这一节继续朗读'], () => this.readHeading(true));
    this.more = node(this.root, 'div', 'note-reader-native-options'); this.more.hidden = true;
    this.scope = node(this.more, 'select');
    this.scope.addEventListener('change', () => this.render());
    for (const [value, en, zh] of [['entire', this.isWeb || this.isHtml ? 'Entire page' : this.isPdf ? 'Entire PDF' : 'Entire note', this.isWeb || this.isHtml ? '整个页面' : this.isPdf ? '整篇 PDF' : '整篇笔记'], ['selection', 'Selection only', '仅选中文字'], ['from-selection', 'From selection', '从选中位置']]) {
      const option = node(this.scope, 'option'); option.value = value; this.labels.push([option, en, zh, 'text']);
    }
    this.readScope = this.button(this.more, 'play', ['Read selected scope', '朗读所选范围'], () => this.read(this.scope.value));
    this.volume = node(this.more, 'input'); this.volume.type = 'range'; this.volume.min = '0'; this.volume.max = '100'; this.volume.step = '1';
    this.volume.className = 'note-reader-native-volume';
    this.volume.addEventListener('input', () => plugin.setPlaybackVolume(Number(this.volume.value) / 100));
    this.volume.addEventListener('change', () => this.action(async () => { await plugin.saveSettings(); plugin.renderReaderViews(); }));
    this.button(this.more, 'book-open', ['Focus reading', '专注朗读'], async () => {
      await plugin.app.workspace.revealLeaf(view.leaf); await plugin.toggleDocumentView();
    });
    this.button(this.more, 'panel-right', ['Reader controls', '朗读控制面板'], () => plugin.activateControlView());
    this.exportButton = this.button(this.more, 'download', ['Export audio', '导出音频'], async () => {
      await plugin.app.workspace.revealLeaf(view.leaf); await plugin.exportCurrentFileAudio({ insertAfterExport: false });
    });
    this.status = node(this.root, 'div', 'note-reader-native-status');
    this.refreshOutline(); this.render();
  }
  t(en, zh) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  action(action) { return this.plugin.runUserAction('Reading toolbar', action); }
  handleKeydown(event, readOnlyBody = false) {
    if ((!readOnlyBody && !this.root.contains(this.root.ownerDocument.activeElement))
      || this.plugin.activeSession?.kind === 'audio-export'
      || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
      || (readOnlyBody && event.target.closest('button, [role="button"]'))
      || event.target.closest('input, select, textarea, a, [contenteditable], [role="textbox"]')) return;
    this.plugin.handleReaderKeydown(event, { allowPause: true, focusPanel: readOnlyBody ? null : this.root });
  }
  button(parent, icon, labels, action, focusToolbar = false) {
    const button = node(parent, 'button', 'clickable-icon'); button.type = 'button'; setIcon(button, icon);
    this.labels.push([button, ...labels]);
    button.addEventListener('pointerdown', event => {
      if (event.button === 0) { this.captureSelection(); event.preventDefault(); }
    });
    button.addEventListener('click', () => {
      if (button.disabled) return;
      if (focusToolbar) this.root.focus({ preventScroll: true });
      void this.action(action);
    });
    return button;
  }
  captureSelection() {
    if (this.isWeb) { this.plugin.captureWebReaderRange(); return; }
    if (this.isHtml) { this.plugin.getHtmlSelectionForFile(this.view.file); return; }
    const current = this.isPdf ? this.plugin.getPdfSelectionForFile(this.view.file) : this.plugin.captureMarkdownReadingSelection(this.view);
    this.selection = current || (this.root.contains(this.root.ownerDocument.activeElement) ? this.selection : null);
  }
  read(scope) {
    if (this.isWeb) return this.plugin.readCurrentWebPage(this.view, scope);
    if (this.isHtml) return this.plugin.readCurrentHtml(this.view.file, scope);
    if (!this.isPdf) return this.plugin.readMarkdownView(this.view, scope, this.selection);
    const file = this.view.file;
    if (scope === 'entire') return this.plugin.readCurrentPdf(file);
    const context = this.selection || this.plugin.getPdfSelectionForFile(file);
    if (!context || context.filePath !== file.path || context.fileMtime !== file.stat?.mtime) {
      new Notice(this.t('Select text in this PDF first.', '请先在此 PDF 中选中文字。')); return;
    }
    if (scope === 'from-selection') return this.plugin.readCurrentPdf(file, { selectionContext: context });
    return this.plugin.startReading(context.selectedText, `${file.basename || file.name || 'PDF'} (PDF selection)`, { file });
  }
  refreshOutline() {
    if (this.isPdf || this.isWeb) {
      this.outlinePath = this.view.file?.path; this.entries = []; this.selection = null;
      this.outline.hidden = true; this.render(); return;
    }
    const text = this.view.editor?.getValue() || '', file = this.view.file;
    const old = this.heading.value === '' ? null : this.entries?.[Number(this.heading.value)];
    this.outlineText = text; this.outlinePath = file?.path;
    this.outlineDoc = this.isHtml ? getHtmlReaderDocument(this.view) : null;
    this.outlineMtime = file?.stat?.mtime;
    this.entries = this.isHtml ? captureHtmlOutline(this.outlineDoc)
      : outlineSections(text, this.plugin.app.metadataCache?.getFileCache(file)?.headings);
    this.heading.replaceChildren();
    const empty = node(this.heading, 'option'); empty.value = ''; empty.textContent = this.t('Choose a heading', '选择章节');
    this.entries.forEach((entry, index) => {
      const option = node(this.heading, 'option'); option.value = String(index);
      option.textContent = `${'\u00a0\u00a0'.repeat(entry.level - 1)}${entry.title}${entry.inferred ? this.t(' (detected)', '（自动识别）') : ''}`;
    });
    const previous = old ? this.entries.findIndex(entry => entry.from === old.from && entry.title === old.title) : -1;
    this.heading.value = previous < 0 ? '' : String(previous);
    this.selection = null; this.render();
  }
  chosenHeading() {
    if (this.heading.value === '') return null;
    if (this.isHtml) {
      const entry = this.entries[Number(this.heading.value)], doc = getHtmlReaderDocument(this.view);
      if (doc !== this.outlineDoc || this.view.file?.path !== this.outlinePath || this.view.file?.stat?.mtime !== this.outlineMtime
        || !entry?.element?.isConnected || entry.element.textContent.replace(/\s+/g, ' ').trim() !== entry.title) {
        this.refreshOutline(); new Notice(this.t('HTML changed. Choose the section again.', 'HTML 已变化，请重新选择章节。')); return null;
      }
      return entry;
    }
    if (this.view.file?.path !== this.outlinePath || this.view.editor.getValue() !== this.outlineText) {
      this.refreshOutline(); new Notice(this.t('The note changed. Choose the section again.', '笔记已变化，请重新选择章节。')); return null;
    }
    return this.entries[Number(this.heading.value)] || null;
  }
  locateHeading() {
    const heading = this.chosenHeading(); if (!heading) return;
    if (this.isHtml) { heading.element.scrollIntoView({ block: 'start' }); this.render(); return; }
    if (this.view.getMode?.() === 'preview') this.view.previewMode?.applyScroll(heading.line);
    else {
      const from = this.view.editor.offsetToPos(heading.from);
      this.view.editor.scrollIntoView({ from, to: from }, true);
    }
    this.render();
  }
  readHeading(continueReading) {
    const heading = this.chosenHeading(); if (!heading) return;
    if (this.isHtml) {
      const text = htmlSectionText(this.outlineDoc, heading, captureHtmlOutline(this.outlineDoc), continueReading);
      return this.plugin.startReading(text, heading.title, { file: this.view.file, sourceKind: 'html', plainText: true });
    }
    const sourceText = this.outlineText, file = this.view.file;
    return this.plugin.startReading(sourceText.slice(heading.from, continueReading ? undefined : heading.to), heading.title, {
      file, sourceKind: 'markdown', sourceText, sourceOffset: heading.from,
    });
  }
  seek(progress) {
    const session = this.plugin.activeSession, count = session?.chunks?.length;
    if (!count || session.kind === 'audio-export') return;
    const target = Math.min(count - 1, Math.max(0, Math.floor(progress * count)));
    const current = Math.max(0, (this.plugin.readerState.currentChunk || 1) - 1);
    if (target !== current) this.plugin.jumpToAdjacentChunk(target - current);
    else this.plugin.seekCurrentSegmentToTime(0);
  }
  render() {
    const state = this.plugin.readerState || {}, session = this.plugin.activeSession;
    const exporting = session?.kind === 'audio-export';
    for (const [element, en, zh, type] of this.labels) {
      const label = this.t(en, zh);
      if (type === 'text') element.textContent = label;
      else { element.removeAttribute('title'); element.setAttribute('aria-label', label); }
    }
    this.root.setAttribute('aria-label', this.t('Reading toolbar', '朗读工具栏'));
    const playIcon = state.isPaused ? 'play' : session ? 'pause' : 'play';
    if (this.play.dataset.icon !== playIcon) { setIcon(this.play, playIcon); this.play.dataset.icon = playIcon; }
    const playTitle = session ? state.isPaused ? this.t('Resume (Space)', '继续（空格）') : this.t('Pause (Space)', '暂停（空格）') : this.t('Read file', '朗读全文');
    this.play.setAttribute('aria-label', playTitle);
    if (session && !exporting) this.play.setAttribute('aria-keyshortcuts', 'Space');
    else this.play.removeAttribute('aria-keyshortcuts');
    this.play.disabled = Boolean(session && !state.canPause);
    this.stop.disabled = !state.canStop || exporting;
    this.previous.disabled = !state.canPreviousChunk || exporting;
    this.next.disabled = !state.canNextChunk || exporting;
    this.back.disabled = this.forward.disabled = (!state.canSeek && !session?.seekTarget) || exporting;
    this.progress.disabled = !(state.canSeek || state.canNextChunk || state.canPreviousChunk) || exporting;
    if (!this.scrubbing) this.progress.value = String(Math.round((state.progress || 0) * 1000));
    this.progress.setAttribute('aria-description', this.t('Jump to a segment; unprepared audio requires synthesis.', '跳转到分段；未准备的音频需要等待合成。'));
    this.progress.setAttribute('aria-label', this.t('Overall progress', '整体进度'));
    this.speed.setAttribute('aria-label', this.t('Playback speed', '播放倍速'));
    if (this.root.ownerDocument.activeElement !== this.speed) {
      const value = String(this.plugin.settings.playbackSpeed || 1);
      if (![...this.speed.options].some(option => option.value === value)) { const option = node(this.speed, 'option'); option.value = value; option.textContent = `${value}x`; }
      this.speed.value = value;
    }
    this.volume.setAttribute('aria-label', this.t('Volume', '音量'));
    if (this.root.ownerDocument.activeElement !== this.volume) this.volume.value = String(Math.round((this.plugin.settings.playbackVolume ?? 1) * 100));
    this.heading.setAttribute('aria-label', this.t('Outline section', '大纲章节'));
    if (this.heading.options[0]) this.heading.options[0].textContent = this.t('Choose a heading', '选择章节');
    this.scope.setAttribute('aria-label', this.t('Reading scope', '朗读范围'));
    const scopeLabel = this.scope.value === 'selection' ? this.t('Read selected text', '朗读选中文字')
      : this.scope.value === 'from-selection' ? this.t('Read from selection', '从选中位置开始朗读')
      : this.t('Read entire document', '朗读全文');
    this.readScope.setAttribute('aria-label', scopeLabel);
    this.section.disabled = this.fromSection.disabled = this.heading.value === '' || exporting;
    this.readScope.disabled = this.exportButton.disabled = Boolean(exporting);
    this.chatButton.hidden = this.plugin.settings.copilotChatEnabled === false;
    this.chatButton.disabled = Boolean(exporting);
    const timing = this.plugin.getSegmentTiming?.() || { current: 0 };
    const estimate = estimatePlayback(session, Math.max(0, (state.currentChunk || 1) - 1), timing.current,
      session?.speechEngine === 'system-tts' ? 1 : this.plugin.settings.speed, this.plugin.settings.playbackSpeed);
    this.time.textContent = estimate ? `${this.t('Remaining ~', '剩余约 ')}${formatDuration(estimate.remaining)}` : `${state.currentChunk || 0} / ${state.totalChunks || 0}`;
    const source = session?.markdownSource, ranges = source && source.filePath === this.view.file?.path
      ? currentSourceRanges(source, { index: session.currentChunkIndex }) : [];
    const current = ranges.length ? [...(this.entries || [])].reverse().find(heading => heading.from <= ranges[0].from) : null;
    this.status.textContent = state.error || (session ? [session.sourceLabel, current?.title, `${state.currentChunk || 0} / ${state.totalChunks || 0}`].filter(Boolean).join(' · ') : '');
    this.status.hidden = !this.status.textContent;
  }
  destroy() {
    this.root.ownerDocument.removeEventListener('keydown', this.documentKeydown);
    this.root.remove(); this.selection = null; this.outlineText = ''; this.entries = [];
  }
}

class NativeToolbarManager {
  constructor(plugin) { this.plugin = plugin; this.toolbars = new Map(); this.actions = new Map(); }
  sync() {
    const views = new Set(['markdown', 'pdf', 'html-view', 'webviewer'].flatMap(type => this.plugin.app.workspace.getLeavesOfType(type).map(leaf => leaf.view)));
    for (const [view, toolbar] of this.toolbars) if (!views.has(view)) { toolbar.destroy(); this.toolbars.delete(view); }
    for (const [view, action] of this.actions) if (!views.has(view)) { action.remove(); this.actions.delete(view); }
    for (const view of views) if (!this.actions.has(view) && typeof view.addAction === 'function') {
      const action = view.addAction('audio-lines', 'Reading toolbar', () => this.toggle(view));
      this.actions.set(view, action);
    }
    for (const [view, toolbar] of this.toolbars) if (toolbar.outlinePath !== view.file?.path) toolbar.refreshOutline();
    this.render();
  }
  toggle(view) {
    if ((!view?.editor && !['pdf', 'html-view', 'webviewer'].includes(view?.getViewType?.()) && view?.file?.extension !== 'pdf') || !view.contentEl?.parentElement) return;
    const old = this.toolbars.get(view);
    if (old) { old.destroy(); this.toolbars.delete(view); }
    else this.toolbars.set(view, new NativeReaderToolbar(this.plugin, view, () => this.toggle(view)));
    this.render();
  }
  render() {
    for (const toolbar of this.toolbars.values()) toolbar.render();
    for (const [view, action] of this.actions) {
      const title = this.plugin.settings.settingsLanguage === 'chinese' ? '朗读工具栏' : 'Reading toolbar';
      action.setAttribute('aria-label', title); action.removeAttribute('title');
      action.setAttribute('aria-pressed', String(this.toolbars.has(view)));
    }
  }
  changed(file) { for (const [view, toolbar] of this.toolbars) if (!file || view.file?.path === file.path) toolbar.refreshOutline(); }
  invalidate(editor) {
    for (const [view, toolbar] of this.toolbars) if (view.editor === editor) {
      toolbar.outlineText = null; toolbar.entries = []; toolbar.heading.value = '';
      toolbar.selection = null; toolbar.render();
    }
  }
  destroy() {
    for (const toolbar of this.toolbars.values()) toolbar.destroy();
    for (const action of this.actions.values()) action.remove();
    this.toolbars.clear(); this.actions.clear();
  }
}

module.exports = { NativeReaderToolbar, NativeToolbarManager };
