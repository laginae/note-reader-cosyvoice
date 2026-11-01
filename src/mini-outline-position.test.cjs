'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { scrollDocumentEdge } = require('../src/mini-outline-position');

test('document edges use actual Markdown endpoints, not the first and last heading or editor selection', () => {
  const calls=[], text='Public preface.\n# Heading\n\nPublic ending.';
  const view={editor:{scrollIntoView:(range,center)=>calls.push([range,center]),setCursor:()=>assert.fail('Selection changed')}};
  const data={kind:'markdown',text,entries:[]};
  scrollDocumentEdge(view,data,false); scrollDocumentEdge(view,data,true);
  assert.deepEqual(calls,[[{from:{line:0,ch:0},to:{line:0,ch:0}},true],[{from:{line:3,ch:14},to:{line:3,ch:14}},true]]);
  view.editor.offsetToPos=offset=>({line:offset===text.length?3:0,ch:offset===text.length?14:0});
  scrollDocumentEdge(view,data,true); assert.deepEqual(calls[2],calls[1]);
});

test('Markdown preview edges use native source-line scrolling and never change editor state', () => {
  const calls=[],view={getMode:()=> 'preview',previewMode:{applyScroll:line=>calls.push(line)},editor:{scrollIntoView:()=>assert.fail('Editor scrolled')}};
  scrollDocumentEdge(view,{kind:'markdown',text:'Introduction\n# Public heading\nEnding\n'},false);
  scrollDocumentEdge(view,{kind:'markdown',text:'Introduction\n# Public heading\nEnding\n'},true);
  assert.deepEqual(calls,[0,3]);
});

test('HTML edges scroll only the owned document without editing its markup or selection', t => {
  const dom=new JSDOM('<main><p>Public preface.</p><h1>Public heading</h1><p>Public ending.</p></main>');t.after(()=>dom.window.close());
  const doc=dom.window.document,root=doc.documentElement,html=root.innerHTML;
  Object.defineProperty(root,'scrollHeight',{value:1600});
  const range=doc.createRange();range.selectNodeContents(doc.querySelector('p'));doc.getSelection().addRange(range);
  const selection=doc.getSelection().toString(); root.scrollLeft=30;
  scrollDocumentEdge({}, {kind:'html',doc},true); assert.equal(root.scrollTop,1600);
  scrollDocumentEdge({}, {kind:'html',doc},false); assert.equal(root.scrollTop,0);
  assert.equal(root.innerHTML,html); assert.equal(root.scrollLeft,30); assert.equal(doc.getSelection().toString(),selection);
});

test('PDF bottom targets the final page visual edge, including rotated or cropped coordinates', () => {
  const calls=[],coords=[],viewer={pagesCount:12,getPageView:index=>{
    assert.equal(index,11);return {viewport:{height:900,convertToPdfPoint:(x,y)=>{coords.push([x,y]);return [430,25];}}};
  },scrollPageIntoView:target=>calls.push(target)};
  const view={viewer:{child:{pdfViewer:viewer}}};
  const data={kind:'pdf',entries:[{page:2,title:'Last heading'}],model:{pages:[{},{}]}};
  scrollDocumentEdge(view,data,false);scrollDocumentEdge(view,data,true);
  assert.deepEqual(calls,[{pageNumber:1},{pageNumber:12,destArray:[null,{name:'XYZ'},430,25,null]}]);
  assert.deepEqual(coords,[[0,900]]);
});

test('PDF edges reuse known page counts and native link fallback without loading or synthesizing text', async () => {
  const calls=[],workspace={openLinkText:async(...args)=>calls.push(args)};
  await scrollDocumentEdge({}, {kind:'pdf',file:{path:'public-demo.pdf'},pages:[{},{},{},{}]},true,workspace);
  await scrollDocumentEdge({}, {kind:'pdf',file:{path:'public-demo.pdf'}},false,workspace);
  assert.deepEqual(calls,[['public-demo.pdf#page=4&offset=0,0,0','',false],['public-demo.pdf#page=1','',false]]);
  assert.throws(()=>scrollDocumentEdge({}, {kind:'pdf',pages:[]},true,workspace));
});

test('unavailable views or invalid PDF coordinates fail without navigating elsewhere', () => {
  assert.throws(()=>scrollDocumentEdge({}, {kind:'markdown',text:'Public text'},false));
  assert.throws(()=>scrollDocumentEdge({}, {kind:'html'},true));
  const viewer={pagesCount:1,getPageView:()=>({viewport:{height:700,convertToPdfPoint:()=>[NaN,0]}}),scrollPageIntoView:()=>assert.fail('Invalid destination')};
  assert.throws(()=>scrollDocumentEdge({viewer:{child:{pdfViewer:viewer}}},{kind:'pdf'},true));
});
