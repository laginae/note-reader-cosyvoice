const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { highlightDocument, clearDocumentHighlight } = require('./dom-highlights');
const { HtmlReadingHighlights } = require('./html-highlights');

function fixture() {
  const dom = new JSDOM('<main><p>First <em>public paragraph.</em></p><form>Not for reading</form><p>Second paragraph.</p><p hidden>Private hidden text.</p></main>', { url: 'https://example.test/' });
  const win = dom.window;
  win.CSS = { highlights: new Map() };
  win.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  return { dom, doc: win.document, marks: win.CSS.highlights };
}

test('HTML highlighting preserves selection, inline formatting and spaces, and never marks excluded forms', () => {
  const { dom, doc, marks } = fixture(), before = doc.body.innerHTML;
  const range = doc.createRange(); range.selectNodeContents(doc.querySelector('em'));
  doc.getSelection().addRange(range);
  assert.equal(highlightDocument(doc, { text: 'First public paragraph. Second paragraph.' }), true);
  assert.equal([...marks.get('note-reader-speech')].map(r => r.toString()).join(''), 'First public paragraph.Second paragraph.');
  assert.equal(doc.getSelection().toString(), 'public paragraph.');
  assert.equal(doc.body.innerHTML, before);
  clearDocumentHighlight(doc); assert.equal(marks.size, 0); assert.equal(doc.querySelectorAll('style').length, 0);
  dom.window.close();
});

test('ambiguous, hidden, mismatched URLs and unsupported browsers are left unmarked', () => {
  const { dom, doc, marks } = fixture();
  assert.equal(highlightDocument(doc, { text: 'Private hidden text.' }), false);
  assert.equal(highlightDocument(doc, { text: 'Second paragraph.', url: 'https://example.test/changed' }), false);
  const p = doc.createElement('p'); p.textContent = 'Second paragraph.'; doc.body.append(p);
  assert.equal(highlightDocument(doc, { text: 'Second paragraph.' }), false);
  dom.window.Highlight = undefined;
  assert.equal(highlightDocument(doc, { text: 'First public paragraph.' }), false);
  assert.equal(marks.size, 0); dom.window.close();
});

test('page edits invalidate highlights and styles without altering other highlight owners', async () => {
  const { dom, doc, marks } = fixture();
  marks.set('other-plugin', new Set());
  highlightDocument(doc, { text: 'First public paragraph.' });
  const unrelated = doc.createElement('aside'); unrelated.textContent = 'Status update'; doc.body.append(unrelated);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(marks.has('note-reader-speech'), true);
  doc.querySelector('em').textContent = 'Edited paragraph.';
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(marks.has('note-reader-speech'), false); assert.equal(marks.has('other-plugin'), true);
  assert.equal(doc.querySelectorAll('style').length, 0); dom.window.close();
});

test('HTML manager clears marks on changed files, stopping and disabling the setting', () => {
  const { dom, doc, marks } = fixture();
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: doc } } };
  const plugin = { settings: {}, activeSession: { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1, chunks: ['Second paragraph.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin); manager.update(); assert.equal(marks.size, 1);
  view.file.stat.mtime = 2; manager.update(); assert.equal(marks.size, 0);
  view.file.stat.mtime = 1; manager.update(); assert.equal(marks.size, 1);
  plugin.settings.webReadingHighlight = false; manager.update(); assert.equal(marks.size, 0);
  plugin.settings.webReadingHighlight = true; manager.update(); plugin.activeSession = null; manager.update();
  assert.equal(marks.size, 0); manager.destroy(); dom.window.close();
});
