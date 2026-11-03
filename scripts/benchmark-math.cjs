'use strict';
// Synthetic inputs only; measures text preparation, not synthesis or Obsidian startup.
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { mathSpeech, academicLatex } = require(path.resolve(process.argv[2] || 'src/academic-speech.js'));
const forms = [String.raw`(x-y)/\bar z`, String.raw`\frac{x+y}{\overline{z}}`, 'x/(y-z)',
  String.raw`\frac{x_i-y_j}{\hat z}`, 'x_i', String.raw`\widehat x`, String.raw`\max`,
  String.raw`\sin x`, String.raw`\frac{x+y}{z-w}`, String.raw`\sum_{i=1}^n x_i`];
const mixed = Array.from({ length: 500 }, (_, i) => `Example ${i}: the expression $${forms[i % forms.length]}$ is used.\n`).join('');
const prose = 'This public sample contains ordinary prose without formulas.\n'.repeat(1000);
let checksum = 0;
function sample(run) {
  for (let i = 0; i < 3; i++) run();
  const times = [];
  for (let i = 0; i < 9; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { medianMs: +times[4].toFixed(3), minMs: +times[0].toFixed(3), maxMs: +times[8].toFixed(3) };
}
const formulas = sample(() => {
  for (let i = 0; i < 1000; i++) checksum += mathSpeech(forms[i % forms.length], {
    mathReadingLanguage: i % 2 ? 'chinese' : 'english',
  }).length;
});
const mixedDocument = sample(() => { checksum += academicLatex(mixed).length; });
const plainDocument = sample(() => { checksum += academicLatex(prose).length; });
console.log(JSON.stringify({ scope: 'Offline synthetic text preparation; nine warm samples; no account or note access.',
  formulas: { count: 1000, ...formulas }, mixedDocument: { characters: mixed.length, formulas: 500, ...mixedDocument },
  plainDocument: { characters: prose.length, ...plainDocument }, checksum }, null, 2));
