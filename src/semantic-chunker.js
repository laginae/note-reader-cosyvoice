'use strict';

const core = require('@laginae/note-reader-core/semantic-chunker');
const sentenceSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'sentence' }) : null;

function openingSentenceCut(text, threshold) {
  const segments = sentenceSegmenter ? sentenceSegmenter.segment(text)
    : Array.from(text.matchAll(/.*?(?:[。！？!?]|\.(?!\d)(?=\s|$)|$)/g), (match) => ({ index: match.index, segment: match[0] }));
  for (const segment of segments) {
    const sentence = segment.segment.trimEnd();
    if (!sentence.trim()) continue;
    if (/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|Figs|Eq|Eqs|Sec|Vol|No|e\.g|i\.e)|\b[A-Z](?:\.[A-Z])*)\.$/i.test(sentence)) continue;
    const end = segment.index + sentence.length;
    if (/[。！？!?.]["'\u2019\u201d\u3009-\u3011\u3015\uff09]*$/.test(sentence)
      && Array.from(text.slice(0, end).replace(/\s/g, '')).length >= threshold) return end;
  }
  return text.length;
}

function splitOpeningAudioParts(text, rapid = false) {
  let remaining = core.normalizeChunkText(text);
  const parts = [];
  const firstEnd = rapid ? openingSentenceCut(remaining, 1) : 0;
  const firstSentence = remaining.slice(0, firstEnd).trim();
  const firstLength = Array.from(firstSentence.replace(/\s/g, '')).length;
  // Numbered headings are not useful standalone opening audio.
  const hasWords = /\p{L}/u.test(firstSentence) && !/^[IVXLCDM]+[.)]$/i.test(firstSentence);
  const firstThreshold = rapid && hasWords && firstLength >= 5 && firstLength < 20 ? firstLength : 20;
  for (const threshold of [firstThreshold, 40]) {
    if (!remaining) break;
    const cut = openingSentenceCut(remaining, threshold);
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

module.exports = { ...core, splitOpeningAudioParts };
