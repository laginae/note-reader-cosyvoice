const test=require('node:test'),assert=require('node:assert/strict');
const {cases,viewport}=require('../scripts/pdf-golden-fixtures.cjs');
assert.deepEqual({cases,viewport},require('@laginae/note-reader-core/test/pdf-golden-fixtures'), 'Shared public corpus must match the pinned core release');
const {extractPdfTextLayout}=require('./pdf-layout');
const {pdfMathChanges,applyPdfMathChanges}=require('./pdf-math');
const {preparePdfSelection,normalizePdfSpeechText}=require('./pdf-selection');
const compact=x=>normalizePdfSpeechText(x).replace(/\s+/g,' ').trim();
for(const f of cases)test('PDF golden full and selection: '+f.name,()=>{
 const layout=extractPdfTextLayout(f.items,{viewport}),options={academicMathMode:'smart',mathReadingLanguage:'english',academicMathStyle:'concise',academicSkipNotice:true};
 assert.equal(compact(applyPdfMathChanges(layout.text,pdfMathChanges(layout,f.items,options))),f.golden);
 assert.equal(compact(preparePdfSelection({selectedText:layout.text,selectionLayout:[{items:f.items,viewport,pageNumber:1}]},options)),f.golden);
});
