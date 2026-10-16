const test = require('node:test');
const assert = require('node:assert/strict');
const { structuredMathSpeech, replacePlainStructuredMath } = require('./structured-math');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { normalizePdfSpeechText } = require('./pdf-selection');

test('extrema and rounding parse Unicode and LaTeX without losing multiplication or scope', () => {
  const latex=String.raw`\min\left\{k,\left\lceil(k+2)(1-\epsilon)\right\rceil\right\}`;
  const unicode='min{𝑘, ⌈(𝑘 + 2)(1 − 𝜖)⌉}';
  const expected='the minimum of k and the ceiling of open parenthesis k plus 2 close parenthesis times open parenthesis 1 minus epsilon close parenthesis';
  assert.equal(mathSpeech(latex,{academicMathMode:'all'}), expected);
  assert.equal(mathSpeech(unicode,{academicMathMode:'all'}), expected);
  const zh=mathSpeech(latex,{mathReadingLanguage:'chinese',academicMathMode:'all'});
  assert.match(zh,/向上取整/); assert.match(zh,/乘以/);assert.match(zh,/两者中的较小值/);
  assert.equal(mathSpeech(String.raw`\max(a,\lfloor b/2\rfloor)`,{academicMathMode:'all'}), 'the maximum of a and the floor of b divided by 2');
  assert.equal(mathSpeech('⌊-2.5⌋'), 'the floor of negative 2.5');
});

test('bounded parser requires a complete supported expression and honors omission settings', () => {
  for(const source of ['min(a,b,c)','min(a,⌈b⌋)','min(a,b)+',String.raw`\min(a,\unknown{b})`, 'min(a,'+'('.repeat(20)+'b'+')'.repeat(20)+')','min(a,bc)']) {
    assert.equal(structuredMathSpeech(source),null,source);
    assert.equal(mathSpeech(source),'Formula.',source);
    assert.equal(mathSpeech(source,{academicSkipNotice:false}),'',source);
  }
  assert.equal(mathSpeech('min(a,b)',{academicMathMode:'skip'}),'Formula.');
  assert.equal(mathSpeech('min(a,b)',{mathReadingLanguage:'skip',academicSkipNotice:false}),'');
});

test('plain PDF and HTML text preserves surrounding prose and multiple formula ranges', () => {
  assert.equal(academicLatex('Read min(a,b), then max(c,d).'), 'Read the minimum of a and b, then the maximum of c and d.');
  assert.equal(replacePlainStructuredMath('minimum time: 5 min. Remaining text.',structuredMathSpeech), 'minimum time: 5 min. Remaining text.');
  assert.equal(academicLatex('Read min(a, unknown), then continue.'),'Read. Formula. then continue.');
  assert.equal(academicLatex('$\\min(a,b)$').trim(),'the minimum of a and b');
  const item=(str,x,y,fontName='body')=>({str,width:str.length*4,height:12,fontName,transform:[12,0,0,12,x,y]});
  const items=[item('The chosen rank is',40,700),item('min{𝑘, ⌈(𝑘+2)(1−𝜖)⌉},',125,700,'math'),item('as stated.',290,700)];
  const layout=extractPdfTextLayout(items,{viewport:{width:600,height:800}});
  const filtered=applyPdfMathChanges(layout.text,pdfMathChanges(layout,items,{academicMathMode:'smart'}));
  const speech=academicLatex(normalizePdfSpeechText(filtered));
  assert.match(speech,/Formula\./);assert.match(speech,/as stated/);
  assert.doesNotMatch(speech,/ceiling|times/);
});

test('smart mode omits nested functions while keeping simple extrema and rounding', () => {
  for (const text of ['min(a,⌈(a+2)(1-ε)⌉)', 'max(a,min(b,c))', '⌊(a+b)(c-d)⌋']) {
    assert.equal(mathSpeech(text), 'Formula.');
    assert.equal(mathSpeech(text,{academicSkipNotice:false}), '');
    assert.notEqual(mathSpeech(text,{academicMathMode:'all'}), 'Formula.');
  }
  assert.equal(mathSpeech('min(a,b)'), 'the minimum of a and b');
  assert.equal(mathSpeech('⌈a⌉'), 'the ceiling of a');
});

test('formula speech and notices follow nearby prose, preserving the no-context fallback', () => {
  const formula='min(a,⌈(a+2)(1-ε)⌉)';
  for (const wrapped of [formula, '$'+formula+'$']) {
    assert.match(academicLatex('The rank is '+wrapped+'. Continue.',{mathReadingLanguage:'chinese'}), /Formula\./);
    assert.doesNotMatch(academicLatex('The rank is '+wrapped+'. Continue.',{mathReadingLanguage:'chinese',academicMathMode:'all'}), /[\u3400-\u9fff]/);
    assert.match(academicLatex('其值取 '+wrapped+'，继续。',{mathReadingLanguage:'english'}), /公式。/);
  }
  assert.match(academicLatex('$'+formula+'$',{mathReadingLanguage:'chinese'}), /公式。/);
  assert.match(academicLatex('English text $a+1$.',{mathReadingLanguage:'chinese'}), /a plus 1/);
  assert.match(academicLatex('中文说明 $a+1$。',{mathReadingLanguage:'english'}), /a 加 1/);
  assert.doesNotMatch(academicLatex('The rank is '+formula,{academicSkipNotice:false}), /Formula|ceiling/);
});
