'use strict';
const { extractHtmlTreeText } = require('./html-text');
const NUMBER = /^([1-9]\d?(?:\.\d{1,2}){0,5})[.)\u3001\uff0e]?\s+(\S.*)$/;
function visible(element) {
  for (let node = element; node?.nodeType === 1; node = node.parentElement) {
    if (node.matches('nav,footer,aside,form,pre,code,table,ol,ul,[hidden],[aria-hidden="true"],[contenteditable]')) return false;
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
function captureHtmlOutline(doc) {
  if (!doc?.body) return [];
  const nodes = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div');
  if (nodes.length > 20000) return [];
  const candidates = [];
  for (const element of nodes) {
    if (candidates.length >= 1000) break;
    const semantic = /^h[1-6]$/.test(element.localName);
    if (!semantic && element.querySelector('h1,h2,h3,h4,h5,h6,p,div,br,li,table')) continue;
    if (!visible(element)) continue;
    const title = element.textContent.replace(/\s+/g, ' ').trim();
    if (!title || title.length > (semantic ? 500 : 120)) continue;
    const numbered = title.normalize('NFKC').match(NUMBER);
    if (semantic || (numbered && !/[.!?\u3002\uff01\uff1f]$/.test(title))) {
      candidates.push({ title, element, level: semantic ? Number(element.localName[1]) : 1,
        inferred: !semantic, numbers: numbered?.[1].split('.').map(Number) });
    }
  }
  const seen = new Set(), last = new Map(), inferred = [];
  let base = 0;
  for (const entry of candidates) {
    if (!entry.numbers) continue;
    const parts = entry.numbers, parent = parts.slice(0, -1).join('.'), n = parts.at(-1);
    if (!entry.inferred) {
      base = Math.max(0, entry.level - parts.length);
      seen.add(parts.join('.')); last.set(parent, n); continue;
    }
    // Only consecutive siblings with an existing parent are accepted.
    if ((parent && !seen.has(parent)) || n !== (last.get(parent) || 0) + 1) continue;
    seen.add(parts.join('.')); last.set(parent, n);
    entry.level = Math.min(6, parts.length + base); inferred.push(entry);
  }
  const accepted = new Set(inferred.length >= 2 ? inferred : []);
  return candidates.filter(entry => !entry.inferred || accepted.has(entry));
}
function htmlSectionText(doc, entry, entries, remaining = false) {
  const index = entries.findIndex(item => item.element === entry.element && item.title === entry.title);
  if (index < 0 || !doc.body.contains(entry.element)) throw new Error('HTML changed. Choose the heading again.');
  const next = remaining ? null : entries.slice(index + 1).find(item => item.level <= entry.level);
  const range = doc.createRange(); range.setStartBefore(entry.element);
  if (next) range.setEndBefore(next.element); else range.setEnd(doc.body, doc.body.childNodes.length);
  return extractHtmlTreeText(doc.body, range).selection?.selectedText || '';
}
module.exports = { captureHtmlOutline, htmlSectionText };
