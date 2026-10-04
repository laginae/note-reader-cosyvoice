const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfSpeechChunker } = require('./pdf-chunker');

test('PDF line wraps do not outrank complete sentences, including short sentences', () => {
  const chunker = createPdfSpeechChunker([65]);
  const chunks = [...chunker.push('Short. The next sentence continues\non another line and finishes here. Final sentence.'), ...chunker.finish()];
  assert.equal(chunks[0].text, 'Short.');
  assert.equal(chunks[1].text, 'The next sentence continues on another line and finishes here.');
});

test('PDF page crossings preserve all content and the first page locator', () => {
  const chunker = createPdfSpeechChunker([60]);
  const chunks = [...chunker.push('The sentence continues', { pageNumber: 1 }),
    ...chunker.push('on the next page. Another sentence follows. Last.', { pageNumber: 2 }), ...chunker.finish()];
  assert.equal(chunks[0].text, 'The sentence continues on the next page.');
  assert.equal(chunks[0].metadata.pageNumber, 1);
  assert.equal(chunks[1].metadata.pageNumber, 2);
  assert.equal(chunks.map(chunk => chunk.text).join(' '), 'The sentence continues on the next page. Another sentence follows. Last.');
});

test('overlong PDF sentences still respect synthesis limits without dropping text', () => {
  const text = '很长的中文句子没有中间标点'.repeat(30) + '。';
  const chunker = createPdfSpeechChunker([40, 80, 200]);
  const chunks = [...chunker.push(text, { pageNumber: 3 }), ...chunker.finish()];
  assert.equal(chunks.map(chunk => chunk.text).join(''), text);
  chunks.forEach((chunk, index) => assert.ok(chunk.text.length <= [40, 80, 200][Math.min(index, 2)]));
});
