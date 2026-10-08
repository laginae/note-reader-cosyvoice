const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function settingsFixture(language = 'english', engine = 'mimo-tts', overrides = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>');
  const doc = dom.window.document, rows = [], modals = [];
  const proto = dom.window.HTMLElement.prototype;
  proto.empty = function() { this.replaceChildren(); };
  proto.addClass = function(name) { this.classList.add(name); };
  proto.createEl = function(tag, options = {}) {
    const el = doc.createElement(tag);
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    for (const [key,value] of Object.entries(options.attr || {})) el.setAttribute(key,value);
    this.append(el); return el;
  };
  proto.createDiv = function(options) { return this.createEl('div',options); };
  proto.createSpan = function(options) { return this.createEl('span',options); };
  class Setting {
    constructor(parent) {
      this.settingEl=parent.createDiv({cls:'setting-item'});
      this.infoEl=this.settingEl.createDiv({cls:'setting-item-info'});
      this.nameEl=this.infoEl.createDiv({cls:'setting-item-name'});
      this.descEl=this.infoEl.createDiv({cls:'setting-item-description'});
      this.controlEl=this.settingEl.createDiv({cls:'setting-item-control'}); rows.push(this);
    }
    setName(value) { this.nameEl.textContent=value; return this; }
    setDesc(value) { this.descEl.textContent=value; return this; }
    setClass(value) { this.settingEl.classList.add(value); return this; }
    component(tag, type, callback) {
      const el=this.controlEl.createEl(tag); if(type)el.type=type;
      const c={inputEl:el,buttonEl:el,selectEl:el,
        setValue:v=>{if(type==='checkbox')el.checked=v;else el.value=v;return c;},
        setPlaceholder:v=>{el.placeholder=v;return c;},
        setButtonText:v=>{el.textContent=v;return c;},setTooltip:v=>{el.title=v;return c;},
        setIcon:v=>{el.dataset.icon=v;return c;},
        setDisabled:v=>{el.disabled=v;return c;},setWarning:()=>{el.classList.add('mod-warning');return c;},
        setDynamicTooltip:()=>c,setLimits:(a,b,step)=>{el.min=a;el.max=b;el.step=step;return c;},
        addOption:(id,label)=>{const o=doc.createElement('option');o.value=id;o.textContent=label;el.append(o);return c;},
        onChange:fn=>{this.change=fn;return c;},onClick:fn=>{this.click=fn;el.onclick=fn;return c;}};
      callback(c); return this;
    }
    addText(fn) { return this.component('input','text',fn); }
    addTextArea(fn) { return this.component('textarea','',fn); }
    addDropdown(fn) { return this.component('select','',fn); }
    addButton(fn) { return this.component('button','button',fn); }
    addExtraButton(fn) { return this.component('button','button',fn); }
    addComponent(fn) { fn(this.controlEl); return this; }
    addToggle(fn) { return this.component('input','checkbox',fn); }
    addSlider(fn) { return this.component('input','range',fn); }
    addColorPicker(fn) { return this.component('input','color',fn); }
  }
  class SecretComponent {
    constructor(app, element) { this.el = element.createEl('input'); }
    setValue(value) { this.el.value = value; return this; }
    onChange(action) { rows.at(-1).change = action; return this; }
  }
  const loaded={exports:{}};
  new Function('require','module','exports',fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8'))(
    name=>name==='obsidian'?{Setting,SecretComponent,Plugin:class{},ItemView:class{},Modal:class{
      constructor(){ this.contentEl=doc.createElement('section');modals.push(this); }
      open(){ this.onOpen(); }
      close(){ this.closed=true;this.onClose?.(); }
    },Notice:class{},
      PluginSettingTab:class{constructor(app){this.app=app;this.containerEl=doc.querySelector('main');}}}:require(name),loaded,loaded.exports);
  const api=loaded.exports.__test;
  const app = { secretStorage: { getSecret: () => 'fake-test-key' } };
  const plugin={app,settings:{...api.createDefaultSettings(),settingsLanguage:language,speechEngine:engine,...overrides},
    saveSettings:async()=>{plugin.saves++;},saves:0,renderReaderViews(){},renderDocumentViews(){},
    systemVoicesReady:true,systemVoices:[],documentViews:[]};
  for (const method of ['isSettingsPreviewBusy','runSettingsPreview','stopSettingsPreview','getSpeechConfiguration','startReading']) {
    plugin[method] = loaded.exports.default.prototype[method].bind(plugin);
  }
  const tab=new api.CosyVoiceReaderSettingTab(app,plugin);
  tab.display();
  return {dom,doc,plugin,tab,rows,modals,pluginClass:loaded.exports.default,api,Setting,SecretComponent};
}
module.exports={settingsFixture};
