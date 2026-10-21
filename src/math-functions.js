'use strict';

// Bounded single-argument calls only. Compound arguments keep explicit brackets.
function simpleFunctionCalls(value) {
  return [...value.matchAll(/(^|[^A-Za-z\\])((?:\\[A-Za-z]+|[A-Za-z])(?:\s*_\s*(?:\{(?:[A-Za-z0-9]+|\\[A-Za-z]+)\}|[A-Za-z0-9]|\\[A-Za-z]+))?)\s*\(\s*([A-Za-z]|\d+|\\[A-Za-z]+)\s*\)/g)]
    .map(match => ({ start: match.index + match[1].length, end: match.index + match[0].length,
      name: match[2], argument: match[3], scripted: match[2].includes('_') }));
}

function speakSimpleFunctions(value, render) {
  let result = '', offset = 0;
  for (const call of simpleFunctionCalls(value)) {
    result += value.slice(offset, call.start) + render(call.name, call.argument);
    offset = call.end;
  }
  return result + value.slice(offset);
}

module.exports = { simpleFunctionCalls, speakSimpleFunctions };
