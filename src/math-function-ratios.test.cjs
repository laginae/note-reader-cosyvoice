const { mathSpeech } = require('./academic-speech');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { pdfSourceLines } = require('./pdf-highlights');

const test = require('node:test');
const assert = require('node:assert/strict');

test('smart mode omits scripted function ratios but retains simple expressions', () => {
  for (const input of ['f_k(t)/g_k(1)', '\\frac{f_k(t)}{g_k(1)}', 'f_k(t)=g_k(t)/g_k(1)', 'φ_n(t)=ψ_n(t)/ψ_n(1)']) {
    assert.equal(mathSpeech(input), 'Formula.', input);
    assert.equal(mathSpeech(input, { academicSkipNotice: false }), '', input);
    assert.equal(mathSpeech(input, { mathReadingLanguage: 'chinese' }), '公式。', input);
  }
  for (const input of ['f(t)', 'f_k(t)', 'p=1', '\\tau', 'x/y', 'f(t)/g(t)'])
    assert.notEqual(mathSpeech(input), 'Formula.', input);
});

test('full concise mode uses natural simple arguments; verbose grouping stays explicit', () => {
  assert.equal(mathSpeech('f_k(t)=g_k(t)/g_k(1)', { academicMathMode: 'all' }),
    'f k of t equals g k of t divided by g k of 1');
  assert.match(mathSpeech('\\frac{f_k(t)}{g_k(1)}', { academicMathMode: 'all' }), /f k of t over g k of 1/);
  assert.match(mathSpeech('f_k(t)/g_k(1)', { academicMathMode: 'all', academicMathStyle: 'verbose' }), /open parenthesis/);
  assert.match(mathSpeech('f(t+1)', { academicMathMode: 'all' }), /open parenthesis/);
  assert.match(mathSpeech('2(t)', { academicMathMode: 'all' }), /open parenthesis/);
  assert.doesNotMatch(mathSpeech('effect(t)', { academicMathMode: 'all' }), / of /);
  assert.equal(mathSpeech('f_k(t)', { academicMathMode: 'skip' }), 'Formula.');
});

const viewport = { width: 600, height: 800 };
function fixture(split = false) {
  let x = 40;
  const items = [];
  const put = (str, fontName = 'body', size = 12, y = 700) => {
    const width = str.length * 5;
    items.push({ str, width, height: size, fontName, transform: [size,0,0,size,x,y] });
    x += width + 2;
  };
  put('A generic relation');
  for (const [symbol, arg, op] of [['φ','t','='],['ψ','t','/'],['ψ','1','']]) {
    put(symbol, 'math'); put('n', 'body', 8, 697);
    if (split) { put('('); put(arg); put(')'); }
    else put('(' + arg + ')');
    if (op) put(op);
  }
  put('is shown here.');
  return items;
}
function pdf(settings = {}, split = false) {
  const items = fixture(split);
  const layout = extractPdfTextLayout(items, { viewport });
  const changes = pdfMathChanges(layout, items, settings, { math: 'CMMI10' });
  const speech = applyPdfMathChanges(layout.text, changes);
  return { items, layout, changes, speech };
}

test('PDF fallback-font parentheses join one math run without swallowing prose', () => {
  for (const split of [false, true]) {
    const { speech } = pdf({}, split);
    assert.equal((speech.match(/Formula\./g) || []).length, 1);
    assert.match(speech, /^A generic relation\. Formula\. is shown here\.$/);
    assert.doesNotMatch(speech, /equals|divided|parenthesis|[φψ]/);
    const quiet = pdf({ academicSkipNotice: false }, split).speech;
    assert.match(quiet, /^A generic relation is shown here\.$/);
    assert.match(pdf({ academicMathMode: 'all' }, split).speech, /phi n of t equals psi n of t divided by psi n of 1/);
  }
});

test('source prose controls omission language without leaking formula fragments', () => {
  const items = fixture(); items[0].str = '测试关系'; items[0].width = 20;
  const layout = extractPdfTextLayout(items, { viewport });
  const speech = applyPdfMathChanges(layout.text, pdfMathChanges(layout, items, {}, { math: 'CMMI10' }));
  assert.equal((speech.match(/公式。/g) || []).length, 1);
  assert.doesNotMatch(speech, /Formula|equals|parenthesis/);
});

test('PDF formula omissions and full speech keep the highlight source mapping aligned', () => {
  for (const academicMathMode of ['smart','all','skip']) {
    const result = pdf({ academicMathMode });
    assert.equal(pdfSourceLines({ items: result.items, viewport, mathChanges: result.changes }, text => text).text,
      result.speech.replace(/\s/g, ''));
  }
});
