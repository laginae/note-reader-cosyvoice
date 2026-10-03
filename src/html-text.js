'use strict';

const { parseDocument } = require('htmlparser2');

const MAX_HTML_BYTES = 50 * 1024 * 1024;
const MAX_HTML_TEXT_CHARS = 5_000_000;
const MAX_HTML_NODES = 200_000;
const OMIT_TAGS = new Set([
  'head', 'script', 'style', 'template', 'noscript', 'svg', 'canvas',
  'iframe', 'object', 'embed', 'audio', 'video', 'nav', 'footer',
  'form', 'input', 'button', 'select', 'textarea',
]);
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details',
  'div', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tr', 'ul',
]);

function isHtmlFile(file) {
  return Boolean(file && ['html', 'htm'].includes(String(file.extension || '').toLowerCase()));
}

function normalizeHtmlWhitespace(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function nodeInfo(node) {
  if (node.nodeType === 3 || node.type === 'text') {
    return { text: node.nodeType === 3 ? node.nodeValue : node.data, children: [] };
  }
  const tag = String(node.localName || node.name || '').toLowerCase();
  const attr = (name) => typeof node.getAttribute === 'function'
    ? node.getAttribute(name) : (node.attribs && node.attribs[name]);
  const style = String(attr('style') || '');
  const hidden = attr('hidden') != null || attr('aria-hidden') === 'true'
    || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i.test(style);
  return { tag, omit: hidden || OMIT_TAGS.has(tag), children: Array.from(node.childNodes || node.children || []) };
}

// The same walk handles parsed source and HTML Reader's rendered DOM, retaining exact range offsets.
function extractHtmlTreeText(root, range = null, options = {}) {
  const pieces = [];
  let length = 0;
  let count = 0;
  let start = null;
  let end = null;
  const append = (text) => {
    const value = String(text || '');
    length += value.length;
    if (length > MAX_HTML_TEXT_CHARS) throw new Error('HTML readable text exceeds the size limit.');
    pieces.push(value);
  };
  const mark = (node, offset) => {
    if (!range) return;
    if (range.startContainer === node && range.startOffset === offset) start = length;
    if (range.endContainer === node && range.endOffset === offset) end = length;
  };
  const stack = [{ node: root }];
  while (stack.length) {
    const action = stack.pop();
    if (action.boundary !== undefined) { mark(action.node, action.boundary); continue; }
    if (action.close) {
      if (BLOCK_TAGS.has(action.tag)) append('\n');
      if (action.tag === 'td' || action.tag === 'th') append('; ');
      continue;
    }
    if (++count > MAX_HTML_NODES) throw new Error('HTML contains too many elements.');
    const node = action.node;
    const info = nodeInfo(node);
    if (info.omit || (options.omitNode && options.omitNode(node))) continue;
    if (info.text !== undefined) {
      const text = String(info.text || '');
      if (range && range.startContainer === node) start = length + Math.min(text.length, range.startOffset);
      if (range && range.endContainer === node) end = length + Math.min(text.length, range.endOffset);
      append(text);
      continue;
    }
    if (BLOCK_TAGS.has(info.tag) || info.tag === 'br') append('\n');
    stack.push({ node, tag: info.tag, close: true });
    stack.push({ node, boundary: info.children.length });
    for (let index = info.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: info.children[index] });
      stack.push({ node, boundary: index });
    }
  }
  const raw = pieces.join('');
  const text = normalizeHtmlWhitespace(raw);
  if (start === null || end === null || end <= start) return { text, selection: null };
  let startOffset = normalizeHtmlWhitespace(raw.slice(0, start)).length;
  const endOffset = normalizeHtmlWhitespace(raw.slice(0, end)).length;
  while (/\s/.test(text[startOffset] || '') && startOffset < endOffset) startOffset += 1;
  const selectedText = text.slice(startOffset, endOffset).trim();
  return { text, selection: selectedText ? { startOffset, endOffset, selectedText } : null };
}

function extractHtmlText(source) {
  const value = String(source || '');
  if (Buffer.byteLength(value, 'utf8') > MAX_HTML_BYTES) throw new Error('HTML file exceeds the 50 MiB size limit.');
  return extractHtmlTreeText(parseDocument(value, { decodeEntities: true })).text;
}

function getHtmlReaderDocument(view) {
  try {
    const frame = view && view.mainView && view.mainView.iframe
      || (view && view.contentEl && typeof view.contentEl.querySelector === 'function'
        ? view.contentEl.querySelector('#ohpIframe') : null);
    return frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document)) || null;
  } catch (_) {
    return null;
  }
}

function captureHtmlSelection(doc, filePath, fileMtime) {
  try {
    const selection = doc && typeof doc.getSelection === 'function' && doc.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !doc.body) return null;
    const range = selection.getRangeAt(0);
    if (!doc.body.contains(range.startContainer) || !doc.body.contains(range.endContainer)) return null;
    const result = extractHtmlTreeText(doc.body, range);
    if (!result.selection) return null;
    return { ...result.selection, text: result.text, filePath, fileMtime };
  } catch (_) {
    return null;
  }
}

module.exports = {
  MAX_HTML_BYTES, captureHtmlSelection, extractHtmlText, extractHtmlTreeText,
  getHtmlReaderDocument, isHtmlFile, normalizeHtmlWhitespace,
};

/*!
 * Bundled HTML parser notices
 * htmlparser2: Copyright 2010, 2011, Chris Winberry <chris@winberry.net>.
 * All rights reserved.
 * dom-serializer: Copyright (c) 2014 The cheeriojs contributors.
 * (The MIT License)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * domhandler, domelementtype, domutils, entities (BSD-2-Clause):
 * Copyright (c) Felix Böhm. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 * THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
