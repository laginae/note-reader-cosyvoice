'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { mathSpeech, academicLatex, academicOptions, complexListeningMath } = require('./academic-speech');
const { simpleFunctionCalls } = require('./math-functions');
const { conciseMathLabels } = require('./math-variable-labels');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const { JSDOM } = require('jsdom');

test('short underlined variables keep their label without inferring a bound', () => {
  for (const mathReadingLanguage of ['english', 'chinese']) {
    for (const input of [String.raw`\underline f`, String.raw`\underline{f}`]) {
      assert.equal(mathSpeech(input, { mathReadingLanguage }), 'f underbar');
    }
    assert.equal(mathSpeech(String.raw`\underline{f_i}`, { mathReadingLanguage }), 'f underbar i');
  }
  assert.equal(conciseMathLabels(String.raw`\underline{f}_i`).text, 'f underbar _i');
  assert.equal(mathSpeech(String.raw`\underline{f_i}`, { academicMathStyle: 'verbose' }), 'f subscript i underbar');
  assert.equal(mathSpeech(String.raw`\underline{f+g}`), 'open parenthesis f plus g close parenthesis underbar');
});

test('concise short decorated function heads avoid spoken argument brackets', () => {
  for (const [input, expected] of [
    [String.raw`\underline f(x)`, 'f underbar of x'],
    [String.raw`\overline g(x)`, 'g bar of x'],
    [String.raw`\overline{g}(x)`, 'g bar of x'],
    [String.raw`\widehat{f}(x)`, 'f hat of x'],
    [String.raw`\widetilde{g_i}(x)`, 'g tilde i of x'],
    [String.raw`\dot f(t)`, 'f dot of t'],
    [String.raw`\ddot{g}_i(t)`, 'g double dot i of t'],
    [String.raw`f^{\prime}(x)`, 'f prime of x'],
    ["f''(x)", 'f double prime of x'],
    [String.raw`f_i^{\ast}(x)`, 'f i star of x'],
    [String.raw`\hat{\phi}_i(x)`, 'phi hat i of x'],
  ]) for (const mathReadingLanguage of ['english', 'chinese']) {
    assert.equal(mathSpeech(input, { mathReadingLanguage }), mathReadingLanguage === 'chinese' ? expected.replace(' of ', ' ') : expected, input);
  }
  assert.equal(mathSpeech(String.raw`\vec{f}(x)`), 'vector f of x');
  assert.equal(mathSpeech(String.raw`\vec{f}(x)`, { mathReadingLanguage: 'chinese' }), '向量 f x');
  assert.equal(mathSpeech(String.raw`\overline f[x_i]`), 'f bar of x i');
  assert.equal(mathSpeech(String.raw`\underline f(x,y)`), 'f underbar with arguments x, y');
  assert.equal(mathSpeech(String.raw`\hat f(x,y)`, { mathReadingLanguage: 'chinese' }), 'f hat，参数为 x、y');
});

test('short scripted, accented and numeric arguments use the same bounded variable grammar', () => {
  for (const [input, expected] of [
    ['f(x_i)', 'f of x i'], [String.raw`f(x_{i,j})`, 'f of x i j'],
    [String.raw`f(x_{i+1})`, 'f of x i plus 1'], [String.raw`f(\bar x)`, 'f of x bar'],
    [String.raw`\hat{f}(\alpha_i)`, 'f hat of alpha i'],
    [String.raw`f(x^{\prime})`, 'f of x prime'], ['f(0.5)', 'f of 0.5'],
    ['f(-1)', 'f of minus 1'],
  ]) assert.equal(mathSpeech(input), expected, input);
  assert.equal(mathSpeech('f(-1)', { mathReadingLanguage: 'chinese' }), 'f 负1');
  assert.equal(mathSpeech(String.raw`f(x_{i+1})`, { mathReadingLanguage: 'chinese' }), 'f x i 加 1');
});

test('comparisons, short tuples and fractions retain decorated function labels', () => {
  assert.equal(mathSpeech(String.raw`\underline f(x)=\overline g(x)`), 'f underbar of x equals g bar of x');
  assert.equal(mathSpeech(String.raw`\underline f(x)=\overline g(x)`, { mathReadingLanguage: 'chinese' }),
    'f underbar x 等于 g bar x');
  assert.equal(mathSpeech(String.raw`(\hat f(x_i),g^{\prime}(y))`), 'f hat of x i, g prime of y');
  assert.equal(mathSpeech(String.raw`\underline f(x)/\overline g(x)`), 'f underbar of x divided by g bar of x');
  assert.equal(mathSpeech(String.raw`(a-b)/\underline c`), 'the difference of a and b, divided by c underbar');
  assert.equal(mathSpeech(String.raw`x\in[0,\underline b]`), 'x belongs to the interval from 0 to b underbar');
});

test('function call positions cover the whole decorated head, not just its inner variable', () => {
  const input = String.raw`\hat{f}_i(x_j)+\overline{g}(t)`;
  const calls = simpleFunctionCalls(input);
  assert.deepEqual(calls.map(call => [input.slice(call.start, call.end), call.name, call.argument, call.scripted]), [
    [String.raw`\hat{f}_i(x_j)`, String.raw`\hat{f}_i`, 'x_j', true],
    [String.raw`\overline{g}(t)`, String.raw`\overline{g}`, 't', false],
  ]);
});

test('verbose functions retain structural argument brackets and explicit indices', () => {
  const options = { academicMathStyle: 'verbose' };
  assert.equal(mathSpeech(String.raw`\overline g(x)`, options), 'g bar open parenthesis x close parenthesis');
  assert.equal(mathSpeech(String.raw`\underline f(x)`, options), 'f underbar open parenthesis x close parenthesis');
  assert.equal(mathSpeech('f_i(x_j)', options), 'f subscript i open parenthesis x subscript j close parenthesis');
  assert.equal(mathSpeech(String.raw`\overline{g(x)}`, options), 'g open parenthesis x close parenthesis bar');
});

test('smart complexity and explicit skipping still govern decorated expressions', () => {
  for (const input of [String.raw`\bar{f_i}(x)/\hat{g_i}(x)`,
    String.raw`\underline f(x)=\frac{a+b}{c-d}`, String.raw`\underline f(x)=\sum_i x_i`]) {
    assert.equal(mathSpeech(input), 'Formula.', input);
    assert.equal(mathSpeech(input, { academicSkipNotice: false }), '', input);
  }
  const ratio = String.raw`\bar{f_i}(x)/\hat{g_i}(x)`;
  assert.equal(complexListeningMath(ratio), true);
  assert.match(mathSpeech(ratio, { academicMathMode: 'all' }), /f bar i of x divided by g hat i of x/);
  for (const academicMathMode of ['skip']) {
    assert.equal(mathSpeech(String.raw`\underline f(x)`, { academicMathMode }), 'Formula.');
  }
  assert.equal(mathSpeech(String.raw`\underline f(x)`, { mathReadingLanguage: 'skip' }), 'Formula.');
});

test('compound arguments and ambiguous function names do not get flattened', () => {
  for (const input of [String.raw`\hat f(x+y)`, String.raw`\bar g(x^2)`, 'f(x/y)', 'f(g(x))', '2(x)', String.raw`\hat f(x`]) {
    const spoken = mathSpeech(input);
    assert.ok(spoken === 'Formula.' || /parenthesis/.test(spoken), input);
  }
  for (const input of ['effect(t)', 'ABC(t)', String.raw`\unknown(x)`, String.raw`f(x+)`, String.raw`f(x_{})`]) {
    assert.equal(simpleFunctionCalls(input).length, 0, input);
  }
  for (const input of [String.raw`\underline{f`, String.raw`\underline`]) {
    assert.equal(mathSpeech(input), 'Formula.', input);
  }
  assert.deepEqual(simpleFunctionCalls('x'.repeat(5000) + '(t)'), []);
});

test('structural commands without a valid variable head cannot become omission fragments', () => {
  for (const input of [String.raw`\hat(x)`, String.raw`\bar(x)`, String.raw`\underline(x)`,
    String.raw`\frac(x)`, String.raw`\sqrt(x)`, String.raw`\hat[x]`]) {
    assert.equal(mathSpeech(input), 'Formula.', input);
    assert.equal(mathSpeech(input, { mathReadingLanguage: 'chinese' }), '公式。', input);
    assert.equal(mathSpeech(input, { academicSkipNotice: false }), '', input);
  }
  assert.equal(mathSpeech(String.raw`\phi(x)`), 'phi of x');
  assert.equal(mathSpeech(String.raw`\phi[x]`), 'phi of x');
});

test('decorated function speech keeps Markdown and HTML source coordinates intact', t => {
  const raw = String.raw`Generic bounds $\underline f(x)$ and $\overline g(x)$ agree when $\underline f(x)=\overline g(x)$.`;
  const options = academicOptions(), transform = text => academicLatex(text, options), spoken = transform(raw);
  assert.doesNotMatch(spoken, /parenthesis|bracket|Formula\./);
  assert.match(spoken, /f underbar of x equals g bar of x/);
  const source = buildMarkdownSource(raw, [spoken], transform);
  assert.equal(source.mappingValid, true);
  const range = currentSourceRanges(source, { index: 0 })[0];
  assert.equal(raw.slice(range.from, range.to), raw);
  const dom = new JSDOM('<p>' + raw + '</p>'); t.after(() => dom.window.close());
  const doc = dom.window.document, before = doc.body.innerHTML;
  assert.equal(transform(extractHtmlText(before)), spoken);
  dom.window.CSS = { highlights: new Map() };
  dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: spoken, academic: options, speechTransform: transform }), true);
  assert.equal(doc.body.innerHTML, before);
});
