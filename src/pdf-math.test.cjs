const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { pdfSourceLines } = require('./pdf-highlights');
const { pdfSelectionSourceMap } = require('./pdf-selection-source');

const item = (str, x, y, fontName = 'body', size = 12) =>
  ({ str, width: str.length * 5, height: size, fontName, transform: [size, 0, 0, size, x, y] });
const viewport = { width: 600, height: 800 };

test('PDF skip uses math font evidence for inline scripts and multiline displayed equations', () => {
  const items = [item('The value', 40, 700), item('𝑥', 100, 700, 'math'), item('i', 110, 697, 'math', 8),
    item('is described below.', 125, 700), item('2', 210, 670, 'math', 8),
    item('𝑦', 200, 660, 'math'), item('=', 220, 660, 'math'), item('𝑥', 240, 660, 'math'),
    item('n', 250, 650, 'math', 8), item('Normal prose continues.', 40, 620)];
  const layout = extractPdfTextLayout(items, { viewport });
  const mathChanges = pdfMathChanges(layout, items, { academicMathMode: 'skip' });
  const speech = applyPdfMathChanges(layout.text, mathChanges);
  assert.match(speech, /The value Formula omitted\. is described below\./);
  assert.ok(speech.endsWith('Normal prose continues.'));
  assert.doesNotMatch(speech, /[𝑥𝑦=]/u);
  assert.equal((speech.match(/Formula omitted\./g) || []).length, 2);
  const mapped = pdfSourceLines({ items, viewport, mathChanges }, text => text);
  assert.equal(mapped.text, speech.replace(/\s/g, ''));
});

test('PDF math skipping is explicit, respects notices, and keeps ordinary numeric prose', () => {
  const items = [item('Results in 2025 improved by 12.5%.', 40, 700), item('x = y + 2', 210, 660),
    item('Date: 2025-01-02; pages 3-5.', 40, 620)];
  const layout = extractPdfTextLayout(items, { viewport });
  for (const academicMathMode of ['smart', 'all']) assert.deepEqual(pdfMathChanges(layout, items, { academicMathMode }), []);
  const changes = pdfMathChanges(layout, items, { mathReadingLanguage: 'skip', academicSkipNotice: false });
  const speech = applyPdfMathChanges(layout.text, changes);
  assert.equal(speech, `${items[0].str}\n\n${items[2].str}`);
  assert.equal(applyPdfMathChanges('A partial unmatched source line.', changes), 'A partial unmatched source line.');
});

test('PDF math detection does not treat a shared prose font as a dedicated formula font', () => {
  const items = [item('A long ordinary explanation.', 40, 700), item('𝑥', 40, 670), item('𝑦', 60, 670),
    item('This ordinary sentence remains.', 40, 640)];
  const layout = extractPdfTextLayout(items, { viewport });
  const result = applyPdfMathChanges(layout.text, pdfMathChanges(layout, items, { academicMathMode: 'skip' }));
  assert.ok(result.includes(items[0].str)); assert.ok(result.includes(items[3].str));
});

test('selection matching preserves offsets across ligatures, soft hyphens, scripts and wrapped words', () => {
  const raw = '  An e\u0301xample of ef\ufb01ciency.\nThe co-\nordinate 𝑥 is\u00ad shown.  ';
  const map = pdfSelectionSourceMap(raw);
  assert.equal(map.text, 'An éxample of efficiency. The coordinate x is shown.');
  const selected = map.text.indexOf('The coordinate');
  assert.equal(raw.slice(map.offsets[selected]), 'The co-\nordinate 𝑥 is\u00ad shown.  ');
  const variable = map.text.indexOf('x is');
  assert.equal(raw.slice(map.offsets[variable], map.offsets[variable] + 2), '𝑥');
});

test('math skipping keeps cross-line hyphenation identical in extraction and highlight source', () => {
  const items = [item('The term',40,700), item('𝑥',100,700,'math'), item('and',115,700), item('𝑦',140,700,'math'),
    item('describe a continu-',160,700), item('ation of the explanation.',40,680)];
  const layout = extractPdfTextLayout(items, { viewport });
  const mathChanges = pdfMathChanges(layout, items, { academicMathMode: 'skip' });
  const speech = applyPdfMathChanges(layout.text, mathChanges);
  assert.match(speech, /continuation/);
  assert.doesNotMatch(speech, /[𝑥𝑦]/u);
  assert.equal(pdfSourceLines({ items, viewport, mathChanges }, text => text).text, speech.replace(/\s/g, ''));
});

test('smart PDF mode groups complex display formulas while preserving short inline variables and relations', () => {
  const items = [item('Use',40,700), item('x',65,700,'italic'), item('when',76,700), item('p = q',108,700,'roman'),
    item('in this example.',145,700), item('x =',150,670,'roman'), item('a + b',190,679,'italic'),
    item('c',200,659,'italic'), item('(7)',280,670,'roman'), item('Normal text.',40,630)];
  // Prose spans the column; a sparse diagram is not a two-column text fixture.
  items[4].width = 350; items.at(-1).width = 450;
  const names = { italic: 'ABCDEF+CMMI10', roman: 'ABCDEF+CMR10' };
  const layout = extractPdfTextLayout(items, { viewport });
  const changes = pdfMathChanges(layout, items, { academicMathMode: 'smart' }, names);
  const speech = applyPdfMathChanges(layout.text, changes);
  assert.match(speech, /Use x when p = q in this example\./);
  assert.equal((speech.match(/Formula omitted\./g) || []).length, 1);
  assert.doesNotMatch(speech, /a \+ b|\(7\)/);
  assert.ok(speech.endsWith('Normal text.'));
});

test('PDF omission notices follow local prose even when the saved formula language differs', () => {
  const items = [item('An English explanation follows.',40,720), item('x = y + 2',200,690),
    item('这里开始另一段中文说明。',40,660), item('a = b + 3',200,630)];
  items[0].width = 450; items[2].width = 450;
  const layout = extractPdfTextLayout(items, { viewport });
  for (const mathReadingLanguage of ['english', 'chinese', 'skip']) {
    const settings = { academicMathMode: 'skip', mathReadingLanguage };
    const mathChanges = pdfMathChanges(layout, items, settings);
    const speech = applyPdfMathChanges(layout.text, mathChanges);
    assert.match(speech, /An English explanation follows\.\nFormula omitted\./);
    assert.match(speech, /这里开始另一段中文说明。\n公式略过。/);
    assert.equal(pdfSourceLines({ items, viewport, mathChanges }, text => text).text, speech.replace(/\s/g, ''));
  }
});

test('PDF formula notices use following prose at page start and saved language only without prose', () => {
  const first = item('x = y + 2',200,700), last = item('The explanation continues.',40,660);
  last.width = 450;
  for (const mathReadingLanguage of ['english', 'chinese']) {
    const settings = { academicMathMode: 'skip', mathReadingLanguage };
    const withProse = [first,last], layout = extractPdfTextLayout(withProse, { viewport });
    const speech = applyPdfMathChanges(layout.text, pdfMathChanges(layout, withProse, settings));
    assert.ok(speech.startsWith('Formula omitted.'));
    const isolatedItems = [item('x',200,700), item('= y + 2',210,700)];
    const formulaOnly = extractPdfTextLayout(isolatedItems, { viewport });
    const fallback = applyPdfMathChanges(formulaOnly.text, pdfMathChanges(formulaOnly, isolatedItems, settings));
    assert.equal(fallback, mathReadingLanguage === 'chinese' ? '公式略过。' : 'Formula omitted.');
    assert.deepEqual(pdfMathChanges(layout, withProse, { ...settings, academicSkipNotice: false }).map(change => change.text), ['']);
  }
});
