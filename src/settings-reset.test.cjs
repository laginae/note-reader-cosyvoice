const test = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_KEYS, resetPageSettings } = require('./settings-reset');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');

test('page reset has explicit ownership including hidden engines and preserves sensitive configuration', () => {
  const { dom, plugin } = settingsFixture();
  const defaults = plugin.settings;
  const protectedKeys = ['settingsLanguage','readingPositions','scriptPath','edgeTtsExecutable','copilotChatFolder',
    'azureSpeechCloud','azureSpeechRegion','azureSpeechCredentialSource','azureSpeechKeyPath','azureSpeechSecretName',
    'openRouterCredentialSource','openRouterKeyPath','openRouterSecretName','mimoCredentialSource','mimoKeyPath','mimoSecretName'];
  assert.deepEqual(Object.keys(defaults).filter(k => !Object.values(PAGE_KEYS).flat().includes(k)).sort(), protectedKeys.sort());
  for (const page of Object.keys(PAGE_KEYS)) {
    const source = Object.fromEntries(Object.keys(defaults).map(key => [key, `changed:${key}`]));
    const next = resetPageSettings(source, defaults, page);
    for (const key of Object.keys(defaults)) assert.deepEqual(next[key], PAGE_KEYS[page].includes(key) ? defaults[key] : source[key], `${page}/${key}`);
    assert.equal(source.speechEngine, 'changed:speechEngine');
  }
  const source = { ...defaults, mimoSecretName: 'test-secret-reference', readingPositions: { sample: {} }, settingsLanguage: 'chinese' };
  const next = resetPageSettings(source, defaults, 'all');
  assert.equal(next.mimoSecretName, source.mimoSecretName);
  assert.equal(next.readingPositions, source.readingPositions);
  assert.equal(next.settingsLanguage, 'chinese');
  assert.throws(() => resetPageSettings(source, defaults, 'invalid'));
  dom.window.close();
});

test('page reset requires confirmation and cancel leaves settings untouched', async () => {
  const { dom, plugin, rows, modals } = settingsFixture();
  const called = [];
  plugin.resetSettingsToDefaults = async page => called.push(page);
  plugin.runUserAction = async (_label, action) => action();
  const reset = rows.find(row => row.nameEl.textContent === 'Restore this page defaults');
  const before = JSON.stringify(plugin.settings);
  reset.click(); assert.deepEqual(called, []);
  assert.match(modals.at(-1).contentEl.textContent, /Speech engine/);
  modals.at(-1).contentEl.querySelector('button').click();
  assert.equal(modals.at(-1).closed, true); assert.equal(JSON.stringify(plugin.settings), before);
  reset.click(); await rows.at(-1).click();
  assert.deepEqual(called, ['engine']); assert.equal(modals.at(-1).closed, true);
  dom.window.close();
});
