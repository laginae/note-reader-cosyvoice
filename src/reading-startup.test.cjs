'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}, Notice: class {} } : require(name), loaded, loaded.exports);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; }
function fixture() {
  const plugin = Object.create(loaded.exports.default.prototype), events = [], started = [];
  plugin.sequence = 0; plugin.settings = { ...loaded.exports.__test.createDefaultSettings(), cleanupCache: true };
  plugin.readerState = {}; plugin.currentRequests = new Set();
  plugin.updateStatus = (text, state) => { plugin.readerState = state; };
  plugin.transitionSessionPhase = () => {}; plugin.writeRuntimeLog = async () => {};
  plugin.saveSessionReadingPosition = async () => { events.push('saved'); };
  plugin.cleanupSessionFiles = async session => { events.push('cleanup:' + session.id); };
  const configuration = { speechEngine: 'mimo-tts', engineLabel: 'Public test engine', chunkLimits: [200, 400, 800], prefetchChunks: 0 };
  plugin.getSpeechConfiguration = () => configuration;
  plugin.runSpeechSession = async session => { started.push(session); events.push('started:' + session.sourceLabel); };
  return { plugin, events, started, old: () => {
    const session = plugin.createSpeechSession(['Public original sentence.'], 'Old public sample', configuration);
    plugin.activeSession = session; return session;
  } };
}
test('starting a selection does not wait on old position saves or stopped-session file deletion', async () => {
  const f = fixture(), old = f.old(), saving = deferred(), deleting = deferred();
  f.plugin.saveSessionReadingPosition = async () => { f.events.push('snapshot'); await saving.promise; };
  f.plugin.cleanupSessionFiles = async () => { f.events.push('deleting'); await deleting.promise; };
  await f.plugin.startReading('Public next sentence.', 'New public sample');
  assert.equal(old.stopped, true); assert.equal(f.started.length, 1); assert.ok(f.events.includes('snapshot'));
  assert.equal(f.events.includes('deleting'), false);
  const current = f.plugin.activeSession;
  saving.resolve(); await tick(); assert.ok(f.events.includes('deleting'));
  assert.equal(f.plugin.activeSession, current);
  deleting.resolve(); await Promise.all(f.plugin.sessionCleanupJobs);
  assert.equal(f.plugin.sessionCleanupJobs.size, 0); assert.equal(f.plugin.activeSession, current);
});
test('old PDF release cannot delay request cancellation or the new foreground session', async () => {
  const f = fixture(), old = f.old(), releasing = deferred(); let destroyed = 0, aborted = 0, paused = 0;
  old.pdfLoadingTask = { destroy: async () => { destroyed++; await releasing.promise; } };
  f.plugin.currentRequests.add({ destroy() { aborted++; } });
  f.plugin.currentAudio = { pause() { paused++; }, removeAttribute() {}, load() {} };
  await f.plugin.startReading('Public next sentence.', 'Next');
  assert.equal(aborted, 1); assert.equal(paused, 1); assert.equal(destroyed, 1);
  assert.equal(old.pdfLoadingTask, null); assert.equal(f.started.length, 1);
  const current = f.plugin.activeSession; releasing.resolve(); await Promise.all(f.plugin.sessionCleanupJobs);
  assert.equal(f.plugin.activeSession, current);
});
test('progressive PDF starts also bypass stopped-session cleanup and retain source-wait accounting', async () => {
  const f = fixture(); f.old(); const saving = deferred();
  f.plugin.saveSessionReadingPosition = () => saving.promise;
  f.plugin.activateControlView = async () => {};
  f.plugin.producePdfSpeechChunks = async () => {};
  f.plugin.completeSessionChunks = () => {};
  f.plugin.failSessionChunks = () => { throw Error('Unexpected source failure'); };
  await f.plugin.readCurrentPdf({ path: 'public.pdf', basename: 'Public PDF', extension: 'pdf', stat: { mtime: 1, size: 10 } });
  assert.equal(f.started.length, 1); assert.equal(f.started[0].kind, 'pdf-progressive');
  assert.equal(Number.isFinite(f.started[0].preparationStarted), true);
  saving.resolve(); await Promise.all(f.plugin.sessionCleanupJobs);
});

test('chapter handoff is reported before speech completes and a new PDF heading cancels the old playback', async () => {
  const f = fixture(), completions = [deferred(), deferred()], accepted = [];
  f.plugin.runSpeechSession = session => {
    f.started.push(session);
    return completions[f.started.length - 1].promise;
  };
  const onStarted = () => accepted.push(f.plugin.activeSession);
  const first = f.plugin.startReading('Public first chapter.', 'First', { onStarted });
  await tick(); assert.equal(accepted.length, 1); assert.equal(accepted[0], f.started[0]);
  let cancelled = 0;
  f.plugin.currentRequests.add({ destroy() { cancelled++; } });
  f.plugin.pauseRequested = true;

  f.plugin.producePdfSpeechChunks = async () => {};
  f.plugin.completeSessionChunks = () => {};
  f.plugin.activateControlView = () => assert.fail('Chapter switch should not open the control sidebar');
  const file = { path:'public.pdf', extension:'pdf', stat:{mtime:1,size:30} };
  const range = { startPage:2, startOffset:5, endPage:2, endOffset:15, fileMtime:1, title:'Next' };
  const second = f.plugin.readCurrentPdf(file, { keepControls:true, outlineRange:range, onStarted });
  await tick();
  assert.equal(accepted.length, 2); assert.equal(accepted[1], f.started[1]);
  assert.equal(f.started[0].stopped, true); assert.equal(cancelled, 1); assert.equal(f.plugin.pauseRequested, false);
  assert.equal(f.started[1].pdfOutlineRange, range);
  completions[0].resolve(); await first;
  assert.equal(f.plugin.activeSession, f.started[1]);
  completions[1].resolve(); await second;
});
test('Stop while the PDF controls open prevents an obsolete PDF start', async () => {
  const f = fixture(), opening = deferred();
  f.plugin.activateControlView = () => opening.promise;
  f.plugin.producePdfSpeechChunks = async () => { throw Error('Cancelled PDF must not be extracted'); };
  const pending = f.plugin.readCurrentPdf({ path: 'public.pdf', extension: 'pdf', stat: { mtime: 1, size: 10 } });
  await f.plugin.stopReading({ silent: true }); opening.resolve(); await pending;
  assert.equal(f.started.length, 0);
});
test('newest concurrent selection wins and explicit stop cancels an uncommitted start', async () => {
  const f = fixture();
  await Promise.all([f.plugin.startReading('Public earlier sentence.', 'Earlier'), f.plugin.startReading('Public latest sentence.', 'Latest')]);
  assert.deepEqual(f.started.map(session => session.sourceLabel), ['Latest']);
  const pending = f.plugin.startReading('Public cancelled sentence.', 'Cancelled');
  await f.plugin.stopReading({ silent: true }); await pending;
  assert.equal(f.started.length, 1); assert.equal(f.plugin.activeSession, null);
});
test('explicit stop still waits for cleanup', async () => {
  const f = fixture(); f.old(); const deleting = deferred(); let complete = false;
  f.plugin.cleanupSessionFiles = () => deleting.promise;
  const stop = f.plugin.stopReading({ silent: true }).then(() => { complete = true; });
  await tick(); assert.equal(complete, false); assert.equal(f.plugin.activeSession, null);
  deleting.resolve(); await stop; assert.equal(complete, true);
});
test('prepared source mappings keep hidden comments and selected offsets intact', async () => {
  const f = fixture();
  const sourceText = '# Public title\n<!-- hidden\n## Not a heading\n-->\n\nVisible $10^{-9}$.\n\nPublic ending.';
  const offset = sourceText.indexOf('hidden');
  await f.plugin.startReading(sourceText.slice(offset), 'Selected', { sourceKind: 'markdown', sourceText, sourceOffset: offset });
  const session = f.started[0]; assert.doesNotMatch(session.chunks.join(''), /hidden|Not a heading/);
  assert.equal(session.markdownSource.mappingValid, true);
  assert.equal(session.markdownSource.text, sourceText); assert.ok(session.markdownSource.blocks.every(block => block.from >= offset));
  await f.plugin.startReading(sourceText, 'Whole', { sourceKind: 'markdown' });
  assert.doesNotMatch(f.started.at(-1).chunks.join(''), /hidden|Not a heading/);
  assert.equal(f.started.at(-1).markdownSource.mappingValid, true);
});
