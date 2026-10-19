'use strict';

const blank = text => text.replace(/[^\r\n]/g, ' ');

// Keep offsets and newlines intact so selections and source highlights still
// refer to the original note. Inline code is literal, not hidden metadata.
function maskMarkdownNonSpeech(text) {
  text = String(text || '');
  let out = '', i = 0;
  while (i < text.length) {
    if (i === 0 || text[i - 1] === '\n') {
      const fence = text.slice(i).match(/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (fence) {
        const close = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}[ \\t]*\\r?$', 'gm');
        close.lastIndex = i + fence[0].length;
        const end = close.exec(text);
        const next = end ? end.index + end[0].length : text.length;
        out += blank(text.slice(i, next)); i = next; continue;
      }
    }
    if (text[i] === '\\' && i + 1 < text.length) {
      out += text.slice(i, i + 2); i += 2; continue;
    }
    if (text[i] === '`') {
      const marker = text.slice(i).match(/^`+/)[0];
      const close = new RegExp('(?<!`)' + marker + '(?!`)', 'g'); close.lastIndex = i + marker.length;
      const end = close.exec(text);
      if (end) { const next = end.index + marker.length; out += text.slice(i, next); i = next; continue; }
    }
    const closing = text.startsWith('<!--', i) ? '-->' : text.startsWith('%%', i) ? '%%' : null;
    if (closing) {
      const end = text.indexOf(closing, i + (closing === '-->' ? 4 : 2));
      const next = end < 0 ? text.length : end + closing.length;
      out += blank(text.slice(i, next)); i = next; continue;
    }
    out += text[i++];
  }
  return out;
}

function cleanMarkdownPresentation(text) {
  // Shield math and inline code from presentation-marker removal.
  return maskMarkdownNonSpeech(text).replace(/(`+)[\s\S]*?\1|\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|==(?=\S)([^\n]*?\S)==/g,
    (match, code, highlighted) => highlighted === undefined ? match : highlighted)
    .replace(/^(\s*[-+*]\s+)\[[ xX]\]\s+/gm, '$1')
    .replace(/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|={3,})$/gm, '');
}

module.exports = { maskMarkdownNonSpeech, cleanMarkdownPresentation };
