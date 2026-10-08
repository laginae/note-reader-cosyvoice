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

test('later unprepared target uses a short first request without waiting for stale work', async () => {
  const long = '字'.repeat(19) + '。' + '文'.repeat(39) + '。' + '余'.repeat(19) + '。';
  const { plugin, session, requests } = fixture(['First.', long]);
  const run = plugin.runSpeechSession(session); await tick();
  session.requestedChunkIndex = 1; plugin.notifySessionNavigation(session); await tick();
  assert.equal(session.audioParts[1].length, 3);
  assert.equal(plugin.readerState.preparationStatus, 'synthesizing');
  assert.ok(requests.has('1:0')); assert.equal(requests.size, 2);
  requests.get('1:0').resolve({}); await run;
  requests.get('0:0').resolve({});
});

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

test('prefetch starts alongside foreground but never runs beyond one future part', async () => {
  const { plugin, session, requests } = fixture(undefined, { prefetch: 1 });
  const run = plugin.runSpeechSession(session); await tick();
  assert.deepEqual([...requests.keys()], ['0:0', '1:0']);
  assert.equal(session.preparationPool.active.size, 2);
  requests.get('0:0').resolve({}); await run;
  assert.equal(requests.has('2:0'), false);
  requests.get('1:0').resolve({});
});

test('local and Edge subprocess engines do not run speculative processes concurrently', async () => {
  for (const engine of ['local-cosyvoice', 'system-tts', 'edge-tts']) {
    const {plugin,session,requests}=fixture(['One.','Two.'],{prefetch:1});
    session.speechEngine=engine;
    const run=plugin.runSpeechSession(session); await tick();
    assert.equal(requests.size,1); assert.equal(session.preparationPool.limit,1);
    requests.get('0:0').resolve({}); await run;
    for(const [key,request] of requests) if(key!=='0:0') request.resolve({});
  }
});

test('playback event records latency without replacing playback-speed handling', async () => {
  const {PlaybackTimings}=require('./preparation-pool');
  const {plugin,session}=fixture(['One.']);
  plugin.playbackTimings=new PlaybackTimings(); plugin.playbackTimings.begin('sessionToPlaying');
  plugin.settings.playbackSpeed=1.25;
  plugin.createPlayableAudioSource=async () => ({url:'test-audio', release(){}});
  const OriginalAudio=global.Audio; let audio;
  global.Audio=class {
    constructor(){audio=this;this.duration=1;this.currentTime=0;}
    play(){this.onplaying?.();return Promise.resolve();} pause(){} load(){} removeAttribute(){}
  };
  try {
    const play=PluginClass.prototype.playPreparedAudio.call(plugin,{},session,0,1);
    await tick(); assert.equal(audio.playbackRate,1.25);
    assert.equal(plugin.playbackTimings.snapshot().timings.sessionToPlaying.count,1);
    audio.onended(); await play;
  } finally {global.Audio=OriginalAudio;}
});

test('resume at the natural end boundary advances instead of restarting the ended audio', async () => {
  const {plugin}=fixture(['One.','Two.']); let plays=0, ended=0;
  plugin.currentAudio={paused:true,ended:true,play:async () => {plays++;},onended:() => {ended++;},pause(){}};
  await plugin.pauseOrResume();
  assert.equal(plays,0); assert.equal(ended,1);
});

test('an old resume promise cannot overwrite the paused state or revive replaced audio', async () => {
  const {plugin}=fixture(); const delayed=deferred(); let paused=0;
  const old={paused:true,play:() => delayed.promise,pause:() => {paused++;}};
  plugin.currentAudio=old;
  const resume=plugin.pauseOrResume();
  old.paused=false;
  plugin.runUserAction=async (_name,action) => action();
  await plugin.pauseOrResume();
  delayed.resolve(); await resume;
  assert.equal(plugin.readerState.isPaused,true); assert.ok(paused>=1);
  const next=deferred(); old.paused=true; old.play=() => next.promise;
  const second=plugin.pauseOrResume(); plugin.currentAudio={paused:false};
  plugin.updateStatus('New target',{phase:'synthesizing'});
  next.resolve(); await second;
  assert.equal(plugin.readerState.phase,'synthesizing');
});

test('completed and cancelled players detach handlers and settle pending playback', async () => {
  const {plugin,session}=fixture(['One.']);
  plugin.createPlayableAudioSource=async () => ({url:'test-audio',release(){}});
  const OriginalAudio=global.Audio; const audios=[];
  global.Audio=class {
    constructor(){audios.push(this);this.duration=1;this.currentTime=0;this.paused=false;}
    play(){return Promise.resolve();} pause(){this.paused=true;} load(){} removeAttribute(){}
  };
  try {
    const first=PluginClass.prototype.playPreparedAudio.call(plugin,{},session,0,1); await tick();
    const old=audios[0]; old.onended(); await first;
    assert.equal(old.noteReaderFinished,true); assert.equal(old.onplaying,null);
    assert.equal(old.ontimeupdate,null); assert.equal(old.paused,true);
    const second=PluginClass.prototype.playPreparedAudio.call(plugin,{},session,0,1); await tick();
    await plugin.cancelSessionOperations(session); await second;
    assert.equal(audios[1].noteReaderFinished,true); assert.equal(plugin.currentAudio,null);
  } finally {global.Audio=OriginalAudio;}
});

test('a late playing event respects a pause made during audio startup', async () => {
  const {plugin,session}=fixture(['One.']);
  plugin.createPlayableAudioSource=async () => ({url:'test-audio',release(){}});
  const OriginalAudio=global.Audio; let audio;
  global.Audio=class {
    constructor(){audio=this;this.duration=1;this.currentTime=0;this.paused=false;}
    play(){return Promise.resolve();} pause(){this.paused=true;} load(){} removeAttribute(){}
  };
  try {
    const play=PluginClass.prototype.playPreparedAudio.call(plugin,{},session,0,1);await tick();
    plugin.pauseRequested=true; audio.onplaying(); assert.equal(audio.paused,true);
    audio.noteReaderCancel(); await play;
  } finally {global.Audio=OriginalAudio;}
});

test('rapid jumps remain bounded and discard intermediate queued targets', async () => {
  const { plugin, session, requests, events } = fixture(['One.', 'Two.', 'Three.', 'Four.', 'Five.']);
  const run = plugin.runSpeechSession(session); await tick();
  plugin.jumpToAdjacentChunk(1); await tick();
  plugin.jumpToAdjacentChunk(1); await tick();
  assert.equal(requests.size, 2);
  plugin.jumpToAdjacentChunk(1); await tick();
  requests.get('0:0').resolve({}); await tick();
  assert.equal(requests.has('2:0'), false);
  assert.equal(requests.has('3:0'), true);
  requests.get('3:0').resolve({}); await run;
  requests.get('1:0').resolve({});
  assert.equal(events.filter(event => event.startsWith('play:')).join(','), 'play:3:0');
});

test('failed speculative audio is retried only when it becomes the foreground target', async () => {
  const { plugin, session } = fixture(['One.', 'Two.'], {prefetch:1});
  let attempts = 0; const first = deferred(); const played = [];
  plugin.queuePrepareChunk = async (_text, index) => {
    if (index === 0) return first.promise;
    if (++attempts === 1) throw Error('speculative failure');
    return {};
  };
  plugin.playPreparedAudio = async (_value, active, index) => {played.push(index); if(index===1) active.stopped=true;};
  const run = plugin.runSpeechSession(session); await tick();
  assert.equal(attempts,1); first.resolve({}); await run;
  assert.equal(attempts,2); assert.deepEqual(played,[0,1]);
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
  assert.equal(plugin.readerState.preparationStatus, 'waiting');
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
  assert.equal(plugin.readerState.preparationStatus, 'loading');
  plugin.jumpToAdjacentChunk(1);
  await play;
  assert.equal(released, false);
  loading.resolve({ release() { released = true; } });
  await tick();
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
