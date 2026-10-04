const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { captureHtmlOutline, htmlSectionText } = require('./html-outline');
test('HTML semantic headings retain nesting and section boundaries without selecting text', () => {
  const dom = new JSDOM('<h1>Article</h1><h2>Methods</h2><p>First.</p><h3>Detail</h3><p>Nested.</p><h2>Results</h2><p>Last.</p>');
  const doc = dom.window.document, entries = captureHtmlOutline(doc);
  assert.deepEqual(entries.map(e => e.level), [1, 2, 3, 2]);
  assert.equal(htmlSectionText(doc, entries[1], entries), 'Methods\n\nFirst.\n\nDetail\n\nNested.');
  assert.match(htmlSectionText(doc, entries[1], entries, true), /Last\.$/);
  assert.equal(doc.getSelection().toString(), ''); dom.window.close();
});
test('complete numbered HTML paragraphs become an outline, not lists, dates, hidden text or prose', () => {
  const dom = new JSDOM('<p>1. Introduction</p><p>Body.</p><div><b>1.1. Background</b></div><p>More.</p><p>2. Methods</p><p>2.1. Data</p><p>2026. Annual report</p><p>3. This sentence is prose.</p><ul><li><p>3. List item</p></li></ul><p hidden>3. Hidden</p><p>5. Missing siblings</p>');
  const entries = captureHtmlOutline(dom.window.document);
  assert.deepEqual(entries.map(e => [e.title, e.level]), [['1. Introduction', 1], ['1.1. Background', 2], ['2. Methods', 1], ['2.1. Data', 2]]);
  assert.ok(entries.every(e => e.inferred)); dom.window.close();
});
test('isolated or orphaned numbering is not guessed, and detached headings cannot be read', () => {
  const dom = new JSDOM('<p>2.1. Missing parent</p><p>1. Alone</p>');
  assert.deepEqual(captureHtmlOutline(dom.window.document), []);
  const h = dom.window.document.createElement('h1'); h.textContent = 'Title'; dom.window.document.body.append(h);
  const entries = captureHtmlOutline(dom.window.document); h.remove();
  assert.throws(() => htmlSectionText(dom.window.document, entries[0], entries), /changed/); dom.window.close();
});
