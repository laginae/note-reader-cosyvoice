'use strict';

// Memory only: no document text or edited headings are saved to plugin settings.
class PdfOutlineCache {
  constructor(maxEntries = 3, maxBytes = 32 * 1024 * 1024) {
    this.entries = new Map(); this.maxEntries = maxEntries; this.maxBytes = maxBytes; this.bytes = 0;
  }
  delete(path) {
    const old = this.entries.get(path);
    if (old) this.bytes -= old.weight;
    this.entries.delete(path);
  }
  get(file) {
    const entry = this.entries.get(file.path);
    if (!entry) return null;
    if (entry.file !== file || entry.mtime !== file.stat.mtime || entry.size !== file.stat.size) {
      this.delete(file.path); return null;
    }
    this.entries.delete(file.path); this.entries.set(file.path, entry);
    return { ...entry.value, entries: entry.value.entries.map(item => ({ ...item })) };
  }
  set(file, value) {
    this.delete(file.path);
    const weight = JSON.stringify(value).length * 2;
    if (weight > this.maxBytes) return;
    while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + weight > this.maxBytes)) {
      this.delete(this.entries.keys().next().value);
    }
    this.entries.set(file.path, { file, mtime: file.stat.mtime, size: file.stat.size, weight,
      value: { ...value, entries: value.entries.map(item => ({ ...item })) } });
    this.bytes += weight;
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}
module.exports = { PdfOutlineCache };
