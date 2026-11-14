'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { mathSpeech, academicLatex, academicOptions, ACADEMIC_DEFAULTS } = require('./academic-speech');
const { resetPageSettings } = require('./settings-reset');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { buildMarkdownSource, currentSourceRanges } = require('./markdown-source');
const { extractHtmlText } = require('./html-text');
const { highlightDocument } = require('./dom-highlights');
const { JSDOM } = require('jsdom');
const compact = { academicFunctionStyle: 'compact' };

test('simple function speech defaults to of and accepts only the compact opt-in', () => {
  assert.equal(ACADEMIC_DEFAULTS.academicFunctionStyle, 'of');
  for (const value of [undefined, '', null, 'invalid', true]) {
    assert.equal(academicOptions({ academicFunctionStyle: value }).academicFunctionStyle, 'of');
    assert.equal(mathSpeech('f(x)', { academicFunctionStyle: value }), 'f of x');
  }
  assert.equal(academicOptions(compact).academicFunctionStyle, 'compact');
});

test('compact functions omit only the argument connector across short supported forms', () => {
  for (const [input, expected] of [
    ['f(x)', 'f x'], ['f_i(x_j)', 'f i x j'], ['f[2]', 'f 2'], ['AB(x)', 'AB x'],
    [String.raw`\underline f(x)`, 'f underbar x'], [String.raw`\overline g(x)`, 'g bar x'],
    [String.raw`\hat f(\alpha)`, 'f hat alpha'], ["f'(x)", 'f prime x'],
    ['(f(x),g(x))', 'f x, g x'], ['f(x)/g(x)', 'f x divided by g x'],
    [String.raw`\sin(x)`, 'sine x'], [String.raw`\ln x`, 'natural log x'],
  ]) assert.equal(mathSpeech(input, compact), expected, input);
  assert.equal(mathSpeech(String.raw`\overline f(x)=\underline g(x)`, { ...compact, mathReadingLanguage: 'chinese' }),
    'f bar x 等于 g underbar x');
  assert.equal(mathSpeech(String.raw`\sin(x)`, { ...compact, mathReadingLanguage: 'chinese' }), 'x 的正弦');
});

test('explicit style, compound arguments and smart skipping stay independent of compact connectors', () => {
  for (const input of ['f(x)', 'f_i(x_j)', String.raw`\overline f(x)`, String.raw`\sin(x)`, '(f(x),g(x))']) {
    for (const mathReadingLanguage of ['english', 'chinese']) {
      const options = { academicMathStyle: 'verbose', mathReadingLanguage };
      assert.equal(mathSpeech(input, { ...options, ...compact }), mathSpeech(input, options), input);
    }
  }
  for (const input of ['f(x+y)', 'f(x/y)', 'f(x^2)']) assert.match(mathSpeech(input, compact), /parenthesis/);
  for (const input of ['f_i(x)/g_i(x)', String.raw`\sum_i f(x)`, String.raw`\hat(x)`]) {
    assert.equal(mathSpeech(input, compact), 'Formula.', input);
    assert.equal(mathSpeech(input, { ...compact, academicSkipNotice: false }), '', input);
  }
  assert.equal(mathSpeech('f(x)', { ...compact, academicMathMode: 'skip' }), 'Formula.');
  assert.equal(mathSpeech('f(x)', { ...compact, mathReadingLanguage: 'skip' }), 'Formula.');
  assert.equal(mathSpeech('f(x,y)', compact), 'f with arguments x, y');
});

test('prose and semantic of phrases are not globally replaced', () => {
  const prose = 'Part of this example explains the value of a function.';
  assert.equal(academicLatex(prose, compact), prose);
  assert.equal(mathSpeech(String.raw`\operatorname{Var}(x)`, compact), 'variance of x');
  assert.equal(mathSpeech('x^4', compact), 'x to the power of 4');
  assert.equal(mathSpeech('(a+b)c', compact), 'the sum of a and b, times c');
});

test('the English and Chinese academic settings save and reset the choice without touching other preferences', async t => {
  for (const language of ['english', 'chinese']) {
    const f = settingsFixture(language); t.after(() => f.dom.window.close());
    const row = f.rows.find(row => row.nameEl.textContent === (language === 'chinese' ? '简单函数读法' : 'Simple function speech'));
    assert.ok(row);
    assert.equal(row.settingEl.closest('[data-settings-page]').dataset.settingsPage, 'academic');
    assert.equal(row.controlEl.querySelector('select').value, 'of');
    const other = { ...f.plugin.settings }; delete other.academicFunctionStyle;
    await row.change('compact');
    assert.equal(f.plugin.settings.academicFunctionStyle, 'compact'); assert.equal(f.plugin.saves, 1);
    const after = { ...f.plugin.settings }; delete after.academicFunctionStyle;
    assert.deepEqual(after, other);
    assert.equal(resetPageSettings(f.plugin.settings, { academicFunctionStyle: 'of' }, 'academic').academicFunctionStyle, 'of');
    assert.equal(resetPageSettings(f.plugin.settings, { academicFunctionStyle: 'of' }, 'playback').academicFunctionStyle, 'compact');
    await row.change('of'); assert.equal(f.plugin.settings.academicFunctionStyle, 'of');
  }
});

test('compact speech preserves Markdown and HTML source text and highlight coordinates', t => {
  const raw = String.raw`The value of $\hat f(x_i)$ matches $g(x)$.`, options = academicOptions(compact);
  const transform = text => academicLatex(text, options), speech = transform(raw);
  assert.match(speech, /value of/); assert.match(speech, /f hat x i/); assert.match(speech, /g x/);
  assert.doesNotMatch(speech, /f hat of|g of/);
  const source = buildMarkdownSource(raw, [speech], transform);
  assert.equal(source.mappingValid, true);
  const range = currentSourceRanges(source, { index: 0 })[0]; assert.equal(raw.slice(range.from, range.to), raw);
  const dom = new JSDOM('<p>' + raw + '</p>'); t.after(() => dom.window.close());
  const doc = dom.window.document, before = doc.body.innerHTML;
  assert.equal(transform(extractHtmlText(before)), speech);
  dom.window.CSS = { highlights: new Map() };
  dom.window.Highlight = class extends Set { constructor(...ranges) { super(ranges); } };
  assert.equal(highlightDocument(doc, { text: speech, academic: options, speechTransform: transform }), true);
  assert.equal(doc.body.innerHTML, before);
});
