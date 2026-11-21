'use strict';

const { Notice } = require('obsidian');
const { OCR_DEFAULTS, isOcrFile } = require('./ocr-contract');
const t = (plugin, zh, en) => plugin.settings.settingsLanguage === 'chinese' ? zh : en;
function ocrInstallLinks(version, platform, arch, zh) {
  const repo = 'https://github.com/laginae/note-reader-cosyvoice';
  const tag = /^\d+\.\d+\.\d+$/.test(version || '') ? version : '';
  const windows = platform === 'win32' && arch === 'x64';
  const guide = repo + '/blob/' + (tag || 'main') + '/docs/local-ocr' + (zh ? '.zh-CN' : '') + '.md';
  return { windows, guide, download: !tag ? repo + '/releases' : windows
    ? repo + '/releases/download/' + tag + '/cozy-ocr-helper-windows-x64.zip'
    : repo + '/archive/refs/tags/' + tag + '.zip' };
}
function openOcr(plugin, file = plugin.app.workspace.getActiveFile?.()) {
  if (!plugin.settings.ocrEnabled) { new Notice(t(plugin, '请在“阅读内容 → 本机 OCR”中查看下载与安装说明，再启用 OCR。', 'See the download and installation guide under Reading content > Local OCR before enabling OCR.')); return; }
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
  const zh = plugin.settings.settingsLanguage === 'chinese';
  const links = ocrInstallLinks(plugin.manifest?.version, process.platform, process.arch, zh);
  const row = container.createEl('p');
  const link = (label, url) => { const a = row.createEl('a', { text: label }); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; };
  link(links.windows ? t(plugin, '下载 Windows x64 助手', 'Download Windows x64 helper') : t(plugin, '下载源码（自行构建，未验证）', 'Download source (unverified build)'), links.download);
  row.createEl('span', { text: ' · ' });
  link(t(plugin, '安装说明', 'Installation guide'), links.guide);
  new Setting(container).setName(t(plugin, 'OCR 模型', 'OCR model'))
    .addDropdown(select => select.addOption('small', t(plugin, 'Small：中英文正文质量优先', 'Small: prioritize Chinese/English prose quality')).addOption('tiny', t(plugin, 'Tiny：速度优先', 'Tiny: prioritize speed')).setValue(plugin.settings.ocrModel || 'small').onChange(async value => { plugin.settings.ocrModel = value; await plugin.saveSettings(); }));
}
module.exports = { OCR_DEFAULTS, registerOcr, addOcrSettings, openOcr, ocrInstallLinks };
