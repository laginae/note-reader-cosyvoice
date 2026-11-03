'use strict';
const { structuredMathSpeech, replacePlainStructuredMath } = require('./structured-math');
const { greekMathCommands, greekNames } = require('./math-symbols');
const { simpleFunctionCalls, speakSimpleFunctions } = require('./math-functions');
const { conciseMathLabels } = require('./math-variable-labels');
const { intervalProse, bracketMathSpeech, conciseBracketSpeech } = require('./math-collections');
const { conciseFractionSpeech } = require('./math-fractions');

const GREEK_NAMES = new Set(Object.values(greekNames));
const MATH_SYMBOLS = { ell: 'ell', ...Object.fromEntries([...GREEK_NAMES].map(name => [name, name])) };
const MATH_COMMANDS = new Set([...Object.keys(MATH_SYMBOLS), 'Gamma','Delta','Theta','Lambda','Sigma','Omega','Phi','Pi','Psi','psi','frac','dfrac','tfrac','sqrt','bar','overline','hat','tilde','vec','dot','ddot','text','mathrm','mathbf','mathbb','boldsymbol','operatorname','left','right','lvert','rvert','vert','leq','geq','le','ge','lt','gt','neq','ne','approx','times','cdot','pm','mp','infty','to','rightarrow','leftarrow','in','notin','partial','lbrace','rbrace']);
const CONCISE_COMMANDS = new Set(['prime', 'ast', 'star', 'top']);
const SCRIPT_SYMBOL = new RegExp('([_^])\\s*(\\\\(?:' + [...GREEK_NAMES, 'ell', 'infty'].join('|') + '))(?![A-Za-z])', 'g');
const GREEK_FACTOR = new RegExp('(?<![A-Za-z\\\\])([A-Za-z](?:_\\{[A-Za-z0-9]+\\})?)\\s*(?=\\\\(?:' + [...GREEK_NAMES].join('|') + ')\\b)', 'g');
const MATH_OPERATORS = {leq:['less than or equal to','小于等于'],geq:['greater than or equal to','大于等于'],neq:['not equal to','不等于'],approx:['approximately equal to','约等于'],times:['times','乘以'],cdot:['times','乘以'],pm:['plus or minus','正负'],mp:['minus or plus','负正'],infty:['infinity','无穷'],to:['to','到'],rightarrow:['to','到'],leftarrow:['from','来自'],in:['belongs to','属于'],notin:['does not belong to','不属于'],partial:['partial','偏导']};
Object.assign(MATH_OPERATORS, {le:MATH_OPERATORS.leq,ge:MATH_OPERATORS.geq,ne:MATH_OPERATORS.neq,lt:['less than','小于'],gt:['greater than','大于']});

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
  return { ...options, ...(token ? { mathReadingLanguage: chinese(token) ? 'chinese' : 'english' } : {}),
    mathIntervalContext: intervalProse(before, after) };
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
    .replace(/[∈∉∞]/g, symbol => ({ '∈':'\\in ', '∉':'\\notin ', '∞':'\\infty ' })[symbol])
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
  return value.replace(SCRIPT_SYMBOL, '$1{$2}')
    .replace(/([_^])\s*\\(min|max)\b/g, '$1{$2}');
}
// Only conventional lower/upper labels imply ranges without additional context.
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
  return complexNormalizedMath(normalized);
}
function complexNormalizedMath(normalized) {
  const value = normalized.replace(/[_^]\s*(?:\{[^{}]*\}|\\[A-Za-z]+|[A-Za-z0-9])/g, '')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\(?:leq?|geq?|neq?|approx|times|cdot|pm|mp|to|rightarrow)\b/g, '+');
  const fractions = (value.match(/\\(?:d?frac|tfrac)\b|\//g) || []).length;
  const calls = simpleFunctionCalls(normalized.replace(/\\(?:left|right)\b/g, ''));
  const functionRatio = fractions > 0 && calls.length >= 2
    && (calls.some(call => call.scripted) || calls.length >= 3);
  const operations = (value.match(/[=+−\-*<>≤≥≠≈]/g) || []).length + fractions;
  let depth = 0, maxDepth = 0, groups = 0;
  for (const char of value) {
    if ('(['.includes(char)) { groups++; maxDepth = Math.max(maxDepth, ++depth); }
    else if (')]'.includes(char)) depth--;
  }
  const commas = (value.match(/,/g) || []).length;
  const transpose = /\^\s*(?:\{\s*(?:T|\\top|\\mathrm\s*\{?T\}?)\s*\}|T|\\top)/.test(normalized);
  return functionRatio || fractions > 1 || (fractions > 0 && operations >= 3)
    || maxDepth >= 3 || (maxDepth >= 2 && operations >= 2)
    || (groups >= 3 && operations >= 2)
    || (commas >= 3 && /[\[\{]/.test(value)) || (transpose && commas > 0);
}

const STANDALONE_MATH_OPERATORS = {
  max: ['max', 'max'], min: ['min', 'min'], argmax: ['arg max', 'arg max'], argmin: ['arg min', 'arg min'],
  sup: ['supremum', '上确界'], inf: ['infimum', '下确界'], lim: ['limit', '极限'],
  log: ['log', '对数'], ln: ['natural log', '自然对数'], exp: ['exponential', '指数函数'],
  sin: ['sine', '正弦'], cos: ['cosine', '余弦'], tan: ['tangent', '正切'],
  det: ['determinant', '行列式'], sum: ['summation', '求和'], prod: ['product', '连乘'], int: ['integral', '积分'],
};
const SIMPLE_MATH_ATOM = '(?:[A-Za-z](?:_\\s*(?:\\{[A-Za-z0-9]{1,8}\\}|[A-Za-z0-9]))?|\\\\[A-Za-z]+|\\d+(?:\\.\\d+)?)';
const SIMPLE_UNARY_MATH = new RegExp(
  '^\\\\(sin|cos|tan|log|ln|exp)(?:\\s+(' + SIMPLE_MATH_ATOM + ')|\\s*\\(\\s*('
  + SIMPLE_MATH_ATOM + ')\\s*\\)|\\s*\\{\\s*(' + SIMPLE_MATH_ATOM + ')\\s*\\}|\\s*(\\\\[A-Za-z]+))$'
);

// Only isolated operators and a single unambiguous argument bypass complex-math parsing.
function shortMathOperator(value, options) {
  if (value.length > 32) return null;
  const zh = options.mathReadingLanguage === 'chinese';
  const command = value.match(/^\\([A-Za-z]+)$/);
  const named = value.match(/^\\operatorname\*?\s*\{\s*(arg\s*(?:max|min)|[A-Za-z]+)\s*\}$/);
  const argExtremum = value.match(/^\\arg\s*\\(max|min)$/);
  const literal = value.match(/^(max|min)$/);
  const name = argExtremum ? 'arg' + argExtremum[1]
    : (command?.[1] || named?.[1]?.replace(/\s/g, '') || literal?.[1]);
  if (name && Object.prototype.hasOwnProperty.call(STANDALONE_MATH_OPERATORS, name)) return STANDALONE_MATH_OPERATORS[name][zh ? 1 : 0];
  const call = value.match(SIMPLE_UNARY_MATH);
  if (!call) return null;
  const atom = call.slice(2).find(Boolean);
  if (atom.startsWith('\\') && !GREEK_NAMES.has(atom.slice(1))) return null;
  const argument = mathSpeech(atom, { ...options, academicSkipNotice: true });
  if (!argument || /^(?:Formula\.|公式。)$/.test(argument)) return null;
  const label = STANDALONE_MATH_OPERATORS[call[1]];
  if (call[1] === 'exp') return zh ? 'e 的 ' + argument + ' 次方' : 'e to the power of ' + argument;
  return zh ? argument + ' 的' + label[1] : label[0] + ' of ' + argument;
}

function mathSpeech(content, inputOptions = {}) {
  const options = academicOptions(inputOptions), zh = options.mathReadingLanguage === 'chinese', brief = options.academicMathStyle === 'concise';
  if (options.mathReadingLanguage === 'skip' || options.academicMathMode === 'skip') return omission('formula', options);
  let value = normalizeMathPresentation(content);
  if (value === null) return omission('formula', options);
  if (brief) value = value.replace(/\\widehat\b/g, '\\hat').replace(/\\widetilde\b/g, '\\tilde');
  const shortOperator = shortMathOperator(value, options);
  if (shortOperator !== null) return shortOperator;
  if (/^\s*(?:\\?(?:min|max)\b|\\[lr](?:ceil|floor)\b|[⌈⌊])/.test(value)) {
    return structuredMathSpeech(value, zh, options.academicMathMode !== 'all') ?? omission('formula', options);
  }
  const commands = value.match(/\\[A-Za-z]+/g) || [];
  const semantic = value.replace(/\\[A-Za-z]+/g,'x').replace(/[{}\s]/g,'');
  const limit = options.academicMathMode === 'all' ? 100 : 32;
  if (semantic.length > limit || /\\(?:begin|end|sum|prod|int|iint|oint|cases|matrix)\b|\\\\/.test(value)) return omission('formula', options);
  if (commands.some(c => !MATH_COMMANDS.has(c.slice(1)) && !(brief && CONCISE_COMMANDS.has(c.slice(1))))) return omission('formula', options);
  let depth = 0, maxDepth = 0;
  for (const c of value) { if (c === '{') maxDepth = Math.max(maxDepth, ++depth); if (c === '}' && --depth < 0) return omission('formula',options); }
  if (depth || maxDepth > 3) return omission('formula', options);
  const collection = bracketMathSpeech(value, { zh, brief, context: inputOptions.mathIntervalContext,
    literalSets: inputOptions.literalMathSets === true }, atom => mathSpeech(atom, { ...options, academicSkipNotice: true }));
  if (collection !== null) return collection;
  if (/\\[lr]brace\b/.test(value)) return omission('formula', options);
  // Recognize a complete numeric interval, not a vector embedded in an expression.
  const numericRange = value.replace(/\\(?:left|right)\b/g, '').trim()
    .match(/^\[\s*([+−-]?\s*(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+−-]?\s*(?:\d+(?:\.\d+)?|\.\d+))\s*\]$/);
  if (numericRange && inputOptions.mathIntervalContext !== 'literal') {
    const endpoints = numericRange.slice(1).map(number => number.replace(/\s/g, '')
      .replace(/^[−-]/, zh ? '负' : 'minus ').replace(/^\+/, zh ? '正' : 'plus '));
    const range = endpoints.join(zh ? ' 到 ' : ' to ');
    return brief ? range : (zh ? '闭区间，' : 'closed interval, ') + range;
  }
  const bounds = namedBounds(value);
  if (bounds && inputOptions.mathIntervalContext !== 'literal') {
    const endpoints = bounds.map(bound => mathSpeech(bound, { ...options, academicSkipNotice: true }));
    if (endpoints.some(endpoint => !endpoint || endpoint === omission('formula', { ...options, academicSkipNotice: true }))) {
      return omission('formula', options);
    }
    const range = endpoints.join(zh ? ' 到 ' : ' to ');
    return brief ? range : (zh ? '闭区间，' : 'closed interval, ') + range;
  }
  if (options.academicMathMode === 'smart' && complexNormalizedMath(value)) return omission('formula', options);
  if (brief) {
    const fraction = conciseFractionSpeech(value, zh, atom => mathSpeech(atom, { ...options, academicSkipNotice: true }));
    if (fraction !== null) return fraction;
    const simpleBrackets = conciseBracketSpeech(value, zh, atom => mathSpeech(atom, { ...options, academicSkipNotice: true }));
    if (simpleBrackets !== null) return simpleBrackets;
    value = conciseMathLabels(value, zh).text;
    if (/\\(?:prime|ast|star|top)\b|['′″]/.test(value)) return omission('formula', options);
    const call = value.match(/^(\\[A-Za-z]+|[A-Za-z])\s*(?:\[([A-Za-z])\]|\(([A-Za-z])\))$/);
    if (call) return `${mathSpeech(call[1], options)} of ${call[2] || call[3]}`;
    value = speakSimpleFunctions(value.replace(/\\(?:left|right)\b/g, ''),
      (name, argument) => `${mathSpeech(name, options)} of ${mathSpeech(argument, options)}`);
  }
  // Explicitly speak products of adjacent, simply subscripted variables.
  value = value.replace(/([A-Za-z]_\{\s*(?:\\[A-Za-z]+|[A-Za-z0-9]+)\s*\})\s*(?=[A-Za-z]_\{)/g, '$1 * ');
  // A single Latin factor next to a Greek symbol is a product, not a word.
  value = value.replace(GREEK_FACTOR, '$1 * ');
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
  // Only named statistics with short variable arguments get natural labels.
  // Ordinary brackets, conditional expressions and compound arguments stay intact.
  value = value.replace(/\{\s*(Var|Cov|Corr)\s*\}(?=\s*[[(])/g, '$1')
    .replace(/(?<![A-Za-z\\])(Var|Cov|Corr)\s*(?:\[([^\[\]()]+)\]|\(([^\[\]()]+)\))/g, (match, name, square, round) => {
      const raw = square ?? round, args = []; let depth = 0, start = 0;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') depth--;
        else if (raw[i] === ',' && !depth) { args.push(raw.slice(start, i).trim()); start = i + 1; }
      }
      args.push(raw.slice(start).trim());
      const atom = /^(?:[A-Za-z]|\\[A-Za-z]+)(?:\s*[_^]\s*(?:\{(?:[A-Za-z0-9, ]{1,12}|\\[A-Za-z]+)\}|[A-Za-z0-9])){0,2}$/;
      if (args.length !== (name === 'Var' ? 1 : 2) || args.some(arg => !atom.test(arg))) return match;
      const spoken = args.map(arg => mathSpeech(arg, { ...options, academicSkipNotice: true }));
      if (spoken.some(arg => !arg || /^(?:Formula\.|公式。)$/.test(arg))) return match;
      const label = { Var: ['variance', '方差'], Cov: ['covariance', '协方差'], Corr: ['correlation', '相关系数'] }[name];
      return zh ? `${spoken.join(' 与 ')} 的${label[1]}` : `${label[0]} of ${spoken.join(' and ')}`;
    });
  value = value.replace(/\\([A-Za-z]+)/g, (_,symbol) => ` ${MATH_OPERATORS[symbol]?.[zh?1:0] || MATH_SYMBOLS[symbol] || symbol} `);
  value = value.replace(/\|([^|]+)\|/g, (_,a) => zh ? `${a} 的绝对值` : `absolute value of ${a}`);
  if (/\|/.test(value)) return omission('formula',options);
  value = value.replace(/_\s*(?:\{([^{}]*)\}|([A-Za-z0-9]))/g, (_,a,b) => {
      const index = (a ?? b).trim();
      // Short indices read naturally; compound structures retain their label.
      const simple = /^[\p{L}\p{N}]+(?:\s*[+−-]\s*[\p{L}\p{N}]+)?(?:\s*,\s*[\p{L}\p{N}]+(?:\s*[+−-]\s*[\p{L}\p{N}]+)?)*$/u.test(index);
      return brief && simple ? ` ${index.replace(/,/g, ' ')} ` : ` ${zh ? '下标' : 'subscript'} ${index} `;
    })
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
