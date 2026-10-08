'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { previewError } = require('./engine-setup');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('method and service changes preserve every provider field and remember the last online choice', async () => {
  const { dom, plugin, rows } = settingsFixture('english', 'openrouter-tts', { openRouterSecretName: 'saved-name' });
  try {
    const before = { ...plugin.settings };
    const row = name => rows.findLast(r => r.nameEl.textContent === name && r.settingEl.isConnected);
    assert.equal(row('Reading method').controlEl.querySelectorAll('option').length, 3);
    assert.equal(row('Speech service').controlEl.querySelectorAll('option').length, 5);
    await row('Reading method').change('system');
    assert.equal(plugin.settings.speechEngine, 'system-tts');
    await row('Reading method').change('online');
    assert.equal(plugin.settings.speechEngine, 'openrouter-tts');
    assert.deepEqual(plugin.settings, before);
    assert.equal(plugin.saves, 2);
  } finally { dom.window.close(); }
});

test('custom model and voice controls open advanced options; consent remains next to test', async () => {
  const { dom, doc, rows } = settingsFixture('chinese', 'openrouter-tts');
  try {
    const custom = rows.find(r => r.nameEl.textContent === 'OpenRouter TTS 模型');
    assert.equal(custom.settingEl.closest('details').open, false);
    const presets = rows.find(r => r.controlEl.querySelector('option[value="__custom__"]'));
    await presets.change('__custom__');
    assert.equal(custom.settingEl.closest('details').open, true);
    const preview = doc.querySelector('.reader-setup-preview');
    assert.match(preview.previousElementSibling.textContent, /允许 OpenRouter/);
    assert.equal(doc.querySelectorAll('.reader-setup-preview').length, 1);
  } finally { dom.window.close(); }
});

test('test uses only fixed text, blocks double clicks and active reading, and cancels without success', async () => {
  const { dom, doc, plugin, tab, rows } = settingsFixture();
  try {
    const [play, stop] = doc.querySelectorAll('.reader-setup-actions button');
    let resolve, calls = 0, stopped = 0;
    plugin.runSettingsPreview = async (sample, token) => {
      assert.equal(sample, 'Hello, this is a short voice test.'); calls++;
      return new Promise(done => { resolve = done; });
    };
    plugin.stopSettingsPreview = () => { stopped++; resolve('cancelled'); };
    plugin.activeSession = {}; play.click(); await tick(); assert.equal(calls, 0);
    plugin.activeSession = null; play.click(); play.click(); await tick();
    assert.equal(calls, 1); assert.equal(play.disabled, true);
    const engineBefore = plugin.settings.speechEngine;
    await rows.find(r => r.nameEl.textContent === 'Reading method').change('system');
    assert.equal(plugin.settings.speechEngine, engineBefore);
    stop.click(); await tick(); assert.equal(stopped, 1); assert.equal(plugin.settingsPreview, null);
    assert.match(doc.querySelector('[role=status]').textContent, /stopped/);
    plugin.runSettingsPreview = async () => 'complete'; play.click(); await tick();
    assert.equal(tab.setupCompleted, true); assert.equal(tab.quickStart.open, false);
  } finally { dom.window.close(); }
});

test('online test with missing permission never reaches synthesis or reads the vault', async () => {
  const { dom, plugin } = settingsFixture('english', 'mimo-tts', { mimoConsent: false });
  try {
    plugin.startReading = () => { throw Error('Must not synthesize'); };
    plugin.app.vault = new Proxy({}, { get() { throw Error('Must not read vault'); } });
    assert.equal(await plugin.runSettingsPreview('fixed sample', {}), 'Configuration incomplete');
  } finally { dom.window.close(); }
});

test('a settings redraw during a pending test receives its completion state', async () => {
  const { dom, doc, plugin, tab } = settingsFixture();
  try {
    let finish;
    plugin.runSettingsPreview = () => new Promise(resolve => { finish = resolve; });
    doc.querySelector('.reader-setup-actions button').click();
    tab.display();
    assert.equal(doc.querySelector('.reader-setup-actions button').disabled, true);
    finish('complete'); await tick();
    assert.equal(doc.querySelector('.reader-setup-actions button').disabled, false);
    assert.equal(doc.querySelector('[role=status]').textContent, 'Test complete.');
  } finally { dom.window.close(); }
});

test('preview errors provide bounded next steps without echoing server messages or secrets', () => {
  assert.match(previewError('401 secret ABC-private', false), /API secret/);
  assert.match(previewError('429 quota exceeded ABC-private', true), /限额/);
  assert.match(previewError('voice unavailable ABC-private', false), /voice and model/);
  for (const error of ['401 secret ABC-private', 'unknown ABC-private', 'voice ABC-private']) {
    assert.doesNotMatch(previewError(error, false), /ABC-private/);
  }
});
