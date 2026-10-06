const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { highlightDocument, clearDocumentHighlight } = require('./dom-highlights');
const { HtmlReadingHighlights } = require('./html-highlights');
const { extractHtmlText } = require('./html-text');
const { createReadingAnchor, sliceTextFromReadingPosition, sliceOriginalTextFromReadingPosition } = require('./reading-position');

test('resumed HTML with full-width punctuation keeps a matchable DOM stream', () => {
  const { dom, doc } = fixture();
  doc.body.innerHTML = '<p>Earlier paragraph.</p><p>数据说明：容量（２０％），<em>持续３０分钟</em>；随后继续。</p><p>下一段正文。</p>';
  const original = '数据说明：容量（２０％），持续３０分钟；随后继续。';
  const text = extractHtmlText(doc.body.innerHTML), position = { anchor: createReadingAnchor(original) };
  const old = sliceTextFromReadingPosition(text, position);
  assert.equal(old.matched, true);
  assert.equal(highlightDocument(doc, { text: old.text }), false);
  const resumed = sliceOriginalTextFromReadingPosition(text, position);
  assert.equal(resumed.matched, true);
  assert.equal(highlightDocument(doc, { text: resumed.text }), true);
  assert.ok(resumed.text.includes('\n'));
  dom.window.close();
});

test('local formula speech maps complete cross-node paragraphs without changing content or accepting duplicates', () => {
  const { dom, doc, marks } = fixture();
  const speechTransform = text => text.replace(/\\\(x_1\\\)/g, 'x sub 1');
  doc.body.innerHTML = '<p>Before.</p><p>The value \\(x_1\\) is positive.</p><p>After.</p>';
  const before = doc.body.innerHTML;
  const options = { text: 'The value x sub 1 is positive.', speechTransform };
  assert.equal(highlightDocument(doc, options), true);
  assert.equal([...marks.get('note-reader-speech')][0].toString(), 'The value \\(x_1\\) is positive.');
  assert.equal(doc.body.innerHTML, before);
  doc.body.innerHTML = '<p>The value \\(x_<em>1</em>\\) is positive.</p>';
  const inlineBefore = doc.body.innerHTML;
  assert.equal(highlightDocument(doc, options), true);
  assert.equal([...marks.get('note-reader-speech')].map(range => range.toString()).join(''), 'The value \\(x_1\\) is positive.');
  assert.equal(doc.body.innerHTML, inlineBefore);
  doc.body.innerHTML = before + before;
  assert.equal(highlightDocument(doc, options), false);
  dom.window.close();
});

test('whole paragraph speech conversion locates inline formulas and uses only one pale background', () => {
  const { dom, doc, marks } = fixture();
  const raw = 'Because R>=0, this complete paragraph describes the maximum envelope and its limits.';
  const spoken = raw.replace('R>=0', 'R is greater than or equal to zero');
  doc.body.innerHTML = '<p>Because <em>R</em>&gt;=0, this complete paragraph describes the maximum envelope and its limits.</p><p>Unrelated passage.</p>';
  const speechTransform = text => text.replace('R>=0', 'R is greater than or equal to zero');
  const before = doc.body.innerHTML;
  assert.equal(highlightDocument(doc, { text: spoken, speechTransform }), true);
  assert.equal([...marks.get('note-reader-speech')].map(r => r.toString()).join(''), raw);
  assert.match(doc.querySelector('style').textContent, /background-color: transparent/);
  assert.match(doc.querySelector('style').textContent, /#e5b83d 10%/);
  assert.equal(doc.body.innerHTML, before);
  clearDocumentHighlight(doc); dom.window.close();
});

function fixture() {
  const dom = new JSDOM('<main><p>First <em>public paragraph.</em></p><form>Not for reading</form><p>Second paragraph.</p><p hidden>Private hidden text.</p></main>', { url: 'https://example.test/' });
  const win = dom.window;
  win.CSS = { highlights: new Map() };
  win.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  return { dom, doc: win.document, marks: win.CSS.highlights };
}

test('rendered inline formulas retain the opening paragraph instead of only a later complete caption', () => {
  const { dom, doc, marks } = fixture();
  const first = '当输入参数已经达到设定上限，继续增大输入不会改变输出。';
  const second = '说明页面给出了完整的计算步骤，并且列出了计算过程中的边界条件';
  const third = '接下来的示例使用另一组公开数据，计算结果也会显示在示例页面';
  const caption = 'This is a later complete caption with unrelated interactive controls.';
  doc.body.innerHTML = `<ol><li>${first}</li></ol><p>${second}，宽度 <span class="math">U−L</span> 不变，${third}。</p><div><input type="range"><p>${caption}</p></div>`;
  const text = `${first}${second}，宽度 U 减 L 不变，${third}。${caption}`;
  let scrolled;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
  assert.equal(highlightDocument(doc, { text, speechTransform: t => t }), true);
  const ranges = [...marks.get('note-reader-speech')];
  assert.ok(ranges.some(r => doc.querySelector('li').contains(r.startContainer)));
  assert.ok(ranges.some(r => doc.querySelector('body > p').contains(r.startContainer)));
  assert.equal(highlightDocument(doc, { text, locateOnly: true }), true);
  assert.equal(scrolled, doc.querySelector('li'));
  // A trailing exact caption must not disguise failure to map the beginning.
  assert.equal(highlightDocument(doc, { text: 'Missing opening passage '.repeat(10) + caption, speechTransform: t => t }), false);
  dom.window.close();
});

test('document indexing reuses visibility checks and invalidates synchronously after DOM edits', () => {
  const { dom, doc } = fixture();
  let checks = 0;
  const original = dom.window.getComputedStyle.bind(dom.window);
  dom.window.getComputedStyle = (...args) => { checks++; return original(...args); };
  assert.equal(highlightDocument(doc, { text: 'Second paragraph.' }), true);
  const initial = checks;
  assert.equal(highlightDocument(doc, { text: 'First public paragraph.' }), true);
  assert.equal(checks, initial);
  doc.querySelector('em').textContent = 'changed public paragraph.';
  assert.equal(highlightDocument(doc, { text: 'First public paragraph.' }), false);
  assert.ok(checks > initial);
  dom.window.close();
});

test('segments beginning inside a table preserve their exact prefix before transformed math', () => {
  const { dom, doc, marks } = fixture();
  const closing = 'The final public explanation is sufficiently long and unique';
  doc.body.innerHTML = `<table><tr><td>Sample northern region</td><td>0.123456</td><td>0.234567</td></tr></table><p>Value <span class="math">U−L</span>, ${closing}.</p>`;
  const text = `Sample northern region; 0.123456; 0.234567; Value U minus L, ${closing}.`;
  assert.equal(highlightDocument(doc, { text }), true);
  assert.ok(doc.querySelector('td').contains([...marks.get('note-reader-speech')][0].startContainer));
  dom.window.close();
});

test('unmatched spoken formula falls back to current segment highlights and clears them on the next segment', () => {
  const { dom, doc, marks } = fixture();
  const a = 'This introduction identifies the current public passage uniquely';
  const b = 'This conclusion identifies the same public passage uniquely';
  const formula = 'Ten to the negative tenth power.';
  const full = `${a}. ${formula} ${b}.`;
  doc.body.innerHTML = `<p>${a}. <span>10<sup>-10</sup></span> ${b}.</p><p>Next passage.</p>`;
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: doc } } };
  const session = { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1,
    chunks: [full, 'Next passage.'], audioParts: { 0: [a + '.', formula, b + '.'], 1: ['Next passage.'] }, currentPartIndex: 1 };
  let index = 0;
  const plugin = { settings: {}, activeSession: session, getCurrentReadingHighlight: () => ({ index }),
    getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin);
  manager.update();
  assert.deepEqual([...marks.get('note-reader-speech')].map(r => r.toString().trim()), [a, b]);
  assert.equal(manager.markedDocuments.has(doc), true);
  index = 1; session.currentPartIndex = 0; manager.update();
  assert.equal([...marks.get('note-reader-speech')].map(r => r.toString()).join(''), 'Next passage.');
  plugin.settings.readingHighlight = 'off'; manager.update(); assert.equal(marks.size, 0);
  manager.destroy(); dom.window.close();
});

test('HTML highlight advances inside a logical chunk for audio parts and real sentence cues', async () => {
  const { dom, doc, marks } = fixture();
  const a = 'First public sentence.', b = 'Second public sentence.';
  doc.body.innerHTML = `<p>${a}</p><p>${b}</p>`;
  const view = { file: { path: 'sample.html', stat: { mtime: 1 } }, mainView: { iframe: { contentDocument: doc } } };
  let sentence = null;
  const session = { id: 1, sourceKind: 'html', filePath: 'sample.html', fileMtime: 1,
    chunks: [a + ' ' + b], audioParts: { 0: [a, b] }, currentPartIndex: 0 };
  const plugin = { settings: { readingHighlight: 'sentence' }, activeSession: session,
    getCurrentReadingHighlight: () => ({ index: 0, sentence }), getHtmlReaderLeaves: () => [{ view }] };
  const manager = new HtmlReadingHighlights(plugin);
  const marked = () => [...marks.get('note-reader-speech')].map(r => r.toString()).join('');
  manager.update(); assert.equal(marked(), a);
  session.currentPartIndex = 1; manager.update(); assert.equal(marked(), b);
  session.audioParts[0] = [session.chunks[0]]; session.currentPartIndex = 0;
  sentence = { start: 0, end: a.length }; manager.update(); assert.equal(marked(), a);
  sentence = { start: a.length + 1, end: session.chunks[0].length };
  manager.update(); assert.equal(marked(), b);
  doc.querySelectorAll('p')[1].replaceChildren(doc.createTextNode(b));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(marked(), b);
  manager.destroy(); assert.equal(marks.size, 0); dom.window.close();
});

test('paragraph tint covers gaps without wrapping text or tinting figures and intervening headings', () => {
  const { dom, doc } = fixture();
  const a = 'This opening sentence is long enough to match uniquely';
  const b = 'This closing sentence is also long enough to match uniquely';
  doc.body.innerHTML = `<p>${a}. <em>Unmatched formula</em> and spaces. ${b}.</p><h2>Other heading</h2><figure><img src="public.png"><figcaption>Caption text.</figcaption></figure>`;
  const before = doc.body.innerHTML;
  assert.equal(highlightDocument(doc, { text: `${a}. Spoken formula. ${b}.` }), true);
  const style = doc.querySelector('style').textContent;
  const selector = style.split('\n')[1].split(' {')[0];
  assert.equal(doc.querySelector(selector), doc.querySelector('p'));
  assert.match(style, /#e5b83d 10%/);
  assert.equal(doc.body.innerHTML, before);
  clearDocumentHighlight(doc);
  assert.equal(doc.querySelector('style'), null);
  dom.window.close();
});

test('paragraph tint avoids a paragraph containing media and rebuilds selectors after sibling insertion', async () => {
  const { dom, doc } = fixture();
  doc.body.innerHTML = '<p>Text beside image.<img src="public.png"></p><p>Current passage.</p>';
  assert.equal(highlightDocument(doc, { text: 'Text beside image.' }), true);
  assert.equal(doc.querySelector('style').textContent.includes('nth-child'), false);
  assert.equal(highlightDocument(doc, { text: 'Current passage.', restoreOnChange: true }), true);
  const paragraph = doc.querySelectorAll('p')[1];
  doc.body.prepend(doc.createElement('hr'));
  await new Promise(resolve => setImmediate(resolve));
  const selector = doc.querySelector('style').textContent.split('\n')[1].split(' {')[0];
  assert.equal(doc.querySelector(selector), paragraph);
  clearDocumentHighlight(doc); dom.window.close();
});

test('partial formula passages highlight only verified prose and keep marks through locate and rerender', async () => {
  const { dom, doc, marks } = fixture();
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const first = 'This introductory sentence is long enough to identify uniquely';
  const last = 'This concluding sentence also identifies the same passage uniquely';
  const markup = `<p>${first}.</p><div>Rendered formula R = 3</div><p>${last}.</p>`;
  doc.body.innerHTML = markup;
  const text = `${first}. Spoken formula has different wording. ${last}.`;
  assert.equal(highlightDocument(doc, { text, restoreOnChange: true }), true);
  const original = marks.get('note-reader-speech');
  assert.deepEqual([...original].map(range => range.toString()), [first, last]);
  assert.equal(highlightDocument(doc, { text, locateOnly: true }), true);
  assert.equal(marks.get('note-reader-speech'), original);
  doc.body.innerHTML = markup;
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(marks.get('note-reader-speech'));
  assert.notEqual(marks.get('note-reader-speech'), original);
  assert.deepEqual([...marks.get('note-reader-speech')].map(range => range.toString()), [first, last]);
  clearDocumentHighlight(doc); dom.window.close();
});

test('partial prose highlighting rejects duplicate and reversed passage anchors', () => {
  const { dom, doc } = fixture();
  const a = 'This is a long unique opening sentence for reading';
  const b = 'This is a long unique closing sentence for reading';
  const text = `${a}. Different formula. ${b}.`;
  doc.body.innerHTML = `<p>${b}.</p><p>${a}.</p>`;
  assert.equal(highlightDocument(doc, { text }), false);
  doc.body.innerHTML = `<p>${a}.</p><p>${a}.</p><p>${b}.</p>`;
  assert.equal(highlightDocument(doc, { text }), false);
  dom.window.close();
});

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
  await new Promise(resolve => setImmediate(resolve)); assert.equal(marks.size, 1);
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
