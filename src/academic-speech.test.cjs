const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { academicOptions, mathSpeech, academicLatex, citations, skipTable } = require('./academic-speech');
const { extractHtmlText, extractHtmlTreeText } = require('./html-text');
const { numericTableRegions } = require('./pdf-academic');
const { highlightDocument } = require('./dom-highlights');
const { LANGUAGES, translate, localizedSetting } = require('./i18n');

test('concise math preserves fraction order, short commands, bounds, subscripts and bar semantics', () => {
  assert.equal(mathSpeech(String.raw`\frac{1}{2}`, { mathReadingLanguage:'chinese' }), '2 分之 1');
  assert.equal(mathSpeech(String.raw`\alpha+\gamma`), 'alpha plus gamma');
  assert.equal(mathSpeech(String.raw`\bar{x}_i`), 'x bar sub i');
  assert.equal(mathSpeech(String.raw`x_\alpha`), 'x sub alpha');
  assert.equal(mathSpeech(String.raw`x^\alpha`), 'x to the power of alpha');
  assert.equal(mathSpeech('x_i', { academicMathStyle:'verbose' }), 'x subscript i');
  assert.equal(mathSpeech('x_i', { academicMathStyle:'verbose', mathReadingLanguage:'chinese' }), 'x 下标 i');
  assert.equal(mathSpeech(String.raw`|Y\_{k,h}|`), 'absolute value of Y sub k,h');
  assert.equal(mathSpeech(String.raw`\sqrt{x}`), 'square root of x');
  assert.match(mathSpeech(String.raw`\frac{1}{a-b}`), /open parenthesis a minus b close parenthesis/);
  assert.equal(citations(academicLatex('Bounds $[1,2]$ and $x<y$; $z>w$.')), 'Bounds  open bracket 1,2 close bracket  and  x less than y ;  z greater than w .');
});

test('complex or unsupported math is omitted with a configurable notice, not guessed', () => {
  for (const input of [String.raw`\sum_{i=1}^n x_i`, String.raw`\unknown{x}`, 'x_{i', 'x'.repeat(33)]) {
    assert.equal(mathSpeech(input), 'Formula omitted.');
    assert.equal(mathSpeech(input, { academicSkipNotice:false }), '');
  }
  assert.equal(mathSpeech('x'.repeat(33), { academicMathMode:'all' }), 'x'.repeat(33));
  assert.equal(mathSpeech('x', { academicMathMode:'skip', mathReadingLanguage:'chinese' }), '公式略过。');
});

test('numeric citations merge adjacent groups and links without changing units, years or zero intervals', () => {
  assert.equal(citations('研究[3]。'), '研究 文献3 。');
  assert.equal(citations('研究[2][4]。'), '研究 文献2和4 。');
  assert.equal(citations('研究[2], [4], [6]。'), '研究 文献2、4和6 。');
  assert.equal(citations('研究[2](#r2), [4](#r4)。'), '研究 文献2和4 。');
  assert.equal(citations('See [2][4].'), 'See  references 2 and 4 .');
  assert.equal(citations('范围[0,1]，年份[2026]，单位[s] [%]。'), '范围[0,1]，年份[2026]，单位[s] [%]。');
  assert.equal(citations('研究[2-4][6]。'), '研究 文献2到4和6 。');
});

const rows = Array.from({ length:8 }, (_,i)=>[`R${i}`,`${i+10}`,`${i+20}`]);
const table = `<table><caption>Table 1. Results</caption><tr><th>Region</th><th>A</th><th>B</th></tr>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
test('smart tables omit only long numeric data; short tables and long text glossaries remain', () => {
  assert.equal(skipTable([], rows), true);
  assert.equal(skipTable([], rows.slice(0,3)), false);
  assert.equal(skipTable([], rows, { academicTableMode:'all' }), false);
  assert.equal(skipTable([], [['one','description']], { academicTableMode:'skip' }), true);
  assert.equal(skipTable([], Array.from({length:20},()=>['ESR','Energy storage resource'])), false);
  const source = `<p>Before.</p>${table}<p>After.</p>`;
  const text = extractHtmlText(source, academicOptions());
  assert.match(text, /Table 1. Results\nTable data omitted./);
  assert.doesNotMatch(text, /R7/);
  assert.match(text, /After/);
  assert.match(extractHtmlText(source, { academicTableMode:'all' }), /R7/);
  assert.doesNotMatch(extractHtmlText(source, academicOptions({ academicSkipNotice:false })), /omitted|R7/);
});

test('HTML omission preserves DOM, selected table data, and following paragraph highlighting', () => {
  const dom = new JSDOM(`<p>Before.</p>${table}<p>After.</p>`), doc=dom.window.document;
  dom.window.CSS={ highlights:new Map() };
  dom.window.Highlight=class extends Set { constructor(...ranges) { super(ranges); } };
  const before=doc.body.innerHTML, range=doc.createRange(); range.selectNodeContents(doc.querySelector('table'));
  const selected=extractHtmlTreeText(doc.body,range,academicOptions());
  assert.match(selected.text || selected.documentText || String(selected), /R7/);
  assert.equal(highlightDocument(doc, { text:'After.', academic:academicOptions() }), true);
  assert.equal([...dom.window.CSS.highlights.get('note-reader-speech')].map(r=>r.toString()).join(''), 'After.');
  assert.equal(highlightDocument(doc, { text:'R7; 17; 27;', academic:academicOptions() }), true);
  assert.equal([...dom.window.CSS.highlights.get('note-reader-speech')].map(r=>r.toString()).join(''), 'R71727');
  assert.equal(doc.body.innerHTML,before);
  dom.window.close();
});

test('PDF filtering requires a caption and dense consecutive rows, preserving adjacent column and prose', () => {
  const title={text:'Table 1',xMin:30,xMax:100,y:700};
  const numeric=rows.map((r,i)=>({text:r.join(' '),xMin:30,xMax:240,y:680-i*12}));
  const prose={text:'The results show a clear difference.',xMin:30,xMax:240,y:580};
  const other={text:'The other column is ordinary prose.',xMin:330,xMax:550,y:650};
  const layout={twoColumn:true,lines:[title,...numeric,prose,other]};
  const regions=numericTableRegions(layout,{width:600});
  assert.equal(regions.length,1);
  assert.ok(regions[0].xMax<300 && regions[0].yMin>prose.y && regions[0].yMax<title.y);
  assert.deepEqual(numericTableRegions({...layout,lines:numeric},{width:600}),[]);
  assert.deepEqual(numericTableRegions(layout,{width:600},{academicTableMode:'all'}),[]);
  assert.deepEqual(numericTableRegions({...layout,lines:[title,...numeric.slice(0,3)]},{width:600}),[]);
});

test('language catalog is complete per entry and settings wrappers preserve IDs and callbacks', () => {
  const catalog=require('./locales/common.json');
  assert.equal(Object.keys(LANGUAGES).length,10);
  for(const values of Object.values(catalog)) assert.ok(values.length===7 && values.every(v=>typeof v==='string' && v.trim()));
  for(const lang of Object.keys(LANGUAGES).filter(l=>!['chinese','english'].includes(l))) assert.notEqual(translate(lang,'Academic reading'),'Academic reading');
  assert.equal(translate('french','Untranslated help'),'Untranslated help');
  class Setting {
    setName(name) { this.name=name; return this; }
    addDropdown(fn) { fn({addOption:(id,label)=>{this.option={id,label};}}); return this; }
  }
  const Local=localizedSetting(Setting,'german'), setting=new Local();
  setting.setName('Academic reading').addDropdown(d=>d.addOption('smart','Smart: skip complex formulas'));
  assert.equal(setting.name,'Wissenschaftliches Lesen');
  assert.equal(setting.option.id,'smart');
  assert.notEqual(setting.option.label,'Smart: skip complex formulas');
});

test('web academic options never contain credentials, paths or unrelated plugin settings', () => {
  assert.deepEqual(academicOptions({key:'private',path:'private',apiSecretName:'private'}),academicOptions());
  assert.equal(Object.keys(academicOptions()).length,5);
});

test('Portuguese covers the common catalog, aliases and safe English fallback', () => {
  const pt = require('./locales/pt.json');
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(require('./locales/common.json')).sort());
  assert.ok(Object.values(pt).every(value => typeof value === 'string' && value.trim()));
  assert.equal(translate('portuguese','Previous chunk'), 'Segmento anterior');
  assert.equal(translate('portuguese','Pause (Space)'), 'Pausar (Espaço)');
  assert.equal(translate('portuguese','Untranslated help'), 'Untranslated help');
});
