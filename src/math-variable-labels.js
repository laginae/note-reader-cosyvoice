'use strict';

const { greekNames } = require('./math-symbols');
const variableCommands = new Set([...Object.values(greekNames), 'ell']);
const accents = { hat: 'hat', widehat: 'hat', bar: 'bar', overline: 'bar', tilde: 'tilde', widetilde: 'tilde', dot: 'dot', ddot: 'double dot', vec: 'vector' };

// This grammar only labels short variables; it never evaluates or simplifies an expression.
function conciseMathLabels(input, chinese = false) {
  const source = String(input);
  if (source.length > 4096) return { text: source, changed: false };
  const space = index => { while (/\s/.test(source[index] || '') && index < source.length) index++; return index; };
  function groupEnd(start) {
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}' && --depth === 0) return i + 1;
    }
    return -1;
  }
  function indexAt(start) {
    if (source[start] !== '_') return null;
    let i = space(start + 1), end, inner;
    if (source[i] === '{') {
      end = groupEnd(i);
      if (end < 0) return null;
      inner = source.slice(i + 1, end - 1).trim();
    } else {
      const match = source.slice(i).match(/^(?:\\[A-Za-z]+|[A-Za-z0-9])/);
      if (!match) return null;
      inner = match[0]; end = i + match[0].length;
    }
    const commands = inner.match(/\\([A-Za-z]+)/g) || [];
    if (inner.length > 32 || commands.some(command => !variableCommands.has(command.slice(1)))) return null;
    const plain = inner.replace(/\\[A-Za-z]+/g, 'v');
    if (!/^[A-Za-z0-9]+(?:\s*[+−-]\s*[A-Za-z0-9]+)?(?:\s*,\s*[A-Za-z0-9]+(?:\s*[+−-]\s*[A-Za-z0-9]+)?)*$/.test(plain)) return null;
    return { end, raw: source.slice(start, end) };
  }
  function labelAt(start) {
    if (source[start] === "'" || source[start] === '′' || source[start] === '″') {
      const match = source.slice(start).match(/^[′″'](?:\s*[′″'])*/)[0];
      const count = [...match.replace(/\s/g, '')].reduce((total, mark) => total + (mark === '″' ? 2 : 1), 0);
      return count <= 2 ? { end: start + match.length, label: count === 1 ? 'prime' : 'double prime' } : null;
    }
    if (source[start] !== '^') return null;
    let i = space(start + 1), end, symbol;
    if (source[i] === '{') {
      end = groupEnd(i);
      if (end < 0) return null;
      symbol = source.slice(i + 1, end - 1).replace(/\s/g, '');
    } else {
      const match = source.slice(i).match(/^(?:\\[A-Za-z]+|[*∗⋆⊤′″'])/);
      if (!match) return null;
      symbol = match[0]; end = i + match[0].length;
    }
    const label = ({ '\\prime': 'prime', '\\prime\\prime': 'double prime', "'": 'prime', "''": 'double prime', '′': 'prime', '′′': 'double prime', '″': 'double prime',
      '\\ast': 'star', '\\star': 'star', '*': 'star', '∗': 'star', '⋆': 'star', '\\top': chinese ? '转置' : 'transpose', '⊤': chinese ? '转置' : 'transpose' })[symbol];
    return label ? { end, label } : null;
  }
  function atomAt(start, depth) {
    if (depth > 3) return null;
    const i = space(start);
    if (source[i] === '{') {
      const end = groupEnd(i);
      if (end < 0) return null;
      const inner = variableAt(i + 1, depth + 1);
      return inner && space(inner.end) === end - 1 ? { ...inner, end } : null;
    }
    if (source[i] === '\\') {
      const command = source.slice(i).match(/^\\([A-Za-z]+)/);
      if (!command) return null;
      const name = command[1];
      if (variableCommands.has(name)) return { head: command[0], tail: '', end: i + command[0].length, changed: false };
      if (!Object.hasOwn(accents, name)) return null;
      const inner = atomAt(i + command[0].length, depth + 1);
      if (!inner) return null;
      const head = name === 'vec' ? `${chinese ? '向量' : 'vector'} ${inner.head}` : `${inner.head} ${accents[name]}`;
      return { ...inner, head, changed: true };
    }
    if (/[A-Za-z]/.test(source[i] || '') && !/[A-Za-z]/.test(source[i + 1] || '')) {
      return { head: source[i], tail: '', end: i + 1, changed: false };
    }
    return null;
  }
  function variableAt(start, depth = 0) {
    const atom = atomAt(start, depth);
    if (!atom) return null;
    let i = atom.end, tail = atom.tail, indexed = /_/.test(tail), powered = false, changed = atom.changed;
    for (let pass = 0; pass < 4; pass++) {
      const next = space(i);
      if (source[next] === '_' && !indexed) {
        const index = indexAt(next);
        if (!index) break;
        tail += ' ' + index.raw; indexed = true; i = index.end;
      } else {
        if (source[next] === '^' && powered) break;
        const label = labelAt(next);
        if (!label) break;
        tail += ' ' + label.label; changed = true; powered ||= source[next] === '^'; i = label.end;
      }
    }
    return { ...atom, tail, end: i, changed };
  }
  let result = '', changed = false;
  for (let i = 0; i < source.length;) {
    const atom = !/[A-Za-z\\]/.test(source[i - 1] || '') ? variableAt(i) : null;
    if (atom) {
      const start = space(i), spoken = atom.head + atom.tail;
      result += atom.changed ? source.slice(i, start) + (source[start] === '{' ? `{${spoken}}` : spoken) : source.slice(i, atom.end);
      changed ||= atom.changed; i = atom.end;
    } else {
      const command = source.slice(i).match(/^\\[A-Za-z]+|^[A-Za-z]{2,}/);
      const raw = command?.[0] || source[i]; result += raw; i += raw.length;
    }
  }
  return { text: result, changed };
}

module.exports = { conciseMathLabels };
