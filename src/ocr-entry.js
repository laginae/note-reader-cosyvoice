'use strict';

const { Notice } = require('obsidian');
const { OCR_DEFAULTS, isOcrFile } = require('./ocr-contract');
const t = (plugin, zh, en) => plugin.settings.settingsLanguage === 'chinese' ? zh : en;
function openOcr(plugin, file = plugin.app.workspace.getActiveFile?.()) {
  if (!plugin.settings.ocrEnabled) { new Notice(t(plugin, '请先在“学术阅读 → 本机 OCR”中启用并配置 OCR 助手。', 'Enable and configure Local OCR in Academic reading first.')); return; }
  if (!isOcrFile(file)) { new Notice(t(plugin, '请打开 PDF、PNG、JPEG 或 WebP 图片。', 'Open a PDF, PNG, JPEG or WebP image.')); return; }
  plugin.ocrModal?.close();
  const { OcrModal } = require('./ocr-ui');
  plugin.ocrModal = new OcrModal(plugin, file); plugin.ocrModal.open();
}
function registerOcr(plugin) {
  plugin.addCommand({ id: 'ocr-read-current-file', name: 'Recognize PDF or image text (local OCR)', icon: 'scan-text', callback: () => openOcr(plugin) });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (plugin.settings.ocrEnabled && isOcrFile(file)) menu.addItem(item => item.setTitle(t(plugin, '识别文字并朗读（OCR）', 'Recognize text and read (OCR)')).setIcon('scan-text').onClick(() => openOcr(plugin, file)));
  }));
  plugin.register(() => { plugin.ocrModal?.close(); plugin.ocrModal = null; });
}
function addOcrSettings(container, plugin, Setting) {
  container.createEl('h3', { text: t(plugin, '本机 OCR（可选）', 'Local OCR (optional)') });
  new Setting(container).setName(t(plugin, '扫描 PDF 与图片朗读', 'Scanned PDF and image reading'))
    .setDesc(t(plugin, '默认关闭。需单独安装可信的 Cozy OCR 助手；只在手动识别时加载本机模型，不上传图片。在线音色仍会按现有授权发送识别后的文字。', 'Off by default. Install a trusted Cozy OCR helper separately. Local models load only on manual recognition; images are not uploaded. Online voices still send recognized text under your existing consent.'))
    .addToggle(toggle => toggle.setValue(plugin.settings.ocrEnabled === true).onChange(async value => { plugin.settings.ocrEnabled = value; if (!value) plugin.ocrModal?.close(); await plugin.saveSettings(); }));
  new Setting(container).setName(t(plugin, 'OCR 助手程序', 'OCR helper executable'))
    .setDesc(t(plugin, '可信助手的完整路径，不是脚本或命令行。留空使用插件目录中 ocr-helper/CozyOcr.exe（其他桌面平台为 CozyOcr）。', 'Absolute path to a trusted helper, not a script or command line. Empty uses ocr-helper/CozyOcr.exe in this plugin directory (CozyOcr on other desktop platforms).'))
    .addText(text => text.setValue(plugin.settings.ocrExecutable || '').onChange(async value => { plugin.settings.ocrExecutable = value.trim(); await plugin.saveSettings(); }));
  new Setting(container).setName(t(plugin, 'OCR 模型', 'OCR model'))
    .addDropdown(select => select.addOption('small', t(plugin, 'Small：中英文正文质量优先', 'Small: prioritize Chinese/English prose quality')).addOption('tiny', t(plugin, 'Tiny：速度优先', 'Tiny: prioritize speed')).setValue(plugin.settings.ocrModel || 'small').onChange(async value => { plugin.settings.ocrModel = value; await plugin.saveSettings(); }));
}
module.exports = { OCR_DEFAULTS, registerOcr, addOcrSettings, openOcr };
