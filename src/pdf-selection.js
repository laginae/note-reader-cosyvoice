'use strict';

const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges, normalizePdfReferenceRows, encodedMathFonts } = require('./pdf-math');
const { speakGreekSymbols } = require('./math-symbols');

function normalizePdfSpeechText(text) {
  const normalized = String(text || '').normalize('NFKC').replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s*\n\s*(?=[a-z])/g, '$1');
  return speakGreekSymbols(normalizePdfReferenceRows(normalized)).replace(/[ \t]+/g, ' ');
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

function selectedPageMathChanges(page, layout, settings) {
  return pdfMathChanges(layout, page.items, settings, {}, new Set(page.mathEncodedFonts || []));
}

const needsPdfMathEvidence = page => page.items?.some(i => /[\u{1d400}-\u{1d7ff}\u0d45-\u0d52]/u.test(i.str));

async function enrichPdfSelection(context, getPage, ops) {
  const selectionLayout = [];
  for (const selected of context.selectionLayout) {
    let result = selected;
    try {
      const page = needsPdfMathEvidence(selected) && getPage(selected.pageNumber);
      if (page) {
        const vp = page.getViewport({ scale: 1 }), bounds = selected.viewport;
        if (vp.rotation || !vp.convertToViewportPoint || !(bounds?.width > 0 && bounds.height > 0)) throw Error();
        const items = (await page.getTextContent()).items.filter(i => i.str?.trim());
        // The DOM can merge or omit spans. Verify both the selected substring
        // and its position before borrowing any geometry from the original page.
        const sx = vp.width / bounds.width, sy = vp.height / bounds.height;
        const matches = selected.items.map(s => {
          const o = items[s.spanIndex];
          if (!o?.transform || !Number.isInteger(s.selectionStart) || !Number.isInteger(s.selectionEnd)
            || s.selectionStart < 0 || s.selectionEnd > o.str.length || s.selectionEnd - s.selectionStart !== s.str.length
            || o.str.slice(s.selectionStart, s.selectionEnd) !== s.str) throw Error();
          const [x,y] = vp.convertToViewportPoint(o.transform[4], o.transform[5]);
          const left=s.transform[4]*sx, right=left+s.width*sx, top=(bounds.height-s.transform[5])*sy;
          const whole = s.selectionStart === 0 && s.selectionEnd === o.str.length;
          if (!(o.height > 0 && Number.isFinite(left+right+top+x+y)) || Math.abs(top-y)>o.height*.9) throw Error();
          // Justified spans and math fonts can have different DOM advance widths.
          // For a whole, identical span its leading edge is the reliable anchor.
          if (whole ? Math.abs(left-x)>o.height*.55 || Math.abs(right-left-o.width)>Math.max(o.height*1.5,o.width*.45)
            : left<x-o.height*.55 || right>x+o.width+o.height*.55) throw Error();
          const start = whole ? 0 : Math.max(0, Math.min(left-x, o.width));
          const w = whole ? o.width : Math.min(o.width-start, s.width*sx);
          if (!(w>0)) throw Error();
          return { s, o, shape: { ...s, fontName:o.fontName, height:o.height, width:w,
            transform:[...o.transform.slice(0,4),o.transform[4]+start,o.transform[5]] } };
        });
        let bars;
        if (ops && page.getOperatorList && matches.some(m => /[\u{1d400}-\u{1d7ff}]/u.test(m.s.str))) {
          try { bars = require('./pdf-math-bars').pdfBarOffsets(items, await page.getOperatorList(), ops); }
          catch { /* Keep the verified text spans when drawing data is unavailable. */ }
        }
        const fonts = encodedMathFonts(items);
        const pageLayout = extractPdfTextLayout(items, {viewport:vp});
        const midpoint = (Math.min(...pageLayout.lines.map(l=>l.xMin)) + Math.max(...pageLayout.lines.map(l=>l.xMax))) / 2;
        const singleColumn = !pageLayout.twoColumn || matches.every(({o})=>o.transform[4]+o.width<=midpoint)
          || matches.every(({o})=>o.transform[4]>=midpoint);
        result = { ...selected, singleColumn, viewport:{width:vp.width,height:vp.height},
          mathEncodedFonts:[...new Set(matches.map(m=>m.o.fontName).filter(f=>fonts.has(f)))],
          items:matches.map(({s,o,shape})=>{
            const offsets = (bars?.get(o)||[]).filter(i=>i>=s.selectionStart && i<s.selectionEnd);
            return offsets.length ? { ...shape, mathBarOffsets:offsets.map(i=>i-s.selectionStart) } : shape;
          }) };
      }
    } catch { /* Keep only the original captured selection when verification fails. */ }
    selectionLayout.push(result);
  }
  return { ...context, selectionLayout };
}

function preparePdfSelection(context, settings) {
  if (!context.selectionLayout?.length) return normalizePdfSpeechText(context.selectedText);
  return context.selectionLayout.map(page => {
    const layout = extractPdfTextLayout(page.items, { viewport: page.viewport, singleColumn:page.singleColumn });
    const changes = selectedPageMathChanges(page, layout, settings);
    return normalizePdfSpeechText(applyPdfMathChanges(layout.text, changes));
  }).join('\n\n');
}

module.exports = { capturePdfSelectionLayout, preparePdfSelection, normalizePdfSpeechText, needsPdfMathEvidence, enrichPdfSelection, selectedPageMathChanges };
