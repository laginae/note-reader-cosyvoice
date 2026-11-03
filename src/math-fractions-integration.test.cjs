'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { academicLatex } = require('./academic-speech');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { preparePdfSelection } = require('./pdf-selection');

test('built Markdown and HTML speech retain original source and highlight ranges for natural fractions', () => {
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(__dirname + '/../main.js', 'utf8'))(
    name => name === 'obsidian' ? new Proxy({}, { get: () => class {} }) : require(name), loaded, loaded.exports);
  const clean = loaded.exports.__test.sanitizeTextForSpeech;
  const raw = String.raw`结果为 $(x-y)/\bar z$。`;
  const speech = clean(raw);
  assert.equal(speech, '结果为 x 减 y 的差 除以 z bar。');
  const source = buildMarkdownSource(raw, [speech], clean);
  assert.equal(source.mappingValid, true);
  const range = currentSourceRanges(source, { index: 0 })[0];
  assert.equal(raw.slice(range.from, range.to), raw);
  const dom = new JSDOM('<p>' + raw + '</p>'), doc = dom.window.document, original = doc.body.innerHTML;
  const transform = text => academicLatex(text);
  assert.match(transform(extractHtmlText(original)), /x 减 y 的差 除以 z bar/);
  dom.window.CSS = { highlights: new Map() };
  dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: speech, academic: {}, speechTransform: transform }), true);
  assert.equal([...dom.window.CSS.highlights.get('note-reader-speech')].map(range => range.toString()).join(''), raw);
  assert.equal(doc.body.innerHTML, original);
  dom.window.close();
});

test('recognized inline PDF fractions agree for page and selection reading without changing coordinates', () => {
  const item = (str, x, fontName = 'body') => ({ str, width: str.length * 6, height: 12, fontName, transform: [12, 0, 0, 12, x, 700] });
  const items = [item('The value', 20), item('(α-β)/γ', 100, 'math'), item('is bounded.', 220)];
  const original = JSON.stringify(items), viewport = { width: 600, height: 800 };
  const layout = extractPdfTextLayout(items, { viewport });
  for (const academicMathStyle of ['concise', 'verbose']) {
    const settings = { academicMathStyle };
    const changes = pdfMathChanges(layout, items, settings, { math: 'CMMI10' });
    const speech = applyPdfMathChanges(layout.text, changes);
    assert.equal(preparePdfSelection({ selectionLayout: [{ items, viewport }] }, settings), speech);
    assert.match(speech, academicMathStyle === 'concise' ? /the difference of alpha and beta, divided by gamma/ : /open parenthesis/);
    assert.equal(changes[0].omitted.length, 0);
    assert.ok(changes[0].source.includes('(α-β)/γ'));
  }
  assert.equal(JSON.stringify(items), original);
  assert.ok(layout.text.includes('(α-β)/γ'));
});
