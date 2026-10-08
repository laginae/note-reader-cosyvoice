const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex } = require('./academic-speech');
test('named lower/upper bounds use concise ranges and preserve verbose interval labels', () => {
  for (const source of [String.raw`[\ell,u]`, String.raw`[ l , u ]`, String.raw`\left[\ell,u\right]`]) {
    const lower = source.includes('ell') ? 'ell' : 'l';
    assert.equal(mathSpeech(source), lower + ' to u');
    assert.equal(mathSpeech(source, {mathReadingLanguage:'chinese'}), lower + ' 到 u');
    assert.equal(mathSpeech(source, {academicMathStyle:'verbose'}), 'closed interval, ' + lower + ' to u');
  }
  const source = String.raw`[E_{\min}+R_{\infty}z_{\mathrm d},\ E_{\max}-R_{\infty}z_{\mathrm c}]`;
  const en = 'E sub min plus R sub infinity times z sub d to E sub max minus R sub infinity times z sub c';
  assert.equal(mathSpeech(source), en);
  assert.equal(academicLatex('$' + source + '$').trim(), en);
  assert.equal(mathSpeech(source, {mathReadingLanguage:'chinese'}),
    'E sub min 加 R sub 无穷 乘以 z sub d 到 E sub max 减 R sub 无穷 乘以 z sub c');
  assert.equal(mathSpeech(source, {academicMathMode:'skip'}), 'Formula omitted.');
  assert.equal(mathSpeech(source, {mathReadingLanguage:'skip', academicSkipNotice:false}), '');
});
test('range recognition does not reinterpret arbitrary pairs, vectors or unsupported operators', () => {
  assert.equal(mathSpeech('[x,y]'), 'open bracket x,y close bracket');
  assert.equal(mathSpeech('[1,2]'), 'open bracket 1,2 close bracket');
  assert.equal(mathSpeech('[l,u,v]'), 'open bracket l,u,v close bracket');
  assert.equal(mathSpeech('(l,u]'), 'open parenthesis l,u close bracket');
  assert.equal(mathSpeech(String.raw`\ell`), 'ell');
  assert.equal(mathSpeech(String.raw`R_\infty`), 'R sub infinity');
  assert.equal(mathSpeech(String.raw`E_\min`), 'E sub min');
  assert.equal(mathSpeech(String.raw`\min(x,y)`), 'Formula omitted.');
  assert.equal(mathSpeech(String.raw`[E_{\min},F_{\max}]`), 'open bracket E sub min ,F sub max close bracket');
  assert.equal(mathSpeech(String.raw`[E_{\min}+\sqrt{x},E_{\max}-\sqrt{x}]`).includes('omitted'), false);
  for (const source of [
    String.raw`[E_{\min}+\sqrt{x},E_{\max}-\sqrt]`,
    String.raw`[E_{\min}+\unknown{x},E_{\max}]`,
    '[E_{min}+' + 'x'.repeat(40) + ',E_{max}]',
  ]) {
    assert.equal(mathSpeech(source), 'Formula omitted.');
    assert.equal(mathSpeech(source, {academicSkipNotice:false}), '');
  }
});
test('short formulas ignore typography without losing scripts or symbols', () => {
  const cases = [
    [String.raw`z_{\mathrm d}`, 'z sub d'],
    [String.raw`z_{\mathrm{d}}`, 'z sub d'],
    [String.raw`z_\mathrm{d}`, 'z sub d'],
    [String.raw`z_{\text{d}}`, 'z sub d'],
    [String.raw`z_{{d}}`, 'z sub d'],
    [String.raw`\mathbf{z}_{\mathrm d}`, 'z sub d'],
    [String.raw`\mathit{x}^{\mathrm{2}}`, 'x squared'],
    [String.raw`\bar{\mathrm{x}}_i`, 'x bar sub i'],
    [String.raw`\hat{\mathbf{x}}_k`, 'x hat sub k'],
    [String.raw`\displaystyle x\,=\;y\!`, 'x equals y'],
    [String.raw`\frac{\mathrm a}{\mathrm b}`, 'a over b'],
    [String.raw`x_\alpha`, 'x sub alpha'],
    [String.raw`{\rm z}_{\mathsf d}`, 'z sub d'],
  ];
  for (const [input, expected] of cases) assert.equal(mathSpeech(input), expected, input);
  assert.equal(academicLatex(String.raw`Read $z_{\mathrm d}$ now.`).trim(), 'Read  z sub d  now.');
  assert.equal(mathSpeech(String.raw`z_{\mathrm d}`, {mathReadingLanguage:'chinese'}), 'z sub d');
  assert.equal(mathSpeech(String.raw`z_{\mathrm d}`, {academicMathStyle:'verbose'}), 'z subscript d');
});
test('normalization retains omission policy and structural safety', () => {
  for (const input of [String.raw`\unknown{x}`, String.raw`\sum_{i=1}^n x_i`,
    String.raw`\int_0^1 x dx`, String.raw`z_{\mathrm d`, String.raw`\begin{matrix}x\end{matrix}`,
    String.raw`\mathrm{` + 'x'.repeat(33) + '}', '{'.repeat(17)+'x'+'}'.repeat(17)]) {
    assert.equal(mathSpeech(input), 'Formula omitted.', input);
    assert.equal(mathSpeech(input, {academicSkipNotice:false}), '', input);
  }
  assert.equal(mathSpeech(String.raw`z_{\mathrm d}`, {academicMathMode:'skip'}), 'Formula omitted.');
});
