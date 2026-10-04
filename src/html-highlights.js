'use strict';
const { getHtmlReaderDocument } = require('./html-text');
const { highlightDocument, clearDocumentHighlight } = require('./dom-highlights');
const { updateWebHighlight, getWebPageUrl } = require('./web-page');
class HtmlReadingHighlights {
  constructor(plugin) { this.plugin=plugin;this.documents=new Set();this.web=null;this.key='';this.chain=Promise.resolve(); }
  clear() {
    for(const doc of this.documents)clearDocumentHighlight(doc);
    this.documents.clear();
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
    const key=[s.id,h.index,p.settings.highlightColor,p.settings.highlightStrength,p.settings.webReadingFollow].join(':');
    if(key===this.key)return;
    this.clear();this.key=key;
    const options={text:s.chunks[h.index],color:p.settings.highlightColor,strength:p.settings.highlightStrength,follow:p.settings.webReadingFollow===true};
    if(s.sourceKind==='html') {
      for(const {view} of p.getHtmlReaderLeaves())if(view.file?.path===s.filePath&&view.file?.stat?.mtime===s.fileMtime){
        const doc=getHtmlReaderDocument(view);if(doc){try { highlightDocument(doc,options);this.documents.add(doc); } catch (_) { clearDocumentHighlight(doc); }}
      }
    } else {
      const context=s.webContext,view=context?.webView;
      if(!view||getWebPageUrl(view)!==context.webUrl||p.getWebPageState(view).revision!==context.webRevision)return;
      this.web=view;
      if (view.mode === 'reader' && view.readerView?.ownerDocument) this.documents.add(view.readerView.ownerDocument);
      this.chain=this.chain.catch(()=>{}).then(()=>{
        if(this.key!==key||p.activeSession!==s)return;
        return updateWebHighlight(view,{...options,url:context.webUrl});
      }).catch(()=>{});
    }
  }
  destroy(){this.clear();}
}
module.exports={HtmlReadingHighlights};
