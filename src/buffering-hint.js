'use strict';

const shownKey = Symbol.for('cozy-read-aloud.buffering-hint-shown');
class BufferingHint {
  // Browser timers require the global receiver, not the BufferingHint instance.
  constructor(plugin, { now = () => Date.now(),
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    cancel = timer => globalThis.clearTimeout(timer) } = {}) {
    this.plugin = plugin; this.now = now; this.schedule = schedule; this.cancel = cancel;
  }
  eligible(session) {
    const p = this.plugin;
    return p.activeSession === session && session.bufferMode === 'balanced' && session.prefetchChunks > 0
      && session.kind !== 'audio-export' && session.kind !== 'voice-preview'
      && p.settings.bufferingHints !== false && !(p.app || p)[shownKey];
  }
  start(session) {
    this.stop();
    const p = this.plugin, timings = p.playbackTimings;
    if (!this.eligible(session) || timings?.endedAt == null || timings.intent) return;
    const endedAt = timings.endedAt;
    const started = this.now();
    const valid = () => this.eligible(session) && !p.pauseRequested && !session.waitHintError
      && !session.seekTarget && !Number.isInteger(session.requestedChunkIndex)
      && timings.endedAt === endedAt && !timings.intent;
    this.pending = { session, started, valid };
    this.timer = this.schedule(() => {
      if (valid()) this.show(session);
    }, session.waitHintShortCount >= 1 ? 3000 : 5000);
    this.timer?.unref?.();
  }
  show(session) {
    (this.plugin.app || this.plugin)[shownKey] = true;
    this.visibleSession = session;
    this.plugin.renderReaderViews?.();
  }
  playing() {
    const pending = this.pending;
    if (pending?.valid()) {
      const elapsed = this.now() - pending.started;
      if (elapsed >= 3000) pending.session.waitHintShortCount = (pending.session.waitHintShortCount || 0) + 1;
      if (elapsed >= 5000 || pending.session.waitHintShortCount >= 2) this.show(pending.session);
    }
    this.stop();
  }
  stop(session) {
    if (session && this.pending?.session !== session) return;
    this.cancel(this.timer); this.timer = null; this.pending = null;
  }
  dismiss() {
    this.visibleSession = null;
    this.plugin.renderReaderViews?.();
  }
}

function renderBufferingHint(plugin, parent, existing, setIcon = () => {}) {
  const hint = plugin.bufferingHint;
  const visible = hint?.visibleSession && hint.visibleSession === plugin.activeSession
    && plugin.settings.bufferingHints !== false && !['error', 'complete', 'idle'].includes(plugin.readerState?.phase);
  if (!visible) { existing?.remove(); return null; }
  if (existing) { if (existing.parentNode !== parent) parent.append(existing); return existing; }
  const doc = parent.ownerDocument, root = doc.createElement('div');
  root.className = 'note-reader-buffering-hint';
  const zh = plugin.settings.settingsLanguage === 'chinese';
  const text = doc.createElement('span');
  text.textContent = zh ? '段间等待较长。可在“在线播放缓冲”中切换为“连续收听”，以减少停顿。该模式会提前合成更多文字；若使用收费接口，可能增加费用。'
    : 'Long pauses between audio parts. In Online playback buffering, switch to Continuous listening to help reduce pauses. This prepares more text ahead; paid services may incur additional charges.';
  root.append(text);
  const add = (label, action) => {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action); root.append(button); return button;
  };
  add(zh ? '查看缓冲设置' : 'Buffer settings', () => {
    const tab = plugin.readerSettingsTab;
    if (!tab || !plugin.app?.setting?.openTabById) return;
    tab.settingsPage = 'playback';
    plugin.app.setting.open(); plugin.app.setting.openTabById(plugin.manifest.id);
    tab.display(); hint.dismiss();
  });
  add(zh ? '不再提示' : "Don't show again", () => {
    plugin.settings.bufferingHints = false; hint.dismiss();
    plugin.runUserAction('Save buffering hint preference', () => plugin.saveSettings());
  });
  const close = add('', () => hint.dismiss());
  setIcon(close, 'x');
  close.setAttribute('aria-label', zh ? '关闭提示' : 'Dismiss suggestion');
  parent.append(root); return root;
}
module.exports = { BufferingHint, renderBufferingHint };
