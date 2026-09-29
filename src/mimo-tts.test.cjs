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
    encode({ choices: [{ finish_reason: 'stop', message: { audio: { data: 'not base64!' } } }] }),
    encode({ choices: [{ finish_reason: 'stop', message: { audio: { data: Buffer.from('PRIVATE TEXT').toString('base64') } } }] })]) {
    assert.throws(() => decodeMimoAudio(bytes), error => /MiMo TTS/.test(error.message) && !/PRIVATE TEXT/.test(error.message));
  }
});

function wavFixture() {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(24000, 4);
  format.writeUInt32LE(48000, 8);
  format.writeUInt16LE(2, 12);
  format.writeUInt16LE(16, 14);
  const { createWaveHeader } = require('./audio-export');
  return Buffer.concat([createWaveHeader(format, 48000), Buffer.alloc(48000)]);
}

test('MiMo rejects playable but provider-truncated audio, and accepts normal completion', () => {
  const wav = wavFixture();
  const response = reason => Buffer.from(JSON.stringify({ choices: [{ finish_reason: reason, message: { audio: { data: wav.toString('base64') } } }] }));
  assert.deepEqual(decodeMimoAudio(response('stop')), wav);
  for (const reason of ['length', 'content_filter', 'repetition_truncation', null, undefined, 'PRIVATE RESPONSE']) {
    assert.throws(() => decodeMimoAudio(response(reason)), error => /Reading stopped without advancing/.test(error.message) && !error.message.includes('PRIVATE RESPONSE'));
  }
});

test('MiMo rejects truncated WAV payloads despite normal provider completion', () => {
  const wav = wavFixture().subarray(0, 500);
  const response = Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { audio: { data: wav.toString('base64') } } }] }));
  assert.throws(() => decodeMimoAudio(response), /truncated or invalid WAV/);
});

test('MiMo short chunks preserve all non-whitespace text and request payloads in order', () => {
  const { splitTextForSpeechChunks, createIncrementalSpeechChunker } = require('./semantic-chunker');
  const text = Array.from({ length: 40 }, (_, i) => `第${i}节。测试中文内容与 English references [28], [29]. 后半段必须完整保留。`).join('\n\n');
  const chunks = splitTextForSpeechChunks(text, [200, 200, 200]);
  const compact = value => value.replace(/\s/g, '');
  assert.equal(compact(chunks.join('')), compact(text));
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 200);
    assert.equal(JSON.parse(buildMimoRequestBody(chunk, MIMO_DEFAULTS)).messages[1].content, chunk);
  }
  const incremental = createIncrementalSpeechChunker([200]);
  const result = [];
  result.push(...incremental.push(text.slice(0, 700)));
  result.push(...incremental.push(text.slice(700)));
  result.push(...incremental.finish());
  assert.equal(compact(result.join('')), compact(text));
});
