'use strict';

const { Modal, Notice } = require('obsidian');
const path = require('node:path');
const os = require('node:os');
const { OcrProcess } = require('./ocr-process');
const { recognizeFile } = require('./ocr-pages');
const { MAX_TEXT, pageRange } = require('./ocr-contract');
const ERRORS = {
  OCR_PATH: ['请配置可信 OCR 助手的完整路径。', 'Configure an absolute path to a trusted OCR helper.'],
  OCR_HELPER: ['OCR 助手无法运行。请检查安装、路径和适用平台。', 'OCR helper could not run. Check its installation, path and platform.'],
  OCR_PROTOCOL: ['OCR 助手返回了无效结果，请检查助手版本。', 'Invalid OCR helper response. Check the helper version.'],
  OCR_RANGE: ['请输入有效页码范围，每次最多 10 页。', 'Enter a valid page range, up to 10 pages per job.'],
  OCR_IMAGE: ['图片格式无效或超过 2500 万像素。请使用较小的 PNG、JPEG 或 WebP。', 'Invalid image or over 25 megapixels. Use a smaller PNG, JPEG or WebP.'],
  OCR_SIZE: ['PDF 不得超过 100 MB，图片不得超过 20 MB。', 'PDF limit: 100 MB. Image limit: 20 MB.'],
  OCR_TEXT: ['识别文字超过 20 万字符，请缩小页码范围。', 'Text exceeds 200,000 characters. Use a smaller page range.'],
  OCR_CHANGED: ['原文件已变化，请关闭并重新识别。', 'The source file changed. Close and recognize again.'],
  OCR_TIMEOUT: ['识别超时。请缩小范围或尝试 Tiny 模型。', 'Recognition timed out. Reduce the range or try Tiny.'],
  OCR_CANCELLED: ['已取消，已完成页可继续校对。', 'Cancelled. Completed pages remain available for review.'],
};
function node(parent, tag, text = '', cls = '') {
  const el = parent.ownerDocument.createElement(tag); el.textContent = text; el.className = cls; parent.append(el); return el;
}
class OcrModal extends Modal {
  constructor(plugin, file) { super(plugin.app); this.plugin = plugin; this.file = file; this.pages = []; this.closed = false; }
  t(zh, en) { return this.plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
  button(parent, zh, en, action) {
    const el = node(parent, 'button', this.t(zh, en)); el.type = 'button'; el.addEventListener('click', () => { void action(); }); return el;
  }
  onOpen() {
    this.modalEl.classList.add('note-reader-ocr-modal');
    node(this.contentEl, 'h2', this.t('识别文字并朗读', 'Recognize text and read'));
    node(this.contentEl, 'p', this.file.name, 'note-reader-ocr-filename');
    const fields = node(this.contentEl, 'div', '', 'note-reader-ocr-fields');
    const input = (zh, en, type) => { const label = node(fields, 'label', this.t(zh, en)); return node(label, type); };
    this.from = input('起始页', 'First page', 'input'); this.to = input('结束页', 'Last page', 'input');
    for (const el of [this.from, this.to]) { el.type = 'number'; el.min = '1'; el.step = '1'; el.value = '1'; }
    this.rotation = input('顺时针旋转', 'Clockwise rotation', 'select');
    for (const value of [0,90,180,270]) { const option = node(this.rotation, 'option', `${value}°`); option.value = String(value); }
    const preference = node(this.contentEl, 'label', '', 'note-reader-ocr-preference');
    this.prefer = node(preference, 'input'); this.prefer.type = 'checkbox'; this.prefer.checked = true;
    node(preference, 'span', this.t('已有文字的页面直接提取', 'Use existing page text when available'));
    if (this.file.extension.toLowerCase() !== 'pdf') { this.from.parentElement.hidden = this.to.parentElement.hidden = preference.hidden = true; }
    const actions = node(this.contentEl, 'div', '', 'note-reader-ocr-actions');
    this.recognizeButton = this.button(actions, '识别', 'Recognize', () => this.recognize());
    this.cancelButton = this.button(actions, '取消识别', 'Cancel recognition', () => this.controller?.abort()); this.cancelButton.disabled = true;
    this.clearButton = this.button(actions, '清除结果', 'Clear results', () => { this.pages = []; this.drawPages(); });
    this.status = node(this.contentEl, 'p'); this.status.setAttribute('role', 'status');
    this.pageSelect = node(this.contentEl, 'select'); this.pageSelect.setAttribute('aria-label', this.t('结果页', 'Result page'));
    this.pageSelect.addEventListener('change', () => this.showPage());
    this.preview = node(this.contentEl, 'textarea', '', 'note-reader-ocr-preview'); this.preview.maxLength = MAX_TEXT;
    this.preview.setAttribute('aria-label', this.t('可校对的识别文字', 'Editable recognized text'));
    this.preview.addEventListener('input', () => { const page = this.pages[Number(this.pageSelect.value)]; if (page) page.text = this.preview.value; this.updateButtons(); });
    node(this.contentEl, 'p', this.t('识别可能漏字或误读公式，请先校对。OCR 在本机完成；在线语音会发送朗读文字。', 'OCR may miss text or misread formulas. Review before reading. OCR is local; online voices transmit the text you read.'), 'setting-item-description');
    const footer = node(this.contentEl, 'div', '', 'note-reader-ocr-actions');
    this.readPage = this.button(footer, '朗读本页', 'Read page', () => this.read('page'));
    this.readSelection = this.button(footer, '朗读选中文字', 'Read selected text', () => this.read('selection'));
    this.readAll = this.button(footer, '朗读全部结果', 'Read all results', () => this.read('all'));
    this.button(footer, '关闭', 'Close', () => this.close());
    this.drawPages();
  }
  updateButtons() {
    const hasText = this.pages.some(page => page.text.trim());
    for (const el of [this.readAll, this.readPage, this.readSelection]) el.disabled = this.busy || !hasText;
    this.recognizeButton.disabled = !!this.busy; this.cancelButton.disabled = !this.busy;
    for (const el of [this.from, this.to, this.rotation, this.prefer, this.clearButton]) el.disabled = !!this.busy;
    this.preview.readOnly = !!this.busy;
  }
  drawPages() {
    const index = this.pageSelect.value;
    this.pageSelect.replaceChildren();
    this.pages.forEach((page, i) => { const el = node(this.pageSelect, 'option', `${this.t('第', 'Page')} ${page.page}${page.method === 'text' ? this.t('（原有文字）', ' (existing text)') : ' (OCR)'}`); el.value = String(i); });
    this.pageSelect.value = this.pages[Number(index)] ? String(Number(index)) : '0'; this.showPage();
  }
  showPage() { this.preview.value = this.pages[Number(this.pageSelect.value)]?.text || ''; this.updateButtons(); }
  async recognize() {
    if (this.busy || this.closed) return;
    let helper, timer;
    try {
      pageRange(this.from.value, this.to.value, 2000);
      const root = this.app.vault.adapter.getBasePath?.();
      const configured = this.plugin.settings.ocrExecutable?.trim();
      if (!configured && !root) throw new Error('OCR_PATH');
      const executable = configured || path.join(root, this.plugin.manifest.dir || `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`, 'ocr-helper', os.platform() === 'win32' ? 'CozyOcr.exe' : 'CozyOcr');
      helper = new OcrProcess(executable, this.plugin.settings.ocrModel);
      this.controller = new AbortController(); this.busy = true; this.pages = []; this.drawPages();
      this.status.textContent = this.t('正在准备…', 'Preparing...');
      let timedOut = false;
      timer = setTimeout(() => { timedOut = true; this.controller.abort(); }, 5 * 60 * 1000);
      try {
        await recognizeFile({ plugin: this.plugin, file: this.file, start: Number(this.from.value), end: Number(this.to.value), rotation: Number(this.rotation.value), preferText: this.prefer.checked,
          helper, signal: this.controller.signal, document: this.contentEl.ownerDocument,
          onStatus: number => { if (!this.closed) this.status.textContent = this.t(`正在处理第 ${number} 页…`, `Processing page ${number}...`); },
          onPage: page => { if (!this.closed) { this.pages.push(page); this.drawPages(); } } });
      } catch (error) { if (timedOut) throw new Error('OCR_TIMEOUT'); throw error; }
      if (!this.closed) {
        const low = this.pages.reduce((sum, page) => sum + page.lowConfidence, 0);
        this.status.textContent = this.pages.some(page => page.text.trim())
          ? this.t(`已完成 ${this.pages.length} 页，${low} 行置信度偏低。`, `${this.pages.length} page(s) complete; ${low} low-confidence line(s).`)
          : this.t('未识别出文字。可检查方向、清晰度或取消“已有文字直接提取”。', 'No text found. Check orientation, resolution or disable existing-text extraction.');
      }
    } catch (error) {
      if (!this.closed) this.status.textContent = this.t(...(ERRORS[this.controller?.signal.aborted && error.message !== 'OCR_TIMEOUT' ? 'OCR_CANCELLED' : error.message] || ['识别失败。文件可能损坏、受密码保护或格式不受支持。', 'Recognition failed. The file may be damaged, password-protected or unsupported.']));
      if (error.message === 'OCR_CHANGED') { this.pages = []; this.drawPages(); }
    } finally { clearTimeout(timer); helper?.close(); this.busy = false; if (!this.closed) this.updateButtons(); }
  }
  async read(scope) {
    if (this.busy || this.closed) return;
    let text = scope === 'all' ? this.pages.map(page => page.text).join('\n\n') : this.preview.value;
    if (scope === 'selection') text = text.slice(this.preview.selectionStart, this.preview.selectionEnd);
    if (!text.trim()) { new Notice(this.t('请先选中文字。', 'Select some text first.')); return; }
    if (text.length > MAX_TEXT) { new Notice(this.t(...ERRORS.OCR_TEXT)); return; }
    if (this.plugin.activeSession?.kind === 'audio-export') { new Notice(this.t('请先完成音频导出。', 'Wait for audio export to finish.')); return; }
    this.close();
    await this.plugin.runUserAction('Read OCR text', async () => {
      await this.plugin.activateControlView();
      await this.plugin.startReading(text, `${this.file.basename || this.file.name} (OCR)`, { plainText: true, pdfText: true, sourceKind: 'ocr', skipReadingPosition: true });
    });
  }
  onClose() {
    this.closed = true; this.controller?.abort(); this.pages = [];
    if (this.preview) this.preview.value = '';
    if (this.plugin.ocrModal === this) this.plugin.ocrModal = null;
    this.contentEl.replaceChildren();
  }
}
module.exports = { OcrModal };
