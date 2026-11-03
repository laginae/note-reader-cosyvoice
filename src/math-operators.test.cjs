const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { preparePdfSelection } = require('./pdf-selection');
const slash = String.fromCharCode(92);
const formula = value => '$' + value + '$';
const command = name => slash + name;

const operators = [
  ['max', 'max', 'max'], ['min', 'min', 'min'],
  ['argmax', 'arg max', 'arg max'], ['argmin', 'arg min', 'arg min'],
  ['sup', 'supremum', '上确界'], ['inf', 'infimum', '下确界'],
  ['lim', 'limit', '极限'], ['log', 'log', '对数'], ['ln', 'natural log', '自然对数'],
  ['exp', 'exponential', '指数函数'], ['sin', 'sine', '正弦'], ['cos', 'cosine', '余弦'],
  ['tan', 'tangent', '正切'], ['det', 'determinant', '行列式'],
  ['sum', 'summation', '求和'], ['prod', 'product', '连乘'], ['int', 'integral', '积分'],
];

test('standalone common operators are spoken in both languages and formula styles', () => {
  for (const [name, en, zh] of operators) for (const academicMathMode of ['smart', 'all']) {
    for (const academicMathStyle of ['concise', 'verbose']) {
      for (const [mathReadingLanguage, expected] of [['english', en], ['chinese', zh]]) {
        assert.equal(mathSpeech(command(name), { academicMathMode, academicMathStyle, mathReadingLanguage }), expected, name);
      }
    }
  }
  for (const name of ['max', 'min']) assert.equal(mathSpeech(name), name);
  assert.equal(mathSpeech(slash + 'arg' + slash + 'max'), 'arg max');
  assert.equal(mathSpeech(slash + 'arg' + slash + ', ' + slash + 'min'), 'arg min');
  assert.equal(mathSpeech(slash + 'operatorname{argmax}'), 'arg max');
  assert.equal(mathSpeech(slash + 'operatorname*{arg min}'), 'arg min');
});

test('simple single-argument functions do not swallow unsupported expressions', () => {
  const examples = [
    [command('sin') + ' x', 'sine of x', 'x 的正弦'],
    [command('cos') + '(x)', 'cosine of x', 'x 的余弦'],
    [command('tan') + '{x}', 'tangent of x', 'x 的正切'],
    [command('log') + ' x_i', 'log of x i', 'x i 的对数'],
    [command('ln') + '(' + command('theta') + ')', 'natural log of theta', 'theta 的自然对数'],
    [command('sin') + command('theta'), 'sine of theta', 'theta 的正弦'],
    [command('exp') + '{2}', 'e to the power of 2', 'e 的 2 次方'],
  ];
  for (const [input, en, zh] of examples) {
    assert.equal(mathSpeech(input), en, input);
    assert.equal(mathSpeech(input, { mathReadingLanguage: 'chinese' }), zh, input);
    assert.equal(mathSpeech(input, { academicMathMode: 'skip' }), 'Formula.', input);
    assert.equal(mathSpeech(input, { mathReadingLanguage: 'skip', academicSkipNotice: false }), '', input);
  }
  assert.equal(mathSpeech(command('log') + ' x_i', { academicMathStyle: 'verbose' }), 'log of x subscript i');
  assert.equal(mathSpeech(command('max') + '(a,b)'), 'the maximum of a and b');
  for (const input of [command('max') + '(a,min(b,c))', command('sum') + '_{i=1}^n x_i',
    command('max') + '_{i}', command('sin') + '(x+y)', command('log') + '_{10} x', command('maximal'),
    command('sin') + command('max'), command('sin') + ' ' + command('sum'), command('sin') + ' ' + '1'.repeat(50)]) {
    assert.equal(mathSpeech(input), 'Formula.', input);
    assert.equal(mathSpeech(input, { academicSkipNotice: false }), '', input);
  }
});

test('skip-all settings and ordinary prose remain unchanged', () => {
  for (const [name] of operators) {
    assert.equal(mathSpeech(command(name), { academicMathMode: 'skip' }), 'Formula.', name);
    assert.equal(mathSpeech(command(name), { mathReadingLanguage: 'skip', academicSkipNotice: false }), '', name);
  }
  const ordinary = 'A maximum is not necessarily a minimum. Keep this URL: https://example.test/max.';
  assert.equal(academicLatex(ordinary), ordinary);
});

test('Markdown and HTML use the same speech while highlighting the original source', () => {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(__dirname + '/../main.js', 'utf8'))(
    name => name === 'obsidian' ? new Proxy({}, { get: () => class {} }) : require(name), loaded, loaded.exports);
  const clean = loaded.exports.__test.sanitizeTextForSpeech;
  const raw = '这个 ' + formula(command('max')) + ' 是上限。';
  const speech = clean(raw);
  assert.equal(speech, '这个 max 是上限。');
  assert.equal(clean('这个 ' + formula(command('ln') + '(x)') + ' 是对数。'), '这个 x 的自然对数 是对数。');
  assert.equal(clean('The ' + formula(command('lim')) + ' is defined.', { mathReadingLanguage: 'chinese' }), 'The limit is defined.');
  const source = buildMarkdownSource(raw, [speech], clean);
  assert.equal(source.mappingValid, true);
  assert.equal(raw.slice(currentSourceRanges(source, { index: 0 })[0].from, currentSourceRanges(source, { index: 0 })[0].to), raw);
  const dom = new JSDOM('<p>' + raw + '</p>'), doc = dom.window.document, before = doc.body.innerHTML;
  const transform = text => academicLatex(text);
  assert.match(transform(extractHtmlText(before)), /max/);
  dom.window.CSS = { highlights: new Map() };
  dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: speech, academic: {}, speechTransform: transform }), true);
  assert.equal([...dom.window.CSS.highlights.get('note-reader-speech')].map(range => range.toString()).join(''), raw);
  assert.equal(doc.body.innerHTML, before);
  dom.window.close();
});

test('PDF plain operator remains readable for whole-page and selection paths', () => {
  const item = (str, x, fontName = 'body') => ({ str, width: str.length * 5, height: 12, fontName, transform: [12, 0, 0, 12, x, 700] });
  const items = [item('The operator', 40), item('max', 105, 'math'), item('is useful.', 125)];
  const layout = extractPdfTextLayout(items, { viewport: { width: 600, height: 800 } });
  for (const academicMathMode of ['smart', 'all']) {
    const changes = pdfMathChanges(layout, items, { academicMathMode }, { math: 'CMMI10' });
    assert.equal(applyPdfMathChanges(layout.text, changes), 'The operator max is useful.');
    assert.equal(preparePdfSelection({ selectedText: 'max' }, { academicMathMode }), 'max');
  }
});
