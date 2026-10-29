const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createViewObservation } = require('./view-observation');
test('idle views need no poll; opening, replacement, closing and unload preserve lifecycle', () => {
  let views = 0, calls = 0, callback, active = 0;
  const observer = createViewObservation({ hasViews: () => views > 0, observe: () => calls++,
    setTimer: cb => { callback = cb; active++; return 1; }, clearTimer: () => active-- });
  observer.sync();
  assert.equal(calls, 1); assert.equal(active, 0);
  views = 1; observer.sync(); observer.sync();
  assert.equal(active, 1);
  callback(); assert.equal(calls, 4);
  views = 10; observer.sync(); assert.equal(active, 1);
  views = 0; observer.sync(); assert.equal(active, 0);
  views = 1; observer.sync(); assert.equal(active, 1);
  observer.dispose(); assert.equal(active, 0);
  const before = calls; callback(); observer.sync(); assert.equal(calls, before);
});
