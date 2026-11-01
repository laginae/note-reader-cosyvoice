'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { miniOutlineTitle } = require('../src/mini-outline-title');
const clean = value => miniOutlineTitle(value, 'markdown');

test('outline labels remove paired presentation markers while preserving numbering and formula content', () => {
  assert.equal(clean('2. **A heading** with $x_{k}$ and ==highlights=='), '2. A heading with x_{k} and highlights');
  assert.equal(clean('**Bold _and italic_**; ~~old~~; \\(y\\) and $$z$$'), 'Bold and italic; old; y and z');
  assert.equal(clean('中文标题：$a_{\\mathrm i}$ 与 *普通文字*'), '中文标题：a_{i} 与 普通文字');
  assert.equal(clean('A <!-- internal marker --> B %% metadata %% C'), 'A B C');
});

test('link labels are displayed without resolving, rendering or requesting their destinations', () => {
  assert.equal(clean('A [[Public note|short name]] and [**reference**](https://example.org/a(b))'), 'A short name and reference');
  assert.equal(clean('<strong>Title</strong> with ![diagram](public.png)'), 'Title with diagram');
});

test('literal code, escaped characters, unmatched markers and ordinary prices are not rewritten', () => {
  assert.equal(clean('Use `x_i` and ``**literal** $z$``'), 'Use x_i and **literal** $z$');
  assert.equal(clean('Use \\*literal\\* and \\$10; costs $5 and $10'), 'Use *literal* and $10; costs $5 and $10');
  assert.equal(clean('file_name and x_i_j; an unmatched $x and *note'), 'file_name and x_i_j; an unmatched $x and *note');
});

test('PDF and HTML titles remain literal and plain-text output never creates DOM or speech labels', () => {
  for (const kind of ['pdf','html']) assert.equal(miniOutlineTitle('Price $5$ and x_i **literal**',kind),'Price $5$ and x_i **literal**');
  assert.equal(clean('$x_i$'),'x_i');
  assert.equal(clean('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
  assert.equal(clean('\0cozy0\0 $x$'),'\0cozy0\0 x');
});
