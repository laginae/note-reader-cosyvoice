'use strict';

const { currentSourceRanges } = require('./markdown-source');
const { getHtmlReaderDocument } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const { getWebPageUrl, updateWebHighlight } = require('./web-page');
const { academicOptions } = require('./academic-speech');
const { htmlReadingTarget } = require('./html-highlights');

async function locateReading(plugin) {
  const session = plugin.activeSession;
  if (!session || session.kind === 'audio-export') return 'unavailable';
  const index = session.currentChunkIndex;
  if (!Number.isInteger(index) || !session.chunks?.[index]) return 'unavailable';
  const workspace = plugin.app.workspace;
  const current = () => plugin.activeSession === session && session.currentChunkIndex === index;
  const options = { text: session.chunks[index], locateOnly: true,
    academic: academicOptions(session.synthesisSettings || plugin.settings) };
  if (['html', 'web'].includes(session.sourceKind)) {
    const highlight = plugin.getCurrentReadingHighlight?.();
    if (highlight?.index === index) options.text = htmlReadingTarget(session, highlight, plugin.settings).text;
  }
  if (session.sourceKind === 'web') {
    const c = session.webContext, view = c?.webView;
    const valid = () => current() && view && plugin.getWebPageLeaves().some(leaf => leaf.view === view)
      && getWebPageUrl(view) === c.webUrl && view.webview === c.webElement && view.mode === c.webMode
      && plugin.getWebPageState(view).revision === c.webRevision;
    if (!valid()) return 'changed';
    await workspace.revealLeaf(plugin.getWebPageLeaves().find(leaf => leaf.view === view));
    if (!valid()) return 'changed';
    if (await updateWebHighlight(view, { ...options, url: c.webUrl })) return 'located';
    if (valid() && options.text !== session.chunks[index]
      && await updateWebHighlight(view, { ...options, text: session.chunks[index], url: c.webUrl })) return 'segment';
    return 'unmatched';
  }
  const file = plugin.app.vault.getAbstractFileByPath(session.filePath);
  if (!file || (session.fileMtime && file.stat?.mtime !== session.fileMtime)) return 'changed';
  const type = { markdown: 'markdown', pdf: 'pdf', html: 'html-view' }[session.sourceKind];
  if (!type) return 'unavailable';
  let leaf = workspace.getLeavesOfType(type).find(leaf => leaf.view.file?.path === session.filePath);
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.openFile(file);
  }
  await workspace.revealLeaf(leaf);
  if (!current() || leaf.view.file?.path !== session.filePath) return 'changed';
  const view = leaf.view;
  if (type === 'markdown') {
    const source = session.markdownSource;
    if (!source || view.editor?.getValue() !== source.text) return 'changed';
    const range = currentSourceRanges(source, { index })[0];
    if (!range) return 'unmatched';
    const from = view.editor.offsetToPos(range.from);
    if (view.getMode?.() === 'preview') {
      if (!view.previewMode?.applyScroll) return 'unmatched';
      view.previewMode.applyScroll(from.line);
    } else view.editor.scrollIntoView({ from, to: view.editor.offsetToPos(range.to) }, true);
    return 'located';
  }
  if (type === 'html-view') options.speechTransform = text => plugin.prepareHtmlSpeechText(text, session.synthesisSettings || plugin.settings);
  // Reopened PDF/HTML views can mount their content after revealLeaf resolves.
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!current() || view.file?.path !== session.filePath || (session.fileMtime && view.file?.stat?.mtime !== session.fileMtime)) return 'changed';
    if (type === 'html-view') {
      const doc = getHtmlReaderDocument(view);
      const exact = doc && highlightDocument(doc, options);
      const fallback = !exact && doc && options.text !== session.chunks[index]
        && highlightDocument(doc, { ...options, text: session.chunks[index] });
      if (exact || fallback) {
        if (plugin.settings.readingHighlight !== 'off' && plugin.settings.webReadingHighlight !== false) {
          if (plugin.htmlHighlights) {
            plugin.htmlHighlights.update();
          }
        }
        return fallback ? 'segment' : 'located';
      }
      // A loaded document that does not match will not improve by scanning it
      // eight times. Only wait for an iframe that has not mounted yet.
      if (doc?.body?.textContent?.trim()) return 'unmatched';
    } else {
      const number = session.chunkPageNumbers?.[index];
      if (!Number.isInteger(number)) return 'unmatched';
      const page = (view.contentEl || view.containerEl)?.querySelector(`[data-page-number="${number}"]`);
      if (page) {
        page.scrollIntoView({ block: 'start', behavior: 'auto' });
        plugin.pdfHighlights?.update();
        const mark = page.querySelector('.note-reader-pdf-rectangle, .note-reader-pdf-current');
        if (mark) { mark.scrollIntoView({ block: 'center', behavior: 'auto' }); return 'located'; }
        if (attempt === 7) return 'page';
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return 'unmatched';
}

module.exports = { locateReading };
