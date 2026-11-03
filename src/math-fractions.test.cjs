'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex, complexListeningMath } = require('./academic-speech');
const { conciseFractionSpeech } = require('./math-fractions');
const zh = { mathReadingLanguage: 'chinese' };

test('short fractions express whole sums and ordered differences without reading delimiters', () => {
  const examples = [
    [String.raw`(x-y)/\bar z`, 'x 减 y 的差 除以 z bar', 'the difference of x and y, divided by z bar'],
    [String.raw`\frac{x-y}{\overline{z}}`, 'x 减 y 的差 除以 z bar', 'the difference of x and y, divided by z bar'],
    [String.raw`\dfrac{x+y}{z}`, 'x 加 y 的和 除以 z', 'the sum of x and y, divided by z'],
    [String.raw`\tfrac{x}{y-z}`, 'x 除以 y 减 z 的差', 'x divided by the difference of y and z'],
    ['x/(y+z)', 'x 除以 y 加 z 的和', 'x divided by the sum of y and z'],
    [String.raw`\frac{x_i-y_j}{\hat z}`, 'x i 减 y j 的差 除以 z hat', 'the difference of x i and y j, divided by z hat'],
    [String.raw`(x-y)/\bar{z_i}`, 'x 减 y 的差 除以 z bar i', 'the difference of x and y, divided by z bar i'],
    ['(x-y)/z^2', 'x 减 y 的差 除以 z 的平方', 'the difference of x and y, divided by z squared'],
    [String.raw`(\alpha-\beta)/\overline{\gamma}`, 'alpha 减 beta 的差 除以 gamma bar', 'the difference of alpha and beta, divided by gamma bar'],
    ['(α-β)/γ', 'alpha 减 beta 的差 除以 gamma', 'the difference of alpha and beta, divided by gamma'],
    ['(3.5+2)/x', '3.5 加 2 的和 除以 x', 'the sum of 3.5 and 2, divided by x'],
    [String.raw`\frac{(x-y)}{z}`, 'x 减 y 的差 除以 z', 'the difference of x and y, divided by z'],
    [String.raw`\left(x-y\right)/z`, 'x 减 y 的差 除以 z', 'the difference of x and y, divided by z'],
    ['(x-y)÷z', 'x 减 y 的差 除以 z', 'the difference of x and y, divided by z'],
  ];
  for (const [formula, chinese, english] of examples) for (const academicMathMode of ['smart', 'all']) {
    assert.equal(mathSpeech(formula, { ...zh, academicMathMode }), chinese, formula);
    assert.equal(mathSpeech(formula, { academicMathMode }), english, formula);
  }
});

test('verbose fraction speech and familiar numeric fractions retain their existing structure', () => {
  const formula = String.raw`(x-y)/\bar z`;
  assert.equal(mathSpeech(formula, { ...zh, academicMathStyle: 'verbose' }), '左括号 x 减 y 右括号 除以 z bar');
  assert.equal(mathSpeech(formula, { academicMathStyle: 'verbose' }), 'open parenthesis x minus y close parenthesis divided by z bar');
  assert.equal(mathSpeech(String.raw`\frac{x-y}{z}`, { ...zh, academicMathStyle: 'verbose' }), 'z 分之 括号 x 减 y 括号结束');
  assert.equal(mathSpeech(String.raw`\frac{1}{2}`, zh), '2 分之 1');
  assert.equal(mathSpeech(String.raw`\frac{1}{2}`), '1 over 2');
  assert.equal(mathSpeech('x-y/z', zh), 'x 减 y 除以 z');
  assert.equal(mathSpeech('x/(y-z)', zh), 'x 除以 y 减 z 的差');
  assert.equal(mathSpeech('(y-x)/z', zh), 'y 减 x 的差 除以 z');
  assert.equal(mathSpeech('(x-y)'), 'open parenthesis x minus y close parenthesis');
});

test('fraction simplification preserves skip policy and all existing complexity gates', () => {
  for (const formula of ['(x-y)/z', String.raw`\frac{x}{y-z}`]) {
    assert.equal(mathSpeech(formula, { academicMathMode: 'skip' }), 'Formula.');
    assert.equal(mathSpeech(formula, { ...zh, academicMathMode: 'skip' }), '公式。');
    assert.equal(mathSpeech(formula, { academicMathMode: 'skip', academicSkipNotice: false }), '');
    assert.equal(mathSpeech(formula, { mathReadingLanguage: 'skip', academicSkipNotice: false }), '');
  }
  for (const formula of ['(x+y)/(z-w)', String.raw`\frac{x-y}{z+w}`, 'x/(y/z)', '(x+y)/(z*w)',
    '((x+y)/z)/w', '(x-y)/z+w', String.raw`\sum_{i=1}^n x_i`, String.raw`(x-y)/\unknown z`]) {
    assert.equal(mathSpeech(formula), 'Formula.', formula);
    assert.equal(mathSpeech(formula, { academicSkipNotice: false }), '', formula);
  }
  assert.equal(complexListeningMath('(x-y)/z'), false);
  assert.equal(complexListeningMath('(x-y)/(z+w)'), true);
});

test('bounded fraction grammar refuses ambiguous products, functions and malformed groups', () => {
  const render = raw => mathSpeech(raw, zh);
  for (const formula of ['x-y/z', '(x-y)/z*w', '(x-y)/z w', 'f(x-y)/z', 'x/f(y-z)',
    'x/(y/z)', '(x+y)/(z*w)', 'x/(y-z]', '(x-y)/', '/x', String.raw`\frac{x-y}{z}w`,
    String.raw`\frac{x-y}{z`, String.raw`\frac{x-y}z`, String.raw`(x-y)/\bar{zw}`,
    '[x,y]/z', '(x-y)/' + 'x'.repeat(4096), 'x/(' + 'y+'.repeat(500) + 'z)']) {
    assert.equal(conciseFractionSpeech(formula, true, render), null, formula.slice(0, 80));
  }
  assert.equal(mathSpeech('x/(y-z)', { academicMathMode: 'all', ...zh }), 'x 除以 y 减 z 的差');
  assert.equal(mathSpeech('(x-y)/-2', { academicMathMode: 'all', ...zh }), 'x 减 y 的差 除以 负2');
});

test('fraction language follows local prose without rewriting ordinary punctuation or persisting state', () => {
  for (let i = 0; i < 10; i++) {
    assert.match(academicLatex(String.raw`结果为 $(x-y)/\bar z$。`), /x 减 y 的差 除以 z bar/);
    assert.match(academicLatex(String.raw`The result is $\frac{x+y}{z}$.`, zh), /the sum of x and y, divided by z/);
    assert.match(mathSpeech(String.raw`k\tau`), /k times tau/);
    assert.equal(mathSpeech(String.raw`x_\alpha`), 'x alpha');
    assert.equal(mathSpeech('x_i', { ...zh, academicMathStyle: 'verbose' }), 'x 下标 i');
    assert.equal(mathSpeech('x_i', zh), 'x i');
  }
  const prose = 'URL https://example.test/x-y/z; date 2026-01-02; ordinary (parentheses) and x/y.';
  assert.equal(academicLatex(prose), prose);
});
