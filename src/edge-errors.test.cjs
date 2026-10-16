const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { edgeTtsError } = require('./edge-errors');

test('Edge failures show actionable messages without subprocess paths, text or tokens', () => {
  for (const language of ['english', 'chinese']) {
    for (const [detail, marker] of [['WSServerHandshakeError: 403', '403'], ['429 Too Many Requests', '429'],
      ['NoAudioReceived', language === 'chinese' ? '未返回音频' : 'no audio'],
      ['CERTIFICATE_VERIFY_FAILED', language === 'chinese' ? '证书' : 'certificate']]) {
      const message = edgeTtsError(`${detail}\nTraceback /private/example.py wss://example.test/?token=TEST_SENTINEL`, language);
      assert.ok(message.includes(marker));
      assert.doesNotMatch(message, /Traceback|private|example|TEST_SENTINEL|wss:/);
      assert.ok(message.length < 300);
    }
    for (const kind of ['failed', 'command', 'timeout']) {
      assert.doesNotMatch(edgeTtsError('PRIVATE_SENTINEL', language, kind), /PRIVATE_SENTINEL/);
    }
  }
});

test('Edge subprocess failures use sanitized errors in the actual plugin path', async () => {
  const loaded = { exports: {} };
  let child;
  new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/../main.js`, 'utf8'))(
    name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {} }
      : name === 'child_process' ? { spawn: () => {
        child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
        return child;
      } } : require(name), loaded, loaded.exports);
  const plugin = Object.create(loaded.exports.default.prototype);
  plugin.settings = { settingsLanguage: 'chinese' }; plugin.isActive = () => true;
  const pending = plugin.runEdgeTts('public-input.txt', 'public-output.mp3', {});
  child.stderr.emit('data', Buffer.from('WSServerHandshakeError: 403 PRIVATE_SENTINEL'));
  child.emit('close', 1);
  await assert.rejects(pending, error => /HTTP 403/.test(error.message) && !error.message.includes('PRIVATE_SENTINEL'));
  assert.equal(plugin.currentProcess, null);
  const missing = plugin.runEdgeTts('public-input.txt', 'public-output.mp3', {});
  child.emit('error', new Error('ENOENT PRIVATE_SENTINEL'));
  await assert.rejects(missing, error => /无法启动/.test(error.message) && !error.message.includes('PRIVATE_SENTINEL'));
});
