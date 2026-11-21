'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const { settingsFixture }=require('./test-helpers/settings-fixture.cjs');
test('desktop OCR downloads are official, user-initiated and platform/version specific',t=>{
  const {dom,doc,plugin,tab}=settingsFixture('chinese'); t.after(()=>dom.window.close());
  plugin.manifest={id:'note-reader-cosyvoice',version:'1.8.0'};tab.display();
  const links=[...doc.querySelectorAll('a')].map(a=>a.href);
  assert.ok(links.includes('https://github.com/laginae/note-reader-cosyvoice/blob/1.8.0/docs/local-ocr.zh-CN.md'));
  const m={exports:{}};new Function('module','require',require('node:fs').readFileSync(require.resolve('./ocr-entry'),'utf8'))(m,()=>({}));
  const get=m.exports.ocrInstallLinks;
  assert.match(get('1.8.0','win32','x64',false).download,/releases\/download\/1\.8\.0\/cozy-ocr-helper-windows-x64\.zip$/);
  for(const [platform,arch] of [['darwin','arm64'],['linux','x64'],['win32','arm64']]) {
    assert.equal(get('1.8.0',platform,arch,false).windows,false);assert.match(get('1.8.0',platform,arch,false).download,/archive\/refs\/tags\/1\.8\.0\.zip$/);
  }
  assert.match(get('../other','win32','x64',false).download,/\/releases$/);assert.equal(plugin.settings.ocrEnabled,false);assert.equal(plugin.saves,0);
});
test('desktop settings switch profiles without changing individual preferences or starting speech',async t=>{
  const {dom,doc,rows,plugin}=settingsFixture('chinese','mimo-tts',{ readingProfile:'custom',academicFunctionStyle:'compact',academicIntervalStyle:'range',academicTableRepeatHeaders:false,miniOutlineTransparent:true });
  t.after(()=>dom.window.close());
  const row=name=>rows.findLast(r=>r.nameEl.textContent===name);
  const snapshot=()=>JSON.stringify(Object.entries(plugin.settings).filter(([key])=>key!=='readingProfile'));
  const before=snapshot(); assert.equal(plugin.saves,0);
  for(const profile of ['everyday','study','custom']) {
    await row('朗读方式').change(profile); assert.equal(plugin.settings.readingProfile,profile); assert.equal(snapshot(),before);
    assert.equal([...doc.querySelectorAll('.setting-item-name')].some(el=>el.textContent==='每行重复表头'),profile==='custom');
  }
});
test('desktop migrates only in memory when just the profile is missing; fresh loads do not save', async t=>{
  const {dom,pluginClass,api}=settingsFixture(); t.after(()=>dom.window.close());
  const p=Object.create(pluginClass.prototype); let disk=null,writes=0;
  p.loadData=async()=>structuredClone(disk); p.saveData=async v=>{disk=structuredClone(v);writes++;};
  await p.loadSettings(); assert.equal(p.settings.readingProfile,'everyday'); assert.equal(writes,0);
  disk={...api.createDefaultSettings(),settingsLanguage:'chinese',miniOutlineTransparent:true,academicIntervalStyle:'range',academicFunctionStyle:'compact',academicTableRepeatHeaders:false}; delete disk.readingProfile;
  await p.loadSettings(); assert.equal(writes,0);assert.equal(p.settings.readingProfile,'custom');assert.equal(p.settings.miniOutlineTransparent,true);
  assert.equal(p.settings.academicIntervalStyle,'range');assert.equal(p.settings.academicFunctionStyle,'compact');assert.equal(p.settings.academicTableRepeatHeaders,false);
});
