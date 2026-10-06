const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_ANCHOR_LENGTH,
  createReadingAnchor,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  sliceOriginalTextFromReadingPosition,
  upsertReadingPosition,
} = require('./reading-position');

test('HTML resume preserves original punctuation, ligatures, accents and paragraph breaks', () => {
  for (const original of [
    '中文：全角（括号），百分比２０％。\n\n下一段。',
    'English ﬁgures and cafe\u0301.\n\nNext paragraph.',
    'Some hyphen-\nated wording and a soft\u00adhyphen.\n\nNext paragraph.',
    '한글과 ＡＢＣ 테스트。\n\n다음 문장.',
  ]) {
    const source = 'Earlier paragraph.\n\n' + original;
    const result = sliceOriginalTextFromReadingPosition(source, { anchor: createReadingAnchor(original) });
    assert.equal(result.matched, true);
    assert.equal(result.text, original);
    assert.equal(source.slice(result.offset), original);
  }
});

test('original-text resume refuses duplicate anchors and starts inside expanding graphemes', () => {
  assert.equal(sliceOriginalTextFromReadingPosition('Repeat. Repeat.', { anchor: 'Repeat.' }).matched, false);
  assert.equal(sliceOriginalTextFromReadingPosition('ﬁrst example.', { anchor: 'irst example.' }).matched, false);
});

test('reading history stores a bounded anchor instead of the complete document', () => {
  const privateDocument = 'Private academic paragraph. '.repeat(100);
  const anchor = createReadingAnchor(privateDocument);

  assert.equal(anchor.length, MAX_ANCHOR_LENGTH);
  assert.ok(anchor.length < privateDocument.length);
});

test('positions are validated, bounded, and ordered by recency', () => {
  let positions = {};
  for (let index = 0; index < 5; index += 1) {
    positions = upsertReadingPosition(positions, {
      anchor: `Anchor ${index} with enough text`,
      chunkIndex: index,
      filePath: `note-${index}.md`,
      kind: 'markdown',
      updatedAt: 100 + index,
    }, 3);
  }

  assert.deepEqual(Object.keys(positions), ['note-4.md', 'note-3.md', 'note-2.md']);
  assert.deepEqual(normalizeReadingPositions({ invalid: { kind: 'markdown' } }), {});
  assert.equal(removeReadingPosition(positions, 'note-3.md')['note-3.md'], undefined);
});

test('a saved anchor resumes at the matching text after whitespace changes', () => {
  const position = {
    anchor: 'Selected passage continues with the result.',
  };
  const sliced = sliceTextFromReadingPosition(
    'Introduction.\n\nSelected   passage continues with the result. Conclusion.',
    position
  );

  assert.equal(sliced.matched, true);
  assert.equal(sliced.text, 'Selected passage continues with the result. Conclusion.');
});

test('repeated or partially changed anchors never silently resume at the wrong occurrence', () => {
  const anchor = 'The repeated paragraph has the same opening.';
  assert.equal(sliceTextFromReadingPosition(`${anchor} Middle. ${anchor}`, { anchor }).matched, false);
  assert.equal(sliceTextFromReadingPosition('The repeated paragraph has a different ending.', { anchor }).matched, false);
});

test('HTML positions survive normalization while invalid updates preserve an existing position', () => {
  const position = { filePath: 'Articles/study.html', kind: 'html', anchor: 'A saved HTML paragraph.', updatedAt: 100 };
  const positions = upsertReadingPosition({}, position);
  assert.equal(normalizeReadingPositions(positions)[position.filePath].kind, 'html');
  assert.deepEqual(upsertReadingPosition(positions, { ...position, anchor: '' }), positions);
  assert.deepEqual(normalizeReadingPositions([]), {});
  assert.deepEqual(removeReadingPosition(positions, position.filePath), {});
  assert.equal(normalizeReadingPositions({ ' Articles/study.html ': position })[position.filePath].kind, 'html');
});
