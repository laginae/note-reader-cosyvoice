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

assert.deepStrictEqual(splitTextForSpeechChunks('甲'.repeat(45), [10, 20]), [
  '甲'.repeat(10),
  '甲'.repeat(20),
  '甲'.repeat(15),
]);

assert.strictEqual(normalizeSpeed('0.2'), 0.5);
assert.strictEqual(normalizeSpeed('3'), 2);
assert.strictEqual(normalizeSpeed('bad'), 1);

console.log('core tests passed');
