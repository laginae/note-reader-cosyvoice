'use strict';

const { MAX_HTML_TEXT_CHARS } = require('./html-text');
const { captureWebDocument } = require('./web-document');

const WEB_VIEW_TYPE = 'webviewer';
const WEB_TIMEOUT_MS = 15000;
const GUEST_SOURCE = typeof __NOTE_READER_WEB_GUEST__ === 'string' ? __NOTE_READER_WEB_GUEST__ : '';

function isWebPageView(view) {
  return Boolean(view && typeof view.getViewType === 'function' && view.getViewType() === WEB_VIEW_TYPE);
}

function getWebPageUrl(view) {
  try {
    const value = view.webview && typeof view.webview.getURL === 'function'
      ? view.webview.getURL() : view.url;
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}

function validateWebSnapshot(snapshot, expectedUrl) {
  if (!snapshot || snapshot.url !== expectedUrl || typeof snapshot.text !== 'string'
    || snapshot.text.length > MAX_HTML_TEXT_CHARS) throw new Error('WEB_CHANGED');
  const context = snapshot.selectionContext;
  if (context && (typeof context.text !== 'string' || context.text.length > MAX_HTML_TEXT_CHARS
    || !Number.isInteger(context.startOffset) || !Number.isInteger(context.endOffset)
    || context.startOffset < 0 || context.endOffset <= context.startOffset || context.endOffset > context.text.length
    || context.selectedText !== context.text.slice(context.startOffset, context.endOffset).trim())) {
    throw new Error('WEB_SELECTION');
  }
  return {
    url: expectedUrl, title: String(snapshot.title || 'Web page').slice(0, 200),
    text: snapshot.text, method: snapshot.method === 'article' ? 'article' : 'visible-body',
    selectionContext: context ? {
      text: context.text, startOffset: context.startOffset, endOffset: context.endOffset,
      selectedText: context.selectedText,
    } : null,
  };
}

async function captureWebPage(view, options = {}) {
  const url = getWebPageUrl(view);
  if (!url || ['blank', 'error'].includes(view.mode)) throw new Error('WEB_UNAVAILABLE');
  let snapshot;
  if (view.mode === 'reader') {
    const root = view.readerView;
    if (!root || !root.ownerDocument) throw new Error('WEB_UNAVAILABLE');
    snapshot = captureWebDocument(root.ownerDocument, { root, range: options.range, article: false });
    snapshot.url = url;
    snapshot.title = String(view.title || 'Web page').slice(0, 200);
  } else {
    const webview = view.webview;
    if (!GUEST_SOURCE || !webview || typeof webview.executeJavaScript !== 'function') throw new Error('WEB_UNAVAILABLE');
    let timer;
    try {
      // Only fixed bundled code runs in the guest. No page-provided code, URLs, credentials or host APIs are injected.
      const code = `(function(){${GUEST_SOURCE}\nreturn NoteReaderWebDocument.captureWebDocument(document,{article:${options.article !== false}});})()`;
      snapshot = await Promise.race([
        webview.executeJavaScript(code),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('WEB_TIMEOUT')), WEB_TIMEOUT_MS); }),
      ]);
    } catch (error) {
      throw new Error(error && error.message === 'WEB_TIMEOUT' ? 'WEB_TIMEOUT' : 'WEB_EXTRACTION');
    } finally { clearTimeout(timer); }
  }
  if (getWebPageUrl(view) !== url) throw new Error('WEB_CHANGED');
  return validateWebSnapshot(snapshot, url);
}

module.exports = { WEB_VIEW_TYPE, captureWebPage, getWebPageUrl, isWebPageView, validateWebSnapshot };
