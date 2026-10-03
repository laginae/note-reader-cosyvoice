'use strict';

const core = require('@laginae/note-reader-core/reading-position');

// The pinned core validates text-document anchors as Markdown; preserve HTML's local kind.
function normalizeReadingPosition(value, filePath = '') {
  const normalized = core.normalizeReadingPosition(
    value && value.kind === 'html' ? { ...value, kind: 'markdown' } : value, filePath
  );
  if (normalized && value.kind === 'html') normalized.kind = 'html';
  return normalized;
}

function normalizeReadingPositions(value, maxEntries) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const htmlPaths = new Set(Object.entries(source)
    .filter(([, entry]) => entry && entry.kind === 'html')
    .map(([key]) => String(key).trim().slice(0, 1024)));
  const adapted = Object.fromEntries(Object.entries(source).map(([key, entry]) => [key,
    entry && entry.kind === 'html' ? { ...entry, kind: 'markdown' } : entry,
  ]));
  const normalized = core.normalizeReadingPositions(adapted, maxEntries);
  for (const [key, entry] of Object.entries(normalized)) {
    if (htmlPaths.has(key)) entry.kind = 'html';
  }
  return normalized;
}

function upsertReadingPosition(positions, value, maxEntries) {
  const normalized = normalizeReadingPosition(value, value && value.filePath);
  if (!normalized) return normalizeReadingPositions(positions, maxEntries);
  return normalizeReadingPositions({ ...normalizeReadingPositions(positions, maxEntries), [normalized.filePath]: normalized }, maxEntries);
}

function removeReadingPosition(positions, filePath) {
  const result = normalizeReadingPositions(positions);
  delete result[String(filePath || '')];
  return result;
}

module.exports = { ...core, normalizeReadingPosition, normalizeReadingPositions, upsertReadingPosition, removeReadingPosition };
