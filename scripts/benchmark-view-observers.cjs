const { performance } = require('node:perf_hooks');
const { createViewObservation } = require('../src/view-observation');
const results = [0, 1, 10].map(leaves => {
  let visits = 0, callback;
  const observer = createViewObservation({ hasViews: () => leaves > 0,
    observe: () => { for (let n = 0; n < leaves; n++) visits++; },
    setTimer: fn => { callback = fn; return 1; }, clearTimer: () => {} });
  const start = performance.now(); observer.sync();
  for (let tick = 0; tick < 800; tick++) callback?.();
  const elapsedMs = performance.now() - start;
  observer.dispose();
  return { leaves, simulatedSeconds: 600, oldPeriodicCallbacks: 800,
    newPeriodicCallbacks: callback ? 800 : 0, visits, harnessElapsedMs: elapsedMs };
});
console.log(JSON.stringify({ kind: 'synthetic lifecycle benchmark, not Obsidian CPU or startup timing', results }, null, 2));
