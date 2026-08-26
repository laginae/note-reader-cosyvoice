const path = require('path');

const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
const DEFAULT_MATH_READING_LANGUAGE = 'english';
const LATEX_FORMULA_MAX_CHARS = 12;
const MATH_READING_LANGUAGES = ['english', 'chinese', 'skip'];
const LATEX_COMMAND_REPLACEMENTS = {
  chinese: [
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
  ],
  english: [
    ['\\rightarrow', 'to'],
    ['\\leftarrow', 'from'],
    ['\\approx', 'approximately equal to'],
    ['\\times', 'times'],
    ['\\cdot', 'dot'],
    ['\\leq', 'less than or equal to'],
    ['\\geq', 'greater than or equal to'],
    ['\\neq', 'not equal to'],
    ['\\ne', 'not equal to'],
    ['\\le', 'less than or equal to'],
    ['\\ge', 'greater than or equal to'],
    ['\\pm', 'plus or minus'],
    ['\\mp', 'minus or plus'],
    ['\\infty', 'infinity'],
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
    ['\\sum', 'sum'],
    ['\\int', 'integral'],
    ['\\to', 'to'],
    ['\\left', ''],
    ['\\right', ''],
  ],
};

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function splitMarkdownTableRow(line) {
  let value = String(line || '').trim();
  if (!value.includes('|')) {
    return [];
  }

  if (value.startsWith('|')) {
    value = value.slice(1);
  }
  if (hasUnescapedTrailingPipe(value)) {
    value = value.slice(0, -1);
  }

  const cells = [];
  let current = '';
  let inCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && value[index + 1] === '|') {
      current += '|';
      index += 1;
      continue;
    }
    if (character === '`') {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function hasUnescapedTrailingPipe(value) {
  if (!value.endsWith('|')) {
    return false;
  }

  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}

function isMarkdownTableDelimiterLine(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function formatMarkdownTableForSpeech(headers, rows) {
  const tableText = headers.concat(...rows).join(' ');
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(tableText);
  const output = [];
  const headerLabels = headers.map((header) => header.trim()).filter(Boolean);

  if (headerLabels.length) {
    output.push(`${useChineseLabels ? '表格列' : 'Table columns'}: ${headerLabels.join('; ')}${useChineseLabels ? '。' : '.'}`);
  }

  rows.forEach((cells, rowIndex) => {
    const values = [];
    const cellCount = Math.max(headers.length, cells.length);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const cell = String(cells[cellIndex] || '').trim();
      if (!cell) {
        continue;
      }
      const header = String(headers[cellIndex] || '').trim();
      values.push(header ? `${header}: ${cell}` : cell);
    }

    if (values.length) {
      const rowLabel = useChineseLabels ? `第 ${rowIndex + 1} 行` : `Row ${rowIndex + 1}`;
      output.push(`${rowLabel}. ${values.join('; ')}${useChineseLabels ? '。' : '.'}`);
    }
  });

  return output.join('\n');
}

function sanitizeMarkdownTablesForSpeech(text) {
  const lines = normalizeLineBreaks(text).split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (headerLine.includes('|') && isMarkdownTableDelimiterLine(delimiterLine)) {
      const headers = splitMarkdownTableRow(headerLine);
      const rows = [];
      let rowIndex = index + 2;

      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes('|')) {
        const cells = splitMarkdownTableRow(lines[rowIndex]);
        if (isMarkdownTableDelimiterLine(lines[rowIndex])) {
          break;
        }
        rows.push(cells);
        rowIndex += 1;
      }

      output.push(formatMarkdownTableForSpeech(headers, rows));
      index = rowIndex - 1;
      continue;
    }

    if (!isMarkdownTableDelimiterLine(headerLine)) {
      output.push(headerLine);
    }
  }

  return output.join('\n');
}

function sanitizeTextForSpeech(text, options = {}) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text), options);

  value = value.replace(/^---\n[\s\S]*?\n---\n?/, '');
  value = value.replace(/```[\s\S]*?```/g, ' ');
  value = value.replace(/!\[\[[^\]]+\]\]/g, ' ');
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
  value = sanitizeMarkdownTablesForSpeech(value);
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/<[^>]+>/g, ' ');
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/^\s*[-+*]\s+/gm, '');
  value = value.replace(/[*_~]/g, '');
  value = value.replace(/\|/g, ' ');
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

function sanitizeLatexForSpeech(text, options = {}) {
  let value = normalizeLineBreaks(text);
  const mathReadingLanguage = normalizeMathReadingLanguage(options.mathReadingLanguage);

  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\$([^$\n]+?)\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));

  return verbalizeLatexCommands(value, mathReadingLanguage);
}

function replaceLatexFormula(match, content, mathReadingLanguage) {
  if (mathReadingLanguage === 'skip' || isLongLatexFormula(content)) {
    return ' ';
  }

  return ` ${verbalizeShortLatex(content, mathReadingLanguage)} `;
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

function verbalizeShortLatex(content, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  let value = stripLatexDelimiters(content);
  const language = normalizeMathReadingLanguage(mathReadingLanguage);

  value = verbalizeLatexCommands(value, language);
  value = verbalizeLatexAbsoluteValues(value, language);
  value = value.replace(/_/g, language === 'chinese' ? ' 下标 ' : ' subscript ');
  value = value.replace(/\^/g, language === 'chinese' ? ' 上标 ' : ' superscript ');
  value = value.replace(/\+/g, language === 'chinese' ? ' 加 ' : ' plus ');
  value = value.replace(/=/g, language === 'chinese' ? ' 等于 ' : ' equals ');
  value = value.replace(/[{}()[\]]/g, ' ');
  value = value.replace(/\\/g, ' ');

  return cleanupLatexSpeech(value);
}

function verbalizeLatexAbsoluteValues(text, mathReadingLanguage) {
  let value = String(text || '').replace(/\\(?:lvert|rvert|vert)\b/g, '|');
  value = value.replace(/\|([^|\n]+)\|/g, (_match, inner) => (
    mathReadingLanguage === 'chinese'
      ? `${inner} 的绝对值`
      : `absolute value of ${inner}`
  ));
  return value.replace(/\|/g, ' ');
}

function verbalizeLatexCommands(text, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  let value = replaceLatexCommands(String(text || ''), language);
  value = replaceLatexSymbolCommands(value, language);
  return cleanupLatexSpeechPreservingLines(value);
}

function replaceLatexCommands(text, mathReadingLanguage) {
  let value = String(text || '');
  let previous = '';
  const fractionSpeech = mathReadingLanguage === 'chinese' ? '$1 分之 $2' : '$1 over $2';

  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, '$1');
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, fractionSpeech);
  }

  return value;
}

function replaceLatexSymbolCommands(text, mathReadingLanguage) {
  let value = String(text || '');
  const replacements = LATEX_COMMAND_REPLACEMENTS[mathReadingLanguage] || LATEX_COMMAND_REPLACEMENTS[DEFAULT_MATH_READING_LANGUAGE];

  for (const [command, speech] of replacements) {
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
  return '';
}

function normalizeSpeed(value) {
  const speed = Number(value);

  if (!Number.isFinite(speed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.5, speed));
}

function normalizeMathReadingLanguage(value) {
  const language = String(value || DEFAULT_MATH_READING_LANGUAGE).toLowerCase();
  return MATH_READING_LANGUAGES.includes(language) ? language : DEFAULT_MATH_READING_LANGUAGE;
}

module.exports = {
  DEFAULT_CHUNK_LIMITS,
  DEFAULT_MATH_READING_LANGUAGE,
  LATEX_FORMULA_MAX_CHARS,
  normalizeLineBreaks,
  normalizeMathReadingLanguage,
  sanitizeTextForSpeech,
  sanitizeLatexForSpeech,
  verbalizeShortLatex,
  parseChunkLimits,
  splitTextForSpeechChunks,
  resolveDefaultScriptPath,
  normalizeSpeed,
};
