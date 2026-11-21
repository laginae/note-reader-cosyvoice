'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { loadInitialPreferences: load, savePreferences: save } = require('./preferences-storage');
function fixture(value, exists=false) {
  const p={ disk:value, writes:0, app:{vault:{configDir:'.example',adapter:{exists:async file=>{
    assert.equal(file,'.example/plugins/sample/data.json'); return exists;
  }}}},manifest:{id:'sample'} };
  p.loadData=async()=>structuredClone(p.disk);
  p.saveData=async data=>{p.writes++;p.disk=structuredClone(data);};
  return p;
}
test('empty or malformed existing preferences never get overwritten even on a later save',async()=>{
  for(const data of [null,{},[],false]) {
    const p=fixture(data,true); await assert.rejects(()=>load(p)); await assert.rejects(()=>save(p,{})); assert.equal(p.writes,0);
  }
  const p=fixture(null); p.loadData=async()=>{throw Error('read failed');}; await assert.rejects(()=>load(p)); await assert.rejects(()=>save(p,{}));
});
test('fresh settings stay unwritten until first save and cannot overwrite a restored file',async()=>{
  const p=fixture(null); assert.equal(await load(p),null); assert.equal(p.writes,0);
  p.disk={settingsLanguage:'chinese',miniOutlineTransparent:true}; await assert.rejects(()=>save(p,{})); assert.equal(p.writes,0);
  const n=fixture(null); await load(n); await save(n,{readingProfile:'everyday'}); await save(n,{readingProfile:'study'}); assert.equal(n.disk.readingProfile,'study');
});
