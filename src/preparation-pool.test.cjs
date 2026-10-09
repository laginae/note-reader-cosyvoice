'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PreparationPool, PlaybackTimings } = require('./preparation-pool');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
test('two requests maximum, newest foreground supersedes queued work and beats prefetch', async () => {
  const pool = new PreparationPool();
  const a = deferred(), b = deferred(), order = [];
  const first = pool.get('a', () => { order.push('a'); return a.promise; });
  const background = pool.get('b', () => { order.push('b'); return b.promise; }, { background: true });
  const skipped = pool.get('c', () => { order.push('c'); return {}; });
  pool.select('d');
  const latest = pool.get('d', () => { order.push('d'); return {}; });
  await assert.rejects(skipped, {name:'AbortError'});
  await tick(); assert.deepEqual(order, ['a','b']); assert.equal(pool.active.size, 2);
  a.resolve({}); await first; await tick();
  await latest; assert.deepEqual(order, ['a','b','d']);
  b.resolve({}); await background; await tick(); assert.equal(pool.active.size, 0);
});
test('in-flight deduplication, ready reuse, failure eviction and retry', async () => {
  const pool = new PreparationPool(); let calls = 0; const d = deferred();
  const first = pool.get('a', () => { calls++; return d.promise; }, {background:true});
  assert.equal(pool.get('a', () => { throw Error('duplicate'); }), first);
  d.resolve({arrayBuffer:new ArrayBuffer(8)});
  const value = await first;
  assert.equal(await pool.get('a', () => { throw Error('duplicate'); }), value);
  assert.equal(calls, 1); assert.equal(pool.bytes, 8);
  await assert.rejects(pool.get('fail', async () => {throw Error('temporary');}));
  assert.equal(await pool.get('fail', async () => 42), 42);
  assert.equal(pool.timings.snapshot().counts.cacheHit, 1);
});
test('clearing does not release active concurrency slots or retain late audio', async () => {
  const pool = new PreparationPool({ concurrency:1 }); const d = deferred();
  const pending = pool.get('old', () => d.promise); await tick();
  pool.clear(); let called = false;
  const next = pool.get('new', async () => { called = true; return {}; });
  await tick(); assert.equal(called, false);
  d.resolve({arrayBuffer:new ArrayBuffer(100)}); await pending; await next; await tick();
  assert.equal(pool.state('old'), undefined); assert.equal(pool.bytes, 0);
  assert.equal(called, true);
});
test('pause prevents queued synthesis, resume starts foreground, invalid work never runs', async () => {
  const pool = new PreparationPool(); pool.pause(true); let calls = 0;
  const foreground = pool.get('a', async () => {calls++; return {};});
  const background = pool.get('b', async () => {calls++;}, {background:true});
  pool.pause(true); await assert.rejects(background, {name:'AbortError'});
  await tick(); assert.equal(calls, 0);
  pool.pause(false); await foreground;
  await assert.rejects(pool.get('c', async () => {calls++;}, {valid:() => false}), {name:'AbortError'});
  assert.equal(calls, 1);
});
test('cache is limited by bytes and entries and can be safely regenerated', async () => {
  const pool = new PreparationPool({maxEntries:2, maxBytes:16});
  const make = async () => ({arrayBuffer:new ArrayBuffer(8)});
  await pool.get('a', make); await pool.get('b', make);
  await pool.get('a', make); await pool.get('c', make);
  assert.equal(pool.state('b'), undefined); assert.equal(pool.bytes, 16);
  await pool.get('large', async () => ({arrayBuffer:new ArrayBuffer(32)}));
  assert.equal(pool.bytes, 0); assert.equal(pool.state('large'), undefined);
  assert.ok((await pool.get('a', make)).arrayBuffer);
});
test('timing report contains bounded numeric aggregates only and excludes paused intervals', () => {
  let time = 0; const timings = new PlaybackTimings(() => time);
  timings.begin('sessionToPlaying'); time=20; timings.playing(10);
  timings.ended(); time=25; timings.playing(21);
  timings.begin('jumpToPlaying'); timings.suspend(); time=900; timings.playing(890);
  for (let i=0;i<150;i++) timings.record('prepare', i);
  const report = timings.snapshot();
  assert.equal(report.timings.sessionToPlaying.p50,20);
  assert.equal(report.timings.partGap.p50,5);
  assert.equal(report.timings.jumpToPlaying,undefined);
  assert.equal(report.timings.prepare.count,128);
  assert.equal(report.timings.prepare.p95,143);
  assert.equal(report.timings.audioLoadToPlaying.count,3);
});
test('failed background requests are not retried by buffer polling; foreground can retry once', async () => {
  const pool = new PreparationPool(); let calls = 0;
  const fail = () => { calls++; throw new Error('Temporary service failure'); };
  await assert.rejects(pool.get('future', fail, { background: true })); await tick();
  for (let i = 0; i < 20; i++) await assert.rejects(pool.get('future', fail, { background: true }));
  assert.equal(calls, 1);
  assert.equal(await pool.get('future', () => { calls++; return 7; }), 7);
  assert.equal(calls, 2); pool.clear();
});
test('a rate limit reduces concurrency and prevents queued requests until cooldown expires', async () => {
  let time = 0; const pool = new PreparationPool({ timings: new PlaybackTimings(() => time) });
  pool.throttle(5000); let calls = 0;
  const next = pool.get('a', () => { calls++; return {}; });
  await tick(); assert.equal(calls, 0); assert.equal(pool.limit, 1);
  time = 5000; pool.drain(); await next; assert.equal(calls, 1); pool.clear();
});
test('shrinking the horizon cancels queued speculation but never drops running request slots', async () => {
  const pool = new PreparationPool({ concurrency: 1 }), d = deferred();
  const active = pool.get('a', () => d.promise);
  const future = pool.get('b', () => 2, { background: true });
  pool.retainBackground([]); await assert.rejects(future, { name: 'AbortError' });
  assert.equal(pool.active.size, 1); d.resolve(1); await active; pool.clear();
});
