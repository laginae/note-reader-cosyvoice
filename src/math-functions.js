'use strict';
const { shortMathVariableParser } = require('./math-variable-labels');

// Bounded single-argument calls only. Compact uppercase labels retain their letters; no product is inferred.
function simpleFunctionCalls(value) {
  const source = String(value);
  if (source.length > 4096 || !source.includes('(')) return [];
  const calls = [], { at: variableAt, space } = shortMathVariableParser(source);
  for (let i = 0; i < source.length;) {
    const start = space(i);
    let head = !/[A-Za-z0-9\\_^]/.test(source[start - 1] || '') ? variableAt(start) : null;
    if (!head && /^[A-Z]{2}(?![A-Za-z])/.test(source.slice(start)) && !/[A-Za-z0-9\\_^]/.test(source[start - 1] || '')) {
      head = variableAt(start + 1);
    }
    const open = head ? space(head.end) : -1;
    if (source[open] === '(') {
      const argumentStart = space(open + 1), variable = variableAt(argumentStart);
      const number = source.slice(argumentStart).match(/^[+−-]?\s*(?:\d+(?:\.\d+)?|\.\d+)/);
      const argumentEnd = variable?.end ?? (number ? argumentStart + number[0].length : -1);
      const close = argumentEnd >= 0 ? space(argumentEnd) : -1;
      if (source[close] === ')') {
        calls.push({ start, end: close + 1, name: source.slice(start, head.end),
          argument: source.slice(argumentStart, argumentEnd), scripted: head.tail.includes('_') });
        i = close + 1; continue;
      }
    }
    const token = source.slice(start).match(/^\\[A-Za-z]+|^[A-Za-z]{2,}/)?.[0];
    i = head?.end ?? start + (token?.length || 1);
  }
  return calls;
}

function speakSimpleFunctions(value, render) {
  let result = '', offset = 0;
  for (const call of simpleFunctionCalls(value)) {
    result += value.slice(offset, call.start) + render(call.name, call.argument);
    offset = call.end;
  }
  return result + value.slice(offset);
}

function simpleFunctionSpeech(name, argument, style = 'of') {
  return `${name}${style === 'compact' ? ' ' : ' of '}${argument}`;
}

module.exports = { simpleFunctionCalls, speakSimpleFunctions, simpleFunctionSpeech };
