'use strict';

function pdfSentenceStart(page, offset, mapped) {
  const lines=mapped?.lines || [];
  let index=lines.findIndex(line=>offset>=line.normalizedStart && offset<line.normalizedEnd);
  if (index<0 || mapped.text!==page || typeof Intl.Segmenter!=='function') return offset;
  let floor=lines[index].normalizedStart;
  for(let count=0;index>0 && count<6;count++,index--) {
    const current=lines[index], previous=lines[index-1];
    const overlap=Math.min(current.xMax,previous.xMax)-Math.max(current.xMin,previous.xMin);
    const gap=previous.y-current.y;
    if(overlap<=0 || gap<0 || gap>Math.max(current.height||12,previous.height||12)*2
      || offset-previous.normalizedStart>1200) break;
    floor=previous.normalizedStart;
  }
  const segmenter=new Intl.Segmenter(undefined,{granularity:'sentence'});
  for(const part of segmenter.segment(page.slice(floor))) {
    const start=floor+part.index;
    if(start<=offset && offset<start+part.segment.length) return start+(part.segment.match(/^\s*/)?.[0].length||0);
  }
  return offset;
}

function pointContext(event, view) {
  const doc = event.target?.ownerDocument, root = view.containerEl || view.contentEl;
  const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  const span = target?.closest('.textLayer span'), page = span?.closest('[data-page-number]');
  if (!page || !root?.contains(page) || span.querySelector('span')) return null;
  const bounds = page.getBoundingClientRect(), rect = span.getBoundingClientRect();
  const x = event.clientX, y = event.clientY;
  if (!(bounds.width > 0 && bounds.height > 0) || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  let caret = doc.caretRangeFromPoint?.(x,y);
  if (!caret && doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x,y);
    if (pos) { caret=doc.createRange(); caret.setStart(pos.offsetNode,pos.offset); caret.collapse(true); }
  }
  if (!caret || caret.startContainer.nodeType !== 3 || !span.contains(caret.startContainer)) {
    // PDF text-layer overlays can make caretRangeFromPoint hit the canvas.
    // Fall back to exact character rectangles within the clicked span only.
    caret=null;
    const walker=doc.createTreeWalker(span,4);let node,budget=2048;
    while(!caret && (node=walker.nextNode()) && budget>0) {
      for(let offset=0;offset<node.textContent.length && budget-->0;offset++) {
        if(!node.textContent[offset].trim())continue;
        const char=doc.createRange();char.setStart(node,offset);char.setEnd(node,offset+1);
        if([...char.getClientRects()].some(r=>x>=r.left && x<=r.right && y>=r.top && y<=r.bottom)){caret=char;break;}
      }
    }
    if(!caret)return null;
  }
  const text = caret.startContainer.textContent, index = Math.min(caret.startOffset,text.length-1);
  // A span's box can cover whitespace; require a visible character under the pointer.
  let at = -1;
  for (const offset of [index,index-1]) {
    if (offset < 0 || !text[offset]?.trim()) continue;
    const char = doc.createRange(); char.setStart(caret.startContainer,offset);char.setEnd(caret.startContainer,offset+1);
    if ([...char.getClientRects()].some(r=>x>=r.left && x<=r.right && y>=r.top && y<=r.bottom)) { at=offset;break; }
  }
  if (at < 0) return null;
  // Keep the complete word as a stable text anchor; sentence alignment happens
  // against the extracted page, not DOM span order (which can interleave columns).
  while (at > 0 && /[\p{L}\p{N}]/u.test(text[at-1])) at--;
  const selectedText=text.slice(at).trim();
  const pageNumber=Number(page.dataset.pageNumber);
  if (!selectedText || !Number.isInteger(pageNumber) || pageNumber<1) return null;
  return { filePath:view.file.path, fileMtime:view.file.stat?.mtime || 0, pageNumber, selectedText,
    selectionPosition:{xRatio:(x-bounds.left)/bounds.width,yRatio:(y-bounds.top)/bounds.height},
    sentenceStart:true, strictMatch:true };
}

function registerPdfReadingMenu(plugin, Menu, captureSelection, read, notify) {
  if (!Menu?.prototype?.showAtMouseEvent) return;
  const snapshots=new WeakMap(), documents=new Map(), added=new WeakSet();
  let active=true;
  const capture=event=>{
    if (!active || plugin.settings.readingContextMenu===false) return;
    const leaf=plugin.app.workspace.getLeavesOfType('pdf').find(l=>(l.view.containerEl||l.view.contentEl)?.contains(event.target));
    if (!leaf?.view.file) return;
    const view=leaf.view, root=view.containerEl||view.contentEl, doc=root.ownerDocument;
    const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
    if (!target?.closest('.page[data-page-number]')) return;
    let selection,context;
    try {selection=captureSelection(doc.getSelection(),[leaf],view.file);context=selection || pointContext(event,view);}
    catch (_) {return;}
    if (!context) return;
    snapshots.set(event,{view,file:view.file,path:view.file.path,mtime:view.file.stat?.mtime||0,
      context:{...context,strictMatch:true},selection:Boolean(selection?.selectionLayout?.length)});
  };
  const sync=()=>{
    const docs=new Set(plugin.app.workspace.getLeavesOfType('pdf').map(l=>(l.view.containerEl||l.view.contentEl)?.ownerDocument).filter(Boolean));
    for (const [doc,handler] of documents) if (!docs.has(doc)) {doc.removeEventListener('contextmenu',handler,true);documents.delete(doc);}
    for (const doc of docs) if (!documents.has(doc)) {doc.addEventListener('contextmenu',capture,true);documents.set(doc,capture);}
  };
  plugin.registerEvent(plugin.app.workspace.on('layout-change',sync));
  plugin.app.workspace.onLayoutReady?.(sync); sync();
  const original=Menu.prototype.showAtMouseEvent;
  function show(event,...args) {
    const snapshot=active && snapshots.get(event);
    if (snapshot && !added.has(this) && plugin.settings.readingContextMenu!==false) {
      added.add(this);snapshots.delete(event);
      const zh=plugin.settings.settingsLanguage==='chinese';
      for (const selection of snapshot.selection?[false,true]:[false]) {
        this.addItem(item=>{item.setSection?.('selection');return item
          .setTitle(selection?(zh?'朗读选中内容':'Read selected text'):(zh?'从此处开始朗读':'Read aloud from here'))
          .setIcon(selection?'text-select':'list-start').onClick(()=>{
            if (!active || plugin.settings.readingContextMenu===false) return;
            if (snapshot.view.file!==snapshot.file || snapshot.file.path!==snapshot.path
              || (snapshot.file.stat?.mtime||0)!==snapshot.mtime
              || !plugin.app.workspace.getLeavesOfType('pdf').some(l=>l.view===snapshot.view)) {
              notify(zh?'原文已变化或关闭，请重新打开右键菜单。':'The PDF changed or closed. Open the context menu again.');return;
            }
            return read({...snapshot,selection});
          });});
      }
    }
    return original.call(this,event,...args);
  }
  // Both the built-in PDF viewer and PDF++ show their original menu this way.
  // Only a captured PDF event is extended; all existing items/handlers survive.
  Menu.prototype.showAtMouseEvent=show;
  plugin.register(()=>{
    active=false;
    if (Menu.prototype.showAtMouseEvent===show) Menu.prototype.showAtMouseEvent=original;
    for (const [doc,handler] of documents) doc.removeEventListener('contextmenu',handler,true);
    documents.clear();
  });
}

module.exports={registerPdfReadingMenu,pointContext,pdfSentenceStart};
