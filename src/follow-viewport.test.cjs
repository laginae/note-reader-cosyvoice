const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { visibleReadingArea, scrollDecision, followElements } = require('./follow-viewport');
test('fit the entire highlight with margins; tall highlights align their beginning', () => {
  const visible = { top: 16, bottom: 484 };
  assert.equal(scrollDecision({ top: 30, bottom: 470 }, visible), null);
  assert.deepEqual(scrollDecision({ top: 350, bottom: 530 }, visible), { tall: false, delta: 46 });
  assert.deepEqual(scrollDecision({ top: 200, bottom: 900 }, visible), { tall: true, delta: 184 });
  assert.equal(scrollDecision({ top: 16, bottom: 900 }, visible), null);
});
test('preview considers all marked blocks and reserves space beneath overlapping sticky tools', () => {
  const dom = new JSDOM('<div class="workspace-leaf-content"><div role="toolbar" style="position:sticky"></div><main><p></p><p></p></main></div>');
  const doc = dom.window.document, root = doc.querySelector('main');
  root.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
  doc.querySelector('[role=toolbar]').getBoundingClientRect = () => ({ top: 0, bottom: 40, height: 40 });
  assert.deepEqual(visibleReadingArea(root), { top: 56, bottom: 484 });
  const nodes = [...root.children];
  nodes[0].getBoundingClientRect = () => ({ top: 350, bottom: 390 });
  nodes[1].getBoundingClientRect = () => ({ top: 470, bottom: 550 });
  followElements(root, nodes); assert.equal(root.scrollTop, 66);
  dom.window.close();
});
