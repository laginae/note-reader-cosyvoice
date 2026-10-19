'use strict';
const { structuredMathSpeech, replacePlainStructuredMath } = require('./structured-math');
const { greekMathCommands, greekNames } = require('./math-symbols');

const ACADEMIC_DEFAULTS = { academicMathMode: 'smart', academicMathStyle: 'concise', academicTableMode: 'smart', academicSkipNotice: true };
function academicOptions(settings = {}) {
  return { ...ACADEMIC_DEFAULTS, academicSkipNotice: settings.academicSkipNotice !== false,
    mathReadingLanguage: ['english','chinese','skip'].includes(settings.mathReadingLanguage) ? settings.mathReadingLanguage : 'english',
    academicMathMode: ['smart','all','skip'].includes(settings.academicMathMode) ? settings.academicMathMode : 'smart',
    academicMathStyle: settings.academicMathStyle === 'verbose' ? 'verbose' : 'concise',
    academicTableMode: ['smart','all','skip'].includes(settings.academicTableMode) ? settings.academicTableMode : 'smart' };
}
const chinese = text => /[\u3400-\u9fff]/.test(text);
function contextualMathOptions(options, before, after) {
  if (options.mathReadingLanguage === 'skip') return options;
  const proseTokens = value => [...String(value).matchAll(/[\u3400-\u9fff]+|[A-Za-z]{3,}/g)]
    .map(match => match[0]).filter(word => !/^(?:min|max|epsilon|ceil|floor|formula|left|right)$/i.test(word));
  const preceding = String(before).slice(-400).replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ');
  const following = String(after).slice(0,400).replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ');
  const token = proseTokens(preceding).at(-1) || proseTokens(following)[0];
  return token ? { ...options, mathReadingLanguage: chinese(token) ? 'chinese' : 'english' } : options;
}
function omission(kind, options, text = '') {
  if (options.academicSkipNotice === false) return '';
  // A spoken omission follows supplied prose, not the short-formula language.
  // Without prose (for example a formula-only page), retain the saved fallback.
  const hasProse = chinese(text) || /[A-Za-z]{4,}/.test(text);
  const zh = kind === 'formula' && !hasProse ? options.mathReadingLanguage === 'chinese' : chinese(text);
  return kind === 'formula' ? (zh ? '公式。' : 'Formula.') : (zh ? '表格数据略过。' : 'Table data omitted.');
}
function formulaNoticeWithPause(notice, before = '') {
  const previous = String(before).trimEnd();
  if (!notice || !previous || /[.!?。！？…,:;，：；]["'”’）)]*$/.test(previous)) return notice;
  return (notice === '公式。' ? '。' : '.') + ' ' + notice;
}
function formulaNoticeEnding(notice, after) {
  const suffix = String(after).match(/^[ \t]*[.!?。！？,;:，；：]+[ \t]*/)?.[0] || '';
  const emphasis = suffix.match(/[!?！？]/)?.[0];
  return { notice: emphasis ? notice.slice(0, -1) + emphasis : notice, consumed: suffix.length };
}
function numericCell(value) {
  const text = String(value).trim();
  return /\d/.test(text) && !/[\p{L}]{4,}/u.test(text)
    && (text.match(/[\d.\s,%±+\-−–—()\[\]<>≤≥/]/g) || []).length / Math.max(1,text.length) >= .65;
}
function skipTable(headers, rows, options = {}) {
  const mode = academicOptions(options).academicTableMode;
  if (mode !== 'smart') return mode === 'skip';
  const cells = rows.flat().filter(value => String(value).trim());
  return (rows.length >= 8 || cells.length >= 48) && cells.length >= 16
    && cells.filter(numericCell).length / cells.length >= .6;
}
function citations(text) {
  const zh = chinese(text);
  // Only numeric bibliography groups. Keep zero-based intervals and years untouched.
  return String(text).replace(/\[\d+(?:\s*(?:[,;]|[-–—])\s*\d+)*\](?:\([^\s)]*\))?(?:[ \t]*(?:[,，;；][ \t]*)?\[\d+(?:\s*(?:[,;]|[-–—])\s*\d+)*\](?:\([^\s)]*\))?)*/g, match => {
    const groups = [...match.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    const numbers = groups.join(',').match(/\d+/g) || [];
    if (numbers.some(n => +n < 1 || +n > 999)) return match;
    const values = [...new Set(groups.flatMap(group => group.split(/\s*[,;]\s*/)))].map(value => value.replace(/\s*[-–—]\s*/, zh ? '到' : ' to '));
    const list = values.length <= 1 ? values[0] : values.slice(0,-1).join(zh ? '、' : ', ') + (zh ? '和' : ' and ') + values.at(-1);
    return zh ? ` 文献${list} ` : ` ${values.length > 1 || / to /.test(list) ? 'references' : 'reference'} ${list} `;
  });
}
// Normalize presentation only; keep mathematical operators and unknown commands intact.
function normalizeMathPresentation(content) {
  let value = greekMathCommands(String(content || '')).trim()
    .replace(/[×÷±∓≈]/g, symbol => ({ '×':'\\times ', '÷':' / ', '±':'\\pm ', '∓':'\\mp ', '≈':'\\approx ' })[symbol]);
  if (value.length > 4096) return null;
  let depth = 0;
  for (const char of value) {
    if (char === '{' && ++depth > 16) return null;
    if (char === '}' && --depth < 0) return null;
  }
  if (depth) return null;
  value = value.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|mathnormal|boldsymbol|rm|bf|it)\b/g, '')
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, '')
    .replace(/\\[,;:! ]|\\(?:quad|qquad|enspace|thinspace)\b/g, ' ')
    .replace(/\\_/g, '_');
  // Flatten redundant groups around a single atom, not fractions or compound expressions.
  for (let pass = 0; pass < 16; pass++) {
    const next = value.replace(/\{\s*\{\s*([A-Za-z0-9]+|\\[A-Za-z]+)\s*\}\s*\}/g, '{$1}');
    if (next === value) break;
    value = next;
  }
  // min/max are labels only inside a simple script, not general operator support.
  value = value.replace(/([_^])\s*\{\s*\\(min|max)\s*\}/g, '$1{$2}');
  const scriptSymbol = new RegExp('([_^])\\s*(\\\\(?:' + [...new Set(Object.values(greekNames)), 'ell', 'infty'].join('|') + '))(?![A-Za-z])', 'g');
  return value.replace(scriptSymbol, '$1{$2}')
    .replace(/([_^])\s*\\(min|max)\b/g, '$1{$2}');
}
// Only conventional lower/upper labels are shortened; arbitrary pairs stay bracketed.
function namedBounds(value) {
  const match = value.replace(/\\(?:left|right)\b/g, '').trim().match(/^\[([^\[\],]+),([^\[\],]+)\]$/);
  if (!match) return null;
  const lower = match[1].trim(), upper = match[2].trim();
  if (/^(?:\\ell|l|L)$/.test(lower) && /^[uU]$/.test(upper)) return [lower, upper];
  const low = lower.match(/^([A-Za-z])_\{\s*min\s*\}(?=\s*(?:[+−-]|$))/);
  const high = upper.match(/^([A-Za-z])_\{\s*max\s*\}(?=\s*(?:[+−-]|$))/);
  return low && high && low[1] === high[1] ? [lower, upper] : null;
}

// Judge listening cost from operators and grouping, not typography or script labels.
function complexListeningMath(content) {
  const normalized = normalizeMathPresentation(content);
  if (normalized === null) return true;
  const value = normalized.replace(/[_^]\s*(?:\{[^{}]*\}|\\[A-Za-z]+|[A-Za-z0-9])/g, '')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\(?:leq?|geq?|neq?|approx|times|cdot|pm|mp|to|rightarrow)\b/g, '+');
  const fractions = (value.match(/\\(?:d?frac|tfrac)\b|\//g) || []).length;
  const operations = (value.match(/[=+−\-*<>≤≥≠≈]/g) || []).length + fractions;
  let depth = 0, maxDepth = 0, groups = 0;
  for (const char of value) {
    if ('(['.includes(char)) { groups++; maxDepth = Math.max(maxDepth, ++depth); }
    else if (')]'.includes(char)) depth--;
  }
  const commas = (value.match(/,/g) || []).length;
  const transpose = /\^\s*(?:\{\s*(?:T|\\top|\\mathrm\s*\{?T\}?)\s*\}|T|\\top)/.test(normalized);
  return fractions > 1 || (fractions > 0 && operations >= 3)
    || maxDepth >= 3 || (maxDepth >= 2 && operations >= 2)
    || (groups >= 3 && operations >= 2)
    || (commas >= 3 && /[\[\{]/.test(value)) || (transpose && commas > 0);
}
function mathSpeech(content, inputOptions = {}) {
  const options = academicOptions(inputOptions), zh = options.mathReadingLanguage === 'chinese', brief = options.academicMathStyle === 'concise';
  if (options.mathReadingLanguage === 'skip' || options.academicMathMode === 'skip') return omission('formula', options);
  let value = normalizeMathPresentation(content);
  if (value === null) return omission('formula', options);
  if (/^\s*(?:\\?(?:min|max)\b|\\[lr](?:ceil|floor)\b|[⌈⌊])/.test(value)) {
    return structuredMathSpeech(value, zh, options.academicMathMode !== 'all') ?? omission('formula', options);
  }
  const commands = value.match(/\\[A-Za-z]+/g) || [];
  const semantic = value.replace(/\\[A-Za-z]+/g,'x').replace(/[{}\s]/g,'');
  const limit = options.academicMathMode === 'all' ? 100 : 32;
  if (semantic.length > limit || /\\(?:begin|end|sum|prod|int|iint|oint|cases|matrix)\b|\\\\/.test(value)) return omission('formula', options);
  const symbols = { ell:'ell', ...Object.fromEntries(Object.values(greekNames).map(name => [name, name])) };
  const known = new Set([...Object.keys(symbols), 'Gamma','Delta','Theta','Lambda','Sigma','Omega','Phi','Pi','Psi','psi','frac','dfrac','tfrac','sqrt','bar','overline','hat','tilde','vec','dot','ddot','text','mathrm','mathbf','mathbb','boldsymbol','operatorname','left','right','lvert','rvert','vert','leq','geq','le','ge','lt','gt','neq','ne','approx','times','cdot','pm','mp','infty','to','rightarrow','leftarrow','in','notin','partial']);
  if (commands.some(c => !known.has(c.slice(1)))) return omission('formula', options);
  let depth = 0, maxDepth = 0;
  for (const c of value) { if (c === '{') maxDepth = Math.max(maxDepth, ++depth); if (c === '}' && --depth < 0) return omission('formula',options); }
  if (depth || maxDepth > 3) return omission('formula', options);
  const bounds = namedBounds(value);
  if (bounds) {
    const endpoints = bounds.map(bound => mathSpeech(bound, { ...options, academicSkipNotice: true }));
    if (endpoints.some(endpoint => !endpoint || endpoint === omission('formula', { ...options, academicSkipNotice: true }))) {
      return omission('formula', options);
    }
    const range = endpoints.join(zh ? ' 到 ' : ' to ');
    return brief ? range : (zh ? '闭区间，' : 'closed interval, ') + range;
  }
  if (options.academicMathMode === 'smart' && complexListeningMath(value)) return omission('formula', options);
  if (brief) {
    const call = value.match(/^(\\[A-Za-z]+|[A-Za-z])\s*(?:\[([A-Za-z])\]|\(([A-Za-z])\))$/);
    if (call) return `${mathSpeech(call[1], options)} of ${call[2] || call[3]}`;
  }
  // Explicitly speak products of adjacent, simply subscripted variables.
  value = value.replace(/([A-Za-z]_\{\s*(?:\\[A-Za-z]+|[A-Za-z0-9]+)\s*\})\s*(?=[A-Za-z]_\{)/g, '$1 * ');
  // A single Latin factor next to a Greek symbol is a product, not a word.
  const greekFactor = Object.keys(symbols).filter(name => name !== 'ell').join('|');
  value = value.replace(new RegExp('(?<![A-Za-z\\\\])([A-Za-z](?:_\\{[A-Za-z0-9]+\\})?)\\s*(?=\\\\(?:' + greekFactor + ')\\b)', 'g'), '$1 * ');
  value = value.replace(/\\(?:left|right)\b/g,'').replace(/\\(?:lvert|rvert|vert)\b/g,'|');
  const group = (inner) => /[+−=<>-]|\bover\b|分之/.test(inner) ? (zh ? ` 括号 ${inner} 括号结束 ` : ` open parenthesis ${inner} close parenthesis `) : inner;
  for (let pass=0;pass<4;pass++) {
    const before = value;
    value = value.replace(/\\(?:frac|dfrac|tfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_,a,b) => zh ? `${group(b)} 分之 ${group(a)}` : `${group(a)} over ${group(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_,a) => zh ? `${group(a)} 的平方根` : `square root of ${group(a)}`)
      .replace(/\\(bar|overline|hat|tilde|vec|dot|ddot)\s*(?:\{([^{}]+)\}|([A-Za-z]))/g, (_,symbol,a,b) => `${group(a || b)} ${symbol === 'overline' ? 'bar' : symbol}`)
      .replace(/\\(?:text|mathrm|mathbf|mathbb|boldsymbol|operatorname)\s*\{([^{}]*)\}/g,'$1');
    if (before === value) break;
  }
  // Remaining structural commands cannot be interpreted reliably by this short-form reader.
  if (/\\(?:frac|dfrac|tfrac|sqrt|bar|overline|hat|tilde|vec|dot|ddot|text|mathrm|mathbf|mathbb|boldsymbol|operatorname)\b/.test(value)) return omission('formula',options);
  const ops = {leq:['less than or equal to','小于等于'],geq:['greater than or equal to','大于等于'],neq:['not equal to','不等于'],approx:['approximately equal to','约等于'],times:['times','乘以'],cdot:['times','乘以'],pm:['plus or minus','正负'],mp:['minus or plus','负正'],infty:['infinity','无穷'],to:['to','到'],rightarrow:['to','到'],leftarrow:['from','来自'],in:['belongs to','属于'],notin:['does not belong to','不属于'],partial:['partial','偏导']};
  Object.assign(ops,{le:ops.leq,ge:ops.geq,ne:ops.neq,lt:['less than','小于'],gt:['greater than','大于']});
  value = value.replace(/\\([A-Za-z]+)/g, (_,symbol) => ` ${ops[symbol]?.[zh?1:0] || symbols[symbol] || symbol} `);
  value = value.replace(/\|([^|]+)\|/g, (_,a) => zh ? `${a} 的绝对值` : `absolute value of ${a}`);
  if (/\|/.test(value)) return omission('formula',options);
  value = value.replace(/_\s*(?:\{([^{}]*)\}|([A-Za-z0-9]))/g, (_,a,b) => ` ${brief ? 'sub' : zh ? '下标' : 'subscript'} ${a ?? b} `)
    .replace(/\^\s*(?:\{([^{}]*)\}|([A-Za-z0-9+-]))/g, (_,a,b) => {
      const exponent = a ?? b;
      return exponent === '2' ? (zh ? ' 的平方 ' : ' squared ') : exponent === '3' ? (zh ? ' 的立方 ' : ' cubed ') : ` ${zh ? '的' : 'to the power of'} ${exponent} ${zh ? '次方' : ''} `;
    });
  if (/[\\_^]/.test(value)) return omission('formula', options);
  value = value.replace(/<=|>=|!=|≤|≥|≠|[+−=<>*/-]/g, op => ` ${({'<=':zh?'小于等于':'less than or equal to','>=':zh?'大于等于':'greater than or equal to','!=':zh?'不等于':'not equal to','≤':zh?'小于等于':'less than or equal to','≥':zh?'大于等于':'greater than or equal to','≠':zh?'不等于':'not equal to','+':zh?'加':'plus','-':zh?'减':'minus','−':zh?'减':'minus','=':zh?'等于':'equals','<':zh?'小于':'less than','>':zh?'大于':'greater than','*':zh?'乘以':'times','/':zh?'除以':'divided by'})[op]} `);
  value = value.replace(/\(/g,zh?' 左括号 ':' open parenthesis ').replace(/\)/g,zh?' 右括号 ':' close parenthesis ')
    .replace(/\[/g,zh?' 左方括号 ':' open bracket ').replace(/\]/g,zh?' 右方括号 ':' close bracket ')
    .replace(/[{}]/g,' ').replace(/\s+/g,' ').trim();
  return value;
}
function academicLatex(text, options = {}) {
  const source = String(text), pattern = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g;
  let result = '', end = 0;
  for (const match of source.matchAll(pattern)) {
    result += source.slice(end, match.index);
    const contextOptions = contextualMathOptions(options, source.slice(0, match.index), source.slice(match.index + match[0].length));
    const speech = mathSpeech(match.slice(1,5).find(v => v !== undefined), contextOptions);
    end = match.index + match[0].length;
    if (speech === 'Formula.' || speech === '公式。') {
      const ending = formulaNoticeEnding(speech, source.slice(end));
      const notice = formulaNoticeWithPause(speech, result).replace(speech, ending.notice);
      result = result.trimEnd() + notice.replace(/^(?=Formula|公式)/, ' ') + ' ';
      end += ending.consumed;
    } else result += ` ${speech} `;
  }
  return replacePlainStructuredMath(result + source.slice(end), (formula, context) => {
    const contextOptions = contextualMathOptions(options, context.before, context.after);
    const speech = structuredMathSpeech(formula, contextOptions.mathReadingLanguage === 'chinese', options.academicMathMode !== 'all');
    if (speech !== null && options.academicMathMode !== 'skip' && options.mathReadingLanguage !== 'skip') return speech;
    const notice = omission('formula', academicOptions(contextOptions));
    if (!notice) return '';
    const ending = formulaNoticeEnding(notice, context.after);
    const spoken = formulaNoticeWithPause(notice, context.before).replace(notice, ending.notice);
    return { text: context.before.trimEnd() + spoken.replace(/^(?=Formula|公式)/, ' ') + ' ', consumed: ending.consumed };
  });
}
module.exports = { ACADEMIC_DEFAULTS, academicOptions, contextualMathOptions, academicLatex, mathSpeech, citations, skipTable, numericCell, omission, formulaNoticeWithPause, formulaNoticeEnding, complexListeningMath };
