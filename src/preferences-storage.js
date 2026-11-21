'use strict';

const recovery = 'Cozy Read Aloud: existing settings could not be verified. Restore your settings and reload the plugin. 无法确认已有设置，未写入默认值。请检查或恢复设置后重新加载插件。';
const emptyRecord = value => value == null || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
function conflict(plugin) {
  plugin.settingsReadBlocked = true;
  plugin.onPreferenceConflict?.(recovery);
  throw new Error(recovery);
}
function settingsFileExists(plugin) {
  const vault = plugin.app?.vault, dir = plugin.manifest?.dir
    || (plugin.manifest?.id && vault?.configDir && `${vault.configDir}/plugins/${plugin.manifest.id}`);
  return dir && vault?.adapter?.exists ? vault.adapter.exists(`${dir}/data.json`) : false;
}
async function loadInitialPreferences(plugin) {
  plugin.settingsReadBlocked = true;
  const value = await plugin.loadData();
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    plugin.verifyFirstPreferenceWrite = false;
    plugin.settingsReadBlocked = false;
    return value;
  }
  if (!emptyRecord(value) || await settingsFileExists(plugin)) conflict(plugin);
  plugin.verifyFirstPreferenceWrite = true;
  plugin.settingsReadBlocked = false;
  return null;
}
async function savePreferences(plugin, data) {
  if (plugin.settingsReadBlocked) throw new Error(recovery);
  if (plugin.initialPreferenceWrite) await plugin.initialPreferenceWrite;
  if (!plugin.verifyFirstPreferenceWrite) return plugin.saveData(data);
  // A sync or another window may have restored data since an apparently fresh launch.
  const first = (async () => {
    if (!emptyRecord(await plugin.loadData()) || await settingsFileExists(plugin)) conflict(plugin);
    await plugin.saveData(data);
    plugin.verifyFirstPreferenceWrite = false;
  })();
  plugin.initialPreferenceWrite = first;
  try { await first; } finally { plugin.initialPreferenceWrite = null; }
}
module.exports = { loadInitialPreferences, savePreferences };
