const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canTransitionTaskState,
  createTaskState,
  transitionTaskState,
} = require('./task-state');

test('reading tasks follow explicit lifecycle transitions', () => {
  let state = createTaskState(7, 'queued');
  state = transitionTaskState(state, 'synthesizing', 7);
  state = transitionTaskState(state, 'playing', 7);
  state = transitionTaskState(state, 'paused', 7);
  state = transitionTaskState(state, 'playing', 7);
  state = transitionTaskState(state, 'complete', 7);

  assert.equal(state.phase, 'complete');
  assert.equal(state.revision, 5);
});

test('stale session events are ignored and invalid transitions are rejected', () => {
  const state = createTaskState(9, 'playing');

  assert.equal(transitionTaskState(state, 'error', 8), state);
  assert.equal(canTransitionTaskState('stopping', 'playing'), false);
  assert.throws(() => transitionTaskState(
    transitionTaskState(state, 'stopping', 9),
    'playing',
    9
  ), /Invalid reading task transition/);
});
