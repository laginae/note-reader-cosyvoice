'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { resetPageSettings } = require('./settings-reset');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const { sanitizeAcademicTextForSpeech } = require('../core');
const { extractHtmlText, extractHtmlTreeText } = require('./html-text');
const { JSDOM } = require('jsdom');
const markdown = '| Item | Count |\n| --- | --- |\n| Apples | 2 |\n| Pears | 3 |';
test('both setting languages save the default-on table header switch independently', async t => {
  for (const language of ['english', 'chinese']) {
    const f = settingsFixture(language); t.after(() => f.dom.window.close());
    const row = f.rows.find(row => row.nameEl.textContent === (language === 'chinese' ? '每行重复表头' : 'Repeat table headers for each row'));
    assert.ok(row); assert.equal(f.plugin.settings.academicTableRepeatHeaders, true);
    const before = { ...f.plugin.settings }; delete before.academicTableRepeatHeaders;
    await row.change(false); assert.equal(f.plugin.settings.academicTableRepeatHeaders, false);
    const after = { ...f.plugin.settings }; delete after.academicTableRepeatHeaders;
    assert.deepEqual(after, before);
    assert.equal(resetPageSettings(f.plugin.settings, { academicTableRepeatHeaders: true }, 'academic').academicTableRepeatHeaders, true);
    assert.equal(resetPageSettings(f.plugin.settings, { academicTableRepeatHeaders: true }, 'playback').academicTableRepeatHeaders, false);
  }
});
test('both table styles retain verified Markdown source ranges', () => {
  for (const academicTableRepeatHeaders of [true, false]) {
    const clean = text => sanitizeAcademicTextForSpeech(text, { academicTableRepeatHeaders });
    const speech = clean(markdown), source = buildMarkdownSource(markdown, [speech], clean);
    assert.equal(source.mappingValid, true);
    const range = currentSourceRanges(source, { index: 0 })[0];
    assert.equal(markdown.slice(range.from, range.to), markdown);
    assert.equal(/Count: 2/.test(speech), academicTableRepeatHeaders);
    assert.equal((speech.match(/Table columns:/g) || []).length, 1);
  }
});
test('simple HTML tables share the switch while merged tables and selections retain source text', t => {
  const html = '<table><caption>Public fruit</caption><tr><th>Item</th><th>Count</th></tr><tr><td>Apples</td><td>2</td></tr></table>';
  assert.match(extractHtmlText(html, { academicTableMode: 'all', academicTableRepeatHeaders: true }), /Item: Apples; Count: 2/);
  assert.match(extractHtmlText(html, { academicTableMode: 'all', academicTableRepeatHeaders: false }), /Row 1\. Apples; 2/);
  assert.doesNotMatch(extractHtmlText(html.replace('<td>Apples', '<td colspan="2">Apples'), { academicTableMode: 'all', academicTableRepeatHeaders: true }), /Row 1/);
  const dom = new JSDOM(html); t.after(() => dom.window.close()); const range = dom.window.document.createRange();
  range.selectNodeContents(dom.window.document.querySelector('td'));
  const result = extractHtmlTreeText(dom.window.document.body, range, { academicTableMode: 'all', academicTableRepeatHeaders: true });
  assert.equal(result.selection.selectedText, 'Apples'); assert.doesNotMatch(result.selection.selectedText, /Item|Count/);
});
