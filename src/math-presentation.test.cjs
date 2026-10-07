const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex } = require('./academic-speech');
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
