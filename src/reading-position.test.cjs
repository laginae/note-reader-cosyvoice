const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_ANCHOR_LENGTH,
  createReadingAnchor,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  upsertReadingPosition,
} = require('./reading-position');

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
