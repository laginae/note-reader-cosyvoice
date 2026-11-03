'use strict';
const { greekNames } = require('./math-symbols');

const variable = '(?:[A-Za-z]|\\\\(?:' + [...new Set(Object.values(greekNames)), 'ell'].join('|') + '))';
const index = '(?:[A-Za-z0-9]|\\{\\s*(?:[A-Za-z0-9]{1,8}|' + variable + ')\\s*\\})';
const scripted = variable + '(?:\\s*_\\s*' + index + ')?';
const accented = '\\\\(?:bar|overline|hat|tilde|vec|dot|ddot)\\s*(?:' + variable + '|\\{\\s*' + scripted + '\\s*\\})';
const shortAtom = new RegExp('^(?:\\d+(?:\\.\\d+)?|\\.\\d+|(?:' + variable + '|' + accented
  + ')(?:\\s*_\\s*' + index + ')?(?:\\s*\\^\\s*(?:[23]|\\{[23]\\}))?)$');

function groupEnd(text, start) {
  const stack = [], closes = { ')': '(', '}': '{', ']': '[' };
  for (let i = start; i < text.length; i++) {
    if ('({['.includes(text[i])) stack.push(text[i]);
    else if (Object.hasOwn(closes, text[i])) {
      if (stack.pop() !== closes[text[i]]) return -1;
      if (!stack.length) return i + 1;
    }
  }
  return -1;
}

// Return only top-level operators; a subscript's sign is not an arithmetic boundary.
function operators(text, accepted) {
  const positions = [];
  for (let i = 0; i < text.length; i++) {
    if ('({['.includes(text[i])) {
      const end = groupEnd(text, i);
      if (end < 0) return null;
      i = end - 1;
    } else if (')}]'.includes(text[i])) return null;
    else if (accepted.includes(text[i]) && text.slice(0, i).trim()) positions.push(i);
  }
  return positions;
}

// A deliberately small grammar: one quotient of atoms or two-term sums/differences.
// Unknown functions, nested arithmetic and ambiguous implicit products fall back unchanged.
function conciseFractionSpeech(value, zh, render) {
  if (!value.includes('/') && !/\\(?:frac|dfrac|tfrac)\b/.test(value)) return null;
  const text = value.replace(/\\(?:left|right)\b/g, '').trim();
  if (text.length > 256) return null;
  const fraction = text.match(/^\\(?:frac|dfrac|tfrac)\b\s*/);
  let numerator, denominator;
  if (fraction) {
    const start = fraction[0].length;
    if (text[start] !== '{') return null;
    const end = groupEnd(text, start);
    if (end < 0) return null;
    numerator = text.slice(start + 1, end - 1);
    const rest = text.slice(end).trim();
    if (rest[0] !== '{' || groupEnd(rest, 0) !== rest.length) return null;
    denominator = rest.slice(1, -1);
  } else {
    const slashes = operators(text, '/');
    if (!slashes || slashes.length !== 1) return null;
    numerator = text.slice(0, slashes[0]); denominator = text.slice(slashes[0] + 1);
  }
  const speakAtom = raw => {
    const text = raw.trim(), sign = text.match(/^[+−-]/)?.[0] || '';
    const base = (sign ? text.slice(1) : text).trim();
    if (!shortAtom.test(base)) return null;
    const spoken = render(base);
    if (!spoken || /^(?:Formula\.|公式。)$/.test(spoken)) return null;
    return (sign ? (zh ? sign === '+' ? '正' : '负' : sign === '+' ? 'plus ' : 'minus ') : '') + spoken;
  };
  const operand = raw => {
    let body = raw.trim();
    const wrapped = /^[({]/.test(body) && groupEnd(body, 0) === body.length;
    if (wrapped) body = body.slice(1, -1).trim();
    const atom = speakAtom(body);
    if (atom) return { text: atom, compound: false };
    if (!wrapped && !fraction) return null;
    const signs = operators(body, '+−-');
    if (!signs || signs.length !== 1) return null;
    const position = signs[0], first = speakAtom(body.slice(0, position)), second = speakAtom(body.slice(position + 1));
    if (!first || !second) return null;
    const sum = body[position] === '+';
    return { compound: true, text: zh ? `${first} ${sum ? '加' : '减'} ${second} 的${sum ? '和' : '差'}`
      : `the ${sum ? 'sum' : 'difference'} of ${first} and ${second}` };
  };
  const top = operand(numerator), bottom = operand(denominator);
  if (!top || !bottom) return null;
  // Keep familiar numeric fractions such as one-half in their existing form.
  if (fraction && !top.compound && !bottom.compound) return null;
  return top.text + (zh ? ' 除以 ' : top.compound ? ', divided by ' : ' divided by ') + bottom.text;
}

module.exports = { conciseFractionSpeech };
