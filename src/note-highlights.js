'use strict';

const { currentSourceRanges } = require('./markdown-source');

function installNoteHighlights(plugin) {
  const { editorInfoField, MarkdownRenderChild } = require('obsidian');
  const { StateEffect } = require('@codemirror/state');
  const { Decoration, EditorView, ViewPlugin } = require('@codemirror/view');
  const refresh = StateEffect.define(), editors = new Set(), previews = new Set();
  let disposed = false;
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
    },
  };
  function current() {
    const source = plugin.activeSession?.markdownSource;
    const highlight = plugin.getCurrentReadingHighlight();
    if (disposed || !source || !highlight || plugin.settings.readingHighlight === 'off') return null;
    const sentence = plugin.settings.readingHighlight === 'sentence' && highlight.sentence;
    const selected = sentence ? { ...sentence, text: plugin.activeSession.chunks[highlight.index].slice(sentence.start, sentence.end).trim() } : null;
    return { source, ranges: currentSourceRanges(source, { ...highlight, sentence: selected }) };
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
      const key = JSON.stringify(ranges);
      if (this.key === key) return;
      this.key = key;
      const effects = [refresh.of(ranges)];
      if (ranges.length && plugin.settings.readingFollow && !this.manualScroll) effects.push(EditorView.scrollIntoView(ranges[0].from, { y: 'center' }));
      this.view.dispatch({ effects });
    }
    rebuild() {
      const data = current(), info = this.view.state.field(editorInfoField, false);
      const matches = info?.file?.path === data?.source.filePath && this.view.state.doc.toString() === data?.source.text;
      const ranges = matches ? data.ranges : [];
      const marks = [], lines = new Set();
      for (const range of ranges.filter(range => range.to > range.from)) {
        marks.push(Decoration.mark({ class: range.sentence ? 'note-reader-note-sentence' : 'note-reader-note-segment' }).range(range.from, range.to));
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
        previews.add(this);
        const scroller = element.closest('.markdown-preview-view');
        for (const event of ['wheel', 'touchmove', 'pointerdown']) if (scroller) this.registerDomEvent(scroller, event, () => { this.manualScroll = true; }, { passive: true });
        this.refresh();
      }
      clear() { element.classList.remove('note-reader-note-segment', 'note-reader-note-sentence'); }
      refresh() {
        const data = current(), section = context.getSectionInfo(element);
        const matches = data && context.sourcePath === data.source.filePath && section?.text === data.source.text;
        const starts = matches ? [0] : [];
        if (matches) for (let index = 0; index < section.text.length; index++) if (section.text[index] === '\n') starts.push(index + 1);
        const from = starts[section?.lineStart], to = starts[(section?.lineEnd ?? -1) + 1] ?? section?.text.length;
        const marked = matches && data.ranges.some(range => range.from < to && range.to > from);
        const wasMarked = element.classList.contains('note-reader-note-segment');
        element.classList.toggle('note-reader-note-segment', Boolean(marked));
        if (marked && !wasMarked) follow(this, element);
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
