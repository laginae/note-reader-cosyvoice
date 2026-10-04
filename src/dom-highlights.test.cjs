const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { highlightDocument, clearDocumentHighlight } = require('./dom-highlights');
const { HtmlReadingHighlights } = require('./html-highlights');
const { extractHtmlText } = require('./html-text');

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

test('chunks crossing paragraphs and tables reuse synthesized cell separators without painting invented punctuation', () => {
  const { dom, doc, marks } = fixture();
  doc.body.innerHTML = '<p>Before <em>the table.</em></p><table><tr><th>Region</th><th>Value</th></tr><tr><td>Alpha</td><td>20%</td></tr><tr><td>Beta</td><td>10%</td></tr></table><p>After the table; still readable.</p>';
  const before = doc.body.innerHTML, speech = extractHtmlText(before);
  assert.equal(highlightDocument(doc, { text: speech }), true);
  assert.equal([...marks.get('note-reader-speech')].map(range => range.toString()).join(''),
    'Before the table.RegionValueAlpha20%Beta10%After the table; still readable.');
  assert.equal(doc.body.innerHTML, before);
  assert.equal(highlightDocument(doc, { text: 'Alpha; 20%; Beta; 10%;' }), true);
  assert.equal([...marks.get('note-reader-speech')].map(range => range.toString()).join(''), 'Alpha20%Beta10%');
  assert.equal(highlightDocument(doc, { text: 'After the table still readable.' }), false);
  assert.equal(highlightDocument(doc, { text: ';' }), false);
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

test('HTML manager restores same-segment marks after a rerender and repeated pause/resume updates', async () => {
  const { dom, doc, marks } = fixture();
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: doc } } };
  const plugin = { settings: {}, activeSession: { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1, chunks: ['Second paragraph.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin);
  for (let i = 0; i < 8; i++) manager.update();
  assert.equal(marks.size, 1);
  const paragraph = doc.querySelectorAll('p')[1]; paragraph.replaceChildren(doc.createTextNode('Second paragraph.'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(marks.size, 0);
  manager.update(); assert.equal(marks.size, 1);
  marks.delete('note-reader-speech'); manager.update(); assert.equal(marks.size, 1);
  manager.destroy(); assert.equal(marks.size, 0); dom.window.close();
});

test('HTML manager follows a replaced iframe document without changing the playing segment', () => {
  const old = fixture(), next = fixture();
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: old.doc } } };
  const plugin = { settings: {}, activeSession: { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1, chunks: ['Second paragraph.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin); manager.update();
  view.mainView.iframe.contentDocument = next.doc; manager.update();
  assert.equal(old.marks.size, 0); assert.equal(next.marks.size, 1);
  manager.destroy(); old.dom.window.close(); next.dom.window.close();
});

test('HTML manager retries an initially missing segment after content arrives, not on every playback tick', async () => {
  const { dom, doc, marks } = fixture();
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: doc } } };
  const plugin = { settings: {}, activeSession: { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1, chunks: ['Later paragraph.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin); manager.update(); assert.equal(marks.size, 0);
  const observer = manager.htmlObservers.get(doc).observer;
  for (let i = 0; i < 8; i++) manager.update();
  assert.equal(manager.htmlObservers.get(doc).observer, observer);
  const paragraph = doc.createElement('p'); paragraph.textContent = 'Later paragraph.'; doc.body.appendChild(paragraph);
  await new Promise(resolve => setImmediate(resolve)); manager.update(); assert.equal(marks.size, 1);
  manager.destroy(); paragraph.textContent = 'Changed after closing';
  await new Promise(resolve => setImmediate(resolve)); assert.equal(manager.key, ''); dom.window.close();
});

test('Web Reader mode recovers a rerendered root and clears on navigation without using the guest', async () => {
  const { dom, doc, marks } = fixture();
  const view = { mode: 'reader', url: 'https://example.test/', readerView: doc.querySelector('main'), webview: {} };
  const plugin = { settings: {}, activeSession: { id: 1, sourceKind: 'web', chunks: ['Second paragraph.'],
    webContext: { webView: view, webUrl: view.url, webElement: view.webview, webMode: 'reader', webRevision: 1 } },
    getCurrentReadingHighlight: () => ({ index: 0 }), getWebPageLeaves: () => [{ view }],
    getWebPageState: () => ({ revision: 1 }) };
  const manager = new HtmlReadingHighlights(plugin); manager.update(); await manager.chain;
  assert.equal(marks.size, 1);
  view.readerView.replaceWith(view.readerView.cloneNode(true)); view.readerView = doc.querySelector('main');
  await new Promise(resolve => setImmediate(resolve)); manager.update(); await manager.chain;
  assert.equal(marks.size, 1);
  assert.ok([...marks.get('note-reader-speech')].every(range => view.readerView.contains(range.startContainer)));
  const unrelated = doc.createElement('div'); unrelated.textContent = 'Public status'; doc.body.append(unrelated);
  await new Promise(resolve => setImmediate(resolve));
  const key = manager.key; manager.update(); assert.equal(manager.key, key);
  view.url = 'https://example.test/other'; manager.update(); await manager.chain;
  assert.equal(marks.size, 0);
  manager.destroy(); dom.window.close();
});
