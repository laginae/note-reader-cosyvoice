const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');

test('numeric intervals speak endpoints and unary signs without bracket narration', () => {
  assert.equal(mathSpeech('[-0.025,0.025]',{mathReadingLanguage:'chinese'}),'负0.025 到 0.025');
  assert.equal(mathSpeech(String.raw`\left[−0.025, +0.05\right]`),'minus 0.025 to plus 0.05');
  assert.equal(mathSpeech('[0,1]',{academicMathStyle:'verbose'}),'closed interval, 0 to 1');
  assert.equal(mathSpeech('[-1,2]',{academicMathMode:'skip'}),'Formula.');
  assert.match(mathSpeech('[1,2,3]'),/open bracket/);
  assert.match(mathSpeech('x=[1,2]'),/open bracket/);
  assert.match(academicLatex('范围为 $[-0.025,0.025]$。'),/负0.025 到 0.025/);
});

test('statistics read naturally inside equations in both languages and styles', () => {
  for (const source of ['Var[x]',String.raw`\operatorname{Var}\left[x\right]`,String.raw`\mathrm{Var}[x]`]) {
    for (const academicMathStyle of ['concise','verbose']) {
      assert.equal(mathSpeech(source+'=a',{academicMathStyle}),'variance of x equals a');
      assert.equal(mathSpeech(source+'=a',{academicMathStyle,mathReadingLanguage:'chinese'}),'x 的方差 等于 a');
    }
  }
  assert.equal(mathSpeech('Cov[x,y]'),'covariance of x and y');
  assert.equal(mathSpeech('Corr(x,y)',{mathReadingLanguage:'chinese'}),'x 与 y 的相关系数');
  assert.equal(mathSpeech(String.raw`Cov[x_{i,j},y_k]`),'covariance of x sub i,j and y sub k');
  assert.equal(mathSpeech(String.raw`Var[\alpha]`),'variance of alpha');
});

test('statistics do not erase vector brackets, reinterpret arbitrary names or bypass omission', () => {
  for (const source of ['[x,y]','MyVar[x]','Var[x,y]','Cov[x]','Var[x+y]','Var[x|y]'])
    assert.doesNotMatch(mathSpeech(source),/variance|covariance/);
  assert.match(mathSpeech('[x,y]'),/open bracket/);
  assert.equal(mathSpeech('Var[x]',{academicMathMode:'skip'}),'Formula.');
  assert.equal(mathSpeech('Var[x]',{academicMathMode:'skip',academicSkipNotice:false}),'');
  assert.equal(mathSpeech('Var[x]',{academicMathMode:'all'}),'variance of x');
});

test('surrounding prose determines statistic language and PDF equations share the renderer', () => {
  assert.match(academicLatex('关系为 $Var[x]=a$。',{mathReadingLanguage:'english'}),/x 的方差 等于 a/);
  assert.match(academicLatex('The relation $Cov[x,y]=b$ holds.',{mathReadingLanguage:'chinese'}),/covariance of x and y equals b/);
  const item=(str,x,width,fontName='body')=>({str,width,height:12,fontName,transform:[12,0,0,12,x,700]});
  const items=[item('The relation',20,80),item('Var[x]=a',110,70,'math'),item('holds.',190,40)];
  const layout=extractPdfTextLayout(items,{viewport:{width:600,height:800}});
  const speech=applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'smart'},{math:'CMMI10'}));
  assert.match(speech,/variance of x equals a/); assert.doesNotMatch(speech,/bracket/);
  const rangeItems=[item('范围为',20,60),item('[-0.025,0.025]',90,100,'math'),item('。',200,12)];
  const rangeLayout=extractPdfTextLayout(rangeItems,{viewport:{width:600,height:800}});
  const rangeSpeech=applyPdfMathChanges(rangeLayout.text,pdfMathChanges(rangeLayout,rangeItems,{academicMathMode:'smart'},{math:'CMMI10'}));
  assert.match(rangeSpeech,/负0.025 到 0.025/);
  assert.doesNotMatch(rangeSpeech,/方括号/);
});
