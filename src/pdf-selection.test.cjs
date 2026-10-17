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
  assert.match(preparePdfSelection(context,{academicMathMode:'all'}),/a plus b/);
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

test('selected PDF highlighting stays inside partial spans and rejects changed text layers', () => {
  const {pdfPageLines,matchPdfChunk}=require('./pdf-highlights');
  const dom=new JSDOM('<div data-page-number="3"><div class="textLayer"><span>Outside.</span><span>Before Selected words After</span></div></div>');
  const doc=dom.window.document,page=doc.querySelector('[data-page-number]'),spans=page.querySelectorAll('span');
  page.getBoundingClientRect=()=>({left:0,top:0,bottom:800,width:600,height:800});
  for(const span of spans) span.getBoundingClientRect=()=>({left:40,top:100,bottom:112,width:200,height:12});
  const range=doc.createRange();range.setStart(spans[1].firstChild,7);range.setEnd(spans[1].firstChild,21);
  const [source]=capturePdfSelectionLayout(range,doc.body,range.toString());source.selectedOnly=true;
  assert.equal(source.pageNumber,3);
  const layout=pdfPageLines(page,t=>t,source), selections=new Map();
  const nodes=matchPdfChunk([layout],'Selected words',null,selections);
  assert.deepEqual(nodes,[spans[1]]);assert.deepEqual(selections.get(spans[1]),{start:7,end:21});
  spans[1].textContent='Changed content';assert.equal(pdfPageLines(page,t=>t,source),null);
  dom.window.close();
});

test('shared fallback fonts retain complete display blocks including labels and equation numbers', () => {
  const items = [item('An example follows',40,720),
    item('𝑙',100,690),item('≤',112,690),item('𝑥',124,690),item('2',134,689,'body',8),item('≤',145,690),item('𝑢',157,690),
    item('𝑙',110,674),item('=',122,674),item('max',135,674),item('(',155,674),item('𝑧',165,674),
    item('ref',175,673,'body',8),item(',',192,674),item('𝑦',202,674),item('−',215,674),item('1',227,674),item(')',238,674),item('(42)',300,674),
    item('𝑢',110,658),item('=',122,658),item('min',135,658),item('(',155,658),item('𝑧',165,658),
    item('lim',175,657,'body',8),item(',',192,658),item('𝑦',202,658),item('+',215,658),item('1',227,658),item(')',238,658),
    item('Normal prose follows.',40,625)];
  items[0].width=450; items.at(-1).width=450;
  const context={selectionLayout:[{items,viewport:{width:600,height:800}}]};
  const speech=preparePdfSelection(context,{academicMathMode:'smart'});
  assert.equal(speech.replace(/\s+/g,' ').trim(), 'An example follows . Formula. Normal prose follows.');
  assert.doesNotMatch(speech, /max|min|ref|lim|42|[=≤]/);
  assert.doesNotMatch(preparePdfSelection(context,{academicSkipNotice:false}), /Formula|ref|lim|42/);
  assert.match(preparePdfSelection(context,{academicMathMode:'all'}), /max/);
});

test('shared fonts do not turn ordinary short words into mathematical scripts', () => {
  const items=[item('Use',40,700),item('𝑥',65,700),item('and',80,700),item('𝑦',100,700),
    item('in this example.',120,700),item('Then continue.',40,670)];
  items[4].width=350;items.at(-1).width=450;
  const result=preparePdfSelection({selectionLayout:[{items,viewport:{width:600,height:800}}]},{});
  assert.equal(result,'Use x and y in this example.\nThen continue.');
});
