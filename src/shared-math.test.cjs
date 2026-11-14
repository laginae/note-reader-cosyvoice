'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { cases } = require('@laginae/note-reader-core/test/math-golden-fixtures');
const shared = require('@laginae/note-reader-core/academic-speech');
const adapter = require('./academic-speech');
test('desktop formula adapter delegates to the pinned shared implementation', () => {
  assert.equal(adapter, shared);
});
for (const example of cases) test('desktop shared formula: ' + example.name, () => {
  assert.equal(adapter.mathSpeech(example.formula, example.options), example.expected);
});
