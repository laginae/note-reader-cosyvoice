'use strict';
const { Modal, Notice, loadPdfJs, setIcon, Setting } = require('obsidian');
const { scanPdfOutline, inferOutline, sectionRange } = require('./pdf-outline');
const { writePdfBookmarks } = require('./pdf-bookmarks');
const { PdfOutlineCache } = require('./pdf-outline-cache');
const { createHash } = require('crypto');
const digest = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const { makeMovableModal } = require('./movable-modal');

function equalBytes(a, b) {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
async function unusedPath(vault, file, suffix) {
  const base = file.path.replace(/\.pdf$/i, '') + suffix;
  for (let i = 0; i < 1000; i++) {
    const path = `${base}${i ? '-' + i : ''}.pdf`;
    if (!await vault.adapter.exists(path)) return path;
  }
  throw new Error('Could not find an unused PDF filename.');
}

async function persistBookmarks(vault, file, original, output, target, backup) {
  if (!equalBytes(await vault.readBinary(file), original)) throw new Error('PDF changed. Reopen the outline.');
  if (backup) {
    if (backup === file.path || target !== file.path) throw new Error('Invalid backup destination.');
    const backupFile = await vault.createBinary(backup, original.slice(0));
    if (!equalBytes(await vault.readBinary(backupFile), original)) throw new Error('Backup verification failed. Original unchanged.');
    if (!equalBytes(await vault.readBinary(file), original)) throw new Error('PDF changed during backup. Original unchanged.');
    await vault.modifyBinary(file, output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
  } else {
    if (target === file.path) throw new Error('Overwriting requires a backup.');
    await vault.createBinary(target, output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
  }
  const saved = vault.getAbstractFileByPath(target);
  if (!saved || !equalBytes(await vault.readBinary(saved), output)) throw new Error('Saved PDF verification failed. Keep the backup.');
}

class BookmarkConfirm extends Modal {
  constructor(app, message, label, action) { super(app); this.message = message; this.label = label; this.action = action; }
  onOpen() {
    const message = this.contentEl.createEl('p', { text: this.message });
    message.style.whiteSpace = 'pre-line'; message.style.overflowWrap = 'anywhere';
    const button = this.contentEl.createEl('button', { text: this.label, cls: 'mod-warning' });
    button.addEventListener('click', () => { button.disabled = true; this.close(); void this.action(); });
  }
}

class PdfOutlineModal extends Modal {
  constructor(plugin, file) {
    super(plugin.app); this.plugin = plugin; this.file = file; this.closed = false; this.busy = false;
    this.cache = plugin.pdfOutlineCache ||= new PdfOutlineCache();
  }
  t(zh, en) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  button(parent, icon, label, action) {
    const button = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
    setIcon(button, icon);
    button.addEventListener('click', () => {
      if (this.busy) return;
      void this.plugin.runUserAction('PDF outline', action);
    });
    return button;
  }
  async onOpen() {
    this.modalEl.classList.add('note-reader-pdf-outline-modal');
    const header = this.contentEl.createDiv({ cls: 'note-reader-outline-drag', attr: { tabindex: '0',
      'aria-label': this.t('移动大纲窗口；方向键移动，Home 居中', 'Move outline window; arrow keys move, Home centers') } });
    header.createEl('h2', { text: this.t('PDF 大纲与书签', 'PDF outline and bookmarks') });
    this.movable = makeMovableModal(this.modalEl, header);
    this.button(header, 'scan', this.t('窗口居中', 'Center window'), () => this.movable.center());
    this.status = this.contentEl.createEl('p', { attr: { 'role': 'status' } });
    this.controls = this.contentEl.createDiv({ cls: 'note-reader-outline-controls' });
    this.list = this.contentEl.createDiv({ cls: 'note-reader-pdf-outline-list' });
    this.footer = this.contentEl.createDiv();
    this.busy = true;
    try {
      if (this.file.stat.size > 200 * 1024 * 1024) throw new Error('PDF exceeds 200 MB.');
      this.mtime = this.file.stat.mtime; this.size = this.file.stat.size; this.path = this.file.path;
      const cached = this.cache.get(this.file);
      if (cached) {
        this.model = cached.model; this.entries = cached.entries; this.sourceDigest = cached.sourceDigest;
        this.mode = cached.mode; this.overwrite = cached.overwrite; this.draw(); return;
      }
      this.bytes = await this.app.vault.readBinary(this.file);
      this.sourceDigest = digest(this.bytes);
      const lib = await loadPdfJs();
      if (this.closed) return;
      this.task = lib.getDocument({ data: new Uint8Array(this.bytes.slice(0)) });
      const pdf = await this.task.promise;
      try {
        this.model = await scanPdfOutline(pdf, { isCurrent: () => !this.closed,
          progress: (page, total) => { this.status.textContent = this.t('本地分析', 'Local analysis') + ` ${page} / ${total}`; } });
      } finally { await pdf.destroy(); this.task = null; }
      if (this.closed) return;
      this.assertValid();
      this.entries = this.model.entries.map(entry => ({ ...entry, enabled: true }));
      this.draw();
    } catch (error) { if (!this.closed) this.status.textContent = error.message; }
    finally { this.busy = false; }
  }
  valid() {
    return this.file.path === this.path && this.file.stat.mtime === this.mtime && this.file.stat.size === this.size;
  }
  assertValid() { if (!this.valid()) throw new Error(this.t('PDF 已变化，请关闭并重新打开大纲。', 'PDF changed. Reopen the outline.')); }
  draw() {
    this.status.textContent = this.entries.some(e => e.inferred)
      ? this.t('自动识别，请核对标题、层级和定位。', 'Automatically detected. Review titles, levels and destinations.')
      : this.t('来自 PDF 已有书签。', 'From existing PDF bookmarks.');
    if (!this.entries.length) this.status.textContent = this.t('未找到标题；扫描件需要先进行 OCR。', 'No headings found; scanned PDFs need OCR first.');
    this.controls.replaceChildren(); this.list.replaceChildren(); this.footer.replaceChildren();
    this.button(this.controls, 'list-checks', this.t('全选（写入全部书签）', 'Select all bookmarks'), () => this.selectAll(true));
    this.button(this.controls, 'list-x', this.t('全不选（不写入任何条目）', 'Deselect all bookmarks'), () => this.selectAll(false));
    this.button(this.controls, 'scan-text', this.t('重新自动识别（放弃未保存编辑）', 'Detect headings again (discard edits)'), () => {
      this.entries = inferOutline(this.model.pages).map(e => ({ ...e, enabled: true })); this.draw();
    });
    this.entries.forEach((entry, index) => {
      const row = this.list.createDiv({ cls: 'note-reader-pdf-outline-row' });
      const included = row.createEl('input', { type: 'checkbox', attr: { 'aria-label': this.t('写入此书签', 'Include bookmark') } });
      included.checked = entry.enabled; included.addEventListener('change', () => {
        entry.enabled = included.checked; this.saveButton.disabled = !this.entries.some(item => item.enabled);
      });
      const title = row.createEl('input', { type: 'text', value: entry.title, attr: { 'aria-label': this.t('标题', 'Title'), maxlength: '500' } });
      title.addEventListener('input', () => { entry.title = title.value; });
      const level = row.createEl('select', { attr: { 'aria-label': this.t('层级', 'Level') } });
      for (let n=1;n<=6;n++) level.createEl('option', { value: String(n), text: String(n) });
      level.value = String(entry.level); level.addEventListener('change', () => { entry.level = Number(level.value); });
      row.createEl('span', { text: `p. ${entry.page}`, cls: 'note-reader-pdf-outline-page' });
      const actions = row.createDiv({ cls: 'note-reader-pdf-outline-actions' });
      this.button(actions, 'locate', this.t('定位到本节', 'Go to section'), async () => {
        this.assertValid();
        await this.app.workspace.openLinkText(`${this.path}#page=${entry.page}&offset=${Math.round(entry.x)},${Math.round(entry.y)},0`, '', false);
      });
      for (const remaining of [false, true]) this.button(actions, remaining ? 'list-start' : 'audio-lines',
        remaining ? this.t('从本节继续朗读', 'Read from section') : this.t('只朗读本节', 'Read section'), async () => {
          this.assertValid();
          if (this.plugin.activeSession?.kind === 'audio-export') throw new Error(this.t('请先完成音频导出。', 'Finish the audio export first.'));
          const range = sectionRange(this.entries, index, this.model.pages, remaining);
          this.close();
          await this.plugin.readCurrentPdf(this.file, { outlineRange: { ...range, fileMtime: this.mtime, title: entry.title } });
        });
    });
    new Setting(this.footer).setName(this.t('已有书签', 'Existing bookmarks'))
      .setDesc(this.t('“保留”不应用列表编辑；“合并”保留旧条目；修改已有标题或层级请选择“替换”。', 'Keep ignores list edits; merge retains old entries. Choose replace to edit existing titles or levels.')).addDropdown(drop => {
      drop.addOption('keep', this.t('保留已有书签', 'Keep existing'))
        .addOption('merge', this.t('合并（相同标题和页码不重复）', 'Merge (deduplicate title and page)'))
        .addOption('replace', this.t('用当前列表替换', 'Replace with this list'))
        .setValue(this.mode || (this.model.bookmarks.length ? 'keep' : 'replace'))
        .onChange(value => { this.mode = value; });
      this.mode ||= this.model.bookmarks.length ? 'keep' : 'replace';
    });
    new Setting(this.footer).setName(this.t('覆盖原 PDF', 'Overwrite original PDF'))
      .setDesc(this.t('覆盖前自动备份；未开启则另存副本。', 'Automatically back up before overwrite; otherwise save a copy.'))
      .addToggle(toggle => toggle.setValue(this.overwrite ?? this.plugin.settings.pdfBookmarksOverwrite === true)
        .onChange(value => { this.overwrite = value; }));
    const save = this.footer.createEl('button', { text: this.t('保存 PDF 书签…', 'Save PDF bookmarks…') });
    this.saveButton = save;
    save.disabled = !this.entries.some(entry => entry.enabled);
    save.addEventListener('click', () => {
      if (this.busy) return;
      this.busy = true;
      void this.prepareSave().catch(error => { this.status.textContent = error.message; }).finally(() => { this.busy = false; });
    });
  }
  async prepareSave() {
    this.assertValid();
    if (!this.bytes) {
      this.bytes = await this.app.vault.readBinary(this.file);
      this.assertValid();
      if (digest(this.bytes) !== this.sourceDigest) {
        this.bytes = null; this.cache.delete(this.path); this.savedOriginal = true;
        throw new Error('PDF changed. Reopen the outline.');
      }
    }
    if (this.plugin.activeSession?.filePath === this.path) throw new Error(this.t('请先停止此 PDF 的朗读或导出，再保存书签。', 'Stop reading or exporting this PDF before saving bookmarks.'));
    const overwrite = this.overwrite ?? this.plugin.settings.pdfBookmarksOverwrite === true;
    const rows = this.entries.filter(e => e.enabled).map(e => ({ ...e }));
    if (!rows.length) throw new Error(this.t('请至少保留一个书签。', 'Include at least one bookmark.'));
    const bytes = await writePdfBookmarks(this.bytes, rows, this.mode, this.model.bookmarks);
    if (this.closed) return;
    const target = overwrite ? this.path : await unusedPath(this.app.vault, this.file, '.bookmarks');
    const backup = overwrite ? await unusedPath(this.app.vault, this.file, '.before-bookmarks') : null;
    const message = this.t('将保存到：', 'Save to: ') + target + (backup ? '\n' + this.t('原文件备份：', 'Original backup: ') + backup : '')
      + '\n' + this.t('请确认标题和层级。正文排版不变。', 'Confirm the titles and levels. Page layout is unchanged.');
    new BookmarkConfirm(this.app, message, this.t('确认保存', 'Confirm save'), async () => {
      if (this.closed || this.busy) return;
      this.busy = true;
      try {
        this.assertValid();
        if (this.plugin.activeSession?.filePath === this.path) throw new Error('Stop PDF playback before saving.');
        await persistBookmarks(this.app.vault, this.file, this.bytes, bytes, target, backup);
        if (overwrite) { this.cache.delete(this.path); this.savedOriginal = true; }
        new Notice(this.t('书签已保存：', 'Bookmarks saved: ') + target, 10000); this.close();
      } catch (error) { this.status.textContent = error.message; }
      finally { this.busy = false; }
    }).open();
  }
  selectAll(enabled) { for (const entry of this.entries) entry.enabled = enabled; this.draw(); }
  onClose() {
    if (this.closed) return;
    this.closed = true;
    this.movable?.destroy();
    if (this.model && this.entries && this.valid() && !this.savedOriginal) {
      this.cache.set(this.file, { model: this.model, entries: this.entries, sourceDigest: this.sourceDigest,
        mode: this.mode, overwrite: this.overwrite });
    }
    void this.task?.destroy(); this.contentEl.empty(); this.bytes = null;
  }
}

function addPdfOutlineSettings(container, plugin) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  new Setting(container).setName(zh ? 'PDF 书签默认覆盖原文件' : 'Overwrite original PDF for bookmarks by default')
    .setDesc(zh ? '默认关闭。开启后，写入前仍需确认并自动保存原文件备份；加密或带签名的 PDF 不允许写入。' : 'Off by default. Overwrites still require confirmation and a verified backup. Encrypted or signed PDFs cannot be written.')
    .addToggle(toggle => toggle.setValue(plugin.settings.pdfBookmarksOverwrite === true).onChange(async value => {
      plugin.settings.pdfBookmarksOverwrite = value; await plugin.saveSettings();
    }));
}
module.exports = { PdfOutlineModal, addPdfOutlineSettings, equalBytes, unusedPath, persistBookmarks };
