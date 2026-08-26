const assert = require('assert');
const {
  sanitizeTextForSpeech,
  splitTextForSpeechChunks,
  normalizeSpeed,
} = require('./core');

assert.strictEqual(
  sanitizeTextForSpeech('---\ntitle: A\n---\n# Heading\nText with [link](https://x.test) and `code`.'),
  'Heading\nText with link and code.'
);

assert.strictEqual(
  sanitizeTextForSpeech('短公式 $a_b$ 和 $\\alpha+\\beta$ 可以读，长公式 $\\int_0^1 x^2 + y^2 + z^2 dx$ 跳过。'),
  '短公式 a subscript b 和 alpha plus beta 可以读，长公式 跳过。'
);

assert.strictEqual(
  sanitizeTextForSpeech('The quantile of $|Y\\_{k,h}|$ is used.'),
  'The quantile of absolute value of Y subscript k,h is used.'
);

assert.strictEqual(
  sanitizeTextForSpeech('绝对值 $|x_i|$。', { mathReadingLanguage: 'chinese' }),
  '绝对值 x 下标 i 的绝对值。'
);

assert.strictEqual(
  sanitizeTextForSpeech('命令 \\textbf{重点}、\\mathbf{x}、\\frac{a}{b}、\\leq 都要自然朗读。'),
  '命令 重点、x、a over b、less than or equal to 都要自然朗读。'
);

assert.strictEqual(
  sanitizeTextForSpeech('块公式 $$E = mc^2 + \\frac{1}{2}mv^2$$ 不读，短的 \\(x^2\\) 读。'),
  '块公式 不读，短的 x superscript 2 读。'
);

assert.strictEqual(
  sanitizeTextForSpeech('短公式 $a_b$ 和 $\\frac{a}{b}$ 中文读。', { mathReadingLanguage: 'chinese' }),
  '短公式 a 下标 b 和 a 分之 b 中文读。'
);

assert.strictEqual(
  sanitizeTextForSpeech('短公式 $a_b$ 和 $\\frac{a}{b}$ 跳过。', { mathReadingLanguage: 'skip' }),
  '短公式 和 跳过。'
);

const reportedMarkdownTable = `**Table I. Coverage of the 1 min aggregation of the 2023 frequency data of the three regions**

| Region | Dataset | Raw sampling interval [s] | Valid 15 min periods | Adjacent month pairs | Invalid ratio [%] |
| :----: | :-----: | ------------------------: | -------------------: | -------------------: | ----------------: |
|  CN-NE |         |                           |                      |                      |                   |`;
const sanitizedMarkdownTable = sanitizeTextForSpeech(reportedMarkdownTable);
assert.strictEqual(
  sanitizedMarkdownTable,
  'Table I. Coverage of the 1 min aggregation of the 2023 frequency data of the three regions\n' +
    'Table columns: Region; Dataset; Raw sampling interval [s]; Valid 15 min periods; Adjacent month pairs; Invalid ratio [%].\n' +
    'Row 1. Region: CN-NE.'
);
assert.ok(!/[|]/.test(sanitizedMarkdownTable));
assert.ok(!/-{3,}/.test(sanitizedMarkdownTable));
assert.strictEqual(
  sanitizeTextForSpeech('| Name | Value |\n| --- | --- |\n| Frequency |'),
  'Table columns: Name; Value.\nRow 1. Name: Frequency.'
);

const reportedCitationText = 'to examine the effect of rolling parameter updates. The results are given in Supplementary Material S3 [28], [29]. The second stage constructs 90% and 95% intervals from the empirical quantiles of training-period hold-out forecasts and then verifies the calibration of the intervals with the empirical coverage on the test month [30].';
assert.strictEqual(
  sanitizeTextForSpeech(reportedCitationText),
  'to examine the effect of rolling parameter updates. The results are given in Supplementary Material S3 reference 28, reference 29. The second stage constructs 90% and 95% intervals from the empirical quantiles of training-period hold-out forecasts and then verifies the calibration of the intervals with the empirical coverage on the test month reference 30.'
);
assert.strictEqual(
  sanitizeTextForSpeech('Evidence is reported in [28, 29] and [28–30].'),
  'Evidence is reported in references 28 and 29 and references 28 to 30.'
);
assert.strictEqual(
  sanitizeTextForSpeech('Units [s] and [%], year [2023], and interval [0, 1] remain.'),
  'Units [s] and [%], year [2023], and interval [0, 1] remain.'
);
assert.strictEqual(sanitizeTextForSpeech('研究结果见 [28]。'), '研究结果见 参考文献 28。');

assert.deepStrictEqual(splitTextForSpeechChunks('甲'.repeat(45), [10, 20]), [
  '甲'.repeat(10),
  '甲'.repeat(20),
  '甲'.repeat(15),
]);

assert.strictEqual(normalizeSpeed('0.2'), 0.5);
assert.strictEqual(normalizeSpeed('3'), 2);
assert.strictEqual(normalizeSpeed('bad'), 1);

console.log('core tests passed');
