const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { captureWebDocument } = require('./web-document');
const { getWebPageUrl, validateWebSnapshot } = require('./web-page');

const html = '<!doctype html><title>Public sample article</title><style>.secret{display:none}</style>'
  + '<nav>Navigation not speech</nav><main><h1>A sample article</h1>'
  + '<p>Repeated phrase. First occurrence.</p><p id="second">Repeated phrase. Second occurrence &amp; x &lt; 5.</p>'
  + '<p>End of the article.</p></main><aside>Unrelated sidebar</aside>'
  + '<p class="secret">Hidden content</p><form><input value="Do not read"><p>Private form text</p></form>'
  + '<div contenteditable="true">Unsaved draft</div><iframe src="https://example.invalid/private"></iframe>'
  + '<script>throw new Error("Must not execute page scripts");</script>';

function page() {
  const dom = new JSDOM(html, { url: 'https://example.test/article', runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'cookie', { get() { throw new Error('Cookies must not be read'); } });
  const node = dom.window.document.querySelector('#second').firstChild;
  const range = dom.window.document.createRange();
  range.setStart(node, 0); range.setEnd(node, 16);
  dom.window.getSelection().addRange(range);
  return dom;
}

test('article extraction is local, removes navigation/forms/hidden/editable content, and preserves punctuation', () => {
  const dom = page();
  const result = captureWebDocument(dom.window.document);
  assert.match(result.text, /First occurrence/);
  assert.match(result.text, /Second occurrence & x < 5/);
  for (const omitted of ['Navigation', 'sidebar', 'Hidden content', 'Private form', 'Unsaved draft', 'Must not execute']) {
    assert.ok(!result.text.includes(omitted), omitted);
  }
  assert.equal(result.method, 'article');
  assert.equal(dom.window.process, undefined);
  dom.window.close();
});

test('selection offsets point to the second identical phrase; partial words and cross-element ranges remain exact', () => {
  const dom = page();
  const doc = dom.window.document;
  const context = captureWebDocument(doc, { article: false }).selectionContext;
  assert.equal(context.selectedText, 'Repeated phrase.');
  assert.match(context.text.slice(context.startOffset), /^Repeated phrase\. Second occurrence/);
  const range = doc.createRange();
  range.setStart(doc.querySelector('#second').firstChild, 3);
  range.setEnd(doc.querySelector('main').lastChild.firstChild, 3);
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  const result = captureWebDocument(doc, { range, article: false });
  assert.match(result.selectionContext.selectedText, /^eated phrase/);
  assert.match(result.selectionContext.selectedText, /End$/);
  dom.window.close();
});

test('hidden or form selections are not relocated into unrelated readable text', () => {
  const dom = page();
  const doc = dom.window.document;
  const node = doc.querySelector('form p').firstChild;
  const range = doc.createRange();
  range.selectNodeContents(node);
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  assert.equal(captureWebDocument(doc, { range }).selectionContext, null);
  dom.window.close();
});

test('reader view uses its rendered root and an in-memory range without reading the host UI', () => {
  const dom = page();
  const doc = dom.window.document;
  const root = doc.querySelector('main');
  const result = captureWebDocument(doc, { root });
  assert.equal(result.method, 'visible-body');
  assert.match(result.text, /^A sample article/);
  assert.match(result.selectionContext.text.slice(result.selectionContext.startOffset), /^Repeated phrase\. Second/);
  dom.window.close();
});

test('URL and guest results are validated without accepting local protocols or credential-bearing URLs', () => {
  for (const url of ['file:///test.html', 'data:text/html,test', 'about:blank', 'https://user:password@example.test/']) {
    assert.equal(getWebPageUrl({ url }), '');
  }
  assert.equal(getWebPageUrl({ url: 'https://example.test/article' }), 'https://example.test/article');
  assert.throws(() => validateWebSnapshot({ url: 'https://other.test/', text: 'test' }, 'https://example.test/'), /WEB_CHANGED/);
  assert.throws(() => validateWebSnapshot({ url: 'https://example.test/', text: 'text',
    selectionContext: { text: 'text', startOffset: 0, endOffset: 10, selectedText: 'text' } }, 'https://example.test/'), /WEB_SELECTION/);
});

const notices = [];
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? {
    Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Notice: class { constructor(text) { notices.push(text); } },
  } : require(name), loaded, loaded.exports
);
const PluginClass = loaded.exports.default;

function pluginPage() {
  const dom = page();
  const listeners = new Map();
  let calls = 0;
  const view = {
    getViewType: () => 'webviewer', mode: 'webview', url: 'https://example.test/article', title: 'Public sample article',
    webview: {
      getURL: () => view.url,
      executeJavaScript: async code => { calls += 1; return dom.window.eval(code); },
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: name => listeners.delete(name),
    },
  };
  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = loaded.exports.__test.createDefaultSettings();
  const workspace = {
    activeLeaf: { view }, getActiveFile: () => null,
    getLeavesOfType: kind => kind === 'webviewer' ? [{ view }] : [],
  };
  plugin.app = { workspace };
  plugin.activateControlView = async () => { workspace.activeLeaf = { view: { getViewType: () => 'note-reader-cosyvoice-control' } }; };
  plugin.startReading = async (text, label, options) => { plugin.reading = { text, label, options }; };
  return { plugin, view, dom, workspace, listeners, calls: () => calls };
}

test('bundled guest runs in an isolated DOM and all three playback scopes use the selected page', async () => {
  const { plugin, dom, calls } = pluginPage();
  plugin.lastReadableFile = { path: 'Wrong.md', extension: 'md' };
  await plugin.readCurrentNote();
  assert.match(plugin.reading.text, /First occurrence/);
  assert.equal(plugin.reading.options.sourceKind, 'web');
  assert.equal(plugin.reading.options.file, undefined);
  await plugin.readSelection();
  assert.equal(plugin.reading.text, 'Repeated phrase.');
  await plugin.readFromSelection();
  assert.match(plugin.reading.text, /^Repeated phrase\. Second/);
  assert.ok(!plugin.reading.text.includes('First occurrence'));
  assert.equal(calls(), 3);
  dom.window.close();
});

test('reader view selection survives panel focus without executing code in the hidden guest', async () => {
  const { plugin, view, dom, calls } = pluginPage();
  view.mode = 'reader'; view.readerView = dom.window.document.querySelector('main');
  plugin.captureWebReaderRange();
  dom.window.getSelection().removeAllRanges();
  await plugin.readFromSelection();
  assert.match(plugin.reading.text, /^Repeated phrase\. Second/);
  assert.equal(calls(), 0);
  dom.window.close();
});

test('panel capability checks and lifecycle observation never extract page text; closed pages never fall back to an old note', () => {
  const { plugin, dom, calls, workspace, listeners } = pluginPage();
  plugin.lastReadableFile = { path: 'Wrong.md', extension: 'md' };
  plugin.observeWebPages(); plugin.observeWebPages();
  assert.equal(listeners.size, 4);
  assert.equal(plugin.canExportCurrentFile(), true);
  assert.equal(plugin.canInsertAudioExportIntoCurrentNote(), false);
  assert.equal(plugin.canResumeCurrentFile(), false);
  assert.equal(calls(), 0);
  workspace.activeLeaf = { view: { getViewType: () => 'note-reader-cosyvoice-control' } };
  workspace.getLeavesOfType = () => [];
  plugin.observeWebPages();
  assert.equal(listeners.size, 0);
  assert.equal(plugin.getCurrentReadableFile(), null);
  assert.equal(plugin.canExportCurrentFile(), false);
  dom.window.close();
});

test('navigating, reloading the same URL, replacing the guest or closing the tab invalidates export snapshots', async () => {
  const { plugin, view, dom, listeners } = pluginPage();
  const context = await plugin.getWebPageContext(view);
  assert.equal(plugin.isAudioExportContextCurrent(context), true);
  listeners.get('dom-ready')();
  assert.equal(plugin.isAudioExportContextCurrent(context), false);
  const next = await plugin.getWebPageContext(view);
  view.url = 'https://example.test/other';
  assert.equal(plugin.isAudioExportContextCurrent(next), false);
  dom.window.close();
});

test('all web export scopes show their exact counts and do not call TTS when confirmation is declined', async () => {
  const { plugin, dom } = pluginPage();
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'OpenRouter', speechEngine: 'openrouter-tts' });
  plugin.getAudioExportTargetPlan = async () => ({ targetPath: 'Audio/web-page.mp3' });
  plugin.prepareChunk = async () => { throw new Error('No paid synthesis allowed'); };
  plugin.stopReading = async () => { throw new Error('No export should start'); };
  const summaries = [];
  plugin.requestAudioExportConfirmation = async summary => { summaries.push(summary); return false; };
  for (const scope of ['entire', 'selection', 'from-selection']) await plugin.exportCurrentFileAudio({ scope });
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].documentKind, 'web');
  assert.equal(summaries[1].textLength, 16);
  assert.ok(summaries[0].textLength > summaries[2].textLength);
  assert.ok(summaries[2].textLength > summaries[1].textLength);
  assert.equal(loaded.exports.__test.getAudioExportUiText('chinese', summaries[0]).fileLabel, '网页');
  dom.window.close();
});

test('navigation during confirmation rejects export before any API call', async () => {
  const { plugin, view, dom } = pluginPage();
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'Mock', speechEngine: 'local-cosyvoice' });
  plugin.getAudioExportTargetPlan = async () => ({ targetPath: 'web-page.wav' });
  plugin.requestAudioExportConfirmation = async () => { view.url = 'https://example.test/other'; return true; };
  plugin.prepareChunk = async () => { throw new Error('Must not synthesize'); };
  assert.equal(await plugin.exportCurrentFileAudio({ scope: 'entire' }), null);
  assert.match(notices.at(-1), /changed/);
  dom.window.close();
});

test('empty selections fail visibly instead of reading a stale note', async () => {
  const { plugin, dom } = pluginPage();
  dom.window.getSelection().removeAllRanges();
  await plugin.readSelection();
  assert.equal(plugin.reading, undefined);
  assert.match(notices.at(-1), /Select text in the current web page/);
  dom.window.close();
});

test('concurrent export clicks open only one scope/confirmation flow', async () => {
  const { plugin, dom } = pluginPage();
  let release;
  let confirmations = 0;
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'Mock', speechEngine: 'local-cosyvoice' });
  plugin.getAudioExportTargetPlan = async () => ({ targetPath: 'web-page.wav' });
  plugin.requestAudioExportConfirmation = async () => {
    confirmations += 1;
    return new Promise(resolve => { release = resolve; });
  };
  const first = plugin.exportCurrentFileAudio({ scope: 'entire' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await plugin.exportCurrentFileAudio({ scope: 'entire' }), null);
  assert.equal(confirmations, 1);
  release(false);
  assert.equal(await first, null);
  assert.equal(plugin.audioExportActionRunning, false);
  dom.window.close();
});

test('Stop/newer reading actions cancel pending web extraction before playback or paid export', async () => {
  const { plugin, view, dom } = pluginPage();
  let release;
  const execute = view.webview.executeJavaScript;
  view.webview.executeJavaScript = code => new Promise(resolve => {
    release = async () => resolve(await execute(code));
  });
  const reading = plugin.readCurrentNote();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  plugin.webActionSequence += 1;
  await release(); await reading;
  assert.equal(plugin.reading, undefined);
  release = null;
  plugin.requestAudioExportScope = async () => { throw new Error('Canceled extraction must not open a dialog'); };
  const exporting = plugin.exportCurrentFileAudio();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  plugin.webActionSequence += 1;
  await release();
  assert.equal(await exporting, null);
  assert.equal(plugin.audioExportActionRunning, false);
  dom.window.close();
});

test('live Reader-view selections supersede cached ranges and navigation rejects in-flight extraction', async () => {
  const { plugin, view, dom } = pluginPage();
  view.mode = 'reader'; view.readerView = dom.window.document.querySelector('main');
  plugin.captureWebReaderRange();
  const range = dom.window.document.createRange();
  range.selectNodeContents(view.readerView.lastChild);
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  await plugin.readSelection();
  assert.equal(plugin.reading.text, 'End of the article.');
  view.mode = 'webview';
  let release;
  const execute = view.webview.executeJavaScript;
  view.webview.executeJavaScript = code => new Promise(resolve => { release = async () => resolve(await execute(code)); });
  const context = plugin.getWebPageContext(view);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  view.url = 'https://example.test/new';
  await release();
  await assert.rejects(context, /Cannot extract|changed/);
  dom.window.close();
});

test('PDF export preparation preserves the confirmation action while explicit Stop cancels it', async () => {
  const { plugin, workspace, dom } = pluginPage();
  const file = { path: 'Public/sample.pdf', basename: 'sample', extension: 'pdf', stat: { mtime: 123 } };
  workspace.activeLeaf = { view: { getViewType: () => 'pdf' } };
  workspace.getActiveFile = () => file;
  plugin.settings.cleanupCache = false;
  plugin.sequence = 0;
  plugin.startReading = PluginClass.prototype.startReading;
  plugin.getCurrentAudioExportContext = () => ({ documentKind: 'pdf', file, fileName: 'sample', hasSelection: false });
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'Mock', speechEngine: 'local-cosyvoice' });
  plugin.getAudioExportTargetPlan = async () => ({ targetPath: 'sample.wav' });
  plugin.saveSessionReadingPosition = async () => {};
  plugin.transitionSessionPhase = () => {};
  plugin.cancelSessionOperations = async () => {};
  plugin.updateStatus = () => {};
  plugin.createSpeechSession = () => ({ id: ++plugin.sequence, stopped: false, files: [] });
  plugin.extractPdfText = async () => 'Public PDF body for confirmation.';
  let confirmations = 0;
  plugin.requestAudioExportConfirmation = async () => { confirmations += 1; return false; };
  await plugin.exportCurrentFileAudio({ scope: 'entire' });
  assert.equal(confirmations, 1);
  const token = plugin.webActionSequence;
  await plugin.stopReading({ silent: true });
  assert.equal(plugin.webActionSequence, token + 1);
  dom.window.close();
});
