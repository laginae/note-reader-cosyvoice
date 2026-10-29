'use strict';

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ITEM_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 128;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !/^(apiKey|key|token|authorization)$/i.test(key))
    .map(key => [key, canonical(value[key])]));
}
async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function audioCacheKey(text, settings, context = {}, sourceText = text) {
  // Only synthesis-affecting configuration; never persist this preimage.
  const fields = Object.keys(settings).filter(key => /^(speechEngine|systemVoice|edgeTts|azure|openRouter|mimo|byok|remote|speed$|speechTerms|mathReadingLanguage|academic|scriptPath|speaker|reference)/.test(key));
  return digest(['cozy-audio-v1', text, sourceText, canonical(Object.fromEntries(fields.map(key => [key, settings[key]]))),
    canonical(settings.openRouterContext === true ? context : {})]);
}
function expired(row, now) {
  return !Number.isFinite(row?.created) || row.created > now || row.created + TTL_MS <= now;
}
function evictionKeys(rows, now) {
  const valid = rows.filter(row => !expired(row, now) && Number.isFinite(row.size) && row.size > 0 && row.size <= MAX_ITEM_BYTES)
    .sort((a, b) => b.accessed - a.accessed);
  let bytes = 0;
  const keep = new Set();
  for (const row of valid) if (keep.size < MAX_ENTRIES && bytes + row.size <= MAX_BYTES) {
    keep.add(row.key); bytes += row.size;
  }
  return rows.filter(row => !keep.has(row.key)).map(row => row.key);
}
class IndexedAudioStore {
  constructor(namespace, indexedDB = globalThis.indexedDB) { this.namespace = namespace; this.indexedDB = indexedDB; }
  async open() {
    if (!this.pending) this.pending = digest(this.namespace).then(hash => new Promise((resolve, reject) => {
      if (!this.indexedDB) return reject(new Error('Device storage unavailable'));
      const request = this.indexedDB.open(`cozy-audio-${hash}`, 1);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; reject(new Error('Device storage unavailable')); }, 1500);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('meta', { keyPath: 'key' });
        request.result.createObjectStore('audio');
      };
      request.onsuccess = () => { clearTimeout(timer); const db = request.result;
        if (timedOut) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.pending = null; }; resolve(db); };
      request.onerror = request.onblocked = () => { clearTimeout(timer); reject(new Error('Device storage unavailable')); };
    }));
    return this.pending;
  }
  async transaction(action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta', 'audio'], 'readwrite');
      let value;
      const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Device cache operation timed out')); }, 1500);
      tx.oncomplete = () => { clearTimeout(timer); resolve(value); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(new Error('Device cache operation failed')); };
      action(tx.objectStore('meta'), tx.objectStore('audio'), result => { value = result; });
    });
  }
  async get(key, now) {
    return this.transaction((meta, audio, done) => {
      const request = meta.get(key);
      request.onsuccess = () => {
        if (!request.result || expired(request.result, now)) { meta.delete(key); audio.delete(key); return; }
        meta.put({ ...request.result, accessed: now });
        const bytes = audio.get(key); bytes.onsuccess = () => done(bytes.result);
      };
    });
  }
  async put(key, value, now) {
    return this.transaction((meta, audio) => {
      meta.put({ key, created: now, accessed: now, size: value.arrayBuffer.byteLength });
      audio.put(value, key);
      const request = meta.getAll();
      request.onsuccess = () => { for (const old of evictionKeys(request.result, now)) { meta.delete(old); audio.delete(old); } };
    });
  }
  async prune(now) {
    return this.transaction((meta, audio) => {
      const request = meta.getAll();
      request.onsuccess = () => { for (const key of evictionKeys(request.result, now)) { meta.delete(key); audio.delete(key); } };
    });
  }
  clear() { return this.transaction((meta, audio) => { meta.clear(); audio.clear(); }); }
  async close() { if (this.pending) { try { (await this.pending).close(); } catch {} this.pending = null; } }
}
class DeviceAudioCache {
  constructor(store, enabled = () => false, now = () => Date.now()) {
    this.store = store; this.enabled = enabled; this.now = now; this.generation = 0; this.tail = Promise.resolve();
  }
  token() { return this.generation; }
  serialize(action) {
    const work = this.tail.then(action);
    this.tail = work.catch(() => {});
    return work;
  }
  async get(key) {
    if (!key || !this.enabled()) return null;
    const generation = this.generation;
    try {
      const value = await this.serialize(() => this.store.get(key, this.now()));
      if (generation !== this.generation || !this.enabled() || !value?.arrayBuffer?.byteLength
        || value.arrayBuffer.byteLength > MAX_ITEM_BYTES) return null;
      return value;
    } catch { this.failed = true; return null; }
  }
  async put(key, value, generation) {
    if (!key || !this.enabled() || generation !== this.generation || !value?.arrayBuffer?.byteLength
      || value.arrayBuffer.byteLength > MAX_ITEM_BYTES) return;
    // Persist only audio and numeric alignment, even if a provider adds other fields.
    const safe = { arrayBuffer: value.arrayBuffer, mimeType: ['audio/mpeg','audio/wav','audio/ogg'].includes(value.mimeType) ? value.mimeType : 'audio/mpeg',
      sentenceCues: (Array.isArray(value.sentenceCues) ? value.sentenceCues : []).slice(0,4096)
        .filter(cue => ['start','end','time','until'].every(field => Number.isFinite(cue?.[field])))
        .map(({start,end,time,until}) => ({start,end,time,until})) };
    try { await this.serialize(() => {
      if (this.enabled() && generation === this.generation) return this.store.put(key, safe, this.now());
    }); } catch { this.failed = true; }
  }
  async prune() {
    if (!this.enabled()) return;
    try { await this.serialize(() => this.store.prune(this.now())); } catch { this.failed = true; }
  }
  clear() { this.generation++; return this.serialize(() => this.store.clear()); }
  close() { this.generation++; return this.serialize(() => this.store.close()); }
}
function deviceCacheFor(plugin) {
  if (!plugin.deviceAudioCache) {
    const vault = plugin.app.vault;
    const namespace = [plugin.manifest?.id || 'cozy', vault.adapter?.getBasePath?.() || vault.getName?.() || 'default'];
    plugin.deviceAudioCache = new DeviceAudioCache(new IndexedAudioStore(namespace), () => plugin.settings.persistentAudioCache === true);
  }
  return plugin.deviceAudioCache;
}
function addDeviceCacheSettings(parent, plugin, Setting, Notice) {
  const t = (en, zh) => plugin.settings.settingsLanguage === 'chinese' ? zh : en;
  new Setting(parent).setName(t('Reuse audio on this device', '在本机复用音频'))
    .setDesc(t('Off by default. Keep up to 64 MiB / 128 parts for 24 hours outside the vault. Audio can contain private content; it is not encrypted by this plugin. Expired items are removed on use and while enabled. No note text or keys are saved. System and local-model speech are excluded.',
      '默认关闭。在库外本机保留最多 64 MiB / 128 份音频，24 小时有效。音频可能含私人内容，插件不加密；使用时及开启期间自动清理过期项。不保存正文或密钥；不包含系统及本地模型语音。'))
    .addToggle(toggle => toggle.setValue(plugin.settings.persistentAudioCache === true).onChange(async enabled => {
      plugin.settings.persistentAudioCache = enabled;
      await plugin.saveSettings();
      if (enabled) await deviceCacheFor(plugin).prune();
      else try { await deviceCacheFor(plugin).clear(); } catch { new Notice(t('Could not clear device audio. Try Clear again.', '未能清除本机音频，请再次点击清除。')); }
    }));
  new Setting(parent).setName(t('Clear reusable device audio', '清除本机复用音频'))
    .addButton(button => button.setButtonText(t('Clear cache', '清除缓存')).onClick(async () => {
      try { await deviceCacheFor(plugin).clear(); new Notice(t('Device audio cleared. Current playback and exports are unchanged.', '本机复用音频已清除；当前播放及导出文件不受影响。')); }
      catch { new Notice(t('Device cache could not be cleared.', '无法清除本机缓存。')); }
    }));
}
function startDeviceCacheMaintenance(plugin) {
  if (plugin.settings.persistentAudioCache) void deviceCacheFor(plugin).prune();
  const timer = setInterval(() => { if (plugin.settings.persistentAudioCache) void deviceCacheFor(plugin).prune(); }, 10 * 60 * 1000);
  timer.unref?.();
  plugin.register(() => { clearInterval(timer); void plugin.deviceAudioCache?.close(); });
}
module.exports = { TTL_MS, MAX_BYTES, MAX_ITEM_BYTES, MAX_ENTRIES, canonical, audioCacheKey, evictionKeys,
  IndexedAudioStore, DeviceAudioCache, deviceCacheFor, addDeviceCacheSettings, startDeviceCacheMaintenance };
