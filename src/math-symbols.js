'use strict';

const greekNames = {
  'α':'alpha', 'β':'beta', 'γ':'gamma', 'δ':'delta', 'ε':'epsilon', 'ζ':'zeta',
  'η':'eta', 'θ':'theta', 'ι':'iota', 'κ':'kappa', 'λ':'lambda', 'μ':'mu',
  'ν':'nu', 'ξ':'xi', 'ο':'omicron', 'π':'pi', 'ρ':'rho', 'ς':'sigma',
  'σ':'sigma', 'τ':'tau', 'υ':'upsilon', 'φ':'phi', 'χ':'chi', 'ψ':'psi', 'ω':'omega',
};
for (const [glyph, name] of Object.entries(greekNames)) {
  greekNames[glyph.toUpperCase()] = name[0].toUpperCase() + name.slice(1);
}
const greekCommands = { ...Object.fromEntries(Object.values(greekNames).map(name => [name, name])),
  varepsilon:'epsilon', vartheta:'theta', varkappa:'kappa', varpi:'pi', varrho:'rho', varsigma:'sigma', varphi:'phi' };

function replaceGreekSymbols(text, render) {
  // Fold styled mathematical glyphs, but leave Greek words and accented prose
  // intact. Adjacent Latin variables (such as a Greek factor) remain separate.
  return String(text).replace(/[\p{Script=Greek}\p{M}\u{1d400}-\u{1d7ff}]+/gu, run => {
    const value = run.normalize('NFKC');
    return value.replace(/[\p{Script=Greek}\p{M}]+/gu, glyph => greekNames[glyph] ? render(greekNames[glyph]) : glyph);
  });
}

const greekMathCommands = text => replaceGreekSymbols(text, name => `\\${name} `)
  .replace(/\\([A-Za-z]+)/g, (command, name) => greekCommands[name] ? `\\${greekCommands[name]} ` : command);
const speakGreekSymbols = text => replaceGreekSymbols(text, name => ` ${name} `);
const speakGreekCommands = text => String(text).replace(/\\([A-Za-z]+)/g,
  (command, name) => greekCommands[name] ? ` ${greekCommands[name]} ` : command);

module.exports = { greekMathCommands, speakGreekSymbols, speakGreekCommands, greekNames };
