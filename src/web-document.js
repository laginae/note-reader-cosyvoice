'use strict';

const { Readability } = require('@mozilla/readability');
const { extractHtmlTreeText, MAX_HTML_NODES } = require('./html-text');

const OMIT_WEB_TAGS = new Set([
  'head', 'script', 'style', 'template', 'noscript', 'svg', 'canvas', 'img',
  'iframe', 'object', 'embed', 'audio', 'video', 'nav', 'footer',
  'form', 'input', 'button', 'select', 'textarea',
]);
const OMIT_ROLES = new Set(['navigation', 'menu', 'menubar', 'banner', 'complementary']);

function omitWebNode(node) {
  if (node.nodeType !== 1) return false;
  if (OMIT_WEB_TAGS.has(node.localName) || OMIT_ROLES.has(node.getAttribute('role'))
    || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true'
    || node.hasAttribute('contenteditable')) return true;
  const win = node.ownerDocument && node.ownerDocument.defaultView;
  if (!win || typeof win.getComputedStyle !== 'function') return false;
  const style = win.getComputedStyle(node);
  return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
}

// Build an inert, resource-free copy, never passing form values or page markup to the host.
function copyReadableDocument(doc, root) {
  const clone = doc.implementation.createHTMLDocument('');
  clone.title = String(doc.title || '').slice(0, 200);
  const stack = [{ source: root, target: clone.body }];
  let count = 0;
  while (stack.length) {
    const { source, target } = stack.pop();
    if (++count > MAX_HTML_NODES) throw new Error('WEB_SIZE');
    for (const node of source.childNodes) {
      if (omitWebNode(node)) continue;
      if (node.nodeType === 3) target.appendChild(clone.createTextNode(node.nodeValue || ''));
      else if (node.nodeType === 1) {
        const element = clone.createElement(node.localName);
        for (const name of ['class', 'id']) {
          const value = node.getAttribute(name);
          if (value) element.setAttribute(name, value.slice(0, 500));
        }
        target.appendChild(element);
        stack.push({ source: node, target: element });
      }
    }
  }
  return clone;
}

function captureWebDocument(doc, options = {}) {
  const root = options.root || doc.body;
  if (!root) throw new Error('WEB_EMPTY');
  let range = options.range || null;
  const selection = typeof doc.getSelection === 'function' && doc.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount) {
    const live = selection.getRangeAt(0);
    if (root.contains(live.startContainer) && root.contains(live.endContainer)) range = live;
  }
  if (range && (!root.contains(range.startContainer) || !root.contains(range.endContainer))) range = null;
  const result = extractHtmlTreeText(root, range, { omitNode: omitWebNode });
  let text = result.text;
  let method = 'visible-body';
  if (options.article !== false && !options.root && text) {
    const clone = copyReadableDocument(doc, root);
    const article = new Readability(clone, { maxElemsToParse: MAX_HTML_NODES, charThreshold: 0 }).parse();
    if (article && article.content) {
      const parsed = new doc.defaultView.DOMParser().parseFromString(article.content, 'text/html');
      const articleText = extractHtmlTreeText(parsed.body).text;
      if (articleText) { text = articleText; method = 'article'; }
    }
  }
  return {
    url: String(doc.location && doc.location.href || ''),
    title: String(doc.title || 'Web page').slice(0, 200),
    text,
    method,
    // Selection offsets always refer to the original visible DOM, not Readability's rearranged copy.
    selectionContext: result.selection ? { ...result.selection, text: result.text } : null,
  };
}

module.exports = { captureWebDocument, ...require('./dom-highlights') };
