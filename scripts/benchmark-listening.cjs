'use strict';
// Deterministic, offline simulation of the real playback scheduler. No account or vault access.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PlaybackTimings } = require('../src/preparation-pool');
const { splitTextForSpeechChunks } = require('../src/semantic-chunker');
const { getSpeechParts } = require('../src/speech-parts');
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}, Notice: class {} }
    : require(name), loaded, loaded.exports);
const Plugin = loaded.exports.default;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function simulate(mode, rate, millisecondsPerCharacter = 40, jump = false) {
  let now = 0, active = 0, maxActive = 0, requests = 0, characters = 0, played = 0;
  let finished = false, first = null, endedAt = null, jumpedAt = null, jumpWait = null;
  const pending = [], gaps = [];
  const later = (delay, run) => pending.push({ at: now + delay, run });
  const plugin = Object.create(Plugin.prototype);
  plugin.sequence = 0; plugin.pauseRequested = false; plugin.currentRequests = new Set();
  plugin.settings = { ...loaded.exports.__test.createDefaultSettings(), speechEngine: 'openrouter-tts',
    continuousListening: mode === 'continuous', onlinePrefetchChunks: mode === 'on-demand' ? 0 : 1,
    playbackSpeed: rate, cleanupCache: false };
  plugin.readerState = loaded.exports.__test.createReaderState();
  plugin.playbackTimings = new PlaybackTimings(() => now);
  plugin.setReaderState = patch => Object.assign(plugin.readerState, patch);
  plugin.updateStatus = (label, patch) => Object.assign(plugin.readerState, { label }, patch);
  plugin.writeRuntimeLog = plugin.clearSessionReadingPosition = plugin.saveSessionReadingPosition = async () => {};
  const sample = '这是公开的语音播放测试示例，用于检查段落之间的停顿和切换，不包含个人资料或专业研究内容。'.repeat(32);
  const chunks = splitTextForSpeechChunks(sample, [200, 400, 800]);
  const session = plugin.createSpeechSession(chunks, 'Public playback benchmark', {
    speechEngine: 'openrouter-tts', engineLabel: 'Simulated speech', prefetchChunks: plugin.settings.onlinePrefetchChunks });
  plugin.activeSession = session;
  plugin.queuePrepareChunk = (text, index, _session, part) => new Promise(resolve => {
    requests++; characters += text.length; active++; maxActive = Math.max(maxActive, active);
    later(1200 + text.length * millisecondsPerCharacter, () => { active--; resolve({ text, index, part }); });
  });
  plugin.playPreparedAudio = (prepared, s, index, _total, part) => new Promise(resolve => {
    if (first === null) first = now;
    if (jumpedAt !== null && jumpWait === null) jumpWait = now - jumpedAt;
    if (endedAt !== null) gaps.push(Math.max(0, now - endedAt));
    const duration = prepared.text.length / 5;
    s.partDurations ||= {}; s.partDurations[index + ':' + part] = duration;
    const audio = plugin.currentAudio = { duration, currentTime: 0, noteReaderSessionId: s.id,
      noteReaderChunkIndex: index, noteReaderPartIndex: part };
    const span = duration * 1000 / rate;
    for (let t = 1000; t < span; t += 1000) later(t, () => {
      if (plugin.currentAudio === audio && plugin.isActive(s)) { audio.currentTime = t / 1000 * rate; s.prepareAvailableChunks?.(); }
    });
    later(span, () => {
      played++; endedAt = now; plugin.currentAudio = null;
      if (jump && played === 1) {
        s.requestedChunkIndex = chunks.length - 1; s.requestedPartIndex = 0;
        jumpedAt = now; plugin.notifySessionNavigation(s);
      }
      resolve();
    });
  });
  const run = plugin.runSpeechSession(session).finally(() => { finished = true; });
  for (let turns = 0; !finished && turns < 10000; turns++) {
    await tick();
    if (finished) break;
    assert.ok(pending.length, 'Scheduler deadlock');
    pending.sort((a, b) => a.at - b.at);
    const next = pending.shift(); now = next.at; next.run();
  }
  assert.equal(finished, true); await run;
  assert.equal(session.previewResult, 'complete'); assert.ok(maxActive <= 2);
  return { mode, rate, millisecondsPerCharacter, jump, startupMs: Math.round(first), jumpMs: jumpWait === null ? null : Math.round(jumpWait),
    gapCount: gaps.filter(n => n > 1).length, gapMs: Math.round(gaps.reduce((a, b) => a + b, 0)),
    requests, characters, maxConcurrentRequests: maxActive };
}
async function benchmark() {
  const results = [];
  for (const milliseconds of [40, 80]) for (const rate of [1, 1.75, 2]) for (const mode of ['balanced', 'continuous'])
    results.push(await simulate(mode, rate, milliseconds));
  for (const mode of ['balanced', 'continuous']) results.push(await simulate(mode, 1.75, 40, true));
  return { type: 'offline deterministic scheduler simulation, not provider measurements',
    assumptions: '1200 ms fixed request latency plus 40 or 80 ms/character; audio 5 characters/second; no network calls', results };
}
if (require.main === module) benchmark().then(report => {
  const json = JSON.stringify(report, null, 2) + '\n';
  if (process.argv[2]) fs.writeFileSync(process.argv[2], json);
  console.log(json);
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { simulate, benchmark };
