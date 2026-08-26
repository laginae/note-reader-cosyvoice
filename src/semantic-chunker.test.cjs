const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createIncrementalSpeechChunker,
  splitTextForSpeechChunks,
} = require('./semantic-chunker');

test('semantic chunks prefer paragraph, line, and sentence boundaries', () => {
  const text = 'First paragraph has a complete sentence.\n\nSecond paragraph also has a complete sentence. Final clause.';
  const chunks = splitTextForSpeechChunks(text, [48, 64]);

  assert.equal(chunks[0], 'First paragraph has a complete sentence.');
  assert.ok(chunks.every((chunk, index) => chunk.length <= (index === 0 ? 48 : 64)));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});

test('progressive page chunking matches complete page text chunking', () => {
  const pages = [
    'Page one opening sentence. Page one closing sentence.',
    'Page two opening sentence.\nA table-like row stays on its own line.\nAnother row follows.',
    'Page three ends the document.',
  ];
  const limits = [45, 70, 90];
  const incremental = createIncrementalSpeechChunker(limits);
  const chunks = [];
  pages.forEach((page) => chunks.push(...incremental.push(page)));
  chunks.push(...incremental.finish());

  assert.deepEqual(chunks, splitTextForSpeechChunks(pages.join('\n\n'), limits));
});

test('detailed progressive chunks retain the page where each chunk starts', () => {
  const chunker = createIncrementalSpeechChunker([24], { detailed: true });
  const chunks = [
    ...chunker.push('First page sentence. Tail.', { pageNumber: 1 }),
    ...chunker.push('Second page sentence.', { pageNumber: 2 }),
    ...chunker.finish(),
  ];

  assert.equal(chunks[0].metadata.pageNumber, 1);
  assert.equal(chunks.at(-1).metadata.pageNumber, 2);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 24));
});
