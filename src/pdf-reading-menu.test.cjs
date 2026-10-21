const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {registerPdfReadingMenu,pointContext,pdfSentenceStart}=require('./pdf-reading-menu');

function fixture() {
  const dom=new JSDOM('<div id="root"><div class="page" data-page-number="2"><div class="textLayer"><span>First sentence. Next sentence.</span></div><canvas></canvas></div></div><div id="outside">Other pane</div>');
  const doc=dom.window.document,root=doc.querySelector('#root'),span=root.querySelector('span'),page=root.querySelector('.page');
  const rect={left:320,top:100,right:520,bottom:112,width:200,height:12};
  span.getBoundingClientRect=()=>rect;
  page.getBoundingClientRect=()=>({left:0,top:0,right:600,bottom:800,width:600,height:800});
  doc.caretRangeFromPoint=()=>{const r=doc.createRange();r.setStart(span.firstChild,21);r.collapse(true);return r;};
  dom.window.Range.prototype.getClientRects=function(){return [{left:320+this.startOffset*5,right:320+this.endOffset*5,top:100,bottom:112}];};
  const file={path:'example.pdf',extension:'pdf',stat:{mtime:5}},view={file,containerEl:root};
  let leaves=[{view}],selection=null;
  const cleanup=[],handlers={},calls=[],notices=[];
  const plugin={settings:{settingsLanguage:'chinese'},app:{workspace:{getLeavesOfType:()=>leaves,
    on(name,fn){handlers[name]=fn;return fn;},onLayoutReady(fn){fn();}}},register(fn){cleanup.push(fn);},registerEvent(){}};
  class Menu {
    constructor(){this.items=[{title:'Copy'}];this.shown=0;}
    addItem(fn){const item={setSection(){return this;},setTitle(v){this.title=v;return this;},setIcon(){return this;},onClick(f){this.click=f;return this;}};fn(item);this.items.push(item);return this;}
    showAtMouseEvent(){this.shown++;return 'shown';}
  }
  const original=Menu.prototype.showAtMouseEvent;
  registerPdfReadingMenu(plugin,Menu,()=>selection,s=>calls.push(s),s=>notices.push(s));
  const open=(target=span,x=427,y=106)=>{const event=new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:x,clientY:y});target.dispatchEvent(event);const menu=new Menu();menu.showAtMouseEvent(event);return menu;};
  return {dom,doc,span,root,view,file,plugin,Menu,original,open,calls,notices,
    select(v){selection=v;},close(){leaves=[];handlers['layout-change']();},unload(){cleanup.forEach(fn=>fn());}};
}

test('PDF point menu extends original items and captures a stable word anchor',()=>{
  const f=fixture(),menu=f.open();
  assert.deepEqual(menu.items.map(i=>i.title),['Copy','从此处开始朗读']);
  menu.items[1].click();
  assert.equal(f.calls[0].context.selectedText,'sentence.');
  assert.equal(f.calls[0].context.pageNumber,2);
  assert.equal(f.calls[0].context.sentenceStart,true);
  assert.ok(f.calls[0].context.selectionPosition.xRatio>.5);
  assert.equal(menu.shown,1);f.unload();f.dom.window.close();
});
test('selected-text menu freezes its scope and offers both reading actions',()=>{
  const f=fixture(),context={filePath:f.file.path,pageNumber:2,selectedText:'Selected text',selectionLayout:[{items:[]}]};
  f.select(context);const menu=f.open();f.select(null);
  assert.equal(menu.items.length,3);menu.items[1].click();menu.items[2].click();
  assert.equal(f.calls[0].context.selectedText,'Selected text');
  assert.equal(f.calls[0].selection,false);assert.equal(f.calls[1].selection,true);
  assert.notEqual(f.calls[0].context.sentenceStart,true);f.unload();f.dom.window.close();
});
test('blank space, images, other panes and disabled menus remain untouched',()=>{
  const f=fixture();
  assert.equal(f.open(f.root.querySelector('canvas')).items.length,1);
  assert.equal(f.open(f.doc.querySelector('#outside')).items.length,1);
  assert.equal(f.open(f.span,580,106).items.length,1);
  f.plugin.settings.readingContextMenu=false;assert.equal(f.open().items.length,1);
  f.unload();f.dom.window.close();
});
test('PDF overlays use character geometry when the browser cannot return a text caret',()=>{
  const f=fixture();f.doc.caretRangeFromPoint=()=>null;
  assert.equal(f.open().items.length,2);
  assert.equal(f.open(f.span,421,106).items.length,1);
  f.unload();f.dom.window.close();
});
test('changed files, closed panes and toggles invalidate stale menu actions',()=>{
  for(const change of ['mtime','path','close','disabled']) {
    const f=fixture(),menu=f.open();
    if(change==='mtime')f.file.stat.mtime++;
    if(change==='path')f.file.path='renamed.pdf';
    if(change==='close')f.close();
    if(change==='disabled')f.plugin.settings.readingContextMenu=false;
    menu.items[1].click();assert.equal(f.calls.length,0);
    if(change!=='disabled')assert.equal(f.notices.length,1);
    f.unload();f.dom.window.close();
  }
});
test('unload restores menu hooks without removing another extension',()=>{
  const f=fixture();f.unload();assert.equal(f.Menu.prototype.showAtMouseEvent,f.original);f.dom.window.close();
  const g=fixture(),ours=g.Menu.prototype.showAtMouseEvent;
  function later(...args){return ours.apply(this,args);}
  g.Menu.prototype.showAtMouseEvent=later;g.unload();assert.equal(g.Menu.prototype.showAtMouseEvent,later);
  assert.equal(g.open().items.length,1);g.dom.window.close();
});
test('sentence alignment spans wrapped lines but never rewinds into the other column',()=>{
  const page='Left column has no terminator Right sentence wraps across a line. Another sentence.';
  const a=page.indexOf('Right'),b=page.indexOf('across');
  const mapped={text:page,lines:[
    {normalizedStart:0,normalizedEnd:a-1,xMin:30,xMax:270,y:600,height:12},
    {normalizedStart:a,normalizedEnd:b-1,xMin:320,xMax:550,y:700,height:12},
    {normalizedStart:b,normalizedEnd:page.length,xMin:320,xMax:550,y:684,height:12}]};
  assert.equal(pdfSentenceStart(page,page.indexOf('line'),mapped),a);
  assert.equal(pdfSentenceStart(page,page.indexOf('sentence.',b)+3,mapped),page.indexOf('Another'));
});
