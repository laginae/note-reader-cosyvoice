const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { capturePdfSelectionLayout, preparePdfSelection, normalizePdfSpeechText } = require('./pdf-selection');
const item = (str, x, y, fontName = 'body', size = 12) =>
  ({ str, width: str.length * 5, height: size, fontName, transform: [size, 0, 0, size, x, y] });

test('PDF speech normalizes mathematical letters and ligatures without truncating selections', () => {
  const text = 'A'.repeat(1999) + '𝑗 and 𝑞; efﬁciency; co-\nordinate.';
  const speech = preparePdfSelection({ selectedText: text }, {});
  assert.equal(speech, 'A'.repeat(1999) + 'j and q; efficiency; coordinate.');
  assert.equal(normalizePdfSpeechText('soft\u00adhyphen'), 'softhyphen');
});

test('selected PDF layout filters a multi-line formula, keeps short variables and respects modes', () => {
  const items = [item('Use',40,700),item('𝑗',65,700,'math'),item('and',80,700),item('𝑞',105,700,'math'),
    item('in this example.',120,700), item('𝑦 =',150,670,'math'),item('𝑎 + 𝑏',190,679,'math'),
    item('𝑐',200,659,'math'),item('(7)',280,670),item('Normal text.',40,630)];
  items[4].width=350;items.at(-1).width=450;
  const context={selectedText:'unused',selectionLayout:[{items,viewport:{width:600,height:800}}]};
  const smart=preparePdfSelection(context,{academicMathMode:'smart'});
  assert.match(smart,/Use j and q in this example\./);
  assert.equal((smart.match(/Formula\./g)||[]).length,1);
  assert.doesNotMatch(smart,/a \+ b|\(7\)/);
  assert.ok(smart.endsWith('Normal text.'));
  assert.match(preparePdfSelection(context,{academicMathMode:'all'}),/a \+ b/);
  assert.doesNotMatch(preparePdfSelection(context,{academicMathMode:'skip',academicSkipNotice:false}),/Formula\.|Use j/);
});

test('PDF selection capture excludes unselected span prefixes, suffixes and adjacent prose', () => {
  const dom=new JSDOM('<div data-page-number="1"><div class="textLayer"><span>Outside before.</span><span>Prefix Selected text Suffix</span><span>Outside after.</span></div></div>');
  const doc=dom.window.document, page=doc.querySelector('[data-page-number]'), spans=page.querySelectorAll('span');
  page.getBoundingClientRect=()=>({left:0,bottom:800,width:600,height:800});
  for (const span of spans) span.getBoundingClientRect=()=>({left:40,bottom:110,width:150,height:12});
  const range=doc.createRange();range.setStart(spans[1].firstChild,7);range.setEnd(spans[1].firstChild,20);
  const selectedText=range.toString(),selectionLayout=capturePdfSelectionLayout(range,doc.body,selectedText);
  assert.equal(selectedText,'Selected text');
  assert.equal(selectionLayout[0].items.length,1);
  assert.equal(preparePdfSelection({selectedText,selectionLayout},{}),selectedText);
  assert.equal(capturePdfSelectionLayout(range,doc.body,'A mismatched selection'),null);
  page.getBoundingClientRect=()=>({width:0,height:0});
  assert.equal(capturePdfSelectionLayout(range,doc.body,selectedText),null);
  dom.window.close();
});
