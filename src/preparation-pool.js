'use strict';

// Numeric, bounded, device-local diagnostics. Never retain request keys or text.
class PlaybackTimings {
  constructor(now = () => globalThis.performance?.now?.() ?? Date.now()) {
    this.now = now;
    this.samples = {};
    this.counts = {};
  }
  count(name) { this.counts[name] = (this.counts[name] || 0) + 1; }
  record(name, milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    const values = this.samples[name] ||= [];
    values.push(Math.round(milliseconds));
    if (values.length > 128) values.shift();
  }
  begin(kind) { this.intent = { kind, time: this.now() }; this.endedAt = null; }
  suspend() { this.intent = null; this.endedAt = null; }
  ended() { this.endedAt = this.now(); }
  playing(started) {
    const now = this.now();
    this.record('audioLoadToPlaying', now - started);
    if (this.intent) this.record(this.intent.kind, now - this.intent.time);
    else if (this.endedAt != null) this.record('partGap', now - this.endedAt);
    this.intent = null;
    this.endedAt = null;
  }
  snapshot() {
    const timings = {};
    for (const [name, values] of Object.entries(this.samples)) {
      const sorted = [...values].sort((a, b) => a - b);
      timings[name] = { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1],
        p95: sorted[Math.ceil(sorted.length * .95) - 1] };
    }
    return { schema: 1, units: 'milliseconds', window: 128, counts: { ...this.counts }, timings };
  }
}

function cancelled() {
  const error = new Error('Audio preparation superseded.');
  error.name = 'AbortError';
  return error;
}

// At most two synthesis operations, one speculative operation; newest target wins
// among queued requests. Already-sent operations keep their slot until settled.
class PreparationPool {
  constructor({ concurrency = 2, maxEntries = 64, maxBytes = 16 * 1024 * 1024,
    sizeOf = value => value?.arrayBuffer?.byteLength || 0, timings = new PlaybackTimings() } = {}) {
    this.limit = Math.max(1, Math.min(2, concurrency));
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.sizeOf = sizeOf;
    this.timings = timings;
    this.entries = new Map();
    this.active = new Set();
    this.bytes = 0;
    this.paused = false;
    this.backgroundFailures = new Map();
    this.cooldownUntil = 0;
  }
  state(key) { return this.entries.get(key)?.state; }
  throttle(milliseconds = 5000) {
    this.limit = 1;
    const delay = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 5000;
    this.cooldownUntil = Math.max(this.cooldownUntil, this.timings.now() + delay);
    this.timings.count('rateLimited');
    this.drain();
  }
  retainBackground(keys) {
    const keep = new Set(keys);
    for (const entry of this.entries.values()) {
      if (entry.background && entry.state === 'queued' && !keep.has(entry.key)) this.drop(entry);
    }
  }
  select(key) {
    for (const entry of this.entries.values()) {
      if (entry.state === 'queued' && entry.key !== key) this.drop(entry);
    }
  }
  pause(value) {
    this.paused = value;
    if (value) {
      for (const entry of this.entries.values()) {
        if (entry.state === 'queued' && entry.background) this.drop(entry);
      }
    } else this.drain();
  }
  drop(entry) {
    if (this.entries.get(entry.key) !== entry) return;
    this.entries.delete(entry.key);
    if (entry.state === 'ready') this.bytes -= entry.bytes;
    if (entry.state === 'queued') {
      entry.reject(cancelled());
      this.timings.count('discardedQueued');
    }
  }
  clear() {
    clearTimeout(this.cooldownTimer); this.cooldownTimer = null;
    this.cooldownUntil = 0; this.backgroundFailures.clear();
    for (const entry of this.entries.values()) this.drop(entry);
    this.bytes = 0;
    // Active operations are deliberately not removed from active.
  }
  get(key, factory, { background = false, valid = () => true } = {}) {
    if (background && this.backgroundFailures.has(key)) return this.backgroundFailures.get(key);
    if (!background) this.backgroundFailures.delete(key);
    const old = this.entries.get(key);
    if (old) {
      this.timings.count(old.state === 'ready' ? 'cacheHit' : 'inflightHit');
      this.entries.delete(key); this.entries.set(key, old);
      if (!background) { old.background = false; old.valid = valid; }
      this.drain();
      return old.promise;
    }
    let resolve, reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    promise.catch(() => {});
    const entry = { key, factory, background, valid, promise, resolve, reject,
      state: 'queued', queuedAt: this.timings.now(), bytes: 0 };
    this.entries.set(key, entry);
    this.drain();
    return promise;
  }
  drain() {
    if (this.paused) return;
    const wait = this.cooldownUntil - this.timings.now();
    if (wait > 0) {
      if (!this.cooldownTimer) {
        this.cooldownTimer = setTimeout(() => { this.cooldownTimer = null; this.drain(); }, Math.min(wait, 60000));
        this.cooldownTimer.unref?.();
      }
      return;
    }
    while (this.active.size < this.limit) {
      const queued = [...this.entries.values()].filter(entry => entry.state === 'queued');
      const entry = queued.find(entry => !entry.background)
        || queued.find(entry => ![...this.active].some(active => active.background));
      if (!entry) return;
      if (!entry.valid()) { this.drop(entry); continue; }
      entry.state = 'running';
      this.active.add(entry);
      const started = this.timings.now();
      this.timings.record('queueWait', started - entry.queuedAt);
      this.timings.count('requests');
      Promise.resolve().then(() => {
        if (!entry.valid()) throw cancelled();
        return entry.factory();
      }).then(value => {
        this.timings.record('prepare', this.timings.now() - started);
        entry.state = 'ready';
        entry.bytes = Math.max(0, Number(this.sizeOf(value)) || 0);
        if (this.entries.get(entry.key) === entry) {
          this.bytes += entry.bytes;
          this.trim();
        }
        entry.resolve(value);
      }, error => {
        if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
        if (entry.background && error?.name !== 'AbortError' && entry.valid()) {
          this.backgroundFailures.set(entry.key, entry.promise);
          while (this.backgroundFailures.size > 128) this.backgroundFailures.delete(this.backgroundFailures.keys().next().value);
        }
        this.timings.count(error?.name === 'AbortError' ? 'cancelled' : 'failed');
        entry.reject(error);
      }).finally(() => { this.active.delete(entry); this.drain(); });
    }
  }
  trim() {
    let ready = [...this.entries.values()].filter(entry => entry.state === 'ready');
    while (ready.length > this.maxEntries || this.bytes > this.maxBytes) {
      const entry = ready.shift();
      if (!entry) break;
      this.drop(entry);
      this.timings.count('evicted');
    }
  }
}

module.exports = { PlaybackTimings, PreparationPool };
