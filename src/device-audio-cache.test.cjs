'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DeviceAudioCache, audioCacheKey, evictionKeys, TTL_MS, MAX_BYTES, MAX_ITEM_BYTES } = require('./device-audio-cache');

function fixture() {
  const rows = new Map(); let enabled = true;
  const store = { get: async key => rows.get(key), put: async (key, value) => rows.set(key, value),
    clear: async () => rows.clear(), prune: async () => {}, close: async () => {} };
  return { rows, store, cache: new DeviceAudioCache(store, () => enabled), disable: () => { enabled = false; } };
}
const audio = () => ({ arrayBuffer: new ArrayBuffer(100), mimeType: 'audio/mpeg' });
test('device audio keys vary with text, voice, model, dictionary and context, not playback speed', async () => {
  const settings = { speechEngine: 'openrouter-tts', openRouterModel: 'test/model', openRouterVoice: 'voice', speed: 1 };
  const key = await audioCacheKey('A public example.', settings);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, await audioCacheKey('A public example.', { ...settings, playbackSpeed: 2 }));
  assert.notEqual(key, await audioCacheKey('Another example.', settings));
  for (const change of [{openRouterVoice:'other'}, {openRouterModel:'test/other'}, {speechTerms:'API = A P I'}, {speed:1.2}]) {
    assert.notEqual(key, await audioCacheKey('A public example.', {...settings, ...change}));
  }
  assert.equal(key, await audioCacheKey('A public example.',settings,{previous_text:'Public context.'}));
  const contextSettings={...settings,openRouterContext:true};
  assert.notEqual(await audioCacheKey('A public example.',contextSettings), await audioCacheKey('A public example.',contextSettings,{previous_text:'Public context.'}));
});
test('device cache is opt-in, bounded, and clear rejects late writes and reads', async () => {
  const f = fixture(), token = f.cache.token();
  await f.cache.put('a', audio(), token); assert.ok(await f.cache.get('a'));
  await f.cache.clear(); await f.cache.put('late', audio(), token); assert.equal(f.rows.size,0);
  await f.cache.put('large',{arrayBuffer:new ArrayBuffer(MAX_ITEM_BYTES+1)},f.cache.token()); assert.equal(f.rows.size,0);
  f.disable(); await f.cache.put('off', audio(), f.cache.token()); assert.equal(await f.cache.get('off'),null);
  const g = fixture(); let complete;
  g.store.get = () => new Promise(resolve => { complete = resolve; });
  const pending = g.cache.get('a'); await new Promise(resolve => setImmediate(resolve));
  const clear = g.cache.clear(); complete(audio()); assert.equal(await pending,null); await clear;
});
test('provider extras, transcripts and nonnumeric cue fields never enter device storage', async () => {
  const f=fixture();
  await f.cache.put('a',{...audio(),text:'not stored',apiKey:'not stored',sentenceCues:[{start:0,end:5,time:0,until:1,text:'not stored'}]},f.cache.token());
  const value=await f.cache.get('a');
  assert.deepEqual(Object.keys(value).sort(),['arrayBuffer','mimeType','sentenceCues']);
  assert.deepEqual(value.sentenceCues,[{start:0,end:5,time:0,until:1}]);
});
test('storage failure never breaks playback and clearing reports failure', async () => {
  const f = fixture(); f.store.get = f.store.put = f.store.clear = async () => { throw Error('unavailable'); };
  assert.equal(await f.cache.get('a'),null); await f.cache.put('a',audio(),f.cache.token());
  await assert.rejects(f.cache.clear()); assert.equal(f.cache.failed,true);
});
test('expiry, clock rollback, entry count and byte quota evict oldest audio', () => {
  const now = TTL_MS*2;
  assert.deepEqual(evictionKeys([{key:'expired',created:now-TTL_MS,accessed:now,size:1},{key:'future',created:now+1,accessed:now,size:1}],now),['expired','future']);
  const rows = Array.from({length:140},(_,i)=>({key:String(i),created:now,accessed:i,size:1}));
  assert.equal(evictionKeys(rows,now).length,12);
  const large = Array.from({length:12},(_,i)=>({key:String(i),created:now,accessed:i,size:MAX_ITEM_BYTES}));
  assert.equal(evictionKeys(large,now).length,12-MAX_BYTES/MAX_ITEM_BYTES);
});
