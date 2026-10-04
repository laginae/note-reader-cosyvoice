const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { readerRange, extractReaderSelection, outlineSections } = require('./reader-selection');

test('Focus reading uses the selected repeated occurrence and retains all following paragraphs', () => {
  const dom = new JSDOM('<main><p>Same phrase. Earlier paragraph.</p><p>Same <strong>phrase.</strong> Later paragraph.</p><p>Last paragraph.</p></main>');
  const doc = dom.window.document, root = doc.querySelector('main'), paragraph = root.children[1];
  const range = doc.createRange(); range.setStart(paragraph.firstChild, 0); range.setEnd(paragraph.querySelector('strong').firstChild, 7);
  doc.getSelection().addRange(range);
  const result = extractReaderSelection(root, readerRange(root));
  assert.equal(result.selectedText, 'Same phrase.');
  assert.equal(result.text.slice(result.startOffset), 'Same phrase. Later paragraph.\n\nLast paragraph.');
  assert.ok(result.startOffset > result.text.indexOf('Earlier paragraph.'));
});

test('selection boundaries inside a word and across inline formatting remain exact', () => {
  const dom = new JSDOM('<main><p>First alphabet <em>second</em> ending.</p></main>');
  const doc = dom.window.document, root = doc.querySelector('main'), p = root.firstChild;
  const range = doc.createRange(); range.setStart(p.firstChild, 8); range.setEnd(p.querySelector('em').firstChild, 3);
  const result = extractReaderSelection(root, range);
  assert.equal(result.selectedText, 'phabet sec');
  assert.equal(result.text.slice(result.startOffset), 'phabet second ending.');
  range.setStartBefore(root); assert.equal(extractReaderSelection(root, range), null);
});

test('outline sections include nested headings and stop at the next peer or parent', () => {
  const text = '# Main\n\nA\n\n## Part\n\nB\n\n### Child\n\nC\n\n## Part\n\nD';
  const make = (heading, level, from) => ({ heading, level, position: { start: { offset: from, line: text.slice(0, from).split('\n').length - 1 }, end: { offset: text.indexOf('\n', from) } } });
  const sections = outlineSections(text, [make('Main', 1, 0), make('Part', 2, text.indexOf('## Part')), make('Child', 3, text.indexOf('### Child')), make('Part', 2, text.lastIndexOf('## Part'))]);
  assert.equal(sections[0].to, text.length);
  assert.equal(text.slice(sections[1].from, sections[1].to), '## Part\n\nB\n\n### Child\n\nC\n\n');
  assert.notEqual(sections[1].from, sections[3].from);
  assert.deepEqual(outlineSections('Changed document.', [make('Main', 1, 0)]), []);
});
