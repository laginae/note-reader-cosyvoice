'use strict';

const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { speakGreekSymbols } = require('./math-symbols');

function normalizePdfSpeechText(text) {
  return speakGreekSymbols(String(text || '').normalize('NFKC').replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s*\n\s*(?=[a-z])/g, '$1')).replace(/[ \t]+/g, ' ');
}

// Capture only the selected portions of text-layer spans. No DOM references or
// unselected page text are retained, so toolbar focus cannot widen the scope.
function capturePdfSelectionLayout(range, root, selectedText) {
  if (!root.querySelectorAll || !range.intersectsNode) return null;
  try {
    const pages = [], pieces = [];
    let count = 0;
    for (const page of root.querySelectorAll('[data-page-number]')) {
      if (!range.intersectsNode(page)) continue;
      const bounds = page.getBoundingClientRect();
      if (!(bounds.width > 0 && bounds.height > 0)) return null;
      const items = [];
      const spans = [...page.querySelectorAll('.textLayer span')].filter(span => !span.querySelector('span') && span.textContent.trim());
      for (const [spanIndex, span] of spans.entries()) {
        if (!range.intersectsNode(span)) continue;
        if (++count > 50000) return null;
        const part = span.ownerDocument.createRange(); part.selectNodeContents(span);
        if (part.compareBoundaryPoints(0, range) < 0) part.setStart(range.startContainer, range.startOffset);
        if (part.compareBoundaryPoints(2, range) > 0) part.setEnd(range.endContainer, range.endOffset);
        const str = part.toString();
        if (!str) continue;
        pieces.push(str);
        if (!str.trim()) continue;
        const rect = typeof part.getBoundingClientRect === 'function' ? part.getBoundingClientRect() : span.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;
        const fontName = span.ownerDocument.defaultView?.getComputedStyle(span).fontFamily || span.style.fontFamily || '';
        const prefix = span.ownerDocument.createRange(); prefix.selectNodeContents(span);
        prefix.setEnd(part.startContainer, part.startOffset);
        const selectionStart = prefix.toString().length;
        items.push({ str, spanIndex, selectionStart, selectionEnd: selectionStart + str.length,
          width: rect.width, height: rect.height, fontName,
          transform: [rect.height, 0, 0, rect.height, rect.left - bounds.left, bounds.bottom - rect.bottom] });
      }
      if (items.length) pages.push({ items, pageNumber: Number(page.getAttribute('data-page-number')),
        viewport: { width: bounds.width, height: bounds.height } });
    }
    const compact = text => text.normalize('NFKC').replace(/\s/g, '');
    if (!pages.length || compact(pieces.join('')) !== compact(selectedText)) return null;
    return pages;
  } catch (_) { return null; }
}

function preparePdfSelection(context, settings) {
  if (!context.selectionLayout?.length) return normalizePdfSpeechText(context.selectedText);
  return context.selectionLayout.map(page => {
    const layout = extractPdfTextLayout(page.items, { viewport: page.viewport });
    const changes = pdfMathChanges(layout, page.items, settings);
    return normalizePdfSpeechText(applyPdfMathChanges(layout.text, changes));
  }).join('\n\n');
}

module.exports = { capturePdfSelectionLayout, preparePdfSelection, normalizePdfSpeechText };
