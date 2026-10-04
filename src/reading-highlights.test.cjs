const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeReadingHighlight, sentenceRanges, buildSentenceCues, sentenceAtTime, speechPartOffset } = require('./reading-highlights');

test('sentence ranges preserve every character, including Chinese, formulas and repeated sentences', () => {
  for (const text of ['第一句话。第二句！还有第三句？', 'A sentence. A sentence.\nNext one!', 'Value is 0.95. See Fig. 2. Final sentence.', '<script>alert(1)</script> is plain text. Next sentence.']) {
    const ranges = sentenceRanges(text);
    assert.equal(ranges.map(range => text.slice(range.start, range.end)).join(''), text);
    assert.equal(ranges[0].start, 0); assert.equal(ranges.at(-1).end, text.length);
  }
  assert.deepEqual(sentenceRanges('   '), []);
  assert.equal(normalizeReadingHighlight('invalid'), 'sentence');
});

test('real word times drive sentence sync, including backward seeking, pauses and playback rates', () => {
  const text = 'First sentence. Second sentence.';
  const cues = buildSentenceCues(text, [{ start: 0, length: 5, time: 0.2 }, { start: 16, length: 6, time: 2.3 }], 5);
  assert.equal(cues.length, 2);
  assert.equal(sentenceAtTime(cues, 0), null);
  assert.equal(sentenceAtTime(cues, 3).start, 16);
  assert.equal(sentenceAtTime(cues, 0.7).start, 0);
  assert.equal(sentenceAtTime(cues, 0.7).start, 0);
  assert.equal(sentenceAtTime(cues, 5), null);
  // currentTime is media time; wall-clock playback speed must not scale cue times again.
  for (const rate of [0.5, 1, 2]) assert.equal(sentenceAtTime(cues, 2.4).start, 16, `rate ${rate}`);
});

test('missing, out-of-order or invalid timestamps never create guessed sentence timing', () => {
  const text = 'One. Two.';
  for (const words of [[], [{ start: 0, length: 3, time: 0 }],
    [{ start: 0, length: 3, time: 2 }, { start: 5, length: 3, time: 1 }],
    [{ start: 0, length: 3, time: 0 }, { start: 5, length: 99, time: 1 }],
    [{ start: 0, length: 3, time: NaN }, { start: 5, length: 3, time: 1 }]]) {
    assert.deepEqual(buildSentenceCues(text, words, 3), []);
  }
});

test('startup audio offsets use successive positions, not the first repeated text occurrence', () => {
  const parts = ['First.', 'First.', 'Last.'];
  const text = 'First.\n\nFirst. Last.';
  assert.equal(speechPartOffset(text, parts, 1), 8);
  assert.equal(speechPartOffset(text, parts, 2), 15);
  assert.equal(speechPartOffset(text, ['missing'], 0), null);
});
