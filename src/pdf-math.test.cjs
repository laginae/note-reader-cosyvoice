const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { pdfSourceLines } = require('./pdf-highlights');
const { pdfSelectionSourceMap } = require('./pdf-selection-source');

const item = (str, x, y, fontName = 'body', size = 12) =>
  ({ str, width: str.length * 5, height: size, fontName, transform: [size, 0, 0, size, x, y] });
const viewport = { width: 600, height: 800 };

test('smart PDF filtering groups plain-font absolute-value bars with a fraction equation', () => {
  const items = [item('An ordinary introduction.',40,730),
    item('|',200,690),item('𝑎',210,690,'math'),item('−',225,690,'math'),item('𝑏',240,690,'math'),item('|',250,690),
    item('𝑣',160,676,'math'),item('=',175,676),item('𝑐',220,676,'math'),
    item('Ordinary continuation.',40,640)];
  items[0].width=450;items.at(-1).width=450;
  const layout=extractPdfTextLayout(items,{viewport});
  const changes=pdfMathChanges(layout,items,{academicMathMode:'smart'});
  const speech=applyPdfMathChanges(layout.text,changes);
  assert.equal((speech.match(/Formula\./g)||[]).length,1);
  assert.doesNotMatch(speech,/[|=𝑎𝑏𝑐𝑣]/u);
  assert.match(speech,/An ordinary introduction\./);
  assert.match(speech,/Ordinary continuation\./);
});

test('PDF skip uses math font evidence for inline scripts and multiline displayed equations', () => {
  const items = [item('The value', 40, 700), item('𝑥', 100, 700, 'math'), item('i', 110, 697, 'math', 8),
    item('is described below.', 125, 700), item('2', 210, 670, 'math', 8),
    item('𝑦', 200, 660, 'math'), item('=', 220, 660, 'math'), item('𝑥', 240, 660, 'math'),
    item('n', 250, 650, 'math', 8), item('Normal prose continues.', 40, 620)];
  const layout = extractPdfTextLayout(items, { viewport });
  const mathChanges = pdfMathChanges(layout, items, { academicMathMode: 'skip' });
  const speech = applyPdfMathChanges(layout.text, mathChanges);
  assert.match(speech, /The value\. Formula\. is described below\./);
  assert.ok(speech.endsWith('Normal prose continues.'));
  assert.doesNotMatch(speech, /[𝑥𝑦=]/u);
  assert.equal((speech.match(/Formula\./g) || []).length, 2);
  const mapped = pdfSourceLines({ items, viewport, mathChanges }, text => text);
  assert.equal(mapped.text, speech.replace(/\s/g, ''));
});

test('PDF math skipping is explicit, respects notices, and keeps ordinary numeric prose', () => {
  const items = [item('Results in 2025 improved by 12.5%.', 40, 700), item('x = y + 2', 210, 660),
    item('Date: 2025-01-02; pages 3-5.', 40, 620)];
  const layout = extractPdfTextLayout(items, { viewport });
  for (const academicMathMode of ['smart', 'all']) {
    const spoken = applyPdfMathChanges(layout.text, pdfMathChanges(layout, items, { academicMathMode }));
    assert.equal(spoken, `${items[0].str}\nx equals y plus 2\n${items[2].str}`);
  }
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
  assert.match(speech, /Use x when p equals q in this example\./);
  assert.equal((speech.match(/Formula\./g) || []).length, 1);
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
    assert.match(speech, /An English explanation follows\.\nFormula\./);
    assert.match(speech, /这里开始另一段中文说明。\n公式。/);
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
    assert.ok(speech.startsWith('Formula.'));
    const isolatedItems = [item('x',200,700), item('= y + 2',210,700)];
    const formulaOnly = extractPdfTextLayout(isolatedItems, { viewport });
    const fallback = applyPdfMathChanges(formulaOnly.text, pdfMathChanges(formulaOnly, isolatedItems, settings));
    assert.equal(fallback, mathReadingLanguage === 'chinese' ? '公式。' : 'Formula.');
    assert.deepEqual(pdfMathChanges(layout, withProse, { ...settings, academicSkipNotice: false }).map(change => change.text), ['']);
  }
});

test('shared-font inline constraints form a complete run and survive a preceding hyphenated word', () => {
  const items = [item('The measure describes a varia-',40,720), item('tion given by',40,700),
    item('𝑤',115,700),item('=',130,700),item('|',145,700),item('𝑥',155,700),item('2',165,699,'body',8),
    item('−',180,700),item('𝑥',195,700),item('ref',205,699,'body',8),item('|',225,700),item('≤',235,700),item('𝑟',250,700),
    item('. Continue.',265,700),item('Normal ending.',40,670)];
  items[0].width=450;items.at(-1).width=450;
  const layout=extractPdfTextLayout(items,{viewport});
  const mathChanges=pdfMathChanges(layout,items,{academicMathMode:'smart'});
  const speech=applyPdfMathChanges(layout.text,mathChanges);
  assert.match(speech,/variation given by\. Formula\. Continue\./);
  assert.doesNotMatch(speech,/[|=≤]|ref/);
  assert.equal((speech.match(/Formula\./g)||[]).length,1);
  assert.equal(pdfSourceLines({items,viewport,mathChanges},text=>text).text,speech.replace(/\s/g,''));
  assert.doesNotMatch(applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicSkipNotice:false})),/Formula|[|=≤]|ref/);
  const fullChanges=pdfMathChanges(layout,items,{academicMathMode:'all'});
  const fullSpeech=applyPdfMathChanges(layout.text,fullChanges);
  assert.match(fullSpeech,/w equals absolute value of x sub 2 minus x sub ref less than or equal to r/);
  assert.equal(fullChanges.flatMap(change=>change.omitted).length,0);
  // A partial, changed source must not authorize deleting surrounding prose.
  const partial='An unrelated prefix '+items[1].str+' 𝑤 = | 𝑥 2 − 𝑥 ref | ≤ 𝑟. Continue.';
  assert.equal(applyPdfMathChanges(partial,mathChanges),partial);
});

test('simple inline equations and ordinary prose are retained while shared-font operators join', () => {
  const items=[item('Use',40,700),item('𝑘',65,700),item('=',78,700),item('2',90,700),
    item('and compare',105,700),item('𝑥',170,700),item('with',185,700),item('𝑦',215,700),item('in this example.',230,700)];
  items.at(-1).width=300;
  const layout=extractPdfTextLayout(items,{viewport});
  const spoken=applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'smart'}));
  assert.match(spoken,/Use k equals 2 and compare 𝑥 with 𝑦 in this example\./u);
  const skipped=applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'skip'}));
  assert.match(skipped,/Use\. Formula\. and compare\. Formula\. with\. Formula\. in this example\./);
  assert.doesNotMatch(skipped,/=|2|[𝑘𝑥𝑦]/u);
});

test('short absolute values get words without losing prose, scripts, mode or highlight mapping', () => {
  for (const mathReadingLanguage of ['chinese','english']) {
    const items=[item('The value is',40,700),item('|',110,700),item('𝑥',120,700),item('i',130,699,'body',8),
      item('−',145,700),item('𝑦',160,700),item('|',175,700),item('. Continue.',185,700)];
    items.at(-1).width=300;
    const layout=extractPdfTextLayout(items,{viewport});
    for (const academicMathMode of ['smart','all']) {
      const mathChanges=pdfMathChanges(layout,items,{academicMathMode,mathReadingLanguage});
      const speech=applyPdfMathChanges(layout.text,mathChanges);
      assert.match(speech,/The value is absolute value of x sub i minus y/);
      assert.doesNotMatch(speech,/[|𝑥𝑦]/u);
      assert.equal(mathChanges.flatMap(change=>change.omitted).length,0);
      assert.equal(pdfSourceLines({items,viewport,mathChanges},text=>text).text,speech.replace(/\s/g,''));
    }
  }
});

test('PDF simple operators use local prose language and preserve source highlight mapping', () => {
  for (const [prefix, language, expected] of [['The relation is', 'chinese', 'x sub i equals y plus 2'],
    ['其关系如下', 'english', 'x sub i 等于 y 加 2']]) {
    const items = [item(prefix,40,700),item('𝑥',130,700),item('i',140,699,'body',8),
      item('=',155,700),item('y',170,700),item('+',185,700),item('2',200,700),item('.',215,700)];
    const original = JSON.stringify(items), layout = extractPdfTextLayout(items,{viewport});
    for (const academicMathMode of ['smart','all']) {
      const mathChanges = pdfMathChanges(layout,items,{academicMathMode,mathReadingLanguage:language});
      const speech = applyPdfMathChanges(layout.text,mathChanges);
      assert.ok(speech.includes(expected),speech);
      assert.equal(mathChanges.flatMap(change=>change.omitted).length,0);
      assert.equal(pdfSourceLines({items,viewport,mathChanges},text=>text).text,speech.replace(/\s/g,''));
    }
    assert.equal(JSON.stringify(items),original);
  }
});

test('PDF math-anchored runs include plain Latin factors and comparison or arithmetic signs', () => {
  const expressions = [
    [['p','=','k','τ'], 'p equals k times tau'],
    [['𝑥','−','y'], 'x minus y'],
    [['𝑥','≤','y'], 'x less than or equal to y'],
    [['𝑥','≥','y'], 'x greater than or equal to y'],
    [['𝑥','≠','y'], 'x not equal to y'],
    [['𝑥','≈','y'], 'x approximately equal to y'],
    [['𝑥','×','y'], 'x times y'],
    [['𝑥','÷','2'], 'x divided by 2'],
    [['𝑥','±','y'], 'x plus or minus y'],
  ];
  for (const [tokens,expected] of expressions) {
    const items = [item('Use',40,700),...tokens.map((token,index)=>item(token,70+index*16,700)),item('in this example.',200,700)];
    const layout = extractPdfTextLayout(items,{viewport});
    const mathChanges = pdfMathChanges(layout,items);
    assert.equal(applyPdfMathChanges(layout.text,mathChanges),`Use ${expected} in this example.`);
  }
});

test('PDF operator conversion leaves dates, ranges, URLs, code and ordinary hyphens untouched', () => {
  const strings = ['Date: 2026-01-02; pages 3-5.', 'Read well-being with C++ version 1.2.3.',
    'https://example.test/a-b?q=x+y', 'Units m/s and kg/m3, 12.5% gain.'];
  const items = strings.map((value,index)=>item(value,40,720-index*20));
  const layout = extractPdfTextLayout(items,{viewport});
  assert.deepEqual(pdfMathChanges(layout,items),[]);
  assert.equal(applyPdfMathChanges(layout.text,pdfMathChanges(layout,items)),layout.text);
});

test('shared-font operator grouping does not absorb an ordinary article before a formula', () => {
  const items = [item('Choose',40,700),item('a',80,700),item('𝑥',95,700),item('=',110,700),
    item('y',125,700),item('for this example.',140,700)];
  const layout = extractPdfTextLayout(items,{viewport});
  assert.equal(applyPdfMathChanges(layout.text,pdfMathChanges(layout,items)), 'Choose a x equals y for this example.');
  assert.equal(applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'skip'})),
    'Choose a. Formula. for this example.');
});
