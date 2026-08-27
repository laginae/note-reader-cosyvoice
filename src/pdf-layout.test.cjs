const assert = require('node:assert/strict');
const test = require('node:test');

const { extractPdfTextLayout, extractTextFromPdfItems } = require('./pdf-layout');

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
  const layout = extractPdfTextLayout(items, { viewport: { height: 900, width: 600 } });
  assert.equal(layout.twoColumn, true);
  assert.equal(layout.pageHeight, 900);
  assert.equal(layout.pageWidth, 600);
  assert.deepEqual(
    layout.lines.map(({ text, xMin, y }) => ({ text, xMin, y })),
    [
      { text: 'Paper heading', xMin: 100, y: 800 },
      { text: 'Left one.', xMin: 50, y: 700 },
      { text: 'Left two.', xMin: 50, y: 680 },
      { text: 'Right one.', xMin: 330, y: 700 },
      { text: 'Right two.', xMin: 330, y: 680 },
      { text: 'Page 1', xMin: 220, y: 100 },
    ]
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

test('narrow gutters are detected from content bounds instead of the crop-box midpoint', () => {
  const items = [
    item('Section heading', 70, 760, 450),
    item('Left first.', 44, 730, 251),
    item('Right first.', 307, 730, 251),
    item('Left second.', 44, 710, 251),
    item('Right second.', 307, 710, 251),
    item('Left third.', 44, 690, 251),
    item('Right third.', 307, 690, 251),
  ];

  assert.equal(
    extractTextFromPdfItems(items, { viewport: { width: 555 } }),
    'Section heading\nLeft first.\nLeft second.\nLeft third.\nRight first.\nRight second.\nRight third.'
  );
});

test('an isolated central gap on a single-column page does not create two columns', () => {
  const items = [
    item('First full-width line.', 44, 730, 514),
    item('A phrase before the gap', 44, 710, 251),
    item('continues on the same line.', 307, 710, 251),
    item('Last full-width line.', 44, 690, 514),
  ];

  assert.equal(
    extractTextFromPdfItems(items, { viewport: { width: 555 } }),
    'First full-width line.\nA phrase before the gap continues on the same line.\nLast full-width line.'
  );
});

test('staggered title and author lines keep vertical order above two-column body text', () => {
  const items = [
    item('Main title', 70, 800, 450),
    item('Title continuation', 340, 780, 180),
    item('Author names', 44, 760, 251),
    item('Full-width abstract', 70, 730, 450),
    item('Left body one.', 44, 700, 251),
    item('Right body one.', 307, 700, 251),
    item('Left body two.', 44, 680, 251),
    item('Right body two.', 307, 680, 251),
  ];

  assert.equal(
    extractTextFromPdfItems(items, { viewport: { width: 555 } }),
    'Main title\nTitle continuation\nAuthor names\nFull-width abstract\nLeft body one.\nLeft body two.\nRight body one.\nRight body two.'
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
