'use strict';
const { academicOptions } = require('./academic-speech');
const { getHtmlReaderDocument } = require('./html-text');
const { highlightDocument, clearDocumentHighlight, isDocumentHighlightCurrent } = require('./dom-highlights');
const { updateWebHighlight, getWebPageUrl } = require('./web-page');
const { getSpeechParts } = require('./speech-parts');
function htmlReadingTarget(session, highlight, settings) {
  const chunk = session.chunks[highlight.index];
  const sentence = settings.readingHighlight === 'sentence' && highlight.sentence;
  const part = Number.isInteger(session.currentPartIndex) ? session.currentPartIndex : 0;
  const valid = sentence && Number.isInteger(sentence.start) && Number.isInteger(sentence.end)
    && sentence.start >= 0 && sentence.end > sentence.start && sentence.end <= chunk.length;
  return { text: valid ? chunk.slice(sentence.start, sentence.end) : getSpeechParts(session, highlight.index)[part] || chunk,
    key: `${part}:${valid ? `${sentence.start}-${sentence.end}` : ''}` };
}
class HtmlReadingHighlights {
  constructor(plugin) { this.plugin=plugin;this.documents=new Set();this.markedDocuments=new Set();this.htmlObservers=new Map();this.web=null;this.key='';this.chain=Promise.resolve(); }
  clear() {
    for(const doc of this.documents)clearDocumentHighlight(doc);
    this.documents.clear();
    this.markedDocuments.clear();
    for (const { observer } of this.htmlObservers.values()) observer.disconnect();
    this.htmlObservers.clear();
    if(this.web){const view=this.web;this.chain=this.chain.catch(()=>{}).then(()=>updateWebHighlight(view,{})).catch(()=>{});}
    this.web=null;this.key='';
  }
  update() {
    const p=this.plugin,s=p.activeSession,h=p.getCurrentReadingHighlight();
    if(p.systemSpeechUnloaded||!s||!h||p.settings.webReadingHighlight===false||p.settings.readingHighlight==='off'||!['html','web'].includes(s.sourceKind)){this.clear();return;}
    if (s.sourceKind === 'web') {
      const c = s.webContext, v = c?.webView;
      if (!v || !p.getWebPageLeaves().some(leaf => leaf.view === v)
        || getWebPageUrl(v) !== c.webUrl || v.webview !== c.webElement || v.mode !== c.webMode
        || p.getWebPageState(v).revision !== c.webRevision) { this.clear(); return; }
    } else if (!p.getHtmlReaderLeaves().some(({view}) => view.file?.path === s.filePath && view.file?.stat?.mtime === s.fileMtime)) {
      this.clear(); return;
    }
    const target = htmlReadingTarget(s, h, p.settings);
    const key=[s.id,h.index,target.key,p.settings.readingHighlight,p.settings.highlightColor,p.settings.highlightStrength,p.settings.webReadingFollow].join(':');
    const readerRoot = s.sourceKind === 'web' && s.webContext.webView.mode === 'reader' ? s.webContext.webView.readerView : null;
    const htmlDocuments = s.sourceKind === 'html' ? [...new Set(p.getHtmlReaderLeaves()
      .filter(({view}) => view.file?.path === s.filePath && view.file?.stat?.mtime === s.fileMtime)
      .map(({view}) => getHtmlReaderDocument(view)).filter(Boolean))] : readerRoot?.ownerDocument ? [readerRoot.ownerDocument] : [];
    const local = s.sourceKind === 'html' || s.webContext?.webView.mode === 'reader';
    if(key===this.key && (!local || (htmlDocuments.length === this.documents.size
      && htmlDocuments.every(doc => this.documents.has(doc) && this.htmlObservers.get(doc)?.root === (readerRoot || doc.body)
        && (!this.markedDocuments.has(doc) || isDocumentHighlightCurrent(doc))))))return;
    this.clear();this.key=key;
    const speechSettings = s.synthesisSettings || p.settings;
    const options={text:target.text,color:p.settings.highlightColor,strength:p.settings.highlightStrength,follow:p.settings.webReadingFollow===true,restoreOnChange:true,academic:academicOptions(speechSettings)};
    if (s.sourceKind === 'html' && typeof p.prepareHtmlSpeechText === 'function') {
      options.speechTransform = text => p.prepareHtmlSpeechText(text, speechSettings);
    }
    if(local) {
      for (const doc of htmlDocuments) {
        const root = readerRoot || doc.body;
        this.documents.add(doc);
        try {
          const matched = highlightDocument(doc, options, root)
            || (target.text !== s.chunks[h.index] && highlightDocument(doc, { ...options, text: s.chunks[h.index] }, root));
          if (matched) this.markedDocuments.add(doc);
        } catch (_) { clearDocumentHighlight(doc); }
        if (root && doc.defaultView?.MutationObserver) {
          const observer = new doc.defaultView.MutationObserver(() => {
            if (this.documents.has(doc) && this.key === key) this.key = '';
          });
          observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ['hidden','aria-hidden','class','style'] });
          this.htmlObservers.set(doc, { observer, root });
        }
      }
    } else {
      const context=s.webContext,view=context?.webView;
      if(!view||getWebPageUrl(view)!==context.webUrl||p.getWebPageState(view).revision!==context.webRevision)return;
      this.web=view;
      this.chain=this.chain.catch(()=>{}).then(async ()=>{
        if(this.key!==key||p.activeSession!==s)return;
        const matched = await updateWebHighlight(view,{...options,url:context.webUrl,restoreOnChange:true});
        if (!matched && target.text !== s.chunks[h.index] && this.key === key && p.activeSession === s
          && getWebPageUrl(view) === context.webUrl && p.getWebPageState(view).revision === context.webRevision) {
          return updateWebHighlight(view, { ...options, text: s.chunks[h.index], url: context.webUrl, restoreOnChange: true });
        }
        return matched;
      }).catch(()=>{});
    }
  }
  destroy(){this.clear();}
}
module.exports={HtmlReadingHighlights,htmlReadingTarget};
