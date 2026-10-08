const test = require('node:test');
const assert = require('node:assert/strict');
const { recurringEdges, ancillaryLayout, inside } = require('./pdf-ancillary');
const viewport = { width: 600, height: 800 };
const item = (str,x,y,size=10,width=230) => ({str,width,height:size,transform:[size,0,0,size,x,y]});
const items = [item('A. Author et al.',40,760,8),item('Journal 142 (2025) 12345',320,760,8),
  item('List of Abbreviations',50,720,10,180),item('AC Alternating current',50,700),item('PDF Portable document format',50,680),
  item('Body after the glossary.',40,620),item('Right column body continues.',320,710),item('2',290,20,8,8)];
test('repeated edge text and changing page numbers are omitted, but first-page titles and body stay',()=>{
  const repeated = recurringEdges([{items,viewport},{items:items.map(i=>({...i,str:i.str==='2'?'3':i.str})),viewport}]);
  const result = ancillaryLayout(items,viewport,[],repeated);
  assert.equal(result.headers.length,3);
  assert.ok(!result.headers.some(r=>inside(result.layout.lines.find(l=>l.text==='List of Abbreviations'),r)));
  assert.equal(ancillaryLayout([item('Unique paper title',40,760)],viewport,[],repeated).headers.length,0);
  assert.equal(ancillaryLayout([item('A. Author et al.',40,700,8)],viewport,[],repeated).headers.length,0);
});
test('boxed and unboxed glossary boundaries do not include the other column or following paragraph',()=>{
  for(const rules of [[],[{x:40,y:660,width:250}]]) {
    const result = ancillaryLayout(items,viewport,rules);
    const selected = result.layout.lines.filter(line=>result.glossary.some(r=>inside(line,r))).map(l=>l.text);
    assert.deepEqual(selected,['List of Abbreviations','AC Alternating current','PDF Portable document format']);
  }
  assert.equal(ancillaryLayout([item('Glossary',40,650),item('This is a discussion of terminology.',40,635),item('Another normal sentence.',40,620)],viewport).glossary.length,0);
});
