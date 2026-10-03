const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const notices = [];
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? {
    Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Notice: class { constructor(text) { notices.push(text); } },
  } : require(name), loaded, loaded.exports
);
const PluginClass = loaded.exports.default;
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(chunks = ['First.', 'Second.', 'Third.', 'Fourth.'], options = {}) {
  const plugin = Object.create(PluginClass.prototype);
  plugin.sequence = 0;
  plugin.settings = { ...loaded.exports.__test.createDefaultSettings(), cleanupCache: false,
    speechEngine: 'openrouter-tts' };
  plugin.readerState = loaded.exports.__test.createReaderState();
  plugin.currentAudio = null;
  plugin.currentProcess = null;
  plugin.currentRequests = new Set();
  plugin.pauseRequested = false;
  const events = [], requests = new Map();
  plugin.setReaderState = patch => Object.assign(plugin.readerState, patch);
  plugin.updateStatus = (label, patch) => Object.assign(plugin.readerState, { label }, patch);
  plugin.writeRuntimeLog = async () => {};
  plugin.saveSessionReadingPosition = async () => {};
  plugin.clearSessionReadingPosition = async () => {};
  plugin.queuePrepareChunk = (text, index, session, part) => {
    const key = `${index}:${part}`;
    assert.ok(!requests.has(key), `Synthesis must not be repeated: ${key}`);
    const request = deferred();
    requests.set(key, request);
    events.push(`prepare:${key}`);
    if (index === session.currentChunkIndex && part === session.currentPartIndex) {
      plugin.updateStatus('Preparing', { currentChunk: index + 1, totalChunks: session.totalChunks });
    }
    return request.promise;
  };
  plugin.playPreparedAudio = async (_prepared, session, index, _total, part) => {
    events.push(`play:${index}:${part}`);
    session.stopped = true;
  };
  const session = plugin.createSpeechSession(chunks, 'Public test', {
    engineLabel: 'OpenRouter TTS', speechEngine: 'openrouter-tts', prefetchChunks: options.prefetch || 0,
  }, options);
  plugin.activeSession = session;
  return { plugin, session, events, requests };
}

test('Next starts the target before the old synthesis finishes; stale errors do not stop playback', async () => {
  const { plugin, session, events, requests } = fixture();
  const before = notices.length;
  const run = plugin.runSpeechSession(session);
  await tick();
  assert.equal(plugin.jumpToAdjacentChunk(1), true);
  await tick();
  assert.deepEqual(events, ['prepare:0:0', 'prepare:1:0']);
  requests.get('0:0').reject(new Error('Obsolete synthesis failed'));
  await tick();
  assert.equal(notices.length, before);
  requests.get('1:0').resolve({ outputPath: 'test.mp3' });
  await run;
  assert.deepEqual(events, ['prepare:0:0', 'prepare:1:0', 'play:1:0']);
  assert.equal(session.operationWaiters.size, 0);
});

test('rapid successive Next clicks select the latest target, never replaying stale results', async () => {
  const { plugin, session, events, requests } = fixture();
  const run = plugin.runSpeechSession(session);
  await tick();
  plugin.jumpToAdjacentChunk(1);
  plugin.jumpToAdjacentChunk(1);
  await tick();
  assert.equal(requests.has('1:0'), false);
  assert.equal(requests.has('2:0'), true);
  plugin.jumpToAdjacentChunk(1);
  await tick();
  requests.get('2:0').resolve({});
  requests.get('0:0').resolve({});
  await tick();
  assert.equal(events.some(event => event.startsWith('play:')), false);
  requests.get('3:0').resolve({});
  await run;
  assert.equal(events.at(-1), 'play:3:0');
  assert.equal(session.operationWaiters.size, 0);
});

test('returning to a skipped segment reuses its in-flight synthesis instead of another API request', async () => {
  const { plugin, session, events, requests } = fixture();
  const run = plugin.runSpeechSession(session);
  await tick();
  plugin.jumpToAdjacentChunk(1);
  await tick();
  plugin.jumpToAdjacentChunk(-1);
  await tick();
  assert.deepEqual(events, ['prepare:0:0', 'prepare:1:0']);
  requests.get('0:0').resolve({});
  await run;
  requests.get('1:0').resolve({});
  assert.equal(events.at(-1), 'play:0:0');
});

test('Next reuses the prefetched target immediately and does not increase the prefetch setting', async () => {
  const { plugin, session, events, requests } = fixture(['First.', 'Second.'], { prefetch: 1 });
  const playback = deferred();
  plugin.playPreparedAudio = async (_prepared, active, index) => {
    events.push(`play:${index}:0`);
    if (index === 0) {
      plugin.currentAudio = { pause() {}, onended() { plugin.currentAudio = null; playback.resolve(); } };
      await playback.promise;
    } else active.stopped = true;
  };
  const run = plugin.runSpeechSession(session);
  await tick();
  requests.get('0:0').resolve({});
  await tick();
  requests.get('1:0').resolve({});
  await tick();
  plugin.jumpToAdjacentChunk(1);
  await run;
  assert.deepEqual(events, ['prepare:0:0', 'prepare:1:0', 'play:0:0', 'play:1:0']);
  assert.equal(session.prefetchChunks, 1);
});

test('Next skips pending internal startup audio but keeps logical segment numbering', async () => {
  const opening = 'A'.repeat(20) + '. ' + 'B'.repeat(40) + '. ' + 'C'.repeat(60) + '.';
  const { plugin, session, events, requests } = fixture([opening, 'Next logical segment.']);
  const run = plugin.runSpeechSession(session);
  await tick();
  plugin.jumpToAdjacentChunk(1);
  await tick();
  requests.get('1:0').resolve({});
  await run;
  requests.get('0:0').resolve({});
  assert.deepEqual(events, ['prepare:0:0', 'prepare:1:0', 'play:1:0']);
  assert.equal(session.totalChunks, 2);
});

test('Stop releases a pending synthesis wait even when the service does not respond', async () => {
  const { plugin, session, requests } = fixture();
  const run = plugin.runSpeechSession(session);
  await tick();
  await plugin.stopReading({ silent: true });
  await run;
  assert.equal(session.operationWaiters.size, 0);
  assert.equal(session.chunkWaiters.size, 0);
  requests.get('0:0').reject(new Error('Stopped request'));
});

test('Previous can leave the progressive PDF parsing wait without waiting for a new page', async () => {
  const { plugin, session, events } = fixture(['First.', 'Second.'], {
    kind: 'pdf-progressive', productionComplete: false,
  });
  let plays = 0;
  plugin.queuePrepareChunk = async () => ({});
  plugin.playPreparedAudio = async (_prepared, active, index) => {
    events.push(`play:${index}`);
    plugin.readerState.currentChunk = index + 1;
    plugin.readerState.totalChunks = 2;
    if (++plays === 3) active.stopped = true;
  };
  const run = plugin.runSpeechSession(session);
  await tick();
  assert.equal(session.chunkWaiters.size, 1);
  assert.equal(plugin.jumpToAdjacentChunk(-1), true);
  await run;
  assert.deepEqual(events, ['play:0', 'play:1', 'play:0']);
  assert.equal(session.chunkWaiters.size, 0);
});

test('navigation during audio-file loading releases the old source without playing it', async () => {
  const { plugin, session } = fixture();
  plugin.readerState.currentChunk = 1;
  plugin.readerState.totalChunks = 4;
  const loading = deferred();
  let released = false;
  plugin.createPlayableAudioSource = () => loading.promise;
  const play = PluginClass.prototype.playPreparedAudio.call(plugin, {}, session, 0, 4);
  await tick();
  plugin.jumpToAdjacentChunk(1);
  loading.resolve({ release() { released = true; } });
  await play;
  assert.equal(released, true);
  assert.equal(plugin.currentAudio, null);
});

test('a failure of the current target still reports an error, unlike skipped-request failures', async () => {
  const { plugin, session, requests } = fixture();
  const before = notices.length;
  const run = plugin.runSpeechSession(session);
  await tick();
  plugin.jumpToAdjacentChunk(1);
  await tick();
  requests.get('1:0').reject(new Error('Target synthesis failed'));
  await run;
  requests.get('0:0').resolve({});
  assert.equal(plugin.readerState.phase, 'error');
  assert.match(plugin.readerState.error, /Target synthesis failed/);
  assert.equal(notices.length, before + 1);
  assert.equal(session.operationWaiters.size, 0);
});
