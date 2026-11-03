'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfMathChanges, applyPdfMathChanges } = require('./pdf-math');
function fixture(before, formula, settings = {}) {
  const item = (str, x, width, fontName) => ({ str, width, height:12, fontName, transform:[12,0,0,12,x,700] });
  const items = [item(before,20,100,'body'),item(formula,130,150,'math'),item('。',290,12,'body')];
  const original = JSON.stringify(items), layout = extractPdfTextLayout(items,{viewport:{width:600,height:800}});
  const changes = pdfMathChanges(layout,items,settings,{math:'CMMI10'});
  assert.equal(JSON.stringify(items),original);
  return { changes, layout, speech:applyPdfMathChanges(layout.text,changes) };
}
test('PDF bracket-only runs use local interval context and preserve original highlight source', () => {
  for (const [formula, expected] of [['[a,b]','a 到 b'],['(a,b)','a 到 b 的开区间'],['[-1,1)','负1 到 1，含 负1，不含 1']]) {
    const result = fixture('区间为',formula);
    assert.ok(result.speech.includes(expected), result.speech);
    assert.ok(result.layout.text.includes(formula));
    assert.ok(result.changes.some(change=>change.source.includes(formula) && change.omitted.length===0));
    assert.ok(fixture('区间为',formula,{academicMathStyle:'verbose'}).speech.includes('区间'));
  }
});
test('PDF coordinates remain literal and short literal sets retain member rather than interval semantics', () => {
  assert.match(fixture('坐标为','(a,b)').speech,/a、b/);
  assert.match(fixture('向量为','[0,1]').speech,/0、1/);
  assert.match(fixture('坐标为','(a,b)',{academicMathStyle:'verbose'}).speech,/左括号 a,b 右括号/);
  assert.match(fixture('向量为','[0,1]',{academicMathStyle:'verbose'}).speech,/左方括号 0,1 右方括号/);
  assert.match(fixture('集合为','{a,b}').speech,/集合 a、b/);
  assert.match(fixture('取值为','x∈[a,b]').speech,/x 属于 a 到 b 的区间/);
  assert.match(fixture('区间为','(a,b)',{academicMathMode:'skip'}).speech,/公式。/);
});
