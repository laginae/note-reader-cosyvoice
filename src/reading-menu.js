'use strict';

function registerReadingMenu(plugin, read, notify) {
  plugin.addCommand?.({ id: 'read-toolbar-selection', name: 'Read selected text (floating toolbar)', icon: 'volume-2',
    editorCallback(editor, view) {
      if (!view?.file || !['md', 'markdown'].includes(String(view.file.extension).toLowerCase())) return;
      const sourceText = editor.getValue(), start = editor.posToOffset(editor.getCursor('from'));
      const end = editor.posToOffset(editor.getCursor('to'));
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceText.length || !sourceText.slice(start,end).trim()) {
        notify(plugin.settings.settingsLanguage === 'chinese' ? '请先选中文字。' : 'Select text first.'); return;
      }
      const selection = plugin.settings.readingFloatingAction !== 'from-selection';
      return read({ file: view.file, sourceText, start, text: sourceText.slice(start,selection ? end : undefined), selection });
    } });
  plugin.app.workspace.onLayoutReady?.(() => { void syncEditingToolbar(plugin).catch(() => notify('Unable to update Editing Toolbar.')); });
  plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu, editor, view) => {
    if (plugin.settings.readingContextMenu === false) return;
    const file = view?.file;
    if (!file || !['md', 'markdown'].includes(String(file.extension).toLowerCase())) return;
    if (view.getMode?.() === 'preview') return;
    const sourceText = editor.getValue();
    const start = editor.posToOffset(editor.getCursor('from'));
    const end = editor.posToOffset(editor.getCursor('to'));
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > sourceText.length) return;
    const zh = plugin.settings.settingsLanguage === 'chinese';
    const add = (selection) => menu.addItem(item => item
      .setTitle(selection ? (zh ? '朗读选中内容' : 'Read selected text') : (zh ? '从此处开始朗读' : 'Read aloud from here'))
      .setIcon(selection ? 'text-select' : 'list-start')
      .onClick(() => {
        // Bind the menu to its original document and offsets, not a later selection.
        if (view.file !== file || editor.getValue() !== sourceText) {
          notify(zh ? '原文已变化，请重新打开右键菜单。' : 'The document changed. Open the context menu again.');
          return;
        }
        return read({ file, sourceText, start, text: sourceText.slice(start, selection ? end : undefined), selection });
      }));
    if (sourceText.slice(start).trim()) add(false);
    if (sourceText.slice(start, end).trim()) add(true);
  }));
}

async function syncEditingToolbar(plugin) {
  const toolbar = plugin.app?.plugins?.plugins?.['editing-toolbar'];
  if (!toolbar?.settings || typeof toolbar.saveSettings !== 'function' || !plugin.manifest?.id) return;
  const id = `${plugin.manifest.id}:read-toolbar-selection`;
  const activeKey = toolbar.settings.enableMultipleConfig ? 'followingCommands' : 'menuCommands';
  const from = plugin.settings.readingFloatingAction === 'from-selection';
  const name = plugin.settings.settingsLanguage === 'chinese'
    ? (from ? '从选中位置开始朗读' : '朗读选中内容')
    : (from ? 'Read from selection' : 'Read selected text');
  let changed = false;
  for (const key of ['menuCommands', 'followingCommands', 'topCommands', 'fixedCommands', 'mobileCommands']) {
    const entries = toolbar.settings[key];
    if (!Array.isArray(entries)) continue;
    const desired = plugin.settings.readingFloatingToolbar === true && key === activeKey;
    if (!desired) {
      const kept = entries.filter(entry => entry.id !== id);
      if (kept.length !== entries.length) { toolbar.settings[key] = kept; changed = true; }
    } else if (!entries.some(entry => entry.id === id)) {
      const at = entries.findIndex(entry => entry.id === 'editing-toolbar:ai-tools');
      entries.splice(at < 0 ? 0 : at + 1, 0, { id, name, icon: 'lucide-volume-2' });
      changed = true;
    } else {
      const entry = entries.find(entry => entry.id === id);
      if (entry.name !== name) { entry.name = name; changed = true; }
    }
  }
  if (changed) { await toolbar.saveSettings(); toolbar.clearToolbarCache?.(); }
}

function addReadingMenuSettings(container, plugin, Setting) {
  const zh = plugin.settings.settingsLanguage === 'chinese';
  new Setting(container).setName(zh ? '显示朗读右键菜单' : 'Reading context menu')
    .setDesc(zh ? '在 Markdown 编辑器菜单中显示从此处朗读和朗读选中内容。' : 'Show read-from-here and selection actions in the Markdown editor menu.')
    .addToggle(toggle => toggle.setValue(plugin.settings.readingContextMenu !== false).onChange(async value => {
      plugin.settings.readingContextMenu = value; await plugin.saveSettings();
    }));
  const installed = Boolean(plugin.app.plugins?.plugins?.['editing-toolbar']);
  let actionControl;
  new Setting(container).setName(zh ? '悬浮工具栏朗读图标' : 'Floating toolbar reading icon')
    .setDesc(zh ? '需启用 Editing Toolbar。关闭只移除本插件的专用图标。重新选中文字后刷新。' : 'Requires Editing Toolbar. Disabling removes only this plugin\'s dedicated icon. Reselect text to refresh.')
    .addToggle(toggle => toggle.setValue(plugin.settings.readingFloatingToolbar === true).setDisabled(!installed).onChange(async value => {
      plugin.settings.readingFloatingToolbar = value; await plugin.saveSettings();
      actionControl?.setDisabled(!installed || !value);
    }));
  new Setting(container).setName(zh ? '悬浮图标默认动作' : 'Floating icon action')
    .setDesc(zh ? '仅在选中文字时执行，不会在没有选区时自动朗读。' : 'Requires selected text; never starts without a selection.')
    .addDropdown(dropdown => { actionControl = dropdown; return dropdown
      .addOption('selection', zh ? '朗读选中内容' : 'Read selected text')
      .addOption('from-selection', zh ? '从选中位置开始朗读' : 'Read from selection')
      .setValue(plugin.settings.readingFloatingAction === 'from-selection' ? 'from-selection' : 'selection')
      .setDisabled(!installed || plugin.settings.readingFloatingToolbar !== true)
      .onChange(async value => { plugin.settings.readingFloatingAction = value; await plugin.saveSettings(); }); });
}

module.exports = { registerReadingMenu, syncEditingToolbar, addReadingMenuSettings };
