const test = require('node:test');
const assert = require('node:assert/strict');
const {cases,viewport}=require('../scripts/pdf-acceptance-fixtures.cjs');
const {extractPdfTextLayout}=require('./pdf-layout');
const {pdfMathChanges,applyPdfMathChanges}=require('./pdf-math');
const {preparePdfSelection,normalizePdfSpeechText}=require('./pdf-selection');
const compact=text=>text.replace(/\s+/g,' ').trim();
for(const fixture of cases) test(`PDF acceptance: ${fixture.name}, full and selection parity`,()=>{
  const original=JSON.stringify(fixture.items);
  for(const mode of ['smart','all','skip']) {
    const settings={academicMathMode:mode,mathReadingLanguage:'english',academicMathStyle:'concise',academicSkipNotice:true};
    const layout=extractPdfTextLayout(fixture.items,{viewport});
    const full=normalizePdfSpeechText(applyPdfMathChanges(layout.text,pdfMathChanges(layout,fixture.items,settings)));
    const selected=preparePdfSelection({selectedText:layout.text,selectionLayout:[{items:fixture.items,viewport,pageNumber:1}]},settings);
    assert.equal(compact(selected),compact(full));
    assert.equal(JSON.stringify(fixture.items),original);
    if(mode==='smart') assert.match(compact(full),fixture.expected);
  }
});
