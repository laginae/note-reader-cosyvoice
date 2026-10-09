'use strict';
const { extractHtmlTreeText } = require('./html-text');
const NAME = 'note-reader-speech';
const states = new WeakMap();
const documentIndexes = new WeakMap();
const compact = text => String(text || '').replace(/[\s\u00ad]/g, '');
function documentIndex(root, options, win) {
  let cache = documentIndexes.get(root);
  if (!cache) {
    const entries = new Map();
    const observer = new win.MutationObserver(() => entries.clear());
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'] });
    cache = { entries, observer }; documentIndexes.set(root, cache);
  }
  if (cache.observer.takeRecords().length) cache.entries.clear();
  const key = JSON.stringify(options.academic || {});
  if (cache.entries.has(key)) return cache.entries.get(key);
  const pieces = [], visibility = new WeakMap();
  const omitNode = node => {
    if (!visibility.has(node)) visibility.set(node, hidden(node, win));
    return visibility.get(node);
  };
  extractHtmlTreeText(root, null, { ...options.academic, omitNode,
    onText: (value, node) => pieces.push({ value, node }) });
  const index = { pieces, omitNode };
  if (cache.entries.size >= 3) cache.entries.clear();
  cache.entries.set(key, index);
  return index;
}
function paragraphFor(node, root) {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (el.matches('p,li,td,th,figcaption,div')) {
      // Never tint a figure, heading, form, or a container holding other blocks.
      if (el.querySelector('img,picture,svg,canvas,video,iframe,form,input,button,h1,h2,h3,h4,h5,h6,p,div,table,ul,ol')) return null;
      return el;
    }
    if (el.matches('h1,h2,h3,h4,h5,h6,figure,table,body')) return null;
  }
  return null;
}
function elementSelector(el) {
  const parts = [];
  for (let node = el; node; node = node.parentElement) {
    const index = node.parentElement ? Array.prototype.indexOf.call(node.parentElement.children, node) + 1 : 1;
    parts.unshift(`${node.localName}:nth-child(${index})`);
  }
  return parts.join(' > ');
}
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
  const previous = states.get(doc);
  if (options.locateOnly && previous?.text === options.text && isDocumentHighlightCurrent(doc)
    && (!options.url || doc.location.href === options.url)) {
    previous.nodes[0].parentElement.scrollIntoView({ block: 'center', behavior: 'auto' });
    return true;
  }
  if (!options.locateOnly) clearDocumentHighlight(doc);
  const win = doc.defaultView;
  if (!root || !options.text || !win || (!options.locateOnly && (!win.CSS?.highlights || !win.Highlight))) return false;
  if (options.url && doc.location.href !== options.url) return false;
  const needle = compact(options.text);
  if (!needle || needle.length > 20000) return false;
  const nodes = []; let text = '', originalText = '';
  let index;
  // Use the speech extractor's separators while mapping only real text nodes to ranges.
  try {
    index = documentIndex(root, options, win);
    for (const { value, node } of index.pieces) {
        originalText += value;
        const original = compact(value);
        const part = options.speechMapped ? compact(options.speechTransform(value)) : original, start = text.length;
        text += part;
        if (node && part) nodes.push({ node, start, end: text.length, transformed: part !== original });
    }
  } catch (_) { return false; }
  // Per-node conversion is safe only when it agrees with whole-stream conversion.
  // Cross-node formulas or context-dependent citations otherwise remain unmarked.
  if (options.speechMapped && text !== compact(options.speechTransform(originalText))) return false;
  let start = text.indexOf(needle);
  if (start < 0 && !options.speechMapped && typeof options.speechTransform === 'function') {
    if (highlightDocument(doc, { ...options, speechMapped: true }, root)) return true;
  }
  // Explicit selections retain HTML table data even when whole-document reading omits it.
  if (start < 0 && options.academic?.academicTableMode && options.academic.academicTableMode !== 'all') {
    return highlightDocument(doc, { ...options, academic:{ ...options.academic, academicTableMode:'all' } }, root);
  }
  let matchedIntervals = null;
  let leadingMatch = start >= 0 && text.indexOf(needle, start + 1) < 0;
  if (start < 0 && !options.speechMapped) {
    // Require multiple unique, ordered prose anchors. Paint only their exact text,
    // never the unmatched formulas or intervening content.
    const anchors = [];
    let spokenOffset = 0;
    for (const sentence of options.text.split(/(?<=[。！？.!?;；\n])/)) {
      const value = compact(sentence);
      const prose = value.replace(/[。！？.!?;；\n]+$/, '');
      const found = prose.length >= 24 && !/[\\{}=<>]/.test(prose) ? text.indexOf(prose) : -1;
      if (found >= 0 && text.indexOf(prose, found + 1) < 0) {
        anchors.push({ start: found, end: found + prose.length, spokenStart: spokenOffset });
      } else {
        let clauseOffset = 0;
        for (const clause of value.split(/(?<=[，,:：。！？.!?;；])/)) {
          const fragment = clause.replace(/[，,:：。！？.!?;；]+$/, '');
          const minimum = /[\u3400-\u9fff]/.test(fragment) ? 10 : 24;
          const at = fragment.length >= minimum && !/[\\{}=<>]/.test(fragment) ? text.indexOf(fragment) : -1;
          if (at >= 0 && text.indexOf(fragment, at + 1) < 0)
            anchors.push({ start: at, end: at + fragment.length, spokenStart: spokenOffset + clauseOffset });
          clauseOffset += clause.length;
        }
      }
      spokenOffset += value.length;
    }
    // A segment may start halfway through a table or with a displayed equation.
    // Keep an exact unique prefix, including its punctuation and numbers.
    const prefix = needle.slice(0, 24), prefixStart = text.indexOf(prefix);
    if (prefix.length === 24 && prefixStart >= 0 && text.indexOf(prefix, prefixStart + 1) < 0) {
      let length = prefix.length;
      while (length < needle.length && text[prefixStart + length] === needle[length]) length++;
      if (!anchors.length || anchors[0].spokenStart > 0) {
        const following = anchors.filter(anchor => anchor.spokenStart >= length);
        anchors.splice(0, anchors.length, { start: prefixStart, end: prefixStart + length, spokenStart: 0 }, ...following);
      }
    }
    if (anchors.length >= 2 && anchors.every((anchor, i) => !i || anchor.start >= anchors[i - 1].end)
      && anchors[0].spokenStart <= Math.min(48, needle.length / 4)
      && anchors.at(-1).end - anchors[0].start <= needle.length * 3) {
      matchedIntervals = anchors;
      leadingMatch = true;
    }
  }
  if (!options.speechMapped && typeof options.speechTransform === 'function') {
    const blocks = [...new Set(nodes.map(item => paragraphFor(item.node, root)).filter(Boolean))];
    const converted = blocks.map(element => {
      const raw = extractHtmlTreeText(element, null, { ...options.academic, omitNode: index.omitNode }).text;
      return { element, spoken: compact(options.speechTransform(raw)) };
    });
    const matches = converted.filter(({ spoken }) => spoken.length >= 24 && needle.length >= 24
      && converted.filter(other => other.spoken === spoken).length === 1
      && (needle.includes(spoken) || spoken.includes(needle)));
    leadingMatch ||= matches.some(({ spoken }) => spoken.includes(needle) || needle.indexOf(spoken) === 0);
    // A complete converted paragraph can be mapped even when a formula crosses
    // inline text nodes. Do not guess individual word offsets in that paragraph.
    const intervals = matches.filter(({ spoken }) => !spoken.includes(needle) || matches.length === 1).map(({ element }) => {
      const items = nodes.filter(item => element.contains(item.node));
      return items.length ? { start: items[0].start, end: items.at(-1).end } : null;
    }).filter(Boolean);
    if (leadingMatch && intervals.length) matchedIntervals = [...(matchedIntervals || (start >= 0 ? [{ start, end: start + needle.length }] : [])), ...intervals];
  }
  if (!matchedIntervals && (start < 0 || text.indexOf(needle, start+1) >= 0)) return false;
  matchedIntervals ||= [{ start, end: start + needle.length }];
  const included = nodes.filter(item=>matchedIntervals.some(range=>item.start<range.end && item.end>range.start));
  if (!included.length) return false;
  if (options.locateOnly) {
    included[0].node.parentElement.scrollIntoView({ block: 'center', behavior: 'auto' });
    return true;
  }
  const offset = (node, target) => {
    let at=0;
    for(let i=0;i<node.nodeValue.length;i++) if (!/[\s\u00ad]/.test(node.nodeValue[i])) {
      if(at++===target)return i;
    }
    return node.nodeValue.length;
  };
  // Separate text-node ranges never paint excluded forms between two paragraphs.
  const ranges = matchedIntervals.flatMap(({ start, end }) => included.filter(item => item.start < end && item.end > start).map(item => {
    const range = doc.createRange();
    range.setStart(item.node, !item.transformed && item.start < start ? offset(item.node, start - item.start) : 0);
    range.setEnd(item.node, !item.transformed && item.end > end ? offset(item.node, end - item.start - 1) + 1 : item.node.nodeValue.length);
    return range;
  }));
  const color = /^#[\da-f]{6}$/i.test(options.color) ? options.color : '#e5b83d';
  const strength = Math.min(60,Math.max(5,Number(options.strength)||22));
  const paragraphs = [...new Set(included.map(item => paragraphFor(item.node, root)).filter(Boolean))];
  const selectors = paragraphs.map(elementSelector);
  const style=doc.createElement('style');
  style.textContent=`::highlight(${NAME}) { background-color: transparent; }`;
  if (selectors.length) style.textContent += `\n${selectors.join(',\n')} { background-color: color-mix(in srgb, ${color} ${Math.max(3, Math.round(strength * 0.45))}%, transparent); }`;
  (doc.head || doc.documentElement).appendChild(style);
  const highlight = new win.Highlight(...ranges);
  win.CSS.highlights.set(NAME, highlight);
  // Ignore unrelated controls/ads, but invalidate changes to the marked text.
  const observer = new win.MutationObserver(records => {
    const affected = paragraphs.some((element, i) => !element.isConnected || elementSelector(element) !== selectors[i])
      || included.some(({ node }) => !node.isConnected || records.some(record => {
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
  states.set(doc,{style,observer,highlight,text:options.text,nodes:included.map(item => item.node)});
  if(options.follow) {
    const rect=ranges[0].getBoundingClientRect();
    if(rect.top<0||rect.bottom>win.innerHeight) included[0].node.parentElement.scrollIntoView({block:'center',behavior:'auto'});
  }
  return true;
}
function currentDocumentHighlightElement(doc, text) {
  const state = states.get(doc);
  if (!state || state.text !== text || !isDocumentHighlightCurrent(doc)) return null;
  const range = [...state.highlight][0];
  const node = range?.startContainer;
  return node?.nodeType === 1 ? node : node?.parentElement || null;
}
module.exports={highlightDocument,clearDocumentHighlight,isDocumentHighlightCurrent,currentDocumentHighlightElement};
