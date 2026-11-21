'use strict';
const { storedReadingPreferences } = require('@laginae/note-reader-core/reading-profiles');

function addReadingProfileSetting(container, plugin, Setting, refresh) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  const current = storedReadingPreferences(plugin.settings).readingProfile;
  new Setting(container).setName(zh ? '朗读方式' : 'Reading style')
    .setDesc(zh ? '日常朗读精简公式和表头；学术精读明确公式结构并逐行报列名。切回自定义可继续使用原有选项。'
      : 'Everyday keeps formulas and table headers brief. Academic detail speaks structure and labels each row. Custom retains your individual choices.')
    .addDropdown(d => d.addOption('everyday', zh ? '日常朗读' : 'Everyday')
      .addOption('study', zh ? '学术精读' : 'Academic detail')
      .addOption('custom', zh ? '自定义' : 'Custom')
      .setValue(current).onChange(async value => {
        if (!['everyday','study','custom'].includes(value) || value === current) return;
        plugin.settings.readingProfile = value;
        await plugin.saveSettings();
        refresh();
      }));
  return current === 'custom';
}
module.exports = { addReadingProfileSetting };
