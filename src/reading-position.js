'use strict';

const MAX_READING_POSITIONS = 100;
const MAX_ANCHOR_LENGTH = 180;

function normalizeAnchorText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s+(?=[a-z])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function createReadingAnchor(text) {
  return normalizeAnchorText(text).slice(0, MAX_ANCHOR_LENGTH);
}

function normalizeReadingPosition(value, filePath = '') {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const normalizedPath = String(filePath || value.filePath || '').trim().slice(0, 1024);
  const anchor = createReadingAnchor(value.anchor);
  const kind = value.kind === 'pdf' ? 'pdf' : value.kind === 'markdown' ? 'markdown' : '';
  if (!normalizedPath || !anchor || !kind) {
    return null;
  }
  const pageNumber = kind === 'pdf'
    ? Math.max(1, Math.floor(Number(value.pageNumber) || 1))
    : null;
  return {
    anchor,
    chunkIndex: Math.max(0, Math.floor(Number(value.chunkIndex) || 0)),
    fileMtime: Math.max(0, Math.floor(Number(value.fileMtime) || 0)),
    filePath: normalizedPath,
    kind,
    pageNumber,
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || Date.now())),
  };
}

function normalizeReadingPositions(value, maxEntries = MAX_READING_POSITIONS) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = Object.entries(source)
    .map(([filePath, position]) => normalizeReadingPosition(position, filePath))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(1, Math.floor(Number(maxEntries) || MAX_READING_POSITIONS)));
  return Object.fromEntries(normalized.map((position) => [position.filePath, position]));
}

function upsertReadingPosition(positions, position, maxEntries = MAX_READING_POSITIONS) {
  const normalized = normalizeReadingPosition(position, position && position.filePath);
  if (!normalized) {
    return normalizeReadingPositions(positions, maxEntries);
  }
  return normalizeReadingPositions({
    ...normalizeReadingPositions(positions, maxEntries),
    [normalized.filePath]: normalized,
  }, maxEntries);
}

function removeReadingPosition(positions, filePath) {
  const normalized = normalizeReadingPositions(positions);
  delete normalized[String(filePath || '')];
  return normalized;
}

function sliceTextFromReadingPosition(text, position) {
  const normalizedText = normalizeAnchorText(text);
  const anchor = createReadingAnchor(position && position.anchor);
  if (!normalizedText || !anchor) {
    return { matched: false, text: normalizedText };
  }
  const candidateLengths = [anchor.length, 140, 100, 72, 48, 32, 20, 12]
    .map((length) => Math.min(anchor.length, length))
    .filter((length, index, values) => length >= 12 && values.indexOf(length) === index);
  const lowerText = normalizedText.toLocaleLowerCase();

  for (const length of candidateLengths) {
    const candidate = anchor.slice(0, length);
    let index = normalizedText.indexOf(candidate);
    if (index < 0) {
      index = lowerText.indexOf(candidate.toLocaleLowerCase());
    }
    if (index >= 0) {
      return { matched: true, text: normalizedText.slice(index) };
    }
  }
  return { matched: false, text: normalizedText };
}

module.exports = {
  MAX_ANCHOR_LENGTH,
  MAX_READING_POSITIONS,
  createReadingAnchor,
  normalizeAnchorText,
  normalizeReadingPosition,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  upsertReadingPosition,
};
