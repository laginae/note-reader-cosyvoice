const assert = require('node:assert/strict');
const test = require('node:test');

const { extractTextFromPdfItems } = require('./pdf-layout');

function item(str, x, y, width = 100) {
  return { height: 12, str, transform: [1, 0, 0, 12, x, y], width };
}

test('two-column pages read the left column before the right column', () => {
  const items = [
    item('Paper heading', 100, 800, 400),
    item('Right one.', 330, 700, 180),
    item('Left one.', 50, 700, 180),
    item('Right two.', 330, 680, 180),
    item('Left two.', 50, 680, 180),
    item('Page 1', 220, 100, 160),
  ];

  assert.equal(
    extractTextFromPdfItems(items, { viewport: { width: 600 } }),
    'Paper heading\nLeft one.\nLeft two.\nRight one.\nRight two.\nPage 1'
  );
});

test('full-width lines divide independent two-column reading bands', () => {
  const items = [
    item('Section A', 100, 800, 400),
    item('A right.', 330, 740, 180),
    item('A left.', 50, 740, 180),
    item('Section B', 100, 700, 400),
    item('B right.', 330, 640, 180),
    item('B left.', 50, 640, 180),
    item('B right two.', 330, 620, 180),
    item('B left two.', 50, 620, 180),
  ];

  assert.equal(
    extractTextFromPdfItems(items, { viewport: { width: 600 } }),
    'Section A\nA left.\nA right.\nSection B\nB left.\nB left two.\nB right.\nB right two.'
  );
});

test('single-column pages retain vertical order and coordinate-free PDFs fall back safely', () => {
  assert.equal(
    extractTextFromPdfItems([
      item('First line.', 60, 700, 420),
      item('Second line.', 60, 680, 420),
      item('Third line.', 60, 660, 420),
    ], { viewport: { width: 600 } }),
    'First line.\nSecond line.\nThird line.'
  );
  assert.equal(
    extractTextFromPdfItems([
      { str: 'Fallback' },
      { hasEOL: true, str: 'order.' },
    ]),
    'Fallback order.'
  );
});
