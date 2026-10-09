const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { BufferingHint, renderBufferingHint } = require('./buffering-hint');
test('default timers retain the browser global receiver on startup, scheduling and cancellation', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(`
    let scheduled = 0, cancelled = 0;
    globalThis.setTimeout = function(callback, delay) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      scheduled++; return 42;
    };
    globalThis.clearTimeout = function(id) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      cancelled++;
    };
  `, context);
  vm.runInContext(fs.readFileSync(require.resolve('./buffering-hint'), 'utf8'), context);
  vm.runInContext(`
    const session = { bufferMode: 'balanced', prefetchChunks: 1 };
    const plugin = { app: {}, settings: {}, activeSession: session, playbackTimings: { endedAt: null } };
    const hint = new module.exports.BufferingHint(plugin);
    hint.start(session);
    plugin.playbackTimings.endedAt = 1;
    hint.start(session);
    hint.stop();
    if (scheduled !== 1 || cancelled !== 3) throw Error('Timer lifecycle mismatch');
  `, context);
});
function fixture() {
  let time = 0, callback, delay;
  const session = { bufferMode: 'balanced', prefetchChunks: 1 };
  const plugin = { app: {}, settings: {}, activeSession: session, playbackTimings: { endedAt: 1 }, readerState: { phase: 'synthesizing' } };
  const hint = plugin.bufferingHint = new BufferingHint(plugin, { now: () => time,
    schedule: (fn, ms) => { callback = fn; delay = ms; return 1; }, cancel: () => { callback = null; } });
  return { plugin, session, hint, advance: ms => { time += ms; }, fire: () => callback?.(), delay: () => delay };
}
test('one five-second natural gap suggests once per app launch, even after plugin reload', () => {
  const f = fixture(); f.hint.start(f.session); assert.equal(f.delay(), 5000);
  f.advance(5000); f.fire(); assert.equal(f.hint.visibleSession, f.session);
  f.hint.dismiss(); f.hint.start(f.session); f.fire(); assert.equal(f.hint.visibleSession, null);
  const other = new BufferingHint(f.plugin); assert.equal(other.eligible(f.session), false);
});
test('two three-second gaps within the same session qualify; one does not', () => {
  const f = fixture(); f.hint.start(f.session); f.advance(3100); f.hint.playing();
  assert.equal(f.hint.visibleSession, undefined); assert.equal(f.session.waitHintShortCount, 1);
  f.plugin.playbackTimings.endedAt = 2; f.hint.start(f.session); assert.equal(f.delay(), 3000);
  f.advance(3100); f.hint.playing(); assert.equal(f.hint.visibleSession, f.session);
});
test('startup, jump, pause, errors, mode, disabled preference and stale sessions suppress suggestions', () => {
  for (const mutate of [
    f => f.plugin.playbackTimings.endedAt = null,
    f => f.plugin.playbackTimings.intent = { kind: 'jumpToPlaying' },
    f => f.plugin.pauseRequested = true,
    f => f.session.waitHintError = true,
    f => f.session.seekTarget = {},
    f => f.session.requestedChunkIndex = 2,
    f => f.session.bufferMode = 'continuous',
    f => f.session.prefetchChunks = 0,
    f => f.plugin.settings.bufferingHints = false,
    f => f.plugin.activeSession = {},
  ]) {
    const f = fixture(); f.hint.start(f.session); mutate(f); f.advance(6000); f.fire(); f.hint.playing();
    assert.equal(f.hint.visibleSession, undefined); assert.equal(f.session.waitHintShortCount, undefined);
  }
});
test('short waits and cancelled timers do not notify', () => {
  const f = fixture(); f.hint.start(f.session); f.advance(1000); f.hint.playing();
  assert.equal(f.session.waitHintShortCount, undefined);
  f.hint.start(f.session); f.hint.stop(); f.fire(); assert.equal(f.hint.visibleSession, undefined);
});
test('inline suggestion keeps DOM, opens settings without switching modes, and saves opt-out', () => {
  const f = fixture(), dom = new JSDOM('<main></main>'), root = dom.window.document.querySelector('main');
  let saved = 0, opened = 0;
  f.plugin.manifest = { id: 'test' }; f.plugin.settings.settingsLanguage = 'chinese';
  f.plugin.readerSettingsTab = { display() {} };
  f.plugin.app.setting = { open() {}, openTabById(id) { assert.equal(id, 'test'); opened++; } };
  f.plugin.saveSettings = async () => { saved++; };
  f.plugin.runUserAction = (_name, action) => action();
  f.hint.show(f.session);
  const el = renderBufferingHint(f.plugin, root);
  assert.match(el.textContent, /“在线播放缓冲”中切换为“连续收听”/);
  assert.match(el.textContent, /若使用收费接口，可能增加费用/);
  const buttons = el.querySelectorAll('button');
  buttons[0].focus();
  assert.equal(renderBufferingHint(f.plugin, root, el), el);
  assert.equal(dom.window.document.activeElement, buttons[0]);
  buttons[0].click(); assert.equal(opened, 1); assert.equal(f.plugin.readerSettingsTab.settingsPage, 'playback');
  assert.equal(f.session.bufferMode, 'balanced');
  buttons[1].click(); assert.equal(saved, 1); assert.equal(f.plugin.settings.bufferingHints, false);
  assert.equal(renderBufferingHint(f.plugin, root, el), null);
  dom.window.close();
});
