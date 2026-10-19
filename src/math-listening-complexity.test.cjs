const test = require('node:test');
const assert = require('node:assert/strict');
const {mathSpeech,academicLatex}=require('./academic-speech');
const {extractPdfTextLayout}=require('./pdf-layout');
const {pdfMathChanges,applyPdfMathChanges}=require('./pdf-math');

test('smart mode omits short but expensive grouped formulas, all mode retains supported ones',()=>{
  for(const value of [String.raw`r(s)=[h(s)-h_1]/h_1`,String.raw`r=\frac{a-b}{c}`,
    String.raw`\frac{a+b}{c-d}`, 'p=(a+(b*c))', 'f(g(h(x)))', '[a,b,c,d]', String.raw`[a,b]^T`]) {
    assert.equal(mathSpeech(value),'Formula.',value);
    assert.equal(mathSpeech(value,{academicSkipNotice:false}),'',value);
    assert.notEqual(mathSpeech(value,{academicMathMode:'all'}),'Formula.',value);
  }
});

test('short variables, ratios, named bounds and simple functions remain readable',()=>{
  for(const value of ['x','x_i','x=y+2','a/b',String.raw`\frac{a}{b}`,String.raw`\frac{1}{a-b}`,'[l,u]'])
    assert.notEqual(mathSpeech(value),'Formula.',value);
  assert.equal(mathSpeech(String.raw`\phi[x]`),'phi of x');
  assert.equal(mathSpeech('f(t)'),'f of t');
  assert.match(mathSpeech('f(t)',{academicMathStyle:'verbose'}),/open parenthesis/);
});

test('formula groups produce one localized paused notice and preserve surrounding prose',()=>{
  const formula=String.raw`a=[p,q,r,s], b=[u,v]^T`;
  const en=academicLatex(`Before $${formula}$ after.`);
  assert.equal((en.match(/Formula\./g)||[]).length,1);
  assert.match(en,/Before\. Formula\.\s+after/);
  const zh=academicLatex(`前文 $${formula}$ 后文。`);
  assert.equal((zh.match(/公式。/g)||[]).length,1);
  assert.match(zh,/前文。 公式。\s+后文/);
});

test('PDF smart filtering shares grouped-expression cost without swallowing adjacent prose',()=>{
  const item=(str,x,width,fontName='body')=>({str,width,height:12,fontName,transform:[12,0,0,12,x,700]});
  const items=[item('Before',30,40),item('r(s)=[h(s)-h_1]/h_1',75,160,'math'),item('after.',240,40)];
  const layout=extractPdfTextLayout(items,{viewport:{width:600,height:800}});
  const result=applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'smart'},{math:'CMMI10'}));
  assert.match(result,/Before/);assert.match(result,/after/);assert.match(result,/Formula\./);
  assert.doesNotMatch(result,/h_1/);
});
