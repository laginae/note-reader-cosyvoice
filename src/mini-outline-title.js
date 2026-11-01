'use strict';

// Display-only cleanup of parser-provided headings. Never replace navigation or speech source data.
function miniOutlineTitle(value, kind) {
  const source = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (kind !== 'markdown') return source;
  const protectedParts = [];
  let prefix = '\0cozy';
  while (source.includes(prefix)) prefix += '_';
  const keep = text => `${prefix}${protectedParts.push(text) - 1}\0`;
  let text = source.replace(/(`+)([^\n]*?)\1(?!`)|\$\$([^\n]+?)\$\$|\$(?![\s$])([^\n$]*?\S)\$(?!\$)|\\\(([^\n]*?)\\\)|\\\[([^\n]*?)\\\]|\\[\\`*_{}\[\]#$~!|]/g,
    (match, _ticks, code, block, inline, round, square, offset) => {
      if (inline !== undefined && source[offset - 1] === '$') return match;
      if (code !== undefined) return keep(code);
      const math = block ?? inline ?? round ?? square;
      if (math !== undefined) return keep(math.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\{\\(?:mathrm|mathbf|mathit|mathsf|mathtt)\s+([^{}]*)\}/g, '{$1}').trim());
      return keep(match.slice(1));
    });
  text = text.replace(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g, '')
    .replace(/!?\[\[([^\]\n]+)\]\]/g, (_match, target) => target.split('|').at(-1))
    .replace(/!?\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
    .replace(/<\/?(?:span|em|strong|b|i|s|del|mark|small|sub|sup|code)(?:\s[^>]*|\s*)>/gi, '');
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/\*\*(?=\S)(.+?)\*\*|__(?=\S)(.+?)__|~~(?=\S)(.+?)~~|==(?=\S)(.+?)==/g,
      (_match, bold, strong, strike, highlight) => bold ?? strong ?? strike ?? highlight)
      .replace(/(^|[^*])\*(?![\s*])([^*]*?\S)\*(?!\*)/g, '$1$2')
      .replace(/(^|[^\p{L}\p{N}_])_(?!\s)([^_]*?\S)_(?![\p{L}\p{N}_])/gu, '$1$2');
  }
  return text.replace(new RegExp(`${prefix}(\\d+)\0`, 'g'), (_match, index) => protectedParts[Number(index)])
    .replace(/\s+/g, ' ').trim();
}

module.exports = { miniOutlineTitle };
