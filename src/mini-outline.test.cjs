'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { MiniOutlineManager, headingParents, normalizeMiniSettings, otherOutlineEnabled } = require('../src/mini-outline');
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
test('preferences normalize and skipped heading levels still have a usable tree', () => {
  assert.deepEqual(normalizeMiniSettings({ miniOutlineMode: 'bad', miniOutlineDepth: 99, miniOutlineSide: 'bad', miniOutlineHover: 'true' }),
    { miniOutlineMode: 'auto', miniOutlineDepth: 2, miniOutlineSide: 'right', miniOutlineHover: false, miniOutlineTransparent: false, miniOutlineDoubleClick: false, miniOutlineWidth: 0, miniOutlineTitleLines: 2, miniOutlineStartup: false });
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
  f.panel.pin.click(); await tick(); assert.equal(f.panel.opened,false);
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
  f.setBusy(true); f.manager.update(); f.panel.rows.get(1).more.click(); await tick();
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
  assert.equal(p.panel.querySelector('.cozy-mini-header').children.length,7);
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

test('unpin dismisses immediately and reopening does not silently pin the outline again', async t => {
  const f=fixture(); t.after(f.cleanup); await f.panel.open(); const p=f.panel;
  p.pin.click(); await tick(); assert.equal(p.state.pinned,true); assert.equal(p.opened,true);
  assert.equal(p.pin.getAttribute('aria-label'),'Unpin and close outline');
  p.pin.click(); await tick(); assert.equal(p.state.pinned,false); assert.equal(p.opened,false);
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
  p.rows.get(0).more.click(); await tick(); const old=f.menus.at(-1);
  assert.equal(p.panel.classList.contains('has-open-menu'),true);
  old.hide(); await tick(); assert.equal(p.panel.classList.contains('has-open-menu'),false);
  p.rows.get(1).more.click(); await tick(); p.dismissMenu();
  assert.equal(p.panel.classList.contains('has-open-menu'),false);
  p.rows.get(0).more.click(); await tick(); p.close(); await tick();
  assert.equal(p.panel.classList.contains('has-open-menu'),false);
});

function pointerEvent(f, name, type) {
  const event = new f.doc.defaultView.Event(name, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: type });
  f.doc.querySelector('aside').dispatchEvent(event);
}

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

test('compact outline controls follow actual pane-constrained width without changing saved preferences or reading state', async t => {
  const f=fixture(undefined,{miniOutlineWidth:420}); t.after(f.cleanup); const p=f.panel;
  let width=420; p.panel.getBoundingClientRect=()=>({left:0,top:0,right:width,bottom:300,width,height:300});
  await p.open(); const row=p.rows.get(1).row, state=p.state;
  assert.equal(p.panel.classList.contains('is-compact'),false);
  for(const [actual,compact] of [[180,true],[230,true],[239,true],[240,false],[420,false]]) {
    width=actual; p.layout(); assert.equal(p.panel.classList.contains('is-compact'),compact);
    assert.equal(p.rows.get(1).row,row); assert.equal(p.state,state); assert.equal(f.plugin.settings.miniOutlineWidth,420);
  }
  assert.deepEqual(f.calls,['load']);
  p.close(); width=180; await p.open();
  assert.equal(p.panel.classList.contains('is-compact'),true); assert.deepEqual(f.calls,['load']);
});

test('heading line limits update in place and preserve explicitly expanded titles and full labels', async t => {
  const f=fixture([{title:'A long public heading '.repeat(20),level:1}]); t.after(f.cleanup); await f.panel.open(); const p=f.panel,row=p.rows.get(0).row;
  const fullLabel=p.rows.get(0).title.getAttribute('aria-label');
  assert.equal(p.root.style.getPropertyValue('--cozy-mini-title-lines'),'2');
  p.rows.get(0).more.click(); await tick(); await f.menus.at(-1).items[2].click();
  for (const lines of [1,2,3,4]) {
    f.plugin.settings.miniOutlineTitleLines=lines; f.manager.sync();
    assert.equal(p.root.style.getPropertyValue('--cozy-mini-title-lines'),String(lines));
    assert.equal(p.rows.get(0).row,row); assert.equal(row.classList.contains('is-expanded'),true);
    assert.equal(p.rows.get(0).title.getAttribute('aria-label'),fullLabel);
  }
  p.rows.get(0).more.click(); await tick(); await f.menus.at(-1).items[2].click();
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
  assert.equal(p.rows.get(0).row.querySelectorAll('.cozy-mini-action').length,1);
  p.rows.get(0).more.click(); await tick(); const menu=f.menus.at(-1);
  assert.equal(menu.method,'anchor'); assert.deepEqual(menu.items.map(item=>item.label),['Read from this section','Read this section only','Show full heading']);
  await menu.items[0].click(); await menu.items[1].click();
  assert.deepEqual(f.calls.filter(call=>call[0]==='read'),[['read',0,true],['read',0,false]]);
  await menu.items[2].click(); assert.equal(p.rows.get(0).row.classList.contains('is-expanded'),true);
  assert.equal(f.doc.activeElement,p.rows.get(0).more);
  p.rows.get(0).more.click(); await tick(); assert.equal(f.menus.at(-1).items[2].label,'Collapse heading');
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
  p.rows.get(0).more.click(); await tick(); const current=f.menus.at(-1); p.close(); assert.equal(current.hidden,true);
});
