const assert = require('node:assert/strict');
const test = require('node:test');
const { sourceBlocks, buildMarkdownSource, currentSourceRanges, readingMarkdown } = require('./markdown-source');
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
