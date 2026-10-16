'use strict';

// A bounded grammar for short extrema/rounding expressions, never an evaluator.
function structuredMathSpeech(input, chinese = false, smart = false) {
  const source = String(input).normalize('NFKC').replace(/\\(?:left|right)\b/g, '')
    .replace(/\\[{}]/g, c => c.slice(1)).replace(/\\(?:,|;|!|quad\b|qquad\b)/g, ' ')
    .replace(/\\(min|max)\b/g, '$1').replace(/\\lceil\b/g, '⌈').replace(/\\rceil\b/g, '⌉')
    .replace(/\\lfloor\b/g, '⌊').replace(/\\rfloor\b/g, '⌋')
    .replace(/\\(?:varepsilon|epsilon)\b|[εϵ]/g, ' epsilon ').replace(/−/g, '-');
  if (source.length > 180 || !/^\s*(?:min|max|[⌈⌊])/.test(source)) return null;
  const tokens = source.match(/min|max|epsilon|\d+(?:\.\d+)?|[A-Za-z]|[{}()⌈⌉⌊⌋,+*\/-]/g) || [];
  if (tokens.length > 64 || tokens.join('') !== source.replace(/\s/g, '')) return null;
  let index = 0, depth = 0;
  const peek = () => tokens[index];
  const take = expected => { if (tokens[index++] !== expected) throw new Error('syntax'); };
  function atom() {
    if (++depth > 8) throw new Error('depth');
    const token = tokens[index++];
    let node;
    if (token === 'min' || token === 'max') {
      const open = tokens[index++];
      if (open !== '(' && open !== '{') throw new Error('delimiter');
      const left = sum(); take(','); const right = sum(); take(open === '(' ? ')' : '}');
      node = { kind: token, left, right };
    } else if (token === '(' || token === '{' || token === '⌈' || token === '⌊') {
      const child = sum(); take(({ '(':')', '{':'}', '⌈':'⌉', '⌊':'⌋' })[token]);
      node = { kind: token === '⌈' ? 'ceil' : token === '⌊' ? 'floor' : 'group', child };
    } else if (token === '-' || token === '+') node = { kind: token === '-' ? 'negative' : 'positive', child: atom() };
    else if (/^(?:[A-Za-z]|epsilon|\d+(?:\.\d+)?)$/.test(token || '')) node = { kind:'value', value:token };
    else throw new Error('atom');
    depth--; return node;
  }
  function product() {
    let node = atom();
    while (peek() === '*' || peek() === '/' || peek() === '(' || peek() === '⌈' || peek() === '⌊') {
      const op = peek() === '*' || peek() === '/' ? tokens[index++] : '*';
      node = { kind:op, left:node, right:atom() };
    }
    return node;
  }
  function sum() {
    let node = product();
    while (peek() === '+' || peek() === '-') { const kind = tokens[index++]; node = {kind,left:node,right:product()}; }
    return node;
  }
  function speak(node) {
    const group = value => chinese ? `括号 ${value} 括号结束` : `open parenthesis ${value} close parenthesis`;
    const operand = child => ['min','max','ceil','floor'].includes(child.kind) ? group(speak(child)) : speak(child);
    if (node.kind === 'value') return node.value;
    if (node.kind === 'group') return group(speak(node.child));
    if (node.kind === 'ceil' || node.kind === 'floor') return chinese
      ? `对 ${speak(node.child)} ${node.kind === 'ceil' ? '向上' : '向下'}取整`
      : `the ${node.kind === 'ceil' ? 'ceiling' : 'floor'} of ${speak(node.child)}`;
    if (node.kind === 'negative' || node.kind === 'positive') return (chinese ? node.kind === 'negative' ? '负 ' : '正 ' : node.kind === 'negative' ? 'negative ' : 'positive ') + speak(node.child);
    if (node.kind === 'min' || node.kind === 'max') {
      const left = speak(node.left), right = speak(node.right);
      return chinese ? `${left} 与 ${right}，两者中的${node.kind === 'min' ? '较小' : '较大'}值` : `the ${node.kind === 'min' ? 'minimum' : 'maximum'} of ${left} and ${right}`;
    }
    const left = operand(node.left), right = operand(node.right);
    return `${left} ${({'+' : chinese ? '加' : 'plus', '-':chinese ? '减' : 'minus', '*':chinese ? '乘以' : 'times', '/':chinese ? '除以' : 'divided by'})[node.kind]} ${right}`;
  }
  function complexity(node, nesting = 0) {
    const functional = ['min','max','ceil','floor'].includes(node.kind);
    const level = nesting + Number(functional);
    const children = [node.left,node.right,node.child].filter(Boolean).map(child => complexity(child, level));
    return { nesting: Math.max(level, ...children.map(child => child.nesting)),
      operations: Number(!['value','group'].includes(node.kind)) + children.reduce((total, child) => total + child.operations, 0) };
  }
  try {
    const tree = sum();
    if (index !== tokens.length) return null;
    const cost = complexity(tree);
    if (smart && (cost.nesting > 1 || cost.operations > 2 || tokens.length > 20)) return null;
    return speak(tree);
  } catch (_) { return null; }
}

function replacePlainStructuredMath(text, render) {
  const source = String(text), pairs = {')':'(', '}':'{', '⌉':'⌈', '⌋':'⌊'};
  let result = '', end = 0;
  for (const match of source.matchAll(/\b(?:min|max)\s*[{(]/g)) {
    if (match.index < end) continue;
    const stack = [];
    for (let i = match.index + match[0].length - 1; i < Math.min(source.length, match.index + 180); i++) {
      const c = source[i];
      if ('({⌈⌊'.includes(c)) stack.push(c);
      else if (')}⌉⌋'.includes(c)) {
        if (stack.pop() !== pairs[c]) break;
        if (!stack.length) {
          const formula = source.slice(match.index, i + 1);
          const before = result + source.slice(end, match.index);
          const spoken = render(formula, { before, after: source.slice(i + 1) });
          result = spoken && typeof spoken === 'object' ? spoken.text : before + (spoken ?? formula);
          end = i + 1 + (spoken && typeof spoken === 'object' ? spoken.consumed : 0); break;
        }
      }
    }
  }
  return result + source.slice(end);
}
module.exports = { structuredMathSpeech, replacePlainStructuredMath };
