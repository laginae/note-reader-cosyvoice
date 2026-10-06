const test = require('node:test');
const assert = require('node:assert/strict');
const { getSpeechParts, planSpeechParts, adjacentSpeechPart, getSpeechPartTiming } = require('./speech-parts');
const { splitOpeningAudioParts } = require('./semantic-chunker');

test('rapid start releases only an eligible complete opening sentence without adding a tier', () => {
  for (const first of ['这是第一句。', 'Ready to read.', '字'.repeat(4) + '。', '字'.repeat(18) + '。']) {
    const text = first + '文'.repeat(39) + '。' + '余'.repeat(40) + '。';
    const standard = splitOpeningAudioParts(text);
    const rapid = splitOpeningAudioParts(text, true);
    assert.notEqual(standard[0], first);
    assert.equal(rapid[0], first);
    assert.equal(rapid[1], '文'.repeat(39) + '。');
    assert.ok(rapid.length <= 3);
    assert.equal(rapid.join(''), text);
  }
});

test('rapid mode falls back for too-short, long, incomplete and abbreviated opening text', () => {
  for (const first of ['好。', '字'.repeat(19) + '。', 'Dr. Smith explains this idea clearly. ', '1.2.3. Overview of the scientific method. ']) {
    const text = first + '文'.repeat(39) + '。' + '余'.repeat(40) + '。';
    assert.deepEqual(splitOpeningAudioParts(text, true), splitOpeningAudioParts(text));
  }
  const text = 'This opening has no sentence ending or punctuation';
  assert.deepEqual(splitOpeningAudioParts(text, true), [text]);
});

test('rapid plans preserve prefetch and export behavior and freeze after first request', () => {
  const first = '这是第一句。';
  const text = first + '文'.repeat(39) + '。' + '余'.repeat(40) + '。';
  const session = { chunks: [text, text], rapidQuickStart: true };
  assert.equal(getSpeechParts(session, 0)[0], first);
  const foreground = planSpeechParts(session, 0, true);
  session.rapidQuickStart = false;
  assert.equal(planSpeechParts(session, 0, true), foreground);
  session.rapidQuickStart = true;
  const prepared = planSpeechParts(session, 1, false);
  assert.deepEqual(prepared, [text]);
  assert.equal(planSpeechParts(session, 1, true), prepared);
  assert.equal(planSpeechParts({ chunks: ['Earlier.', text], rapidQuickStart: true }, 1, true)[0], first);
  for (const options of [{ smartQuickStart: false }, { kind: 'audio-export' }]) {
    assert.deepEqual(planSpeechParts({ chunks: [text], rapidQuickStart: true, ...options }, 0, true), [text]);
  }
});

test('part timeline combines measured and estimated durations without resetting at boundaries', () => {
  const session = { chunks: ['字'.repeat(19) + '。' + '文'.repeat(39) + '。' + '余'.repeat(19) + '。', 'Next.'] };
  assert.equal(getSpeechParts(session, 0).length, 3);
  session.partDurations = { '0:0': 5 };
  const endFirst = getSpeechPartTiming(session, 0, 0, 5);
  const startSecond = getSpeechPartTiming(session, 0, 1, 0);
  assert.equal(endFirst.current, startSecond.current);
  assert.equal(endFirst.duration, startSecond.duration);
  session.partDurations['0:1'] = 8;
  session.partDurations['0:2'] = 4;
  assert.deepEqual(getSpeechPartTiming(session, 0, 2, 2), {
    durations: [5, 8, 4], offset: 13, duration: 17, current: 15,
  });
  assert.deepEqual(adjacentSpeechPart(session, 0, 0, 1), { index: 0, part: 1 });
  assert.deepEqual(adjacentSpeechPart(session, 0, 2, 1), { index: 1, part: 0 });
  assert.deepEqual(adjacentSpeechPart(session, 1, 0, -1), { index: 0, part: 2 });
  assert.equal(adjacentSpeechPart(session, 0, 0, -1), null);
});

test('unprepared later segments can start quickly without changing logical numbering or dropping text', () => {
  const text = '字'.repeat(19) + '。' + '文'.repeat(39) + '。' + '余'.repeat(19) + '。';
  const session = { chunks: ['Earlier.', text], smartQuickStart: true };
  assert.equal(getSpeechParts(session, 1).length, 1);
  const parts = planSpeechParts(session, 1, true);
  assert.equal(parts.length, 3); assert.equal(parts.join(''), text);
  assert.equal(session.chunks.length, 2);
  assert.equal(planSpeechParts(session, 1, false), parts);
});

test('prefetched plans are reused, and disabled quick start and exports never split', () => {
  const text = 'A complete sentence with enough characters. '.repeat(5);
  const session = { chunks: ['Earlier.', text] };
  const pending = planSpeechParts(session, 1, false);
  assert.equal(pending.length, 1);
  assert.equal(planSpeechParts(session, 1, true), pending);
  for (const options of [{ smartQuickStart: false }, { kind: 'audio-export' }]) {
    assert.equal(planSpeechParts({ chunks: [text], ...options }, 0, true).length, 1);
  }
});
