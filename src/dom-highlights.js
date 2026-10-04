'use strict';
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
function highlightDocument(doc, options = {}, root = doc.body) {
  clearDocumentHighlight(doc);
  const win = doc.defaultView;
  if (!root || !options.text || !win?.CSS?.highlights || !win.Highlight) return false;
  if (options.url && doc.location.href !== options.url) return false;
  const needle = compact(options.text);
  if (!needle || needle.length > 20000) return false;
  const nodes = [], stack = [root]; let text = '', count = 0;
  while (stack.length) {
    const node = stack.pop();
    if (++count > 200000 || text.length > 5000000) return false;
    if (hidden(node, win)) continue;
    if (node.nodeType === 3) {
      const value = compact(node.nodeValue);
      if (text.length + value.length > 5000000) return false;
      if (value) { nodes.push({node, start:text.length, end:text.length+value.length}); text += value; }
    } else for (let i=node.childNodes.length-1;i>=0;i--) stack.push(node.childNodes[i]);
  }
  const start = text.indexOf(needle);
  if (start < 0 || text.indexOf(needle, start+1) >= 0) return false;
  const end = start + needle.length;
  const included = nodes.filter(item=>item.start<end && item.end>start);
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
  win.CSS.highlights.set(NAME,new win.Highlight(...ranges));
  // Ignore unrelated controls/ads, but invalidate changes to the marked text.
  const observer = new win.MutationObserver(records => {
    const affected = included.some(({ node }) => !node.isConnected || records.some(record => {
      if (record.type === 'characterData') return record.target === node;
      if (record.type === 'attributes') return record.target.contains(node) && hidden(record.target, win);
      return [...record.removedNodes].some(removed => removed === node || removed.contains?.(node))
        || node.parentElement?.contains(record.target);
    }));
    if (affected) clearDocumentHighlight(doc);
  });
  observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style']});
  states.set(doc,{style,observer});
  if(options.follow) {
    const rect=ranges[0].getBoundingClientRect();
    if(rect.top<0||rect.bottom>win.innerHeight) included[0].node.parentElement.scrollIntoView({block:'center',behavior:'auto'});
  }
  return true;
}
module.exports={highlightDocument,clearDocumentHighlight};
