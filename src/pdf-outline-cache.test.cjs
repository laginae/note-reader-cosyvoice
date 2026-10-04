const test = require('node:test');
const assert = require('node:assert/strict');
const { PdfOutlineCache } = require('./pdf-outline-cache');
const file = path => ({ path, stat: { mtime: 1, size: 100 } });
const value = () => ({ model: { pages: [] }, entries: [{ title: '1. Introduction', level: 1, enabled: false }] });
test('outline cache reuses models and edited headings but isolates checkbox edits', () => {
  const cache = new PdfOutlineCache(), f = file('a.pdf'), v = value();
  cache.set(f, v); const cached = cache.get(f);
  assert.equal(cached.model, v.model); assert.equal(cached.entries[0].enabled, false);
  cached.entries[0].title = 'Changed'; assert.equal(cache.get(f).entries[0].title, '1. Introduction');
  cache.set(f, cached); assert.equal(cache.get(f).entries[0].title, 'Changed');
});
test('outline cache invalidates modified/replaced files and bounds memory with LRU eviction', () => {
  const cache = new PdfOutlineCache(2), a = file('a.pdf'), b = file('b.pdf'), c = file('c.pdf');
  cache.set(a, value()); a.stat.mtime++; assert.equal(cache.get(a), null);
  cache.set(a, value()); assert.equal(cache.get(file('a.pdf')), null);
  cache.set(a, value()); cache.set(b, value()); cache.get(a); cache.set(c, value()); assert.equal(cache.get(b), null);
  assert.ok(cache.get(a)); cache.clear(); assert.equal(cache.bytes, 0); assert.equal(cache.get(a), null);
  const tiny = new PdfOutlineCache(2, 1); tiny.set(a, value()); assert.equal(tiny.entries.size, 0);
});
