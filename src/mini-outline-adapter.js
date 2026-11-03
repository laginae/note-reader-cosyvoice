'use strict';
const { registerMiniOutline, headingAt } = require('./mini-outline');
const { outlineSections } = require('./reader-selection');
const { getHtmlReaderDocument } = require('./html-text');
const { captureHtmlOutline, htmlSectionText } = require('./html-outline');
const { currentSourceRanges } = require('./markdown-source');
const { pauseFollowing, kindFor } = require('./reading-follow');
const { browsingIndex, elementHeading, pdfViewer, scrollDocumentEdge } = require('./mini-outline-position');
const { htmlReadingTarget } = require('./html-highlights');
const { currentDocumentHighlightElement } = require('./dom-highlights');

async function pdfData(plugin, file, cancelled, force, cachedOnly = false) {
  if (cachedOnly) {
    const cached = plugin.pdfOutlineCache?.get(file);
    return cached ? { kind: 'pdf', entries: cached.model.entries, model: cached.model } : null;
  }
  const { PdfOutlineCache } = require('./pdf-outline-cache');
  const cache = plugin.pdfOutlineCache ||= new PdfOutlineCache();
  if (force) cache.delete(file.path);
  let cached = cache.get(file);
  if (!cached) {
    if (file.stat.size > 200 * 1024 * 1024) throw Error('PDF too large');
    const bytes = await plugin.app.vault.readBinary(file); if (cancelled()) return null;
    const { loadPdfJs } = require('obsidian'), { scanPdfOutline } = require('./pdf-outline');
    const lib = await loadPdfJs(); if (cancelled()) return null;
    const task = lib.getDocument({ data: new Uint8Array(bytes.slice(0)) }); let pdf;
    try {
      pdf = await task.promise;
      const model = await scanPdfOutline(pdf, { isCurrent: () => !cancelled() });
      if (cancelled()) return null;
      cached = { model, entries: model.entries.map(entry => ({ ...entry, enabled: true })), sourceDigest: require('crypto').createHash('sha256').update(new Uint8Array(bytes)).digest('hex') };
      cache.set(file, cached);
    } finally { try { if (pdf) await pdf.destroy(); else await task.destroy(); } catch {} }
  }
  return { kind: 'pdf', entries: cached.model.entries, model: cached.model };
}
function desktopMiniAdapter(plugin) {
  const workspace = plugin.app.workspace;
  const valid = (view, data) => view.file === data.file && view.file.stat?.mtime === data.mtime && view.file.stat?.size === data.size
    && (data.kind !== 'markdown' || view.editor?.getValue() === data.text)
    && (data.kind !== 'html' || (getHtmlReaderDocument(view) === data.doc && data.entries.every(entry => entry.element?.isConnected && entry.element.textContent.replace(/\s+/g, ' ').trim() === entry.title)));
  const adapter = {
    views: () => ['markdown', 'pdf', 'html-view'].flatMap(type => (workspace.getLeavesOfType?.(type) || []).map(leaf => leaf.view)),
    activeView: () => {
      const views = adapter.views(), active = workspace.activeLeaf?.view;
      return views.includes(active) ? active : views.find(view => view.file === plugin.getCurrentReadableFile?.());
    },
    busy: () => plugin.activeSession?.kind === 'audio-export', valid,
    playback: () => {
      const session = plugin.activeSession, state = plugin.readerState || {};
      const active = !!session && session.kind !== 'audio-export' && !['complete', 'error', 'stopped'].includes(state.status);
      return { active, session, paused: !!state.isPaused, canToggle: active && !!state.canPause,
        canStop: active && !!state.canStop, canSeek: active && (!!state.canSeek || !!session?.seekTarget), title: session?.sourceLabel };
    },
    togglePlayback: () => plugin.runUserAction('Pause or resume', () => plugin.pauseOrResume()),
    stopPlayback: () => plugin.runUserAction('Stop reading', () => plugin.stopReading()),
    seekPlaybackBy: seconds => plugin.seekCurrentAudioBySeconds(seconds),
    loadCollapsed: (view, cancelled) => adapter.load(view, cancelled, false, true),
    async load(view, cancelled, force, cachedOnly = false) {
      const file = view.file, mtime = file.stat?.mtime, size = file.stat?.size;
      const stale = () => cancelled() || view.file !== file || file.stat?.mtime !== mtime || file.stat?.size !== size;
      let data;
      if (file.extension === 'pdf') data = await pdfData(plugin, file, stale, force, cachedOnly);
      else if (/^html?$/.test(file.extension)) {
        const doc = getHtmlReaderDocument(view); data = { kind: 'html', doc, entries: captureHtmlOutline(doc) };
      } else {
        const text = view.editor?.getValue() ?? await plugin.app.vault.cachedRead(file);
        data = { kind: 'markdown', text, entries: outlineSections(text, plugin.app.metadataCache?.getFileCache(file)?.headings).map(e => ({ ...e, offset: e.from })) };
      }
      return !stale() && data ? { ...data, file, mtime, size } : null;
    },
    pauseFollow: view => pauseFollowing(plugin, kindFor(plugin, view)),
    async locateEdge(view, data, end, cancelled = () => false) {
      if (cancelled()) return;
      if (!valid(view, data)) throw Error('Changed');
      await workspace.revealLeaf?.(view.leaf);
      if (cancelled()) return;
      if (!valid(view, data)) throw Error('Changed');
      return scrollDocumentEdge(view, data, end, workspace);
    },
    async returnReading(view) {
      await workspace.revealLeaf?.(view.leaf);
      const key = { markdown: 'readingFollow', pdf: 'pdfReadingFollow', html: 'webReadingFollow' }[kindFor(plugin, view)];
      plugin.readingFollowPaused?.delete(key); plugin.followRevision = (plugin.followRevision || 0) + 1;
      await plugin.locateCurrentReading();
    },
    async locate(view, data, index) {
      if (!valid(view, data)) throw Error('Changed');
      await workspace.revealLeaf?.(view.leaf); if (!valid(view, data)) throw Error('Changed');
      const entry = data.entries[index];
      if (data.kind === 'markdown') {
        if (view.getMode?.() === 'preview') view.previewMode?.applyScroll(entry.line);
        else { const from = view.editor.offsetToPos(entry.from); view.editor.scrollIntoView({ from, to: from }, true); }
      } else if (data.kind === 'html') { if (!entry.element?.isConnected) throw Error('Changed'); entry.element.scrollIntoView({ block: 'start' }); }
      else {
        const viewer = pdfViewer(view);
        if (viewer?.scrollPageIntoView) viewer.scrollPageIntoView({ pageNumber: entry.page, destArray: [null, { name: 'XYZ' }, entry.x || 0, entry.y, null] });
        else await workspace.openLinkText(data.file.path + '#page=' + entry.page + '&offset=' + Math.round(entry.x) + ',' + Math.round(entry.y) + ',0', '', false);
      }
    },
    async read(view, data, index, remaining) {
      if (!valid(view, data) || adapter.busy()) throw Error('Changed');
      await workspace.revealLeaf?.(view.leaf); if (!valid(view, data)) throw Error('Changed');
      const entry = data.entries[index];
      if (data.kind === 'pdf') return plugin.readCurrentPdf(data.file, { outlineRange: {
        ...require('./pdf-outline').sectionRange(data.entries, index, data.model.pages, remaining), fileMtime: data.mtime, title: entry.title } });
      if (data.kind === 'html') return plugin.startReading(htmlSectionText(data.doc, entry, captureHtmlOutline(data.doc), remaining), entry.title, { file: data.file, sourceKind: 'html', plainText: true });
      return plugin.startReading(data.text.slice(entry.from, remaining ? undefined : entry.to), entry.title,
        { file: data.file, sourceKind: 'markdown', sourceText: data.text, sourceOffset: entry.from });
    },
    positions(view, data) {
      let reading = -1; const session = plugin.activeSession;
      if (session?.kind !== 'audio-export' && session?.filePath === data.file.path && (session.fileMtime == null || session.fileMtime === data.mtime)) {
        if (data.kind === 'markdown' && (session.markdownSource?.text === undefined || session.markdownSource.text === data.text)) {
          const ranges = currentSourceRanges(session.markdownSource, { index: session.currentChunkIndex });
          reading = headingAt(data.entries, ranges[0]?.from);
        } else if (data.kind === 'html' && data.doc) {
          const target = htmlReadingTarget(session, plugin.getCurrentReadingHighlight?.() || { index: session.currentChunkIndex }, plugin.settings);
          reading = elementHeading(data.entries, currentDocumentHighlightElement(data.doc, target?.text));
        } else if (data.kind === 'pdf') {
          const page = session.chunkPageNumbers?.[session.currentChunkIndex], text = data.model.pages.find(p => p.number === page)?.text || '';
          const prefix = session.chunks?.[session.currentChunkIndex]?.trim().slice(0, 80), offset = prefix ? text.indexOf(prefix) : -1;
          if (prefix?.length >= 12 && offset >= 0 && text.indexOf(prefix, offset + 1) < 0) data.entries.forEach((e, i) => { if (e.page < page || (e.page === page && e.offset <= offset)) reading = i; });
        }
      }
      return { reading, browsing: browsingIndex(view, data) };
    },
  };
  return adapter;
}
function installMiniOutline(plugin) { return registerMiniOutline(plugin, desktopMiniAdapter(plugin)); }
module.exports = { desktopMiniAdapter, installMiniOutline };
