'use strict';

const { normalizeChunkText, parseChunkLimits, chooseChunkCut } = require('./semantic-chunker');
const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

function sentenceCut(text, limit) {
  let cut = 0;
  for (const part of segmenter.segment(text)) {
    const sentence = part.segment.trimEnd(), end = part.index + sentence.length;
    if (end > limit) break;
    if (/[。！？!?.]["'\u2019\u201d)]*$/.test(sentence)
      && !/\b(?:Mr|Mrs|Dr|Prof|Fig|Figs|Eq|Eqs|Sec|vs|etc|e\.g|i\.e)\.$/i.test(sentence)) cut = end;
  }
  if (cut) return cut;
  // A long sentence still respects the engine cap; prefer clauses, then words.
  let fallback = chooseChunkCut(text, limit);
  if (fallback > 0 && /[\uD800-\uDBFF]/.test(text[fallback - 1]) && /[\uDC00-\uDFFF]/.test(text[fallback] || '')) fallback--;
  return Math.max(1, fallback);
}

function createPdfSpeechChunker(maxLengths) {
  const limits = parseChunkLimits(maxLengths);
  let buffer = '', count = 0;
  const spans = [];
  function take(flush) {
    const result = [];
    while (buffer) {
      const limit = limits[Math.min(count, limits.length - 1)];
      if (!flush && buffer.length <= limit) break;
      const cut = buffer.length <= limit ? buffer.length : sentenceCut(buffer, limit);
      const text = buffer.slice(0, cut).trim();
      if (text) { result.push({ text, metadata: spans.find(span => span.metadata)?.metadata || null }); count++; }
      const consumed = cut + /^\s*/.exec(buffer.slice(cut))[0].length;
      buffer = buffer.slice(consumed);
      let left = consumed;
      while (left > 0 && spans.length) {
        const amount = Math.min(left, spans[0].length);
        left -= amount; spans[0].length -= amount;
        if (!spans[0].length) spans.shift();
      }
    }
    return result;
  }
  return {
    push(text, metadata = null) {
      const normalized = normalizeChunkText(text).replace(/\s+/g, ' ');
      if (normalized) {
        if (buffer) { buffer += ' '; spans.push({ length: 1, metadata: null }); }
        buffer += normalized; spans.push({ length: normalized.length, metadata });
      }
      return take(false);
    },
    finish: () => take(true),
  };
}

module.exports = { createPdfSpeechChunker, sentenceCut };
