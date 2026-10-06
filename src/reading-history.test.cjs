const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loaded = { exports: {} }, notices = [];
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Notice: class { constructor(text) { notices.push(text); } } } : require(name), loaded, loaded.exports);
function fixture(saved = {}) {
  const plugin = Object.create(loaded.exports.default.prototype);
  plugin.loadData = async () => saved;
  plugin.saveData = async data => { plugin.disk = JSON.parse(JSON.stringify(data)); };
  plugin.renderReaderViews = () => {};
  return plugin;
}
const entry = { filePath: 'Public/demo.md', kind: 'markdown', anchor: 'An example paragraph.', updatedAt: 10 };
const session = { chunks: [entry.anchor], filePath: entry.filePath, fileMtime: 10, sourceKind: 'markdown', currentChunkIndex: 0 };

test('default session history never reaches disk and is discarded on a fresh load', async () => {
  const p = fixture(); await p.loadSettings();
  p.activeSession = session; p.currentAudio = { currentTime: 7 };
  assert.equal(await p.saveSessionReadingPosition(session), true);
  assert.equal(p.settings.readingHistoryMode, 'session');
  assert.equal(p.getSavedReadingPosition({ path: entry.filePath }).audioTime, 7);
  assert.deepEqual(p.disk.readingPositions, {});
  const reloaded = fixture(p.disk); await reloaded.loadSettings();
  assert.deepEqual(reloaded.settings.readingPositions, {});
});

test('legacy opt-in persists; off and session modes remove disk anchors without silently deleting memory', async () => {
  const p = fixture({ rememberReadingPosition: true, readingPositions: { [entry.filePath]: entry } });
  await p.loadSettings();
  assert.equal(p.settings.readingHistoryMode, 'persistent');
  assert.ok(p.disk.readingPositions[entry.filePath]);
  p.settings.readingHistoryMode = 'off'; await p.saveSettings();
  assert.equal(await p.saveSessionReadingPosition(session), false);
  assert.deepEqual(p.disk.readingPositions, {});
  assert.ok(p.settings.readingPositions[entry.filePath]);
  p.settings.readingHistoryMode = 'session'; await p.saveSettings();
  assert.ok(p.getSavedReadingPosition({ path: entry.filePath }));
  await p.clearReadingPositions(); assert.deepEqual(p.settings.readingPositions, {});
});

test('history excludes web, export and selected-only sessions', async () => {
  const p = fixture(); await p.loadSettings();
  for (const patch of [{ sourceKind: 'web' }, { kind: 'audio-export' }, { skipReadingPosition: true }]) {
    assert.equal(await p.saveSessionReadingPosition({ ...session, ...patch }), false);
  }
  assert.deepEqual(p.settings.readingPositions, {});
});

test('resuming a changed note never guesses an old chunk number or invokes synthesis', async () => {
  const p = fixture(); await p.loadSettings(); await p.saveSessionReadingPosition(session);
  const file = { path: entry.filePath, extension: 'md' };
  p.getCurrentReadableFile = () => file;
  p.getActiveMarkdownView = () => ({ file, editor: { getValue: () => 'Completely replaced content.' } });
  p.startReading = () => assert.fail('Must not synthesize a guessed location');
  await p.resumeCurrentFile();
  assert.match(notices.at(-1), /saved position changed/i);
});

test('same active audio resumes in place without new synthesis', async () => {
  const p = fixture(); await p.loadSettings(); await p.saveSessionReadingPosition(session);
  p.getCurrentReadableFile = () => ({ path: entry.filePath });
  p.activeSession = session; p.currentAudio = { paused: true, currentTime: 7 };
  let resumed = 0;
  p.pauseOrResume = async () => { resumed++; };
  p.startReading = () => assert.fail('No new synthesis');
  await p.resumeCurrentFile(); assert.equal(resumed, 1); assert.equal(p.currentAudio.currentTime, 7);
});

test('reset preserves the active synthesis snapshot and only changes future sessions', async () => {
  const p = fixture(); await p.loadSettings(); p.sequence = 0;
  p.settings.speechEngine = 'mimo-tts'; p.settings.mimoVoice = '林间'; p.settings.speed = 1.5;
  p.settings.mimoConsent = true; p.settings.mimoSecretName = 'public-test-reference';
  p.activeSession = p.createSpeechSession(['Example.'], 'Example', { speechEngine: 'mimo-tts', prefetchChunks: 1 });
  await p.resetSettingsToDefaults('engine');
  assert.equal(p.settings.speechEngine, 'local-cosyvoice');
  assert.equal(p.settings.mimoSecretName, 'public-test-reference');
  assert.equal(p.activeSession.synthesisSettings.mimoVoice, '林间');
  assert.equal(p.activeSession.synthesisSettings.mimoConsent, true);
  assert.equal(p.activeSession.speechEngine, 'mimo-tts');
  await p.resetSettingsToDefaults('playback');
  assert.equal(p.activeSession.synthesisSettings.speed, 1.5);
  assert.equal(p.settings.speed, 1);
});

test('persistent history survives load while stale session-mode disk records are purged', async () => {
  const p = fixture({ readingHistoryMode: 'persistent', readingPositions: { [entry.filePath]: entry } });
  await p.loadSettings(); const next = fixture(p.disk); await next.loadSettings();
  assert.equal(next.getSavedReadingPosition({ path: entry.filePath }).anchor, entry.anchor);
  const stale = fixture({ ...p.disk, readingHistoryMode: 'session' }); await stale.loadSettings();
  assert.deepEqual(stale.settings.readingPositions, {}); assert.deepEqual(stale.disk.readingPositions, {});
});

test('resumed Markdown preserves original source mapping for note highlights', async () => {
  const p = fixture(); await p.loadSettings(); await p.saveSessionReadingPosition(session);
  const file = { path: entry.filePath, extension: 'md' }, raw = '# Heading\n\nEarlier text.\n\n**An example paragraph.**\n\nFollowing text.';
  p.getCurrentReadableFile = () => file;
  p.getActiveMarkdownView = () => ({ file, editor: { getValue: () => raw } });
  p.getSpeechConfiguration = () => ({ chunkLimits: [200] });
  p.activateControlView = async () => {};
  p.startReading = async (_text, _label, options) => {
    assert.equal(options.markdownSource.text, raw);
    assert.equal(options.markdownSource.mappingValid, true);
    assert.ok(options.markdownSource.ranges[0].start > 0);
    assert.ok(options.readingChunks[0].startsWith(entry.anchor));
  };
  await p.resumeCurrentFile();
});

test('HTML resume passes original full-width text and paragraph breaks to playback', async () => {
  const p = fixture(); await p.loadSettings();
  const source = 'Earlier.\n\n中文：括号（２０％），下一句话。\n\n后续段落。';
  const { createReadingAnchor } = require('./reading-position');
  p.getHtmlFileText = async () => source;
  p.activateControlView = async () => {};
  let received;
  p.startReading = async (text, _label, options) => { received = { text, options }; };
  const file = { path: 'Public/demo.html', basename: 'Demo' };
  await p.readCurrentHtml(file, 'entire', { resumePosition: { anchor: createReadingAnchor('中文：括号（２０％），下一句话。') } });
  assert.equal(received.text, source.slice(source.indexOf('中文')));
  assert.equal(received.options.sourceKind, 'html');
  assert.equal(received.options.file, file);
});
