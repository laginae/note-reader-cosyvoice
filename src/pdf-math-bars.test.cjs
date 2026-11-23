const test = require('node:test');
const assert = require('node:assert/strict');
const { pdfBarOffsets } = require('./pdf-math-bars');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { extractPdfTextLayout } = require('./pdf-layout');
const item=(str,x,y,width=6,fontName='math')=>({str,fontName,width,height:10,transform:[10,0,0,10,x,y]});
const viewport={width:400,height:600};
const OPS={constructPath:91,fill:22,eoFill:23,rectangle:19,save:10,restore:11,transform:12,endPath:28};
const rect=(x,y,w=6,h=.5,paint=OPS.fill)=>[paint,[Float32Array.of(0,x,y,1,x+w,y,1,x+w,y+h,1,x,y+h,4)],[x,y,x+w,y+h]];
const list=(...args)=>({fnArray:args.map(()=>OPS.constructPath),argsArray:args});
const options={academicMathMode:'smart',academicMathStyle:'concise',mathReadingLanguage:'english'};
function full(items,drawing,settings=options) {
  const layout=extractPdfTextLayout(items,{viewport}), marks=pdfBarOffsets(items,drawing,OPS);
  return applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,settings,{},new Set(),marks));
}

test('smart mode skips a grouped encoded system once and keeps surrounding prose, also with notices off',()=>{
  const items=[item('Public example:',20,470,260,'body'),item('𝑣 \u0d4c 𝑘\u0b34 \u0d45 𝑢',110,445,45),
    item('𝑧 \u0d4c \u0db1 𝑢',110,432,45),item('(8)',195,432,15,'body'),item('The example ends.',20,410,260,'body')];
  assert.equal((full(items,list()).match(/Formula\./g)||[]).length,1);
  for(const notice of [true,false]){
    const speech=full(items,list(),{...options,academicSkipNotice:notice});
    assert.match(speech,/Public example:/);assert.match(speech,/The example ends\./);
    assert.doesNotMatch(speech,/[𝑢𝑣𝑧\u0b00-\u0dff]|[(]8[)]/u);
    if(!notice) assert.doesNotMatch(speech,/Formula/i);
  }
  assert.match(full(items,list(),{...options,academicMathMode:'all'}),/equals/);
});
test('only a measured overbar decorates its own glyph; inclusive and strict comparisons remain different',()=>{
  const first=item('𝑉',55,470), middle=item('𝑉',90,450), expression=item('0 \u0d4f 𝑉 \u0d51 𝑉',145,450,46);
  const items=[item('Use',20,470,22,'body'),first,item('here.',80,470,70,'body'),
    item('Compare',20,450,50,'body'),middle,item('when',108,450,28,'body'),expression,item('holds.',200,450,50,'body')];
  const op=list(rect(55,478),rect(185,458));
  const marks=pdfBarOffsets(items,op,OPS);
  assert.deepEqual(marks.get(first),[0]);assert.ok(!marks.has(middle));
  const oldPacked=rect(55,478);oldPacked[1][0][12]=3;
  assert.deepEqual(pdfBarOffsets(items,list(oldPacked),OPS).get(first),[0]);
  assert.deepEqual(marks.get(expression),[expression.str.lastIndexOf('𝑉')]);
  const speech=full(items,op).normalize('NFKC');
  assert.match(speech,/V bar here/);assert.match(speech,/V when 0 less than V less than or equal to V bar/);
  assert.equal((speech.match(/bar/g)||[]).length,2);
  assert.deepEqual(pdfBarOffsets(items,{fnArray:[91,22],argsArray:[[[19],[55,478,6,.5]],null]},OPS).get(first),[0]);
});
test('fraction rules, underlines, clipping boxes, transformed drawings and text in real scripts are not overbars',()=>{
  const v=item('𝑣',40,400),num=item('2',40,411,5,'body'), plain=item('v',70,400,6,'body');
  assert.equal(pdfBarOffsets([v,num,plain],list(rect(40,408),rect(40,398),rect(70,408),rect(40,408,45)),OPS).size,0);
  assert.equal(pdfBarOffsets([v],list(rect(40,408,6,.5,OPS.endPath)),OPS).size,0);
  assert.equal(pdfBarOffsets([v],{fnArray:[10,12,91,11],argsArray:[null,[0,1,-1,0,0,0],rect(40,408),null]},OPS).size,0);
  const text='\u0d15\u0d32\u0d02 \u0b15\u0b3e\u0b33';
  assert.equal(full([item(text,40,400,60,'natural')],list()),text);
});

test('selected playback borrows only verified glyph evidence, never a neighboring or unselected letter',async()=>{
  const {enrichPdfSelection,preparePdfSelection}=require('./pdf-selection');
  const variable='𝑉', expr='𝑉 \u0d51 𝑉';
  const source=[item('Outside.',10,430,45,'body'),item(variable,55,400),item(expr,110,400,30)];
  const page={getViewport:()=>({...viewport,rotation:0,convertToViewportPoint:(x,y)=>[x,600-y]}),
    getTextContent:async()=>({items:source}),getOperatorList:async()=>list(rect(134,408))};
  async function pick(index,start,end,x,width,overrides={}){
    const o=source[index],piece={...item(o.str.slice(start,end),x,400,width,'screen'),spanIndex:index,
      selectionStart:start,selectionEnd:end,...overrides};
    const orig={pageNumber:1,items:[piece],viewport},ctx=await enrichPdfSelection({selectionLayout:[orig]},()=>page,OPS);
    return [preparePdfSelection(ctx,options).trim().normalize('NFKC'),ctx.selectionLayout[0],orig];
  }
  const [last,enriched]=await pick(2,expr.length-2,expr.length,134,6);
  assert.equal(last,'V bar');assert.equal(enriched.items.length,1);assert.equal(enriched.items[0].str,variable);
  assert.equal((await pick(2,0,2,110,6))[0],'V');
  assert.equal((await pick(1,0,2,55,6))[0],'V');
  const [,wide]=await pick(1,0,2,57,14);
  assert.equal(wide.items[0].width,6);
  const [uncertain,fallback,original]=await pick(2,expr.length-2,expr.length,250,6);
  assert.equal(uncertain,'V');assert.equal(fallback,original);
  assert.ok(!JSON.stringify(enriched).includes('Outside'));
});
