'use strict';

const DOCKED_OUTLINE_TYPE = 'note-reader-outline-reader';

function registerDockedOutline(plugin) {
  const views = new Set(), workspace = plugin.app.workspace;
  let opening;
  const manager = {
    views,
    update() { for (const view of views) view.updatePlayback(); },
    observeHtml() { for (const view of views) view.observeHtml(); },
    async open() {
      if (opening) return opening;
      opening = (async () => {
        let leaf = workspace.getLeavesOfType(DOCKED_OUTLINE_TYPE)[0];
        if (!leaf) {
          leaf = workspace.getLeftLeaf(false);
          if (!leaf) return null;
          await leaf.setViewState({ type: DOCKED_OUTLINE_TYPE, active: true });
        }
        await workspace.revealLeaf(leaf);
        leaf.view?.schedule?.();
        return leaf;
      })();
      try { return await opening; } finally { opening = null; }
    },
  };
  plugin.dockedOutline = manager;
  // Loading the plugin registers an entry, but does not construct a panel or parse a document.
  plugin.registerView(DOCKED_OUTLINE_TYPE, leaf => {
    const { DockedOutlineView } = require('./docked-outline-view');
    return new DockedOutlineView(leaf, plugin, manager);
  });
  const name = plugin.settings.settingsLanguage === 'chinese' ? '打开目录与朗读' : 'Open outline and reader';
  const open = () => { void plugin.runUserAction(name, () => manager.open()); };
  plugin.addCommand({ id: 'open-outline-reader', name, callback: open });
  plugin.addRibbonIcon('list-tree', name, open);
  plugin.register(() => { for (const view of views) view.dispose(); views.clear(); });
  return manager;
}

module.exports = { DOCKED_OUTLINE_TYPE, registerDockedOutline };
