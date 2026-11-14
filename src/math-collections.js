'use strict';
const { greekNames } = require('./math-symbols');
const { simpleFunctionCalls, simpleFunctionSpeech } = require('./math-functions');
const { shortMathVariableParser } = require('./math-variable-labels');
const symbols = new Set([...Object.values(greekNames), 'ell']);

// Context is deliberately local: a previous formula or another sentence is not evidence.
function intervalProse(before, after) {
  const strip = value => String(value).replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ');
  const left = strip(String(before).slice(-400)).slice(-160).split(/[.!?;。！？；\n]/).at(-1);
  const right = strip(String(after).slice(0, 400)).slice(0, 100).split(/[.!?;。！？；\n]/)[0];
  const literal = /\b(?:coordinates?|points?|tuples?|vectors?|matrices|matrix|commutators?|gcd)\b|inner product|greatest common divisor|坐标|有序对|向量|矩阵|内积|交换子|最大公约数/i;
  if (literal.test(left) || /^[\s,，]*(?:(?:is|are|denotes?|represents?)\s+(?:an?\s+)?)?(?:coordinate|point|tuple|vector|matrix|commutator)\b|^[\s,，]*(?:是|表示|为)?(?:坐标|有序对|向量|矩阵|内积|交换子)/i.test(right)) return 'literal';
  if (/\b(?:interval|range|domain)(?:\s+(?:is|are|equals?|denoted by))?\s*[:=]?\s*$|(?:区间|范围|实数域|定义域|取值域)(?:为|是|取为|记作|表示为)?\s*[:：=]?\s*$/i.test(left)
    || /(?:往|向)\s*$/.test(left) && /^[\s,，]*(?:搜(?:索)?|查找)/.test(right)
    || /^[\s,，]*(?:(?:is|are|denotes?|represents?)\s+(?:an?\s+|the\s+)?)?(?:(?:open|closed|half-open)\s+)?interval\b|^[\s,，]*(?:是|表示|为|这个|这一)?(?:开|闭|左开右闭|左闭右开)?区间/i.test(right)) return 'interval';
  return undefined;
}
function atom(source, depth = 0) {
  if (depth > 3) return null;
  const text = source.trim(), sign = text.match(/^[+−-]/)?.[0] || '';
  const base = (sign ? text.slice(1) : text).trim();
  if (/^(?:\\infty|∞)$/.test(base)) return { base, sign, kind: 'infinity' };
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(base)) return { base, sign, kind: 'number' };
  const variable = base.match(/^([A-Za-z]{1,8}|\\[A-Za-z]+)(?:\s*[_^]\s*(?:\{\s*(?:[A-Za-z0-9]+|\\[A-Za-z]+)\s*\}|[A-Za-z0-9]))?$/);
  if (variable && (!variable[1].startsWith('\\') || symbols.has(variable[1].slice(1)))) return { base, sign, kind: 'variable' };
  // An accent may label another short variable, but never turn a compound expression into an endpoint atom.
  const accent = base.match(/^\\(?:bar|overline|underline|hat|widehat|tilde|widetilde|vec|dot|ddot)\b\s*/);
  if (accent) {
    let argument = base.slice(accent[0].length).trim(), suffix = '';
    if (argument.startsWith('{')) {
      let level = 0, end = -1;
      for (let i = 0; i < argument.length; i++) {
        if (argument[i] === '{') level++;
        else if (argument[i] === '}' && --level === 0) { end = i; break; }
      }
      if (end < 0) return null;
      suffix = argument.slice(end + 1).trim(); argument = argument.slice(1, end).trim();
    }
    const inner = atom(argument, depth + 1), indexed = /^[_^]/.test(suffix) ? atom('x' + suffix, depth + 1) : null;
    if (inner?.kind === 'variable' && !inner.sign && (!suffix || indexed?.kind === 'variable')) return { base, sign, kind: 'variable' };
  }
  return null;
}
function members(source) {
  const result = [], stack = []; let start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if ('([{'.includes(char)) stack.push(char);
    else if (')]}'.includes(char) && stack.pop() !== ({ ')': '(', ']': '[', '}': '{' })[char]) return null;
    else if (char === ',' && !stack.length) { result.push(source.slice(start, i)); start = i + 1; }
  }
  if (stack.length) return null;
  result.push(source.slice(start)); return result;
}
function bracketMathSpeech(value, { zh, brief, context, rangeOnly = false, literalSets = false }, render) {
  let text = value.replace(/\\(?:left|right)\b/g, '').trim();
  const speak = entry => {
    const base = entry.kind === 'infinity' ? (zh ? '无穷' : 'infinity') : render(entry.base);
    if (!base || /^(?:Formula\.|公式。)$/.test(base)) return null;
    return (entry.sign ? (zh ? entry.sign === '+' ? '正' : '负' : entry.sign === '+' ? 'plus ' : 'minus ') : '') + base;
  };
  let prefix = '', membership = false;
  const relation = text.match(/^(.+?)\s*(\\notin\b|\\in\b|=)\s*(.+)$/);
  if (relation) {
    const subject = atom(relation[1]);
    if (!subject || subject.kind !== 'variable' || subject.sign) return null;
    const spoken = speak(subject); if (!spoken) return null;
    membership = relation[2] !== '=';
    prefix = spoken + (relation[2] === '=' ? (zh ? ' 等于 ' : ' equals ')
      : relation[2] === '\\in' ? (zh ? ' 属于 ' : ' belongs to ')
        : (zh ? ' 不属于 ' : ' does not belong to '));
    text = relation[3].trim();
  }
  const set = text.match(/^\\\{([\s\S]*)\\\}$/) || text.match(/^\\lbrace\b([\s\S]*)\\rbrace$/)
    || (literalSets && text.match(/^\{([\s\S]*)\}$/));
  if (set) {
    if (!set[1].trim()) return prefix + (zh ? '空集' : 'the empty set');
    const values = members(set[1]);
    if (!values || values.length > 3) return null;
    const entries = values.map(value => atom(value));
    if (entries.some(entry => !entry || entry.kind === 'infinity')) return null;
    const spoken = entries.map(speak); if (spoken.some(entry => !entry)) return null;
    const list = zh ? spoken.join('、') : spoken.length === 1 ? spoken[0] : spoken.slice(0, -1).join(', ') + ' and ' + spoken.at(-1);
    return prefix + (zh ? (brief ? '集合 ' + list : '包含 ' + list + ' 的集合') : (brief ? 'the set ' + list : 'the set containing ' + list));
  }
  // New interval forms need explicit membership or prose; a comma pair alone is ambiguous.
  const pair = text.match(/^([[(])([\s\S]*)([\])])$/);
  if (pair && (membership || context === 'interval')) {
    const values = members(pair[2]);
    if (!values || values.length !== 2) return null;
    const entries = values.map(value => atom(value)); if (entries.some(entry => !entry)) return null;
    const [lower, upper] = entries, left = pair[1] === '[', right = pair[3] === ']';
    if ((lower.kind === 'infinity' && (lower.sign !== '-' && lower.sign !== '−' || left))
      || (upper.kind === 'infinity' && (upper.sign === '-' || upper.sign === '−' || right))) return null;
    const spoken = entries.map(speak); if (spoken.some(entry => !entry)) return null;
    const range = spoken.join(zh ? ' 到 ' : ' to ');
    const lead = prefix && !zh ? prefix + 'the ' : prefix;
    const kind = left && right ? ['闭区间', 'closed interval'] : !left && !right ? ['开区间', 'open interval']
      : left ? ['左闭右开区间', 'left-closed, right-open interval'] : ['左开右闭区间', 'left-open, right-closed interval'];
    if (!brief) return lead + kind[zh ? 0 : 1] + (zh ? '，' : ', ') + range;
    if (rangeOnly) return prefix + range;
    if (!prefix && upper.kind === 'infinity' && lower.kind !== 'infinity') return zh ? (left ? spoken[0] + ' 及以上' : '大于 ' + spoken[0]) : (left ? spoken[0] + ' and above' : 'greater than ' + spoken[0]);
    if (!prefix && lower.kind === 'infinity' && upper.kind !== 'infinity') return zh ? (right ? '不超过 ' : '小于 ') + spoken[1] : (right ? 'at most ' : 'less than ') + spoken[1];
    if (left && right) return lead + (prefix && !zh ? 'interval from ' : '') + range + (prefix && zh ? ' 的区间' : '');
    if (!left && !right) return lead + (zh ? range + ' 的开区间' : 'open interval, ' + range);
    return lead + (prefix && !zh ? 'interval from ' : '') + range + (zh ? `，${left ? '含' : '不含'} ${spoken[0]}，${right ? '含' : '不含'} ${spoken[1]}`
      : `, ${left ? 'including' : 'excluding'} ${spoken[0]}, ${right ? 'including' : 'excluding'} ${spoken[1]}`);
  }
  if (prefix) return null;
  const wrapped = text.match(/^\(([^()]+)\)$/), single = atom(wrapped ? wrapped[1] : text);
  if (!single || (!wrapped && !single.sign) || single.kind === 'infinity') return null;
  const spoken = speak(single); if (!spoken) return null;
  return wrapped && !brief ? (zh ? `左括号 ${spoken} 右括号` : `open parenthesis ${spoken} close parenthesis`) : spoken;
}
// Simplify complete, bounded expressions only; never remove arbitrary grouping in prose.
function conciseBracketSpeech(value, zh, render, functionStyle = 'of') {
  const text = value.replace(/\\(?:left|right)\b/g, '').trim();
  const speak = raw => {
    const entry = atom(raw);
    if (!entry || entry.kind === 'infinity') return null;
    const spoken = render(entry.base);
    if (!spoken || /^(?:Formula\.|公式。)$/.test(spoken)) return null;
    return (entry.sign ? (zh ? entry.sign === '+' ? '正' : '负' : entry.sign === '+' ? 'plus ' : 'minus ') : '') + spoken;
  };
  const memberSpeech = raw => {
    const spoken = speak(raw); if (spoken) return spoken;
    const text = raw.trim(), calls = simpleFunctionCalls(text);
    if (calls.length !== 1 || calls[0].start !== 0 || calls[0].end !== text.length) return null;
    const name = render(calls[0].name), argument = render(calls[0].argument);
    return name && argument && !/^(?:Formula\.|公式。)$/.test(name) && !/^(?:Formula\.|公式。)$/.test(argument)
      ? simpleFunctionSpeech(name, argument, functionStyle) : null;
  };
  const list = (source, calls = false) => {
    const parts = members(source);
    if (!parts || parts.length < 2 || parts.length > 3) return null;
    const spoken = parts.map(calls ? memberSpeech : speak);
    return spoken.every(Boolean) ? spoken.join(zh ? '、' : ', ') : null;
  };
  let body = text, prefix = '';
  const assignment = text.match(/^([^=]+)=([^=]+)$/);
  if (assignment) {
    const subject = speak(assignment[1]);
    if (!subject) return null;
    prefix = subject + (zh ? ' 等于 ' : ' equals '); body = assignment[2].trim();
  }
  const pair = body.match(/^\(([\s\S]*)\)$/) || body.match(/^\[([\s\S]*)\]$/);
  if (pair) {
    const spoken = list(pair[1], true);
    if (spoken) return prefix + spoken;
  }
  const { at: variableAt, space } = shortMathVariableParser(body), head = variableAt(0);
  const open = head ? space(head.end) : -1, rest = body.slice(open);
  if (head && (/^\([^()[\]]+\)$/.test(rest) || /^\[[^()[\]]+\]$/.test(rest))) {
    const name = render(body.slice(0, head.end)), inner = rest.slice(1, -1);
    if (name && !/^(?:Formula\.|公式。)$/.test(name)) {
      if (rest[0] === '[') {
        const argument = speak(inner);
        if (argument) return prefix + simpleFunctionSpeech(name, argument, functionStyle);
      } else {
        const args = list(inner);
        if (args) return prefix + name + (zh ? '，参数为 ' : ' with arguments ') + args;
      }
    }
  }
  const group = body.match(/^(.*?)\(([^()\[\]]+)\)(.*?)$/);
  if (!group) return null;
  const sum = group[2].match(/^(.+?)([+−-])(.+)$/);
  if (!sum) return null;
  const first = speak(sum[1]), second = speak(sum[3]);
  if (!first || !second) return null;
  const spoken = zh ? `${first} 与 ${second} 的${sum[2] === '+' ? '和' : '差'}`
    : `the ${sum[2] === '+' ? 'sum' : 'difference'} of ${first} and ${second}`;
  const before = group[1].trim(), after = group[3].trim();
  // An isolated PDF run may be followed by a factor outside its font run. Keep its boundary explicit.
  if (!before && !after) return null;
  if (!before && /^\^\s*(?:[23]|\{[23]\})$/.test(after)) {
    const squared = after.includes('2');
    return prefix + spoken + (zh ? squared ? '的平方' : '的立方' : squared ? ', squared' : ', cubed');
  }
  if (!before) {
    const factor = speak(after.replace(/^(?:\*|\\times\b|\\cdot\b)\s*/, ''));
    if (factor) return prefix + spoken + (zh ? '，乘以 ' : ', times ') + factor;
  }
  // f(a+b) may be a function, not multiplication. Only an explicit operator or number is unambiguous here.
  if (!after && (/(?:\*|\\times|\\cdot)\s*$/.test(before) || /^\d+(?:\.\d+)?$/.test(before))) {
    const factor = speak(before.replace(/\s*(?:\*|\\times|\\cdot)\s*$/, ''));
    if (factor) return prefix + factor + (zh ? ' 乘以 ' : ' times ') + spoken;
  }
  return null;
}
module.exports = { intervalProse, bracketMathSpeech, conciseBracketSpeech };
