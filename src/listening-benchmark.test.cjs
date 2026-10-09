const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../scripts/benchmark-listening.cjs');
test('offline scheduler baseline: continuous reduces synthetic gaps without extra full-read characters', async () => {
  for (const rate of [1, 1.75, 2]) {
    const balanced = await simulate('balanced', rate), continuous = await simulate('continuous', rate);
    assert.ok(continuous.gapMs <= balanced.gapMs);
    if (rate > 1) assert.ok(continuous.gapMs < balanced.gapMs);
    assert.equal(continuous.characters, balanced.characters);
    assert.equal(continuous.startupMs, balanced.startupMs);
    assert.ok(continuous.maxConcurrentRequests <= 2);
  }
});

test('slower synthesis still exposes residual waiting; jumps remain bounded', async () => {
  const balanced = await simulate('balanced', 1.75, 80), continuous = await simulate('continuous', 1.75, 80);
  assert.ok(continuous.gapMs > 0 && continuous.gapMs < balanced.gapMs);
  const jump = await simulate('continuous', 1.75, 40, true);
  assert.ok(jump.jumpMs > 0);
  assert.ok(jump.maxConcurrentRequests <= 2);
});
