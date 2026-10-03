const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('htmlparser2');

const notices = [];
const mockObsidian = {
  Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
  Notice: class { constructor(text) { notices.push(text); } },
};
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  (name) => name === 'obsidian' ? mockObsidian : require(name), loaded, loaded.exports
);
const PluginClass = loaded.exports.default;
const helpers = loaded.exports.__test;
const source = '<h1>Sample</h1><p>Repeated phrase. Earlier.</p>'
  + '<p>Repeated phrase. Later &amp; x &lt; 5.</p><script>Never speak this</script>';

function createPlugin() {
  const body = parseDocument(source);
  const node = body.children[2].children[0];
  const range = { startContainer: node, startOffset: 0, endContainer: node, endOffset: 16 };
  body.contains = (candidate) => candidate === node;
  const listeners = new Map();
  const doc = {
    body, getSelection: () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => range }),
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  const file = { path: 'Articles/sample.html', basename: 'sample', extension: 'html', stat: { mtime: 123, size: source.length } };
  const view = { file, mainView: { iframe: { contentDocument: doc } } };
  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = helpers.createDefaultSettings();
  plugin.app = {
    workspace: { getActiveFile: () => file, getLeavesOfType: (kind) => kind === 'html-view' ? [{ view }] : [] },
    vault: { cachedRead: async () => source },
  };
  plugin.activateControlView = async () => {};
  plugin.startReading = async (text, label, options) => { plugin.reading = { text, label, options }; };
  return { plugin, doc, file, view, listeners };
}

test('Read file routes local HTML rather than a stale Markdown note, including panel fallback', async () => {
  const { plugin, file } = createPlugin();
  plugin.getActiveMarkdownView = () => { throw new Error('Wrong route'); };
  await plugin.readCurrentNote();
  assert.match(plugin.reading.text, /Repeated phrase\. Earlier\./);
  assert.match(plugin.reading.text, /Later & x < 5/);
  assert.ok(!plugin.reading.text.includes('Never speak'));
  assert.equal(plugin.reading.options.sourceKind, 'html');
  assert.equal(plugin.reading.options.plainText, true);
  assert.equal(plugin.lastReadableFile, file);
  plugin.app.workspace.getActiveFile = () => null;
  await plugin.readCurrentNote();
  assert.equal(plugin.reading.options.file, file);
});

test('selection and from-selection start at the selected repeated occurrence', async () => {
  const { plugin, file } = createPlugin();
  await plugin.readSelection();
  assert.equal(plugin.reading.text, 'Repeated phrase.');
  assert.equal(plugin.reading.options.sourceKind, '');
  await plugin.readFromSelection();
  assert.equal(plugin.reading.text, 'Repeated phrase. Later & x < 5.');
  assert.equal(plugin.reading.options.file, file);
});

test('cached selection survives panel focus but cannot be reused for a modified or different file', async () => {
  const { plugin, doc, file } = createPlugin();
  const context = plugin.getHtmlSelectionForFile(file);
  doc.getSelection = () => null;
  assert.equal(plugin.getHtmlSelectionForFile(file), context);
  assert.equal(plugin.getHtmlSelectionForFile({ ...file, path: 'Articles/other.html' }), null);
  file.stat.mtime += 1;
  assert.equal(plugin.getHtmlSelectionForFile(file), null);
  await plugin.readSelection();
  assert.equal(plugin.reading, undefined);
  assert.match(notices.at(-1), /Select text in HTML Reader/);
});

test('HTML text bypasses Markdown tag stripping and reaches the normal speech queue intact', async () => {
  const { plugin, file } = createPlugin();
  plugin.startReading = PluginClass.prototype.startReading;
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'Mock', speechEngine: 'local-cosyvoice' });
  plugin.stopReading = async () => {};
  plugin.createSpeechSession = (chunks, label, config, options) => ({ chunks, options });
  plugin.updateStatus = () => {};
  plugin.writeRuntimeLog = async () => {};
  plugin.runSpeechSession = async (session) => { plugin.completed = session; };
  await plugin.startReading('Comparison: x < 5 > 2. A_B and *literal*.', 'HTML', { file, sourceKind: 'html' });
  assert.equal(plugin.completed.chunks.join(''), 'Comparison: x < 5 > 2. A_B and *literal*.');
});

test('all three HTML export scopes require confirmation and call no TTS when declined', async () => {
  const { plugin } = createPlugin();
  plugin.getSpeechConfiguration = () => ({ chunkLimits: [200], engineLabel: 'OpenRouter', speechEngine: 'openrouter-tts' });
  plugin.getAudioExportTargetPlan = async () => ({ targetPath: 'Audio/sample.mp3' });
  plugin.prepareChunk = async () => { throw new Error('Must not synthesize'); };
  plugin.stopReading = async () => { throw new Error('Must not start export'); };
  const summaries = [];
  plugin.requestAudioExportConfirmation = async (summary) => { summaries.push(summary); return false; };
  assert.equal(plugin.canExportCurrentFile(), true);
  assert.equal(plugin.canInsertAudioExportIntoCurrentNote(), false);
  for (const scope of ['entire', 'selection', 'from-selection']) {
    assert.equal(await plugin.exportCurrentFileAudio({ scope }), null);
  }
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].documentKind, 'html');
  assert.equal(summaries[1].textLength, 16);
  assert.ok(summaries[0].textLength > summaries[2].textLength);
  assert.ok(summaries[2].textLength > summaries[1].textLength);
  assert.equal(helpers.getAudioExportUiText('english', summaries[0]).fileLabel, 'HTML');
  assert.match(helpers.getAudioExportScopeUiText('chinese', { documentKind: 'html' }).description, /HTML/);
});

test('HTML resume uses the existing bounded anchor history', async () => {
  const { plugin, file } = createPlugin();
  plugin.settings.rememberReadingPosition = true;
  plugin.settings.readingPositions = { [file.path]: {
    filePath: file.path, kind: 'html', anchor: 'Repeated phrase. Later & x < 5.', updatedAt: 100,
  } };
  assert.equal(plugin.canResumeCurrentFile(), true);
  await plugin.resumeCurrentFile();
  assert.equal(plugin.reading.text, 'Repeated phrase. Later & x < 5.');
});

test('panel capability checks do not reparse the selected HTML on every progress refresh', () => {
  const { plugin } = createPlugin();
  plugin.getHtmlSelectionForFile = () => { throw new Error('Unnecessary body extraction'); };
  assert.equal(plugin.canExportCurrentFile(), true);
  assert.equal(plugin.canInsertAudioExportIntoCurrentNote(), false);
});

test('frame observers do not accumulate and pending captures are canceled on close', () => {
  const { plugin, listeners } = createPlugin();
  plugin.observeHtmlSelections();
  plugin.observeHtmlSelections();
  assert.equal(listeners.size, 3);
  listeners.get('mouseup')();
  assert.equal(plugin.htmlSelectionTimers.size, 1);
  plugin.app.workspace.getLeavesOfType = () => [];
  plugin.observeHtmlSelections();
  assert.equal(listeners.size, 0);
  assert.equal(plugin.htmlSelectionTimers.size, 0);
  assert.equal(plugin.htmlSelectionObservers.size, 0);
});
