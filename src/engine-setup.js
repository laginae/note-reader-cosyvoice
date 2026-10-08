'use strict';

// UI state only: switching methods never clears a saved provider configuration.
function methodFor(engine, mobile = false) {
  if (engine === (mobile ? 'system' : 'system-tts')) return 'system';
  if (engine === (mobile ? 'remote-cosyvoice' : 'local-cosyvoice')) return 'local';
  return 'online';
}
function disclosure(parent, title, open = false) {
  const details = parent.createEl('details', { cls: 'reader-setup-details' });
  details.open = open;
  details.createEl('summary', { text: title });
  return details;
}
function renderEngineChoice(parent, tab, Setting, mobile, labels) {
  const plugin = tab.plugin, engine = plugin.settings.speechEngine;
  const t = (en, zh) => plugin.settings.settingsLanguage === 'chinese' ? zh : en;
  const method = methodFor(engine, mobile);
  tab.engineChoiceControls = [];
  const control = component => {
    tab.engineChoiceControls.push(component);
    component.setDisabled?.(Boolean(plugin.settingsPreview));
    return component;
  };
  tab.engineChoices ||= {};
  tab.engineChoices[method] = engine;
  const groups = {
    system: [[mobile ? 'system' : 'system-tts', labels.system]],
    local: [[mobile ? 'remote-cosyvoice' : 'local-cosyvoice', labels.local]],
    online: mobile
      ? [['mimo', 'Xiaomi MiMo'], ['openrouter', 'OpenRouter'], ['azure', 'Microsoft Azure'], ['byok', labels.byok]]
      : [['mimo-tts', 'Xiaomi MiMo'], ['openrouter-tts', 'OpenRouter'], ['azure-speech', 'Microsoft Azure'], ['byok-tts', labels.byok], ['edge-tts', labels.edge]],
  };
  const change = async value => {
    if (plugin.settingsPreview) return;
    tab.setupCompleted = false;
    tab.previewMessage = '';
    plugin.settings.speechEngine = value;
    await plugin.saveSettings();
    tab.display();
  };
  const settings = plugin.settings;
  const onlineReady = mobile
    ? Boolean(engine === 'byok' ? settings.byokProfile?.consent : settings[engine + 'Consent'] && settings[engine + 'SecretName'])
    : Boolean(({ 'mimo-tts': settings.mimoConsent && (settings.mimoSecretName || settings.mimoKeyPath),
      'openrouter-tts': settings.openRouterConsent && (settings.openRouterSecretName || settings.openRouterKeyPath),
      'azure-speech': settings.azureSpeechConsent && (settings.azureSpeechSecretName || settings.azureSpeechKeyPath),
      'edge-tts': settings.edgeTtsConsent, 'byok-tts': settings.byokProfiles?.find(p => p.id === settings.byokActiveProfileId)?.consent })[engine]);
  const localReady = mobile ? settings.remoteConsent && settings.remoteEndpoint : labels.localReady;
  const ready = method === 'system' || (method === 'local' ? localReady : onlineReady);
  const start = disclosure(parent, t('Quick start', '快速开始'), !tab.setupCompleted && !ready);
  tab.quickStart = start;
  new Setting(start).setName(t('System speech', '系统语音'))
    .setDesc(t('No API key required. Uses available device voices; voice quality and availability vary.', '无需 API 密钥，使用设备可用音色；音质和可用性因设备而异。'))
    .addButton(button => control(button).setButtonText(t('Use system speech', '使用系统语音')).onClick(() => change(mobile ? 'system' : 'system-tts')));
  new Setting(parent).setName(t('Reading method', '朗读方式'))
    .setDesc(method === 'system' ? t('No API key required. Voices depend on your device.', '无需 API 密钥，可用音色取决于设备。')
      : method === 'local' ? (mobile ? t('Connect to your own HTTPS speech service; text leaves this device.', '连接自建 HTTPS 语音服务，文本会离开此设备。')
        : t('Requires a configured local speech model and wrapper.', '需要已配置的本地语音模型和包装脚本。'))
      : t('Uses your service account. Text is sent to the selected provider; charges may apply.', '使用你的服务商账号；文本发送给所选服务，可能计费。'))
    .addDropdown(dropdown => control(dropdown)
      .addOption('system', t('System speech', '系统语音'))
      .addOption('online', t('Online speech', '在线语音'))
      .addOption('local', mobile ? t('Self-hosted service', '自建服务') : t('Local model', '本地模型'))
      .setValue(method).onChange(value => {
        if (groups[value]) return change(tab.engineChoices[value] || groups[value][0][0]);
      }));
  if (method === 'online') new Setting(parent).setName(t('Speech service', '语音服务'))
    .addDropdown(dropdown => {
      control(dropdown);
      for (const [id, label] of groups.online) dropdown.addOption(id, label);
      dropdown.setValue(engine).onChange(value => {
        if (groups.online.some(([id]) => id === value)) return change(value);
      });
    });
  return method;
}
function previewError(error, chinese) {
  const text = String(error?.message || error || '');
  const t = (en, zh) => chinese ? zh : en;
  if (/configuration incomplete/i.test(text)) return t('Configuration incomplete. Check the authorization, required fields and API secret.', '配置尚未完成，请检查在线授权、必填项和 API 秘密。');
  if (/consent|permission|授权|允许.*处理/i.test(text)) return t('Allow online processing for this configuration before testing.', '请先允许当前配置进行在线处理，再测试。');
  if (/secret|credential|key|401|密钥|秘密/i.test(text)) return t('Check the selected API secret and its validity.', '请检查所选 API 秘密及密钥是否有效。');
  if (/429|quota|balance|credit|额度|余额/i.test(text)) return t('Check account balance or request limits, then try again later.', '请检查账号余额或请求限额，稍后再试。');
  if (/voice|model|音色|模型/i.test(text)) return t('Check that the selected voice and model are available.', '请检查所选音色与模型是否可用。');
  if (/system|installed|speech.*unavailable|系统/i.test(text)) return t('Check installed system voices and refresh the voice list.', '请检查已安装的系统音色，并刷新音色列表。');
  return t('Test failed. Check connection, service address and privacy-route availability. No settings were reset.',
    '测试失败。请检查网络、服务地址及隐私路由是否可用；未重置任何设置。');
}
function renderPreview(parent, tab, setIcon) {
  const plugin = tab.plugin, zh = plugin.settings.settingsLanguage === 'chinese';
  const t = (en, cn) => zh ? cn : en;
  const sample = zh ? '你好，这是语音测试，祝你阅读愉快。' : 'Hello, this is a short voice test.';
  const box = parent.createDiv({ cls: 'reader-setup-preview' });
  if (!['system', 'system-tts'].includes(plugin.settings.speechEngine)) {
    box.createEl('p', { cls: 'setting-item-description', text: t('Only the sample below is used. Online services may charge for this test; your notes are not read.', '仅使用下方测试短句，在线服务可能计费；不会读取笔记。') });
  }
  box.createEl('p', { text: sample, cls: 'reader-setup-sample' });
  const actions = box.createDiv({ cls: 'reader-setup-actions' });
  const play = actions.createEl('button');
  const icon = play.createSpan(); setIcon?.(icon, 'play');
  play.createSpan({ text: t('Test voice', '测试朗读') });
  const stop = actions.createEl('button');
  const stopIcon = stop.createSpan(); setIcon?.(stopIcon, 'square');
  stop.createSpan({ text: t('Stop test', '停止测试') });
  play.type = stop.type = 'button';
  const status = box.createEl('p', { cls: 'setting-item-description' });
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const update = () => {
    play.disabled = Boolean(plugin.settingsPreview);
    stop.disabled = !plugin.settingsPreview;
    for (const component of tab.engineChoiceControls || []) component.setDisabled?.(Boolean(plugin.settingsPreview));
    status.textContent = plugin.settingsPreview?.message || tab.previewMessage || '';
  };
  const current = plugin.settingsPreview;
  if (current) { current.update = update; status.textContent = t('Test in progress...', '正在测试……'); }
  update();
  play.addEventListener('click', async () => {
    if (plugin.settingsPreview) return;
    if (plugin.isSettingsPreviewBusy()) {
      status.textContent = t('Stop the current reading or export before testing.', '请先停止当前朗读或导出，再测试。'); return;
    }
    const token = { update, cancelled: false, message: t('Preparing the sample...', '正在准备测试短句……') };
    plugin.settingsPreview = token; update();
    status.textContent = t('Preparing the sample...', '正在准备测试短句……');
    try {
      const result = await plugin.runSettingsPreview(sample, token);
      if (!token.cancelled && result === 'complete') { tab.setupCompleted = true; if (tab.quickStart) tab.quickStart.open = false; }
      status.textContent = token.cancelled || result === 'cancelled' ? t('Test stopped.', '测试已停止。')
        : result === 'complete' ? t('Test complete.', '测试完成。')
        : previewError(result, zh);
    } catch (error) { status.textContent = token.cancelled ? t('Test stopped.', '测试已停止。') : previewError(error, zh); }
    finally {
      tab.previewMessage = status.textContent;
      if (plugin.settingsPreview === token) plugin.settingsPreview = null;
      token.update(); update();
    }
  });
  stop.addEventListener('click', () => {
    const token = plugin.settingsPreview;
    if (token) { token.cancelled = true; token.message = t('Stopping the test...', '正在停止测试……'); token.update(); plugin.stopSettingsPreview(token); }
  });
  return box;
}
module.exports = { methodFor, disclosure, renderEngineChoice, renderPreview, previewError };

