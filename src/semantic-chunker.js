'use strict';

const core = require('@laginae/note-reader-core/semantic-chunker');
const sentenceSegmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'sentence' }) : null;

function openingChunkCut(text, limit, flush) {
  let sentenceEnd = 0;
  if (sentenceSegmenter) {
    for (const segment of sentenceSegmenter.segment(text)) {
      const sentence = segment.segment.trimEnd();
      if (!sentence.trim()) continue;
      const abbreviation = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Fig|Figs|Eq|Eqs|Sec|Vol|No|e\.g|i\.e)|\b[A-Z](?:\.[A-Z])*)\.$/i.test(sentence);
      if (abbreviation) continue;
      if (segment.index + segment.segment.length < text.length
        || /[。！？!?.]["'\u2019\u201d\u3009-\u3011\u3015\uff09]*$/.test(sentence)) {
        if (Array.from(text.slice(0, segment.index + sentence.length).replace(/\s/g, '')).length >= 40) {
          sentenceEnd = segment.index + sentence.length;
          break;
        }
      }
    }
  } else {
    const boundaries = text.matchAll(/[。！？!?]["'\u2019\u201d]*|\.(?!\d)(?=\s|$)/g);
    for (const boundary of boundaries) {
      if (Array.from(text.slice(0, boundary.index + boundary[0].length).replace(/\s/g, '')).length >= 40) {
        sentenceEnd = boundary.index + boundary[0].length;
        break;
      }
    }
  }
  const cut = sentenceEnd;
  if (cut > 0 && cut <= limit) return cut;
  if (text.length > limit) return core.chooseChunkCut(text, limit);
  return flush ? text.length : 0;
}

function splitTextForSpeechChunks(text, maxLengths, options = {}) {
  if (!options.openingSentences) return core.splitTextForSpeechChunks(text, maxLengths);
  const normalized = core.normalizeChunkText(text);
  if (!normalized) return [];
  const limits = core.parseChunkLimits(maxLengths);
  const cut = openingChunkCut(normalized, limits[0], true);
  const first = normalized.slice(0, cut).trim();
  const remainder = normalized.slice(cut).trim();
  return [first, ...core.splitTextForSpeechChunks(remainder, limits)].filter(Boolean);
}

function createIncrementalSpeechChunker(maxLengths, options = {}) {
  if (!options.openingSentences) return core.createIncrementalSpeechChunker(maxLengths, options);
  const limits = core.parseChunkLimits(maxLengths);
  const remainder = core.createIncrementalSpeechChunker(limits, options);
  let openingPages = [];
  let openingDone = false;

  const takeOpening = (flush) => {
    const joined = openingPages.map((page) => page.text).join('\n\n');
    if (!joined) return [];
    const cut = openingChunkCut(joined, limits[0], flush);
    if (!cut) return [];
    const first = joined.slice(0, cut).trim();
    const output = [options.detailed ? { text: first, metadata: openingPages[0].metadata } : first];
    // Preserve page metadata when the opening sentences span page boundaries.
    let offset = 0;
    for (const page of openingPages) {
      const tail = page.text.slice(Math.max(0, cut - offset));
      if (tail.trim()) output.push(...remainder.push(tail, page.metadata));
      offset += page.text.length + 2;
    }
    openingPages = [];
    openingDone = true;
    return output;
  };

  return {
    push(text, metadata = null) {
      if (openingDone) return remainder.push(text, metadata);
      const normalized = core.normalizeChunkText(text);
      if (normalized) openingPages.push({ text: normalized, metadata });
      return takeOpening(false);
    },
    finish() {
      return [...(openingDone ? [] : takeOpening(true)), ...remainder.finish()];
    },
  };
}

module.exports = { ...core, createIncrementalSpeechChunker, splitTextForSpeechChunks };
