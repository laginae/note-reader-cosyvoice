'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { outlineTypography, detectPdfHeadings, numbering } = require('../src/pdf-outline-detection');
const { pdfDocumentOptions } = require('../src/pdf-document-options');

const prose = 'This public example explains the procedure and describes the observations.';
function page(number, specifications, { origin = 0, rotation = 0 } = {}) {
  const rows = [...specifications, ...[220, 200, 180].map(y => ({ text: prose, y }))];
  let text = '';
  const items = [], lines = [];
  for (const [index, row] of rows.entries()) {
    const value = row.text, x = row.x ?? 40, y = (row.y ?? 720 - index * 30) + origin;
    const size = row.size || 10.5, fontName = row.font || 'f_body';
    const width = row.width || 240;
    lines.push({ text: value, offset: text.length, xMin: x, xMax: x + width, y, footnote: !!row.footnote });
    text += value + '\n';
    items.push({ str: value, height: size, width, fontName, transform: [size, 0, 0, size, x, y] });
  }
  const layout = outlineTypography({ text, lines }, items, { f_head: { fontFamily: 'serif' }, f_body: { fontFamily: 'serif' } },
    { height: 800, width: 600, viewBox: [0, origin, 600, origin + 800], rotation });
  return { ...layout, number };
}

test('CJK main headings and same-size children use relative size and learned font identity', () => {
  const pages = [page(1, [
    { text: '1 \u7814\u7a76\u6982\u8ff0', size: 12, font: 'f_head' },
    { text: '1.1 \u6837\u672c\u8bbe\u8ba1', font: 'f_head' },
    { text: prose },
  ]), page(2, [
    { text: '2 \u5b9e\u9a8c\u65b9\u6848', size: 12, font: 'f_head' },
    { text: '2.1 \u89c2\u6d4b\u6d41\u7a0b', font: 'f_head' },
    { text: '2.2 \u8bc4\u4ef7\u6307\u6807', font: 'f_head' },
  ])];
  const before = JSON.stringify(pages), entries = detectPdfHeadings(pages);
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map(e => e.level), [1, 2, 1, 2, 2]);
  for (const e of entries) assert.ok(pages[e.page - 1].text.slice(e.offset).startsWith(e.title));
  assert.equal(JSON.stringify(pages), before, 'Detection must not alter source text or offsets');
});

test('numeric prose, decimal measurements and theorem bodies are not sections', () => {
  const rows = [
    { text: '1. Methods', size: 12, font: 'f_head' },
    { text: '18 \u4e2a\u6837\u672c\u5206\u4e3a\u4e09\u7ec4\uff0c\u5206\u522b\u4f7f\u7528\u4e0d\u540c\u6761\u4ef6' },
    { text: '3 \u6761\u8bb0\u5f55\u53d1\u751f\u53d8\u5316\u3002\u5176\u4f59\u8bb0\u5f55\u4fdd\u6301\u4e0d\u53d8' },
    { text: '8.765 kg was measured during the public demonstration' },
    { text: '1.25 MW measured at the station' },
    { text: '\u547d\u9898 2 (\u793a\u4f8b)\u3002\u7531\u6b64\u53ef\u5f97\u4e0b\u5f0f', font: 'f_head' },
    { text: '\u547d\u9898 3 (\u793a\u4f8b)', font: 'f_head' },
    { text: 'Theorem 2 (Example)', size: 12, font: 'f_head' },
    { text: 'Proof. The following statement holds.', font: 'f_head' },
    { text: '1.1 Instrument setup', font: 'f_head' },
  ];
  assert.deepEqual(detectPdfHeadings([page(2, rows)]).map(e => e.title), ['1. Methods', '1.1 Instrument setup']);
});

test('weak numbered prose needs a reliable parent or sibling instead of matching any number', () => {
  const p = page(2, [
    { text: '3. Experimental setup', font: 'f_head', size: 12 },
    { text: '3.1 Sensor placement' },
    { text: '87 Additional observations in a running sentence' },
    { text: '4. A comparison', font: 'f_head', size: 12 },
    { text: '4.1 Processing choices' },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), [
    '3. Experimental setup', '3.1 Sensor placement', '4. A comparison', '4.1 Processing choices',
  ]);
});

test('multi-line headings join once and keep the first line source offset', () => {
  const p = page(2, [
    { text: '2. Experimental', y: 720, size: 12, font: 'f_head' },
    { text: 'design and evaluation', y: 704, size: 12, font: 'f_head' },
    { text: 'across multiple groups', y: 688, size: 12, font: 'f_head' },
    { text: prose, y: 668 },
    { text: '3. Results', y: 580, size: 12, font: 'f_head' },
  ]);
  const entries = detectPdfHeadings([p]);
  assert.deepEqual(entries.map(e => e.title), ['2. Experimental design and evaluation across multiple groups', '3. Results']);
  assert.equal(entries[0].offset, 0);
  assert.ok(p.text.slice(entries[0].offset).startsWith('2. Experimental\n'));
});

test('two-column headings at the same height retain reading order and separate coordinates', () => {
  const p = page(2, [
    { text: '2. Methods', x: 40, y: 720, size: 12, font: 'f_head', width: 210 },
    { text: prose, x: 40, y: 690, width: 210 },
    { text: '2.1 Sampling', x: 40, y: 600, font: 'f_head', width: 210 },
    { text: '3. Findings', x: 320, y: 720, size: 12, font: 'f_head', width: 210 },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => [e.title, e.x]), [
    ['2. Methods', 40], ['2.1 Sampling', 40], ['3. Findings', 320],
  ]);
});

test('repeated headers, captions, contents rows and footnotes stay out of the outline', () => {
  const pages = [1, 2].map(n => page(n, [
    { text: 'Public journal ' + n, y: 770, size: 12, font: 'f_head' },
    { text: n + '. Methods', y: 700, size: 12, font: 'f_head' },
    { text: 'Table 1 Measurements', size: 12, font: 'f_head' },
    { text: 'Figure 2 Overview', size: 12, font: 'f_head' },
    { text: '3. Results .... 8', font: 'f_head' },
    { text: '7. Supplementary note', font: 'f_head', footnote: true },
    { text: '8. Tiny note', size: 8 },
  ]));
  assert.deepEqual(detectPdfHeadings(pages).map(e => e.title), ['1. Methods', '2. Methods']);
});

test('reference lists are excluded while later appendices and document statements remain available', () => {
  const p = page(2, [
    { text: '4. Conclusions', size: 12, font: 'f_head' },
    { text: 'Data availability statement', size: 12, font: 'f_head' },
    { text: 'Public materials statement', size: 12, font: 'f_head' },
    { text: 'References', size: 12, font: 'f_head' },
    { text: '1. Author A public publication', font: 'f_head' },
    { text: 'Appendix A', size: 12, font: 'f_head' },
    { text: 'A. Additional procedure', size: 12, font: 'f_head' },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), [
    '4. Conclusions', 'Data availability statement', 'Public materials statement', 'References', 'Appendix A', 'A. Additional procedure',
  ]);
});

test('cropped-page origins and rotated mobile pages do not corrupt coordinates', () => {
  const p = page(2, [{ text: '2. Methods', y: 700, size: 12, font: 'f_head' }], { origin: 300 });
  assert.equal(detectPdfHeadings([p])[0].y, 1000);
  assert.deepEqual(detectPdfHeadings([page(2, [{ text: '2. Methods' }], { rotation: 90 })]), []);
});

test('numbering supports Chinese and Roman chapters without treating years and long decimals as sections', () => {
  assert.equal(numbering('\u7b2c\u4e8c\u7ae0\u5b9e\u9a8c\u8bbe\u8ba1').level, 1);
  assert.equal(numbering('\u7b2c\u4e8c\u8282 \u8bb0\u5f55\u65b9\u6cd5').level, 2);
  assert.equal(numbering('IV. RESULTS').level, 1);
  assert.equal(numbering('A. Further details').level, 2);
  assert.equal(numbering('105.1 Additional chapter').level, 2);
  assert.equal(numbering('2026 publication year'), null);
  assert.equal(numbering('8.765 kg measured'), null);
  assert.deepEqual(detectPdfHeadings([page(1, [{ text: '1. introduction' }])]).map(e => e.title), ['1. introduction']);
});

test('PDF options reuse local host resources without loading a runtime or contacting a remote origin', () => {
  const data = new Uint8Array([1, 2, 3]);
  const options = pdfDocumentOptions(data);
  assert.equal(options.data, data);
  assert.equal(options.cMapPacked, true);
  for (const key of ['cMapUrl', 'standardFontDataUrl', 'wasmUrl']) assert.match(options[key], /^\/lib\/pdfjs\/[a-z_]+\/$/);
  options.cMapUrl = 'changed';
  assert.equal(pdfDocumentOptions(data).cMapUrl, '/lib/pdfjs/cmaps/');
});

test('heading-only pages reuse document body size instead of treating their title as body text', () => {
  const heading = '2. Experimental preparation';
  const item = { str: heading, height: 12, width: 240, fontName: 'f_head', transform: [12, 0, 0, 12, 40, 700] };
  const isolated = { ...outlineTypography({ text: heading, lines: [{ text: heading, offset: 0, y: 700, xMin: 40, xMax: 280 }] },
    [item], {}, { height: 800, width: 600 }), number: 2 };
  const pages = [page(1, [{ text: '1. Introduction', size: 12, font: 'f_head' }]), isolated];
  assert.deepEqual(detectPdfHeadings(pages).map(e => e.title), ['1. Introduction', heading]);
});

test('short question headings and dotted acronyms are not mistaken for body sentences', () => {
  const p = page(2, [
    { text: '2. U.S. Observations', size: 12, font: 'f_head' },
    { text: '2.1 What changes?', font: 'f_head' },
    { text: '3. This is a sentence. Another sentence follows', font: 'f_head' },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), ['2. U.S. Observations', '2.1 What changes?']);
});

test('wrapped proof headings retain their theorem reference without including theorem statements', () => {
  const p = page(2, [
    { text: '3 Proof of', y: 720, size: 12, font: 'f_head' },
    { text: 'Theorem 2', y: 704, size: 12, font: 'f_head' },
    { text: prose, y: 680 },
    { text: '4 Discussion', y: 620, size: 12, font: 'f_head' },
    { text: 'Theorem 3 (Example)', y: 604, size: 12, font: 'f_head' },
    { text: 'Let the observations be independent.', y: 580 },
    { text: '5 Proof of', y: 520, size: 12, font: 'f_head' },
    { text: 'Theorem 4. Suppose the measurements are positive.', y: 504, size: 12, font: 'f_head' },
  ]);
  const entries = detectPdfHeadings([p]);
  assert.deepEqual(entries.map(e => e.title), ['3 Proof of Theorem 2', '4 Discussion', '5 Proof of']);
  assert.equal(entries[0].offset, 0);
  assert.equal(entries.filter(e => e.title === 'Theorem 2').length, 0);
  assert.ok(entries.every(e => e.inferred));
});

test('academic topic headings are distinct from bare labels and statement introductions', () => {
  const p = page(2, [
    { text: '2. Methods', size: 12, font: 'f_head', y: 720 },
    { text: 'Theorem 2 and its consequences', size: 12, font: 'f_head', y: 670 },
    { text: prose, y: 640 },
    { text: 'Proof of Theorem 2', size: 12, font: 'f_head', y: 600 },
    { text: prose, y: 570 },
    { text: 'Theorem 3. Let the sample be finite', size: 12, font: 'f_head', y: 520 },
    { text: 'Lemma A (Example)', size: 12, font: 'f_head', y: 470 },
    { text: 'Proof. By induction the claim follows', size: 12, font: 'f_head', y: 420 },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), [
    '2. Methods', 'Theorem 2 and its consequences', 'Proof of Theorem 2',
  ]);
});

test('a theorem label in another column or body font cannot complete a proof heading', () => {
  const pages = [page(2, [
    { text: '3 Proof of', y: 720, size: 12, font: 'f_head', width: 210 },
    { text: 'Theorem 2', x: 320, y: 704, size: 12, font: 'f_head', width: 210 },
  ]), page(3, [
    { text: '4 Proof of', y: 720, size: 12, font: 'f_head' },
    { text: 'Theorem 3', y: 704 },
  ])];
  assert.deepEqual(detectPdfHeadings(pages).map(e => e.title), ['3 Proof of', '4 Proof of']);
});

test('ordinary-font section titles may contain digits and verbs before same-font body text', () => {
  const title = '2.1 \u91c7\u75283\u79cd\u6a21\u578b\uff0c\u63d0\u9ad8\u9884\u6d4b\u7cbe\u5ea6';
  const p = page(2, [
    { text: '2 \u5b9e\u9a8c\u65b9\u6cd5', size: 12, font: 'f_head', y: 720 },
    { text: title, y: 680 },
    { text: '\u8fd9\u4e9b\u65b9\u6cd5\u4f7f\u7528\u516c\u5f00\u6837\u4f8b\u8fdb\u884c\u5bf9\u7167\uff0c\u5e76\u5206\u522b\u8bb0\u5f55\u7ed3\u679c\u3002', y: 666 },
    { text: '2.2 Comparison of 3 methods', y: 620 },
    { text: 'these methods use the same public observations.', y: 606 },
  ]);
  const entries = detectPdfHeadings([p]);
  assert.deepEqual(entries.map(e => e.title), ['2 \u5b9e\u9a8c\u65b9\u6cd5', title.normalize('NFKC'), '2.2 Comparison of 3 methods']);
  assert.ok(p.text.slice(entries[1].offset).startsWith(title));
});

test('a count sentence needs continuing body layout before it is excluded as numeric prose', () => {
  const count = '4 \u4e2a\u6837\u672c\u53c2\u4e0e\u89c2\u6d4b\uff0c\u5206\u522b\u8bb0\u5f55\u4e862\u7c7b\u7ed3\u679c';
  const continuation = '\u8fd9\u4e9b\u89c2\u6d4b\u503c\u4ec5\u7528\u4e8e\u516c\u5f00\u793a\u4f8b\uff0c\u5176\u4f59\u8bb0\u5f55\u4fdd\u6301\u4e0d\u53d8\u3002';
  const p = page(2, [
    { text: '3 Results', size: 12, font: 'f_head', y: 720 },
    { text: count, y: 680 },
    { text: continuation, y: 666 },
    { text: '5 Discussion', size: 12, font: 'f_head', y: 620 },
  ]);
  assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), ['3 Results', '5 Discussion']);
  // A number, a verb and another line alone do not prove that a title is prose.
  for (const next of [
    { y: 630 }, { x: 320, width: 210 }, { font: 'f_head' },
  ]) {
    const separated = page(2, [
      { text: '3 Results', size: 12, font: 'f_head', y: 720 },
      { text: count, y: 680 },
      { text: continuation, y: 666, ...next },
    ]);
    assert.ok(detectPdfHeadings([separated]).some(e => e.title === count.normalize('NFKC')));
  }
});

test('wrapped headings allow dotted, lettered and Chinese theorem references without swallowing the next statement', () => {
  for (const [start, reference] of [
    ['6 Proof of', 'Theorem 2.1'],
    ['6 Discussion of', 'Lemma A.2'],
    ['6 Proof of', 'Theorem IV (Example)'],
    ['6 \u5173\u4e8e', '\u5b9a\u7406\u4e8c'],
  ]) {
    const p = page(2, [
      { text: start, y: 720, size: 12, font: 'f_head' },
      { text: reference, y: 704, size: 12, font: 'f_head' },
      { text: 'Theorem 7. Let the sample be finite', y: 688, size: 12, font: 'f_head' },
    ]);
    const expected = start.endsWith('\u5173\u4e8e') ? start + reference : start + ' ' + reference;
    assert.deepEqual(detectPdfHeadings([p]).map(e => e.title), [expected]);
    assert.equal(detectPdfHeadings([p])[0].offset, 0);
  }
});
