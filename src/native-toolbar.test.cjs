const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/native-toolbar.js`, 'utf8'))(
  name => name === 'obsidian' ? { setIcon(node, icon) { node.dataset.icon = icon; }, Notice: class {} } : require(name), loaded, loaded.exports);
const { NativeToolbarManager } = loaded.exports;

for (const type of ['html-view', 'webviewer']) test(`${type} toolbar supports all scopes without Markdown lookup`, async () => {
  const dom = new JSDOM('<main><header></header><article>Public content.</article></main>');
  const doc = dom.window.document, calls = [], view = { getViewType: () => type, contentEl: doc.querySelector('article'),
    file: type === 'html-view' ? { path: 'public.html' } : undefined };
  const plugin = { settings: {}, readerState: {}, app: { workspace: { getLeavesOfType: name => name === type ? [{ view }] : [] } },
    getHtmlSelectionForFile: () => null, captureWebReaderRange: () => {},
    readCurrentWebPage: (...args) => calls.push(args), readCurrentHtml: (...args) => calls.push(args),
    captureMarkdownReadingSelection: () => assert.fail('No Markdown lookup') };
  const manager = new NativeToolbarManager(plugin); manager.toggle(view);
  const toolbar = manager.toolbars.get(view); assert.ok(toolbar); assert.equal(toolbar.outlineButton.hidden, type === 'webviewer');
  toolbar.captureSelection();
  for (const scope of ['entire', 'selection', 'from-selection']) await toolbar.read(scope);
  assert.deepEqual(calls.map(args => args[1]), ['entire', 'selection', 'from-selection']);
  assert.equal(calls[0][0], type === 'html-view' ? view.file : view);
  plugin.settings.settingsLanguage = 'chinese';
  for (const [scope, label] of [['entire', '朗读全文'], ['selection', '朗读选中文字'], ['from-selection', '从选中位置开始朗读']]) {
    toolbar.scope.value = scope; toolbar.scope.dispatchEvent(new dom.window.Event('change'));
    assert.equal(toolbar.readScope.getAttribute('aria-label'), label); assert.equal(toolbar.readScope.hasAttribute('title'), false);
  }
  plugin.settings.settingsLanguage = 'english'; toolbar.render();
  assert.equal(toolbar.readScope.getAttribute('aria-label'), 'Read from selection');
  manager.destroy(); assert.equal(doc.querySelector('article').textContent, 'Public content.'); dom.window.close();
});

function fixture() {
  const dom = new JSDOM('<main><header></header><article><h1>Original heading</h1><img src="sample.png"><p>Original text.</p></article></main>');
  const doc = dom.window.document, contentEl = doc.querySelector('article'), requests = [], locations = [];
  let text = '# Title\n\n## One\n\nFirst.\n\n### Child\n\nChild.\n\n## Two\n\nLast.';
  const headings = [['Title', 1, '# Title'], ['One', 2, '## One'], ['Child', 3, '### Child'], ['Two', 2, '## Two']].map(([heading, level, marker]) => {
    const from = text.indexOf(marker); return { heading, level, position: { start: { offset: from, line: text.slice(0, from).split('\n').length - 1 }, end: { offset: from + marker.length } } };
  });
  const view = { file: { path: 'public.md', basename: 'public' }, contentEl, getMode: () => 'preview',
    previewMode: { applyScroll: line => locations.push(line) }, editor: { getValue: () => text },
    addAction(_icon, _label, callback) { const action = doc.createElement('button'); doc.querySelector('header').appendChild(action); action.onclick = callback; return action; } };
  const leaf = { view }; view.leaf = leaf;
  const plugin = { settings: { settingsLanguage: 'english', playbackSpeed: 1, playbackVolume: 1 }, readerState: {},
    app: { workspace: { getLeavesOfType: () => [leaf] }, metadataCache: { getFileCache: () => ({ headings }) } },
    captureMarkdownReadingSelection: () => null, runUserAction: (_label, action) => action(),
    startReading: async (...args) => requests.push(args), readMarkdownView: async (...args) => requests.push(args),
    stopReading: () => assert.fail('Hiding tools must not stop playback'),
    getSegmentTiming: () => ({ current: 1 }),
  };
  const manager = new NativeToolbarManager(plugin); manager.sync(); manager.toggle(view);
  return { dom, view, plugin, manager, toolbar: manager.toolbars.get(view), requests, locations, change: value => { text = value; } };
}

test('native toolbar preserves the original note, images, selected DOM and closes without stopping audio', () => {
  const { dom, view, plugin, manager, toolbar } = fixture();
  const content = view.contentEl, paragraph = content.querySelector('p'), image = content.querySelector('img');
  const range = dom.window.document.createRange(); range.selectNodeContents(paragraph); dom.window.getSelection().addRange(range);
  const progress = toolbar.progress;
  for (let i = 0; i < 10; i++) { plugin.readerState.progress = i / 10; manager.render(); }
  assert.equal(toolbar.progress, progress); assert.equal(dom.window.getSelection().toString(), 'Original text.');
  manager.toggle(view);
  assert.equal(content.querySelector('img'), image); assert.equal(content.querySelector('p'), paragraph);
  assert.equal(content.parentElement.querySelector('.note-reader-native-toolbar'), null);
  manager.destroy();
});

test('browsing the outline never synthesizes; section playback includes children and excludes its next peer', async () => {
  const { dom, toolbar, requests, locations } = fixture();
  toolbar.heading.value = '1'; toolbar.heading.dispatchEvent(new dom.window.Event('change'));
  assert.equal(requests.length, 0); assert.equal(locations.length, 1);
  await toolbar.readHeading(false);
  assert.equal(requests[0][0], '## One\n\nFirst.\n\n### Child\n\nChild.\n\n');
  assert.equal(requests[0][2].sourceOffset, requests[0][2].sourceText.indexOf('## One'));
  await toolbar.readHeading(true); assert.match(requests[1][0], /Last\.$/);
});

test('editing after selecting a heading rejects stale section playback', async () => {
  const { toolbar, change, requests } = fixture(); toolbar.heading.value = '1'; change('Completely new text.');
  await toolbar.readHeading(false); assert.equal(requests.length, 0); assert.equal(toolbar.entries.length, 0);
});

test('progress drag waits for commit and keeps its value during playback updates', () => {
  const { dom, toolbar, plugin } = fixture(); let jumps = [];
  plugin.activeSession = { id: 1, chunks: ['One.', 'Two.', 'Three.'], currentChunkIndex: 0 };
  plugin.readerState = { currentChunk: 1, totalChunks: 3, canNextChunk: true, progress: 0 };
  plugin.jumpToAdjacentChunk = value => jumps.push(value);
  toolbar.progress.value = '800'; toolbar.progress.dispatchEvent(new dom.window.Event('input')); toolbar.render();
  assert.equal(toolbar.progress.value, '800'); assert.deepEqual(jumps, []);
  toolbar.progress.dispatchEvent(new dom.window.Event('change')); assert.deepEqual(jumps, [2]);
});

test('PDF toolbar reuses playback and scope actions without changing PDF content or invoking Markdown', async () => {
  const dom = new JSDOM('<main><header></header><article><div class="pdf-container"><span>PDF words</span></div></article></main>');
  const doc=dom.window.document, file={path:'public.pdf',extension:'pdf',stat:{mtime:1}}, calls=[];
  const view={file,contentEl:doc.querySelector('article'),getViewType:()=> 'pdf',
    addAction(_icon,_label,callback){const el=doc.createElement('button');doc.querySelector('header').append(el);el.onclick=callback;return el;}};
  const context={filePath:file.path,fileMtime:1,pageNumber:2,selectedText:'PDF words'};
  const plugin={settings:{},readerState:{},app:{workspace:{getLeavesOfType:type=>type==='pdf'?[{view}]:[]}},
    runUserAction:(_label,action)=>action(),getPdfSelectionForFile:()=>context,
    captureMarkdownReadingSelection:()=>assert.fail('PDF must not use the editor'),
    readCurrentPdf:async(...args)=>calls.push(['pdf',...args]),startReading:async(...args)=>calls.push(['selection',...args]),
    openPdfOutline:f=>calls.push(['outline',f]),stopReading:()=>assert.fail('Hiding toolbar must not stop reading')};
  const manager=new NativeToolbarManager(plugin);manager.sync();manager.toggle(view);
  const toolbar=manager.toolbars.get(view), span=view.contentEl.querySelector('span');
  toolbar.captureSelection();await toolbar.read('entire');await toolbar.read('from-selection');await toolbar.read('selection');
  assert.equal(calls[0][1],file);assert.equal(calls[1][2].selectionContext,context);assert.equal(calls[2][1],'PDF words');
  toolbar.outlineButton.click();assert.equal(calls[3][0],'outline');
  file.stat.mtime=2;await toolbar.read('from-selection');assert.equal(calls.length,4);
  manager.toggle(view);assert.equal(view.contentEl.querySelector('span'),span);manager.destroy();
});
