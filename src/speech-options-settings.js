'use strict';
const { Setting } = require('obsidian');
const { parseTerms, supportsSpeechContext } = require('./speech-options');
const { disclosure } = require('./engine-setup');

function addSpeechContextSetting(container, plugin) {
  if (!supportsSpeechContext(plugin.settings.openRouterModel)) return;
  const zh = plugin.settings.settingsLanguage === 'chinese';
  const details = container.createEl('details', { cls: 'reader-speech-options' });
  details.createEl('summary', { text: zh ? 'ElevenLabs 高级选项' : 'ElevenLabs advanced options' });
  new Setting(details).setName(zh ? '改善分段衔接（实验性）' : 'Improve segment continuity (experimental)')
    .setDesc(zh ? '默认关闭。额外发送当前朗读范围内的相邻句子，每侧最多 160 字符；继续强制 ZDR。不使用历史请求或云端词典。下次朗读生效，实际效果尚待试听验证。'
      : 'Off by default. Sends adjacent sentences within the reading range, up to 160 characters per side; ZDR remains required. No request history or cloud dictionary. Applies next session; listening validation is pending.')
    .addToggle(toggle => toggle.setValue(plugin.settings.openRouterContext === true).onChange(async value => {
      plugin.settings.openRouterContext = value; await plugin.saveSettings();
    }));
}
function addSpeechTermsSettings(container, plugin) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  container = disclosure(container, zh ? '发音词典（高级）' : 'Pronunciation dictionary (advanced)');
  new Setting(container).setName(zh ? '本地术语读法' : 'Local term pronunciations')
    .setDesc(zh ? '适用于所有语音引擎。只替换合成文本，不修改原文；规则保存在本地，下次朗读生效。在线引擎仍会收到替换后的文本。'
      : 'For all speech engines. Changes synthesis text, not the document. Rules stay local and apply next session; online engines still receive the substituted text.')
    .addToggle(toggle => toggle.setValue(plugin.settings.speechTermsEnabled === true).onChange(async value => {
      plugin.settings.speechTermsEnabled = value; await plugin.saveSettings();
    }));
  const description = zh ? '每行：术语 = 读法，例如 AI = 人工智能。区分大小写，不支持正则；最多 100 条，术语 80 字符、读法 120 字符。'
    : 'One rule per line: term = pronunciation, e.g. AI = artificial intelligence. Case-sensitive, no regex. Up to 100 rules; 80 characters per term, 120 per pronunciation.';
  const row = new Setting(container).setName(zh ? '术语规则' : 'Term rules').setDesc(description);
  row.settingEl.addClass('reader-speech-terms');
  row.addTextArea(input => {
    input.setValue(plugin.settings.speechTerms || '').setPlaceholder(zh ? 'AI = 人工智能' : 'AI = artificial intelligence').onChange(async value => {
      const { error } = parseTerms(value);
      input.inputEl.setAttribute('aria-invalid', String(Boolean(error)));
      row.setDesc(error || description);
      if (error) return;
      plugin.settings.speechTerms = value; await plugin.saveSettings();
    });
    input.inputEl.rows = 4;
    input.inputEl.maxLength = 20000;
    input.inputEl.setAttribute('aria-label', zh ? '术语规则' : 'Term rules');
  });
}
module.exports = { addSpeechContextSetting, addSpeechTermsSettings };
