'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { mathSpeech, academicLatex, academicOptions } = require('./academic-speech');
const { simpleFunctionCalls } = require('./math-functions');
const { JSDOM } = require('jsdom');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const zh = { mathReadingLanguage: 'chinese', academicFunctionStyle: 'of' };

test('concise tuples of short unary calls use neutral pauses rather than spoken brackets', () => {
  assert.equal(mathSpeech('(f(x),g(x))', zh), 'f of x、g of x');
  assert.equal(mathSpeech('(f(x),g(y),h(1))'), 'f of x, g of y, h of 1');
  assert.equal(mathSpeech('[a,f(x)]', zh), 'a、f of x');
  assert.equal(mathSpeech('v=(f(x),g(x))', zh), 'v 等于 f of x、g of x');
  assert.equal(mathSpeech('(f_i(x),g_j(x))', zh), 'f i of x、g j of x');
  assert.match(mathSpeech('(f(x),g(x))', { ...zh, academicMathStyle: 'verbose' }), /括号/);
  assert.equal(mathSpeech('(f(x),g(x))', { ...zh, academicMathMode: 'skip' }), '公式。');
});
test('compact uppercase calls retain their label order without assuming multiplication', () => {
  assert.equal(mathSpeech('AB(x)', zh), 'AB of x');
  assert.equal(mathSpeech('AB(x)+CD(x)', zh), 'AB of x 加 CD of x');
  const relation = String.raw`u\le x_0\le v,\quad A+BF(t)\le x_0\le C-BG(t)`;
  const speech = mathSpeech(relation, zh);
  assert.match(speech, /BF of t/); assert.match(speech, /BG of t/);
  assert.doesNotMatch(speech, /括号|乘以/);
  for (const value of ['effect(t)', 'ABC(t)', 'f(t+1)', '2(t)']) assert.equal(simpleFunctionCalls(value).length, 0, value);
  assert.match(mathSpeech('f(t+1)', zh), /括号/);
});
test('nested or compound tuple members do not lose grouping and interval meanings remain separate', () => {
  for (const input of ['(f(x)+a,g(x))', '((a,b),c)', '(f(x,y),g(x))']) {
    const speech = mathSpeech(input, zh);
    assert.ok(speech === '公式。' || speech.includes('括号'), input);
  }
  assert.match(academicLatex(String.raw`范围 $x\in[0,\overline b]$。`, zh), /0 到 b bar/);
  assert.equal(mathSpeech(String.raw`\{\bar a,\hat b,\bar{\hat c}\}`, zh), '集合 a bar、b hat、c hat bar');
});
test('tuple speech leaves HTML and highlight source coordinates unchanged', t => {
  const source = '<p>公开示例 $(f(x),g(x))$。</p>', dom = new JSDOM(source); t.after(() => dom.window.close());
  const doc = dom.window.document, before = doc.body.innerHTML, options = academicOptions(zh);
  const speechTransform = text => academicLatex(text, options), speech = speechTransform(extractHtmlText(source, options));
  assert.match(speech, /f of x、g of x/); assert.doesNotMatch(speech, /括号/);
  dom.window.CSS = { highlights: new Map() }; dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: speech, academic: options, speechTransform }), true);
  assert.equal(doc.body.innerHTML, before);
});
