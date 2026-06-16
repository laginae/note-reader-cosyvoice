const path = require('path');

const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
const LATEX_FORMULA_MAX_CHARS = 12;
const LATEX_COMMAND_REPLACEMENTS = [
  ['\\rightarrow', '到'],
  ['\\leftarrow', '到'],
  ['\\approx', '约等于'],
  ['\\times', '乘以'],
  ['\\cdot', '点乘'],
  ['\\leq', '小于等于'],
  ['\\geq', '大于等于'],
  ['\\neq', '不等于'],
  ['\\ne', '不等于'],
  ['\\le', '小于等于'],
  ['\\ge', '大于等于'],
  ['\\pm', '正负'],
  ['\\mp', '负正'],
  ['\\infty', '无穷'],
  ['\\alpha', 'alpha'],
  ['\\beta', 'beta'],
  ['\\gamma', 'gamma'],
  ['\\delta', 'delta'],
  ['\\epsilon', 'epsilon'],
  ['\\theta', 'theta'],
  ['\\lambda', 'lambda'],
  ['\\mu', 'mu'],
  ['\\pi', 'pi'],
  ['\\sigma', 'sigma'],
  ['\\omega', 'omega'],
  ['\\sum', '求和'],
  ['\\int', '积分'],
  ['\\to', '到'],
  ['\\left', ''],
  ['\\right', ''],
];

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function sanitizeTextForSpeech(text) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text));

  value = value.replace(/^---\n[\s\S]*?\n---\n?/, '');
  value = value.replace(/```[\s\S]*?```/g, ' ');
  value = value.replace(/!\[\[[^\]]+\]\]/g, ' ');
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/<[^>]+>/g, ' ');
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/^\s*[-+*]\s+/gm, '');
  value = value.replace(/[*_~]/g, '');
  value = value.replace(/[ \t]+/g, ' ');
  value = value.replace(/\s+([，。、；：！？,.])/g, '$1');
  value = value.replace(/([，。、；：！？])\s+/g, '$1');

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function sanitizeLatexForSpeech(text) {
  let value = normalizeLineBreaks(text);

  value = value.replace(/\$\$([\s\S]*?)\$\$/g, replaceLatexFormula);
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, replaceLatexFormula);
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, replaceLatexFormula);
  value = value.replace(/\$([^$\n]+?)\$/g, replaceLatexFormula);

  return verbalizeLatexCommands(value);
}

function replaceLatexFormula(match, content) {
  if (isLongLatexFormula(content)) {
    return ' ';
  }

  return ` ${verbalizeShortLatex(content)} `;
}

function isLongLatexFormula(content) {
  return stripLatexDelimiters(content).replace(/\s+/g, '').length > LATEX_FORMULA_MAX_CHARS;
}

function stripLatexDelimiters(content) {
  let value = String(content || '').trim();

  value = value.replace(/^\$\$([\s\S]*?)\$\$$/, '$1');
  value = value.replace(/^\\\[([\s\S]*?)\\\]$/, '$1');
  value = value.replace(/^\\\(([\s\S]*?)\\\)$/, '$1');
  value = value.replace(/^\$([^$]*)\$$/, '$1');

  return value.trim();
}

function verbalizeShortLatex(content) {
  let value = stripLatexDelimiters(content);

  value = verbalizeLatexCommands(value);
  value = value.replace(/_/g, ' 下标 ');
  value = value.replace(/\^/g, ' 上标 ');
  value = value.replace(/\+/g, ' 加 ');
  value = value.replace(/=/g, ' 等于 ');
  value = value.replace(/[{}()[\]]/g, ' ');
  value = value.replace(/\\/g, ' ');

  return cleanupLatexSpeech(value);
}

function verbalizeLatexCommands(text) {
  let value = replaceLatexCommands(String(text || ''));
  value = replaceLatexSymbolCommands(value);
  return cleanupLatexSpeechPreservingLines(value);
}

function replaceLatexCommands(text) {
  let value = String(text || '');
  let previous = '';

  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, '$1');
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 分之 $2');
  }

  return value;
}

function replaceLatexSymbolCommands(text) {
  let value = String(text || '');

  for (const [command, speech] of LATEX_COMMAND_REPLACEMENTS) {
    const replacement = speech ? ` ${speech} ` : ' ';
    value = value.replace(new RegExp(`${escapeRegExp(command)}\\b`, 'g'), replacement);
  }

  return value;
}

function cleanupLatexSpeech(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。、；：！？,.])/g, '$1')
    .replace(/([，。、；：！？])\s+/g, '$1')
    .trim();
}

function cleanupLatexSpeechPreservingLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => cleanupLatexSpeech(line))
    .join('\n');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseChunkLimits(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());

  const limits = list
    .map((item) => Math.floor(Number(item)))
    .filter((item) => Number.isFinite(item) && item > 0);

  return limits.length ? limits : DEFAULT_CHUNK_LIMITS.slice();
}

function splitTextForSpeechChunks(text, maxLengths = DEFAULT_CHUNK_LIMITS) {
  const limits = parseChunkLimits(maxLengths);
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > 0) {
    const limit = limits[Math.min(chunks.length, limits.length - 1)];

    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    const cut = chooseChunkCut(remaining, limit);
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(cut).trim();
  }

  return chunks;
}

function chooseChunkCut(text, limit) {
  const minUsefulCut = Math.floor(limit * 0.45);
  const search = text.slice(0, limit + 1);

  for (const pattern of [/[。！？!?]\s?/g, /[，,；;：:]\s?/g, /\s/g]) {
    let match;
    let best = -1;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(search)) !== null) {
      const end = match.index + match[0].length;
      if (end > 0 && end <= limit) {
        best = end;
      }
    }

    if (best >= minUsefulCut) {
      return best;
    }
  }

  return limit;
}

function resolveDefaultScriptPath() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');

  return path.join(localAppData, 'hermes', 'tts', 'cosyvoice3', 'cosyvoice3-hermes.ps1');
}

function normalizeSpeed(value) {
  const speed = Number(value);

  if (!Number.isFinite(speed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.5, speed));
}

module.exports = {
  DEFAULT_CHUNK_LIMITS,
  LATEX_FORMULA_MAX_CHARS,
  normalizeLineBreaks,
  sanitizeTextForSpeech,
  sanitizeLatexForSpeech,
  verbalizeShortLatex,
  parseChunkLimits,
  splitTextForSpeechChunks,
  resolveDefaultScriptPath,
  normalizeSpeed,
};
