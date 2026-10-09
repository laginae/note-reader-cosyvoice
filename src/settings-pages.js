'use strict';
const { translate, LANGUAGES } = require('./i18n');
const PAGES = [
  ['engine', 'Speech engine', '语音引擎'],
  ['playback', 'Playback and interface', '播放与界面'],
  ['academic', 'Academic reading', '学术阅读'],
  ['storage', 'Export and storage', '导出与存储'],
  ['privacy', 'Privacy and help', '隐私与帮助'],
];
let sequence = 0;

function createSettingsHeader(root, language, onChange) {
  const doc = root.ownerDocument;
  const header = doc.createElement('div');
  header.className = 'note-reader-settings-header';
  const title = doc.createElement('h2');
  title.textContent = 'Cozy Read Aloud';
  const select = doc.createElement('select');
  select.className = 'note-reader-settings-language';
  const label = translate(language, 'Settings language', '设置语言');
  select.setAttribute('aria-label', label);
  select.title = label;
  for (const [id, name] of Object.entries(LANGUAGES)) {
    const option = doc.createElement('option');
    option.value = id; option.textContent = name; select.append(option);
  }
  select.value = LANGUAGES[language] ? language : 'english';
  select.addEventListener('change', () => onChange(select.value));
  header.append(title, select); root.append(header);
  return header;
}

function createSettingsPages(root, language, selected = 'engine', onSelect = () => {}) {
  const doc = root.ownerDocument, prefix = `note-reader-settings-${++sequence}`;
  const nav = doc.createElement('div');
  nav.className = 'note-reader-settings-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', translate(language, 'Settings categories', '设置分类'));
  root.append(nav);
  const pages = {}, buttons = new Map();
  const activate = (id, notify = true) => {
    if (!pages[id]) id = 'engine';
    for (const [key, button] of buttons) {
      const active = key === id;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      pages[key].hidden = !active;
    }
    if (notify) onSelect(id);
  };
  for (const [id, en, zh] of PAGES) {
    const button = doc.createElement('button'), panel = doc.createElement('div');
    button.type = 'button';
    button.id = `${prefix}-tab-${id}`;
    button.textContent = translate(language, en, zh);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${prefix}-panel-${id}`);
    panel.id = `${prefix}-panel-${id}`;
    panel.className = 'note-reader-settings-panel';
    panel.dataset.settingsPage = id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    pages[id] = panel; buttons.set(id, button);
    button.addEventListener('click', () => activate(id));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const ids = PAGES.map(page => page[0]), index = ids.indexOf(id);
      const target = event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1)
        : ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      activate(target); buttons.get(target).focus();
    });
    nav.append(button); root.append(panel);
  }
  activate(selected, false);
  return pages;
}
module.exports = { PAGES, createSettingsPages, createSettingsHeader };
