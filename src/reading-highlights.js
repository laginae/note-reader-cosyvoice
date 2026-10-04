'use strict';

function normalizeReadingHighlight(value) {
  return ['off', 'segment', 'sentence'].includes(value) ? value : 'sentence';
}

function sentenceRanges(text) {
  text = String(text || '');
  if (!text.trim()) return [];
  if (typeof Intl.Segmenter !== 'function') return [{ start: 0, end: text.length }];
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text),
    item => ({ start: item.index, end: item.index + item.segment.length }));
}

function buildSentenceCues(text, words, duration) {
  if (!Array.isArray(words) || !words.length || !(duration > 0)) return [];
  const ranges = sentenceRanges(text);
  let lastTime = -1, lastStart = -1;
  for (const word of words) {
    if (!Number.isInteger(word.start) || !Number.isInteger(word.length) || word.length <= 0
      || word.start < lastStart || word.start < 0 || word.start + word.length > text.length
      || !Number.isFinite(word.time) || word.time < lastTime || word.time < 0 || word.time >= duration) return [];
    lastTime = word.time; lastStart = word.start;
  }
  const cues = ranges.map(range => {
    const word = words.find(item => item.start >= range.start && item.start < range.end);
    return word ? { ...range, time: word.time } : null;
  });
  // Missing sentence boundaries must degrade to segment highlighting, never estimated timing.
  if (cues.some(cue => !cue)) return [];
  return cues.map((cue, index) => ({ ...cue, until: cues[index + 1]?.time ?? duration }));
}

function sentenceAtTime(cues, time) {
  if (!Number.isFinite(time) || time < 0) return null;
  return cues?.find(cue => time >= cue.time && time < cue.until) || null;
}

function speechPartOffset(text, parts, part) {
  let cursor = 0;
  for (let i = 0; i <= part; i++) {
    const start = text.indexOf(parts[i], cursor);
    if (start < 0) return null;
    if (i === part) return start;
    cursor = start + parts[i].length;
  }
  return null;
}

module.exports = { normalizeReadingHighlight, sentenceRanges, buildSentenceCues, sentenceAtTime, speechPartOffset };
