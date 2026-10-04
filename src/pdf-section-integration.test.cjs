const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loaded={exports:{}};let pdf;
new Function('require','module','exports',fs.readFileSync(`${__dirname}/../main.js`,'utf8'))(
  name=>name==='obsidian'?{Plugin:class{},ItemView:class{},Modal:class{},PluginSettingTab:class{},Setting:class{},Notice:class{},
    loadPdfJs:async()=>({getDocument:()=>({promise:Promise.resolve(pdf)})})}:require(name),loaded,loaded.exports);
test('PDF section extraction respects exact same-page and cross-page boundaries without TTS',async()=>{
  const plugin=Object.create(loaded.exports.default.prototype), requested=[];
  const file={extension:'pdf',path:'public.pdf',stat:{size:100,mtime:1}};
  plugin.app={vault:{readBinary:async()=>new ArrayBuffer(0)}};
  const texts=['Before. Chapter one. End one. Chapter two.','Second page. Ending.','Not included.'];
  pdf={numPages:3,getPage:async n=>{requested.push(n);return {getTextContent:async()=>({items:[{str:texts[n-1]}]}),cleanup(){}};},destroy:async()=>{}};
  plugin.isActive=()=>true;
  plugin.updateStatus=()=>assert.fail('Outline extraction must not change playback status in this test');
  const session={};
  const result=await plugin.extractPdfText(file,session,{reportProgress:false,startPageNumber:1,
    outlineRange:{startPage:1,startOffset:8,endPage:1,endOffset:29,fileMtime:1}});
  assert.equal(result,'Chapter one. End one.');assert.deepEqual(requested,[1]);
  requested.length=0;
  const cross=await plugin.extractPdfText(file,session,{reportProgress:false,startPageNumber:1,
    outlineRange:{startPage:1,startOffset:29,endPage:2,endOffset:12,fileMtime:1}});
  assert.ok(cross.includes('Chapter two.'));assert.ok(cross.includes('Second page.'));assert.ok(!cross.includes('Ending.'));
  assert.deepEqual(requested,[1,2]);
});
