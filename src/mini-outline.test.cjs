'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { MiniOutlineManager, headingParents, normalizeMiniSettings, otherOutlineEnabled, railHeadings } = require('../src/mini-outline');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(entries, settings = {}) {
  const dom = new JSDOM('<main></main><aside></aside>'), doc = dom.window.document, calls = [], menus = [];
  dom.window.matchMedia = () => ({ matches: true });
  const file = { path: 'public-example.md', stat: { mtime: 1 } };
  const view = { file, containerEl: doc.querySelector('main') };
  const plugin = { settings: { ...settings }, app: { plugins: { enabledPlugins: new Set() } } };
  let positions = { reading: -1, browsing: 0 }, busy = false;
  const data = { kind: 'markdown', entries: entries || [{ title: 'Introduction', level: 1 }, { title: 'Details', level: 2 }, { title: 'Example', level: 4 }, { title: 'Summary', level: 1 }] };
  const adapter = { views: () => [view], activeView: () => view, valid: () => true,
    load: async () => { calls.push('load'); return data; }, locate: async (_v, _d, i) => calls.push(['locate', i]),
    locateEdge: async (_v, _d, end) => calls.push(['edge',end]),
    read: async (_v, _d, i, rest) => calls.push(['read', i, rest]), positions: () => positions, busy: () => busy,
    pauseFollow: () => calls.push('pause-follow'), returnReading: async () => calls.push('return') };
  class Menu {
    constructor() { this.items=[]; menus.push(this); }
    addItem(fn) {
      const item={setTitle(value){this.label=value;return this;},setIcon(value){this.icon=value;return this;},setDisabled(value){this.disabled=value;return this;},onClick(fn){this.click=fn;return this;}};
      fn(item); this.items.push(item); return this;
    }
    onHide(fn) { this.hiddenCallback=fn; }
    hide() { this.hidden=true; this.hiddenCallback?.(); }
    showAtMouseEvent() { this.method='pointer'; }
    showAtPosition() { this.method='anchor'; }
  }
  const manager = new MiniOutlineManager(plugin, adapter, { setIcon(el,icon) { el.dataset.icon=icon; }, Menu }); manager.sync();
  const panel = manager.panels.get(view);
  const cleanup = () => { manager.destroy(); dom.window.close(); };
  return { manager, panel, plugin, adapter, calls, menus, data, view, doc, cleanup, setPositions: value => { positions = value; }, setBusy: value => { busy = value; } };
}
function sectionMenu(f, index) {
  f.panel.rows.get(index).row.dispatchEvent(new f.doc.defaultView.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  return f.menus.at(-1);
}

test('mini outline pause works without loading headings or opening the main toolbar and stays synchronized', async t => {
  const f=fixture();t.after(f.cleanup);let paused=false,calls=0;
  f.adapter.playback=()=>({active:true,session:1,canToggle:true,paused,title:'Public sample'});
  f.adapter.togglePlayback=()=>{paused=!paused;calls++;};f.manager.update();const p=f.panel;
  assert.equal(p.pause.dataset.icon,'pause');assert.equal(p.pause.disabled,false);
  p.pause.click();await tick();assert.equal(paused,true);assert.equal(calls,1);assert.deepEqual(f.calls,[]);
  await p.open();p.rows.get(1).title.focus();const row=p.rows.get(1).row;
  p.pause.click();await tick();assert.equal(paused,false);assert.equal(p.pause.dataset.icon,'pause');assert.equal(p.rows.get(1).row,row);
  assert.deepEqual(f.calls,['load']);assert.equal(p.currentSectionIndex(),1);
  f.setBusy(true);f.adapter.playback=()=>({active:false,canToggle:false});f.manager.update();
  assert.equal(p.pause.disabled,true);p.pause.click();await tick();assert.equal(calls,2);
});

test('outline pause visibility is normalized and applied without replacing controls or altering a reading session', async t => {
  const f=fixture();t.after(f.cleanup);
  f.adapter.playback=()=>({active:true,session:1,canToggle:true,paused:true,title:'Public sample'});
  f.manager.update();await f.panel.open();const p=f.panel,button=p.pause,row=p.rows.get(0).row;
  assert.equal(p.root.dataset.playbackDisplay,'toolbar');
  for(const mode of ['session','toolbar','invalid']){
    f.plugin.settings.miniOutlinePlaybackDisplay=mode;f.manager.sync();
    assert.equal(p.root.dataset.playbackDisplay,mode==='session'?'session':'toolbar');
    assert.equal(p.pause,button);assert.equal(p.pause.dataset.icon,'play');
    assert.equal(p.rows.get(0).row,row);assert.deepEqual(f.calls,['load']);
  }
});

test('heading rows have no trailing menu button and top options retain all section actions without starting speech', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
  f.setPositions({ reading: 1, browsing: 0 }); f.manager.update();
  for (const refs of p.rows.values()) {
    assert.equal(refs.row.querySelector('[data-icon="ellipsis"]'), null);
    assert.equal(refs.row.querySelector('.cozy-mini-action'), null);
    assert.equal(refs.row.querySelectorAll('button').length, 2);
  }
  assert.equal(p.optionsToggle.dataset.icon, 'ellipsis');
  p.optionsToggle.click(); await tick();
  assert.equal(p.tools.hidden, false); assert.match(p.sectionLabel.textContent, /Introduction/);
  assert.deepEqual(p.sectionButtons.map(button => button.dataset.icon), ['play', 'audio-lines', 'wrap-text']);
  assert.equal(f.calls.some(call => call[0] === 'read'), false);
  p.rows.get(1).title.focus();
  assert.match(p.sectionLabel.textContent, /Details/);
  p.sectionButtons[1].click(); await tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'read'), [['read', 1, false]]);
  f.setPositions({ reading: 3, browsing: 0 }); f.manager.update();
  assert.match(p.sectionLabel.textContent, /Details/);
  p.sectionButtons[2].click(); await tick();
  assert.equal(p.rows.get(1).row.classList.contains('is-expanded'), true);
  assert.equal(p.sectionButtons[2].getAttribute('aria-pressed'), 'true');
  f.setBusy(true); f.manager.update();
  assert.deepEqual(p.sectionButtons.map(button => button.disabled), [true, true, false]);
  p.sectionButtons[0].click(); await tick();
  assert.equal(f.calls.filter(call => call[0] === 'read').length, 1);
});

test('touch layouts use top section actions while title taps still navigate only', async t => {
  const f = fixture(undefined, { settingsLanguage: 'chinese' }); t.after(f.cleanup);
  f.doc.body.classList.add('is-mobile'); await f.panel.open(); const p = f.panel; p.state.pinned = true;
  const touch = new f.doc.defaultView.Event('pointerdown', { bubbles: true });
  Object.defineProperty(touch, 'pointerType', { value: 'touch' }); p.rows.get(1).title.dispatchEvent(touch);
  p.rows.get(1).title.click(); await tick();
  assert.ok(f.calls.some(call => call[0] === 'locate' && call[1] === 1));
  assert.equal(f.calls.some(call => call[0] === 'read'), false);
  p.optionsToggle.click(); await tick();
  assert.match(p.sectionLabel.textContent, /章节：Details/);
  assert.equal(p.sectionButtons[0].getAttribute('aria-label'), '从本节朗读');
  p.sectionButtons[0].click(); await tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'read'), [['read', 1, true]]);
  assert.equal(p.list.querySelector('.cozy-mini-action'), null);
});

test('unknown and empty section targets disable top actions instead of selecting the first heading', async t => {
  for (const entries of [undefined, []]) {
    const f = fixture(entries); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
    f.setPositions({ reading: -1, browsing: -1 }); f.manager.update();
    assert.deepEqual(p.sectionButtons.map(button => button.disabled), [true, true, true]);
    assert.match(p.sectionLabel.textContent, /No section available/);
    p.optionsToggle.click(); p.sectionButtons[0].click(); await tick();
    assert.deepEqual(f.calls, ['load']);
  }
});

test('top full-heading action reveals a hidden target locally and resets its target after reopening', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
  f.setPositions({ reading: -1, browsing: 2 }); f.manager.update();
  assert.equal(p.rows.has(2), false); assert.match(p.sectionLabel.textContent, /Example/);
  p.search.value = 'no such public heading'; p.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.equal(p.rows.size, 0);
  p.sectionButtons[2].click(); await tick();
  assert.equal(p.state.query, ''); assert.equal(p.search.value, '');
  assert.equal(p.rows.get(2).row.classList.contains('is-expanded'), true);
  assert.equal(f.doc.activeElement, p.rows.get(2).title); assert.deepEqual(f.calls, ['load']);
  p.close(); f.setPositions({ reading: -1, browsing: 0 }); await p.open();
  assert.match(p.sectionLabel.textContent, /Introduction/);
});

test('context-menu key anchors the menu and closing it returns keyboard focus without navigation', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
  const title = p.rows.get(1).title; title.focus();
  const key = new f.doc.defaultView.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true });
  title.dispatchEvent(key); const menu = f.menus.at(-1);
  assert.equal(key.defaultPrevented, true); assert.equal(menu.method, 'anchor');
  assert.equal(title.getAttribute('aria-keyshortcuts'), 'Shift+F10');
  title.blur(); menu.hide(); await tick();
  assert.equal(f.doc.activeElement, title); assert.deepEqual(f.calls, ['load']);
});

test('repeated top playback clicks start one pending action and keep full-heading access available', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
  let finish;
  f.adapter.read = async (_view, _data, index, remaining) => {
    f.calls.push(['read', index, remaining]); await new Promise(resolve => { finish = resolve; });
  };
  p.sectionButtons[0].click(); p.sectionButtons[0].click(); await tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'read'), [['read', 0, true]]);
  assert.deepEqual(p.sectionButtons.map(button => button.disabled), [true, true, false]);
  finish(); await tick();
  assert.deepEqual(p.sectionButtons.map(button => button.disabled), [false, false, false]);
});

test('dismissal or replaced source during validation cancels captured section commands', async t => {
  for (const change of ['close', 'source']) {
    const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
    const menu = sectionMenu(f, 0); let finish;
    p.valid = () => new Promise(resolve => { finish = resolve; });
    const action = menu.items[0].click(); await tick();
    if (change === 'close') p.close(); else { f.view.file = { path: 'replacement-public.md' }; p.invalidate(); }
    finish(true); await action;
    assert.equal(f.calls.some(call => call[0] === 'read'), false);
    assert.equal(p.selectedSection, null);
  }
});
test('closing and reopening the same outline cancels commands awaiting validation', async t => {
  for (const mode of ['menu-read', 'menu-title', 'direct-read']) {
    const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
    const menu = sectionMenu(f, 0); let finish;
    p.valid = () => new Promise(resolve => { finish = resolve; });
    const pending = mode === 'direct-read' ? p.read(0, true) : menu.items[mode === 'menu-title' ? 2 : 0].click();
    await tick(); p.close(); await p.open(); finish(true); await pending;
    assert.deepEqual(f.calls, ['load'], mode);
    assert.equal(p.expandedTitles.has(0), false, mode);
    assert.equal(!!p.sectionReadPending, false, mode);
    assert.deepEqual(p.sectionButtons.map(button => button.disabled), [false, false, false], mode);
  }
});

test('preferences normalize and skipped heading levels still have a usable tree', () => {
  assert.deepEqual(normalizeMiniSettings({ miniOutlineMode: 'bad', miniOutlineDepth: 99, miniOutlineSide: 'bad', miniOutlineHover: 'true' }),
    { miniOutlineMode: 'auto', miniOutlineDepth: 2, miniOutlineSide: 'right', miniOutlineHover: false, miniOutlineTransparent: false, miniOutlineDoubleClick: false, miniOutlineWidth: 0, miniOutlineTitleLines: 2, miniOutlineStartup: false, miniOutlinePlaybackDisplay: 'toolbar', miniOutlineCollapsedStyle: 'auto' });
  for (const value of [undefined, null, true, 'auto', 'rail', 'icon', 'bad']) {
    assert.equal(normalizeMiniSettings({ miniOutlineCollapsedStyle: value }).miniOutlineCollapsedStyle, ['rail','icon'].includes(value) ? value : 'auto');
  }
  for (const value of [undefined,null,true,'always','toolbar','session']) {
    assert.equal(normalizeMiniSettings({miniOutlinePlaybackDisplay:value}).miniOutlinePlaybackDisplay,value==='session'?'session':'toolbar');
  }
  assert.equal(normalizeMiniSettings({ miniOutlineTransparent: true }).miniOutlineTransparent, true);
  assert.equal(normalizeMiniSettings({ miniOutlineTransparent: 'true' }).miniOutlineTransparent, false);
  assert.equal(normalizeMiniSettings({ miniOutlineDoubleClick: true }).miniOutlineDoubleClick, true);
  assert.equal(normalizeMiniSettings({ miniOutlineDoubleClick: 'true' }).miniOutlineDoubleClick, false);
  assert.equal(normalizeMiniSettings({ miniOutlineStartup: true }).miniOutlineStartup,true);
  assert.equal(normalizeMiniSettings({ miniOutlineStartup: 'true' }).miniOutlineStartup,false);
  for (const [value, lines] of [[1,1],['1',1],[2,2],[3,3],['3',3],[4,4],['4',4],[0,2],[5,2],[true,2],[undefined,2],['bad',2]]) {
    assert.equal(normalizeMiniSettings({miniOutlineTitleLines:value}).miniOutlineTitleLines,lines,String(value));
  }
  for (const [value, width] of [[0,0],[undefined,0],['',0],[NaN,0],[Infinity,0],[true,0],['300px',0],[-10,0],[10,180],[180,180],['190',190],[235,240],[260,260],[427,430],['480',480],[999,600]]) {
    assert.equal(normalizeMiniSettings({miniOutlineWidth:value}).miniOutlineWidth,width,String(value));
  }
  assert.deepEqual(headingParents([{level:2},{level:4},{level:6},{level:2}]), [[],[0],[0,1],[]]);
});
test('startup does not read files; Floating TOC coexistence never mutates another plugin', async t => {
  const f = fixture(); t.after(f.cleanup); assert.deepEqual(f.calls, []);
  f.plugin.app.plugins.enabledPlugins.add('floating-toc'); f.manager.sync();
  assert.equal(otherOutlineEnabled(f.plugin.app), true); assert.equal(f.panel.launcher.hidden, true);
  await f.manager.toggle(); assert.equal(f.panel.opened, true); assert.deepEqual(f.calls, ['load']);
  f.panel.close(); f.plugin.settings.miniOutlineMode = 'always'; f.manager.sync(); assert.equal(f.panel.launcher.hidden, false);
  f.plugin.settings.miniOutlineMode = 'off'; f.manager.sync(); await f.manager.toggle(); f.manager.sync();
  assert.equal(f.panel.launcher.hidden, true); assert.equal(f.panel.opened, true);
  assert.deepEqual([...f.plugin.app.plugins.enabledPlugins], ['floating-toc']);
});

// Mirror the scheduled callback without making every race test wait for the debounce.
async function finishStartup(f, view = f.view, file = view.file) {
  clearTimeout(f.manager.startupTimer); f.manager.startupTimer = null;
  await f.manager.openStartup(view, file);
}

test('startup is opt-in and waits for layout restoration before pinning only the active outline', async t => {
  const off=fixture(); t.after(off.cleanup); off.manager.ready();
  const f=fixture(undefined,{miniOutlineStartup:true}); t.after(f.cleanup);
  const background={file:{path:'public-background.pdf'},containerEl:f.doc.querySelector('aside')};
  f.adapter.views=()=>[f.view,background];
  f.plugin.app.workspace={activeLeaf:{view:f.view}};
  f.plugin.app.plugins.enabledPlugins.add('floating-toc');
  f.manager.sync(); assert.deepEqual(f.calls,[]); assert.equal(f.manager.startupTimer,null);
  assert.equal(f.panel.launcher.hidden,true); const focus=f.doc.activeElement;
  f.manager.ready(); assert.deepEqual(f.calls,[]);
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.deepEqual(off.calls,[]); assert.equal(off.manager.startupPending,false);
  assert.deepEqual(f.calls,['load']); assert.equal(f.panel.opened,true); assert.equal(f.panel.state.pinned,true);
  assert.equal(f.panel.pin.getAttribute('aria-pressed'),'true'); assert.equal(f.doc.activeElement,focus);
  assert.equal(f.manager.panels.get(background).opened,undefined);
  assert.deepEqual([...f.plugin.app.plugins.enabledPlugins],['floating-toc']);
  f.panel.pin.click(); await new Promise(resolve=>setTimeout(resolve,300)); assert.equal(f.panel.opened,false);
  f.manager.sync(); f.manager.update(); assert.equal(f.manager.startupPending,false); assert.equal(f.manager.startupTimer,null);
  assert.deepEqual(f.calls,['load']);
});

test('startup ignores a saved background reading source until a supported pane is actually active', async t => {
  const f=fixture(undefined,{miniOutlineStartup:true}); t.after(f.cleanup);
  f.plugin.app.workspace={activeLeaf:{view:{getViewType:()=> 'empty'}}};
  f.manager.layoutReady=true; f.manager.sync();
  assert.equal(f.manager.startupPending,true); assert.equal(f.manager.startupTimer,null);
  assert.deepEqual(f.calls,[]);
  f.plugin.app.workspace.activeLeaf.view=f.view; f.manager.sync(); assert.ok(f.manager.startupTimer);
  await finishStartup(f); assert.deepEqual(f.calls,['load']); assert.equal(f.panel.state.pinned,true);
});

test('switching tabs or files during the startup delay never loads the old document', async t => {
  const f=fixture(undefined,{miniOutlineStartup:true}); t.after(f.cleanup);
  const next={file:{path:'another-public.md'},containerEl:f.doc.querySelector('aside')};
  f.adapter.views=()=>[f.view,next]; f.plugin.app.workspace={activeLeaf:{view:f.view}};
  f.adapter.load=async view=>{f.calls.push(view.file.path); return f.data;};
  f.manager.layoutReady=true; f.manager.sync();
  f.plugin.app.workspace.activeLeaf.view=next;
  await finishStartup(f); assert.deepEqual(f.calls,[]); assert.ok(f.manager.startupTimer);
  const oldFile=next.file; next.file={path:'replacement-public.md'};
  await finishStartup(f,next,oldFile); assert.deepEqual(f.calls,[]); assert.ok(f.manager.startupTimer);
  await finishStartup(f,next); assert.deepEqual(f.calls,['replacement-public.md']);
  assert.equal(f.manager.panels.get(next).state.pinned,true); assert.equal(f.panel.opened,undefined);
});

test('manual opening, disabling and disposal all cancel a pending automatic open', async t => {
  for (const action of ['manual','disable','dispose']) {
    const f=fixture(undefined,{miniOutlineStartup:true,miniOutlineMode:'always'}); t.after(f.cleanup);
    f.manager.layoutReady=true; f.manager.sync(); assert.ok(f.manager.startupTimer);
    if (action==='manual') { await f.manager.toggle(); f.panel.close(); }
    if (action==='disable') {
      f.plugin.settings.miniOutlineStartup=false; f.manager.sync();
      assert.equal(f.plugin.settings.miniOutlineMode,'always'); assert.equal(f.panel.launcher.hidden,false);
    }
    if (action==='dispose') f.manager.destroy();
    await finishStartup(f); f.manager.sync(); f.manager.update();
    assert.equal(f.manager.startupPending,false); assert.equal(f.manager.startupTimer,null);
    assert.deepEqual(f.calls,action==='manual'?['load']:[],action); assert.notEqual(f.panel.opened,true);
  }
});

test('export defers startup and completion retries only once without invoking playback or navigation', async t => {
  const f=fixture(undefined,{miniOutlineStartup:true}); t.after(f.cleanup);
  f.manager.layoutReady=true; f.setBusy(true); f.manager.sync();
  assert.equal(f.manager.startupPending,true); assert.equal(f.manager.startupTimer,null);
  f.setBusy(false); f.manager.update(); assert.ok(f.manager.startupTimer);
  await finishStartup(f); assert.deepEqual(f.calls,['load']);
  for(let i=0;i<20;i++) {f.manager.sync(); f.manager.update();}
  assert.deepEqual(f.calls,['load']); assert.equal(f.manager.startupPending,false);
});

test('failed startup reads do not loop, and a later manual retry is still possible', async t => {
  const f=fixture(undefined,{miniOutlineStartup:true}); t.after(f.cleanup);
  f.adapter.load=async()=>{f.calls.push('failure');throw Error('Public test failure');};
  f.manager.layoutReady=true; f.manager.sync(); await finishStartup(f);
  assert.equal(f.panel.invalid,true); assert.match(f.panel.status.textContent,/retry/);
  f.manager.sync(); f.manager.update(); assert.equal(f.manager.startupTimer,null); assert.deepEqual(f.calls,['failure']);
  f.panel.close(); f.adapter.load=async()=>{f.calls.push('load');return f.data;};
  await f.manager.toggle(); assert.equal(f.panel.data,f.data); assert.deepEqual(f.calls,['failure','load']);
});

test('automatic pinning reuses an in-flight manual load and file changes cancel stale initial loads', async t => {
  const f=fixture(); t.after(f.cleanup); let resolve;
  f.adapter.load=async()=>{f.calls.push('load');return new Promise(r=>{resolve=r;});};
  const manual=f.panel.open();
  f.plugin.settings.miniOutlineStartup=true; f.manager.layoutReady=true; f.manager.sync();
  await finishStartup(f); assert.equal(f.panel.state.pinned,true); assert.deepEqual(f.calls,['load']);
  f.view.file={path:'new-public.md'}; f.manager.sync(); assert.equal(f.panel.opened,false);
  resolve(f.data); await manual;
  assert.equal(f.panel.data,null); assert.equal(f.panel.loading,false); assert.equal(f.manager.startupPending,false);
});

test('the saved startup preference opens again after a new manager lifecycle, not after a same-session close', async t => {
  const settings={miniOutlineStartup:true,miniOutlineMode:'off'};
  for (let restart=0;restart<2;restart++) {
    const f=fixture(undefined,settings); t.after(f.cleanup);
    f.manager.layoutReady=true; f.manager.sync(); await finishStartup(f);
    assert.equal(f.panel.opened,true); assert.equal(f.panel.state.pinned,true); assert.equal(f.panel.launcher.hidden,true);
    f.panel.close(); f.manager.ready(); f.manager.sync(); await finishStartup(f);
    assert.equal(f.panel.opened,false); assert.deepEqual(f.calls,['load']); f.manager.destroy();
  }
});
test('search finds hidden descendants and clearing restores folds; pin and scroll survive reopen', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open(); const p = f.panel;
  assert.deepEqual([...p.rows.keys()], [0,1,3]);
  p.search.value = 'example'; p.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.deepEqual([...p.rows.keys()], [0,1,2]);
  p.search.value = ''; p.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.deepEqual([...p.rows.keys()], [0,1,3]);
  p.pin.click(); await tick(); assert.equal(p.state.pinned, true);
  p.state.scroll = 70; p.close(); await p.open(); assert.equal(p.state.scroll, 70);
  p.depth.value = '6'; p.depth.dispatchEvent(new f.doc.defaultView.Event('change')); assert.equal(p.rows.size, 4);
});
test('locate is separate from playback and section action preserves range choice', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open();
  f.panel.rows.get(1).title.click(); await tick(); assert.ok(f.calls.some(c => c[0] === 'locate'));
  assert.equal(f.calls.some(c => c[0] === 'read'), false); assert.equal(f.panel.opened, false);
  await f.panel.open(); await f.panel.read(1, false); await f.panel.read(1, true);
  assert.deepEqual(f.calls.filter(c => c[0] === 'read'), [['read',1,false], ['read',1,true]]);
  f.setBusy(true); f.manager.update(); sectionMenu(f, 1); await tick();
  assert.deepEqual(f.menus.at(-1).items.map(item=>item.disabled),[true,true,false]);
  await f.panel.read(1,true); assert.equal(f.calls.filter(c => c[0] === 'read').length,2);
});
test('reading marker differs from browsing; playback ticks keep controls and focus stable', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open();
  f.setPositions({ reading: 1, browsing: 0 }); f.manager.update(); const row = f.panel.rows.get(1).row;
  f.panel.search.focus(); for (let n=0;n<50;n++) f.manager.update();
  assert.equal(f.panel.rows.get(1).row, row); assert.equal(f.doc.activeElement,f.panel.search);
  assert.equal(row.classList.contains('is-reading'),true);
  assert.equal(f.panel.rows.get(0).title.getAttribute('aria-current'),'location');
  f.panel.list.dispatchEvent(new f.doc.defaultView.Event('wheel')); f.setPositions({reading:2,browsing:0}); f.manager.update();
  assert.equal(f.panel.rows.has(2),false);
  f.panel.back.click(); await tick(); assert.equal(f.panel.rows.has(2),true); assert.ok(f.calls.includes('return'));
});
test('late loads cannot resurrect closed or disposed directory; file switching blocks stale actions', async t => {
  const f = fixture(); t.after(f.cleanup); let resolve;
  f.adapter.load = () => new Promise(r => { resolve=r; }); const pending = f.panel.open();
  assert.equal(f.panel.search.disabled,true); f.panel.close(); resolve(f.data); await pending;
  assert.equal(f.panel.data,null); assert.equal(f.panel.opened,false);
  f.adapter.load = async () => f.data; await f.panel.open(); f.view.file = {path:'another-public.md'};
  await f.panel.read(0,true); assert.equal(f.calls.some(c => c[0] === 'read'),false);
  f.manager.sync(); assert.equal(f.panel.opened,false);
});
test('bounded directory rendering, long titles and labels are text rather than HTML', async t => {
  const entries = Array.from({length:700}, (_,i) => ({title: i ? `Public heading ${i}` : '<img src=x onerror=alert(1)>', level:1}));
  const f = fixture(entries); t.after(f.cleanup); await f.panel.open();
  assert.equal(f.panel.rows.size,200); assert.equal(f.panel.more.hidden,false); assert.equal(f.panel.root.querySelector('img'),null);
  f.panel.more.click(); await tick(); assert.equal(f.panel.rows.size,400);
  assert.equal(f.panel.root.querySelector('[title]'),null);
});
test('outside click closes unpinned only; Escape always closes; keyboard traverses rows', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open();
  f.panel.rows.get(0).title.focus();
  f.panel.panel.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(f.doc.activeElement,f.panel.rows.get(1).title);
  f.panel.state.pinned = true; f.doc.querySelector('aside').dispatchEvent(new f.doc.defaultView.Event('pointerdown',{bubbles:true}));
  assert.equal(f.panel.opened,true);
  f.panel.panel.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); assert.equal(f.panel.opened,false);
  await f.panel.open(); f.panel.state.pinned=false;
  f.doc.querySelector('aside').dispatchEvent(new f.doc.defaultView.Event('pointerdown',{bubbles:true})); assert.equal(f.panel.opened,false);
});
test('language switch recreates labels; removed panes and failures cannot interrupt audio rendering', async t => {
  const f = fixture(); t.after(f.cleanup); await f.panel.open();
  f.adapter.positions = () => { throw Error('Unavailable view'); }; assert.doesNotThrow(() => f.manager.update());
  f.plugin.settings.settingsLanguage='chinese'; f.manager.sync();
  assert.equal(f.panel.destroyed,true); assert.equal(f.manager.panels.get(f.view).launcher.getAttribute('aria-label'),'打开迷你目录');
  f.adapter.views = () => []; f.manager.sync(); assert.equal(f.manager.panels.size,0);
});
test('toolbar pointerdown does not close before toggle and a late chapter can be revealed', async t => {
  const f=fixture(Array.from({length:350},(_,i)=>({title:`Public section ${i}`,level:1}))); t.after(f.cleanup);
  const trigger=f.doc.createElement('button'); trigger.setAttribute('data-cozy-mini-toggle',''); f.view.containerEl.append(trigger);
  await f.panel.open(); trigger.dispatchEvent(new f.doc.defaultView.Event('pointerdown',{bubbles:true}));
  assert.equal(f.panel.opened,true); await f.manager.toggle(); assert.equal(f.panel.opened,false);
  await f.panel.open(); f.setPositions({reading:310,browsing:0}); f.manager.update();
  assert.equal(f.panel.rows.get(310).row.classList.contains('is-reading'),true);
});

test('compact controls retain touch close and a secondary close action in outline options', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  assert.equal(p.panel.querySelector('.cozy-mini-header').children.length,8);
  assert.equal(p.search.hidden,true); assert.equal(p.tools.hidden,true); assert.equal(p.closeButton.hidden,false);
  p.searchToggle.click(); await tick(); assert.equal(p.search.hidden,false); assert.equal(f.doc.activeElement,p.search);
  p.search.value='example'; p.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  p.close(); await p.open(); assert.equal(p.search.hidden,false); assert.equal(p.search.value,'example');
  p.searchToggle.click(); await tick(); assert.equal(p.search.hidden,true); assert.equal(p.state.query,'');
  assert.deepEqual([...p.rows.keys()],[0,1,3]);
  p.optionsToggle.click(); await tick(); assert.equal(p.tools.hidden,false);
  assert.ok(p.tools.contains(p.optionsClose)); p.optionsClose.click(); await tick(); assert.equal(p.opened,false);
  await p.open(); p.optionsToggle.click(); await tick(); assert.equal(p.tools.hidden,false);
  p.optionsToggle.click(); await tick(); assert.equal(p.tools.hidden,true);
  p.closeButton.click(); await tick(); assert.equal(p.opened,false);
});

test('desktop unpin waits for pointer leave and reopening does not silently pin the outline again', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  pointerEvent(f,'pointerenter','mouse',p.root);
  p.pin.click(); await tick(); assert.equal(p.state.pinned,true); assert.equal(p.opened,true);
  assert.equal(p.pin.getAttribute('aria-label'),'Unpin outline');
  p.pin.click(); await tick(); assert.equal(p.state.pinned,false); assert.equal(p.opened,true);
  pointerEvent(f,'pointerleave','mouse',p.root);
  await new Promise(resolve=>setTimeout(resolve,300)); assert.equal(p.opened,false);
  assert.equal(p.pin.getAttribute('aria-label'),'Pin outline');
  await p.open(); assert.equal(p.state.pinned,false); assert.equal(p.pin.getAttribute('aria-pressed'),'false');
});

test('document edge buttons navigate without speech, pause directory following and preserve a pinned panel', async t => {
  const f=fixture([]); t.after(f.cleanup); const p=f.panel;
  assert.equal(p.edgeButtons.length,4); assert.ok(p.edgeButtons.every(button=>button.disabled));
  await p.open({pin:true}); assert.ok(p.edgeButtons.every(button=>!button.disabled));
  p.edgeButtons[0].click(); await tick(); p.edgeButtons[1].click(); await tick();
  assert.deepEqual(f.calls,['load','pause-follow',['edge',false],'pause-follow',['edge',true]]);
  assert.equal(p.state.manual,true); assert.equal(p.opened,true);
  p.state.pinned=false; p.edgeButtons[3].click(); await tick(); assert.equal(p.opened,false);
  assert.equal(f.calls.some(call=>call[0]==='read'),false);
});

test('document edge navigation cancels on dismissal or changed source', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open({pin:true});
  let finish;
  f.adapter.locateEdge=async(_v,_d,end,cancelled)=>{await new Promise(r=>{finish=r;});if(!cancelled())f.calls.push(['edge',end]);};
  const pending=f.panel.locateEdge(true); await tick(); f.panel.close(); finish(); await pending;
  assert.equal(f.calls.some(call=>call[0]==='edge'),false);
  await f.panel.open(); f.view.file={path:'replacement-public.md'};
  await f.panel.locateEdge(false); assert.equal(f.calls.some(call=>call[0]==='edge'),false);
});

test('native section menus hold header controls visible only until the current menu closes', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  sectionMenu(f, 0); await tick(); const old=f.menus.at(-1);
  assert.equal(p.panel.classList.contains('has-open-menu'),true);
  old.hide(); await tick(); assert.equal(p.panel.classList.contains('has-open-menu'),false);
  sectionMenu(f, 1); await tick(); p.dismissMenu();
  assert.equal(p.panel.classList.contains('has-open-menu'),false);
  sectionMenu(f, 0); await tick(); p.close(); await tick();
  assert.equal(p.panel.classList.contains('has-open-menu'),false);
});

function pointerEvent(f, name, type, target = f.doc.querySelector('aside')) {
  const event = new f.doc.defaultView.Event(name, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: type });
  target.dispatchEvent(event);
}

test('chapter rail is lazy, represents cached headings and never navigates or speaks on hover', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel;
  assert.equal(p.launcherStyle,'icon'); assert.deepEqual(f.calls,[]);
  await p.open(); p.close(); assert.equal(p.launcher.hidden,false); assert.equal(p.launcherStyle,'rail');
  assert.equal(p.railMarks.length,4); assert.equal(p.launcher.querySelectorAll('button').length,0);
  assert.match(p.launcher.getAttribute('aria-label'),/4 sections/);
  assert.equal(p.launcher.querySelector('.cozy-mini-rail').getAttribute('aria-hidden'),'true');
  pointerEvent(f,'pointerenter','mouse',p.root); pointerEvent(f,'pointerenter','mouse',p.launcher);
  assert.equal(p.opened,false); await new Promise(resolve=>setTimeout(resolve,230));
  assert.equal(p.opened,true); assert.equal(p.launcher.hidden,true); assert.deepEqual(f.calls,['load']);
  assert.equal(p.state.pinned,false); assert.equal(f.doc.activeElement,f.doc.body);
  pointerEvent(f,'pointerleave','mouse',p.root); await new Promise(resolve=>setTimeout(resolve,100));
  pointerEvent(f,'pointerenter','mouse',p.root); await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(p.opened,true);
  pointerEvent(f,'pointerleave','mouse',p.root); await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(p.opened,false); assert.deepEqual(f.calls,['load']);
});

test('a brief pass over the rail cancels expansion and icon hover is independently opt-in', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel; await p.open(); p.close();
  pointerEvent(f,'pointerenter','mouse',p.launcher); pointerEvent(f,'pointerleave','mouse',p.root);
  await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(p.opened,false);
  f.plugin.settings.miniOutlineCollapsedStyle='icon'; f.manager.sync();
  pointerEvent(f,'pointerenter','mouse',p.launcher); await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(p.opened,false);
  f.plugin.settings.miniOutlineHover=true; f.manager.sync();
  pointerEvent(f,'pointerenter','mouse',p.launcher); await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(p.opened,true);
  assert.deepEqual(f.calls,['load']);
});

test('dense rails prefer shallow headings and bound marks without losing the full outline', async t => {
  const entries=Array.from({length:1000},(_,i)=>({title:`Public heading ${i}`,level:i%100===0?1:2}));
  assert.deepEqual(railHeadings(entries),Array.from({length:10},(_,i)=>i*100));
  const flat=entries.map(e=>({...e,level:2})), indices=railHeadings(flat);
  assert.equal(indices.length,24); assert.equal(indices[0],0); assert.equal(indices.at(-1),999);
  assert.ok(indices.every((n,i)=>!i||n>indices[i-1])); assert.deepEqual(railHeadings([]),[]);
  const f=fixture(entries); t.after(f.cleanup); await f.panel.open(); f.panel.close();
  assert.equal(f.panel.railMarks.length,10); assert.equal(f.panel.data.entries.length,1000);
  f.setPositions({reading:144,browsing:670}); f.panel.update(true);
  assert.equal(f.panel.railMarks.find(r=>r.mark.classList.contains('is-reading')).index,100);
  assert.equal(f.panel.railMarks.find(r=>r.mark.classList.contains('is-browsing')).index,600);
});

test('closed rails coalesce position updates without replacing rows or reading a document again', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel; await p.open(); p.close();
  const row=p.rows.get(0).row, marks=p.railMarks.map(r=>r.mark); let positions=0;
  f.adapter.positions=()=>{positions++;return {reading:2,browsing:3};};
  for(let i=0;i<100;i++)f.manager.update();
  assert.equal(positions,0); await new Promise(resolve=>setTimeout(resolve,210)); assert.equal(positions,1);
  assert.equal(p.rows.get(0).row,row); assert.deepEqual(p.railMarks.map(r=>r.mark),marks); assert.deepEqual(f.calls,['load']);
  assert.equal(p.railMarks[2].mark.classList.contains('is-reading'),true);
  assert.equal(p.railMarks[3].mark.classList.contains('is-browsing'),true);
  f.plugin.settings.miniOutlineMode='off'; f.manager.sync(); f.manager.update();
  await new Promise(resolve=>setTimeout(resolve,210)); assert.equal(positions,1);
});

test('search, options, menus and keyboard use keep an unpinned outline open after mouse leave', async t => {
  for(const mode of ['search','options','menu','keyboard']) {
    const f=fixture(); t.after(f.cleanup); const p=f.panel; await p.open();
    if(mode==='search')p.toggleSearch();
    if(mode==='options'){p.optionsToggle.click();await tick();}
    if(mode==='menu')sectionMenu(f,0);
    if(mode==='keyboard'){
      p.rows.get(0).title.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
      p.rows.get(0).title.focus();
    }
    pointerEvent(f,'pointerleave','mouse',p.root); await new Promise(resolve=>setTimeout(resolve,280)); assert.equal(p.opened,true,mode);
    if(mode==='search')p.toggleSearch();
    if(mode==='options'){p.optionsToggle.click();await tick();}
    if(mode==='menu')f.menus.at(-1).hide();
    if(mode==='keyboard')p.rows.get(0).title.blur();
    await new Promise(resolve=>setTimeout(resolve,300)); assert.equal(p.opened,false,mode);
  }
});

test('touch unpin collapses to a large icon; hybrid mouse can restore rails without reloading', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel; await p.open({pin:true});
  pointerEvent(f,'pointerdown','touch',p.pin); p.pin.click(); await tick();
  assert.equal(p.opened,false); assert.equal(p.launcherStyle,'icon'); assert.equal(p.launcher.classList.contains('is-touch-control'),true);
  pointerEvent(f,'pointerenter','touch',p.launcher); await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(p.opened,false);
  p.launcher.click(); await tick(); assert.equal(p.opened,true); p.close();
  pointerEvent(f,'pointerover','mouse'); assert.equal(p.launcherStyle,'rail');
  f.doc.body.classList.add('is-mobile'); f.manager.sync(); assert.equal(p.launcherStyle,'icon');
  f.plugin.settings.miniOutlineCollapsedStyle='rail'; f.manager.sync(); assert.equal(p.launcherStyle,'rail');
  assert.equal(p.launcher.classList.contains('is-touch-control'),true); assert.deepEqual(f.calls,['load']);
});

test('keyboard opens the collapsed entry into focusable headings and Escape returns to the same entry', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel; await p.open(); p.close();
  p.launcher.focus(); p.launcher.click(); await tick();
  assert.equal(f.doc.activeElement,p.rows.get(0).title);
  p.rows.get(0).title.dispatchEvent(new f.doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(p.opened,false); assert.equal(f.doc.activeElement,p.launcher); assert.deepEqual(f.calls,['load']);
});

test('startup unpin permits a collapsed entry only for that document and honors explicit hiding and coexistence', async t => {
  for(const mode of ['always','off','auto']){
    const f=fixture(undefined,{miniOutlineStartup:true,miniOutlineMode:mode});t.after(f.cleanup);const p=f.panel;
    if(mode==='auto')f.plugin.app.plugins.enabledPlugins.add('floating-toc');
    assert.equal(p.launcher.hidden,true); await p.open({pin:true});
    pointerEvent(f,'pointerdown','touch',p.pin);p.pin.click();await tick();f.manager.sync();
    assert.equal(p.launcher.hidden,mode!=='always'); assert.equal(p.opened,false);
    f.view.file={path:'another-public.pdf'};f.manager.sync();assert.equal(p.launcher.hidden,true);
    assert.equal(p.launcherStyle,'icon'); assert.equal(p.railMarks.length,0); assert.deepEqual(f.calls,['load']);
  }
});

test('invalidating headings removes stale rail markers without starting background analysis', async t => {
  const f=fixture();t.after(f.cleanup);const p=f.panel;await p.open();p.close();
  p.invalidate(); assert.equal(p.launcherStyle,'icon'); assert.equal(p.railMarks.length,0);
  f.manager.update();await new Promise(resolve=>setTimeout(resolve,220));assert.deepEqual(f.calls,['load']);
  await p.open(); assert.deepEqual(f.calls,['load','load']); assert.equal(p.data,f.data);
});

test('a disappeared viewer fails closed during a deferred rail update without affecting playback', async t => {
  const f=fixture();t.after(f.cleanup);const p=f.panel;await p.open();p.close();
  f.adapter.positions=()=>{throw Error('viewer detached');};f.manager.update();
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(p.launcherStyle,'icon');assert.equal(p.invalid,true);assert.equal(p.opened,false);assert.deepEqual(f.calls,['load']);
});

test('destroy cancels pending rail hover, collapse and position work', async t => {
  const f=fixture();t.after(f.cleanup);const p=f.panel;await p.open();p.close();
  pointerEvent(f,'pointerenter','mouse',p.launcher); f.manager.update(); f.manager.destroy();
  await new Promise(resolve=>setTimeout(resolve,280)); assert.deepEqual(f.calls,['load']); assert.equal(p.root.isConnected,false);
});

test('mixed-input desktops use actual touch or pen interaction, not touch capability, to keep controls visible', t => {
  const f=fixture();t.after(f.cleanup);const p=f.panel;
  Object.defineProperty(f.doc.defaultView.navigator,'maxTouchPoints',{value:10});
  assert.equal(p.panel.classList.contains('is-touch-controls'),false);
  pointerEvent(f,'pointerover','mouse');assert.equal(p.touchControls,false);
  pointerEvent(f,'pointerover','touch');assert.equal(p.panel.classList.contains('is-touch-controls'),true);
  pointerEvent(f,'pointerover','mouse');assert.equal(p.panel.classList.contains('is-touch-controls'),false);
  pointerEvent(f,'pointerdown','pen');assert.equal(p.panel.classList.contains('is-touch-controls'),true);
  pointerEvent(f,'pointerdown','mouse');assert.equal(p.panel.classList.contains('is-touch-controls'),false);
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.plugin.settings,{});
});

test('input-mode changes preserve pinned state and do not load documents, synthesize or mutate unknown pointer events', async t => {
  const f=fixture();t.after(f.cleanup);await f.panel.open({pin:true});const p=f.panel,row=p.rows.get(0).row;
  pointerEvent(f,'pointerdown','touch');
  for(let i=0;i<100;i++)pointerEvent(f,'pointerover','touch');
  pointerEvent(f,'pointerover','');pointerEvent(f,'pointerover','unknown');
  assert.equal(p.touchControls,true);assert.equal(p.panel.classList.contains('is-touch-controls'),true);
  assert.equal(p.rows.get(0).row,row);assert.equal(p.opened,true);assert.equal(p.state.pinned,true);
  pointerEvent(f,'pointerover','mouse');assert.equal(p.touchControls,false);
  assert.deepEqual(f.calls,['load']);
});

test('disposing a panel removes document-level pointer-mode listeners', t => {
  const f=fixture();t.after(f.cleanup);f.panel.destroy();
  pointerEvent(f,'pointerover','touch');pointerEvent(f,'pointerdown','pen');
  assert.equal(f.panel.touchControls,false);assert.equal(f.panel.panel.classList.contains('is-touch-controls'),false);
});

function headingEvent(f, title, type, detail = 1, pointerType = 'mouse') {
  if (type === 'click') {
    const down=new f.doc.defaultView.Event('pointerdown',{bubbles:true});
    Object.defineProperty(down,'pointerType',{value:pointerType}); title.dispatchEvent(down);
  }
  title.dispatchEvent(new f.doc.defaultView.MouseEvent(type,{bubbles:true,cancelable:true,detail}));
}

test('mouse double-click is opt-in; enabled single clicks keep the outline open and read from the section once', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  p.state.pinned=true;
  headingEvent(f,p.rows.get(1).title,'dblclick',2); await tick(); assert.equal(f.calls.some(c=>c[0]==='read'),false);
  p.state.pinned=false; f.plugin.settings.miniOutlineDoubleClick=true; f.manager.sync();
  const title=p.rows.get(1).title;
  headingEvent(f,title,'click'); await tick(); assert.equal(p.opened,true);
  assert.deepEqual(f.calls.filter(c=>c[0]==='locate'),[['locate',1]]);
  assert.equal(f.calls.some(c=>c[0]==='read'),false);
  headingEvent(f,title,'click',2); headingEvent(f,title,'dblclick',2); await tick();
  assert.deepEqual(f.calls.filter(c=>c[0]==='locate'),[['locate',1]]);
  assert.deepEqual(f.calls.filter(c=>c[0]==='read'),[['read',1,true]]);
  f.doc.querySelector('aside').dispatchEvent(new f.doc.defaultView.Event('pointerdown',{bubbles:true})); assert.equal(p.opened,false);
});

test('double-click playback waits for navigation, blocks duplicate starts and respects export guards', async t => {
  const f=fixture(); t.after(f.cleanup); f.plugin.settings.miniOutlineDoubleClick=true; await f.panel.open();
  let locateDone, readDone;
  f.adapter.locate=()=>new Promise(resolve=>{locateDone=resolve;});
  f.adapter.read=(_v,_d,index,remaining)=>{f.calls.push(['read',index,remaining]);return new Promise(resolve=>{readDone=resolve;});};
  const title=f.panel.rows.get(1).title;
  headingEvent(f,title,'click'); await tick(); headingEvent(f,title,'dblclick',2); headingEvent(f,title,'dblclick',2); await tick();
  assert.equal(f.calls.some(c=>c[0]==='read'),false); locateDone(); await tick();
  headingEvent(f,title,'dblclick',2); await tick(); assert.deepEqual(f.calls.filter(c=>c[0]==='read'),[['read',1,true]]);
  readDone(); await tick(); f.setBusy(true); headingEvent(f,title,'dblclick',2); await tick();
  assert.equal(f.calls.filter(c=>c[0]==='read').length,1);
});

test('queued double-click playback is cancelled by closing, another heading or a changed document', async t => {
  for (const change of ['close','other-heading','new-document','disable','document-edge']) {
    const f=fixture(); t.after(f.cleanup); f.plugin.settings.miniOutlineDoubleClick=true; await f.panel.open();
    let resolve; f.adapter.locate=(_v,_d,i)=>i===1?new Promise(r=>{resolve=r;}):Promise.resolve();
    const title=f.panel.rows.get(1).title;
    headingEvent(f,title,'click'); await tick(); headingEvent(f,title,'dblclick',2);
    if (change==='close') { f.panel.close(); await f.panel.open(); }
    if (change==='other-heading') { headingEvent(f,f.panel.rows.get(0).title,'click'); await tick(); }
    if (change==='new-document') f.view.file={path:'another-public.md'};
    if (change==='disable') f.plugin.settings.miniOutlineDoubleClick=false;
    if (change==='document-edge') await f.panel.locateEdge(true);
    resolve(); await tick(); assert.equal(f.calls.some(c=>c[0]==='read'),false,change);
  }
});

test('touch, mobile, coarse pointers and keyboard navigation do not opt into double-click playback', async t => {
  for (const mode of ['touch','mobile','coarse','keyboard']) {
    const f=fixture(); t.after(f.cleanup); f.plugin.settings.miniOutlineDoubleClick=true; await f.panel.open();
    if (mode==='mobile') f.doc.body.classList.add('is-mobile');
    if (mode==='coarse') f.doc.defaultView.matchMedia=()=>({matches:false});
    const title=f.panel.rows.get(0).title;
    if (mode==='keyboard') title.click();
    else { f.panel.state.pinned=true; headingEvent(f,title,'click',1,mode==='touch'?'touch':'mouse'); headingEvent(f,title,'dblclick',2); }
    await tick(); assert.equal(f.calls.some(c=>c[0]==='read'),false,mode);
    assert.deepEqual(f.calls.filter(c=>c[0]==='locate'),[['locate',0]],mode);
    if (mode==='keyboard') assert.equal(f.panel.opened,false);
  }
});

test('background preference updates existing UI without reloading headings or changing other plugins', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const row=f.panel.rows.get(0).row;
  f.plugin.settings.miniOutlineTransparent=true; f.manager.sync();
  assert.equal(f.panel.root.dataset.background,'transparent'); assert.equal(f.panel.rows.get(0).row,row);
  f.plugin.settings.miniOutlineTransparent=false; f.manager.sync();
  assert.equal(f.panel.root.dataset.background,'solid'); assert.deepEqual(f.calls,['load']);
});

test('width updates existing layout without replacing headings, loading documents or starting playback', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel,row=p.rows.get(1).row;
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'');
  f.plugin.settings.miniOutlineWidth=180; f.manager.sync();
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'180px'); assert.equal(p.rows.get(1).row,row);
  f.plugin.settings.miniOutlineWidth=420; f.manager.sync();
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'420px'); assert.equal(p.rows.get(1).row,row);
  f.plugin.settings.miniOutlineWidth=999; f.manager.sync(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'600px');
  f.plugin.settings.miniOutlineWidth=0; f.manager.sync(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'');
  assert.deepEqual(f.calls,['load']);
  p.close(); f.plugin.settings.miniOutlineWidth=360; f.manager.sync(); await p.open();
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-width'),'360px'); assert.deepEqual(f.calls,['load']);
});

test('header edge controls use measured space and theme button sizes without changing saved width or rows', async t => {
  const f=fixture(undefined,{miniOutlineWidth:420}); t.after(f.cleanup); const p=f.panel;
  let width=420, buttonWidth=26; p.panel.getBoundingClientRect=()=>rect(0,0,width,300);
  p.header.getBoundingClientRect=()=>rect(0,0,width-14,26); p.header.style.columnGap='3px';
  p.closeButton.style.display='none';
  [...p.header.children].forEach(button=>{button.getBoundingClientRect=()=>rect(0,0,buttonWidth,26);});
  await p.open(); const row=p.rows.get(1).row, state=p.state;
  for(const [actual,fit] of [[180,false],[190,false],[230,true],[240,true],[420,true]]) {
    width=actual; p.layout(); assert.deepEqual(p.edgeButtons.map(button=>button.hidden),[!fit,!fit,fit,fit]);
    assert.equal(p.rows.get(1).row,row); assert.equal(p.state,state); assert.equal(f.plugin.settings.miniOutlineWidth,420);
  }
  width=230; buttonWidth=36; p.layout(); assert.equal(p.edgeButtons[0].hidden,true);
  buttonWidth=26; p.layout(); assert.equal(p.edgeButtons[0].hidden,false);
  assert.deepEqual(f.calls,['load']);
  p.close(); width=180; await p.open();
  assert.equal(p.edgeButtons[0].hidden,true); assert.deepEqual(f.calls,['load']);
});

test('section options use one compact row or an equivalent menu without changing the target', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel;
  f.doc.defaultView.matchMedia=()=>({matches:false});
  let width=286; p.sectionTools.getBoundingClientRect=()=>rect(0,0,width,26);
  p.sectionTools.style.columnGap='6px'; p.sectionCommands.style.columnGap='4px'; p.sectionLabel.style.fontSize='12px';
  p.sectionButtons.forEach(button=>{button.getBoundingClientRect=()=>rect(0,0,26,26);});
  await p.open({pin:true}); p.rows.get(1).title.focus(); p.optionsToggle.click(); await tick();
  assert.equal(p.sectionCommands.hidden,false); assert.equal(p.sectionMenuToggle.hidden,true);
  p.sectionButtons[0].focus(); width=166; p.layoutControls();
  assert.equal(p.sectionCommands.hidden,true); assert.equal(p.sectionMenuToggle.hidden,false);
  assert.equal(f.doc.activeElement,p.sectionMenuToggle);
  assert.match(p.sectionMenuToggle.getAttribute('aria-label'),/Details/);
  p.sectionMenuToggle.click(); await tick(); const menu=f.menus.at(-1);
  assert.equal(menu.method,'anchor'); assert.equal(p.opened,true); assert.deepEqual(f.calls,['load']);
  await menu.items[1].click(); assert.deepEqual(f.calls.filter(call=>call[0]==='read'),[['read',1,false]]);
  p.sectionMenuToggle.blur(); menu.hide(); await tick(); assert.equal(f.doc.activeElement,p.sectionMenuToggle);
  width=286; p.layoutControls(); assert.equal(p.sectionCommands.hidden,false);
  assert.equal(f.doc.activeElement,p.sectionButtons[0]);
  p.touchControls=true; p.layoutControls(); assert.equal(p.sectionCommands.hidden,true);
  f.setPositions({reading:-1,browsing:-1}); p.selectedSection=null; f.manager.update();
  assert.equal(p.sectionMenuToggle.disabled,true);
});

test('touch headers require full-sized controls and keep edge actions together when space is tight', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel; f.doc.body.classList.add('is-mobile');
  let width=322; p.header.getBoundingClientRect=()=>rect(0,0,width,44); p.header.style.columnGap='3px';
  p.closeButton.style.marginLeft='200px';
  [...p.header.children].forEach(button=>{button.getBoundingClientRect=()=>rect(0,0,44,44);});
  await p.open(); assert.deepEqual(p.edgeButtons.map(button=>button.hidden),[true,true,false,false]);
  width=400; p.layoutControls(); assert.deepEqual(p.edgeButtons.map(button=>button.hidden),[false,false,true,true]);
  p.optionsToggle.click(); await tick(); assert.equal(p.sectionCommands.hidden,true);
  assert.equal(p.sectionMenuToggle.hidden,false); assert.deepEqual(f.calls,['load']);
});

test('heading line limits update in place and preserve explicitly expanded titles and full labels', async t => {
  const f=fixture([{title:'A long public heading '.repeat(20),level:1}]); t.after(f.cleanup); await f.panel.open(); const p=f.panel,row=p.rows.get(0).row;
  const fullLabel=p.rows.get(0).title.getAttribute('aria-label');
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-title-lines'),'2');
  sectionMenu(f, 0); await tick(); await f.menus.at(-1).items[2].click();
  for (const lines of [1,2,3,4]) {
    f.plugin.settings.miniOutlineTitleLines=lines; f.manager.sync();
    assert.equal(p.root.style.getPropertyValue('--cozy-mini-title-lines'),String(lines));
    assert.equal(p.rows.get(0).row,row); assert.equal(row.classList.contains('is-expanded'),true);
    assert.equal(p.rows.get(0).title.getAttribute('aria-label'),fullLabel);
  }
  sectionMenu(f, 0); await tick(); await f.menus.at(-1).items[2].click();
  assert.equal(row.classList.contains('is-expanded'),false); assert.equal(p.root.style.getPropertyValue('--cozy-mini-title-lines'),'4');
  assert.deepEqual(f.calls,['load']);
});

const rect=(x,y,width,height)=>({left:x,top:y,right:x+width,bottom:y+height,width,height});
test('edge button avoids dynamically mounted Editing Toolbar, including resize and visibility changes', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel;
  f.view.containerEl.getBoundingClientRect=()=>rect(0,40,800,700);
  p.launcher.getBoundingClientRect=()=>rect(758,0,32,32);
  const toolbar=f.doc.createElement('div'); toolbar.id='editingToolbarModalBar';
  let box=rect(0,78,788,36); toolbar.getBoundingClientRect=()=>box;
  f.view.containerEl.append(toolbar);
  const waitLayout=()=>new Promise(r=>setTimeout(r,75));
  await waitLayout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'82px');
  box=rect(0,78,788,72); toolbar.style.height='72px';
  await waitLayout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'118px');
  toolbar.style.visibility='hidden'; await waitLayout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'44px');
  toolbar.style.visibility='visible'; await waitLayout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'118px');
  toolbar.remove(); await waitLayout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'44px');
  assert.deepEqual(f.calls,[]);
});

test('left/right placement ignores other panes, hidden global bars and horizontally separate tools', async t => {
  const f=fixture(); t.after(f.cleanup); const p=f.panel;
  f.view.containerEl.getBoundingClientRect=()=>rect(0,40,800,700);
  p.launcher.getBoundingClientRect=()=>rect(0,0,32,32);
  const bar=f.doc.createElement('div'); bar.id='editingToolbarPopoverBar';
  bar.getBoundingClientRect=()=>rect(0,90,120,40); f.doc.body.append(bar);
  f.manager.sync(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'44px');
  f.plugin.settings.miniOutlineSide='left'; f.manager.sync(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'98px');
  bar.style.visibility='hidden'; p.layout(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'44px');
  const other=f.doc.querySelector('aside'); other.className='workspace-leaf-content'; other.append(bar); bar.style.visibility='visible';
  f.manager.sync(); assert.equal(p.root.style.getPropertyValue('--cozy-mini-top'),'44px');
  assert.deepEqual(f.calls,[]);
});

test('titles use display-only cleanup and search without changing source anchors or navigation', async t => {
  const entries=[{title:'1. **A public title** with $x_{k}$',level:1,from:24,to:80},{title:'2. A second title',level:1,from:80,to:140}];
  const f=fixture(entries); t.after(f.cleanup); const original=JSON.stringify(entries); await f.panel.open();
  assert.equal(f.panel.rows.get(0).title.textContent,'1. A public title with x_{k}');
  assert.equal(f.panel.rows.get(0).title.getAttribute('aria-label'),'Go to: 1. A public title with x_{k}');
  f.panel.search.value='title with x_'; f.panel.search.dispatchEvent(new f.doc.defaultView.Event('input'));
  assert.deepEqual([...f.panel.rows.keys()],[0]);
  f.panel.rows.get(0).title.click(); await tick(); assert.ok(f.calls.some(call=>call[0]==='locate'&&call[1]===0));
  assert.equal(JSON.stringify(entries),original);
});

test('one section menu retains both reading scopes and a complete-title view, including keyboard access', async t => {
  const f=fixture([{title:'A long public heading '.repeat(12),level:1}]); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  assert.equal(p.back.dataset.icon,'corner-up-left'); assert.equal(p.list.classList.contains('cozy-mini-flat'),true);
  assert.equal(p.rows.get(0).row.querySelectorAll('.cozy-mini-action').length,0);
  p.rows.get(0).title.focus();
  const key = new f.doc.defaultView.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true });
  p.rows.get(0).title.dispatchEvent(key); await tick(); const menu=f.menus.at(-1);
  assert.equal(key.defaultPrevented, true);
  assert.equal(menu.method,'anchor'); assert.deepEqual(menu.items.map(item=>item.label),['Read from this section','Read this section only','Show full heading']);
  await menu.items[0].click(); await menu.items[1].click();
  assert.deepEqual(f.calls.filter(call=>call[0]==='read'),[['read',0,true],['read',0,false]]);
  await menu.items[2].click(); assert.equal(p.rows.get(0).row.classList.contains('is-expanded'),true);
  assert.equal(f.doc.activeElement,p.rows.get(0).title);
  sectionMenu(f, 0); await tick(); assert.equal(f.menus.at(-1).items[2].label,'Collapse heading');
  await f.menus.at(-1).items[2].click(); assert.equal(p.rows.get(0).row.classList.contains('is-expanded'),false);
});

test('section menus do not close an unpinned outline before selection and cannot act on a replaced document', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  p.rows.get(0).row.dispatchEvent(new f.doc.defaultView.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  const menu=f.menus.at(-1); assert.equal(menu.method,'pointer');
  const popup=f.doc.createElement('div'); popup.className='menu'; f.doc.body.append(popup);
  popup.dispatchEvent(new f.doc.defaultView.Event('pointerdown',{bubbles:true})); assert.equal(p.opened,true);
  f.view.file={path:'different-public.md'}; p.invalidate(); assert.equal(menu.hidden,true);
  f.adapter.load=async()=>({kind:'markdown',entries:[{title:'Replacement',level:1}]}); await p.load();
  await menu.items[0].click(); await menu.items[2].click();
  assert.equal(f.calls.some(call=>call[0]==='read'),false); assert.equal(p.expandedTitles.size,0);
  sectionMenu(f, 0); await tick(); const current=f.menus.at(-1); p.close(); assert.equal(current.hidden,true);
});
