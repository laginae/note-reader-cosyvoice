const test = require('node:test');
const assert = require('node:assert/strict');
const { greekNames, speakGreekSymbols, speakGreekCommands } = require('./math-symbols');
const { mathSpeech, academicLatex } = require('./academic-speech');
const { normalizePdfSpeechText } = require('./pdf-selection');
const { extractPdfTextLayout } = require('./pdf-layout');
const { pdfSourceLines } = require('./pdf-highlights');

const compact = text => text.replace(/\s+/g, ' ').trim();

test('single Greek mathematical glyphs and commands have explicit speech names', () => {
  for (const [glyph, name] of Object.entries(greekNames)) {
    for (const mathReadingLanguage of ['english', 'chinese']) {
      assert.equal(mathSpeech(glyph, { mathReadingLanguage }), name);
      assert.equal(mathSpeech(`x_${glyph}`, { mathReadingLanguage }), `x ${name}`);
      assert.equal(mathSpeech(`x_\\${name}`, { mathReadingLanguage }), `x ${name}`);
    }
    assert.equal(compact(normalizePdfSpeechText(glyph)), name);
    assert.equal(compact(speakGreekCommands(`Read \\${name}.`)), `Read ${name} .`);
  }
  assert.equal(mathSpeech('𝜏'), 'tau');
  assert.equal(mathSpeech('τ^2'), 'tau squared');
  assert.equal(mathSpeech('τ', { academicMathMode:'skip' }), 'Formula.');
  assert.equal(mathSpeech('τ', { academicMathMode:'skip', academicSkipNotice:false }), '');
});

test('Greek variants normalize without guessing Greek prose or unknown commands', () => {
  for (const [glyph, name] of [['ϵ','epsilon'], ['ϑ','theta'], ['ϰ','kappa'], ['ϖ','pi'], ['ϱ','rho'], ['ϕ','phi']]) {
    assert.equal(mathSpeech(glyph), name);
    assert.equal(mathSpeech(`\\var${name}`), name);
  }
  assert.equal(speakGreekSymbols('Καλημέρα κόσμε; ταυ; τρία.'), 'Καλημέρα κόσμε; ταυ; τρία.');
  assert.equal(speakGreekCommands('Keep \\tauSuffix and \\unknown unchanged.'), 'Keep \\tauSuffix and \\unknown unchanged.');
  assert.equal(compact(normalizePdfSpeechText('For 𝜏, use 𝑘𝜏; then ΔH and σ.')), 'For tau , use k tau ; then Delta H and sigma .');
  assert.equal(compact(academicLatex('Use $\\tau$ and $\\varphi$ here.')), 'Use tau and phi here.');
});

test('PDF highlight source uses the same Greek expansion as spoken text', () => {
  const strings = ['Use 𝜏 for this example.', 'Then compare ΔH and 𝜎.'];
  const items = strings.map((str, i) => ({ str, width:300, height:12, transform:[12,0,0,12,40,700-i*20] }));
  const viewport = {width:600,height:800};
  const layout = extractPdfTextLayout(items,{viewport});
  const speech = normalizePdfSpeechText(layout.text).replace(/\s/g,'');
  const mapped = pdfSourceLines({items,viewport}, text => text);
  assert.equal(mapped.text, speech);
  assert.equal(mapped.lines.length, 2);
});
