'use strict';

const { compact, currentSourceRanges, sourceLineStarts, markdownReadingHighlight } = require('./markdown-source');
const { extractHtmlTreeText } = require('./html-text');

function installNoteHighlights(plugin) {
  const { editorInfoField, MarkdownRenderChild, Notice } = require('obsidian');
  const { StateEffect } = require('@codemirror/state');
  const { Decoration, EditorView, ViewPlugin } = require('@codemirror/view');
  const refresh = StateEffect.define(), editors = new Set(), previews = new Set();
  let disposed = false;
  let cachedSource, cachedSession, cachedKey, cachedData;
  const warnedSessions = new WeakSet();
  function changed(data, path, text) {
    const session = plugin.activeSession;
    if (!data || !session || path !== data.source.filePath || typeof text !== 'string' || text === data.source.text
      || warnedSessions.has(session)) return;
    warnedSessions.add(session);
    new Notice(plugin.settings.settingsLanguage === 'chinese'
      ? '笔记内容已变化，原文高亮已暂停。重新开始朗读后恢复；当前音频仍使用修改前的文本。'
      : 'The note has changed. Source highlighting is paused until reading restarts; current audio uses the earlier text.', 7000);
  }
  const controller = {
    selectionOffsets(view, range) {
      const text = view.editor.getValue();
      const boundary = (node, offset) => {
        if (node.nodeType !== 3) return null;
        for (const preview of previews) {
          if (!preview.containerEl.contains(node) || preview.context.sourcePath !== view.file?.path) continue;
          const section = preview.context.getSectionInfo(preview.containerEl);
          if (section?.text !== text) continue;
          const lines = text.split('\n');
          const from = lines.slice(0, section.lineStart).reduce((sum, line) => sum + line.length + 1, 0);
          const raw = lines.slice(section.lineStart, section.lineEnd + 1).join('\n');
          const value = node.nodeValue || '', index = raw.indexOf(value);
          if (value && index >= 0 && raw.indexOf(value, index + 1) < 0) return from + index + offset;
        }
        return null;
      };
      return { start: boundary(range.startContainer, range.startOffset), end: boundary(range.endContainer, range.endOffset) };
    },
    update() {
      if (disposed) return;
      for (const editor of editors) editor.refresh();
      for (const preview of previews) preview.refresh();
    },
    resetFollowing() { for (const target of [...editors, ...previews]) target.manualScroll = false; },
    dispose() {
      disposed = true;
      for (const editor of editors) editor.view.dispatch({ effects: [refresh.of(null)] });
      for (const preview of previews) preview.clear();
      previews.clear(); editors.clear();
      cachedData = cachedSource = cachedSession = null;
    },
  };
  function current() {
    const session = plugin.activeSession, source = session?.markdownSource;
    const highlight = plugin.getCurrentReadingHighlight();
    if (disposed || !source || !highlight || plugin.settings.readingHighlight === 'off') {
      cachedData = cachedSource = cachedSession = null; return null;
    }
    const selected = markdownReadingHighlight(session, highlight, plugin.settings);
    const key = JSON.stringify(selected);
    if (cachedData && cachedSource === source && cachedSession === session && cachedKey === key) return cachedData;
    cachedSource = source; cachedSession = session; cachedKey = key;
    return cachedData = { source, ranges: currentSourceRanges(source, selected) };
  }
  function follow(target, node) {
    if (!node || target.manualScroll || !plugin.settings.readingFollow) return;
    const scroller = node.closest('.markdown-preview-view') || node.parentElement;
    const bounds = node.getBoundingClientRect(), visible = scroller.getBoundingClientRect();
    if (bounds.top < visible.top || bounds.bottom > visible.bottom) node.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  const extension = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view; this.decorations = Decoration.none; this.key = ''; editors.add(this); this.rebuild();
    }
    update(update) {
      if (update.docChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refresh)))) this.rebuild();
    }
    refresh() {
      const data = current(), info = this.view.state.field(editorInfoField, false);
      if (this.document !== this.view.state.doc) {
        this.document = this.view.state.doc; this.text = this.document.toString();
      }
      const ranges = info?.file?.path === data?.source.filePath && this.text === data?.source.text ? data.ranges : [];
      changed(data, info?.file?.path, this.text);
      const key = JSON.stringify(ranges);
      if (this.key === key) return;
      this.key = key;
      const effects = [refresh.of(ranges)];
      if (ranges.length && plugin.settings.readingFollow && !this.manualScroll) {
        const bounds = this.view.coordsAtPos?.(ranges[0].from), visible = this.view.scrollDOM?.getBoundingClientRect();
        if (bounds && visible && (bounds.top < visible.top || bounds.bottom > visible.bottom))
          effects.push(EditorView.scrollIntoView(ranges[0].from, { y: 'center' }));
      }
      this.view.dispatch({ effects });
    }
    rebuild() {
      const data = current(), info = this.view.state.field(editorInfoField, false);
      if (this.document !== this.view.state.doc) {
        this.document = this.view.state.doc; this.text = this.document.toString();
      }
      const matches = info?.file?.path === data?.source.filePath && this.text === data?.source.text;
      changed(data, info?.file?.path, this.text);
      const ranges = matches ? data.ranges : [];
      const marks = [], lines = new Set();
      for (const range of ranges.filter(range => range.to > range.from)) {
        marks.push(Decoration.mark({ class: range.sentence ? 'note-reader-note-sentence' : 'note-reader-note-segment' }).range(range.from, range.to));
        if (range.sentence || range.partial) continue;
        // Line decorations remain visible around Live Preview replacement widgets.
        let line = this.view.state.doc.lineAt(range.from);
        while (line.from < range.to) {
          if (!lines.has(line.from)) {
            lines.add(line.from);
            marks.push(Decoration.line({ class: 'note-reader-note-line' }).range(line.from));
          }
          if (line.to >= range.to || line.to >= this.view.state.doc.length) break;
          line = this.view.state.doc.lineAt(line.to + 1);
        }
      }
      this.decorations = Decoration.set(marks, true);
    }
    destroy() { editors.delete(this); }
  }, {
    decorations: value => value.decorations,
    eventHandlers: {
      wheel() { this.manualScroll = true; }, touchmove() { this.manualScroll = true; },
      pointerdown() { this.manualScroll = true; },
      keydown(event) { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) this.manualScroll = true; },
    },
  });
  plugin.registerEditorExtension(extension);
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (element.closest('.note-reader-document')) return;
    class PreviewHighlight extends MarkdownRenderChild {
      onload() {
        this.context = context;
        this.marked = new Set();
        previews.add(this);
        const scroller = element.closest('.markdown-preview-view');
        for (const event of ['wheel', 'touchmove', 'pointerdown']) if (scroller) this.registerDomEvent(scroller, event, () => { this.manualScroll = true; }, { passive: true });
        this.refresh();
      }
      clear() {
        for (const node of this.marked) node.classList.remove('note-reader-note-segment', 'note-reader-note-sentence');
        this.marked.clear();
      }
      refresh() {
        const data = current(), section = context.getSectionInfo(element);
        const matches = data && context.sourcePath === data.source.filePath && section?.text === data.source.text;
        changed(data, context.sourcePath, section?.text);
        const starts = matches ? sourceLineStarts(data.source) : [];
        const from = starts[section?.lineStart], to = starts[(section?.lineEnd ?? -1) + 1] ?? section?.text.length;
        const nodes = new Set();
        if (matches && data.ranges.some(range => range.from < to && range.to > from)) {
          const items = [...(element.matches('li') ? [element] : []), ...element.querySelectorAll('li')];
          if (!items.length) nodes.add(element);
          else {
            const blocks = data.source.blocks.filter(block => block.kind === 'list' && block.from >= from && block.to <= to);
            // Preserve list order, including repeated items. A renderer mismatch
            // leaves that item unmarked instead of tinting the entire list.
            if (blocks.length === items.length) {
              if (this.listSource !== data.source || this.listFrom !== from || this.listTo !== to
                || items.some((item, i) => this.listItems?.[i] !== item || this.listRaw?.[i] !== item.textContent)) {
                this.listSource = data.source; this.listFrom = from; this.listTo = to; this.listItems = items;
                this.listRaw = items.map(item => item.textContent);
                this.listText = items.map(item => compact(extractHtmlTreeText(item, null, {
                  omitNode: node => node !== item && ['UL','OL'].includes(node.tagName),
                }).text));
              }
              blocks.forEach((block, i) => {
                if (this.listText[i] !== block.speech || !data.ranges.some(range => range.from < block.to && range.to > block.from)) return;
                const item = items[i], ownParagraph = item.querySelector(':scope > p');
                if (!item.querySelector('ul,ol')) nodes.add(item);
                else if (ownParagraph) nodes.add(ownParagraph);
              });
            }
          }
        }
        let firstNew;
        for (const node of this.marked) if (!nodes.has(node)) node.classList.remove('note-reader-note-segment');
        for (const node of nodes) {
          if (!this.marked.has(node)) firstNew ||= node;
          node.classList.add('note-reader-note-segment');
        }
        this.marked = nodes;
        if (firstNew) follow(this, firstNew);
      }
      onunload() { this.clear(); previews.delete(this); }
    }
    context.addChild(new PreviewHighlight(element));
  });
  // Register existing reading panes once; never rerender them on audio time updates.
  for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) if (leaf.view.getMode?.() === 'preview') leaf.view.previewMode?.rerender?.(true);
  return controller;
}

module.exports = { installNoteHighlights };
