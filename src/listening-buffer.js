'use strict';
const { estimateTextSeconds } = require('./playback-estimate');

const MAX_FUTURE_PARTS = 3;
const MAX_FUTURE_CHARS = 900;
function listeningMode(settings = {}) {
  if (Number(settings.onlinePrefetchChunks) === 0) return 'on-demand';
  return settings.continuousListening === true ? 'continuous' : 'balanced';
}

// Soft grouping respects sentences; the existing provider fitter enforces hard limits.
function splitContinuousParts(text, target = 220) {
  const value = String(text || '').trim();
  if (!value) return [];
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(value)].map(s => s.segment)
    : value.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/g) || [value];
  const parts = []; let pending = '';
  for (const sentence of sentences) {
    if (pending && (pending + sentence).length > target) { parts.push(pending.trim()); pending = ''; }
    pending += sentence;
  }
  if (pending.trim()) parts.push(pending.trim());
  return parts;
}

function targetBufferSeconds(latencies = []) {
  const recent = latencies.filter(n => Number.isFinite(n) && n >= 0).slice(-16).sort((a, b) => a - b);
  const p90 = recent.length ? recent[Math.ceil(recent.length * .9) - 1] / 1000 : 8;
  return Math.max(12, Math.min(35, p90 * 1.75 + 2));
}

function partSeconds(session, index, part, text, speed = 1) {
  const measured = session.partDurations?.[`${index}:${part}`];
  return measured > 0 ? measured : Math.max(.1, estimateTextSeconds(text, session.synthesisSpeeds?.[index] || speed));
}

// Includes ready and in-flight parts in the same horizon, so polling never advances it indefinitely.
function planListeningBuffer({ session, adjacent, parts, playbackRate = 1, synthesisSpeed = 1,
  currentTime = 0, currentDuration, latencies = [] }) {
  if (!session.prefetchChunks || session.kind === 'audio-export') return [];
  let cursor = { index: session.prefetchBaseIndex, part: session.currentPartIndex || 0 };
  if (!Number.isInteger(cursor.index)) return [];
  if (session.bufferMode !== 'continuous') {
    const next = adjacent(session, cursor.index, cursor.part, 1);
    return next ? [next] : [];
  }
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const currentText = parts(session, cursor.index)[cursor.part] || '';
  let coverage = Math.max(0, (currentDuration > 0 ? currentDuration
    : partSeconds(session, cursor.index, cursor.part, currentText, synthesisSpeed)) - currentTime) / rate;
  const target = targetBufferSeconds(latencies), result = [];
  let chars = 0;
  for (let i = 0; i < MAX_FUTURE_PARTS; i++) {
    if (i > 0 && coverage >= target) break;
    cursor = adjacent(session, cursor.index, cursor.part, 1);
    if (!cursor) break;
    const text = parts(session, cursor.index)[cursor.part] || '';
    const speech = session.audioSpeechParts?.[cursor.index]?.[cursor.part] || text;
    if (chars + speech.length > MAX_FUTURE_CHARS) break;
    chars += speech.length; result.push(cursor);
    coverage += partSeconds(session, cursor.index, cursor.part, text, synthesisSpeed) / rate;
  }
  return result;
}

module.exports = { listeningMode, splitContinuousParts, targetBufferSeconds, planListeningBuffer,
  MAX_FUTURE_PARTS, MAX_FUTURE_CHARS };
