'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listeningMode, splitContinuousParts, targetBufferSeconds, planListeningBuffer } = require('./listening-buffer');
const { getSpeechParts, planSpeechParts, adjacentSpeechPart } = require('./speech-parts');
const sentence = n => '示'.repeat(n - 1) + '。';
function session(mode = 'continuous') {
  return { chunks: Array.from({ length: 8 }, () => sentence(40)), currentPartIndex: 0,
    prefetchBaseIndex: 0, prefetchChunks: 1, bufferMode: mode, smartQuickStart: false,
    synthesisSettings: {}, speechPartLimit: 800 };
}
function plan(s, options = {}) {
  return planListeningBuffer({ session: s, adjacent: adjacentSpeechPart, parts: getSpeechParts, ...options });
}
test('migration preserves strict on-demand and balanced; continuous requires explicit opt-in', () => {
  assert.equal(listeningMode({}), 'balanced');
  assert.equal(listeningMode({ onlinePrefetchChunks: 1 }), 'balanced');
  assert.equal(listeningMode({ onlinePrefetchChunks: 0, continuousListening: true }), 'on-demand');
  assert.equal(listeningMode({ onlinePrefetchChunks: 1, continuousListening: true }), 'continuous');
});
test('sentence grouping preserves content, Unicode and long sentences; provider fitting remains authoritative', () => {
  const text = sentence(100) + sentence(100) + sentence(100);
  assert.deepEqual(splitContinuousParts(text).map(p => p.length), [200, 100]);
  assert.equal(splitContinuousParts(sentence(350)).length, 1);
  const s = session(); s.chunks = [text]; s.speechPartLimit = 150;
  const parts = planSpeechParts(s, 0, true);
  assert.equal(parts.join(''), text); assert.ok(parts.every(p => p.length <= 150));
  assert.equal(planSpeechParts(s, 0, false), parts);
});
test('balanced, on-demand and exports preserve original request boundaries and prefetch counts', () => {
  const s = session('balanced'); s.chunks = [sentence(500), sentence(500)];
  assert.equal(getSpeechParts(s, 0).length, 1); assert.equal(plan(s, { playbackRate: 2 }).length, 1);
  s.prefetchChunks = 0; assert.equal(plan(s).length, 0);
  s.prefetchChunks = 1; s.bufferMode = 'continuous'; s.kind = 'audio-export';
  s.audioParts = {}; assert.equal(getSpeechParts(s, 0).length, 1); assert.deepEqual(plan(s), []);
});
test('high playback speed and longer preparation times expand a bounded future horizon', () => {
  const s = session();
  assert.equal(plan(s, { playbackRate: 1 }).length, 1);
  assert.ok(plan(s, { playbackRate: 2 }).length > 1);
  assert.equal(plan(s, { playbackRate: 2, latencies: [30000] }).length, 3);
  assert.equal(targetBufferSeconds([1]), 12); assert.equal(targetBufferSeconds([120000]), 35);
});
test('known current duration and progress control replenishment without inspecting unrelated text', () => {
  const s = session();
  assert.equal(plan(s, { currentDuration: 50, currentTime: 0 }).length, 1);
  assert.equal(plan(s, { currentDuration: 50, currentTime: 49 }).length, 2);
  assert.deepEqual(plan(s, { currentDuration: 50, currentTime: 49 }), plan(s, { currentDuration: 50, currentTime: 49 }));
  s.chunks = [sentence(40)]; assert.deepEqual(plan(s), []);
});
test('future speech character budget includes expanded terms and never splits in-flight requests', () => {
  const s = session(); s.chunks = [sentence(40), sentence(500), sentence(500), sentence(500)];
  const targets = plan(s, { currentTime: 9, latencies: [30000], playbackRate: 2 });
  assert.equal(targets.length, 1);
  assert.ok(targets.reduce((n, t) => n + s.audioSpeechParts[t.index][t.part].length, 0) <= 900);
  s.chunks[1] = sentence(950); s.audioParts = {}; s.audioSpeechParts = {}; s.speechPartLimit = 1200;
  assert.deepEqual(plan(s), []);
});
