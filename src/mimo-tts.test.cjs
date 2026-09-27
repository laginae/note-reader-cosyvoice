const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MIMO_DEFAULTS, MIMO_VOICES, buildMimoRequestBody, decodeMimoAudio, normalizeMimoSettings } = require('./mimo-tts');

test('MiMo requires explicit consent and defaults to a documented male voice', () => {
  assert.equal(MIMO_DEFAULTS.mimoConsent, false);
  assert.equal(MIMO_DEFAULTS.mimoVoice, '白桦');
  assert.equal(new Set(MIMO_VOICES.map(([id]) => id)).size, 8);
  const settings = { mimoConsent: 'true', mimoVoice: 'unknown', mimoCredentialSource: 'unknown' };
  normalizeMimoSettings(settings);
  assert.equal(settings.mimoConsent, false);
  assert.equal(settings.mimoVoice, '白桦');
  assert.equal(settings.mimoCredentialSource, 'obsidian-secret');
});

test('MiMo preserves target text in the assistant role, never in style instructions', () => {
  const text = 'Coverage is 95%, references [28], [29]. 中文。';
  for (const [voice] of MIMO_VOICES) {
    const body = JSON.parse(buildMimoRequestBody(text, { mimoVoice: voice, speed: 1.25 }));
    assert.equal(body.messages[1].content, text);
    assert.equal(body.messages[1].role, 'assistant');
    assert.equal(body.audio.voice, voice);
    assert.equal(body.audio.format, 'wav');
    assert.equal(body.stream, false);
    assert.equal(body.provider, undefined);
    assert.match(body.messages[0].content, /1.25/);
  }
});

test('MiMo rejects malformed, missing, non-audio and echoed error payloads', () => {
  const encode = obj => Buffer.from(JSON.stringify(obj));
  for (const bytes of [Buffer.from('bad JSON'), encode({ error: 'PRIVATE TEXT' }), encode({}),
    encode({ choices: [{ message: { audio: { data: 'not base64!' } } }] }),
    encode({ choices: [{ message: { audio: { data: Buffer.from('PRIVATE TEXT').toString('base64') } } }] })]) {
    assert.throws(() => decodeMimoAudio(bytes), error => /MiMo TTS/.test(error.message) && !/PRIVATE TEXT/.test(error.message));
  }
});
