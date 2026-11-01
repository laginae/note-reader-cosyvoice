'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { MiniOutlineManager, headingParents, normalizeMiniSettings, otherOutlineEnabled } = require('../src/mini-outline');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(entries) {
  const dom = new JSDOM('<main></main><aside></aside>'), doc = dom.window.document, calls = [];
  const file = { path: 'public-example.md', stat: { mtime: 1 } };
  const view = { file, containerEl: doc.querySelector('main') };
  const plugin = { settings: {}, app: { plugins: { enabledPlugins: new Set() } } };
  let positions = { reading: -1, browsing: 0 }, busy = false;
  const data = { entries: entries || [{ title: 'Introduction', level: 1 }, { title: 'Details', level: 2 }, { title: 'Example', level: 4 }, { title: 'Summary', level: 1 }] };
  const adapter = { views: () => [view], activeView: () => view, valid: () => true,
    load: async () => { calls.push('load'); return data; }, locate: async (_v, _d, i) => calls.push(['locate', i]),
    read: async (_v, _d, i, rest) => calls.push(['read', i, rest]), positions: () => positions, busy: () => busy,
    pauseFollow: () => calls.push('pause-follow'), returnReading: async () => calls.push('return') };
  const manager = new MiniOutlineManager(plugin, adapter, { setIcon() {}, Menu: class {} }); manager.sync();
  const panel = manager.panels.get(view);
  const cleanup = () => { manager.destroy(); dom.window.close(); };
  return { manager, panel, plugin, adapter, calls, data, view, doc, cleanup, setPositions: value => { positions = value; }, setBusy: value => { busy = value; } };
}
test('preferences normalize and skipped heading levels still have a usable tree', () => {
  assert.deepEqual(normalizeMiniSettings({ miniOutlineMode: 'bad', miniOutlineDepth: 99, miniOutlineSide: 'bad', miniOutlineHover: 'true' }),
    { miniOutlineMode: 'auto', miniOutlineDepth: 2, miniOutlineSide: 'right', miniOutlineHover: false });
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
  f.setBusy(true); f.manager.update(); assert.equal(f.panel.rows.get(1).read.disabled, true);
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
