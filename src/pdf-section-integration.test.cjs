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

test('PDF footnote modes apply equally to complete text and progressive page output', async () => {
  const item = (str, x, y, height = 10) => ({ str, width: 220, height, transform: [height, 0, 0, height, x, y] });
  const items = [item('Body opening.', 40, 650), item('Body continues.', 40, 220), item('2 Saved footnote.', 40, 135, 9), item('Footnote ending.', 40, 122, 9)];
  pdf = { numPages: 2, getPage: async () => ({ getTextContent: async () => ({ items }), getViewport: () => ({ width: 600, height: 800 }), cleanup() {} }), destroy: async () => {} };
  const plugin = Object.create(loaded.exports.default.prototype);
  const file = { extension: 'pdf', path: 'public.pdf', stat: { size: 100, mtime: 1 } };
  plugin.app = { vault: { readBinary: async () => new ArrayBuffer(0) } }; plugin.isActive = () => true;
  for (const mode of ['body', 'after', 'inline', 'footnotes']) {
    plugin.settings = { pdfFootnoteMode: mode };
    const streamed = [];
    const result = await plugin.extractPdfText(file, {}, { reportProgress: false, onPageText: async (text, info) => streamed.push({ text, ...info }) });
    assert.equal(result, streamed.map(page => page.text.trim()).filter(Boolean).join('\n\n'));
    assert.equal(result.includes('Saved footnote'), mode !== 'body');
    assert.equal(result.includes('Body opening'), mode !== 'footnotes');
    if (mode === 'after') {
      assert.deepEqual(streamed.map(page => [page.pageNumber, page.footnote]), [[1, false], [2, false], [1, true], [2, true]]);
      assert.ok(streamed.slice(0, 2).every(page => !page.text.includes('footnote')));
    }
  }
});

test('PDF body, glossary and footnote scopes preserve filtering, progress metadata and settings', async () => {
  const item=(str,x,y,height=10,width=220)=>({str,width,height,transform:[height,0,0,height,x,y]});
  const items=[item('A. Author et al.',40,760,8),item('Glossary',40,700),item('AC Alternating current',40,680),item('DC Direct current',40,660),
    item('Left body after glossary.',40,600),item('Right body paragraph.',320,690),
    item('2 Saved footnote.',40,135,9),item('Footnote ending.',40,122,9),item('2',290,20,8,8)];
  pdf={numPages:3,getPage:async()=>({getTextContent:async()=>({items}),getViewport:()=>({width:600,height:800}),cleanup(){}}),destroy:async()=>{}};
  const plugin=Object.create(loaded.exports.default.prototype);
  const file={extension:'pdf',path:'public.pdf',stat:{size:100,mtime:1}};
  plugin.app={vault:{readBinary:async()=>new ArrayBuffer(0)}};plugin.isActive=()=>true;
  plugin.settings={pdfSkipHeaders:true,pdfIncludeGlossary:false,pdfFootnoteMode:'body'};
  const initial=JSON.stringify(plugin.settings);
  for(const scope of ['body','glossary','footnotes']) {
    const session={kind:'pdf-progressive'},streamed=[];
    const text=await plugin.extractPdfText(file,session,{reportProgress:false,contentScope:scope,onPageText:async(text,info)=>streamed.push({text,...info})});
    assert.equal(text,streamed.map(p=>p.text.trim()).filter(Boolean).join('\n\n'));
    assert.ok(!text.includes('A. Author'));
    assert.equal(text.includes('Alternating current'),scope==='glossary');
    assert.equal(text.includes('Left body after'),scope==='body');
    assert.equal(text.includes('Right body paragraph'),scope==='body');
    assert.equal(text.includes('Saved footnote'),scope==='footnotes');
    assert.ok(streamed.every(p=>p.footnote===(scope==='footnotes')));
    assert.equal(session.pdfHighlightPages.get(1).contentScope,scope);
    assert.equal(JSON.stringify(plugin.settings),initial);
  }
  plugin.settings.pdfIncludeGlossary=true;plugin.settings.pdfSkipHeaders=false;
  const all=await plugin.extractPdfText(file,{}, {reportProgress:false});
  assert.ok(all.includes('Alternating current'));assert.ok(all.includes('A. Author'));
  plugin.settings.pdfIncludeGlossary=false;
  const selected=await plugin.extractPdfText(file,{}, {reportProgress:false,selectedText:'Left body after glossary.',startPageNumber:1});
  assert.ok(selected.startsWith('Left body after glossary.'));assert.ok(selected.includes('Right body paragraph'));
  assert.ok(!selected.includes('Alternating current'));
});
