const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateTextSeconds, estimatePlayback, formatDuration } = require('./playback-estimate');
test('estimates handle Chinese, English, mixed text and synthesis speed', () => {
  assert.equal(estimateTextSeconds('中文测试'), 1);
  assert.equal(estimateTextSeconds('one two three four five'), 2);
  assert.equal(estimateTextSeconds('中文测试 one two three four five', 2), 1.5);
  assert.equal(estimateTextSeconds(''), 0);
});
test('measured audio overrides estimates without applying synthesis speed twice', () => {
  const session = { chunks: ['中文测试', '中文测试'], audioDurations: { 0: 10 } };
  assert.deepEqual(estimatePlayback(session, 0, 3, 2), { total: 10.5, remaining: 7.5, partial: false });
  assert.equal(estimatePlayback(session, 1, 100, 2).remaining, 0);
  session.synthesisSpeeds = { 1: 1 };
  assert.equal(estimatePlayback(session, 1, 0, 2).remaining, 1);
  assert.equal(estimatePlayback(session, 0, 0, 2).remaining, 11);
  assert.equal(estimatePlayback(session, 0, 3, 2, 2).remaining, 4);
  assert.equal(estimatePlayback(session, 0, 3, 2, 2).total, 5.5);
});
test('PDF estimates grow as pages arrive and exports do not show playback estimates', () => {
  const session = { chunks: ['test'], kind: 'pdf-progressive' };
  assert.equal(estimatePlayback(session, 0, 0).partial, true);
  session.chunks.push('test');
  assert.equal(estimatePlayback(session, 0, 0).total, 0.8);
  session.productionComplete = true;
  assert.equal(estimatePlayback(session, 0, 0).partial, false);
  assert.equal(estimatePlayback({ chunks: ['test'], kind: 'audio-export' }, 0, 0), null);
  assert.equal(estimatePlayback(null, 0, 0), null);
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(0), '0:00');
});
