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

test('opening accumulates complete sentences and remaining chunks keep the configured ramp', () => {
  for (const first of ['第一句话。', 'First sentence.', 'The value is 0.95.', 'Dr. Smith agrees.']) {
    const tail = '后面的内容继续按照设置分段。'.repeat(80);
    const second = 'The second sentence makes the opening long enough.';
    const text = `${first} ${second} ${tail}`;
    const chunks = splitTextForSpeechChunks(text, [200, 400, 800], { openingSentences: true });
    assert.equal(chunks[0], `${first} ${second}`);
    assert.deepEqual(chunks.slice(1), splitTextForSpeechChunks(tail, [200, 400, 800]));
    assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  }
});

test('opening stops at the first sentence boundary reaching 40 non-whitespace characters', () => {
  for (const size of [39, 40, 41]) {
    const first = '字'.repeat(size - 1) + '。';
    const text = first + '第二句。第三句。';
    assert.equal(splitTextForSpeechChunks(text, [200], { openingSentences: true })[0],
      size < 40 ? first + '第二句。' : first);
  }
  const first = 'Dr. Smith reports a detailed scientific result.';
  assert.equal(splitTextForSpeechChunks(first + ' Another sentence.', [200], { openingSentences: true })[0], first);
  const chunker = createIncrementalSpeechChunker([200], { openingSentences: true });
  const firstLong = '字'.repeat(39) + '。';
  assert.deepEqual(chunker.push(firstLong), [firstLong]);
  assert.deepEqual(chunker.finish(), []);
});

test('opening titles, long sentences and documents without sentence punctuation stay bounded', () => {
  const titleText = 'A heading\n\nA complete sentence. More words.';
  assert.deepEqual(splitTextForSpeechChunks(titleText, [200], { openingSentences: true }), [titleText]);
  assert.deepEqual(splitTextForSpeechChunks('Only one sentence.', [200], { openingSentences: true }), ['Only one sentence.']);
  assert.deepEqual(splitTextForSpeechChunks('', [200], { openingSentences: true }), []);
  const text = '无标点长句'.repeat(100) + '。结束。';
  const chunks = splitTextForSpeechChunks(text, [50, 100], { openingSentences: true });
  assert.ok(chunks[0].length <= 50);
  assert.equal(chunks.join(''), text);
});

test('progressive PDFs emit a 40-character opening before a full first chunk is available', () => {
  const chunker = createIncrementalSpeechChunker([200, 400, 800], { openingSentences: true, detailed: true });
  const opening = '字'.repeat(39) + '。';
  const first = chunker.push(opening + '后面还有一段正文。', { pageNumber: 1 });
  assert.deepEqual(first, [{ text: opening, metadata: { pageNumber: 1 } }]);
  const rest = [...chunker.push('第二页正文。', { pageNumber: 2 }), ...chunker.finish()];
  assert.equal([...first, ...rest].map((c) => c.text).join('').replace(/\s/g, ''), opening + '后面还有一段正文。第二页正文。');
  assert.equal(rest[0].metadata.pageNumber, 1);
});

test('incremental opening buffer preserves text and page anchors across empty pages', () => {
  const pages = ['First sentence continues', '', 'on the next page with more detail. Remaining text.'];
  const chunker = createIncrementalSpeechChunker([200], { openingSentences: true, detailed: true });
  assert.deepEqual(chunker.push(pages[0], { pageNumber: 1 }), []);
  assert.deepEqual(chunker.push('', { pageNumber: 2 }), []);
  const chunks = [...chunker.push(pages[2], { pageNumber: 3 }), ...chunker.finish()];
  assert.equal(chunks.map((c) => c.text).join('').replace(/\s/g, ''), pages.join('').replace(/\s/g, ''));
  assert.equal(chunks[0].metadata.pageNumber, 1);
  assert.equal(chunks.at(-1).metadata.pageNumber, 3);
});

test('opening can wait for three or more short sentences and respects character caps', () => {
  const chunker = createIncrementalSpeechChunker([200], { openingSentences: true });
  assert.deepEqual(chunker.push('First sentence.'), []);
  assert.deepEqual(chunker.push('Second sentence.'), []);
  assert.deepEqual(chunker.push('Third sentence. More text.'), ['First sentence.\n\nSecond sentence.\n\nThird sentence.']);
  assert.deepEqual(chunker.finish(), ['More text.']);
  const text = 'First sentence.\n\nSecond sentence. Third sentence. Fourth sentence.';
  assert.equal(splitTextForSpeechChunks(text, [200], { openingSentences: true })[0], 'First sentence.\n\nSecond sentence. Third sentence.');
  const capped = splitTextForSpeechChunks('Short sentence. ' + 'Long text '.repeat(30) + '.', [40, 100], { openingSentences: true });
  assert.ok(capped[0].length <= 40);
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
