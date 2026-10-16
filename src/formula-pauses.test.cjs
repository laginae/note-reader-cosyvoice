const test = require('node:test');
const assert = require('node:assert/strict');
const { academicLatex } = require('./academic-speech');
const compact = text => text.replace(/\s+/g,' ').trim();
const options = { academicMathMode:'skip' };

test('omitted formulas pause on both sides without doubled punctuation', () => {
  assert.equal(compact(academicLatex('Before $x$ after.',options)), 'Before. Formula. after.');
  for (const boundary of ['.', '?', '!', ':', ';', ',']) {
    assert.equal(compact(academicLatex(`Before${boundary} $x$. After.`,options)), `Before${boundary} Formula. After.`);
  }
  assert.equal(compact(academicLatex('$x$. After.',options)), 'Formula. After.');
  assert.equal(compact(academicLatex('Before $x$, after.',options)), 'Before. Formula. after.');
  assert.equal(compact(academicLatex('Before $x$?',options)), 'Before. Formula?');
  assert.equal(compact(academicLatex('Before $x$ $y$ after.',options)), 'Before. Formula. Formula. after.');
  assert.equal(compact(academicLatex('前文$x$后文。',{...options,mathReadingLanguage:'chinese'})), '前文。 公式。 后文。');
  assert.equal(compact(academicLatex('前文。$x$。后文。',{...options,mathReadingLanguage:'chinese'})), '前文。 公式。 后文。');
});

test('notice punctuation leaves short formulas, disabled notices and literal prose alone', () => {
  assert.equal(compact(academicLatex('Use $x$ here.')), 'Use x here.');
  assert.equal(compact(academicLatex('Before $x$ after.',{...options,academicSkipNotice:false})), 'Before after.');
  assert.equal(academicLatex('The word Formula. is literal prose.'), 'The word Formula. is literal prose.');
});
