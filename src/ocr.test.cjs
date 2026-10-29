const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { JSDOM } = require('jsdom');
const { OCR_DEFAULTS, pageRange, rasterSize, validateResult, imageSize, isOcrFile } = require('./ocr-contract');
const { OcrProcess } = require('./ocr-process');
const executable = path.resolve('test-helper.exe');
function fakeProcess() {
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kills: 0, kill() { this.kills++; } });
  return child;
}
function payload(text = 'Public library example.') { return { version: 1, width: 10, height: 10, lines: [{ text, confidence: .95, box: [0,0,9,9] }] }; }

test('OCR is opt-in, bounded and accepts only text-image formats', () => {
  assert.equal(OCR_DEFAULTS.ocrEnabled, false);
  assert.deepEqual(pageRange('2', '4', 9), [2,3,4]);
  for (const range of [[0,1,10],[1,11,20],[1.5,2,10],[2,1,10],[1,3,2]]) assert.throws(() => pageRange(...range), /OCR_RANGE/);
  const size = rasterSize(10000,10000); assert.ok(size.width * size.height <= 4_000_000);
  assert.equal(isOcrFile({ extension: 'svg' }), false); assert.equal(isOcrFile({ extension: 'PNG' }), true);
  assert.throws(() => new OcrProcess('helper.cmd','tiny'), /OCR_PATH/);
  assert.throws(() => new OcrProcess('\\\\host\\helper.exe','tiny'), /OCR_PATH/);
});
test('reject malformed, oversized and invalid image headers before decode', () => {
  const b = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.write('IHDR',12); b.writeUInt32BE(1200,16); b.writeUInt32BE(1600,20);
  assert.deepEqual(imageSize(b), { width: 1200, height: 1600 });
  b.writeUInt32BE(100000,16); assert.throws(() => imageSize(b), /OCR_IMAGE/);
  assert.throws(() => imageSize(Buffer.from('<svg/>')), /OCR_IMAGE/);
});
test('OCR helper response rejects unbounded text and invalid coordinates', () => {
  assert.equal(validateResult(payload(),10,10).lines.length,1);
  for (const invalid of [{...payload(), width:9}, {...payload(),lines:[{...payload().lines[0],box:[0,0,11,9]}]}, payload('a'.repeat(200001))]) assert.throws(() => validateResult(invalid,10,10), /OCR_PROTOCOL/);
});
test('helper starts lazily, reuses one process serially and never uses a shell', async () => {
  const child = fakeProcess(); let starts=0, args, options;
  const helper = new OcrProcess(executable,'small',{ spawn: (_exe,a,o) => { starts++; args=a; options=o; return child; } });
  assert.equal(starts,0);
  for (let i=0;i<2;i++) {
    const promise=helper.recognize(Buffer.alloc(300),10,10);
    await assert.rejects(helper.recognize(Buffer.alloc(300),10,10), /OCR_BUSY/);
    const response=JSON.stringify(payload())+'\n'; child.stdout.write(response.slice(0,20)); child.stdout.write(response.slice(20));
    assert.equal((await promise).lines[0].text,'Public library example.');
  }
  assert.equal(starts,1); assert.equal(options.shell,false); assert.equal(options.windowsHide,true);
  assert.deepEqual(args,['--model','small']); assert.equal(options.env.DOTNET_PROCESSOR_COUNT,'4');
  helper.close(); assert.equal(child.kills,1);
});
test('abort and timeout kill helper, discard late text, and reject pending work', async () => {
  for (const timeout of [false,true]) {
    const child=fakeProcess(), helper=new OcrProcess(executable,'tiny',{spawn:()=>child,timeout:10}), controller=new AbortController();
    const pending=helper.recognize(Buffer.alloc(300),10,10,controller.signal);
    if (!timeout) controller.abort();
    await assert.rejects(pending,timeout ? /OCR_TIMEOUT/ : /OCR_CANCELLED/);
    child.stdout.write(JSON.stringify(payload())+'\n'); assert.equal(child.kills,1);
    await assert.rejects(helper.recognize(Buffer.alloc(300),10,10),/OCR_CANCELLED/);
  }
});
test('malformed responses and process errors never expose native diagnostic text', async () => {
  for (const mode of ['bad-json','exit','error']) {
    const child=fakeProcess(), helper=new OcrProcess(executable,'small',{spawn:()=>child});
    const pending=helper.recognize(Buffer.alloc(300),10,10);
    child.stderr.write('Sensitive native diagnostic');
    if (mode==='bad-json') child.stdout.write('not json\n'); else child.emit(mode,new Error('Sensitive native diagnostic'));
    await assert.rejects(pending,/^Error: OCR_(PROTOCOL|HELPER)$/);
  }
});

function loadWithObsidian(file, mock) {
  const old=Module._load;
  Module._load=function(name,parent,main) { return name==='obsidian' ? mock : old.call(this,name,parent,main); };
  try { delete require.cache[require.resolve(file)]; return require(file); } finally { Module._load=old; }
}
test('OCR layout reads left column before right column and keeps Chinese prose', () => {
  const { ocrText }=loadWithObsidian('./ocr-pages',{loadPdfJs(){}});
  const lines=[['Right one.',330,60],['Left one.',50,60],['Right two.',330,100],['Left two.',50,100]]
    .map(([text,x,y])=>({text,confidence:.99,box:[x,y,x+180,y+12]}));
  const text=ocrText({width:600,height:900,lines},{});
  assert.ok(text.indexOf('Left two.')<text.indexOf('Right one.'));
  assert.equal(ocrText({width:600,height:900,lines:[{text:'图书馆今日开放。',box:[20,20,200,40],confidence:.99}]},{}).trim(),'图书馆今日开放。');
});
test('PDF range uses existing text without starting OCR, and releases documents', async () => {
  let destroyed=0,cleaned=0,ocr=0;
  const items=[{str:'The public library welcomes visitors. Reading rooms are open today and staff can help with finding books and newspapers.',width:500,height:12,transform:[12,0,0,12,20,400]}];
  const page={getTextContent:async()=>({items}),getViewport:()=>({width:600,height:800}),cleanup:()=>cleaned++};
  const { recognizeFile }=loadWithObsidian('./ocr-pages',{loadPdfJs:async()=>({getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async()=>page}),destroy:async()=>destroyed++})})});
  const dom=new JSDOM(), file={path:'public.pdf',extension:'pdf',stat:{size:100,mtime:1}},results=[];
  await recognizeFile({plugin:{settings:{},app:{vault:{getAbstractFileByPath:()=>file,readBinary:async()=>new ArrayBuffer(100)}}},file,start:1,end:2,preferText:true,rotation:0,helper:{recognize(){ocr++;}},signal:new AbortController().signal,document:dom.window.document,onPage:r=>results.push(r),onStatus(){}});
  assert.equal(results.length,2); assert.equal(ocr,0); assert.equal(destroyed,1); assert.equal(cleaned,2); dom.window.close();
});
test('file modifications during loading prevent stale recognition', async () => {
  const {recognizeFile}=loadWithObsidian('./ocr-pages',{}),file={path:'public.png',extension:'png',stat:{size:100,mtime:1}};
  await assert.rejects(recognizeFile({plugin:{app:{vault:{getAbstractFileByPath:()=>file,readBinary:async()=>{file.stat.mtime++;return new ArrayBuffer(100);}}}},file,signal:new AbortController().signal}),/OCR_CHANGED/);
});
test('entry registration does not import OCR UI, PDF runtime or native helper', () => {
  const before=new Set(Object.keys(require.cache));
  const {registerOcr}=loadWithObsidian('./ocr-entry',{Notice:class {}});
  registerOcr({settings:{ocrEnabled:false},app:{workspace:{on(){}}},addCommand(){},register(){},registerEvent(){}});
  const added=Object.keys(require.cache).filter(file=>!before.has(file));
  assert.ok(!added.some(file=>/ocr-(ui|pages|process)\.js$/.test(file)));
  assert.ok(!fs.readFileSync(path.join(__dirname,'ocr-entry.js'),'utf8').includes('new OcrProcess'));
});
test('preview selection stays bounded and close clears results without changing source', async () => {
  const dom=new JSDOM();
  class Modal { constructor(app){this.app=app;this.modalEl=dom.window.document.createElement('div');this.contentEl=this.modalEl.appendChild(dom.window.document.createElement('div'));} close(){this.onClose();} }
  const {OcrModal}=loadWithObsidian('./ocr-ui',{Modal,Notice:class {}});
  let spoken, options;
  const plugin={settings:{settingsLanguage:'english'},app:{},runUserAction:(_s,fn)=>fn(),activateControlView:async()=>{},startReading:async(text,_label,o)=>{spoken=text;options=o;}};
  const modal=new OcrModal(plugin,{name:'public.png',extension:'png'}); modal.onOpen();
  modal.pages=[{page:1,text:'First sentence. Second sentence.',method:'ocr',lowConfidence:0}];modal.drawPages();
  assert.equal(modal.pageSelect.value,'0');
  modal.preview.setSelectionRange(0,15); await modal.read('selection');
  assert.equal(spoken,'First sentence.');assert.equal(options.skipReadingPosition,true);assert.equal(options.sourceKind,'ocr');
  assert.equal(modal.preview.value,'');assert.equal(modal.pages.length,0);dom.window.close();
});
