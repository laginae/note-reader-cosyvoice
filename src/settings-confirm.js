'use strict';
const { Modal, Setting } = require('obsidian');
const { translate } = require('./i18n');

class SettingsConfirmModal extends Modal {
  constructor(plugin, title, description, action) {
    super(plugin.app); this.plugin = plugin; this.title = title; this.description = description; this.action = action;
  }
  onOpen() {
    const t = (en, zh) => translate(this.plugin.settings.settingsLanguage, en, zh);
    this.contentEl.createEl('h2', { text: this.title });
    this.contentEl.createEl('p', { text: this.description });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t('Cancel', '取消')).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t('Confirm', '确认')).onClick(async () => {
        button.setDisabled(true);
        try { await this.plugin.runUserAction('Reset settings', this.action); this.close(); }
        finally { button.setDisabled(false); }
      }));
  }
  onClose() { this.contentEl.empty(); }
}
module.exports = { SettingsConfirmModal };
