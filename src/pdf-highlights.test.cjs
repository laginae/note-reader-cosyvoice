const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { pdfPageLines, matchPdfChunk, PdfReadingHighlights, mergeHighlightRects } = require('./pdf-highlights');

function sourceRows(rows) {
  return { viewport: { width: 600, height: 800 }, items: rows.map(([str, x, y, width = 220]) =>
    ({ str, width, height: 12, transform: [12, 0, 0, 12, x, 800 - y] })) };
}

function playbackFixture(rows, chunk) {
  const dom = new JSDOM(''), doc = dom.window.document;
  const page = pdfPage(doc, 1, rows);
  const view = { contentEl: doc.body, file: { path: 'public.pdf', stat: { mtime: 1 } } };
  const plugin = { settings: { readingHighlight: 'segment' }, activeSession: {
    id: 1, sourceKind: 'pdf', filePath: 'public.pdf', fileMtime: 1, chunkPageNumbers: [1],
    chunks: [chunk], currentChunkIndex: 0, currentPartIndex: 0,
    synthesisSettings: { stripMarkdown: true }, pdfHighlightPages: new Map([[1, sourceRows(rows)]]),
  }, getCurrentReadingHighlight: () => ({ index: 0 }), sanitizeAudioExportText: text => text,
  app: { workspace: { getLeavesOfType: () => [{ view }] } } };
  const highlighter = new PdfReadingHighlights(plugin);
  return { dom, doc, page, view, plugin, highlighter, session: plugin.activeSession,
    marked: () => [...doc.querySelectorAll('.note-reader-pdf-current')].map(node => node.textContent) };
}

test('PDF follow is opt-in, scrolls once per audio part, pauses on user input and resumes explicitly', async () => {
  const f = playbackFixture([['Public first.',40,100], ['Public second.',40,120]], 'Public first. Public second.');
  f.view.contentEl.getBoundingClientRect = () => ({ top: 0, bottom: 80, left: 0, right: 600, width: 600, height: 80 });
  let calls = 0; f.page.querySelectorAll('span').forEach(node => node.scrollIntoView = () => calls++);
  f.highlighter.update(); assert.equal(calls, 0);
  f.plugin.pauseRequested = true;
  f.plugin.settings.pdfReadingFollow = true; f.highlighter.update(); assert.equal(calls, 1);
  f.highlighter.update(); assert.equal(calls, 1);
  f.view.contentEl.dispatchEvent(new f.dom.window.Event('wheel'));
  f.plugin.followRevision = 1; f.highlighter.update(); assert.equal(calls, 1);
  f.plugin.pdfHighlights = f.highlighter; f.plugin.saveSettings = async () => {};
  await require('./reading-follow').toggleFollowing(f.plugin, 'pdf'); assert.equal(calls, 2);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF follow avoids visible or mismatched text and loads a trusted page before its text layer', () => {
  const f = playbackFixture([['Public first.',40,100], ['Public second.',40,120]], 'Public first. Public second.');
  f.plugin.settings.pdfReadingFollow = true;
  f.view.contentEl.getBoundingClientRect = () => ({ top: 0, bottom: 500, left: 0, right: 600, width: 600, height: 500 });
  let calls = 0; f.page.querySelector('span').scrollIntoView = () => calls++;
  f.highlighter.update(); assert.equal(calls, 0);
  f.highlighter.destroy();
  f.page.querySelector('.textLayer').remove();
  f.page.getBoundingClientRect = () => ({ top: 900, bottom: 1700, left: 0, right: 600, width: 600, height: 800 });
  f.page.scrollIntoView = () => calls++;
  const h = new PdfReadingHighlights(f.plugin); h.update(); h.update(); assert.equal(calls, 1);
  f.session.chunks = ['Unrelated text.']; f.plugin.followRevision = 1; h.update(); assert.equal(calls, 1);
  h.destroy(); f.dom.window.close();
});

test('PDF follows prepared audio parts using the full chunk to disambiguate repeated short phrases', () => {
  const f = playbackFixture([['Again.',40,100], ['Middle.',40,120], ['Again.',40,140]], 'Again. Middle. Again.');
  f.session.audioParts = { 0: ['Again.', 'Middle.', 'Again.'] };
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Again.']);
  assert.equal(f.page.querySelector('.note-reader-pdf-current'), f.page.querySelector('span'));
  const cache = f.highlighter.cached.get(f.view);
  f.session.currentPartIndex = 2;
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Again.']);
  assert.equal(f.page.querySelector('.note-reader-pdf-current'), f.page.querySelectorAll('.textLayer span')[2]);
  assert.equal(f.highlighter.cached.get(f.view), cache);
  assert.equal(f.session.currentChunkIndex, 0);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF zero-width formula accents preserve source correspondence and later prose highlighting', () => {
  const f = playbackFixture([['R',40,100,8], ['\u0304',44,100,0], ['Equation.',55,100,90],
    ['A public explanation.',40,130], ['Continued discussion.',40,150]], 'A public explanation. Continued discussion.');
  // Header/footnote filtering also requires exact correspondence with source items.
  f.session.pdfHighlightPages.get(1).omittedRegions = [{xMin:0,xMax:5,yMin:790,yMax:800}];
  f.highlighter.update();
  assert.deepEqual(f.marked(), ['A public explanation.', 'Continued discussion.']);
  const page = f.highlighter.cached.get(f.view).pages[0];
  assert.ok(page.text.includes('\u0304'));
  assert.equal(page.lines.flatMap(line => line.nodes).some(node => node.textContent === '\u0304'), false);
  assert.equal(f.page.querySelectorAll('.note-reader-pdf-rectangle').length, 2);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF accents do not hide an actual text mismatch or shift later words into the other column', () => {
  const rows = [['Left first.',40,100], ['Right first.',330,100], ['R',40,120,8], ['\u0304',44,120,0],
    ['Left next.',55,120,200], ['Right next.',330,120], ['Left last.',40,140], ['Right last.',330,140]];
  const f = playbackFixture(rows, 'Right next. Right last.');
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Right next.', 'Right last.']);
  f.page.querySelectorAll('.textLayer span')[5].textContent = 'Changed prose.';
  f.highlighter.update(); assert.deepEqual(f.marked(), []);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF uses valid sentence cues only in sentence mode and otherwise follows audio parts', () => {
  const f = playbackFixture([['First.',40,100], ['Second.',40,120]], 'First. Second.');
  f.plugin.settings.readingHighlight = 'sentence';
  f.plugin.getCurrentReadingHighlight = () => ({ index: 0, sentence: { start: 7, end: 14 } });
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Second.']);
  f.plugin.settings.readingHighlight = 'segment';
  f.highlighter.update(); assert.deepEqual(f.marked(), ['First.', 'Second.']);
  f.plugin.settings.readingHighlight = 'sentence';
  f.plugin.getCurrentReadingHighlight = () => ({ index: 0, sentence: { start: -1, end: 999 } });
  f.highlighter.update(); assert.deepEqual(f.marked(), ['First.', 'Second.']);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF anchors across unmounted pages and follows the next part when only the next page is mounted', () => {
  const f = playbackFixture([['Earlier.',40,100], ['Page ending.',40,120]], 'Page ending. Next first.');
  const rows = [['Next first.',40,100], ['Next last.',40,120]];
  f.session.pdfHighlightPages.set(2, sourceRows(rows));
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Page ending.']);
  f.session.audioParts = { 0: ['Page ending.', 'Next first.'] };
  f.session.currentPartIndex = 1;
  f.highlighter.update(); assert.deepEqual(f.marked(), []);
  const nextPage = pdfPage(f.doc, 2, rows);
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Next first.']);
  f.page.remove(); f.highlighter.update(); assert.deepEqual(f.marked(), ['Next first.']);
  nextPage.querySelector('.textLayer span').textContent = 'Different.';
  f.highlighter.update(); assert.deepEqual(f.marked(), []);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF snapshot cleaning stays aligned after live academic settings change', () => {
  const f = playbackFixture([['First.',40,100], ['Last.',40,120]], 'First.');
  const used = [];
  f.plugin.sanitizeAudioExportText = (text, settings) => { used.push(settings); return settings.stripMarkdown ? text : 'Different.'; };
  f.highlighter.update(); assert.deepEqual(f.marked(), ['First.']);
  f.plugin.settings.stripMarkdown = false;
  f.plugin.settings.academicMathMode = 'skip';
  f.page.querySelector('span').style.fontWeight = 'bold';
  f.highlighter.update(); assert.deepEqual(f.marked(), ['First.']);
  assert.ok(used.length > 0 && used.every(settings => settings === f.session.synthesisSettings));
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF unchanged playback avoids text geometry reads and rebuilds on text-layer style changes', () => {
  const f = playbackFixture([['First.',40,100], ['Last.',40,120]], 'First.');
  const span = f.page.querySelector('span'), getRect = span.getBoundingClientRect;
  let reads = 0;
  span.getBoundingClientRect = () => { reads++; return getRect(); };
  f.highlighter.update(); assert.ok(reads > 0); assert.deepEqual(f.marked(), ['First.']);
  const cache = f.highlighter.cached.get(f.view);
  reads = 0; f.highlighter.update(); f.highlighter.update();
  assert.equal(reads, 0);
  span.style.fontSize = '14px'; f.highlighter.update();
  assert.ok(reads > 0); assert.notEqual(f.highlighter.cached.get(f.view), cache);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF layout cache survives logical chunk changes on the same page', () => {
  const f = playbackFixture([['First.',40,100], ['Second.',40,120]], 'First.');
  f.session.chunks.push('Second.'); f.session.chunkPageNumbers.push(1);
  f.highlighter.update(); const cache = f.highlighter.cached.get(f.view);
  f.plugin.getCurrentReadingHighlight = () => ({ index: 1 });
  f.highlighter.update(); assert.deepEqual(f.marked(), ['Second.']);
  assert.equal(f.highlighter.cached.get(f.view), cache);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF refreshes next-page geometry after zoom and clears cached observers when highlighting is disabled', () => {
  const f = playbackFixture([['Earlier.',40,100], ['Page ending.',40,120]], 'Page ending. Next first.');
  const rows = [['Next first.',40,100], ['Next last.',40,120]];
  f.session.pdfHighlightPages.set(2, sourceRows(rows));
  const nextPage = pdfPage(f.doc, 2, rows);
  f.highlighter.update(); const cache = f.highlighter.cached.get(f.view);
  nextPage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 1600 });
  for (const span of nextPage.querySelectorAll('span')) {
    const rect = span.getBoundingClientRect();
    span.getBoundingClientRect = () => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * 2]));
  }
  f.highlighter.update();
  assert.notEqual(f.highlighter.cached.get(f.view), cache);
  assert.deepEqual(f.marked(), ['Page ending.', 'Next first.']);
  assert.equal(nextPage.querySelector('.note-reader-pdf-rectangle').style.top, '12.5%');
  f.plugin.settings.readingHighlight = 'off'; f.highlighter.update();
  assert.equal(f.highlighter.cached.size, 0);
  assert.equal(f.doc.querySelectorAll('.note-reader-pdf-overlay').length, 0);
  assert.deepEqual(f.marked(), []);
  f.highlighter.destroy(); f.dom.window.close();
});

test('PDF overlays never merge separate layout lines across a narrow gutter', () => {
  const f = playbackFixture([['Left.',40,100,100], ['Right.',145,100,100]], 'Left. Right.');
  const nodes = [...f.page.querySelectorAll('span')];
  f.highlighter.renderOverlays(new Set(nodes), new Map(nodes.map(node => [node, {}])));
  assert.equal(f.page.querySelectorAll('.note-reader-pdf-rectangle').length, 2);
  f.highlighter.destroy(); f.dom.window.close();
});

test('highlight rectangles join word spaces without bridging rows or column gutters at any zoom', () => {
  const input = [[40,100,30,12], [75,100,45,12], [330,100,30,12], [365,100,45,12], [40,120,30,12]];
  for (const scale of [0.5, 1, 2]) {
    const rects = input.map(r => r.map(v => v * scale));
    assert.deepEqual(mergeHighlightRects(rects).map(r => r.map(v => v / scale)),
      [[40,100,80,12], [330,100,80,12], [40,120,30,12]]);
    assert.deepEqual(rects, input.map(r => r.map(v => v * scale)));
  }
});

function pdfPage(doc, number, rows) {
  const page = doc.createElement('div'); page.dataset.pageNumber = String(number);
  page.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 800 });
  const layer = doc.createElement('div'); layer.className = 'textLayer'; page.appendChild(layer);
  for (const [text, x, y, width = 220] of rows) {
    const span = doc.createElement('span'); span.textContent = text;
    span.getBoundingClientRect = () => ({ left: x, top: y, right: x + width, bottom: y + 12, width, height: 12 });
    layer.appendChild(span);
  }
  doc.body.appendChild(page); return page;
}

test('PDF body highlighting skips glossary and headers while standalone glossary marks only its rows', () => {
  const { ancillaryLayout, recurringEdges } = require('./pdf-ancillary');
  const dom=new JSDOM(''),doc=dom.window.document,viewport={width:600,height:800};
  const rows=[['A. Author et al.',40,40],['Glossary',40,100],['AC Alternating current',40,120],['DC Direct current',40,140],
    ['Left body.',40,200],['Right body.',330,110],['Right continues.',330,130],['Right ending.',330,150]];
  const page=pdfPage(doc,1,rows),items=rows.map(([str,x,y])=>({str,width:220,height:10,transform:[10,0,0,10,x,800-y]}));
  const ancillary=ancillaryLayout(items,viewport,[],recurringEdges([{items,viewport},{items,viewport}]));
  const source={items,viewport,footnoteMode:'inline',omittedRegions:[...ancillary.headers,...ancillary.glossary],glossaryRegions:ancillary.glossary,contentScope:'body'};
  const body=pdfPageLines(page,x=>x,source);
  assert.deepEqual(matchPdfChunk([body],'Left body. Right body.').map(n=>n.textContent),['Left body.','Right body.']);
  assert.equal(matchPdfChunk([body],'AC Alternating current').length,0);
  const glossary=pdfPageLines(page,x=>x,{...source,omittedRegions:ancillary.headers,contentScope:'glossary'});
  assert.deepEqual(matchPdfChunk([glossary],'AC Alternating current DC Direct current').map(n=>n.textContent),['AC Alternating current','DC Direct current']);
  assert.equal(matchPdfChunk([glossary],'Right body.').length,0);
  dom.window.close();
});

test('filtered body crosses column footnotes while footnote playback marks only the notes', () => {
  const { partitionFootnotes } = require('./pdf-footnotes');
  const dom = new JSDOM(''), doc = dom.window.document;
  const rows = [['Left first.',40,150],['Right first.',330,150],['Left ending.',40,580],['Right ending.',330,580],
    ['2 Left note.',40,665],['Left note ending.',40,678],['3 Right note.',330,665],['Right note ending.',330,678]];
  const page = pdfPage(doc,1,rows), viewport = {width:600,height:800};
  const items = rows.map(([str,x,y],i) => ({str,width:220,height:i<4?10:9,transform:[10,0,0,i<4?10:9,x,800-y]}));
  const part = partitionFootnotes(items,viewport);
  assert.equal(part.regions.length,2);
  const source = {items,viewport,footnoteRegions:part.regions,footnoteMode:'after'};
  const body = pdfPageLines(page,text=>text,source);
  assert.deepEqual(matchPdfChunk([body],'Left ending. Right first.').map(node=>node.textContent),['Left ending.','Right first.']);
  const notes = pdfPageLines(page,text=>text,source,true);
  assert.deepEqual(matchPdfChunk([notes],'2 Left note. Left note ending.').map(node=>node.textContent),['2 Left note.','Left note ending.']);
  assert.equal(matchPdfChunk([body],'2 Left note.').length,0);
  dom.window.close();
});

test('original PDF coordinates override distorted rendered baselines only with exact item correspondence', () => {
  const doc = new JSDOM('').window.document;
  const rows = [['Left first.', 40, 100], ['Right first.', 330, 100], ['Left next.', 40, 120],
    ['Right next.', 330, 120], ['Left last.', 40, 140], ['Right last.', 330, 140]];
  const page = pdfPage(doc, 1, rows);
  const items = rows.map(([str, x, y]) => ({ str, width: 220, height: 12, transform: [12, 0, 0, 12, x, 800-y] }));
  [...page.querySelectorAll('span')].forEach((span, i) => { span.getBoundingClientRect = () => ({ left: 10, top: i*15, right: 230, width: 220, height: 12 }); });
  const layout = pdfPageLines(page, x => x, { items, viewport: { width: 600, height: 800 } });
  assert.deepEqual(matchPdfChunk([layout], 'Left next. Left last.').map(n => n.textContent), ['Left next.', 'Left last.']);
  items[0].str = 'Different text.';
  assert.equal(matchPdfChunk([pdfPageLines(page, x => x, { items })], 'Different text.').length, 0);
});

test('uneven column baselines retain every word on the offset right-hand lines', () => {
  const doc = new JSDOM('').window.document;
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push([`Left${i}`, 40, 100 + i * 20, 80], ['continued.', 140, 100 + i * 20, 80],
      [`Right${i}.`, 330, 104 + i * 20, 220]);
  }
  const page = pdfPage(doc, 1, rows);
  const items = rows.map(([str, x, y, width]) => ({ str, width, height: 8, transform: [8, 0, 0, 8, x, 800-y] }));
  const layout = pdfPageLines(page, x => x, { items, viewport: { width: 600, height: 800 } });
  assert.equal(layout.lines.length, 6);
  assert.ok(layout.lines.every(line => line.nodes.length > 0));
  assert.deepEqual(matchPdfChunk([layout], 'Right0. Right1.').map(n => n.textContent), ['Right0.', 'Right1.']);
  const allNodes = layout.lines.flatMap(line => line.nodes);
  assert.equal(new Set(allNodes).size, allNodes.length);
});

test('hyphenated line wraps in two-column papers preserve highlight mapping', () => {
  const doc = new JSDOM('').window.document;
  const page = pdfPage(doc, 1, [['The fore-', 40, 100], ['Right first.', 330, 100],
    ['cast is valid.', 40, 120], ['Right next.', 330, 120], ['Left last.', 40, 140], ['Right last.', 330, 140]]);
  const layout = pdfPageLines(page, text => text);
  assert.deepEqual(matchPdfChunk([layout], 'The forecast is valid.').map(node => node.textContent), ['The fore-', 'cast is valid.']);
  assert.deepEqual(matchPdfChunk([layout], 'Right next. Right last.').map(node => node.textContent), ['Right next.', 'Right last.']);
});

test('PDF marks follow sorted two-column text rather than stitching left and right rows', () => {
  const dom = new JSDOM(''), doc = dom.window.document;
  const page = pdfPage(doc, 1, [['Left first.', 40, 100], ['Right first.', 330, 100], ['Left next.', 40, 120], ['Right next.', 330, 120], ['Left last.', 40, 140], ['Right last.', 330, 140]]);
  const layout = pdfPageLines(page, value => value.trim());
  const nodes = matchPdfChunk([layout], 'Left next. Left last.');
  assert.deepEqual(nodes.map(node => node.textContent), ['Left next.', 'Left last.']);
  assert.equal(matchPdfChunk([layout], 'Left first. Right first.').length, 0);
});

test('PDF cross-page chunks mark both mounted pages; duplicate and unmatched text remains unmarked', () => {
  const dom = new JSDOM(''), doc = dom.window.document;
  const a = pdfPageLines(pdfPage(doc, 1, [['First.', 40, 100], ['Page ending.', 40, 120]]), value => value);
  const b = pdfPageLines(pdfPage(doc, 2, [['Next page.', 40, 100], ['Last.', 40, 120]]), value => value);
  assert.deepEqual(matchPdfChunk([a, b], 'Page ending. Next page.').map(node => node.textContent), ['Page ending.', 'Next page.']);
  assert.deepEqual(matchPdfChunk([a, a], 'First.'), []);
  assert.deepEqual(matchPdfChunk([a], 'Not in the PDF.'), []);
});

test('PDF marks clear on stop and changed files without altering selection or text', () => {
  const dom = new JSDOM(''), doc = dom.window.document;
  const page = pdfPage(doc, 1, [['First.', 40, 100], ['Second.', 40, 120]]);
  const view = { contentEl: doc.body, file: { path: 'public.pdf', stat: { mtime: 1 } } };
  const plugin = { settings: { readingHighlight: 'segment' }, activeSession: { id: 1, sourceKind: 'pdf', filePath: 'public.pdf', fileMtime: 1, chunkPageNumbers: [1], chunks: ['Second.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), sanitizeAudioExportText: text => text,
    app: { workspace: { getLeavesOfType: () => [{ view }] } } };
  const highlighter = new PdfReadingHighlights(plugin); highlighter.update();
  assert.equal(page.querySelector('.note-reader-pdf-current').textContent, 'Second.');
  const overlay = page.querySelector('.note-reader-pdf-overlay');
  assert.equal(overlay.parentElement, page);
  assert.equal(overlay.closest('.textLayer'), null);
  assert.equal(overlay.getAttribute('aria-hidden'), 'true');
  const rectangle = overlay.firstElementChild;
  assert.equal(rectangle.style.top, '15%');
  assert.equal(rectangle.style.height, '1.5%');
  page.querySelector('.note-reader-pdf-current').className = '';
  highlighter.update();
  assert.equal(page.querySelector('.note-reader-pdf-current').textContent, 'Second.');
  assert.equal(overlay.firstElementChild, rectangle);
  view.file.stat.mtime = 2; highlighter.update(); assert.equal(page.querySelector('.note-reader-pdf-current'), null);
  assert.equal(page.querySelector('.note-reader-pdf-overlay'), null);
  view.file.stat.mtime = 1; highlighter.update(); plugin.activeSession = null; highlighter.update();
  assert.equal(page.querySelector('.note-reader-pdf-current'), null);
  assert.equal(page.querySelector('.note-reader-pdf-overlay'), null);
  assert.equal(page.textContent, 'First.Second.');
});

test('PDF text-layer middle replacements and text edits invalidate the current chunk cache', () => {
  const dom = new JSDOM(''), doc = dom.window.document;
  const page = pdfPage(doc, 1, [['First.', 40, 100], ['Middle.', 40, 120], ['Last.', 40, 140]]);
  const view = { contentEl: doc.body, file: { path: 'public.pdf', stat: { mtime: 1 } } };
  const plugin = { settings: { readingHighlight: 'segment' }, activeSession: { id: 1, sourceKind: 'pdf',
    filePath: 'public.pdf', fileMtime: 1, chunkPageNumbers: [1], chunks: ['First. Middle. Last.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), sanitizeAudioExportText: text => text,
    app: { workspace: { getLeavesOfType: () => [{ view }] } } };
  const highlighter = new PdfReadingHighlights(plugin); highlighter.update();
  const old = page.querySelectorAll('.textLayer span')[1];
  const replacement = old.cloneNode(true); replacement.className = ''; replacement.getBoundingClientRect = old.getBoundingClientRect;
  old.replaceWith(replacement); highlighter.update();
  assert.equal(page.querySelectorAll('.note-reader-pdf-current').length, 3);
  assert.ok(replacement.classList.contains('note-reader-pdf-current'));
  replacement.firstChild.nodeValue = 'Changed.'; highlighter.update();
  assert.equal(page.querySelectorAll('.note-reader-pdf-current').length, 0);
  replacement.firstChild.nodeValue = 'Middle.'; highlighter.update();
  assert.equal(page.querySelectorAll('.note-reader-pdf-current').length, 3);
  const overlay = page.querySelector('.note-reader-pdf-overlay'); overlay.replaceChildren();
  highlighter.update(); assert.equal(overlay.children.length, 3);
  highlighter.destroy();
  assert.equal(highlighter.cached.size, 0);
  dom.window.close();
});

test('PDF cross-page marks refresh when later text arrives in the following page', () => {
  const dom = new JSDOM(''), doc = dom.window.document;
  const page = pdfPage(doc, 1, [['Earlier text.', 40, 100], ['Page ending.', 40, 120]]);
  const following = pdfPage(doc, 2, [['Next first.', 40, 100]]);
  const view = { contentEl: doc.body, file: { path: 'public.pdf', stat: { mtime: 1 } } };
  const plugin = { settings: { readingHighlight: 'segment' }, activeSession: { id: 1, sourceKind: 'pdf',
    filePath: 'public.pdf', fileMtime: 1, chunkPageNumbers: [1], chunks: ['Page ending. Next first. Next last.'] },
    getCurrentReadingHighlight: () => ({ index: 0 }), sanitizeAudioExportText: text => text,
    app: { workspace: { getLeavesOfType: () => [{ view }] } } };
  const highlighter = new PdfReadingHighlights(plugin); highlighter.update();
  assert.equal(page.querySelectorAll('.note-reader-pdf-current').length, 0);
  const span = doc.createElement('span'); span.textContent = 'Next last.';
  span.getBoundingClientRect = () => ({ left: 40, top: 120, right: 260, bottom: 132, width: 220, height: 12 });
  following.querySelector('.textLayer').append(span); highlighter.update();
  assert.equal(doc.querySelectorAll('.note-reader-pdf-current').length, 3);
  const cache = highlighter.cached.get(view); highlighter.update();
  assert.equal(highlighter.cached.get(view), cache);
  highlighter.destroy(); dom.window.close();
});
