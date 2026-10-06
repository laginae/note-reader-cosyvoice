'use strict';

const core = require('@laginae/note-reader-core/reading-position');

// The pinned core validates text-document anchors as Markdown; preserve HTML's local kind.
function normalizeReadingPosition(value, filePath = '') {
  const normalized = core.normalizeReadingPosition(
    value && value.kind === 'html' ? { ...value, kind: 'markdown' } : value, filePath
  );
  if (normalized && value.kind === 'html') normalized.kind = 'html';
  if (normalized) {
    normalized.audioTime = Math.max(0, Math.min(86400, Number(value.audioTime) || 0));
    normalized.partIndex = Math.max(0, Math.floor(Number(value.partIndex) || 0));
  }
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
    const original = Object.entries(source).find(([path]) => path.trim().slice(0, 1024) === key)?.[1];
    entry.audioTime = Math.max(0, Math.min(86400, Number(original?.audioTime) || 0));
    entry.partIndex = Math.max(0, Math.floor(Number(original?.partIndex) || 0));
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

function historyMode(settings) {
  return ['off', 'session', 'persistent'].includes(settings?.readingHistoryMode)
    ? settings.readingHistoryMode : settings?.rememberReadingPosition ? 'persistent' : 'off';
}

function settingsForStorage(settings) {
  return { ...settings, readingPositions: historyMode(settings) === 'persistent' ? settings.readingPositions : {} };
}

function sliceTextFromReadingPosition(text, position) {
  const normalized = core.normalizeAnchorText(text);
  const anchor = core.createReadingAnchor(position?.anchor);
  const index = anchor ? normalized.indexOf(anchor) : -1;
  // A shortened or repeated anchor is not reliable enough to choose a location.
  if (index < 0 || normalized.indexOf(anchor, index + 1) >= 0) return { matched: false, text: normalized };
  return { matched: true, text: normalized.slice(index), offset: index };
}

// History uses normalized anchors, but DOM highlighting needs the unchanged
// speech text. Track each normalized UTF-16 unit back to its original grapheme.
function sliceOriginalTextFromReadingPosition(value, position) {
  const source = String(value || '');
  const match = sliceTextFromReadingPosition(source, position);
  if (!match.matched) return { matched: false, text: source };
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source);
  const pieces = [], origins = [];
  for (const { segment, index } of graphemes) {
    const normalized = segment.normalize('NFKC').replace(/\u00ad/g, '');
    pieces.push(normalized);
    for (let n = 0; n < normalized.length; n++) origins.push(index);
  }
  let text = pieces.join(''), offsets = origins;
  const replace = (pattern, replacement) => {
    let cursor = 0; const output = [], mapping = [];
    const append = (from, to) => {
      output.push(text.slice(from, to));
      for (let i = from; i < to; i++) mapping.push(offsets[i]);
    };
    for (const found of text.matchAll(pattern)) {
      append(cursor, found.index);
      const kept = replacement(found);
      output.push(kept);
      for (let n = 0; n < kept.length; n++) mapping.push(offsets[found.index]);
      cursor = found.index + found[0].length;
    }
    append(cursor, text.length); text = output.join(''); offsets = mapping;
  };
  replace(/([A-Za-z])-\s+(?=[a-z])/g, found => found[1]);
  replace(/\s+/g, () => ' ');
  const leading = text.length - text.trimStart().length;
  if (text.trim() !== core.normalizeAnchorText(source)) return { matched: false, text: source };
  const originalOffset = offsets[leading + match.offset];
  if (!Number.isInteger(originalOffset)) return { matched: false, text: source };
  const remainder = source.slice(originalOffset);
  // Do not start inside a compatibility ligature or another expanding grapheme.
  if (core.normalizeAnchorText(remainder) !== match.text) return { matched: false, text: source };
  return { matched: true, text: remainder, offset: originalOffset };
}

module.exports = { ...core, normalizeReadingPosition, normalizeReadingPositions, upsertReadingPosition, removeReadingPosition, historyMode, settingsForStorage, sliceTextFromReadingPosition, sliceOriginalTextFromReadingPosition };
