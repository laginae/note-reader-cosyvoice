'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const notices = [], loaded = { exports: {} };
class Notice {
  constructor(message, duration) { this.message = message; this.duration = duration; this.hidden = false; notices.push(this); }
  setMessage(message) { this.message = message; return this; }
  hide() { this.hidden = true; }
}
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}, Notice } : require(name), loaded, loaded.exports);
function fixture(language = 'chinese') {
  const plugin = Object.create(loaded.exports.default.prototype);
  plugin.settings = { settingsLanguage: language, playbackSpeed: 1 };
  return plugin;
}
test('rate feedback reuses one notice and expires after the latest change', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const plugin = fixture(), before = notices.length;
  plugin.showPlaybackRateNotice(1.25); const notice = plugin.playbackRateNotice;
  assert.equal(notice.message, '播放倍速：1.25x'); assert.equal(notice.duration, 0);
  t.mock.timers.tick(1000); plugin.showPlaybackRateNotice(1.5);
  assert.equal(plugin.playbackRateNotice, notice); assert.equal(notices.length, before + 1);
  assert.equal(notice.message, '播放倍速：1.5x');
  t.mock.timers.tick(400); assert.equal(notice.hidden, false);
  t.mock.timers.tick(1000); assert.equal(notice.hidden, true);
  assert.equal(plugin.playbackRateNotice, null); assert.equal(plugin.playbackRateNoticeTimer, null);
});
test('rate notice cleanup is idempotent and English feedback contains no source labels', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const plugin = fixture('english'); plugin.showPlaybackRateNotice(1.75);
  const notice = plugin.playbackRateNotice; assert.equal(notice.message, 'Playback speed: 1.75x');
  plugin.hidePlaybackRateNotice(); plugin.hidePlaybackRateNotice();
  assert.equal(notice.hidden, true); assert.equal(plugin.playbackRateNoticeTimer, null);
  t.mock.timers.tick(2000); assert.equal(plugin.playbackRateNotice, null);
});
test('volume and speed reuse one short notice without displaying source information', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const plugin = fixture(), before = notices.length;
  plugin.showPlaybackRateNotice(1.5); const notice = plugin.playbackRateNotice;
  plugin.showPlaybackVolumeNotice(0.7); assert.equal(plugin.playbackRateNotice, notice); assert.equal(notices.length, before + 1);
  assert.equal(notice.message, '音量：70%');
  plugin.settings.settingsLanguage = 'english'; plugin.showPlaybackVolumeNotice(0); assert.equal(notice.message, 'Volume: 0%');
  plugin.showPlaybackVolumeNotice(2); assert.equal(notice.message, 'Volume: 100%');
  t.mock.timers.tick(1400); assert.equal(notice.hidden, true);
});
test('floating rate feedback appears after the actual rate changes without waiting for settings writes', async t => {
  const plugin = fixture(), before = notices.length, saves = [];
  t.after(() => plugin.hidePlaybackRateNotice());
  plugin.currentAudio = {}; plugin.renderReaderViews = () => {};
  plugin.saveSettings = () => new Promise(resolve => saves.push(resolve));
  const pending = plugin.setPlaybackSpeed(1.5, { announce: true });
  assert.equal(plugin.currentAudio.playbackRate, 1.5);
  assert.equal(plugin.playbackRateNotice.message, '播放倍速：1.5x');
  assert.equal(notices.length, before + 1); saves.shift()(); await pending;
  const ordinary = plugin.setPlaybackSpeed(1.75);
  assert.equal(notices.length, before + 1); assert.equal(plugin.playbackRateNotice.message, '播放倍速：1.5x');
  saves.shift()(); await ordinary;
});
