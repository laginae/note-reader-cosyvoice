'use strict';

const { extractHtmlTreeText } = require('./html-text');

function readerRange(root) {
  const selection = root?.ownerDocument.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer) ? range.cloneRange() : null;
}

function extractReaderSelection(root, range) {
  if (!root || !range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const result = extractHtmlTreeText(root, range, {
    omitNode: node => node.nodeType === 1 && (node.localName === 'mjx-assistive-mml' || node.classList.contains('copy-code-button')),
  });
  return result.selection ? { ...result.selection, text: result.text } : null;
}

// Heading offsets come from Obsidian's Markdown parser, not a second Markdown grammar.
function outlineSections(text, headings = []) {
  const entries = [];
  for (const heading of headings) {
    const from = heading.position?.start?.offset, end = heading.position?.end?.offset;
    if (!Number.isInteger(from) || !Number.isInteger(end) || from < 0 || end <= from || end > text.length
      || heading.level < 1 || heading.level > 6 || !heading.heading?.trim()) continue;
    const raw = text.slice(from, end);
    if (!raw.includes(heading.heading.trim())) continue;
    entries.push({ title: heading.heading, level: heading.level, from, line: heading.position.start.line });
  }
  entries.sort((a, b) => a.from - b.from);
  return entries.filter((entry, index) => index === 0 || entry.from !== entries[index - 1].from).map((entry, index, all) => ({
    ...entry, to: all.slice(index + 1).find(next => next.level <= entry.level)?.from ?? text.length,
  }));
}

module.exports = { readerRange, extractReaderSelection, outlineSections };
