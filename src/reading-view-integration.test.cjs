const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const loaded = { exports: {} }, notices = [];
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Setting: class {}, Notice: class { constructor(text) { notices.push(text); } } } : require(name),
  loaded, loaded.exports);
const Plugin = loaded.exports.default;
const api = loaded.exports.__test;

function fixture() {
  const plugin = Object.create(Plugin.prototype);
  plugin.settings = api.createDefaultSettings(); plugin.settings.speechEngine = 'mimo-tts';
  plugin.documentViews = new Set([{ render() {} }]);
  plugin.documentSequence = 0; plugin.readerViews = new Set();
  const leaf = {};
  plugin.app = { workspace: { getLeavesOfType: () => [leaf], revealLeaf() {} },
    get secretStorage() { assert.fail('Body text must not access API secrets'); } };
  plugin.getSpeechConfiguration = plugin.runSpeechEngine = () => assert.fail('Body text must not configure or call TTS');
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'markdown', fileName: 'Public sample',
    documentText: '# Public title\n\nFirst paragraph.\n\nSecond paragraph.' });
  return plugin;
}

test('PDF context queries are silent, including ribbon entry; explicit note actions may notify', async () => {
  const plugin = fixture();
  plugin.getCurrentReadableFile = () => ({ extension: 'pdf', path: 'public.pdf' });
  const count = notices.length;
  for (let i = 0; i < 20; i++) {
    assert.equal(plugin.getActiveMarkdownView(), null);
    assert.equal(plugin.getCurrentMarkdownContext(), null);
  }
  plugin.activateControlView = async () => {};
  for (const mode of ['sidebar', 'toolbar', 'both']) {
    plugin.settings.readerOpenMode = mode; await plugin.openPreferredReader();
  }
  assert.equal(notices.length, count);
  plugin.getActiveMarkdownView({ notify: true }); assert.equal(notices.length, count + 1);
});

test('ribbon preference opens sidebar, toolbar or both; PDF cannot use a stale note toolbar', async () => {
  const plugin = fixture(), view = { file: { path: 'public.md', extension: 'md' }, leaf: {} };
  let current = view.file, panels = 0, bars = 0;
  plugin.getActiveMarkdownView = () => view; plugin.getCurrentReadableFile = () => current;
  plugin.activateControlView = async () => { panels++; };
  plugin.nativeToolbars = { toolbars: new Map(), toggle(v) { bars++; this.toolbars.set(v, {}); } };
  await plugin.openPreferredReader(); assert.equal(panels, 1); assert.equal(bars, 0);
  plugin.settings.readerOpenMode = 'toolbar'; await plugin.openPreferredReader(); await plugin.openPreferredReader();
  assert.equal(bars, 1); assert.equal(panels, 1);
  plugin.settings.readerOpenMode = 'both'; await plugin.openPreferredReader(); assert.equal(panels, 2);
  current = { path: 'public.pdf' }; plugin.settings.readerOpenMode = 'toolbar'; await plugin.openPreferredReader();
  assert.equal(panels, 3); assert.equal(bars, 1);
});

test('opening body text is local and requires neither API consent nor a configured voice', async () => {
  const plugin = fixture();
  await plugin.activateDocumentView();
  assert.equal(plugin.documentModel.loading, false);
  assert.match(plugin.documentModel.chunks.join(''), /First paragraph/);
  assert.match(plugin.documentModel.chunks.join(''), /Second paragraph/);
  assert.equal(plugin.activeSession, undefined);
  assert.equal(plugin.settings.mimoConsent, false);
});

test('PDF ribbon toolbar preference targets the PDF leaf instead of a stale note', async () => {
  const plugin=fixture(), file={path:'public.pdf',extension:'pdf'};
  const view={file},leaf={view};view.leaf=leaf;
  plugin.getCurrentReadableFile=()=>file;plugin.app.workspace.getLeavesOfType=type=>type==='pdf'?[leaf]:[];
  plugin.getActiveMarkdownView=()=>assert.fail('PDF entry must not request Markdown');
  let panels=0,bars=0;
  plugin.activateControlView=async()=>panels++;
  plugin.nativeToolbars={toolbars:new Map(),toggle:v=>{bars++;plugin.nativeToolbars.toolbars.set(v,{});}};
  plugin.settings.readerOpenMode='toolbar';await plugin.openPreferredReader();assert.equal(bars,1);assert.equal(panels,0);
  plugin.settings.readerOpenMode='both';await plugin.openPreferredReader();assert.equal(bars,1);assert.equal(panels,1);
});

test('PDF body extraction has an independent cancellation guard and makes no synthesis calls', async () => {
  const plugin = fixture();
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'pdf', fileName: 'Public PDF', file: {} });
  plugin.extractPdfText = async (_file, session, options) => {
    assert.equal(plugin.activeSession, undefined);
    assert.equal(options.reportProgress, false); assert.equal(options.isCurrent(), true);
    assert.equal(session.speechStarted, true);
    return 'Public left column.\n\nPublic right column.';
  };
  await plugin.activateDocumentView();
  assert.match(plugin.documentModel.chunks.join(''), /right column/);
  assert.equal(plugin.documentExtraction, null);
});

test('newer load wins; delayed old text never replaces the current body', async () => {
  const plugin = fixture(); let resolveOld;
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'html', fileName: 'Old public HTML', file: {} });
  plugin.getHtmlFileText = () => new Promise(resolve => { resolveOld = resolve; });
  const old = plugin.activateDocumentView();
  await new Promise(resolve => setImmediate(resolve));
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'markdown', fileName: 'New public note', documentText: 'New public text.' });
  await plugin.activateDocumentView({ reload: true });
  resolveOld('Old public text.'); await old;
  assert.equal(plugin.documentModel.label, 'New public note');
  assert.equal(plugin.documentModel.chunks.join(''), 'New public text.');
});

test('active progressive playback is reused without extracting again or changing queue settings', async () => {
  const plugin = fixture();
  plugin.getCurrentAudioExportContext = () => assert.fail('Do not re-extract active playback');
  plugin.activeSession = { id: 9, chunks: [], productionComplete: false, sourceLabel: 'Public PDF', kind: 'pdf-progressive' };
  await plugin.activateDocumentView();
  const model = plugin.documentModel;
  assert.equal(model.partial, true); assert.equal(model.speechSessionId, 9);
  plugin.activeSession.chunks.push('Newly parsed public text.');
  plugin.renderDocumentViews();
  assert.equal(plugin.documentModel, model); assert.equal(model.chunks.length, 1);
  assert.equal(plugin.settings.onlinePrefetchChunks, 1);
});

test('exporting audio does not leave a body load indefinitely pending', async () => {
  const plugin = fixture(); plugin.activeSession = { kind: 'audio-export' };
  const count = notices.length;
  assert.equal(await plugin.activateDocumentView(), null);
  assert.equal(plugin.documentModel, undefined); assert.equal(notices.length, count + 1);
});

test('reopening an incomplete body after playback stops extracts the full document', async () => {
  const plugin = fixture();
  plugin.documentModel = { id: 'partial', partial: true, speechSessionId: 9, chunks: ['Partial public text.'] };
  await plugin.activateDocumentView();
  assert.notEqual(plugin.documentModel.id, 'partial');
  assert.equal(plugin.documentModel.partial, undefined);
  assert.match(plugin.documentModel.chunks.join(''), /Second paragraph/);
});

test('only the current media timeline can mark a sentence; seeks and stale audio cannot', () => {
  const plugin = fixture();
  plugin.activeSession = { id: 9, kind: 'text', currentChunkIndex: 0 };
  plugin.readerState = { phase: 'playing' };
  plugin.currentAudio = { noteReaderSessionId: 9, noteReaderChunkIndex: 0, currentTime: 3,
    playbackRate: 2, noteReaderSentenceCues: [{ start: 0, end: 5, time: 0, until: 2 }, { start: 6, end: 11, time: 2, until: 5 }] };
  assert.equal(plugin.getCurrentReadingHighlight().sentence.start, 6);
  plugin.readerState.phase = 'paused';
  assert.equal(plugin.getCurrentReadingHighlight().sentence.start, 6);
  plugin.currentAudio.currentTime = 0.5;
  assert.equal(plugin.getCurrentReadingHighlight().sentence.start, 0);
  plugin.currentAudio.noteReaderSessionId = 8;
  assert.equal(plugin.getCurrentReadingHighlight().sentence, null);
  plugin.activeSession.requestedChunkIndex = 1;
  assert.equal(plugin.getCurrentReadingHighlight(), null);
  plugin.activeSession.requestedChunkIndex = null; plugin.activeSession.seekTarget = { index: 2 };
  assert.equal(plugin.getCurrentReadingHighlight(), null);
});

test('closing the last body view releases its text and cancels pending extraction without stopping playback', () => {
  const plugin = fixture(); const view = [...plugin.documentViews][0];
  plugin.documentModel = { chunks: ['Public text.'] };
  let destroyed = 0;
  plugin.documentExtraction = { pdfLoadingTask: { destroy() { destroyed++; } } };
  plugin.activeSession = { id: 9 };
  plugin.unregisterDocumentView(view);
  assert.equal(plugin.documentModel, null); assert.equal(destroyed, 1);
  assert.equal(plugin.activeSession.id, 9);
});

test('reading view toggle closes only its own leaf, returns to the original note and keeps playback', async () => {
  const plugin = fixture(), note = { id: 'original-note' }, reveals = [];
  const document = { detach() { plugin.unregisterDocumentView([...plugin.documentViews][0]); } };
  plugin.app.workspace.getLeavesOfType = () => [document];
  plugin.app.workspace.iterateAllLeaves = callback => callback(note);
  plugin.app.workspace.revealLeaf = leaf => reveals.push(leaf);
  plugin.documentReturnLeaf = note; plugin.activeSession = { id: 17 };
  plugin.stopReading = () => assert.fail('Closing reading view must not stop audio');
  await plugin.toggleDocumentView();
  assert.deepEqual(reveals, [note]); assert.equal(plugin.activeSession.id, 17);
  assert.equal(plugin.documentReturnLeaf, null);
});

test('toggle does not reopen a note that the user closed', async () => {
  const plugin = fixture(); plugin.documentReturnLeaf = { id: 'closed-note' };
  plugin.app.workspace.getLeavesOfType = () => [{ detach() {} }];
  plugin.app.workspace.iterateAllLeaves = () => {};
  plugin.app.workspace.revealLeaf = () => assert.fail('Do not revive a closed leaf');
  await plugin.toggleDocumentView();
});

test('reading view keeps the original Markdown instead of displaying sanitized synthesis text', async () => {
  const plugin = fixture();
  const text = '# Heading\n\n- **One**\n- Two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'markdown', fileName: 'Public sample', documentText: text, file: { path: 'public.md' } });
  await plugin.activateDocumentView();
  assert.equal(plugin.documentModel.markdownSource.displayText, text);
  assert.equal(plugin.documentModel.markdownSource.filePath, 'public.md');
  assert.equal(plugin.documentModel.markdownSource.mappingValid, true);
});

test('Focus reading selection starts at the actual DOM occurrence and never reads the stale note selection', async () => {
  const { JSDOM } = require('jsdom');
  const { extractReaderSelection } = require('./reader-selection');
  const plugin = fixture(), dom = new JSDOM('<main><p>Repeated. Before.</p><p>Repeated. After.</p><p>Final.</p></main>');
  const body = dom.window.document.querySelector('main'), range = dom.window.document.createRange();
  range.setStart(body.children[1].firstChild, 0); range.setEnd(body.children[1].firstChild, 9);
  const view = { model: { label: 'Public note', partial: false }, getSelectionContext: () => extractReaderSelection(body, range) };
  plugin.lastDocumentView = view; plugin.lastReadableSource = 'document'; plugin.documentViews = new Set([view]);
  plugin.getActiveMarkdownView = () => assert.fail('Focus reading must not consult a stale editor');
  const calls = []; plugin.startReading = async (...args) => calls.push(args);
  await plugin.readFromSelection(); assert.equal(calls[0][0], 'Repeated. After.\n\nFinal.');
  await plugin.readSelection(); assert.equal(calls[1][0], 'Repeated.');
  view.model.partial = true; await plugin.readFromSelection(); assert.equal(calls.length, 2);
});

test('closed focus views and missing selections cannot trigger speech', async () => {
  const plugin = fixture(), view = { getSelectionContext: () => null };
  plugin.startReading = () => assert.fail('Do not synthesize without a selection');
  await plugin.readDocumentSelection(view, 'from-selection');
  plugin.documentViews = new Set(); plugin.lastDocumentView = view; plugin.lastReadableSource = 'document';
  assert.equal(plugin.getCurrentDocumentView(), null);
});

test('native selection reading rejects changed snapshots and keeps the exact second occurrence', async () => {
  const plugin = fixture(), text = 'Repeated. First.\n\nRepeated. Second.';
  const from = text.lastIndexOf('Repeated.');
  const view = { file: { path: 'public.md', extension: 'md', basename: 'public' }, editor: {
    getValue: () => text, getSelection: () => 'Repeated.', getCursor: end => end === 'from' ? from : from + 9,
    posToOffset: value => value,
  } };
  const calls = []; plugin.startReading = async (...args) => calls.push(args);
  await plugin.readMarkdownView(view, 'from-selection'); assert.equal(calls[0][0], 'Repeated. Second.');
  assert.equal(calls[0][2].sourceOffset, from);
  view.editor.getSelection = () => '';
  await plugin.readMarkdownView(view, 'from-selection', { sourceText: 'old', filePath: 'public.md', start: from });
  assert.equal(calls.length, 1);
});
