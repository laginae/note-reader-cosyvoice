const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const loaded = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/native-toolbar.js`, 'utf8'))(
  name => name === 'obsidian' ? { setIcon(node, icon) { node.dataset.icon = icon; }, Notice: class {} } : require(name), loaded, loaded.exports);
const { NativeToolbarManager } = loaded.exports;
const pluginModule = { exports: {} };
new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/../main.js`, 'utf8'))(
  name => name === 'obsidian' ? {
    ...Object.fromEntries(['ItemView', 'MarkdownView', 'Modal', 'Plugin', 'PluginSettingTab', 'Notice', 'Setting'].map(key => [key, class {}])),
    setIcon() {}, normalizePath: value => value,
  } : require(name), pluginModule, pluginModule.exports);
const PluginClass = pluginModule.exports.default;

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
  let mode = 'preview';
  const view = { file: { path: 'public.md', basename: 'public' }, contentEl, getMode: () => mode,
    previewMode: { applyScroll: line => locations.push(line) }, editor: { getValue: () => text },
    addAction(_icon, _label, callback) { const action = doc.createElement('button'); doc.querySelector('header').appendChild(action); action.onclick = callback; return action; } };
  const leaf = { view }; view.leaf = leaf;
  const plugin = { settings: { settingsLanguage: 'english', playbackSpeed: 1, playbackVolume: 1 }, readerState: {},
    app: { workspace: { activeLeaf: leaf, getLeavesOfType: () => [leaf] }, metadataCache: { getFileCache: () => ({ headings }) } },
    captureMarkdownReadingSelection: () => null, runUserAction: (_label, action) => action(),
    startReading: async (...args) => requests.push(args), readMarkdownView: async (...args) => requests.push(args),
    stopReading: () => assert.fail('Hiding tools must not stop playback'),
    getSegmentTiming: () => ({ current: 1 }),
  };
  const manager = new NativeToolbarManager(plugin); manager.sync(); manager.toggle(view);
  return { dom, view, plugin, manager, toolbar: manager.toolbars.get(view), requests, locations,
    change: value => { text = value; }, setMode: value => { mode = value; } };
}

test('ElevenLabs toolbar estimates use the session model and normal synthesis speed', () => {
  const { plugin, toolbar, manager, dom } = fixture();
  plugin.settings.speed = 2;
  plugin.settings.openRouterModel = 'hexgrad/kokoro';
  plugin.activeSession = {
    id: 1, speechEngine: 'openrouter-tts', chunks: ['word '.repeat(100)],
    synthesisSettings: { openRouterModel: 'elevenlabs/eleven-v4', speed: 2 },
  };
  plugin.readerState.currentChunk = 1;
  toolbar.render();
  assert.equal(toolbar.time.textContent, 'Remaining ~0:39');
  plugin.settings.playbackSpeed = 2;
  toolbar.render();
  assert.equal(toolbar.time.textContent, 'Remaining ~0:20');
  manager.destroy(); dom.window.close();
});

function keyboardFixture() {
  const f = fixture(), calls = [];
  f.plugin.activeSession = { id: 1, chunks: ['One.', 'Two.'] };
  f.plugin.readerState = { canPause: true, canSeek: true, isPaused: false };
  f.plugin.pauseOrResume = async () => { calls.push('pause'); };
  f.plugin.seekCurrentAudioBySeconds = delta => { calls.push(delta); return true; };
  f.plugin.handleReaderKeydown = PluginClass.prototype.handleReaderKeydown;
  f.toolbar.render();
  return { ...f, calls, key(target, key, options = {}) {
    const event = new f.dom.window.KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  } };
}

test('locate toolbar action is available for reading but not export and follows language', () => {
  const { plugin, toolbar, manager, dom } = fixture();
  let count = 0; plugin.locateCurrentReading = () => count++;
  assert.equal(toolbar.locate.disabled, true);
  assert.equal(toolbar.speed.nextElementSibling, toolbar.locate);
  assert.equal(toolbar.locate.nextElementSibling, toolbar.follow);
  assert.equal(toolbar.follow.nextElementSibling, toolbar.outlineButton);
  plugin.activeSession = { chunks: ['Public text.'] }; toolbar.render();
  toolbar.locate.click(); assert.equal(count, 1);
  plugin.settings.settingsLanguage = 'chinese'; toolbar.render();
  assert.equal(toolbar.locate.getAttribute('aria-label'), '定位正在朗读的位置');
  plugin.activeSession.kind = 'audio-export'; toolbar.render();
  assert.equal(toolbar.locate.disabled, true);
  manager.destroy(); dom.window.close();
});

test('progress hover label explains seek boundaries in both languages without duplicate native tooltip', () => {
  const { dom, toolbar, plugin, manager } = fixture();
  assert.match(toolbar.progress.getAttribute('aria-label'), /Across segments: jump to the target segment start/);
  assert.match(toolbar.progress.getAttribute('aria-description'), /Unprepared audio requires synthesis/);
  assert.equal(toolbar.progress.hasAttribute('title'), false);
  plugin.settings.settingsLanguage = 'chinese'; toolbar.render();
  assert.match(toolbar.progress.getAttribute('aria-label'), /当前段内：跳到所选位置；跨段：跳到目标段开头/);
  assert.match(toolbar.progress.getAttribute('aria-description'), /需要等待合成/);
  assert.equal(toolbar.progress.hasAttribute('title'), false);
  manager.destroy(); dom.window.close();
});

test('chat toolbar entry passes its source file and respects language, opt-out and active exports', async () => {
  const f = fixture(), calls = [];
  f.plugin.openCopilotChat = file => calls.push(file);
  assert.match(f.toolbar.chatButton.getAttribute('aria-label'), /right-click: latest reply/);
  f.toolbar.chatButton.click(); assert.deepEqual(calls, [f.view.file]);
  f.plugin.settings.settingsLanguage = 'chinese'; f.toolbar.render();
  assert.match(f.toolbar.chatButton.getAttribute('aria-label'), /右键朗读最近回答/);
  assert.equal(f.toolbar.chatButton.hasAttribute('title'), false);
  let quickReads = 0; f.plugin.readLatestCopilotReply = () => { quickReads++; };
  const rightClick = () => f.toolbar.chatButton.dispatchEvent(new f.dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert.equal(rightClick(), false); assert.equal(quickReads, 1); assert.equal(calls.length, 1);
  f.plugin.activeSession = { kind: 'audio-export' }; f.toolbar.render();
  rightClick(); assert.equal(quickReads, 1);
  assert.equal(f.toolbar.chatButton.disabled, true); f.toolbar.chatButton.click(); assert.equal(calls.length, 1);
  f.plugin.settings.copilotChatEnabled = false; f.toolbar.render(); assert.equal(f.toolbar.chatButton.hidden, true);
  f.manager.destroy(); f.dom.window.close();
});

test('toolbar focus enables shared pause and repeated five-second seeking; tooltips follow language and playback state', async () => {
  const f = keyboardFixture(), { toolbar, plugin, calls, key } = f;
  f.setMode('source');
  assert.equal(toolbar.root.tabIndex, 0);
  assert.equal(key(toolbar.root, ' ').defaultPrevented, false);
  toolbar.root.focus();
  assert.equal(key(toolbar.root, ' ').defaultPrevented, true);
  key(toolbar.root, ' ', { repeat: true });
  key(toolbar.root, 'ArrowLeft'); key(toolbar.root, 'ArrowRight'); key(toolbar.root, 'ArrowRight', { repeat: true });
  assert.deepEqual(calls, ['pause', -5, 5, 5]);
  await Promise.resolve();
  assert.equal(toolbar.play.getAttribute('aria-label'), 'Pause (Space)');
  assert.equal(toolbar.play.getAttribute('aria-keyshortcuts'), 'Space');
  assert.equal(toolbar.back.getAttribute('aria-label'), 'Back 5 seconds (Left Arrow)');
  assert.equal(toolbar.forward.getAttribute('aria-keyshortcuts'), 'ArrowRight');
  plugin.settings.settingsLanguage = 'chinese'; plugin.readerState.isPaused = true; toolbar.render();
  assert.equal(toolbar.play.getAttribute('aria-label'), '继续（空格）');
  assert.equal(toolbar.back.getAttribute('aria-label'), '后退 5 秒（左方向键）');
  assert.equal(toolbar.forward.getAttribute('aria-label'), '前进 5 秒（右方向键）');
  for (const button of [toolbar.play, toolbar.back, toolbar.forward]) assert.equal(button.hasAttribute('title'), false);
  toolbar.next.focus(); key(toolbar.next, 'ArrowLeft');
  assert.equal(calls.at(-1), -5);
  plugin.activeSession = null; plugin.readerState = {}; toolbar.render();
  assert.equal(toolbar.play.getAttribute('aria-keyshortcuts'), null);
  f.manager.destroy(); f.dom.window.close();
});

test('source mode leaves typing alone; readonly preview enables body shortcuts only for its own active pane', () => {
  const f = keyboardFixture(), { toolbar, view, plugin, dom, key, calls } = f;
  f.setMode('source');
  const paragraph = view.contentEl.querySelector('p'); paragraph.tabIndex = 0; paragraph.focus();
  key(paragraph, ' '); key(paragraph, 'ArrowRight');
  const editor = dom.window.document.createElement('div'); editor.className = 'cm-editor'; editor.setAttribute('contenteditable', 'true');
  const input = dom.window.document.createElement('span'); editor.appendChild(input); view.contentEl.appendChild(editor);
  key(input, ' '); key(input, 'ArrowLeft');
  assert.deepEqual(calls, []);
  f.setMode('preview');
  assert.equal(key(paragraph, 'ArrowRight').defaultPrevented, true);
  paragraph.blur(); key(dom.window.document.body, 'ArrowLeft');
  plugin.app.workspace.activeLeaf = { view: {} };
  assert.equal(key(dom.window.document.body, 'ArrowRight').defaultPrevented, false);
  key(input, ' '); key(input, 'ArrowLeft');
  const outside = dom.window.document.createElement('button'); dom.window.document.body.appendChild(outside); outside.focus(); key(outside, ' ');
  const copy = dom.window.document.createElement('button'); view.contentEl.appendChild(copy); copy.focus(); key(copy, ' '); key(copy, 'ArrowRight');
  assert.deepEqual(calls, [5, -5]);
  f.manager.destroy(); key(paragraph, 'ArrowRight'); key(toolbar.root, 'ArrowRight');
  assert.deepEqual(calls, [5, -5]); dom.window.close();
});

test('sliders, selects, editable fields, composition, modifiers and exports retain their native keyboard behavior', () => {
  const f = keyboardFixture(), { toolbar, dom, key, calls, plugin } = f;
  for (const target of [toolbar.progress, toolbar.volume, toolbar.speed, toolbar.scope, toolbar.heading]) {
    target.focus(); assert.equal(key(target, 'ArrowRight').defaultPrevented, false); key(target, ' ');
  }
  const editable = dom.window.document.createElement('div'); editable.setAttribute('contenteditable', 'true'); editable.tabIndex = 0; toolbar.root.appendChild(editable);
  editable.focus(); key(editable, ' '); key(editable, 'ArrowLeft');
  toolbar.root.focus();
  for (const option of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing']) {
    key(toolbar.root, ' ', { [option]: true }); key(toolbar.root, 'ArrowRight', { [option]: true });
  }
  plugin.activeSession.kind = 'audio-export'; key(toolbar.root, ' '); key(toolbar.root, 'ArrowLeft');
  assert.deepEqual(calls, []); f.manager.destroy(); dom.window.close();
});

test('playback button clicks focus the toolbar without losing the captured source selection', () => {
  const f = keyboardFixture(), { toolbar, view, dom, plugin, calls } = f;
  f.setMode('source');
  const range = dom.window.document.createRange(); range.selectNodeContents(view.contentEl.querySelector('p')); dom.window.getSelection().addRange(range);
  const selection = { selectedText: 'Original text.' }; plugin.captureMarkdownReadingSelection = () => selection;
  toolbar.forward.dispatchEvent(new dom.window.MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true })); toolbar.forward.click();
  assert.equal(dom.window.document.activeElement, toolbar.root);
  assert.equal(toolbar.selection, selection);
  f.key(toolbar.root, 'ArrowRight'); assert.deepEqual(calls, [5, 5]);
  toolbar.read('from-selection'); assert.equal(f.requests[0][2], selection);
  f.manager.destroy(); dom.window.close();
});

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
  plugin.isActive = session => session === plugin.activeSession;
  plugin.seekToProgress = PluginClass.prototype.seekToProgress;
  toolbar.progress.value = '800'; toolbar.progress.dispatchEvent(new dom.window.Event('input')); toolbar.render();
  assert.equal(toolbar.progress.value, '800'); assert.deepEqual(jumps, []);
  toolbar.progress.dispatchEvent(new dom.window.Event('pointerup'));
  toolbar.render(); assert.equal(toolbar.progress.value, '800');
  toolbar.progress.dispatchEvent(new dom.window.Event('change')); assert.deepEqual(jumps, [2]);
  toolbar.destroy(); dom.window.close();
});

test('toolbar progress seeks within the current segment instead of restarting it', () => {
  const { dom, toolbar, plugin, manager } = fixture(), times = [];
  plugin.activeSession = { chunks: Array(10).fill('Public text.') };
  plugin.readerState = { currentChunk: 3, totalChunks: 10, canSeek: true, progress: 0.21 };
  plugin.currentAudio = { duration: 100 };
  plugin.getSegmentTiming = () => ({ duration: 100, current: 10 });
  plugin.isActive = session => session === plugin.activeSession;
  plugin.seekToProgress = PluginClass.prototype.seekToProgress;
  plugin.seekCurrentSegmentToTime = value => { times.push(value); return true; };
  plugin.jumpToAdjacentChunk = () => assert.fail('Same segment must not jump');
  toolbar.render();
  toolbar.progress.dispatchEvent(new dom.window.Event('pointerdown'));
  toolbar.progress.value = '280';
  toolbar.progress.dispatchEvent(new dom.window.Event('input'));
  toolbar.progress.dispatchEvent(new dom.window.Event('pointerup'));
  plugin.readerState.progress = 0.22; toolbar.render();
  assert.equal(toolbar.progress.value, '280');
  toolbar.progress.dispatchEvent(new dom.window.Event('change'));
  assert.equal(times.length, 1); assert.ok(Math.abs(times[0] - 80) < 0.001);
  toolbar.progress.value = '250';
  toolbar.progress.dispatchEvent(new dom.window.Event('input'));
  toolbar.progress.dispatchEvent(new dom.window.Event('change'));
  assert.ok(Math.abs(times[1] - 50) < 0.001);
  manager.destroy(); dom.window.close();
});

test('toolbar discards an uncommitted progress selection when the reading session changes', () => {
  const { dom, toolbar, plugin, manager } = fixture(), seeks = [];
  plugin.activeSession = { chunks: ['One.', 'Two.'] };
  plugin.seekToProgress = value => seeks.push(value);
  toolbar.progress.dispatchEvent(new dom.window.Event('pointerdown'));
  toolbar.progress.value = '700'; toolbar.progress.dispatchEvent(new dom.window.Event('input'));
  plugin.activeSession = { chunks: ['Another document.'] };
  toolbar.progress.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(seeks, []);
  toolbar.progress.dispatchEvent(new dom.window.Event('pointerdown'));
  toolbar.progress.value = '500'; toolbar.progress.dispatchEvent(new dom.window.Event('input'));
  toolbar.progress.dispatchEvent(new dom.window.Event('pointercancel'));
  assert.equal(toolbar.scrubbing, false); assert.equal(toolbar.scrubValue, null);
  assert.deepEqual(seeks, []);
  manager.destroy(); dom.window.close();
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
  toolbar.selection = null; plugin.getPdfSelectionForFile = () => null;
  await toolbar.read('glossary'); await toolbar.read('footnotes');
  assert.deepEqual(calls.slice(4).map(call=>call[2]),[{contentScope:'glossary'},{contentScope:'footnotes'}]);
  assert.deepEqual([...toolbar.scope.options].map(option=>option.value),['entire','selection','from-selection','glossary','footnotes']);
  plugin.settings.settingsLanguage='chinese';toolbar.scope.value='glossary';toolbar.render();
  assert.equal(toolbar.readScope.getAttribute('aria-label'),'仅朗读术语表（整篇 PDF）');
  toolbar.scope.value='footnotes';toolbar.render();
  assert.equal(toolbar.readScope.getAttribute('aria-label'),'仅朗读脚注（整篇 PDF）');
  manager.toggle(view);assert.equal(view.contentEl.querySelector('span'),span);manager.destroy();
});
