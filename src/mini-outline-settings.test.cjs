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
  const advanced=f.container.querySelector('details'); assert.equal(advanced.open,false);
  for (const name of ['目录位置','默认展开层级','透明背景','双击标题开始朗读','鼠标悬停展开目录']) assert.ok(advanced.contains(f.row(name).settingEl),name);
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

test('width slider displays the saved value, applies immediately and resets to responsive defaults', async t=>{
  const f=fixture(true,{miniOutlineWidth:420}); t.after(()=>f.dom.window.close()); const row=f.row('目录宽度');
  const label=row.controlEl.querySelector('.cozy-mini-width-value');
  assert.equal(row.control.value,420); assert.equal(label.textContent,'420 px');
  assert.deepEqual(row.control.limits,{min:260,max:600,step:10}); assert.equal(row.reset.icon,'rotate-ccw');
  await row.control.change(480); assert.equal(f.plugin.settings.miniOutlineWidth,480); assert.equal(label.textContent,'480 px');
  assert.deepEqual(f.counts(),{saves:1,syncs:1});
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

test('startup preference hides the edge-button setting without overwriting its saved choice', async t=>{
  const f=fixture(true,{miniOutlineMode:'always'}); t.after(()=>f.dom.window.close());
  const startup=f.row('启动时打开迷你目录'), button=f.row('迷你目录按钮');
  assert.equal(startup.control.value,false); assert.equal(button.settingEl.hidden,false);
  await startup.control.change(true);
  assert.equal(f.plugin.settings.miniOutlineStartup,true); assert.equal(button.settingEl.hidden,true); assert.equal(button.control.disabled,true);
  assert.equal(f.plugin.settings.miniOutlineMode,'always'); assert.equal(button.control.value,'always');
  const reopened=fixture(true,f.plugin.settings); t.after(()=>reopened.dom.window.close());
  assert.equal(reopened.row('启动时打开迷你目录').control.value,true); assert.equal(reopened.row('迷你目录按钮').settingEl.hidden,true);
  await startup.control.change(false);
  assert.equal(button.settingEl.hidden,false); assert.equal(button.control.disabled,false); assert.equal(f.plugin.settings.miniOutlineMode,'always');
  assert.deepEqual(f.counts(),{saves:2,syncs:2});
});
