const test=require('node:test');
const assert=require('node:assert/strict');
const { JSDOM }=require('jsdom');
const { PAGES,createSettingsPages }=require('./settings-pages');
const { LANGUAGES }=require('./i18n');
const { settingsFixture }=require('./test-helpers/settings-fixture.cjs');
const fs=require('node:fs');
const path=require('node:path');

test('settings pages use one visible panel and keyboard-accessible tabs without writing preferences',()=>{
  const dom=new JSDOM('<main></main>'),doc=dom.window.document,selected=[];
  const pages=createSettingsPages(doc.querySelector('main'),'chinese',undefined,id=>selected.push(id));
  const tabs=[...doc.querySelectorAll('[role=tab]')];
  assert.deepEqual(tabs.map(el=>el.textContent),['语音引擎','播放与界面','学术阅读','导出与存储','隐私与帮助']);
  assert.deepEqual(selected,[]);
  assert.equal(doc.querySelectorAll('[role=tabpanel]:not([hidden])').length,1);
  tabs[2].click(); assert.equal(pages.academic.hidden,false); assert.equal(pages.engine.hidden,true);
  tabs[2].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(doc.activeElement,tabs[3]); assert.equal(pages.storage.hidden,false);
  tabs[3].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal(doc.activeElement,tabs[4]);
  tabs[4].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(doc.activeElement,tabs[0]);
  assert.equal(tabs.filter(el=>el.tabIndex===0).length,1);
  for (const tab of tabs) assert.equal(doc.getElementById(tab.getAttribute('aria-controls')).getAttribute('aria-labelledby'),tab.id);
  dom.window.close();
});

test('actual settings retain all groups and place global reset last without changing secrets',async()=>{
  const {dom,doc,plugin,tab,rows}=settingsFixture();
  const group=name=>rows.find(row=>row.nameEl.textContent===name)?.settingEl.closest('[role=tabpanel]')?.dataset.settingsPage;
  assert.equal(group('Settings language'),undefined);
  for(const [name,page] of [ ['Reading method','engine'],['Allow MiMo online processing','engine'],
    ['Online synthesis prefetch','playback'],['Highlight color','playback'],['Copilot chat reading','playback'],
    ['Formula reading','academic'],['PDF footnote reading','academic'],['Overwrite original PDF for bookmarks by default','academic'],
    ['Audio export save location','storage'],['Clean temporary audio','storage'],['Clear temporary data','storage'],
    ['Diagnostic logging','privacy'],['Feedback and bug reports','privacy'],['Restore all default settings','privacy'] ]) assert.equal(group(name),page,name);
  assert.equal(doc.querySelector('[data-settings-page=privacy]').lastElementChild.querySelector('.setting-item-name').textContent,'Restore all default settings');
  assert.equal(rows.filter(row => row.nameEl.textContent === 'Restore this page defaults').length, 5);
  const before=JSON.stringify(plugin.settings);
  doc.querySelectorAll('[role=tab]')[3].click();
  assert.equal(plugin.saves,0); assert.equal(JSON.stringify(plugin.settings),before);
  const location=rows.find(row=>row.nameEl.textContent==='Audio export save location');
  await location.change('custom-folder');
  assert.equal(doc.querySelector('[role=tabpanel]:not([hidden])').dataset.settingsPage,'storage');
  assert.ok(doc.querySelector('[data-settings-page=storage]').textContent.includes('Custom audio folder'));
  plugin.settings.settingsLanguage='portuguese';tab.display();
  assert.equal(doc.querySelector('[role=tabpanel]:not([hidden])').dataset.settingsPage,'storage');
  assert.equal(doc.querySelector('[role=tab][aria-selected=true]').textContent,'Exportação e armazenamento');
  dom.window.close();
});

test('all languages and engine branches render five panels with unchanged setting values',()=>{
  for(const language of Object.keys(LANGUAGES)) for(const engine of ['local-cosyvoice','system-tts','edge-tts','azure-speech','openrouter-tts','mimo-tts','byok-tts']){
    const {dom,doc,plugin}=settingsFixture(language,engine);
    assert.equal(doc.querySelectorAll('[role=tab]').length,PAGES.length,`${language}/${engine}`);
    assert.equal(doc.querySelectorAll('[role=tabpanel]:not([hidden])').length,1);
    assert.equal(plugin.settings.speechEngine,engine);assert.equal(plugin.settings.settingsLanguage,language);
    assert.equal(plugin.saves,0);
    const privacy = doc.querySelector('[data-settings-page=privacy]');
    assert.equal(privacy.firstElementChild.querySelector('.setting-item-name').textContent,
      language === 'chinese' ? '通用隐私说明（适用于所有语音模式）' : 'General privacy (all speech engines)');
    assert.match(privacy.firstElementChild.textContent, language === 'chinese' ? /遥测/ : /telemetry/);
    dom.window.close();
  }
});

test('compact header language control saves the language and preserves the current settings page',async()=>{
  const {dom,doc,plugin}=settingsFixture('chinese');
  const header=doc.querySelector('.note-reader-settings-header');
  assert.equal(header.querySelectorAll('h2').length,1);
  assert.equal(header.querySelectorAll('.setting-item').length,0);
  const language=header.querySelector('select');
  assert.equal(language.options.length,10);
  assert.equal(language.getAttribute('aria-label'),'设置语言');
  assert.equal(language.title,'设置语言');
  doc.querySelectorAll('[role=tab]')[2].click();
  const before=JSON.stringify({...plugin.settings,settingsLanguage:'portuguese'});
  language.value='portuguese';
  language.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(plugin.saves,1);
  assert.equal(JSON.stringify(plugin.settings),before);
  assert.equal(doc.querySelector('[role=tabpanel]:not([hidden])').dataset.settingsPage,'academic');
  assert.equal(doc.querySelector('.note-reader-settings-language').value,'portuguese');
  const note=[...doc.querySelectorAll('.setting-item-description')].find(el=>el.textContent.includes('Algumas instruções avançadas'));
  assert.equal(note.closest('[role=tabpanel]').dataset.settingsPage,'privacy');
  dom.window.close();
});

test('settings tabs stay in normal scroll flow instead of overlaying content; header can wrap',()=>{
  const {dom,doc}=settingsFixture();
  const style=doc.createElement('style');
  style.textContent=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');doc.head.append(style);
  assert.equal(dom.window.getComputedStyle(doc.querySelector('.note-reader-settings-tabs')).position,'static');
  assert.equal(dom.window.getComputedStyle(doc.querySelector('.note-reader-settings-header')).flexWrap,'wrap');
  assert.equal(doc.querySelectorAll('.note-reader-settings-header').length,1);
  dom.window.close();
});

test('privacy page omits editorial and playback clutter and describes only its own reset', async () => {
  const { dom, doc, plugin, rows, modals } = settingsFixture('chinese');
  try {
    const panel = doc.querySelector('[data-settings-page=privacy]');
    assert.doesNotMatch(panel.textContent, /不能宣称|命令还包括/);
    const reset = rows.find(row => row.nameEl.textContent === '恢复本页默认设置' && row.settingEl.closest('[role=tabpanel]') === panel);
    assert.equal(reset.descEl.textContent, '关闭诊断日志，不影响其他页面设置。');
    plugin.runUserAction = async (_title, action) => action();
    const changes = [];
    plugin.resetSettingsToDefaults = async page => changes.push(page);
    reset.click();
    assert.match(modals.at(-1).contentEl.textContent, /关闭诊断日志，不影响其他页面设置/);
    assert.doesNotMatch(modals.at(-1).contentEl.textContent, /历史模式|合成相关/);
    await rows.at(-1).click();
    assert.deepEqual(changes, ['privacy']);
  } finally { dom.window.close(); }
});
