'use strict';

const { splitOpeningAudioParts } = require('./semantic-chunker');
const { estimateTextSeconds } = require('./playback-estimate');

function getSpeechParts(session, index) {
  const text = session?.chunks?.[index];
  if (typeof text !== 'string') return [];
  session.audioParts ||= {};
  if (!session.audioParts[index]) {
    session.audioParts[index] = index === 0 && session.kind !== 'audio-export'
      ? splitOpeningAudioParts(text) : [text];
  }
  return session.audioParts[index];
}

function adjacentSpeechPart(session, index, part, delta) {
  const parts = getSpeechParts(session, index);
  if (delta > 0) {
    if (part + 1 < parts.length) return { index, part: part + 1 };
    if (index + 1 < session.chunks.length) return { index: index + 1, part: 0 };
  } else {
    if (part > 0) return { index, part: part - 1 };
    if (index > 0) return { index: index - 1, part: getSpeechParts(session, index - 1).length - 1 };
  }
  return null;
}

function getSpeechPartTiming(session, index, part = 0, time = 0, speed = 1) {
  const durations = getSpeechParts(session, index).map((text, p) => {
    const measured = session.partDurations?.[`${index}:${p}`];
    return measured > 0 ? measured : Math.max(0.1, estimateTextSeconds(text, session.synthesisSpeeds?.[index] || speed));
  });
  const offset = durations.slice(0, part).reduce((sum, value) => sum + value, 0);
  const duration = durations.reduce((sum, value) => sum + value, 0);
  return { durations, offset, duration, current: Math.min(duration, offset + Math.max(0, time)) };
}

module.exports = { getSpeechParts, adjacentSpeechPart, getSpeechPartTiming };
