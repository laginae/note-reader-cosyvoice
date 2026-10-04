const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { normalizeAppearance, applyAppearance, clearAppearance } = require('./reader-appearance');
test('appearance rejects injected colors and clamps opacity and entry mode', () => {
  const settings = normalizeAppearance({ highlightColor: 'red;display:none', highlightStrength: 999, readerOpenMode: 'invalid' });
  assert.equal(settings.highlightColor, '#e5b83d'); assert.equal(settings.highlightStrength, 60); assert.equal(settings.readerOpenMode, 'sidebar');
});
test('appearance applies to leaf documents and is removed on unload', () => {
  const document = new JSDOM('<main/>').window.document;
  const plugin = { settings: { highlightColor: '#123456', highlightStrength: 30 }, app: { workspace: { iterateAllLeaves: fn => fn({ view: { containerEl: document.body } }) } } };
  applyAppearance(plugin); assert.equal(document.documentElement.style.getPropertyValue('--note-reader-highlight-strength'), '30%');
  clearAppearance(plugin); assert.equal(document.documentElement.style.getPropertyValue('--note-reader-highlight-color'), '');
});
