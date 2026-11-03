'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { addMiniOutlineSettings } = require('../src/mini-outline');
const { addReadingMenuSettings } = require('../src/reading-menu');

function fixture(installed = true, initial = {}) {
  const dom = new JSDOM('<main></main>'), doc = dom.window.document, rows = [];
  dom.window.HTMLElement.prototype.createEl = function(tag, { text = '', cls = '' } = {}) {
    const el=doc.createElement(tag); el.textContent=text; el.className=cls; this.append(el); return el;
  };
  dom.window.HTMLElement.prototype.addClass = function(cls) { this.classList.add(cls); };
  class Control {
    constructor() { this.options={}; }
    addOption(key,label) { this.options[key]=label; return this; }
    setValue(value) { this.value=value; return this; }
    setDisabled(value) { this.disabled=value; return this; }
    onChange(fn) { this.change=fn; return this; }
    setLimits(min,max,step) { this.limits={min,max,step}; return this; }
    setDynamicTooltip() { return this; }
    setIcon(icon) { this.icon=icon; return this; }
    setTooltip(tooltip) { this.tooltip=tooltip; return this; }
    onClick(fn) { this.click=fn; return this; }
  }
  class Setting {
    constructor(parent) { this.settingEl=parent.createEl('div',{cls:'setting-item'}); this.controlEl=this.settingEl.createEl('div',{cls:'setting-item-control'}); rows.push(this); }
    setName(name) { this.name=name; return this; }
    setDesc(desc) { this.desc=desc; return this; }
    addDropdown(fn) { this.control=new Control(); fn(this.control); return this; }
    addToggle(fn) { return this.addDropdown(fn); }
    addSlider(fn) { return this.addDropdown(fn); }
    addExtraButton(fn) { this.reset=new Control(); fn(this.reset); return this; }
  }
  let saves=0, syncs=0;
  const settings={settingsLanguage:'chinese',readingFloatingToolbar:false,readingFloatingAction:'from-selection',...initial};
  const plugin={settings,app:{plugins:{plugins:installed?{'editing-toolbar':{}}:{}}},saveSettings:async()=>{saves++;},miniOutline:{sync(){syncs++;}}};
  const container=doc.querySelector('main');
  addReadingMenuSettings(container,plugin,Setting); addMiniOutlineSettings(plugin,container,Setting);
  return {dom,container,rows,plugin,counts:()=>({saves,syncs}),row:name=>rows.find(r=>r.name===name)};
}

test('settings have two plain groups, explicit button labels and collapsed advanced preferences', async t=>{
  const f=fixture(); t.after(()=>f.dom.window.close());
  assert.deepEqual([...f.container.querySelectorAll('h3')].map(el=>el.textContent),['朗读快捷入口','迷你目录']);
  const entry=f.row('迷你目录按钮');
  assert.ok(entry.desc.includes('仍可通过朗读工具栏或命令打开迷你目录，不影响其他插件。'));
  assert.deepEqual(entry.control.options,{auto:'自动（推荐）',always:'始终显示',off:'隐藏按钮'});
  const advanced=f.container.querySelector('.cozy-mini-settings-advanced'); assert.equal(advanced.open,false);
  for (const name of ['收起样式','播放按钮显示方式','目录位置','默认展开层级','透明背景','双击标题开始朗读','鼠标悬停展开目录图标']) assert.ok(advanced.contains(f.row(name).settingEl),name);
  for (const name of ['启动时打开迷你目录','迷你目录按钮','目录宽度','标题显示行数']) assert.equal(advanced.contains(f.row(name).settingEl),false,name);
  await f.row('透明背景').control.change(true);
  assert.equal(f.plugin.settings.miniOutlineTransparent,true); assert.deepEqual(f.counts(),{saves:1,syncs:1});
  const doubleClick=f.row('双击标题开始朗读');
  assert.equal(doubleClick.control.value,false); assert.ok(doubleClick.desc.includes('仅鼠标操作生效'));
  await doubleClick.control.change(true); assert.equal(f.plugin.settings.miniOutlineDoubleClick,true);
  assert.deepEqual(f.counts(),{saves:2,syncs:2});
});

test('floating action hides immediately when disabled without discarding the saved choice', async t=>{
  const f=fixture(); t.after(()=>f.dom.window.close());
  const icon=f.row('悬浮工具栏朗读图标'), action=f.row('悬浮图标默认动作');
  assert.equal(action.settingEl.hidden,true);
  await icon.control.change(true); assert.equal(action.settingEl.hidden,false); assert.equal(action.control.disabled,false);
  await icon.control.change(false); assert.equal(action.settingEl.hidden,true);
  assert.equal(f.plugin.settings.readingFloatingAction,'from-selection');
  await icon.control.change(true); assert.equal(action.control.value,'from-selection');
});

test('independent pause button is opt-in and needs no Editing Toolbar plugin', async t=>{
  const f=fixture(false); t.after(()=>f.dom.window.close()); const row=f.row('悬浮播放控制');
  assert.equal(row.control.value,false); assert.notEqual(row.control.disabled,true);
  await row.control.change(true); assert.equal(f.plugin.settings.floatingPauseButton,true);
  assert.deepEqual(f.counts(),{saves:1,syncs:1});
  await row.control.change(false); assert.equal(f.plugin.settings.floatingPauseButton,false);
});

test('floating options are collapsed by default and disabling the parent preserves the stop choice', async t=>{
  const f=fixture(false);t.after(()=>f.dom.window.close());const parent=f.row('悬浮播放控制'),stop=f.row('显示停止朗读按钮');
  const more=f.container.querySelector('.cozy-floating-settings');
  assert.equal(more.previousElementSibling,parent.settingEl);assert.equal(more.firstElementChild.tagName,'SUMMARY');
  assert.equal(more.firstElementChild.textContent,'更多悬浮按钮选项');assert.ok(more.contains(stop.settingEl));
  assert.equal(stop.control.value,true);assert.equal(more.hidden,true);assert.equal(more.open,false);
  await parent.control.change(true);assert.equal(more.hidden,false);assert.equal(more.open,false);
  more.open=true;
  await stop.control.change(false);assert.equal(f.plugin.settings.floatingStopButton,false);
  await parent.control.change(false);assert.equal(more.hidden,true);assert.equal(more.open,false);
  await parent.control.change(true);assert.equal(more.hidden,false);assert.equal(more.open,false);assert.equal(f.plugin.settings.floatingStopButton,false);
  const reopened=fixture(false,f.plugin.settings);t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.row('显示停止朗读按钮').control.value,false);
  assert.equal(reopened.container.querySelector('.cozy-floating-settings').hidden,false);
  assert.equal(reopened.container.querySelector('.cozy-floating-settings').open,false);
  assert.deepEqual(f.counts(),{saves:4,syncs:4});
});

test('opening and collapsing floating options never saves preferences or changes playback controls', async t=>{
  const f=fixture(false,{floatingPauseButton:true,floatingStopButton:true});t.after(()=>f.dom.window.close());
  const more=f.container.querySelector('.cozy-floating-settings');
  more.open=true;more.open=false;await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(f.counts(),{saves:0,syncs:0});
  assert.equal(f.plugin.settings.floatingStopButton,true);assert.equal(f.plugin.settings.floatingPauseButton,true);
  const en=fixture(false,{settingsLanguage:'english',floatingPauseButton:true,floatingStopButton:false});t.after(()=>en.dom.window.close());
  assert.ok(en.row('Floating playback controls'));assert.equal(en.row('Show stop reading button').control.value,false);
  assert.equal(en.container.querySelector('.cozy-floating-settings summary').textContent,'More floating control options');
});

test('outline pause visibility defaults to following the header and saves independently of floating controls', async t=>{
  const f=fixture(true,{floatingPauseButton:true}); t.after(()=>f.dom.window.close());
  const row=f.row('播放按钮显示方式');
  assert.equal(row.control.value,'toolbar');
  assert.deepEqual(row.control.options,{toolbar:'随顶栏自动隐藏（默认）',session:'朗读时常显'});
  assert.match(row.desc,/触屏始终可见/);
  await row.control.change('session');
  assert.equal(f.plugin.settings.miniOutlinePlaybackDisplay,'session');
  assert.equal(f.plugin.settings.floatingPauseButton,true);
  const reopened=fixture(true,f.plugin.settings); t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.row('播放按钮显示方式').control.value,'session');
  await row.control.change('toolbar');
  assert.equal(f.plugin.settings.miniOutlinePlaybackDisplay,'toolbar');
  assert.deepEqual(f.counts(),{saves:2,syncs:2});
});

test('width slider displays the saved value, applies immediately and resets to responsive defaults', async t=>{
  const f=fixture(true,{miniOutlineWidth:420}); t.after(()=>f.dom.window.close()); const row=f.row('目录宽度');
  const label=row.controlEl.querySelector('.cozy-mini-width-value');
  assert.equal(row.control.value,420); assert.equal(label.textContent,'420 px');
  assert.deepEqual(row.control.limits,{min:180,max:600,step:10}); assert.equal(row.reset.icon,'rotate-ccw');
  await row.control.change(180); assert.equal(f.plugin.settings.miniOutlineWidth,180); assert.equal(label.textContent,'180 px');
  await row.control.change(480); assert.equal(f.plugin.settings.miniOutlineWidth,480); assert.equal(label.textContent,'480 px');
  assert.deepEqual(f.counts(),{saves:2,syncs:2});
  await row.reset.click(); assert.equal(f.plugin.settings.miniOutlineWidth,0); assert.equal(label.textContent,'默认'); assert.equal(row.control.value,300);
  f.dom.window.matchMedia=()=>({matches:true}); await row.reset.click(); assert.equal(row.control.value,340);
  assert.equal(f.plugin.settings.readingFloatingAction,'from-selection');
});

test('one through four heading lines are saved without discarding preferences inside the collapsed group', async t=>{
  const initial={miniOutlineSide:'left',miniOutlineDepth:6,miniOutlineTransparent:true,miniOutlineDoubleClick:true,miniOutlineHover:true};
  const f=fixture(true,initial); t.after(()=>f.dom.window.close()); const row=f.row('标题显示行数'), advanced=f.container.querySelector('details');
  assert.equal(row.control.value,'2'); assert.deepEqual(Object.keys(row.control.options),['1','2','3','4']);
  for (const value of ['1','2','3','4']) { await row.control.change(value); assert.equal(f.plugin.settings.miniOutlineTitleLines,Number(value)); }
  advanced.open=true; advanced.open=false;
  for (const [key,value] of Object.entries(initial)) assert.equal(f.plugin.settings[key],value,key);
  assert.equal(f.row('透明背景').control.value,true); assert.equal(f.row('双击标题开始朗读').control.value,true);
  assert.deepEqual(f.counts(),{saves:4,syncs:4});
  const reopened=fixture(true,f.plugin.settings); t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.row('标题显示行数').control.value,'4'); assert.equal(reopened.container.querySelector('details').open,false);
});

test('missing Editing Toolbar retains a disabled dependency control without a misleading action selector', t=>{
  const f=fixture(false); t.after(()=>f.dom.window.close());
  assert.equal(f.row('悬浮工具栏朗读图标').control.disabled,true);
  assert.equal(f.row('悬浮图标默认动作').settingEl.hidden,true);
});

test('startup leaves the entry preference editable for manual collapse without overwriting its choice', async t=>{
  const f=fixture(true,{miniOutlineMode:'always'}); t.after(()=>f.dom.window.close());
  const startup=f.row('启动时打开迷你目录'), button=f.row('迷你目录按钮');
  assert.equal(startup.control.value,false); assert.equal(button.settingEl.hidden,false);
  await startup.control.change(true);
  assert.equal(f.plugin.settings.miniOutlineStartup,true); assert.equal(button.settingEl.hidden,false); assert.notEqual(button.control.disabled,true);
  assert.equal(f.plugin.settings.miniOutlineMode,'always'); assert.equal(button.control.value,'always');
  const reopened=fixture(true,f.plugin.settings); t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.row('启动时打开迷你目录').control.value,true); assert.equal(reopened.row('迷你目录按钮').settingEl.hidden,false);
  await startup.control.change(false);
  assert.equal(button.settingEl.hidden,false); assert.notEqual(button.control.disabled,true); assert.equal(f.plugin.settings.miniOutlineMode,'always');
  assert.deepEqual(f.counts(),{saves:2,syncs:2});
});

test('collapsed appearance saves all modes independently of icon hover and button coexistence', async t=>{
  const f=fixture(true,{miniOutlineMode:'off',miniOutlineHover:false});t.after(()=>f.dom.window.close());
  const row=f.row('收起样式');assert.equal(row.control.value,'auto');
  assert.deepEqual(row.control.options,{auto:'自动（推荐）',rail:'章节短线',icon:'目录图标'});
  for(const mode of ['rail','icon','auto']){await row.control.change(mode);assert.equal(f.plugin.settings.miniOutlineCollapsedStyle,mode);}
  assert.equal(f.plugin.settings.miniOutlineHover,false);assert.equal(f.plugin.settings.miniOutlineMode,'off');
  assert.deepEqual(f.counts(),{saves:3,syncs:3});
});
