'use strict';
const { setIcon, Notice } = require('obsidian');
const { outlineSections } = require('./reader-selection');

class SidebarOutline {
  constructor(plugin, doc) {
    this.plugin = plugin;
    this.root = doc.createElement('details'); this.root.className = 'note-reader-sidebar-outline';
    this.summary = this.root.appendChild(doc.createElement('summary'));
    this.pdfButton = this.root.appendChild(doc.createElement('button'));
    this.pdfButton.addEventListener('click', () => {
      const file = plugin.getCurrentReadableFile?.();
      if (file?.extension === 'pdf') plugin.openPdfOutline(file);
    });
    this.select = this.root.appendChild(doc.createElement('select'));
    this.actions = this.root.appendChild(doc.createElement('div')); this.actions.className = 'note-reader-cosyvoice-actions';
    this.buttons = [false, true].map(remaining => {
      const button = this.actions.appendChild(doc.createElement('button')); button.className = 'clickable-icon';
      setIcon(button, remaining ? 'list-start' : 'audio-lines');
      button.addEventListener('click', () => void plugin.runUserAction('Read section', () => this.read(remaining)));
      return button;
    });
    this.root.addEventListener('toggle', () => { if (this.root.open) this.refresh(); });
    this.select.addEventListener('change', () => this.updateButtons());
  }
  refresh() {
    const zh = this.plugin.settings.settingsLanguage === 'chinese';
    this.summary.textContent = zh ? '按大纲朗读' : 'Read by outline';
    this.select.setAttribute('aria-label', zh ? '选择章节' : 'Choose a section');
    this.buttons.forEach((button, i) => {
      button.setAttribute('aria-label', zh ? (i ? '从这一节继续' : '只朗读这一节') : (i ? 'Read from section' : 'Read section'));
    });
    const file = this.plugin.getCurrentReadableFile?.();
    this.pdfButton.hidden = file?.extension !== 'pdf';
    this.pdfButton.textContent = zh ? 'PDF 大纲与书签…' : 'PDF outline and bookmarks…';
    this.select.hidden = this.actions.hidden = file?.extension === 'pdf';
    const view = file?.extension === 'md' ? this.plugin.getActiveMarkdownView?.({ notify: false }) : null;
    const valid = view?.file?.extension === 'md' && view.file.path === file?.path;
    const text = valid ? view.editor.getValue() : '';
    const headings = valid ? this.plugin.app.metadataCache?.getFileCache(view.file)?.headings : [];
    const signature = JSON.stringify([view?.file?.path, text, headings, zh]);
    if (signature === this.signature) { this.updateButtons(); return; }
    this.signature = signature; this.view = valid ? view : null; this.text = text; this.path = view?.file?.path;
    this.entries = outlineSections(text, headings);
    this.select.replaceChildren();
    const placeholder = this.select.appendChild(this.select.ownerDocument.createElement('option'));
    placeholder.value = ''; placeholder.textContent = this.entries.length ? (zh ? '选择章节' : 'Choose a section') : (zh ? '当前笔记无可用标题' : 'No note headings available');
    this.entries.forEach((entry, i) => { const option = this.select.appendChild(this.select.ownerDocument.createElement('option')); option.value = String(i); option.textContent = `${'\u00a0\u00a0'.repeat(entry.level - 1)}${entry.title}`; });
    this.updateButtons();
  }
  updateButtons() { for (const button of this.buttons) button.disabled = this.select.value === '' || this.plugin.activeSession?.kind === 'audio-export'; }
  async read(remaining) {
    const entry = this.select.value === '' ? null : this.entries[Number(this.select.value)];
    if (!entry || this.plugin.activeSession?.kind === 'audio-export') return;
    if (this.view?.file?.path !== this.path || this.view.editor.getValue() !== this.text
      || this.plugin.getCurrentReadableFile?.()?.path !== this.path) {
      this.refresh(); new Notice(this.plugin.settings.settingsLanguage === 'chinese' ? '笔记已变化，请重新选择章节。' : 'The note changed. Choose the section again.'); return;
    }
    await this.plugin.startReading(this.text.slice(entry.from, remaining ? undefined : entry.to), entry.title,
      { file: this.view.file, sourceKind: 'markdown', sourceText: this.text, sourceOffset: entry.from });
  }
  destroy() { this.root.remove(); this.text = ''; this.entries = []; this.view = null; }
}
module.exports = { SidebarOutline };
