'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { desktopMiniAdapter } = require('./mini-outline-adapter');
const { PdfOutlineCache } = require('./pdf-outline-cache');
function fixture() {
  const calls = [], file = {path:'public-example.md',extension:'md',stat:{mtime:1,size:100}};
  const text = '# One\nPublic introduction.\n## Child\nPublic detail.\n# Two\nPublic conclusion.';
  const headings = [...text.matchAll(/^(#+) (.+)$/gm)].map(m => ({heading:m[2],level:m[1].length,position:{start:{offset:m.index,line:text.slice(0,m.index).split('\n').length-1},end:{offset:m.index+m[0].length}}}));
  const view = {file,editor:{getValue:()=>text,offsetToPos:offset=>({line:offset,ch:0}),scrollIntoView:range=>calls.push(['locate',range])}};
  view.leaf={view};
  const plugin = {settings:{},app:{workspace:{revealLeaf:async leaf=>calls.push(['reveal',leaf]),getLeavesOfType:type=>type==='markdown'?[view.leaf]:[]},metadataCache:{getFileCache:()=>({headings})}},
    startReading:async (...args)=>calls.push(['read',...args]),readCurrentPdf:async (...args)=>calls.push(['pdf',...args])};
  return {adapter:desktopMiniAdapter(plugin),plugin,view,file,text,calls};
}
test('Markdown titles navigate only; section audio includes descendants and rejects edited source', async () => {
  const f=fixture(), data=await f.adapter.load(f.view,()=>false);
  assert.equal(data.entries.length,3); await f.adapter.locate(f.view,data,1);
  assert.equal(f.calls.some(c=>c[0]==='read'),false);
  await f.adapter.read(f.view,data,0,false); assert.equal(f.calls.at(-1)[1],f.text.slice(0,f.text.indexOf('# Two')));
  assert.equal(f.calls.at(-1)[3].sourceOffset,0);
  f.view.editor.getValue=()=>f.text+'\nNew edit'; assert.equal(f.adapter.valid(f.view,data),false);
  await assert.rejects(f.adapter.read(f.view,data,0,true));
});
test('HTML duplicate headings locate by element and a renamed target cannot be reused', async t => {
  const f=fixture(), dom=new JSDOM('<h1>Overview</h1><p>First public text.</p><h1>Overview</h1><p>Second public text.</p>');t.after(()=>dom.window.close());
  f.file.extension='html'; f.view.mainView={iframe:{contentDocument:dom.window.document}};
  const data=await f.adapter.load(f.view,()=>false); assert.equal(data.entries.length,2);
  await f.adapter.read(f.view,data,1,false); assert.match(f.calls.at(-1)[1],/Second public/); assert.doesNotMatch(f.calls.at(-1)[1],/First public/);
  data.entries[1].element.textContent='Changed'; assert.equal(f.adapter.valid(f.view,data),false);
});
test('PDF reuses bounded outline cache without reading bytes, and cancelled loads return no data', async () => {
  const f=fixture(); f.file.extension='pdf'; f.plugin.pdfOutlineCache=new PdfOutlineCache();
  const entries=[{title:'Overview',level:1,page:1,offset:0,x:24,y:500}];
  f.plugin.pdfOutlineCache.set(f.file,{model:{entries,pages:[{number:1,text:'A public paragraph.',lines:[]}]},entries});
  const data=await f.adapter.load(f.view,()=>false); assert.equal(data.kind,'pdf'); assert.equal(data.entries[0].title,'Overview');
  f.view.viewer={child:{pdfViewer:{scrollPageIntoView:args=>f.calls.push(['pdf-locate',args])}}};
  await f.adapter.locate(f.view,data,0); assert.equal(f.calls.at(-1)[1].pageNumber,1);
  assert.equal(await f.adapter.load(f.view,()=>true),null);
  f.file.stat.mtime++; assert.equal(f.adapter.valid(f.view,data),false);
});

test('edge navigation uses the active source and rejects cancelled or changed targets after revealing its pane', async () => {
  const f=fixture(),data=await f.adapter.load(f.view,()=>false),scrolls=[];
  f.view.editor.scrollIntoView=range=>scrolls.push(range);
  await f.adapter.locateEdge(f.view,data,false);await f.adapter.locateEdge(f.view,data,true);
  assert.equal(scrolls.length,2);assert.equal(f.calls.some(call=>call[0]==='read'),false);
  let cancelled=false;f.plugin.app.workspace.revealLeaf=async()=>{cancelled=true;};
  await f.adapter.locateEdge(f.view,data,true,()=>cancelled);assert.equal(scrolls.length,2);
  f.plugin.app.workspace.revealLeaf=async()=>{f.view.file={...f.file,path:'replacement-public.md'};};
  await assert.rejects(f.adapter.locateEdge(f.view,data,true));assert.equal(scrolls.length,2);
});

test('explicit document navigation pauses only document auto-follow, not speech playback', () => {
  const f=fixture();f.plugin.settings.readingFollow=true;
  const session=f.plugin.activeSession={kind:'reading',paused:false};
  f.adapter.pauseFollow(f.view);
  assert.equal(f.plugin.readingFollowPaused.has('readingFollow'),true);
  assert.equal(f.plugin.activeSession,session);assert.equal(session.paused,false);
});
