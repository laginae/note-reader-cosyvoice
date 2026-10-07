'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createByokProfile, normalizeByokSettings, getByokProfile, validateByokEndpoint, byokConsentFingerprint,
  hasByokConsent, getByokConfigurationError, updateByokProfile, assertByokAuthorized,
  buildByokRequest, decodeByokMp3, decodeMinimaxAudio, safeByokRequestError } = require('./byok-tts');
const { resetPageSettings } = require('./settings-reset');

function configured(provider = 'openai-compatible') {
  const profile = createByokProfile(provider);
  profile.voice ||= 'test-voice'; profile.secretName = 'test-key';
  profile.consent = byokConsentFingerprint(profile); return profile;
}
function settings(profile) { return { byokProfiles: [profile], byokActiveProfileId: profile.id }; }
function mp3() { const bytes = Buffer.alloc(417, 0x11); Buffer.from([0xff, 0xfb, 0x90, 0xc0]).copy(bytes); return bytes; }

test('BYOK starts unauthorized, normalizes profile data without raw keys and bounds counts and lengths', () => {
  const profile = createByokProfile();
  assert.equal(hasByokConsent(profile), false);
  assert.match(getByokConfigurationError(profile), /confirm/);
  const value = settings({ ...profile, apiKey: 'must-not-persist', headers: { Authorization: 'must-not-persist' }, chunkLimit: 99999 });
  normalizeByokSettings(value);
  assert.equal(getByokProfile(value).chunkLimit, 2000);
  assert.ok(!JSON.stringify(value).includes('must-not-persist'));
  const damaged = { byokProfiles: [null, ...Array.from({ length: 30 }, () => createByokProfile())], byokActiveProfileId: 'missing' };
  normalizeByokSettings(damaged); assert.equal(damaged.byokProfiles.length, 20); assert.equal(damaged.byokActiveProfileId, '');
  const duplicate = { byokProfiles: [profile, profile] }; normalizeByokSettings(duplicate); assert.equal(duplicate.byokProfiles.length, 1);
});

test('legacy default profile names are corrected without overwriting custom names or privacy consent', () => {
  const profile = configured('minimax');
  const value = settings({ ...profile, autoName: undefined, name: 'OpenAI-compatible' });
  normalizeByokSettings(value);
  assert.equal(getByokProfile(value).name, 'MiniMax');
  assert.equal(getByokProfile(value).autoName, true);
  assert.equal(getByokProfile(value).consent, profile.consent);
  assert.ok(hasByokConsent(getByokProfile(value)));
  const custom = updateByokProfile(getByokProfile(value), { name: 'OpenAI-compatible' });
  assert.equal(custom.autoName, false);
  const again = settings(custom); normalizeByokSettings(again);
  assert.equal(getByokProfile(again).name, 'OpenAI-compatible');
  const named = settings({ ...profile, autoName: undefined, name: 'Personal voice' });
  normalizeByokSettings(named);
  assert.equal(getByokProfile(named).name, 'Personal voice');
});

test('endpoint validation disallows credential URLs, HTTP, redirects-by-path and foreign fixed-provider hosts', () => {
  const profile = configured();
  for (const endpoint of ['http://localhost/v1/audio/speech', 'file:///test', 'https://key:secret@example.org/speech',
    'https://example.org/speech?api_key=secret', 'https://example.org/speech#secret', 'not a URL', 'https://example.org/ speech']) {
    assert.throws(() => validateByokEndpoint({ ...profile, endpoint }), /BYOK/);
  }
  assert.equal(validateByokEndpoint({ ...profile, endpoint: 'https://custom.example.org/v2/speech' }), 'https://custom.example.org/v2/speech');
  for (const provider of ['elevenlabs', 'minimax']) assert.throws(() => validateByokEndpoint({ ...profile, provider }), /BYOK/);
  assert.equal(validateByokEndpoint({ ...configured('minimax'), endpoint: 'https://api.minimaxi.com/v1/t2a_v2' }), 'https://api.minimaxi.com/v1/t2a_v2');
});

test('consent is invalidated by provider, endpoint, model, voice and credential changes; destination clears keys', () => {
  const profile = configured(); assert.ok(hasByokConsent(profile));
  for (const patch of [{ model: 'other' }, { voice: 'other' }, { endpoint: 'https://other.example.org/speech' },
    { secretName: 'other-key' }, { credentialSource: 'key-file', keyPath: '/outside/key.txt' }, { provider: 'minimax' }]) {
    const changed = updateByokProfile(profile, patch);
    assert.equal(hasByokConsent(changed), false);
    if (patch.endpoint || patch.provider) { assert.equal(changed.secretName, ''); assert.equal(changed.keyPath, ''); }
    assert.throws(() => assertByokAuthorized(profile, settings(changed)), /revoked/);
  }
  assert.ok(hasByokConsent(updateByokProfile(profile, { name: 'Other name', chunkLimit: 200 })));
  assert.throws(() => assertByokAuthorized(profile, settings({ ...profile, consent: '' })), /revoked/);
  const reset = resetPageSettings(settings(profile), {}, 'engine');
  assert.equal(reset.byokProfiles[0].secretName, profile.secretName); assert.equal(reset.byokProfiles[0].consent, '');
  assert.equal(profile.consent, byokConsentFingerprint(profile));
});

test('all three API adapters preserve complete text and use provider-specific authentication and MP3', () => {
  const text = '中文与 English, [28], [29]. Read all of this.';
  for (const provider of ['openai-compatible', 'elevenlabs', 'minimax']) {
    const profile = configured(provider), request = buildByokRequest(profile, text, 'fake-key');
    const body = JSON.parse(request.body);
    assert.equal(body.input || body.text, text);
    assert.equal(body.model || body.model_id, profile.model);
    assert.equal(request.retryTemporaryFailures, false);
    if (provider === 'elevenlabs') {
      assert.equal(request.headers['xi-api-key'], 'fake-key'); assert.equal(request.headers.Authorization, undefined);
      assert.match(request.endpoint, /\/test-voice\?output_format=mp3_44100_128$/);
    } else assert.equal(request.headers.Authorization, 'Bearer fake-key');
    if (provider === 'minimax') { assert.equal(body.stream, false); assert.equal(body.output_format, 'hex'); assert.equal(body.audio_setting.format, 'mp3'); }
    if (provider === 'openai-compatible') { assert.equal(body.response_format, 'mp3'); assert.equal(body.speed, 1); }
    assert.throws(() => buildByokRequest({ ...profile, consent: '' }, text, 'fake-key'), /confirm/);
    assert.throws(() => buildByokRequest(profile, 'x'.repeat(801), 'fake-key'), /limit/);
    assert.throws(() => buildByokRequest(profile, text, 'key\nheader'), /credential/);
  }
});

test('MP3 and MiniMax completion validation reject bad audio and never echo provider payloads', () => {
  const bytes = mp3(); assert.deepEqual(decodeByokMp3(bytes), bytes);
  const response = { base_resp: { status_code: 0 }, data: { status: 2, audio: bytes.toString('hex') } };
  const encode = value => Buffer.from(JSON.stringify(value));
  assert.deepEqual(decodeMinimaxAudio(encode(response)), bytes);
  for (const bad of [{}, { ...response, data: { ...response.data, status: 1 } },
    { ...response, data: { status: 2, audio: 'https://do-not-fetch.example.org/private.mp3' } },
    { base_resp: { status_code: 1008, status_msg: 'PRIVATE-NOTE-AND-KEY' } },
    { base_resp: { status_code: 'PRIVATE-NOTE-AND-KEY' } }]) {
    assert.throws(() => decodeMinimaxAudio(encode(bad)), error => !error.message.includes('PRIVATE-NOTE-AND-KEY'));
  }
  assert.throws(() => decodeMinimaxAudio(encode({ base_resp: { status_code: 1008 } })), /余额不足/);
  assert.throws(() => decodeByokMp3(Buffer.from('PRIVATE-NOTE-AND-KEY')), error => !error.message.includes('PRIVATE-NOTE-AND-KEY'));
  assert.throws(() => decodeByokMp3(bytes.subarray(0, 30)), /valid MP3/);
  for (const statusCode of [302, 400, 401, 402, 403, 429, 500, undefined]) {
    const error = safeByokRequestError(Object.assign(new Error('PRIVATE-NOTE-AND-KEY'), { statusCode }));
    assert.ok(!error.message.includes('PRIVATE-NOTE-AND-KEY')); assert.match(error.message, /No automatic retry/);
    if (statusCode) assert.match(error.message, new RegExp(String(statusCode)));
  }
});

test('BYOK integrates with online chunking, MP3 export, one-part prefetch and isolated session snapshots', () => {
  const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
  const profile = configured();
  const { dom, api, plugin, pluginClass } = settingsFixture('english', 'byok-tts', settings(profile));
  try {
    assert.equal(api.normalizeSpeechEngine('byok-tts'), 'byok-tts'); assert.equal(api.isOnlineSpeechEngine('byok-tts'), true);
    assert.equal(api.getAudioExportExtension('byok-tts'), 'mp3');
    assert.deepEqual(api.getChunkLimitsForSpeechEngine({ ...plugin.settings, onlineChunkLimits: '200,400,1000' }), [200,400,800]);
    assert.equal(api.getSynthesisPrefetchCount(plugin.settings), 1);
    plugin.sequence = 0;
    const configuration = pluginClass.prototype.getSpeechConfiguration.call(plugin);
    const session = pluginClass.prototype.createSpeechSession.call(plugin, ['test'], 'preview', configuration);
    plugin.settings.byokProfiles[0].model = 'changed';
    assert.equal(session.synthesisSettings.byokProfiles[0].model, 'gpt-4o-mini-tts');
    assert.throws(() => pluginClass.prototype.createSpeechSession.call(plugin, ['test'], 'export after a settings change', configuration), /revoked/);
  } finally { dom.window.close(); }
});

test('HTTP transport never follows redirects or retries BYOK failures, and writes validated MP3 only', async () => {
  const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
  const { EventEmitter } = require('node:events');
  const https = require('node:https');
  const original = https.request;
  const profile = configured();
  const { dom, plugin, pluginClass } = settingsFixture('english', 'byok-tts', settings(profile));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'byok-http-test-'));
  const input = path.join(folder, 'sample.txt'), output = path.join(folder, 'audio.mp3');
  fs.writeFileSync(input, 'A fixed public test sentence.');
  let calls = 0, status = 302, responseBody = mp3();
  try {
    https.request = (endpoint, options, respond) => {
      calls++; assert.equal(endpoint, profile.endpoint); assert.equal(options.headers.Authorization, 'Bearer fake-key');
      const request = new EventEmitter(); request.setTimeout = () => {}; request.destroy = () => request.emit('close');
      request.end = body => {
        assert.equal(JSON.parse(body).input, 'A fixed public test sentence.');
        process.nextTick(() => {
          const response = new EventEmitter(); response.statusCode = status;
          response.headers = { location: 'https://do-not-follow.example.org', 'content-type': 'audio/mpeg' };
          response.resume = () => {}; response.destroy = () => {};
          respond(response); response.emit('data', responseBody); response.emit('end');
        });
      }; return request;
    };
    plugin.isActive = () => true; plugin.readObsidianSecret = async () => 'fake-key';
    plugin.requestRemoteAudio = pluginClass.prototype.requestRemoteAudio;
    plugin.requestRemoteAudioOnce = pluginClass.prototype.requestRemoteAudioOnce;
    const session = { synthesisSettings: settings({ ...profile }) };
    for (status of [302, 402, 429, 500]) {
      const before = calls;
      await assert.rejects(pluginClass.prototype.runByokTts.call(plugin, input, output, session), new RegExp(`HTTP ${status}`));
      assert.equal(calls, before + 1); assert.equal(fs.existsSync(output), false);
    }
    status = 200; responseBody = Buffer.from('PRIVATE-NOTE-AND-KEY');
    await assert.rejects(pluginClass.prototype.runByokTts.call(plugin, input, output, session), error => /valid MP3/.test(error.message) && !error.message.includes('PRIVATE-NOTE-AND-KEY'));
    assert.equal(fs.existsSync(output), false);
    responseBody = mp3(); await pluginClass.prototype.runByokTts.call(plugin, input, output, session);
    assert.deepEqual(fs.readFileSync(output), responseBody); assert.equal(calls, 6);
  } finally { https.request = original; fs.rmSync(folder, { recursive: true, force: true }); dom.window.close(); }
});

test('runtime does not dispatch after consent is revoked while a credential is being read', async () => {
  const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
  const profile = configured();
  const { dom, plugin, pluginClass } = settingsFixture('english', 'byok-tts', settings(profile));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'byok-test-'));
  const input = path.join(folder, 'sample.txt'); fs.writeFileSync(input, 'A fixed test sentence.');
  try {
    const session = { synthesisSettings: settings({ ...profile }) };
    plugin.isActive = () => true;
    let requests = 0;
    plugin.requestRemoteAudio = async request => { requests++; assert.equal(request.retryTemporaryFailures, false); request.decodeAudio(mp3()); };
    plugin.readObsidianSecret = async () => 'fake-key';
    await pluginClass.prototype.runByokTts.call(plugin, input, path.join(folder, 'out.mp3'), session);
    assert.equal(requests, 1);
    plugin.readObsidianSecret = async () => { plugin.settings.byokProfiles = [{ ...profile, consent: '' }]; return 'fake-key'; };
    await assert.rejects(pluginClass.prototype.runByokTts.call(plugin, input, 'unused', session), /revoked/);
    assert.equal(requests, 1);
    plugin.settings.byokProfiles = [{ ...profile }]; plugin.readObsidianSecret = async () => 'fake-key';
    plugin.requestRemoteAudio = async request => { requests++; plugin.settings.byokProfiles = [{ ...profile, consent: '' }]; request.decodeAudio(mp3()); };
    await assert.rejects(pluginClass.prototype.runByokTts.call(plugin, input, 'unused', session), /revoked/);
    assert.equal(requests, 2);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); dom.window.close(); }
});
