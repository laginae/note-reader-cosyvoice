'use strict';
const { extractHtmlTreeText } = require('./html-text');
const NAME = 'note-reader-speech';
const states = new WeakMap();
const compact = text => String(text || '').replace(/[\s\u00ad]/g, '');
function hidden(node, win) {
  if (node.nodeType !== 1) return false;
  if (node.matches('script,style,nav,footer,form,input,textarea,select,button,iframe,canvas,svg,[hidden],[aria-hidden="true"],[contenteditable],.note-reader-native-toolbar')) return true;
  const style = win.getComputedStyle(node);
  return style.display === 'none' || style.visibility === 'hidden';
}
function clearDocumentHighlight(doc) {
  const state = states.get(doc);
  doc.defaultView?.CSS?.highlights?.delete(NAME);
  state?.observer?.disconnect(); state?.style?.remove(); states.delete(doc);
}
function isDocumentHighlightCurrent(doc) {
  const state = states.get(doc);
  return Boolean(state?.style?.isConnected && doc.defaultView?.CSS?.highlights?.get(NAME) === state.highlight
    && state.nodes.every(node => node.isConnected));
}
function highlightDocument(doc, options = {}, root = doc.body) {
  clearDocumentHighlight(doc);
  const win = doc.defaultView;
  if (!root || !options.text || !win?.CSS?.highlights || !win.Highlight) return false;
  if (options.url && doc.location.href !== options.url) return false;
  const needle = compact(options.text);
  if (!needle || needle.length > 20000) return false;
  const nodes = []; let text = '';
  // Use the speech extractor's separators while mapping only real text nodes to ranges.
  try {
    extractHtmlTreeText(root, null, {
      ...options.academic,
      omitNode: node => hidden(node, win),
      onText(value, node) {
        const part = compact(value), start = text.length;
        text += part;
        if (node && part) nodes.push({ node, start, end: text.length });
      },
    });
  } catch (_) { return false; }
  const start = text.indexOf(needle);
  // Explicit selections retain HTML table data even when whole-document reading omits it.
  if (start < 0 && options.academic?.academicTableMode && options.academic.academicTableMode !== 'all') {
    return highlightDocument(doc, { ...options, academic:{ ...options.academic, academicTableMode:'all' } }, root);
  }
  if (start < 0 || text.indexOf(needle, start+1) >= 0) return false;
  const end = start + needle.length;
  const included = nodes.filter(item=>item.start<end && item.end>start);
  if (!included.length) return false;
  const offset = (node, target) => {
    let at=0;
    for(let i=0;i<node.nodeValue.length;i++) if (!/[\s\u00ad]/.test(node.nodeValue[i])) {
      if(at++===target)return i;
    }
    return node.nodeValue.length;
  };
  // Separate text-node ranges never paint excluded forms between two paragraphs.
  const ranges = included.map(item => {
    const range = doc.createRange();
    range.setStart(item.node, item.start < start ? offset(item.node, start - item.start) : 0);
    range.setEnd(item.node, item.end > end ? offset(item.node, end - item.start - 1) + 1 : item.node.nodeValue.length);
    return range;
  });
  const color = /^#[\da-f]{6}$/i.test(options.color) ? options.color : '#e5b83d';
  const strength = Math.min(60,Math.max(5,Number(options.strength)||22));
  const style=doc.createElement('style');
  style.textContent=`::highlight(${NAME}) { background-color: color-mix(in srgb, ${color} ${strength}%, transparent); }`;
  (doc.head || doc.documentElement).appendChild(style);
  const highlight = new win.Highlight(...ranges);
  win.CSS.highlights.set(NAME, highlight);
  // Ignore unrelated controls/ads, but invalidate changes to the marked text.
  const observer = new win.MutationObserver(records => {
    const affected = included.some(({ node }) => !node.isConnected || records.some(record => {
      if (record.type === 'characterData') return record.target === node;
      if (record.type === 'attributes') return record.target.contains(node) && hidden(record.target, win);
      return [...record.removedNodes].some(removed => removed === node || removed.contains?.(node))
        || node.parentElement?.contains(record.target);
    }));
    if (affected) {
      clearDocumentHighlight(doc);
      // A guest page can rerender without notifying the host; only restore exact, unique text.
      if (options.restoreOnChange && root.isConnected) highlightDocument(doc, options, root);
    }
  });
  observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style']});
  states.set(doc,{style,observer,highlight,nodes:included.map(item => item.node)});
  if(options.follow) {
    const rect=ranges[0].getBoundingClientRect();
    if(rect.top<0||rect.bottom>win.innerHeight) included[0].node.parentElement.scrollIntoView({block:'center',behavior:'auto'});
  }
  return true;
}
module.exports={highlightDocument,clearDocumentHighlight,isDocumentHighlightCurrent};
