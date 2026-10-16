const test = require('node:test');
const assert = require('node:assert/strict');
const { safeRemoteErrorDetail, MAX_ERROR_BYTES } = require('./remote-error-detail');

test('remote errors expose only known categories and parameter names, never upstream text', () => {
  const privateText = 'PRIVATE-INPUT sk-private-key C:/private/file.pdf';
  const detail = safeRemoteErrorDetail(JSON.stringify({ error: { message: `Invalid SSML ${privateText}`, param: 'input', metadata: { raw: privateText } } }));
  assert.equal(detail.reason, 'invalid_ssml');
  assert.equal(detail.parameter, 'input');
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE|sk-private|file\.pdf/);
  assert.equal(safeRemoteErrorDetail(JSON.stringify({ error: { message: privateText, param: privateText } })), null);
  assert.equal(safeRemoteErrorDetail('<html>private response</html>'), null);
  assert.equal(safeRemoteErrorDetail('x'.repeat(MAX_ERROR_BYTES + 1)), null);
});

test('nested provider diagnostics distinguish credit, length, voice and concurrency failures', () => {
  for (const [message, reason] of [
    ['Insufficient credits', 'payment_required'], ['input is too long', 'string_too_long'],
    ['voice not supported', 'invalid_voice'], ['concurrency limit exceeded', 'rate_limit_exceeded'],
    ['speed must be between 0.5 and 2', 'invalid_speed'], ['No endpoints available', 'no_provider'],
  ]) {
    const detail = safeRemoteErrorDetail(JSON.stringify({ error: { message: 'Provider rejected request', metadata: { raw: JSON.stringify({ error: { message } }) } } }));
    assert.equal(detail.reason, reason);
  }
});

test('HTTP diagnostics are bounded, do not retry 400, and do not write failed audio', async () => {
  const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
  const { EventEmitter } = require('node:events');
  const https = require('node:https');
  const { dom, plugin, pluginClass } = settingsFixture('english', 'openrouter-tts');
  const original = https.request;
  let calls = 0, large = false;
  try {
    plugin.isActive = () => true;
    https.request = (_endpoint, _options, respond) => {
      calls++;
      const request = new EventEmitter(); request.setTimeout = () => {}; request.destroy = () => {};
      request.end = () => process.nextTick(() => {
        const response = new EventEmitter(); response.statusCode = 400; response.headers = {};
        response.destroy = () => response.emit('close');
        respond(response);
        response.emit('data', large ? Buffer.alloc(MAX_ERROR_BYTES + 1) : Buffer.from(JSON.stringify({error:{message:'Invalid SSML PRIVATE secret',param:'input'}})));
        response.emit('end');
      });
      return request;
    };
    plugin.requestRemoteAudioOnce = pluginClass.prototype.requestRemoteAudioOnce;
    const run = () => pluginClass.prototype.requestRemoteAudio.call(plugin, {endpoint:new URL('https://example.invalid'),headers:{},body:'{}',session:{},serviceLabel:'Test',retryTemporaryFailures:true});
    await assert.rejects(run, error => error.statusCode === 400 && error.providerReason === 'invalid_ssml' && !/PRIVATE|secret/.test(error.message));
    large = true;
    await assert.rejects(run, /HTTP 400/);
    assert.equal(calls, 2);
    assert.equal(plugin.currentRequests.size, 0);
  } finally { https.request = original; dom.window.close(); }
});
