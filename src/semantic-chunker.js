'use strict';

const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];

function parseChunkLimits(value, fallback = DEFAULT_CHUNK_LIMITS) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());
  const limits = list
    .map((item) => Math.floor(Number(item)))
    .filter((item) => Number.isFinite(item) && item > 0);
  const fallbackLimits = Array.isArray(fallback)
    ? fallback.filter((item) => Number.isFinite(item) && item > 0)
    : [];

  return limits.length
    ? limits
    : (fallbackLimits.length ? fallbackLimits.slice() : DEFAULT_CHUNK_LIMITS.slice());
}

function normalizeChunkText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findLastBoundary(search, pattern, limit) {
  let match;
  let best = -1;
  pattern.lastIndex = 0;

  while ((match = pattern.exec(search)) !== null) {
    const end = match.index + match[0].length;
    if (end > 0 && end <= limit) {
      best = end;
    }
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }

  return best;
}

function chooseChunkCut(text, limit) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const search = String(text || '').slice(0, safeLimit + 1);
  const minUsefulCut = Math.max(1, Math.floor(safeLimit * 0.35));
  const boundaries = [
    /\n{2,}/g,
    /\n/g,
    /[。！？!?](?:["'\u2019\u201d\u3009-\u3011\u3015\uff09])?\s*/g,
    /\.(?!\d)(?:["'\u2019\u201d])?\s+/g,
    /[，,；;：:]\s*/g,
    /\s+/g,
  ];

  for (const pattern of boundaries) {
    const cut = findLastBoundary(search, pattern, safeLimit);
    if (cut >= minUsefulCut) {
      return cut;
    }
  }

  return safeLimit;
}

function splitTextForSpeechChunks(text, maxLengths = DEFAULT_CHUNK_LIMITS) {
  const limits = parseChunkLimits(maxLengths);
  let remaining = normalizeChunkText(text);
  const chunks = [];

  while (remaining) {
    const limit = limits[Math.min(chunks.length, limits.length - 1)];
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    const cut = chooseChunkCut(remaining, limit);
    const chunk = remaining.slice(0, cut).trim();
    remaining = remaining.slice(cut).trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

function createIncrementalSpeechChunker(maxLengths = DEFAULT_CHUNK_LIMITS, options = {}) {
  const limits = parseChunkLimits(maxLengths);
  const detailed = options && options.detailed === true;
  let buffer = '';
  let chunkCount = 0;
  let spans = [];

  const appendSpan = (length, metadata) => {
    if (length <= 0) {
      return;
    }
    const previous = spans[spans.length - 1];
    if (previous && previous.metadata === metadata) {
      previous.length += length;
    } else {
      spans.push({ length, metadata });
    }
  };

  const consumeSpans = (count) => {
    let remaining = count;
    while (remaining > 0 && spans.length) {
      if (remaining >= spans[0].length) {
        remaining -= spans[0].length;
        spans.shift();
      } else {
        spans[0].length -= remaining;
        remaining = 0;
      }
    }
  };

  const consumeBuffer = (count) => {
    let next = buffer.slice(count);
    const leadingWhitespace = /^\s*/.exec(next)[0].length;
    consumeSpans(count + leadingWhitespace);
    buffer = next.slice(leadingWhitespace);
  };

  const firstMetadata = () => {
    const span = spans.find((entry) => entry.metadata !== null && typeof entry.metadata !== 'undefined');
    return span ? span.metadata : null;
  };

  const formatChunk = (text) => detailed ? { metadata: firstMetadata(), text } : text;

  const takeReadyChunks = (flush) => {
    const chunks = [];
    while (buffer) {
      const limit = limits[Math.min(chunkCount, limits.length - 1)];
      if (buffer.length <= limit) {
        if (flush) {
          const chunk = buffer.trim();
          if (chunk) {
            chunks.push(formatChunk(chunk));
            chunkCount += 1;
          }
          buffer = '';
          spans = [];
        }
        break;
      }

      const cut = chooseChunkCut(buffer, limit);
      const chunk = buffer.slice(0, cut).trim();
      if (chunk) {
        chunks.push(formatChunk(chunk));
        chunkCount += 1;
      }
      consumeBuffer(cut);
    }
    return chunks;
  };

  return {
    push(text, metadata = null) {
      const normalized = normalizeChunkText(text);
      if (normalized) {
        if (buffer) {
          buffer += '\n\n';
          appendSpan(2, null);
        }
        buffer += normalized;
        appendSpan(normalized.length, metadata);
      }
      return takeReadyChunks(false);
    },
    finish() {
      return takeReadyChunks(true);
    },
  };
}

module.exports = {
  DEFAULT_CHUNK_LIMITS,
  chooseChunkCut,
  createIncrementalSpeechChunker,
  normalizeChunkText,
  parseChunkLimits,
  splitTextForSpeechChunks,
};
