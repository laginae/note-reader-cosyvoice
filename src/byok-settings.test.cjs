'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { createByokProfile, byokConsentFingerprint, hasByokConsent } = require('./byok-tts');

function setup(authorized = false) {
  const profile = createByokProfile(); profile.secretName = 'test-key';
  if (authorized) profile.consent = byokConsentFingerprint(profile);
  const fixture = settingsFixture('english', 'byok-tts', { byokProfiles: [profile], byokActiveProfileId: profile.id });
  fixture.row = name => fixture.rows.findLast(row => row.nameEl.textContent === name && row.settingEl.isConnected);
  fixture.plugin.runUserAction = async (_label, action) => action();
  fixture.plugin.stopReading = async () => { fixture.plugin.stops = (fixture.plugin.stops || 0) + 1; fixture.plugin.activeSession = null; };
  return fixture;
}

test('BYOK consent is explicit, cancellable and bound to the exact configuration shown in its dialog', async () => {
  const { dom, plugin, row, modals, rows } = setup();
  try {
    const consent = row('Allow this configuration to process text');
    assert.equal(consent.controlEl.querySelector('input').checked, false);
    assert.equal(row('Voice preview').controlEl.querySelector('button').disabled, true);
    consent.change(true);
    assert.match(modals.at(-1).contentEl.textContent, /api.openai.com\/v1\/audio\/speech/);
    assert.match(modals.at(-1).contentEl.textContent, /NOT verified or enforced/);
    assert.equal(plugin.settings.byokProfiles[0].consent, '');
    modals.at(-1).close(); assert.equal(plugin.settings.byokProfiles[0].consent, '');
    consent.change(true); await rows.at(-1).click();
    assert.ok(hasByokConsent(plugin.settings.byokProfiles[0]));
    assert.equal(row('Voice preview').controlEl.querySelector('button').disabled, false);
    plugin.activeSession = { speechEngine: 'byok-tts' }; await consent.change(false);
    assert.equal(plugin.stops, 1); assert.equal(plugin.settings.byokProfiles[0].consent, '');
    consent.change(true);
    const stale = modals.at(-1);
    await row('Model ID').change('another-model');
    await assert.rejects(stale.action(), /Configuration changed/);
    assert.equal(plugin.settings.byokProfiles[0].consent, '');
  } finally { dom.window.close(); }
});

test('editing an endpoint immediately clears visible and stored secret references and cancels BYOK work', async () => {
  const { dom, plugin, row } = setup(true);
  try {
    plugin.activeSession = { speechEngine: 'byok-tts' };
    await row('Speech endpoint').change('https://different.example.org/v1/audio/speech');
    assert.equal(plugin.settings.byokProfiles[0].secretName, '');
    assert.equal(row('API secret').controlEl.querySelector('input').value, '');
    assert.equal(plugin.settings.byokProfiles[0].consent, '');
    assert.equal(plugin.stops, 1);
    assert.equal(row('Voice preview').controlEl.querySelector('button').disabled, true);
    await row('API secret').change('new-test-key');
    assert.equal(plugin.settings.byokProfiles[0].secretName, 'new-test-key');
    assert.equal(hasByokConsent(plugin.settings.byokProfiles[0]), false);
  } finally { dom.window.close(); }
});

test('preview sends a fixed non-vault sentence and profile selection/add/delete do not synthesize', async () => {
  const { dom, plugin, row, modals, rows } = setup(true);
  try {
    const calls = []; plugin.startReading = async (...args) => calls.push(args);
    await row('Voice preview').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'This is an AI-generated voice preview.');
    assert.equal(calls[0][2].skipReadingPosition, true);
    const firstId = plugin.settings.byokActiveProfileId;
    await row('API profile').click();
    assert.equal(plugin.settings.byokProfiles.length, 2);
    assert.equal(hasByokConsent(plugin.settings.byokProfiles[1]), false);
    await row('API profile').change(firstId);
    row('Profile name').click(); modals.at(-1).close();
    assert.equal(plugin.settings.byokProfiles.length, 2);
    row('Profile name').click(); await rows.at(-1).click();
    assert.equal(plugin.settings.byokProfiles.length, 1);
    assert.equal(plugin.settings.byokActiveProfileId, ''); assert.equal(calls.length, 1);
  } finally { dom.window.close(); }
});

test('default profile labels follow provider changes while custom names update immediately and persist', async () => {
  const { dom, plugin, row } = setup();
  const selectedLabel = () => row('API profile').controlEl.querySelector('select').selectedOptions[0].textContent;
  try {
    await row('API type').change('minimax');
    assert.equal(plugin.settings.byokProfiles[0].name, 'MiniMax');
    assert.equal(row('Profile name').controlEl.querySelector('input').value, 'MiniMax');
    assert.equal(selectedLabel(), 'MiniMax');
    await row('Profile name').change('My voice service');
    assert.equal(selectedLabel(), 'My voice service (MiniMax)');
    await row('API type').change('elevenlabs');
    assert.equal(plugin.settings.byokProfiles[0].name, 'My voice service');
    assert.equal(selectedLabel(), 'My voice service (ElevenLabs)');
  } finally { dom.window.close(); }
});

test('consent remains prominent with mode-specific risks, without duplicating the common disclosure', async () => {
  const { dom, plugin, row, doc, modals, rows } = setup();
  try {
    const consent = row('Allow this configuration to process text');
    const host = consent.settingEl.parentElement;
    assert.equal(row('API profile').settingEl.nextElementSibling, host);
    assert.equal(host.nextElementSibling, row('Profile name').settingEl);
    assert.match(consent.descEl.textContent, /Not authorized/);
    const details = host.querySelector('details');
    assert.equal(details.open, false);
    assert.match(details.textContent, /BYOK processing and billing risks/);
    assert.match(details.textContent, /NOT verified or enforced by this plugin for BYOK/);
    assert.doesNotMatch(details.textContent, /telemetry|developer-operated|diagnostic logs/);
    assert.match(details.textContent, /cannot recall data already sent/);
    assert.equal(doc.querySelectorAll('.note-reader-byok-consent').length, 1);
    consent.change(true);
    assert.match(modals.at(-1).contentEl.textContent, /Review the destination/);
    assert.doesNotMatch(modals.at(-1).contentEl.textContent, /telemetry|developer-operated/);
    await rows.at(-1).click();
    assert.match(consent.descEl.textContent, /Authorized for this configuration/);
    await row('Voice ID').change('another-voice');
    assert.match(consent.descEl.textContent, /Not authorized/);
    assert.equal(plugin.settings.byokProfiles[0].consent, '');
  } finally { dom.window.close(); }
});

test('BYOK general privacy link switches and focuses the existing tab without changing settings or synthesizing', () => {
  const { dom, doc, plugin, tab } = setup(true);
  try {
    const before = JSON.stringify(plugin.settings), saves = plugin.saves;
    plugin.startReading = () => { throw new Error('Privacy navigation must not synthesize'); };
    const link = doc.querySelector('.note-reader-byok-privacy-link');
    assert.equal(link.textContent, 'View general privacy information');
    link.click();
    const visible = doc.querySelector('[role=tabpanel]:not([hidden])');
    assert.equal(visible.dataset.settingsPage, 'privacy');
    assert.equal(tab.settingsPage, 'privacy');
    assert.equal(doc.activeElement.id, visible.getAttribute('aria-labelledby'));
    assert.equal(visible.firstElementChild.querySelector('.setting-item-name').textContent, 'General privacy (all speech engines)');
    assert.match(visible.textContent, /no built-in usage telemetry/);
    assert.match(visible.textContent, /temporary text and audio/);
    assert.equal(JSON.stringify(plugin.settings), before); assert.equal(plugin.saves, saves);
    tab.display();
    assert.equal(doc.querySelector('[role=tabpanel]:not([hidden])').dataset.settingsPage, 'privacy');
  } finally { dom.window.close(); }
});
