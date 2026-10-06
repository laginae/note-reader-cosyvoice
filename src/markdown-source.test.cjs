const assert = require('node:assert/strict');
const test = require('node:test');
const { sourceBlocks, buildMarkdownSource, currentSourceRanges, readingMarkdown, sourceLineStarts, markdownReadingHighlight } = require('./markdown-source');
const clean = value => value.replace(/^#+ /gm, '').replace(/\*\*/g, '').trim();

test('duplicate paragraphs map to their own source block, never the first matching occurrence', () => {
  const raw = '# Heading\n\nRepeated text.\n\nRepeated text.';
  const source = buildMarkdownSource(raw, ['Heading', 'Repeated text.', 'Repeated text.'], clean);
  assert.equal(source.mappingValid, true);
  const first = currentSourceRanges(source, { index: 1 }), second = currentSourceRanges(source, { index: 2 });
  assert.notEqual(first[0].from, second[0].from);
  assert.equal(raw.slice(second[0].from, second[0].to), 'Repeated text.');
});

test('selection mapping retains original source offset and rejects stale offsets', () => {
  const text = 'Before.\r\n\r\nSelected.\r\n\r\nAfter.', raw = text.slice(text.indexOf('Selected'));
  const source = buildMarkdownSource(raw, ['Selected.', 'After.'], clean, { sourceText: text, sourceOffset: text.indexOf('Selected') });
  assert.equal(source.mappingValid, true);
  assert.equal(currentSourceRanges(source, { index: 0 })[0].from, text.indexOf('Selected'));
  assert.equal(buildMarkdownSource(raw, ['Selected.'], clean, { sourceText: text, sourceOffset: 0 }), null);
});

test('uncertain full-document cleaning disables marking instead of guessing', () => {
  const source = buildMarkdownSource('One.\n\nTwo.', ['Unrelated text.'], clean);
  assert.equal(source.mappingValid, false);
  assert.deepEqual(currentSourceRanges(source, { index: 0 }), []);
});

test('a context-sensitive block does not disable exact surrounding blocks', () => {
  const raw = 'Before.\n\nFORMULA\n\nAfter.';
  const contextual = text => text.includes('Before.') && text.includes('After.') ? text.replace('FORMULA', 'spoken math') : text;
  const source = buildMarkdownSource(raw, ['Before.', 'spoken math', 'After.'], contextual);
  assert.equal(source.mappingValid, false);
  assert.equal(source.partialMapping, true);
  assert.equal(currentSourceRanges(source, { index: 0 })[0].from, 0);
  assert.deepEqual(currentSourceRanges(source, { index: 1 }), []);
  assert.equal(currentSourceRanges(source, { index: 2 })[0].from, raw.indexOf('After.'));
});

test('fenced code and multiline formulas with blank lines stay in a single block', () => {
  assert.equal(sourceBlocks('```js\nFirst\n\nSecond\n```\n\nAfter.').length, 2);
  assert.equal(sourceBlocks('$$\nFirst\n\nSecond\n$$\n\nAfter.').length, 2);
});

test('sentence marking requires an unambiguous verbatim source sentence', () => {
  const raw = 'First sentence. **Second sentence.**';
  const source = buildMarkdownSource(raw, ['First sentence. Second sentence.'], clean);
  const ranges = currentSourceRanges(source, { index: 0, sentence: { text: 'Second sentence.' } });
  assert.equal(ranges[0].sentence, true);
  assert.equal(raw.slice(ranges[0].from, ranges[0].to), 'Second sentence.');
  const repeated = buildMarkdownSource('Again. Again.', ['Again. Again.'], clean);
  assert.equal(currentSourceRanges(repeated, { index: 0, sentence: { text: 'Again.' } })[0].sentence, false);
});

test('reading renderer retains Markdown but strips resource loads, HTML and active code processors', () => {
  const raw = '# Heading\n\n- **Item**\n\n![remote](https://example.invalid/image.png)\n![[private.pdf]]\n![image][ref]\n<img src="https://example.invalid/leak">\n```dataview\nquery\n```';
  const safe = readingMarkdown(raw);
  assert.match(safe, /# Heading/); assert.match(safe, /- \*\*Item\*\*/);
  assert.doesNotMatch(safe, /!\[|<img|example.invalid|dataview/);
  assert.match(safe, /```text\nquery\n```$/);
});

test('headings and consecutive nested/task list items split without splitting fenced code, math or tables', () => {
  const text = '# Title\nIntroduction.\n- [x] First item.\n  Continuation.\n  - Child.\n2. Second item.\n\n```md\n- Example only\n# Not a heading\n```\n\n$$\n-1\n\n2\n$$\n\n| A | B |\n|---|---|\n| 1 | 2 |';
  const blocks = sourceBlocks(text);
  assert.deepEqual(blocks.map(b => b.kind), ['heading', 'paragraph', 'list', 'list', 'list', 'paragraph', 'paragraph', 'paragraph']);
  assert.ok(blocks[2].text.includes('Continuation.'));
  assert.ok(blocks[5].text.includes('# Not a heading'));
  assert.ok(blocks[6].text.includes('\n\n'));
  assert.ok(blocks[7].text.includes('| 1 | 2 |'));
  for (const b of blocks) assert.equal(text.slice(b.from, b.to), b.text);
});

test('current audio part narrows original paragraphs without modifying the synthesis plan or chunk number', () => {
  const a = 'First complete sentence.', b = 'Second complete sentence.';
  const raw = a + '\n\n' + b, source = buildMarkdownSource(raw, [raw], clean);
  const session = { chunks: [raw], audioParts: { 0: [a, b] }, currentPartIndex: 0 };
  const before = JSON.stringify(session);
  const target = markdownReadingHighlight(session, { index: 0 }, {});
  assert.equal(JSON.stringify(session), before);
  assert.equal(currentSourceRanges(source, target).length, 1);
  assert.equal(currentSourceRanges(source, target)[0].from, 0);
  session.currentPartIndex = 1;
  const next = markdownReadingHighlight(session, { index: 0 }, {});
  assert.equal(next.index, 0);
  assert.equal(currentSourceRanges(source, next)[0].from, raw.indexOf(b));
  const unplanned = { chunks: [raw] };
  markdownReadingHighlight(unplanned, { index: 0 }, {});
  assert.equal(unplanned.audioParts, undefined);
});

test('repeated audio passages use ordered offsets and formula conversions stay within their verified block', () => {
  const raw = 'Again. Again.', source = buildMarkdownSource(raw, [raw], clean);
  const target = markdownReadingHighlight({ chunks: [raw], audioParts: { 0: ['Again.', 'Again.'] }, currentPartIndex: 1 }, { index: 0 }, {});
  assert.equal(currentSourceRanges(source, target)[0].from, 7);
  assert.equal(currentSourceRanges(source, target)[0].partial, true);
  const formula = 'Before \\(x\\).\n\nAfter.', spoken = 'Before value.\n\nAfter.';
  const converted = buildMarkdownSource(formula, [spoken], t => t.replace('\\(x\\)', 'value'));
  const part = markdownReadingHighlight({ chunks: [spoken], audioParts: { 0: ['Before value.', 'After.'] } }, { index: 0 }, {});
  const ranges = currentSourceRanges(converted, part);
  assert.equal(ranges.length, 1); assert.equal(ranges[0].from, 0);
  assert.ok(ranges[0].to <= formula.indexOf('After.'));
});

test('line offsets are cached per source and partial selection offsets remain absolute', () => {
  const full = 'Earlier.\r\n\r\nFirst.\r\n\r\nSecond.', offset = full.indexOf('First.');
  const raw = full.slice(offset), source = buildMarkdownSource(raw, [raw], clean, { sourceText: full, sourceOffset: offset });
  assert.equal(sourceLineStarts(source), sourceLineStarts(source));
  assert.deepEqual(sourceLineStarts(source), [0, 10, 12, 20, 22]);
  const target = markdownReadingHighlight({ chunks: [raw], audioParts: { 0: ['First.', 'Second.'] }, currentPartIndex: 1 }, { index: 0 }, {});
  assert.equal(currentSourceRanges(source, target)[0].from, full.indexOf('Second.'));
});
