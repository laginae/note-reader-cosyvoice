'use strict';

const SHOW_MS = 8000, RETRY_MS = 15000;
const MANUAL_RETRY = Symbol('retry-current-audio-part');
const supportedEngine = engine => ['mimo-tts','openrouter-tts','azure-speech'].includes(engine);

// Per-session state. A prefetch can become foreground without starting another request.
class ReadingWait {
  constructor(plugin, session, timings, clock = {}) {
    this.plugin = plugin; this.session = session; this.timings = timings;
    this.now = () => timings.now();
    this.schedule = clock.schedule || ((fn, delay) => setTimeout(fn,delay));
    this.cancel = clock.cancel || (id => clearTimeout(id));
    this.requests = new Map();
    this.gates = new Set();
  }
  currentKey(key) {
    return !!this.target && this.target.key === key && this.plugin.isActive(this.session)
      && !Number.isInteger(this.session.requestedChunkIndex) && !this.session.seekTarget;
  }
  stage() {
    const rec = this.requests.get(this.target?.key);
    if ((!rec || rec.stage === 'backoff') && this.session.preparationPool?.cooldownUntil > this.now()) return 'limited';
    return rec?.stage || 'preparing';
  }
  account() {
    const t = this.target;
    if (!t) return;
    const now = this.now(), delta = Math.max(0, now - t.last);
    if (!t.paused) { t.ms += delta; t.times[this.stage()] += delta; }
    t.last = now;
  }
  begin(key) {
    this.end(this.target, false);
    this.target = { key, last:this.now(), ms:0, paused:!!this.plugin.pauseRequested,
      times:{preparing:0,response:0,receiving:0,finishing:0,backoff:0,limited:0,cancelling:0},
      attempts:this.requests.get(key)?.attempt || 0, manual:0 };
    this.arm();
    return this.target;
  }
  arm() {
    this.cancel(this.timer); this.timer = null;
    if (!this.target || this.target.paused) return;
    const target = this.target;
    this.timer = this.schedule(() => {
      if (this.target !== target) return;
      this.account();
      if (this.currentKey(target.key)) this.plugin.refreshWaitControls?.();
      this.arm();
    }, this.target.ms < SHOW_MS ? Math.max(1, SHOW_MS - this.target.ms) : 1000);
    this.timer?.unref?.();
  }
  pause(paused) {
    if (!this.target || this.target.paused === paused) return;
    this.account(); this.target.paused = paused;
    this.wake();
    this.arm(); this.plugin.refreshWaitControls?.();
  }
  end(target, completed) {
    if (!target || target !== this.target) return;
    this.account(); this.cancel(this.timer); this.timer = null; this.target = null;
    this.wake();
    if (target.ms >= SHOW_MS) {
      const d = target.times;
      this.timings.recordLongWait?.({ms:Math.round(target.ms),responseMs:Math.round(d.response),
        receiveMs:Math.round(d.receiving),retryWaitMs:Math.round(d.backoff+d.limited),
        otherMs:Math.round(d.preparing+d.cancelling+d.finishing),attempts:target.attempts,
        manualRetries:target.manual,completed:completed ? 1 : 0});
      this.plugin.refreshWaitControls?.();
    }
  }
  attempt(key, attempt, manualUsed) {
    if (typeof key !== 'string' || !this.plugin.isActive(this.session)) return null;
    this.account();
    const rec = {key,attempt,manualUsed,stage:'response',activity:this.now(),cancel:null};
    this.requests.set(key,rec);
    if (this.target?.key === key) this.target.attempts = attempt;
    return rec;
  }
  mark(rec, stage) {
    if (!rec || this.requests.get(rec.key) !== rec) return;
    this.account(); rec.stage = stage; rec.activity = this.now();
    if (stage !== 'response' && stage !== 'receiving') rec.cancel = null;
  }
  forget(rec) {
    if (!rec || this.requests.get(rec.key) !== rec) return;
    this.account(); this.requests.delete(rec.key); rec.cancel = null;
  }
  view() {
    const t = this.target;
    if (!t || t.paused || this.plugin.pauseRequested || !this.currentKey(t.key)) return null;
    this.account();
    if (t.ms < SHOW_MS) return null;
    const rec = this.requests.get(t.key), stage = this.stage();
    const retry = rec?.cancel && !rec.manualUsed && (stage === 'response' || stage === 'receiving')
      && t.ms >= RETRY_MS && this.now() - rec.activity >= RETRY_MS
      && !(this.session.preparationPool?.cooldownUntil > this.now());
    if (retry && t.ticket?.request !== rec) t.ticket = {request:rec};
    return {stage,seconds:Math.floor(t.ms/1000),attempt:rec?.attempt || 0,ticket:retry ? t.ticket : null};
  }
  retry(ticket) {
    if (!ticket || this.view()?.ticket !== ticket) return false;
    const target = this.target, rec = ticket.request, cancel = rec.cancel;
    if (!cancel()) return false;
    target.manual++; rec.manualTarget = target;
    rec.manualUsed = true; this.mark(rec,'cancelling');
    this.plugin.refreshWaitControls?.();
    return true;
  }
  wake() { for (const done of [...this.gates]) done(); }
  waitForChange(delay) {
    return new Promise(resolve => {
      let timer;
      const done = () => { this.cancel(timer); this.gates.delete(done); resolve(); };
      this.gates.add(done);
      if (delay > 0) { timer = this.schedule(done,Math.min(delay,60000)); timer?.unref?.(); }
    });
  }
  dispose() {
    this.end(this.target,false);
    this.wake();
    for (const rec of this.requests.values()) rec.cancel = null;
    this.requests.clear();
  }
}

module.exports = { ReadingWait, MANUAL_RETRY, supportedEngine, SHOW_MS, RETRY_MS };
