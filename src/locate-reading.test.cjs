const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { locateReading } = require('./locate-reading');
const { highlightDocument } = require('./dom-highlights');
const { academicOptions } = require('./academic-speech');

function fixture() {
  const file = { path: 'public.md', stat: { mtime: 1 } }, calls = [];
  const source = { text: 'Public text.', mappingValid: true, ranges: [{ start: 0, end: 12 }],
    blocks: [{ start: 0, end: 12, from: 0, to: 12 }] };
  const view = { file, getMode: () => 'source', editor: {
    getValue: () => source.text, offsetToPos: ch => ({ line: 0, ch }),
    scrollIntoView: range => calls.push(range),
  } };
  const leaf = { view }, plugin = { settings: {}, activeSession: {
    sourceKind: 'markdown', filePath: file.path, fileMtime: 1, currentChunkIndex: 0,
    chunks: ['Public text.'], markdownSource: source,
  }, app: { vault: { getAbstractFileByPath: () => file }, workspace: {
    getLeavesOfType: () => [leaf], revealLeaf: async value => calls.push(value),
  } } };
  return { plugin, file, view, leaf, calls };
}

test('locate reuses original Markdown view without changing playback or selection', async () => {
  const { plugin, leaf, calls, view } = fixture();
  const before = JSON.stringify(plugin.activeSession);
  assert.equal(await locateReading(plugin), 'located');
  assert.equal(calls[0], leaf); assert.equal(calls[1].from.ch, 0);
  assert.equal(JSON.stringify(plugin.activeSession), before);
  view.getMode = () => 'preview';
  view.previewMode = { applyScroll: line => calls.push(line) };
  assert.equal(await locateReading(plugin), 'located'); assert.equal(calls.at(-1), 0);
});

test('locate rejects changed files, invalid mappings, exports and stale sessions', async () => {
  const { plugin, file, calls } = fixture();
  file.stat.mtime = 2;
  assert.equal(await locateReading(plugin), 'changed'); assert.equal(calls.length, 0);
  file.stat.mtime = 1; plugin.activeSession.markdownSource.mappingValid = false;
  assert.equal(await locateReading(plugin), 'unmatched');
  plugin.activeSession.kind = 'audio-export'; assert.equal(await locateReading(plugin), 'unavailable');
  delete plugin.activeSession.kind;
  plugin.app.workspace.revealLeaf = async () => { plugin.activeSession = null; };
  assert.equal(await locateReading(plugin), 'changed');
});

test('locate reopens a closed local document in a new tab', async () => {
  const { plugin, leaf, file } = fixture();
  let opened;
  plugin.app.workspace.getLeavesOfType = () => [];
  plugin.app.workspace.getLeaf = mode => { assert.equal(mode, 'tab'); return leaf; };
  leaf.openFile = async value => { opened = value; };
  assert.equal(await locateReading(plugin), 'located'); assert.equal(opened, file);
});

test('HTML locate-only scrolls without requiring highlight support or mutating content', () => {
  const dom = new JSDOM('<body><p>Public complete passage.</p></body>');
  let scrolled = 0;
  dom.window.HTMLElement.prototype.scrollIntoView = () => scrolled++;
  const before = dom.window.document.body.innerHTML;
  assert.equal(highlightDocument(dom.window.document, { text: 'Public complete passage.', locateOnly: true }), true);
  assert.equal(scrolled, 1); assert.equal(dom.window.document.body.innerHTML, before);
  assert.equal(highlightDocument(dom.window.document, { text: 'Missing passage.', locateOnly: true }), false);
  dom.window.close();
});

test('loaded HTML is searched once on a miss and existing highlights do not force a rebuild', async () => {
  const { plugin, view } = fixture();
  const dom = new JSDOM('<p>Public complete passage.</p>');
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  view.mainView = { iframe: { contentDocument: dom.window.document } };
  plugin.activeSession.sourceKind = 'html';
  plugin.activeSession.chunks = ['Missing passage.'];
  let conversions = 0;
  plugin.prepareHtmlSpeechText = text => { conversions++; return text; };
  assert.equal(await locateReading(plugin), 'unmatched');
  const first = conversions;
  conversions = 0;
  highlightDocument(dom.window.document, { text: 'Missing passage.', locateOnly: true,
    academic: academicOptions(plugin.settings), speechTransform: plugin.prepareHtmlSpeechText });
  assert.equal(first, conversions);
  plugin.activeSession.chunks = ['Public complete passage.'];
  let refreshed = 0;
  plugin.htmlHighlights = { key: 'unchanged', update() { assert.equal(this.key, 'unchanged'); refreshed++; } };
  assert.equal(await locateReading(plugin), 'located');
  assert.equal(refreshed, 1);
  dom.window.close();
});

test('unmatchable short HTML audio falls back to the current full segment without changing playback', async () => {
  const { plugin, view } = fixture();
  const a = 'This is a sufficiently long opening sentence';
  const b = 'This is another sufficiently long closing sentence';
  const short = 'Spoken equation.';
  const full = `${a}. ${short} ${b}.`;
  const dom = new JSDOM(`<body><p>${a}.</p><div>Rendered math</div><p>${b}.</p></body>`);
  let scrolled = 0; dom.window.HTMLElement.prototype.scrollIntoView = () => scrolled++;
  view.mainView = { iframe: { contentDocument: dom.window.document } };
  plugin.activeSession.sourceKind = 'html';
  plugin.activeSession.chunks = [full];
  plugin.activeSession.audioParts = { 0: [a + '.', short, b + '.'] };
  plugin.activeSession.currentPartIndex = 1;
  plugin.getCurrentReadingHighlight = () => ({ index: 0 });
  plugin.prepareHtmlSpeechText = text => text;
  const before = JSON.stringify(plugin.activeSession);
  assert.equal(await locateReading(plugin), 'segment');
  assert.equal(scrolled, 1);
  assert.equal(JSON.stringify(plugin.activeSession), before);
  dom.window.close();
});

test('rendered formulas can locate using two unique prose anchors but not a single or duplicate match', () => {
  const a = 'This is a sufficiently long opening sentence';
  const b = 'This is another sufficiently long closing sentence';
  const dom = new JSDOM(`<body><p>${a}.</p><div>Rendered equation R = 3</div><p>${b}.</p></body>`);
  let scrolled = 0; dom.window.HTMLElement.prototype.scrollIntoView = () => scrolled++;
  const opts = { text: `${a}. A different spoken equation. ${b}.`, locateOnly: true };
  assert.equal(highlightDocument(dom.window.document, opts), true);
  assert.equal(scrolled, 1);
  assert.equal(highlightDocument(dom.window.document, { ...opts, text: `${a}. Missing second sentence.` }), false);
  dom.window.document.body.innerHTML += dom.window.document.body.innerHTML;
  assert.equal(highlightDocument(dom.window.document, opts), false);
  dom.window.close();
});

test('PDF locate uses the matching page and paragraph; closed web pages do not reopen automatically', async () => {
  const { plugin, view } = fixture();
  plugin.activeSession.sourceKind = 'pdf'; plugin.activeSession.chunkPageNumbers = [3];
  const dom = new JSDOM('<div data-page-number="3"><span class="note-reader-pdf-current">Public text</span></div>');
  view.contentEl = dom.window.document.body;
  const scrolled = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function() { scrolled.push(this); };
  assert.equal(await locateReading(plugin), 'located');
  assert.equal(scrolled.at(-1).tagName, 'SPAN');
  plugin.activeSession.sourceKind = 'web'; plugin.activeSession.webContext = {};
  assert.equal(await locateReading(plugin), 'changed');
  dom.window.close();
});

test('PDF locate follows the audio part on the next page instead of returning to the chunk start', async () => {
  const { plugin, view } = fixture();
  Object.assign(plugin.activeSession, { sourceKind: 'pdf', chunkPageNumbers: [1],
    chunks: ['First. Second.'], audioParts: { 0: ['First.', 'Second.'] }, currentPartIndex: 1,
    pdfHighlightPages: new Map([1, 2].map(number => [number, {
      viewport: { width: 600, height: 800 }, items: (number === 1 ? ['Earlier.', 'First.'] : ['Second.', 'Later.'])
        .map((str, i) => ({ str, width: 220, height: 12, transform: [12,0,0,12,40,700 - i * 20] })),
    }])),
  });
  plugin.sanitizeAudioExportText = text => text;
  const dom = new JSDOM('<div data-page-number="1"></div><div data-page-number="2"><span class="note-reader-pdf-current">Second.</span></div>');
  view.contentEl = dom.window.document.body;
  const scrolled = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function() { scrolled.push(this); };
  assert.equal(await locateReading(plugin), 'located');
  assert.ok(scrolled.every(node => node.closest('[data-page-number]').dataset.pageNumber === '2'));
  assert.equal(plugin.activeSession.currentPartIndex, 1);
  dom.window.close();
});
