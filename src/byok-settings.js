'use strict';

const { Modal, Setting, SecretComponent, Notice } = require('obsidian');
const { translate } = require('./i18n');
const { BYOK_PROVIDERS, MAX_BYOK_PROFILES, createByokProfile, getByokProfile, updateByokProfile,
  getByokConfigurationError, byokConsentFingerprint, hasByokConsent } = require('./byok-tts');

class ByokConfirmModal extends Modal {
  constructor(plugin, title, description, action, closed = () => {}) {
    super(plugin.app); Object.assign(this, { plugin, title, description, action, afterByokClose: closed });
  }
  onOpen() {
    const t = (en, zh) => translate(this.plugin.settings.settingsLanguage, en, zh);
    this.contentEl.createEl('h2', { text: this.title });
    this.contentEl.createEl('p', { text: this.description });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t('Cancel', '取消')).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t('Confirm', '确认')).onClick(async () => {
        button.setDisabled(true);
        try { await this.plugin.runUserAction(this.title, this.action); this.close(); }
        finally { button.setDisabled(false); }
      }));
  }
  onClose() { this.contentEl.empty(); this.afterByokClose(); }
}

function displayByokSettings(tab, containerEl, { canUseSecrets, credentialError, openPrivacy }) {
  const plugin = tab.plugin;
  const t = (en, zh) => translate(plugin.settings.settingsLanguage, en, zh);
  const profile = getByokProfile(plugin.settings);
  const find = () => plugin.settings.byokProfiles.find(item => item.id === profile?.id);
  const stop = async () => {
    if (plugin.activeSession?.speechEngine === 'byok-tts') await plugin.stopReading({ silent: true });
  };
  let refresh = () => {}, secretControl, profileDropdown;
  const profileLabel = item => {
    const type = BYOK_PROVIDERS[item.provider]?.name;
    return type && item.name !== type ? `${item.name} (${type})` : item.name;
  };
  const update = async (patch, redraw = false) => {
    const current = find(); if (!current) return;
    const next = updateByokProfile(current, patch);
    plugin.settings.byokProfiles = plugin.settings.byokProfiles.map(item => item.id === current.id ? next : item);
    if (next.endpoint !== current.endpoint || next.provider !== current.provider) secretControl?.setValue('');
    refresh();
    if (current.consent !== next.consent || current.chunkLimit !== next.chunkLimit) await stop();
    await plugin.saveSettings();
    if (redraw) tab.display();
  };

  new Setting(containerEl).setName(t('Custom speech API (BYOK)', '自定义语音 API（BYOK）'))
    .setDesc(t('OpenAI-compatible speech, ElevenLabs and MiniMax. HTTPS only; MP3 output. Chat-only compatibility is not enough. Credentials are sent directly to the configured service.',
      '支持 OpenAI 兼容语音接口、ElevenLabs、MiniMax。仅限 HTTPS 和 MP3 输出；仅兼容聊天接口不能用于朗读。密钥直接发送到配置的服务。'));
  new Setting(containerEl).setName(t('API profile', '接口配置'))
    .addDropdown(dropdown => {
      profileDropdown = dropdown;
      dropdown.addOption('', t('Select a profile', '请选择配置'));
      for (const item of plugin.settings.byokProfiles) dropdown.addOption(item.id, profileLabel(item));
      dropdown.setValue(profile?.id || '').onChange(async id => {
        await stop(); plugin.settings.byokActiveProfileId = id;
        await plugin.saveSettings(); tab.display();
      });
    })
    .addExtraButton(button => button.setIcon('plus').setTooltip(t('Add API profile', '添加接口配置'))
      .onClick(async () => {
        if (plugin.settings.byokProfiles.length >= MAX_BYOK_PROFILES) {
          new Notice(t('Maximum 20 API profiles.', '最多保存 20 个接口配置。')); return;
        }
        await stop();
        const next = createByokProfile();
        plugin.settings.byokProfiles = [...plugin.settings.byokProfiles, next];
        plugin.settings.byokActiveProfileId = next.id;
        await plugin.saveSettings(); tab.display();
      }));
  if (!profile) return;
  const consentHost = containerEl.createDiv({ cls: 'note-reader-byok-consent' });

  new Setting(containerEl).setName(t('Profile name', '配置名称'))
    .setDesc(t('Default names follow the API type. A name you enter is kept.', '默认名称随接口类型更新；手动命名后保留自定义名称。'))
    .addText(text => text.setValue(profile.name).onChange(value => update({ name: value })))
    .addExtraButton(button => button.setIcon('trash-2').setTooltip(t('Delete profile', '删除配置')).onClick(() => {
      new ByokConfirmModal(plugin, t('Delete API profile', '删除接口配置'),
        t('Delete this profile? Stored secrets and external key files will not be deleted.', '删除此配置？不会删除秘密存储中的密钥或外部密钥文件。'), async () => {
          await stop();
          plugin.settings.byokProfiles = plugin.settings.byokProfiles.filter(item => item.id !== profile.id);
          if (plugin.settings.byokActiveProfileId === profile.id) plugin.settings.byokActiveProfileId = '';
          await plugin.saveSettings(); tab.display();
        }).open();
    }));
  new Setting(containerEl).setName(t('API type', '接口类型'))
    .addDropdown(dropdown => {
      for (const [id, preset] of Object.entries(BYOK_PROVIDERS)) dropdown.addOption(id, preset.name);
      dropdown.setValue(profile.provider).onChange(provider => {
        const preset = BYOK_PROVIDERS[provider];
        return update({ provider, endpoint: preset.endpoint, model: preset.model, voice: preset.voice }, true);
      });
    });
  const endpointSetting = new Setting(containerEl).setName(t('Speech endpoint', '语音接口地址'))
    .setDesc(t('Changing this address clears credential references and requires new consent. Stored secrets are not deleted.',
      '修改地址会清除密钥关联并要求重新确认；已保存的秘密不会被删除。'));
  if (profile.provider === 'openai-compatible') {
    endpointSetting.addText(text => text.setValue(profile.endpoint).setPlaceholder('https://api.example.com/v1/audio/speech')
      .onChange(value => update({ endpoint: value }, false)));
  } else {
    endpointSetting.addDropdown(dropdown => {
      if (profile.provider === 'minimax') dropdown.addOption('https://api.minimax.io/v1/t2a_v2', t('International', '国际站'))
        .addOption('https://api.minimaxi.com/v1/t2a_v2', t('Mainland China', '国内站'));
      else dropdown.addOption(BYOK_PROVIDERS.elevenlabs.endpoint, 'api.elevenlabs.io');
      dropdown.setValue(profile.endpoint).onChange(endpoint => update({ endpoint }, true));
    });
  }
  new Setting(containerEl).setName(t('Model ID', '模型 ID'))
    .addText(text => text.setValue(profile.model).onChange(value => update({ model: value })));
  new Setting(containerEl).setName(t('Voice ID', '音色 ID'))
    .setDesc(t('Use a voice ID available to your account; a display name may not work. This voice is AI-generated.',
      '填写当前账户可用的音色 ID，不一定是音色显示名称。此音色为 AI 合成。'))
    .addText(text => text.setValue(profile.voice).onChange(value => update({ voice: value })))
    .addExtraButton(button => button.setIcon('external-link').setTooltip(t('Official API documentation', '官方接口文档'))
      .onClick(() => window.open(BYOK_PROVIDERS[profile.provider]?.docs || BYOK_PROVIDERS['openai-compatible'].docs, '_blank', 'noopener,noreferrer')));
  new Setting(containerEl).setName(t('Credential source', '密钥来源'))
    .addDropdown(dropdown => dropdown.addOption('obsidian-secret', t('Obsidian secret storage', 'Obsidian 秘密存储'))
      .addOption('key-file', t('Key file outside vault', '库外密钥文件')).setValue(profile.credentialSource)
      .onChange(value => update({ credentialSource: value }, true)));
  if (profile.credentialSource === 'obsidian-secret') {
    const setting = new Setting(containerEl).setName(t('API secret', 'API 秘密'))
      .setDesc(t('Only the secret name is saved in plugin settings, never the key. Re-select a secret after changing the endpoint.',
        '插件设置只保存秘密名称，不保存密钥。更换接口地址后需重新选择秘密。'));
    if (canUseSecrets) setting.addComponent(element => {
      secretControl = new SecretComponent(plugin.app, element).setValue(profile.secretName)
        .onChange(value => update({ secretName: value }));
      return secretControl;
    });
    else setting.setDesc(t('Requires Obsidian 1.11.4+ secret storage. Alternatively choose a key file outside the vault.',
      '需要 Obsidian 1.11.4+ 的秘密存储；也可以选择库外密钥文件。'));
  } else {
    new Setting(containerEl).setName(t('API key file', 'API 密钥文件'))
      .setDesc(t('Absolute path to a one-line key file outside the vault. Do not paste a key here.', '库外单行密钥文件的绝对路径，不要在这里粘贴密钥。'))
      .addText(text => { secretControl = text; text.setValue(profile.keyPath).onChange(value => update({ keyPath: value })); });
  }
  new Setting(containerEl).setName(t('Maximum characters per chunk', '每段字符上限'))
    .setDesc(t('50-2000, default 800. Also capped by online chunk settings; reduce for services with lower limits. Playback speed is adjusted locally.',
      '50–2000，默认 800。与在线分段设置取较小值；服务限制更低时请调小。播放倍速在本地调整。'))
    .addText(text => text.setValue(String(profile.chunkLimit)).onChange(value => {
      if (/^\d+$/.test(value) && Number(value) >= 50 && Number(value) <= 2000) return update({ chunkLimit: Number(value) });
    }));

  let consentToggle, previewButton;
  const consentSetting = new Setting(consentHost).setName(t('Allow this configuration to process text', '允许此配置处理朗读文本'));
  const riskText = t(
    'Reading text and credentials go to the endpoint you configure, which may forward text to upstream providers. Requests, including previews, may cost money. No-training and zero data retention (ZDR) are NOT verified or enforced by this plugin for BYOK. Review the destination, service, intermediary and account policies yourself. This permission authorizes synthesis, not model training. Revoking permission cannot recall data already sent.',
    '朗读文本及密钥将发送到你配置的接口，服务可能继续转发文本给上游。包括试听在内的请求可能产生费用。对于 BYOK，插件无法核实或强制“不用于训练”和“零数据保留（ZDR）”；请自行核对目标地址、服务商、中转服务及账户政策。此授权仅用于合成，不代表同意模型训练。撤销授权不能收回已经发送的数据。');
  const details = consentHost.createEl('details');
  details.createEl('summary', { text: t('BYOK processing and billing risks', 'BYOK 数据处理与费用风险') });
  details.createEl('p', { text: riskText });
  const privacyLink = consentHost.createEl('button', {
    text: t('View general privacy information', '查看通用隐私说明'),
    cls: 'note-reader-byok-privacy-link', attr: { type: 'button' },
  });
  privacyLink.addEventListener('click', () => openPrivacy());
  consentSetting.addToggle(toggle => {
    consentToggle = toggle;
    toggle.setValue(hasByokConsent(profile)).onChange(value => {
      if (!value) return update({ consent: '' });
      toggle.setValue(false);
      const current = find();
      const error = getByokConfigurationError(current, false) || credentialError(current);
      if (error) { new Notice(error, 10000); return; }
      const fingerprint = byokConsentFingerprint(current);
      new ByokConfirmModal(plugin, t('Confirm BYOK privacy and billing risks', '确认 BYOK 隐私与费用风险'),
        `${current.endpoint}\n${current.model} / ${current.voice}\n\n${riskText}`, async () => {
          if (byokConsentFingerprint(find()) !== fingerprint) throw new Error(t('Configuration changed; review it again.', '配置已变更，请重新确认。'));
          await update({ consent: fingerprint });
        }, () => refresh()).open();
    });
  });
  new Setting(containerEl).setName(t('Voice preview', '音色试听'))
    .setDesc(t('Sends only: "This is an AI-generated voice preview." Uses account quota and replaces current playback. Failed requests are not automatically retried.',
      '仅发送固定短句“This is an AI-generated voice preview.”，会使用账户额度并替换当前播放。不自动重试失败的请求。'))
    .addButton(button => {
      previewButton = button;
      button.setIcon('play').setButtonText(t('Preview', '试听')).onClick(async () => {
        if (plugin.settings.speechEngine !== 'byok-tts' || plugin.settings.byokActiveProfileId !== profile.id || !hasByokConsent(find())) return;
        button.setDisabled(true);
        try {
          await plugin.runUserAction(t('BYOK preview', 'BYOK 试听'), () => plugin.startReading(
            'This is an AI-generated voice preview.', 'BYOK voice preview', { plainText: true, skipReadingPosition: true }));
        } finally { refresh(); }
      });
    });
  refresh = () => {
    const current = find();
    const allowed = hasByokConsent(current);
    consentToggle?.setValue(allowed); previewButton?.setDisabled(!allowed);
    const state = allowed ? t('Authorized for this configuration.', '已授权此配置。')
      : t('Not authorized. Complete the API settings below, then enable here.', '尚未授权。请先完善下方接口设置，再在此开启。');
    consentSetting.setDesc(`${state}\n${current?.endpoint || ''}\n${t('Online processing may incur charges; no-training and ZDR are not guaranteed.', '在线处理可能产生费用；不保证不用于训练或 ZDR。')}`);
    const option = Array.from(profileDropdown.selectEl.options).find(item => item.value === current?.id);
    if (option && current) option.textContent = profileLabel(current);
  };
  refresh();
}

module.exports = { displayByokSettings, ByokConfirmModal };
