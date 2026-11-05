'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), { JSDOM } = require('jsdom');
const { registerDockedOutline, DOCKED_OUTLINE_TYPE } = require('./docked-outline');

class MockView {
  constructor(leaf) { this.leaf = leaf; this.containerEl = leaf.containerEl; this.contentEl = leaf.contentEl; this.cleanup = []; }
  registerEvent(ref) { this.cleanup.push(() => ref.off()); }
  registerDomEvent(el, name, fn) { el.addEventListener(name, fn); this.cleanup.push(() => el.removeEventListener(name, fn)); }
  async setState() {}
}
let lastMenu;
class MockMenu {
  constructor() { this.items = []; lastMenu = this; }
  addItem(fn) {
    const item = { setTitle(value) { this.title = value; return this; }, setIcon() { return this; }, setChecked(value) { this.checked = value; return this; },
      setDisabled(value) { this.disabled = value; return this; }, onClick(fn) { this.run = fn; return this; } };
    fn(item); this.items.push(item); return this;
  }
  addSeparator() {} showAtMouseEvent() {} showAtPosition() {}
}
const loaded = { exports: {} };
new Function('require', 'module', fs.readFileSync(`${__dirname}/docked-outline-view.js`, 'utf8'))(
  name => name === 'obsidian' ? { ItemView: MockView, Menu: MockMenu, setIcon(el, icon) { el.dataset.icon = icon; } } : require(name), loaded);
const { DockedOutlineView, preferences } = loaded.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, options = {}) {
  const dom = new JSDOM('<main><div class="view-content"></div></main>', { pretendToBeVisual: true });
  const doc = dom.window.document, calls = [], events = new Map(), leaves = [];
  const workspace = {
    activeLeaf: null, getLeavesOfType: type => leaves.filter(leaf => leaf.view.getViewType() === type),
    revealLeaf: async leaf => { calls.push(['reveal', leaf]); workspace.activeLeaf = leaf; },
    requestSaveLayout: () => calls.push(['layout']),
    on(name, fn) { const set = events.get(name) || new Set(); events.set(name, set); set.add(fn); return { off: () => set.delete(fn) }; },
  };
  function source(name, text) {
    const file = { path: name + '.md', basename: name, extension: 'md', stat: { mtime: 1, size: text.length } };
    const view = { file, text, getViewType: () => 'markdown', getMode: () => 'source', containerEl: doc.createElement('article'),
      currentMode: { getScroll: () => 0 }, editor: { getValue: () => view.text, offsetToPos: n => ({ line: n, ch: 0 }), scrollIntoView: range => calls.push(['locate', range]) } };
    view.leaf = { view }; leaves.push(view.leaf); return view;
  }
  const original = source('Public sample', '# One\nPublic introduction.\n## Child\nPublic detail.\n### Deep\nMore public detail.\n# Two\nPublic conclusion.');
  workspace.activeLeaf = original.leaf;
  const plugin = { settings: { settingsLanguage: 'english', playbackSpeed: 1 }, readerState: {},
    app: { workspace, metadataCache: { on: workspace.on, getFileCache: file => {
      const text = leaves.find(leaf => leaf.view.file === file)?.view.text || '';
      return { headings: [...text.matchAll(/^(#+) (.+)$/gm)].map(m => ({ heading: m[2], level: m[1].length,
        position: { start: { offset: m.index, line: text.slice(0, m.index).split('\n').length - 1 }, end: { offset: m.index + m[0].length } } })) };
    } }, vault: {} },
    startReading: async (...args) => calls.push(['read', ...args]), readCurrentPdf: async (...args) => calls.push(['pdf', ...args]),
    runUserAction: async (_label, fn) => { try { return await fn(); } catch (error) { calls.push(['error', error.message]); } },
    pauseOrResume: () => { plugin.readerState.isPaused = !plugin.readerState.isPaused; calls.push(['pause']); },
    stopReading: () => { plugin.activeSession = null; calls.push(['stop']); },
    seekCurrentAudioBySeconds: n => calls.push(['seek', n]), setPlaybackSpeed: speed => { plugin.settings.playbackSpeed = speed; calls.push(['speed', speed]); },
    locateCurrentReading: async () => calls.push(['return']),
  };
  const leaf = { containerEl: doc.querySelector('main'), contentEl: doc.querySelector('.view-content') };
  let shown = options.visible !== false;
  leaf.containerEl.getClientRects = () => shown ? [{}] : [];
  const manager = { views: new Set() }, view = leaf.view = new DockedOutlineView(leaf, plugin, manager);
  await view.onOpen();
  t.after(() => { view.dispose(); view.cleanup.forEach(fn => fn()); dom.window.close(); });
  return { view, plugin, workspace, original, source, doc, calls, leaves, events, manager, setVisible: value => { shown = value; } };
}

test('entry registration is lazy, creates left leaf once, and reuses a user-moved pane', async () => {
  const calls = [], callbacks = [], factories = []; let current;
  const leaf = { view: { schedule() {} }, async setViewState(state) { calls.push(state); current = leaf; } };
  const plugin = { settings: {}, app: { workspace: { getLeavesOfType: () => current ? [current] : [], getLeftLeaf: () => { calls.push('left'); return leaf; },
    revealLeaf: async target => calls.push(target) } }, registerView: (type, factory) => factories.push([type, factory]),
    addCommand: command => callbacks.push(command), addRibbonIcon: () => {}, register() {}, runUserAction: (_name, fn) => fn() };
  const manager = registerDockedOutline(plugin);
  assert.equal(factories[0][0], DOCKED_OUTLINE_TYPE); assert.equal(manager.views.size, 0); assert.deepEqual(calls, []);
  const first = manager.open(), second = manager.open(); await first; await second;
  assert.equal(calls.filter(c => c === 'left').length, 1); assert.equal(calls.filter(c => c?.type === DOCKED_OUTLINE_TYPE).length, 1);
  current = { view: {}, position: 'right' }; await manager.open();
  assert.equal(calls.at(-1), current); assert.equal(calls.filter(c => c === 'left').length, 1);
  assert.equal(callbacks[0].id, 'open-outline-reader');
});

test('docked outline opens fully expanded without starting audio; controls initially collapsed', async t => {
  const f = await fixture(t), v = f.view;
  assert.deepEqual([...v.rows.keys()], [0, 1, 2, 3]); assert.equal(v.controls.hidden, true);
  assert.equal(v.pause.hidden, true); assert.equal(v.prefs.doubleClickRead, false);
  assert.equal(v.fileTitle.textContent, 'Public sample'); assert.deepEqual(f.calls, []);
  assert.equal(f.manager.views.size, 1);
  v.disclosure.click(); assert.equal(v.controls.hidden, false); assert.deepEqual(f.calls, [['layout']]);
});

test('single-click only navigates and optional double-click reads exact section source', async t => {
  const f = await fixture(t), v = f.view;
  v.rows.get(1).title.click(); await tick(); assert.equal(f.calls.filter(c => c[0] === 'read').length, 0);
  v.rows.get(1).title.dispatchEvent(new f.doc.defaultView.MouseEvent('dblclick', { bubbles: true })); await tick();
  assert.equal(f.calls.filter(c => c[0] === 'read').length, 0);
  v.changePreferences({ doubleClickRead: true });
  v.rows.get(1).title.dispatchEvent(new f.doc.defaultView.MouseEvent('dblclick', { bubbles: true })); await tick();
  const call = f.calls.find(c => c[0] === 'read');
  assert.equal(call[1], f.original.text.slice(f.original.text.indexOf('## Child')));
  assert.equal(call[3].sourceOffset, f.original.text.indexOf('## Child'));
  assert.equal(call[3].sourceText, f.original.text);
});

test('context menu reads only one section, includes descendants, and rejects stale menu', async t => {
  const f = await fixture(t), v = f.view;
  v.sectionMenu(1, {}); lastMenu.items[0].run(); await tick();
  const read = f.calls.find(c => c[0] === 'read');
  assert.equal(read[1], f.original.text.slice(f.original.text.indexOf('## Child'), f.original.text.indexOf('# Two')));
  v.sectionMenu(0, {}); const stale = lastMenu;
  f.workspace.activeLeaf = f.source('Other public sample', '# Other\nPublic text.').leaf; await v.refresh();
  stale.items[1].run(); await tick(); assert.equal(f.calls.filter(c => c[0] === 'read').length, 1);
});

test('note switching preserves per-document search and folds without stopping playback', async t => {
  const f = await fixture(t), v = f.view;
  v.expand(false); assert.deepEqual([...v.rows.keys()], [0, 3]);
  v.search.value = 'Deep'; v.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.deepEqual([...v.rows.keys()], [0, 1, 2]);
  const session = f.plugin.activeSession = { kind: 'reading', filePath: f.original.file.path };
  const next = f.source('Second public note', '# Next\nPublic paragraph.'); f.workspace.activeLeaf = next.leaf;
  await v.refresh(); assert.equal(v.data.entries[0].title, 'Next'); assert.equal(f.plugin.activeSession, session);
  f.workspace.activeLeaf = f.original.leaf; await v.refresh();
  assert.equal(v.search.value, 'Deep'); assert.deepEqual([...v.state.collapsed], [0, 1, 2, 3]);
  assert.equal(f.calls.some(c => c[0] === 'read' || c[0] === 'stop'), false);
});

test('clicking the dock itself retains source; unsupported active files clear the outline', async t => {
  const f = await fixture(t), v = f.view, data = v.data;
  f.workspace.activeLeaf = v.leaf; await v.refresh(); assert.equal(v.data, data);
  f.workspace.activeLeaf = { view: { file: { extension: 'png' } } }; await v.refresh();
  assert.equal(v.data, null); assert.equal(v.rows.size, 0); assert.match(v.status.textContent, /Open a Markdown/);
});

test('hidden view skips parsing and catches up to current document when shown', async t => {
  const f = await fixture(t, { visible: false }), v = f.view;
  assert.equal(v.data, undefined);
  let loads = 0; const load = v.adapter.load; v.adapter.load = (...args) => { loads++; return load(...args); };
  f.workspace.activeLeaf = f.source('Latest public note', '# Latest\nPublic text.').leaf;
  await v.refresh(); assert.equal(loads, 0);
  f.setVisible(true); await v.refresh(); assert.equal(loads, 1); assert.equal(v.data.entries[0].title, 'Latest');
  f.setVisible(false); v.invalidate(); await v.refresh(); assert.equal(loads, 1);
});

test('delayed loading cannot replace a newer source or a closed panel', async t => {
  const f = await fixture(t), v = f.view; let resolve;
  const data = v.data, load = v.adapter.load;
  v.adapter.load = () => new Promise(r => { resolve = r; }); v.dirty = true;
  const pending = v.refresh();
  v.adapter.load = load; f.workspace.activeLeaf = f.source('New document', '# New\nPublic text.').leaf; await v.refresh();
  resolve(data); await pending; assert.equal(v.data.entries[0].title, 'New');
  v.adapter.load = () => new Promise(r => { resolve = r; }); v.dirty = true;
  const closing = v.refresh(); v.dispose(); resolve(data); await closing;
  assert.equal(v.data, null); assert.equal(f.manager.views.size, 0);
});

test('edited Markdown cannot be read until refreshed; unrelated editor events do not invalidate', async t => {
  const f = await fixture(t), v = f.view;
  const data = v.data;
  for (const callback of f.events.get('editor-change')) callback(null, {});
  await v.refresh(); assert.equal(v.data, data);
  f.original.text = '# Changed\nPublic revision.'; v.read(0, true); await tick();
  assert.equal(f.calls.some(c => c[0] === 'read'), false);
  await v.refresh(); assert.equal(v.data.entries[0].title, 'Changed');
});

test('playback paints stable DOM without parsing and separates browsing from reading', async t => {
  const f = await fixture(t), v = f.view; let reads = 0;
  v.adapter.load = async () => { reads++; throw Error('Unexpected parsing'); };
  v.adapter.positions = () => ({ reading: 1, browsing: 3 });
  f.plugin.activeSession = { kind: 'reading', sourceLabel: 'Public sample' };
  f.plugin.readerState = { status: 'running', canPause: true, canStop: true, canSeek: true, isPaused: false };
  const title = v.rows.get(1).title; title.focus();
  for (let i = 0; i < 20; i++) v.updatePlayback();
  assert.equal(reads, 0); assert.equal(v.rows.get(1).title, title); assert.equal(f.doc.activeElement, title);
  assert.equal(v.rows.get(1).row.classList.contains('is-reading'), true);
  assert.equal(v.rows.get(3).title.getAttribute('aria-current'), 'location');
  assert.equal(v.pause.hidden, false); v.pause.click(); v.updatePlayback(); assert.equal(v.pause.dataset.icon, 'play');
  v.back.click(); v.forward.click(); await tick(); assert.deepEqual(f.calls.filter(c => c[0] === 'seek'), [['seek', -5], ['seek', 5]]);
  v.stop.click(); v.updatePlayback(); assert.equal(v.pause.hidden, true);
});

test('export blocks audio actions but not locating or browsing', async t => {
  const f = await fixture(t), v = f.view;
  f.plugin.activeSession = { kind: 'audio-export' }; v.updatePlayback();
  assert.equal(v.readOnly.disabled, true); assert.equal(v.pause.hidden, true);
  v.read(0, true); v.locate(1); await tick();
  assert.equal(f.calls.some(c => c[0] === 'read'), false); assert.equal(f.calls.some(c => c[0] === 'locate'), true);
});

test('view state persists only UI preferences, not titles, paths, text or keys', async t => {
  const { view: v } = await fixture(t);
  await v.setState({ controlsOpen: true, doubleClickRead: true, titleLines: 4, text: 'not persisted', apiKey: 'not persisted', path: 'not persisted' });
  assert.deepEqual(v.getState(), { controlsOpen: true, doubleClickRead: true, showLevelLabels: false, titleLines: 4 });
  assert.equal(v.controls.hidden, false); assert.equal(v.root.style.getPropertyValue('--cozy-outline-title-lines'), '4');
  assert.deepEqual(preferences(null), { controlsOpen: false, doubleClickRead: false, showLevelLabels: false, titleLines: 2 });
  await v.setState({ titleLines: 999 }); assert.equal(v.prefs.titleLines, 2);
});

test('quiet header keeps four icons; depth menu retains expand and collapse operations', async t => {
  const { view: v } = await fixture(t);
  assert.deepEqual([...v.root.querySelectorAll('.cozy-outline-tools button')].map(button => button.dataset.icon),
    ['search', 'list-tree', 'corner-up-left', 'ellipsis']);
  v.depthMenu({});
  assert.deepEqual(lastMenu.items.map(item => item.title), ['Expand all', 'Collapse all', 'Expand to 2 levels', 'Expand to 3 levels']);
  lastMenu.items[1].run(); assert.deepEqual([...v.rows.keys()], [0, 3]);
  v.depthMenu({}); lastMenu.items[2].run(); assert.deepEqual([...v.rows.keys()], [0, 1, 3]);
  v.depthMenu({}); lastMenu.items[3].run(); assert.equal(v.rows.size, 4);
  v.expand(false); v.depthMenu({}); lastMenu.items[0].run(); assert.equal(v.rows.size, 4);
});

test('heading badges are opt-in, survive restored UI state and do not rebuild navigation', async t => {
  const { view: v } = await fixture(t), title = v.rows.get(1).title;
  assert.equal(v.prefs.showLevelLabels, false); assert.equal(v.root.classList.contains('show-level-labels'), false);
  v.optionsMenu({}); lastMenu.items.find(item => item.title.startsWith('Show heading level')).run();
  assert.equal(v.prefs.showLevelLabels, true); assert.equal(v.root.classList.contains('show-level-labels'), true);
  assert.equal(v.rows.get(1).title, title);
  await v.setState({ showLevelLabels: true }); assert.equal(v.root.classList.contains('show-level-labels'), true);
  await v.setState({}); assert.equal(v.root.classList.contains('show-level-labels'), false);
  v.optionsMenu({}); lastMenu.items.find(item => item.title === 'Refresh outline').run();
  assert.equal(v.force, true); assert.equal(v.dirty, true);
});

test('long outlines render in bounded pages while keeping every heading accessible', async t => {
  const f = await fixture(t), v = f.view;
  f.original.text = Array.from({ length: 950 }, (_, i) => '# Public heading ' + i + '\nPublic text.').join('\n');
  v.invalidate(); await v.refresh(); assert.equal(v.data.entries.length, 950); assert.equal(v.rows.size, 400);
  v.list.querySelector('.cozy-outline-more').click(); assert.equal(v.rows.size, 800);
  v.list.querySelector('.cozy-outline-more').click(); assert.equal(v.rows.size, 950);
  v.search.value = 'heading 949'; v.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.deepEqual([...v.rows.keys()], [949]);
});

test('headings remain text, remove Markdown formatting and do not create executable elements', async t => {
  const f = await fixture(t), v = f.view;
  f.original.text = '# **Public heading**\nParagraph.\n## <img src=x onerror=alert(1)>\nPublic paragraph.';
  v.invalidate(); await v.refresh();
  assert.equal(v.rows.get(0).title.textContent, 'Public heading'); assert.equal(v.root.querySelector('img'), null);
  assert.equal(v.root.querySelectorAll('[title]').length, 0);
});

test('keyboard navigation and section menu remain usable without mouse', async t => {
  const f = await fixture(t), v = f.view;
  v.rows.get(0).title.focus();
  v.rows.get(0).title.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(f.doc.activeElement, v.rows.get(1).title);
  v.rows.get(1).title.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
  assert.equal(lastMenu.items.length, 2);
  v.rows.get(1).title.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(v.rows.has(2), false); assert.equal(f.doc.activeElement, v.rows.get(1).title);
});

test('PDF dock reading preserves the current control layout and uses the shared cached outline', async t => {
  const f = await fixture(t), v = f.view, file = f.original.file;
  file.extension = 'pdf'; file.path = 'public.pdf'; f.original.getViewType = () => 'pdf';
  const entries = [{ title: 'Public chapter', level: 1, page: 1, offset: 0, x: 20, y: 600 }];
  f.plugin.pdfOutlineCache = { get: () => ({ model: { entries, pages: [{ number: 1, text: 'Public example.' }] } }) };
  v.invalidate(); await v.refresh(); v.read(0, false); await tick();
  const call = f.calls.find(c => c[0] === 'pdf'); assert.equal(call[2].keepControls, true); assert.equal(call[2].outlineRange.startPage, 1);
  assert.equal(v.data.kind, 'pdf');
});

test('in-memory document state is bounded and released on close', async t => {
  const f = await fixture(t), v = f.view;
  for (let i = 0; i < 25; i++) { f.workspace.activeLeaf = f.source('Public ' + i, '# Chapter\nPublic sample.').leaf; await v.refresh(); }
  assert.equal(v.states.size, 20); v.dispose(); assert.equal(v.states.size, 0); assert.equal(v.rows.size, 0);
});

test('late HTML Reader documents refresh via existing observation, never while hidden', async t => {
  const f = await fixture(t), v = f.view;
  f.original.file.extension = 'html'; f.original.getViewType = () => 'html-view';
  f.original.mainView = { iframe: { contentDocument: null } };
  v.invalidate(); await v.refresh(); assert.equal(v.rows.size, 0);
  const html = new JSDOM('<h1>Public HTML chapter</h1><p>Public paragraph.</p>'); t.after(() => html.window.close());
  f.original.mainView.iframe.contentDocument = html.window.document;
  f.setVisible(false); v.observeHtml(); assert.equal(v.dirty, false);
  f.setVisible(true); v.observeHtml(); assert.equal(v.dirty, true);
  await v.refresh(); assert.equal(v.rows.size, 1); assert.equal(v.data.entries[0].title, 'Public HTML chapter');
  v.read(0, false); await tick(); assert.equal(f.calls.find(c => c[0] === 'read')[3].sourceKind, 'html');
});
