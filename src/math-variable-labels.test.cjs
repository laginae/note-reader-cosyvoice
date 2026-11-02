'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { conciseMathLabels } = require('./math-variable-labels');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { pdfSourceLines } = require('./pdf-highlights');
const { extractHtmlText } = require('./html-text');

test('concise accents use natural labels and support equivalent short TeX spellings', () => {
  for (const [formula, expected] of [
    [String.raw`\hat q`, 'q hat'], [String.raw`\widehat q`, 'q hat'], [String.raw`\widehat{q}`, 'q hat'],
    [String.raw`\bar x`, 'x bar'], [String.raw`\overline{x}`, 'x bar'],
    [String.raw`\tilde x`, 'x tilde'], [String.raw`\widetilde{x}`, 'x tilde'],
    [String.raw`\dot x`, 'x dot'], [String.raw`\ddot{x}`, 'x double dot'],
    [String.raw`\hat{\alpha}`, 'alpha hat'], [String.raw`\widehat{\Theta}`, 'Theta hat'],
  ]) for (const mathReadingLanguage of ['english', 'chinese']) {
    assert.equal(mathSpeech(formula, { mathReadingLanguage }), expected, formula);
  }
  assert.equal(mathSpeech(String.raw`\vec{x}`), 'vector x');
  assert.equal(mathSpeech(String.raw`\vec{x}`, { mathReadingLanguage: 'chinese' }), '向量 x');
});

test('concise primes and marked superscripts name the symbol without assuming its meaning', () => {
  for (const [formula, expected] of [
    ["x'", 'x prime'], ["x''", 'x double prime'], ["x' '", 'x double prime'], ["x'′", 'x double prime'], ['x′', 'x prime'], ['x″', 'x double prime'],
    [String.raw`x^\prime`, 'x prime'], [String.raw`x^{\prime\prime}`, 'x double prime'],
    [String.raw`q^*`, 'q star'], [String.raw`q^{*}`, 'q star'], [String.raw`q^{\ast}`, 'q star'],
    [String.raw`q^\star`, 'q star'], [String.raw`A^\top`, 'A transpose'], [String.raw`A^{\top}`, 'A transpose'],
  ]) assert.equal(mathSpeech(formula), expected, formula);
  assert.equal(mathSpeech(String.raw`A^{\top}`, { mathReadingLanguage: 'chinese' }), 'A 转置');
  assert.equal(mathSpeech('A^T'), 'A to the power of T');
  assert.equal(mathSpeech('q*r'), 'q times r');
  assert.equal(mathSpeech('x^2'), 'x squared');
  assert.equal(mathSpeech('x^3'), 'x cubed');
  assert.doesNotMatch(mathSpeech(String.raw`q^{\ast}`), /optimal|最优/);
  assert.doesNotMatch(mathSpeech(String.raw`\dot{x}`), /derivative|导数/);
});

test('short decorations preserve indices, grouping and fraction order', () => {
  for (const [formula, expected] of [
    [String.raw`\widehat{q}_t`, 'q hat t'], [String.raw`\widehat{q_t}`, 'q hat t'],
    [String.raw`\hat{q_{t+1}}`, 'q hat t plus 1'], [String.raw`\bar{x}_{i,j}`, 'x bar i j'],
    [String.raw`\bar{x_{i,j}}`, 'x bar i j'], [String.raw`\widehat{\mathbf{q}}_t`, 'q hat t'],
    [String.raw`\widehat{\alpha}_i`, 'alpha hat i'], [String.raw`x_i^{\prime}`, 'x i prime'],
    [String.raw`\vec{x_i}`, 'vector x i'], [String.raw`q^{\ast}+r`, 'q star plus r'],
    [String.raw`\frac{x}{\hat q}`, 'x over q hat'], [String.raw`\frac{\widehat{q}}{\bar{x}}`, 'q hat over x bar'],
    [String.raw`\frac{x'}{y}`, 'x prime over y'],
  ]) assert.equal(mathSpeech(formula), expected, formula);
  assert.equal(mathSpeech(String.raw`\frac{\widehat{q}}{\bar{x}}`, { mathReadingLanguage: 'chinese' }), 'x bar 分之 q hat');
  assert.match(mathSpeech(String.raw`\hat{x+y}`), /open parenthesis x plus y close parenthesis hat/);
  assert.equal(conciseMathLabels(String.raw`q + \hat{x}`).text, 'q + x hat');
  assert.equal(conciseMathLabels(String.raw`\frac{x}{\hat{q}}`).text, String.raw`\frac{x}{q hat}`);
});

test('new labels do not bypass smart complexity, skip settings or malformed-syntax safeguards', () => {
  const complex = [
    String.raw`\widehat{q}=\frac{a+b}{c-d}`, String.raw`\widetilde{x}=\frac{a}{b}+\frac{c}{d}`,
    String.raw`\vec{x}=[a,b,c,d]^{\top}`, String.raw`\hat{x}=\sum_{i=1}^n x_i`,
    String.raw`\widehat{q}=f_i(t)/g_i(t)`, String.raw`\widehat{q}=((a+(b-c)))`,
    String.raw`\unknown{q}`, String.raw`\widehat{q`, String.raw`\top`, String.raw`\ast`,
    String.raw`\widehat{` + 'q'.repeat(40) + '}', "x'''", 'x″″', '3′',
  ];
  for (const formula of complex) {
    assert.equal(mathSpeech(formula), 'Formula.', formula);
    assert.equal(mathSpeech(formula, { academicSkipNotice: false }), '', formula);
    assert.equal(mathSpeech(formula, { mathReadingLanguage: 'chinese' }), '公式。', formula);
  }
  for (const formula of [String.raw`\widehat q`, String.raw`q^{\ast}`, "x'", String.raw`A^{\top}`]) {
    assert.equal(mathSpeech(formula, { academicMathMode: 'skip' }), 'Formula.');
    assert.equal(mathSpeech(formula, { mathReadingLanguage: 'skip', academicSkipNotice: false }), '');
  }
  assert.match(mathSpeech(String.raw`\widehat{q}=\frac{a+b}{c-d}`, { academicMathMode: 'all' }), /q hat equals/);
});

test('verbose structural speech and prose outside formula delimiters are unchanged', () => {
  const options = { academicMathStyle: 'verbose' };
  assert.equal(mathSpeech(String.raw`\hat q_i`, options), 'q hat subscript i');
  assert.equal(mathSpeech(String.raw`\bar{x}_{i,j}`, options), 'x bar subscript i,j');
  assert.equal(mathSpeech('A^T', options), 'A to the power of T');
  assert.equal(mathSpeech(String.raw`\vec{x}`, options), 'x vec');
  const prose = "Don't alter a user's file_name, ordinary prime marks, or https://example.test/a_b?q=x+y.";
  assert.equal(academicLatex(prose), prose);
  assert.equal(conciseMathLabels('ordinary words').text, 'ordinary words');
});

test('Markdown and HTML use the new short labels without changing source text', () => {
  const source = String.raw`The labels $\widehat{q}_t$ and $q^{\ast}$ follow $x^{\prime}$ in this public example.`;
  assert.match(academicLatex(source), /q hat t/);
  assert.match(academicLatex(source), /q star/);
  assert.match(academicLatex(source), /x prime/);
  const html = `<p>${source}</p>`;
  const speech = academicLatex(extractHtmlText(html));
  assert.match(speech, /q hat t/); assert.match(speech, /q star/); assert.match(speech, /x prime/);
  assert.ok(html.includes(String.raw`$\widehat{q}_t$`));
});

test('PDF prime glyphs and positioned star/transpose marks share speech and original highlight coordinates', () => {
  const viewport = { width: 600, height: 800 };
  const item = (str, x, size = 12, y = 700, fontName = 'body') => ({ str, width: str.length * 6, height: size, fontName, transform: [size,0,0,size,x,y] });
  for (const [base, mark, expected] of [['x′', '', 'x prime'], ['x″', '', 'x double prime'], ['α′', '', 'alpha prime'],
    ['q', '*', 'q star'], ['A', '⊤', 'A transpose']]) {
    const items = [item('The value is',40), item(base,120,12,700,'math'),
      ...(mark ? [item(mark,130,8,703)] : []), item('in this example.',160)];
    const original = JSON.stringify(items), layout = extractPdfTextLayout(items, { viewport });
    const before = JSON.stringify(layout);
    const mathChanges = pdfMathChanges(layout, items, {}, { math: 'CMMI10' });
    const speech = applyPdfMathChanges(layout.text, mathChanges);
    assert.ok(speech.includes(expected), `${base}${mark}: ${speech}`);
    assert.equal(pdfSourceLines({ items, viewport, mathChanges }, text => text).text, speech.replace(/\s/g, ''));
    assert.equal(JSON.stringify(items), original); assert.equal(JSON.stringify(layout), before);
    const skipped = applyPdfMathChanges(layout.text, pdfMathChanges(layout, items, { academicMathMode: 'skip' }, { math: 'CMMI10' }));
    assert.ok(!skipped.includes(expected));
  }
});
