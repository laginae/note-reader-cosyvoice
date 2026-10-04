'use strict';

const { ItemView, Modal, Setting, Notice, MarkdownRenderer, Component, setIcon } = require('obsidian');
const os = require('os');
const { startSystemNarrator } = require('./system-tts');
const { normalizeReadingHighlight, sentenceRanges } = require('./reading-highlights');
const { compact, readingMarkdown } = require('./markdown-source');
const { readerRange, extractReaderSelection } = require('./reader-selection');

const DOCUMENT_VIEW_TYPE = 'note-reader-accessible-document';

function element(parent, tag, className, text) {
  const node = parent.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

class NarratorStartModal extends Modal {
  constructor(app, chinese, start) { super(app); this.chinese = chinese; this.start = start; }
  onOpen() {
    const t = (en, zh) => this.chinese ? zh : en;
    this.titleEl.setText(t('System Narrator', '系统讲述人'));
    this.contentEl.createEl('p', { text: t(
      'Uses the voice chosen in Windows Narrator settings, including installed natural voices. It does not call a TTS API or export audio.',
      '使用 Windows 讲述人设置中选择的音色，包括已安装的自然音色；不调用语音 API，也不导出音频。') });
    this.contentEl.createEl('p', { text: t(
      'Choose a starting paragraph in the document. Narrator key (Caps Lock or Insert) + R reads from the current position; Ctrl stops speech; Narrator key + Esc exits. The plugin pause and seek controls do not control Narrator.',
      '在正文中选择起始段落。讲述人键（Caps Lock 或 Insert）+ R 从当前位置阅读；Ctrl 停止说话；讲述人键 + Esc 退出。插件的暂停和跳转按钮不能控制讲述人。') });
    new Setting(this.contentEl).addButton(button => button.setButtonText(t('Cancel', '取消')).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t('Start Narrator', '启动讲述人')).setCta().onClick(() => {
        this.close(); void this.start();
      }));
  }
  onClose() { this.contentEl.empty(); }
}

class AccessibleReaderView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf); this.plugin = plugin; this.nodes = []; this.focusedIndex = 0;
  }
  t(en, zh) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  getViewType() { return DOCUMENT_VIEW_TYPE; }
  getDisplayText() { return this.t('Focus reading', '专注朗读'); }
  getIcon() { return 'book-open'; }
  async onOpen() { this.closed = false; this.build(); this.plugin.registerDocumentView(this); }
  async onClose() {
    clearTimeout(this.renderTimer); this.closed = true;
    this.body?.ownerDocument.removeEventListener('selectionchange', this.selectionListener);
    this.selectionRange = null; this.focusedParagraph = null;
    this.markdownComponent?.unload(); this.markdownComponent = null;
    this.markdownGeneration = (this.markdownGeneration || 0) + 1;
    this.plugin.unregisterDocumentView(this);
    this.contentEl.replaceChildren(); this.nodes = []; this.model = null;
    this.renderingMarkdownSource = null; this.renderedBlocks = []; this.markedParagraphs = [];
    this.markedParagraph = null; this.markedSpans = [];
    this.body = null; this.scroller = null; this.heading = null;
  }
  createIconButton(parent, icon, title, action) {
    const button = element(parent, 'button', 'clickable-icon');
    button.type = 'button'; button.setAttribute('aria-label', title);
    setIcon(button, icon); button.addEventListener('click', () => void action());
    button.addEventListener('pointerdown', event => {
      if (event.button === 0) { this.captureSelection(); event.preventDefault(); }
    });
    return button;
  }
  build() {
    const root = this.contentEl;
    root.replaceChildren(); root.classList.add('note-reader-document');
    const toolbar = element(root, 'div', 'note-reader-document-toolbar');
    this.exitButton = this.createIconButton(toolbar, 'arrow-left', this.t('Exit focus reading', '退出专注朗读'),
      () => this.plugin.toggleDocumentView());
    this.reloadButton = this.createIconButton(toolbar, 'refresh-cw', this.t('Load current document', '载入当前文档'),
      () => this.plugin.runUserAction('Reading text', () => this.plugin.activateDocumentView({ reload: true })));
    this.readButton = this.createIconButton(toolbar, 'list-start', this.t('Read from selection', '从选中位置朗读'),
      () => this.plugin.runUserAction('Read from selection', () => this.plugin.readDocumentSelection(this, 'from-selection')));
    this.selectionButton = this.createIconButton(toolbar, 'text-cursor-input', this.t('Read selection', '朗读选中文字'),
      () => this.plugin.runUserAction('Read selection', () => this.plugin.readDocumentSelection(this, 'selection')));
    this.controlsButton = this.createIconButton(toolbar, 'sliders-horizontal', this.t('Reader controls', '朗读控制面板'),
      () => this.plugin.activateControlView());
    const highlightLabel = this.highlightLabel = element(toolbar, 'label', 'note-reader-document-option', this.t('Highlight ', '标记 '));
    this.highlightSelect = element(highlightLabel, 'select');
    this.highlightSelect.setAttribute('aria-label', this.t('Reading highlight', '朗读标记'));
    for (const [value, en, zh] of [['off', 'Off', '关闭'], ['segment', 'Segment', '当前段'], ['sentence', 'Sentence if available', '句子（如支持）']]) {
      const option = element(this.highlightSelect, 'option', '', this.t(en, zh)); option.value = value;
    }
    this.highlightSelect.addEventListener('change', () => {
      this.plugin.settings.readingHighlight = this.highlightSelect.value;
      void this.plugin.runUserAction('Highlight', async () => { await this.plugin.saveSettings(); this.render(); });
    });
    const followLabel = element(toolbar, 'label', 'note-reader-document-option');
    this.followInput = element(followLabel, 'input'); this.followInput.type = 'checkbox';
    this.followLabel = element(followLabel, 'span', '', this.t('Follow', '跟随'));
    this.followInput.addEventListener('change', () => {
      this.manualScroll = false; this.plugin.settings.readingFollow = this.followInput.checked;
      void this.plugin.runUserAction('Follow reading', async () => { await this.plugin.saveSettings(); this.lastHighlight = ''; this.render(); });
    });
    this.narratorButton = this.createIconButton(toolbar, 'accessibility', this.t('Start Windows Narrator', '启动 Windows 讲述人'), () => this.startNarrator());
    this.narratorButton.hidden = os.platform() !== 'win32';
    this.status = element(root, 'div', 'note-reader-document-status');
    this.scroller = element(root, 'div', 'note-reader-document-scroll');
    this.heading = element(this.scroller, 'h2', 'note-reader-document-title');
    this.body = element(this.scroller, 'div', 'note-reader-document-body markdown-rendered');
    this.body.setAttribute('role', 'document');
    this.body.setAttribute('aria-label', this.t('Focus reading', '专注朗读'));
    this.body.setAttribute('aria-live', 'off');
    this.selectionListener = () => this.captureSelection();
    this.body.ownerDocument.addEventListener('selectionchange', this.selectionListener);
    const stopFollowing = () => {
      this.manualScroll = true; this.followInput.checked = false;
    };
    this.scroller.addEventListener('wheel', stopFollowing, { passive: true });
    this.scroller.addEventListener('touchmove', stopFollowing, { passive: true });
    this.scroller.addEventListener('pointerdown', stopFollowing);
    this.scroller.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) stopFollowing();
    });
  }
  captureSelection() {
    if (!this.body || this.closed) return;
    const range = readerRange(this.body);
    if (range) {
      this.selectionRange = range;
      this.plugin.lastDocumentView = this; this.plugin.lastReadableSource = 'document';
    } else {
      const selection = this.body.ownerDocument.getSelection?.();
      if (selection?.anchorNode && (this.body.contains(selection.anchorNode) || !selection.isCollapsed)) this.selectionRange = null;
    }
  }
  getSelectionContext() {
    this.captureSelection();
    if (this.model !== this.plugin.documentModel || this.model?.loading || this.markdownPending) return null;
    return extractReaderSelection(this.body, this.selectionRange);
  }
  async renderMarkdown(source) {
    const generation = this.markdownGeneration = (this.markdownGeneration || 0) + 1;
    this.markdownComponent?.unload();
    const component = this.markdownComponent = new Component(); component.load();
    const body = this.body;
    const rendered = element(body, 'div', 'note-reader-document-markdown');
    this.markdownPending = true;
    try {
      await MarkdownRenderer.render(this.plugin.app, readingMarkdown(source.displayText), rendered, source.filePath, component);
      if (this.closed || this.body !== body || generation !== this.markdownGeneration) return;
      this.mapRenderedBlocks(source);
      this.indexMarkdownNodes();
    } catch {
      if (!this.closed && generation === this.markdownGeneration) {
        body.replaceChildren(); this.renderedBlocks = []; this.markdownFailed = true;
      }
    } finally {
      if (!this.closed && generation === this.markdownGeneration) { this.markdownPending = false; this.render(); }
    }
  }
  mapRenderedBlocks(source) {
    let cursor = 0, matched = true;
    this.renderedBlocks = [];
    for (const paragraph of this.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,table')) {
      if (paragraph.matches('li') && paragraph.querySelector('p,li') || paragraph.matches('p') && paragraph.closest('table')) continue;
      paragraph.tabIndex = 0;
      paragraph.onfocus = () => {
        this.focusedParagraph = paragraph;
        this.focusedIndex = this.nodes.findIndex(node => node.paragraphs?.includes(paragraph));
        this.render();
      };
      const needle = compact(paragraph.textContent);
      if (!needle) continue;
      if (!source.speech.startsWith(needle, cursor)) matched = false;
      if (!matched) continue;
      const start = cursor; cursor += needle.length;
      this.renderedBlocks.push({ paragraph, start, end: cursor });
    }
  }
  indexMarkdownNodes() {
    const source = this.model?.markdownSource;
    this.nodes = (this.model?.chunks || []).map((_chunk, index) => {
      const range = (source?.displayMappingValid ?? source?.mappingValid) && source.ranges[index];
      const paragraphs = range ? (this.renderedBlocks || []).filter(block => block.start < range.end && block.end > range.start).map(block => block.paragraph) : [];
      return { paragraph: paragraphs[0], paragraphs, spans: [] };
    });
  }
  async startNarrator() {
    if (os.platform() !== 'win32') return;
    if (!this.model?.chunks.length || this.model.loading || this.model.partial) return;
    if (this.plugin.activeSession) {
      new Notice(this.t('Stop plugin playback before using Narrator.', '请先停止插件朗读，再使用讲述人。')); return;
    }
    new NarratorStartModal(this.plugin.app, this.plugin.settings.settingsLanguage === 'chinese', async () => {
      if (this.plugin.activeSession || !this.body?.isConnected) return;
      const paragraph = this.focusedParagraph || this.nodes[this.focusedIndex]?.paragraph || this.body.querySelector('[tabindex="0"]');
      paragraph?.focus();
      try { await startSystemNarrator(); }
      catch { new Notice(this.t('Unable to start Narrator. Open Windows Settings > Accessibility > Narrator.',
        '无法启动讲述人，请在 Windows 设置 → 辅助功能 → 讲述人中打开。'), 8000); }
    }).open();
  }
  render() {
    if (!this.body || this.closed) return;
    for (const [button, en, zh] of [
      [this.exitButton, 'Exit focus reading', '退出专注朗读'],
      [this.reloadButton, 'Load current document', '载入当前文档'],
      [this.readButton, 'Read from selection', '从选中位置朗读'],
      [this.selectionButton, 'Read selection', '朗读选中文字'],
      [this.controlsButton, 'Reader controls', '朗读控制面板'],
      [this.narratorButton, 'Start Windows Narrator', '启动 Windows 讲述人'],
    ]) {
      button.setAttribute('aria-label', this.t(en, zh));
    }
    this.highlightLabel.firstChild.nodeValue = this.t('Highlight ', '标记 ');
    this.followLabel.textContent = this.t('Follow', '跟随');
    this.highlightSelect.setAttribute('aria-label', this.t('Reading highlight', '朗读标记'));
    [['Off', '关闭'], ['Segment', '当前段'], ['Sentence if available', '句子（如支持）']].forEach((pair, index) => {
      this.highlightSelect.options[index].textContent = this.t(...pair);
    });
    this.body.setAttribute('aria-label', this.t('Focus reading', '专注朗读'));
    const model = this.plugin.documentModel;
    const markdownChanged = model?.markdownSource?.displayText !== this.renderingMarkdownSource?.displayText
      || model?.markdownSource?.filePath !== this.renderingMarkdownSource?.filePath;
    if (this.model !== model || markdownChanged) {
      this.selectionRange = null;
      const sameMarkdown = model?.markdownSource && this.renderingMarkdownSource
        && !markdownChanged;
      if (sameMarkdown && !this.markdownFailed) {
        if (model.markdownSource.speech !== this.renderingMarkdownSource.speech) this.mapRenderedBlocks(model.markdownSource);
        this.renderingMarkdownSource = model.markdownSource;
        this.model = model; this.indexMarkdownNodes();
      } else {
      this.markdownComponent?.unload(); this.markdownComponent = null;
      this.markdownGeneration = (this.markdownGeneration || 0) + 1;
      this.markdownPending = false; this.markdownFailed = false; this.renderedBlocks = [];
      this.body.replaceChildren(); this.nodes = []; this.model = model;
      this.renderingMarkdownSource = model?.markdownSource;
      this.markedParagraph = null; this.markedSpans = [];
      this.focusedIndex = 0; this.focusedParagraph = null; this.manualScroll = false; this.lastHighlight = '';
      this.scroller.scrollTop = 0;
      clearTimeout(this.renderTimer); this.renderTimer = null;
      if (model?.markdownSource && MarkdownRenderer?.render) void this.renderMarkdown(model.markdownSource);
      }
    }
    const chunks = model?.chunks || [];
    const nativeMarkdown = model?.markdownSource && MarkdownRenderer?.render && !this.markdownFailed;
    // Only append during progressive PDF parsing. Playback updates never replace focused DOM.
    const end = Math.min(chunks.length, this.nodes.length + 200);
    for (let i = this.nodes.length; !nativeMarkdown && i < end; i++) {
      const paragraph = element(this.body, 'p', 'note-reader-document-paragraph');
      paragraph.tabIndex = 0; paragraph.dataset.chunk = String(i);
      paragraph.addEventListener('focus', () => { this.focusedIndex = i; });
      const spans = sentenceRanges(chunks[i]).map(range => {
        const span = element(paragraph, 'span', '', chunks[i].slice(range.start, range.end));
        return { ...range, span };
      });
      this.nodes.push({ paragraph, spans });
    }
    const layingOut = this.markdownPending || this.nodes.length < chunks.length;
    if (!nativeMarkdown && layingOut && !this.renderTimer) this.renderTimer = setTimeout(() => { this.renderTimer = null; this.render(); }, 0);
    this.heading.textContent = model?.label || this.t('Focus reading', '专注朗读');
    this.highlightSelect.value = normalizeReadingHighlight(this.plugin.settings.readingHighlight);
    this.followInput.checked = this.plugin.settings.readingFollow === true && !this.manualScroll;
    this.readButton.disabled = !chunks.length || model.loading || layingOut || Boolean(model.partial);
    this.selectionButton.disabled = !chunks.length || model.loading || layingOut;
    this.narratorButton.disabled = !chunks.length || model.loading || layingOut || model.partial || Boolean(this.plugin.activeSession);
    const highlight = model?.speechSessionId === this.plugin.activeSession?.id
      ? this.plugin.getCurrentReadingHighlight() : null;
    const mode = normalizeReadingHighlight(this.plugin.settings.readingHighlight);
    this.markedParagraph?.classList.remove('is-current-segment');
    for (const paragraph of this.markedParagraphs || []) paragraph.classList.remove('is-current-segment');
    for (const span of this.markedSpans || []) span.classList.remove('is-current-sentence');
    this.markedParagraph = null; this.markedParagraphs = []; this.markedSpans = [];
    let marked = null;
    const node = mode !== 'off' && highlight ? this.nodes[highlight.index] : null;
    if (node) {
      const sentence = mode === 'sentence' && highlight.sentence;
      if (sentence) {
        for (const range of node.spans) {
          if (range.start < sentence.end && range.end > sentence.start) {
            range.span.classList.add('is-current-sentence');
            this.markedSpans.push(range.span); marked = range.span;
          }
        }
      }
      if (!marked) {
        for (const paragraph of node.paragraphs || [node.paragraph]) if (paragraph) {
          paragraph.classList.add('is-current-segment'); this.markedParagraphs.push(paragraph);
        }
        this.markedParagraph = marked = node.paragraph;
      }
    }
    this.status.textContent = model?.error || (model?.loading ? this.t('Loading text…', '正在载入正文…')
      : model?.partial ? model.speechSessionId === this.plugin.activeSession?.id
        ? this.t('Parsing remaining pages…', '正在解析后续页面…')
        : this.t('Text is incomplete. Reload to load the full document.', '正文尚未完整解析，请刷新以载入全文。')
      : layingOut ? this.t('Preparing reading text…', '正在排版正文…')
      : highlight && mode !== 'off' ? `${this.t('Segment', '当前段')} ${highlight.index + 1} / ${chunks.length} · ${this.t(
        mode === 'sentence' && highlight.sentence && !nativeMarkdown ? 'Sentence sync' : 'Segment sync',
        mode === 'sentence' && highlight.sentence && !nativeMarkdown ? '句子同步' : '段落同步')}`
      : this.t('Focus reading', '专注朗读'));
    const key = marked ? `${highlight.index}:${mode === 'sentence' ? highlight.sentence?.start ?? '' : ''}` : '';
    if (marked && key !== this.lastHighlight && this.followInput.checked) {
      const bounds = marked.getBoundingClientRect(), visible = this.scroller.getBoundingClientRect();
      if (bounds.top < visible.top || bounds.bottom > visible.bottom) marked.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    this.lastHighlight = key;
  }
}

module.exports = { AccessibleReaderView, DOCUMENT_VIEW_TYPE, NarratorStartModal };
