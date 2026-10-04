const test = require('node:test');
const assert = require('node:assert/strict');
const { inferOutline, indexedLines, sectionRange, scanPdfOutline, numberedBookmark } = require('./pdf-outline');
const { PDFDocument, PDFName, PDFHexString, PDFDict, PDFArray } = require('pdf-lib');
const { writePdfBookmarks, pageFingerprint } = require('./pdf-bookmarks');
const key = PDFName.of;

test('inferred headings filter captions, repeated headers and equation numbers', () => {
  const texts = ['Journal 2026', '1. Introduction', '1.2. Methods', 'Table 1. Results', '(12)', 'Ordinary sentence.', 'References'];
  const pages = [1,2].map(number => ({ number, height: 800, bodyHeight: 10, items: [], styles: {},
    lines: texts.map((text,i) => ({ text, offset: i*30, y: i ? 700-i*30 : 760, xMin: 40, xMax: 260 })) }));
  const entries = inferOutline(pages);
  assert.deepEqual(entries.filter(e=>e.page===1).map(e=>[e.title,e.level]), [['1. Introduction',1],['1.2. Methods',2],['References',1]]);
  assert.ok(entries.every(e=>e.inferred));
});

test('sections include nested subsections but stop before the next peer on the same page', () => {
  const entries = [{level:1,page:1,offset:10},{level:2,page:1,offset:30},{level:1,page:2,offset:20}];
  const pages=[{text:'x'.repeat(100)},{text:'x'.repeat(80)}];
  assert.deepEqual(sectionRange(entries,0,pages),{startPage:1,startOffset:10,endPage:2,endOffset:20});
  assert.equal(sectionRange(entries,1,pages,true).endOffset,80);
  assert.deepEqual(indexedLines({text:'A forecast.\nNext.',lines:[{text:'A fore-'},{text:'cast.'},{text:'Next.'}]}).map(l=>l.offset),[0,6,12]);
});

test('existing PDF bookmarks take precedence and named destinations resolve locally', async () => {
  let cleaned=0;
  const page={getTextContent:async()=>({items:[{str:'1. Introduction',width:150,height:12,transform:[12,0,0,12,40,700]},
    {str:'Body text.',width:100,height:10,transform:[10,0,0,10,40,680]}],styles:{}}),getViewport:()=>({width:600,height:800}),cleanup:()=>cleaned++};
  const model=await scanPdfOutline({numPages:1,getPage:async()=>page,getOutline:async()=>[{title:'Existing',dest:'named',items:[]}],
    getDestination:async()=>[0,{name:'XYZ'},40,700,null]});
  assert.equal(model.entries[0].title,'Existing'); assert.equal(model.entries[0].inferred,false); assert.equal(cleaned,1);
});

test('bookmark titles recover source section numbers without changing original bookmarks or duplicating prefixes', async () => {
  const text = '2.2. Energy storage resources\nBody.\n2.2.1. Methods and\nvalidation\nBody.';
  const page = { text, lines: indexedLines({ text, lines: [
    {text:'2.2. Energy storage resources'}, {text:'Body.'}, {text:'2.2.1. Methods and'}, {text:'validation'}, {text:'Body.'}
  ] }) };
  const original = { title:'Energy storage resources',page:1,level:1 };
  assert.equal(numberedBookmark(original,page).title,'2.2. Energy storage resources');
  assert.equal(original.title,'Energy storage resources');
  assert.equal(numberedBookmark({title:'Methods and validation'},page).title,'2.2.1. Methods and validation');
  assert.equal(numberedBookmark({title:'2.2. Energy storage resources'},page).title,'2.2. Energy storage resources');
  assert.equal(numberedBookmark({title:'References'},page).title,'References');
  const duplicate = { text: text+'\n2.3. Energy storage resources', lines: [...page.lines,
    {text:'2.3. Energy storage resources',offset:text.length+1}] };
  assert.equal(numberedBookmark(original,duplicate).title,original.title);
});

async function fixture() {
  const doc=await PDFDocument.create(); const page=doc.addPage([600,800]); page.drawText('Public test document');
  const annotation=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Highlight',Rect:[40,600,180,615],
    QuadPoints:[40,615,180,615,40,600,180,600],Contents:PDFHexString.fromText('Preserve this annotation')}));
  page.node.set(key('Annots'),doc.context.obj([annotation]));
  doc.addPage([600,800]); return doc.save();
}
const rows=[{title:'Introduction',level:1,page:1,x:40,y:700},{title:'Details',level:2,page:1,x:40,y:500},
  {title:'结论',level:1,page:2,x:40,y:700}];
test('bookmark writing preserves pages and annotations, unicode titles and hierarchy', async () => {
  const bytes=await fixture(), before=await PDFDocument.load(bytes);
  const output=await writePdfBookmarks(bytes,rows); const after=await PDFDocument.load(output);
  assert.deepEqual(pageFingerprint(after),pageFingerprint(before));
  const root=after.catalog.lookup(key('Outlines'),PDFDict), first=root.lookup(key('First'),PDFDict);
  assert.equal(first.lookup(key('Title')).decodeText(),'Introduction');
  assert.equal(first.lookup(key('First'),PDFDict).lookup(key('Title')).decodeText(),'Details');
  assert.equal(root.lookup(key('Last'),PDFDict).lookup(key('Title')).decodeText(),'结论');
  assert.equal(first.lookup(key('Dest'),PDFArray).get(0).toString(),after.getPage(0).ref.toString());
  assert.equal(before.catalog.has(key('Outlines')),false);
});
test('keep is byte-identical; merge deduplicates while preserving old bookmarks; invalid destinations reject', async () => {
  const first=await writePdfBookmarks(await fixture(),rows);
  assert.deepEqual(await writePdfBookmarks(first,rows,'keep'),first);
  const merged=await PDFDocument.load(await writePdfBookmarks(first,[...rows,{title:'New',level:1,page:2,x:0,y:200}],'merge',rows));
  const root=merged.catalog.lookup(key('Outlines'),PDFDict);
  assert.equal(root.lookup(key('First'),PDFDict).lookup(key('Title')).decodeText(),'Introduction');
  assert.equal(root.lookup(key('Last'),PDFDict).lookup(key('Title')).decodeText(),'New');
  const numbered = await writePdfBookmarks(first, rows.map(e => ({...e, originalTitle:e.title,title:'1. '+e.title})), 'merge', rows);
  assert.deepEqual(numbered,first);
  await assert.rejects(writePdfBookmarks(first,[{...rows[0],page:5}]),/Invalid/);
});
test('signature fields and permission dictionaries prevent writing', async () => {
  for (const type of ['signature','permissions']) {
    const doc=await PDFDocument.load(await fixture());
    if(type==='signature') doc.context.register(doc.context.obj({FT:'Sig'}));
    else doc.catalog.set(key('Perms'),doc.context.obj({}));
    await assert.rejects(writePdfBookmarks(await doc.save(),rows),/disabled/);
  }
});
