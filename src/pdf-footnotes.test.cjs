const test = require('node:test');
const assert = require('node:assert/strict');
const { partitionFootnotes, normalizeFootnoteMode, splitFootnotesInRange } = require('./pdf-footnotes');
const viewport = { width: 600, height: 800 };
const item = (str, x, y, size = 10, width = 220) => ({ str, width, height: size, transform: [size, 0, 0, size, x, y] });
const sample = [item('Left opening.',40,650),item('Right opening.',320,650),item('Left ending.',40,200),item('Right ending.',320,200),
  item('2 Left note.',40,135,9),item('Continued note.',40,122,9),item('3 Right note.',320,135,9),item('4 Other note.',320,122,9),item('2',290,20,8,10)];
test('numbered bottom notes are separated independently in both columns, preserving all body text', () => {
  const result = partitionFootnotes(sample,viewport);
  assert.equal(result.regions.length,2);
  assert.match(result.body.text,/Left ending\.\nRight opening/);
  assert.ok(!result.body.text.includes('Left note'));
  assert.match(result.notes.text,/2 Left note\.\nContinued note\.\n3 Right note\.\n4 Other note\./);
  assert.equal(result.layout.lines.length,result.body.lines.length+result.notes.lines.length);
});
test('small captions and bottom numbered body paragraphs are not silently dropped', () => {
  assert.equal(partitionFootnotes(sample.map(i=>({...i,height:10,transform:[10,0,0,10,i.transform[4],i.transform[5]]})),viewport).regions.length,0);
  assert.equal(partitionFootnotes(sample.map(i=>({...i,str:i.str.replace(/^\d+ /,'Figure ')})),viewport).regions.length,0);
  assert.equal(partitionFootnotes(sample,null).regions.length,0);
  assert.equal(normalizeFootnoteMode('unknown'),'body');
});
test('selected and section ranges remove only uniquely matched footnote text', () => {
  const result = partitionFootnotes(sample,viewport);
  const range = splitFootnotesInRange('Left ending.\n2 Left note.\nContinued note.\nRight opening.', result);
  assert.ok(!range.body.includes('note.')); assert.ok(range.body.includes('Right opening.'));
  assert.equal(range.notes,'2 Left note.\nContinued note.');
  assert.equal(splitFootnotesInRange('2 Left note.\n2 Left note.',result).notes,'');
});

test('first-page full-width author and publication block is separated without losing either body column', () => {
  const items = [item('Left body opening with enough text for the dominant font.',40,650),
    item('Right body opening with enough text for the dominant font.',320,650),
    item('Left body ending.',40,200),item('Right body ending.',320,190),
    item('\u2217 Corresponding author at: Public University.',40,150,9,510),
    item('Public correspondence address.',40,138,9),item('E-mail address: author@example.org.',50,126,9),
    item('1 An ordinary numbered footnote.',40,114,9,510),
    item('https://doi.org/10.0000/example',40,90,9),item('Received 1 January; Accepted 2 February.',40,78,9,510),
    item('Available online 3 March.',40,66,9),item('Copyright: open-access license.',40,54,9,510)];
  const rules = [{x:40,y:162,width:36}];
  for (const evidence of [rules, []]) {
    const result = partitionFootnotes(items,viewport,evidence,{pageNumber:1});
    assert.equal(result.regions.length,1);
    assert.match(result.body.text,/Left body ending/);
    assert.match(result.body.text,/Right body ending/);
    assert.ok(!/Corresponding|example.org|Received|Copyright/.test(result.body.text));
    assert.match(result.notes.text,/Corresponding author/);
    assert.match(result.notes.text,/Copyright/);
    assert.equal(result.layout.lines.length,result.body.lines.length+result.notes.lines.length);
    const ranged = splitFootnotesInRange(result.layout.text,result);
    assert.equal(ranged.body,result.body.text);
  }
  assert.ok(partitionFootnotes(items,viewport,rules,{pageNumber:2}).body.text.includes('Corresponding author'));
  const sameSize = items.map(i=>({...i,height:10,transform:[10,0,0,10,i.transform[4],i.transform[5]]}));
  assert.equal(partitionFootnotes(sameSize,viewport,rules,{pageNumber:1}).regions.length,0);
});
