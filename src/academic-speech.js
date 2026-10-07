'use strict';

const ACADEMIC_DEFAULTS = { academicMathMode: 'smart', academicMathStyle: 'concise', academicTableMode: 'smart', academicSkipNotice: true };
function academicOptions(settings = {}) {
  return { ...ACADEMIC_DEFAULTS, academicSkipNotice: settings.academicSkipNotice !== false,
    mathReadingLanguage: ['english','chinese','skip'].includes(settings.mathReadingLanguage) ? settings.mathReadingLanguage : 'english',
    academicMathMode: ['smart','all','skip'].includes(settings.academicMathMode) ? settings.academicMathMode : 'smart',
    academicMathStyle: settings.academicMathStyle === 'verbose' ? 'verbose' : 'concise',
    academicTableMode: ['smart','all','skip'].includes(settings.academicTableMode) ? settings.academicTableMode : 'smart' };
}
const chinese = text => /[\u3400-\u9fff]/.test(text);
function omission(kind, options, text = '') {
  if (options.academicSkipNotice === false) return '';
  const zh = kind === 'formula' ? options.mathReadingLanguage === 'chinese' : chinese(text);
  return kind === 'formula' ? (zh ? '公式略过。' : 'Formula omitted.') : (zh ? '表格数据略过。' : 'Table data omitted.');
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
  let value = String(content || '').trim();
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
  return value.replace(/([_^])\s*(\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|rho|tau|phi|eta|nu|xi|zeta|Gamma|Delta|Theta|Lambda|Sigma|Omega|Phi|Pi|Psi|psi))\b/g, '$1{$2}');
}
function mathSpeech(content, inputOptions = {}) {
  const options = academicOptions(inputOptions), zh = options.mathReadingLanguage === 'chinese', brief = options.academicMathStyle === 'concise';
  if (options.mathReadingLanguage === 'skip' || options.academicMathMode === 'skip') return omission('formula', options);
  let value = normalizeMathPresentation(content);
  if (value === null) return omission('formula', options);
  const commands = value.match(/\\[A-Za-z]+/g) || [];
  const semantic = value.replace(/\\[A-Za-z]+/g,'x').replace(/[{}\s]/g,'');
  const limit = options.academicMathMode === 'all' ? 100 : 32;
  if (semantic.length > limit || /\\(?:begin|end|sum|prod|int|iint|oint|cases|matrix)\b|\\\\/.test(value)) return omission('formula', options);
  const symbols = { alpha:'alpha', beta:'beta', gamma:'gamma', delta:'delta', epsilon:'epsilon', theta:'theta', lambda:'lambda', mu:'mu', pi:'pi', sigma:'sigma', omega:'omega', rho:'rho', tau:'tau', phi:'phi', eta:'eta', nu:'nu', xi:'xi', zeta:'zeta' };
  const known = new Set([...Object.keys(symbols), 'Gamma','Delta','Theta','Lambda','Sigma','Omega','Phi','Pi','Psi','psi','frac','dfrac','tfrac','sqrt','bar','overline','hat','tilde','vec','dot','ddot','text','mathrm','mathbf','mathbb','boldsymbol','operatorname','left','right','lvert','rvert','vert','leq','geq','le','ge','lt','gt','neq','ne','approx','times','cdot','pm','mp','infty','to','rightarrow','leftarrow','in','notin','partial']);
  if (commands.some(c => !known.has(c.slice(1)))) return omission('formula', options);
  let depth = 0, maxDepth = 0;
  for (const c of value) { if (c === '{') maxDepth = Math.max(maxDepth, ++depth); if (c === '}' && --depth < 0) return omission('formula',options); }
  if (depth || maxDepth > 3) return omission('formula',options);
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
  return String(text).replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g, (_match,...args) => ` ${mathSpeech(args.slice(0,4).find(v => v !== undefined),options)} `);
}
module.exports = { ACADEMIC_DEFAULTS, academicOptions, academicLatex, mathSpeech, citations, skipTable, numericCell, omission };
