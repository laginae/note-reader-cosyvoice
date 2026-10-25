const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
const { pdfSourceLines } = require('./pdf-highlights');

test('concise indices keep letter boundaries and offsets in both formula languages', () => {
  for (const language of ['english', 'chinese']) {
    const options = { mathReadingLanguage: language };
    const plus = language === 'chinese' ? '加' : 'plus';
    const minus = language === 'chinese' ? '减' : 'minus';
    for (const [input, output] of [
      ['r_t', 'r t'], ['b_t', 'b t'], ['r_{t+1}', 'r t ' + plus + ' 1'],
      ['r_{t-1}', 'r t ' + minus + ' 1'], ['x_{i,j}', 'x i j'],
      ['x_{i, j+1}', 'x i j ' + plus + ' 1'], ['x_{ref}', 'x ref'],
      ['z_{\\mathrm d}', 'z d'], ['x_\\alpha', 'x alpha'],
      ['x_i^2', 'x i ' + (language === 'chinese' ? '的平方' : 'squared')],
    ]) assert.equal(mathSpeech(input, options), output, input);
    assert.equal(academicLatex('\\(r_{t+1}\\)', options).trim(), 'r t ' + plus + ' 1');
  }
});

test('verbose style and compound scripts retain structural labels', () => {
  for (const language of ['english','chinese']) {
    const options = { academicMathStyle: 'verbose', mathReadingLanguage: language };
    const label = language === 'chinese' ? '下标' : 'subscript';
    assert.equal(mathSpeech('r_t', options), 'r ' + label + ' t');
    assert.ok(mathSpeech('r_{t+1}', options).includes(label));
    assert.equal(mathSpeech('x_{i,j}', options), 'x ' + label + ' i,j');
    const compound = mathSpeech('x_{(i+j)/2}', { ...options, academicMathStyle: 'concise', academicMathMode: 'all' });
    assert.ok(compound.includes(label), compound);
    assert.match(compound, /parenthesis|括号/);
  }
});

test('subscript simplification does not relax skip policy or transform prose', () => {
  for (const academicMathStyle of ['concise','verbose']) {
    assert.equal(mathSpeech('r_t', { academicMathStyle, academicMathMode:'skip' }), 'Formula.');
    assert.equal(mathSpeech('r_t', { academicMathStyle, mathReadingLanguage:'skip', academicSkipNotice:false }), '');
    assert.equal(mathSpeech('f_k(t)=g_k(t)/g_k(1)', { academicMathStyle }), 'Formula.');
  }
  const text = 'Use file_name and https://example.test/a_b. Ordinary i,j stays unchanged.';
  assert.equal(academicLatex(text), text);
});

test('PDF subscript speech and source highlighting agree in both styles', () => {
  const viewport = { width:600, height:800 };
  const item = (str,x,size=12,y=700,fontName='body') => ({
    str, width:str.length*6, height:size, fontName, transform:[size,0,0,size,x,y],
  });
  const items = [item('The value is',40), item('x',120,12,700,'math'),
    item('i,j',130,8,697), item('in this example.',160)];
  const original = JSON.stringify(items);
  const layout = extractPdfTextLayout(items, { viewport });
  for (const academicMathStyle of ['concise','verbose']) {
    const mathChanges = pdfMathChanges(layout, items, { academicMathStyle }, { math:'CMMI10' });
    const speech = applyPdfMathChanges(layout.text, mathChanges);
    assert.ok(speech.includes(academicMathStyle === 'concise' ? 'x i j' : 'x subscript i,j'), speech);
    assert.equal(pdfSourceLines({ items, viewport, mathChanges }, text=>text).text, speech.replace(/\s/g,''));
  }
  assert.equal(JSON.stringify(items), original);
});
