'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex, academicOptions } = require('./academic-speech');
const { JSDOM } = require('jsdom');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const zh = { mathReadingLanguage: 'chinese' };

test('signed exponents use unary sign names without changing subtraction', () => {
  for (const academicMathStyle of ['concise', 'verbose']) {
    for (const sign of ['-', '−']) {
      assert.equal(mathSpeech(`10^{${sign}9}`, { ...zh, academicMathStyle }), '10 的 负9 次方');
      assert.equal(mathSpeech(`x^{${sign}n}`, { ...zh, academicMathStyle }), 'x 的 负n 次方');
      assert.equal(mathSpeech(`10^{${sign}9}`, { academicMathStyle }), '10 to the power of negative 9');
    }
    assert.equal(mathSpeech('x^{+4}', { ...zh, academicMathStyle }), 'x 的 正4 次方');
    assert.equal(mathSpeech('x^{n-1}', { ...zh, academicMathStyle }), 'x 的 n 减 1 次方');
    assert.equal(mathSpeech('x-y', { ...zh, academicMathStyle }), 'x 减 y');
  }
});

test('short endpoint identifiers and local search/domain prose recognize intervals', () => {
  const input = String.raw`区间 $[lo,mid]$；否则往 $[mid,hi]$ 搜。在非负实数域 $[0,\infty)$ 内查找。`;
  const speech = academicLatex(input, zh);
  assert.match(speech, /lo 到 mid/); assert.match(speech, /mid 到 hi/);
  assert.match(speech, /0 及以上/); assert.doesNotMatch(speech, /方括号|右括号|公式/);
  for (const source of ['向量为 $[lo,mid]$。', '坐标为 $(lo,hi)$。']) {
    assert.doesNotMatch(academicLatex(source, { ...zh, academicIntervalStyle: 'range' }), / 到 |区间/);
  }
  assert.doesNotMatch(academicLatex('此前讨论区间。现在是 $(a,b)$。', zh), / 到 |开区间/);
});

test('range-only interval speech is opt-in and full style retains endpoint semantics', () => {
  const context = { ...zh, mathIntervalContext: 'interval' };
  assert.equal(mathSpeech('(0,1]', context), '0 到 1，不含 0，含 1');
  assert.equal(mathSpeech('(0,1]', { ...context, academicIntervalStyle: 'range' }), '0 到 1');
  assert.equal(mathSpeech(String.raw`\eta_c\in(0,1]`, { ...zh, academicIntervalStyle: 'range' }), 'eta c 属于 0 到 1');
  assert.equal(mathSpeech(String.raw`[0,\infty)`, { ...context, academicIntervalStyle: 'range' }), '0 到 无穷');
  assert.equal(mathSpeech('(0,1]', { ...context, academicIntervalStyle: 'range', academicMathStyle: 'verbose' }), '左开右闭区间，0 到 1');
  assert.equal(mathSpeech('(0,1]', { ...context, academicIntervalStyle: 'range', academicMathMode: 'skip' }), '公式。');
  assert.match(mathSpeech('f(a+b)', { ...zh, academicIntervalStyle: 'range' }), /括号/);
  assert.equal(academicOptions().academicIntervalStyle, 'natural');
  assert.equal(academicOptions({ readingProfile: 'custom', academicIntervalStyle: 'invalid' }).academicIntervalStyle, 'precise');
});
test('short decorated interval endpoints reuse variable speech instead of spelling brackets', () => {
  for (const [endpoint, label] of [[String.raw`\overline b`, 'b bar'], [String.raw`\bar{u}`, 'u bar'],
    [String.raw`\hat q`, 'q hat'], [String.raw`\bar{u}_{max}`, 'u bar max'], [String.raw`\overline{u_{max}}`, 'u bar max']]) {
    const input = String.raw`x\in[0,` + endpoint + ']';
    assert.equal(mathSpeech(input, zh), `x 属于 0 到 ${label} 的区间`);
    assert.equal(mathSpeech(input, { ...zh, academicIntervalStyle: 'range' }), `x 属于 0 到 ${label}`);
    assert.equal(mathSpeech(input), `x belongs to the interval from 0 to ${label}`);
    const verbose = mathSpeech(input, { ...zh, academicMathStyle: 'verbose' });
    if (endpoint === String.raw`\overline{u_{max}}`) assert.equal(verbose, '公式。');
    else { assert.match(verbose, /闭区间/); assert.doesNotMatch(verbose, /方括号/); }
  }
  assert.match(academicLatex(String.raw`取值 $x\in[0,\overline b]$。`, zh), /x 属于 0 到 b bar 的区间/);
});
test('decorated endpoints do not turn vectors, compound expressions or unsupported commands into ranges', () => {
  assert.doesNotMatch(academicLatex(String.raw`向量 $[0,\bar{b}]$。`, zh), / 到 |区间/);
  assert.doesNotMatch(mathSpeech(String.raw`v=[0,\bar{b}]`, zh), / 到 |区间/);
  for (const endpoint of [String.raw`\bar{u+v}`, String.raw`\bar{u}v`, String.raw`\overline u+v`, String.raw`\hat{\unknown{u}}`]) {
    assert.doesNotMatch(mathSpeech(String.raw`x\in[0,` + endpoint + ']', zh), /0 到 /, endpoint);
  }
  assert.equal(mathSpeech(String.raw`x\in[0,\bar b]`, { ...zh, academicMathMode: 'skip' }), '公式。');
});
test('decorated interval conversion keeps original HTML source and highlight coordinates', t => {
  const source = String.raw`<p>取值 $x\in[0,\bar{b}]$。</p>`;
  const dom = new JSDOM(source); t.after(() => dom.window.close());
  const doc = dom.window.document, before = doc.body.innerHTML;
  const options = academicOptions({ ...zh, academicIntervalStyle: 'range' });
  const speechTransform = text => academicLatex(text, options), speech = speechTransform(extractHtmlText(source, options));
  assert.match(speech, /x 属于 0 到 b bar/); assert.doesNotMatch(speech, /方括号/);
  dom.window.CSS = { highlights: new Map() };
  dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: speech, academic: options, speechTransform }), true);
  assert.equal(doc.body.innerHTML, before);
});

test('escaped numeric percentages stay readable without enabling multiline equations', () => {
  for (const source of [String.raw`\alpha=5\%`, String.raw`\alpha=5\\%`, String.raw`\alpha=0.5%`]) {
    const percent = source.includes('0.5') ? '0.5' : '5';
    assert.equal(mathSpeech(source, zh), `alpha 等于 百分之${percent}`);
    assert.equal(mathSpeech(source), `alpha equals ${percent} percent`);
  }
  assert.equal(mathSpeech(String.raw`a=b\\c=d`, zh), '公式。');
  assert.equal(mathSpeech(String.raw`\sum_{i=1}^{n}x_i`, { ...zh, academicIntervalStyle: 'range' }), '公式。');
});
