'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { synthesizeRealtimePcm, transcriptKey, MAX_PCM_BYTES } = require('./openai-realtime');
const { REALTIME_ENDPOINT, REALTIME_MODEL, openAiSpeechNotice, realtimeConfigurationError } = require('./openai-speech-policy');
const profile = { provider: 'openai-realtime', endpoint: REALTIME_ENDPOINT, model: REALTIME_MODEL, voice: 'coral' };
const text = 'This public sample is read aloud. 这是公开示例。';
const pcm = Buffer.from([1, 0, 2, 0]);

function fixture(options = {}) {
  const sockets = [], requests = [];
  class Socket {
    constructor(url, protocols) {
      this.url = url; this.protocols = protocols; this.readyState = 1; this.listeners = new Map(); this.sent = [];
      sockets.push(this);
      if (!options.noSession) queueMicrotask(() => this.emit('message', { type: 'session.created', session: {
        type: 'realtime', audio: { output: { voice: 'coral', format: { type: 'audio/pcm', rate: 24000 } } }, ...options.session } }));
    }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    removeEventListener(type) { this.listeners.delete(type); }
    emit(type, event) { this.listeners.get(type)?.(type === 'message' ? { data: JSON.stringify(event) } : event); }
    send(value) {
      const event = JSON.parse(value); this.sent.push(event);
      if (event.type !== 'response.create' || options.hold) return;
      queueMicrotask(() => {
        if (options.events) { for (const event of options.events) this.emit('message', event); return; }
        const base = { response_id: 'resp_public', item_id: 'item_public', output_index: 0, content_index: 0 };
        this.emit('message', { type: 'response.created', response: { id: base.response_id } });
        this.emit('message', { type: 'response.output_audio.delta', ...base, delta: (options.pcm || pcm).toString('base64') });
        if (!options.omitAudioDone) this.emit('message', { type: 'response.output_audio.done', ...base });
        this.emit('message', { type: 'response.output_audio_transcript.done', ...base, transcript: options.transcript ?? text });
        this.emit('message', { type: 'response.done', response: { id: base.response_id, status: options.status || 'completed', output: [
          { type: 'message', role: 'assistant', id: base.item_id, content: [{ type: 'audio', transcript: options.transcript ?? text }] },
        ] } });
      });
    }
    close() { this.readyState = 3; }
  }
  const requestJson = async (request, signal) => {
    requests.push({ request, signal });
    if (options.tokenWait) return options.tokenWait;
    if (options.tokenError) throw new Error('PRIVATE_RESPONSE_AND_SECRET');
    return options.credential || { value: 'ek_public_fake_token', expires_at: Math.floor(Date.now() / 1000) + 60 };
  };
  return { sockets, requests, options: { profile, text, apiKey: 'fake-api-key', requestJson, WebSocketClass: Socket, pollMs: 2, timeoutMs: 200, ...options.overrides } };
}

test('OpenAI shutdown notice is limited to official legacy models and never changes a profile', () => {
  const p = { provider: 'openai-compatible', endpoint: 'https://api.openai.com/v1/audio/speech', model: 'gpt-4o-mini-tts', consent: 'unchanged' };
  const original = JSON.stringify(p);
  assert.match(openAiSpeechNotice(p), /2027-01-06/);
  assert.match(openAiSpeechNotice({ ...p, endpoint: 'https://API.OPENAI.COM:443/v1/audio/speech' }), /2027-01-06/);
  assert.match(openAiSpeechNotice(p, true), /不能只替换模型名/);
  assert.match(openAiSpeechNotice(p, false, Date.parse('2027-01-07')), /date has passed/);
  assert.equal(openAiSpeechNotice({ ...p, endpoint: 'https://custom.example.org/v1/audio/speech' }), '');
  assert.equal(openAiSpeechNotice({ ...p, provider: 'openrouter' }), '');
  assert.equal(openAiSpeechNotice({ ...p, model: 'another-tts' }), '');
  assert.equal(JSON.stringify(p), original);
  assert.match(realtimeConfigurationError({ ...p, model: REALTIME_MODEL }), /not \/audio\/speech/);
  assert.equal(realtimeConfigurationError(profile), '');
  assert.match(realtimeConfigurationError({ ...profile, endpoint: 'https://other.example.org' }), /fixed/);
  assert.match(realtimeConfigurationError({ ...profile, voice: 'unverified' }), /listed voice/);
});

test('Realtime uses only an ephemeral credential, isolated input and no tools or microphone', async () => {
  const f = fixture();
  assert.deepEqual(await synthesizeRealtimePcm(f.options), new Uint8Array(pcm));
  assert.equal(f.requests.length, 1); assert.equal(f.sockets.length, 1);
  const request = f.requests[0].request, session = JSON.parse(request.body).session;
  assert.equal(request.url, REALTIME_ENDPOINT);
  assert.equal(request.headers.Authorization, 'Bearer fake-api-key');
  assert.equal(JSON.parse(request.body).expires_after.seconds, 60);
  assert.equal(request.body.includes(text), false);
  assert.deepEqual(session.tools, []); assert.equal(session.tool_choice, 'none');
  assert.equal(session.audio.input.turn_detection, null);
  assert.equal(session.audio.output.format.rate, 24000);
  const socket = f.sockets[0];
  assert.equal(socket.url.includes('fake-api-key'), false);
  assert.deepEqual(socket.protocols, ['realtime', 'openai-insecure-api-key.ek_public_fake_token']);
  assert.equal(socket.sent[0].response.conversation, 'none');
  assert.equal(socket.sent[0].response.input[0].content[0].text, text);
  assert.equal(JSON.stringify(socket.sent).includes('fake-api-key'), false);
  assert.equal(socket.readyState, 3); assert.equal(socket.listeners.size, 0);
  assert.equal(f.requests[0].signal.aborted, true);
});

test('transcript checks ignore casing and ordinary punctuation, but retain numbers and math operators', () => {
  assert.equal(transcriptKey('Hello, WORLD!'), transcriptKey('hello world.'));
  assert.notEqual(transcriptKey('A + B'), transcriptKey('A - B'));
  assert.notEqual(transcriptKey('x < y'), transcriptKey('x > y'));
  assert.notEqual(transcriptKey('2 samples'), transcriptKey('two samples'));
});

test('Realtime rejects mismatches, incomplete output, unsupported formats and server errors without leaking text', async () => {
  for (const options of [{ transcript: 'A different sentence.' }, { omitAudioDone: true }, { status: 'incomplete' },
    { pcm: Buffer.from([1]) }, { session: { audio: { output: { voice: 'coral', format: { type: 'audio/pcmu', rate: 8000 } } } } },
    { events: [{ type: 'error', error: { message: 'PRIVATE_RESPONSE_AND_SECRET' } }] },
    { tokenError: true }, { credential: { value: 'PRIVATE_RESPONSE_AND_SECRET', expires_at: Date.now() / 1000 + 60 } },
    { credential: { value: 'ek_public_fake_token', expires_at: 1 } }]) {
    const f = fixture(options);
    await assert.rejects(synthesizeRealtimePcm(f.options), error => /OpenAI Realtime/.test(error.message) && !error.message.includes('PRIVATE_RESPONSE_AND_SECRET'));
    assert.equal(f.requests.length, 1);
    for (const socket of f.sockets) assert.equal(socket.readyState, 3);
  }
});

test('wrong response IDs, duplicate events, bad base64 and oversized audio fail closed', async () => {
  const created = { type: 'response.created', response: { id: 'resp_public' } };
  const delta = { type: 'response.output_audio.delta', response_id: 'resp_public', item_id: 'item_public', output_index: 0, content_index: 0, delta: pcm.toString('base64') };
  const large = { ...delta, delta: Buffer.alloc(1024 * 1024).toString('base64') };
  for (const events of [[created, { ...delta, response_id: 'other' }], [created, { ...delta, content_index: 1 }],
    [created, { ...delta, delta: 'invalid data' }], [created, { ...delta, event_id: 'same' }, { ...delta, event_id: 'same' }],
    [created, ...Array.from({ length: Math.ceil(MAX_PCM_BYTES / (1024 * 1024)) + 1 }, () => large)]]) {
    const f = fixture({ events });
    await assert.rejects(synthesizeRealtimePcm(f.options), /No automatic retry/);
    assert.equal(f.sockets[0].readyState, 3);
  }
});

test('Stop, authorization revocation, token and socket timeouts clean up without starting extra work', async () => {
  const aborted = new AbortController(); aborted.abort();
  const before = fixture({ overrides: { signal: aborted.signal } });
  await assert.rejects(synthesizeRealtimePcm(before.options), /stopped/);
  assert.equal(before.requests.length, 0);
  const pending = fixture({ tokenWait: new Promise(() => {}), overrides: { timeoutMs: 5 } });
  await assert.rejects(synthesizeRealtimePcm(pending.options), /timed out/);
  assert.equal(pending.requests[0].signal.aborted, true); assert.equal(pending.sockets.length, 0);
  const idle = fixture({ noSession: true, overrides: { timeoutMs: 5 } });
  await assert.rejects(synthesizeRealtimePcm(idle.options), /timed out/);
  assert.equal(idle.sockets[0].readyState, 3);
  let allowed = true;
  const revoked = fixture({ hold: true, overrides: { assertAuthorized: () => { if (!allowed) throw new Error('private authorization'); } } });
  const promise = synthesizeRealtimePcm(revoked.options);
  setTimeout(() => { allowed = false; }, 5);
  await assert.rejects(promise, /authorization changed/);
  assert.equal(revoked.sockets[0].readyState, 3);
  assert.equal(revoked.sockets[0].listeners.size, 0);
});

test('desktop Realtime creates validated WAV and selects WAV for playback, cache and export', async () => {
  const { synthesizeRealtimeWav } = require('./openai-realtime-desktop');
  const { parseWaveBuffer } = require('./audio-export');
  const f = fixture();
  const wave = await synthesizeRealtimeWav(f.options);
  const parsed = parseWaveBuffer(wave);
  assert.equal(wave.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wave.readUInt32LE(24), 24000);
  assert.deepEqual(wave.subarray(44), pcm);
  assert.ok(parsed);
  const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
  const fixtureUi = settingsFixture('english', 'byok-tts');
  try {
    assert.equal(fixtureUi.api.getAudioExportExtension('byok-tts', { byokProfile: profile }), 'wav');
    assert.equal(fixtureUi.api.getAudioExportExtension('byok-tts', { byokProfiles: [{ ...profile, id: 'a' }], byokActiveProfileId: 'a' }), 'wav');
    assert.equal(fixtureUi.api.getAudioExportExtension('byok-tts'), 'mp3');
  } finally { fixtureUi.dom.window.close(); }
});

test('desktop token requests reject redirects, excessive or truncated JSON and never leak response bodies', async () => {
  const { requestRealtimeJson } = require('./openai-realtime-desktop');
  const https = require('node:https'), { EventEmitter } = require('node:events');
  const original = https.request;
  try {
    for (const [status, body] of [[302, 'PRIVATE_RESPONSE_AND_SECRET'], [401, 'PRIVATE_RESPONSE_AND_SECRET'], [200, 'x'.repeat(65537)], [200, '{broken'], [200, '{"value":"ek_public_fake_token"}']]) {
      let calls = 0;
      https.request = (url, options, respond) => {
        calls++;
        const request = new EventEmitter(); request.setTimeout = () => {}; request.destroy = () => {};
        request.end = () => queueMicrotask(() => {
          const response = new EventEmitter(); response.statusCode = status; response.headers = { 'content-type': 'application/json' };
          response.resume = () => {}; response.destroy = () => {};
          respond(response); response.emit('data', Buffer.from(body)); response.emit('end');
        });
        return request;
      };
      const promise = requestRealtimeJson({ url: REALTIME_ENDPOINT, headers: {}, body: '{}' }, new AbortController().signal);
      if (body.startsWith('{"value"')) assert.equal((await promise).value, 'ek_public_fake_token');
      else await assert.rejects(promise, error => !error.message.includes('PRIVATE_RESPONSE_AND_SECRET'));
      assert.equal(calls, 1);
    }
  } finally { https.request = original; }
});
