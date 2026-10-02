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

test('opening audio uses 20, then 40 new characters, then the remainder', () => {
  const { splitOpeningAudioParts } = require('./semantic-chunker');
  const first = '字'.repeat(19) + '。';
  const second = '文'.repeat(39) + '。';
  const remainder = '剩余内容。'.repeat(20);
  assert.deepEqual(splitOpeningAudioParts(first + second + remainder), [first, second, remainder]);
  assert.deepEqual(splitOpeningAudioParts('短句。'.repeat(30)).map(t => t.length), [21, 42, 27]);
  for (const text of ['', '短句。', 'No sentence punctuation', 'A heading\n\nDr. Smith measured 0.95. The results are consistent. Last sentence.']) {
    const parts = splitOpeningAudioParts(text);
    assert.ok(parts.length <= 3);
    assert.equal(parts.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  }
  const long = '长'.repeat(100) + '。';
  assert.equal(splitOpeningAudioParts(long + second)[0], long);
});

test('internal audio parts do not change logical chunks, PDF pages or export segments', () => {
  const { getSpeechParts } = require('./speech-parts');
  const text = '这是一些用于朗读的句子。'.repeat(80);
  const chunks = splitTextForSpeechChunks(text, [200, 400, 800]);
  const session = { chunks };
  const original = chunks.slice();
  assert.equal(getSpeechParts(session, 0).length, 3);
  assert.deepEqual(getSpeechParts(session, 1), [chunks[1]]);
  assert.deepEqual(session.chunks, original);
  assert.equal(getSpeechParts(session, 0).join(''), chunks[0]);
  assert.deepEqual(getSpeechParts({ chunks, kind: 'audio-export' }, 0), [chunks[0]]);
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
