'use strict';

// Match normalized PDF selection text without replacing the source stream:
// NFKC expands ligatures and folds mathematical alphabets used for positioning.
function pdfSelectionSourceMap(source) {
  const characters = [];
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source);
  for (const { segment, index } of segments) {
    for (const char of segment.normalize('NFKC')) {
      if (char === '\u00ad') continue;
      for (let i = 0; i < char.length; i++) characters.push({ char: char[i], offset: index });
    }
  }
  let text = characters.map(item => item.char).join('');
  const removed = new Set();
  for (const match of text.matchAll(/([A-Za-z])-\s+(?=[a-z])/g)) {
    for (let i = match.index + 1; i < match.index + match[0].length; i++) removed.add(i);
  }
  const kept = characters.filter((_, index) => !removed.has(index));
  const normalized = [];
  for (const item of kept) {
    if (/\s/.test(item.char)) {
      if (normalized.length && normalized.at(-1).char !== ' ') normalized.push({ char: ' ', offset: item.offset });
    } else normalized.push(item);
  }
  if (normalized.at(-1)?.char === ' ') normalized.pop();
  text = normalized.map(item => item.char).join('');
  return { text, offsets: normalized.map(item => item.offset) };
}

module.exports = { pdfSelectionSourceMap };
