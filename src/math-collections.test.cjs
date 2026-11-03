'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mathSpeech, academicLatex, contextualMathOptions, academicOptions } = require('./academic-speech');
const { intervalProse } = require('./math-collections');
const zh = { mathReadingLanguage:'chinese' };

test('interval prose enables ranges while concise ambiguous pairs use neutral pauses', () => {
  for (const pair of ['[a,b]', '(a,b)', '[a,b)', '(a,b]', '[x,y]']) {
    if (['[a,b)', '(a,b]'].includes(pair)) assert.match(mathSpeech(pair), /open (?:bracket|parenthesis)/, pair);
    else assert.equal(mathSpeech(pair), pair === '[x,y]' ? 'x, y' : 'a, b', pair);
    assert.match(mathSpeech(pair, {academicMathStyle:'verbose'}), /open (?:bracket|parenthesis)/, pair);
  }
  assert.match(academicLatex('区间为 $[a,b]$。'), /a 到 b/);
  assert.doesNotMatch(academicLatex('区间为 $[a,b]$。'), /括号/);
  assert.match(academicLatex('The interval $[a,b]$ is used.'), /a to b/);
  assert.match(academicLatex('范围为 $[a,b]$。'), /a 到 b/);
  assert.match(academicLatex('$[a,b]$ is a closed interval.'), /a to b/);
});
test('interval rendering preserves open and half-open endpoint membership in both styles', () => {
  const context = { ...zh, mathIntervalContext:'interval' };
  for (const [source, concise, verbose] of [
    ['[a,b]', 'a 到 b', '闭区间，a 到 b'],
    ['(a,b)', 'a 到 b 的开区间', '开区间，a 到 b'],
    ['[a,b)', 'a 到 b，含 a，不含 b', '左闭右开区间，a 到 b'],
    ['(a,b]', 'a 到 b，不含 a，含 b', '左开右闭区间，a 到 b'],
  ]) {
    assert.equal(mathSpeech(source,context), concise);
    assert.equal(mathSpeech(source,{...context,academicMathStyle:'verbose'}), verbose);
  }
  assert.equal(mathSpeech('(a,b)', {mathIntervalContext:'interval'}), 'open interval, a to b');
  assert.equal(mathSpeech('[a,b)', {mathIntervalContext:'interval'}), 'a to b, including a, excluding b');
});
test('explicit membership and interval assignment work without guessing ordinary vector assignments', () => {
  assert.equal(mathSpeech(String.raw`x\in[a,b]`, zh), 'x 属于 a 到 b 的区间');
  assert.equal(mathSpeech('x∈(a,b)', zh), 'x 属于 a 到 b 的开区间');
  assert.equal(mathSpeech('x∉[a,b]', zh), 'x 不属于 a 到 b 的区间');
  assert.equal(mathSpeech(String.raw`x\in[a,b]`), 'x belongs to the interval from a to b');
  assert.match(academicLatex('区间为 $I=[a,b]$。'), /I 等于 a 到 b 的区间/);
  for (const source of ['v=[a,b]', 'P=(a,b)', 'f(a,b)', '[a,b,c]']) {
    assert.doesNotMatch(mathSpeech(source), /bracket|parenthesis|interval|\bto\b/);
    assert.match(mathSpeech(source, {academicMathStyle:'verbose'}), /open (?:bracket|parenthesis)/);
  }
});
test('unary interval signs and infinity remain natural without claiming infinity is included', () => {
  const context = { ...zh, mathIntervalContext:'interval' };
  assert.equal(mathSpeech('[-1,1)', context), '负1 到 1，含 负1，不含 1');
  assert.equal(mathSpeech('[+1,2]', context), '正1 到 2');
  assert.equal(mathSpeech(String.raw`[0,+\infty)`, context), '0 及以上');
  assert.equal(mathSpeech('(-∞,b]', context), '不超过 b');
  assert.equal(mathSpeech('(-∞,b)', context), '小于 b');
  assert.equal(mathSpeech(String.raw`(0,\infty)`, {mathIntervalContext:'interval'}), 'greater than 0');
  assert.equal(mathSpeech(String.raw`[0,\infty)`, {...context,academicMathStyle:'verbose'}), '左闭右开区间，0 到 无穷');
  for (const source of [String.raw`[0,\infty]`, String.raw`[-\infty,1)`, String.raw`(+\infty,b]`]) assert.match(mathSpeech(source,context), /括号/);
});
test('coordinates, vectors, inner products and old interval sentences do not supply new interval context', () => {
  for (const source of [
    '坐标为 $(a,b)$。', '向量为 $[a,b]$。', 'The point $(a,b)$ is shown.',
    'The vector $[0,1]$ is normalized.', 'The inner product $(a,b)$ is used.',
    'The interval is used. The expression $(a,b)$ follows.',
    'The interval has midpoint $(a,b)$.', '区间已经确定。另一个表达是 $(a,b)$。',
    '区间取值在别处讨论，向量为 $[a,b]$。', '$[a,b]$ denotes a vector.',
  ]) {
    assert.doesNotMatch(academicLatex(source), /括号|open (?:bracket|parenthesis)|a to b|a 到 b|0 to 1/, source);
    assert.match(academicLatex(source, {academicMathStyle:'verbose'}), /括号|open (?:bracket|parenthesis)/, source);
  }
  assert.equal(intervalProse('The interval ', ''), 'interval');
  assert.equal(intervalProse('The vector ', ''), 'literal');
  assert.equal(intervalProse('interval '.repeat(10000) + 'an unrelated expression ', ''), undefined);
  assert.equal(contextualMathOptions({mathIntervalContext:'interval'}, 'An expression ', '').mathIntervalContext, undefined);
  assert.deepEqual(academicOptions({mathIntervalContext:'interval'}), academicOptions());
});
test('literal small sets use member labels, never range language or bare grouping braces', () => {
  assert.equal(mathSpeech(String.raw`\{a,b\}`, zh), '集合 a、b');
  assert.equal(mathSpeech(String.raw`\left\{a,b,c\right\}`), 'the set a, b and c');
  assert.equal(mathSpeech(String.raw`\lbrace a,b\rbrace`, {...zh,academicMathStyle:'verbose'}), '包含 a、b 的集合');
  assert.equal(mathSpeech(String.raw`x\in\{a,b\}`, zh), 'x 属于 集合 a、b');
  assert.equal(mathSpeech(String.raw`\{-1,0,+1\}`, zh), '集合 负1、0、正1');
  assert.equal(mathSpeech(String.raw`\{\}`, zh), '空集');
  assert.equal(mathSpeech('{a,b}', zh), 'a,b');
  assert.equal(mathSpeech('{a,b}', {...zh,literalMathSets:true}), '集合 a、b');
});
test('concise arithmetic keeps grouping in natural language and full mode keeps brackets', () => {
  assert.equal(mathSpeech('(x)', zh), 'x');
  assert.equal(mathSpeech('(-2)', zh), '负2');
  assert.equal(mathSpeech('-2', zh), '负2');
  assert.equal(mathSpeech('(x)', {...zh,academicMathStyle:'verbose'}), '左括号 x 右括号');
  assert.equal(mathSpeech('(-2)', {...zh,academicMathStyle:'verbose'}), '左括号 负2 右括号');
  for (const source of ['(a+b)c','(a+b)^2','f(a,b)','(a,b)']) assert.match(mathSpeech(source,{academicMathStyle:'verbose'}),/open parenthesis/);
  assert.equal(mathSpeech('(a+b)c', zh), 'a 与 b 的和，乘以 c');
  assert.equal(mathSpeech('(a+b)c'), 'the sum of a and b, times c');
  assert.equal(mathSpeech('c*(a-b)', zh), 'c 乘以 a 与 b 的差');
  assert.equal(mathSpeech('(a-b)^2', zh), 'a 与 b 的差的平方');
  assert.equal(mathSpeech('(a,b)', zh), 'a、b');
  assert.equal(mathSpeech('P=(a,b)', zh), 'P 等于 a、b');
  assert.equal(mathSpeech('f(a,b)', zh), 'f，参数为 a、b');
  assert.equal(mathSpeech('[x_i,y_j]', zh), 'x i、y j');
  assert.match(mathSpeech('f(a+b)'), /open parenthesis/);
  assert.equal(mathSpeech('(a+b)/c'), 'the sum of a and b, divided by c');
  assert.match(mathSpeech('(a+b)/c', { academicMathStyle: 'verbose' }), /open parenthesis/);
  assert.equal(mathSpeech('a-b', zh), 'a 减 b');
});

test('frequent nested brackets remain skipped in smart mode instead of silently losing precedence', () => {
  for (const source of ['((a+b)c+d)e', '(a+b)(c+d)(x+y)', String.raw`\frac{(a+b)c}{(x+y)z}`]) {
    assert.equal(mathSpeech(source), 'Formula.', source);
    assert.equal(mathSpeech(source, {...zh,academicSkipNotice:false}), '', source);
    assert.match(mathSpeech(source,{academicMathMode:'all',academicMathStyle:'verbose'}), /parenthesis/, source);
  }
});
test('collection speech preserves skip policy, complexity limits and unsupported-expression safeguards', () => {
  for (const source of [String.raw`\{a,b\}`, '[a,b]', '(x)', String.raw`x\in[a,b]`]) {
    assert.equal(mathSpeech(source,{mathIntervalContext:'interval',academicMathMode:'skip'}),'Formula.');
    assert.equal(mathSpeech(source,{mathReadingLanguage:'skip',academicSkipNotice:false}),'');
  }
  for (const source of [String.raw`\{a,b,c,d\}`,String.raw`\{\{a,b\},c\}`,String.raw`\{\unknown,a\}`,String.raw`\{a+b,c\}`,String.raw`\lbrace a+b,c\rbrace`,String.raw`\sum_{i=1}^n x_i`])
    assert.equal(mathSpeech(source),'Formula.',source);
  assert.equal(mathSpeech(String.raw`[A_{\min}+c x_i,A_{\max}-c x_j]`),
    'A min plus c x i to A max minus c x j');
});
