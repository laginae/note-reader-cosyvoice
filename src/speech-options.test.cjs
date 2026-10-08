const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTerms, normalizedTerms, applyTerms, fitSpeechParts, supportsSpeechContext, contextOptions, adjacentContext } = require('./speech-options');
const settings = { speechTermsEnabled: true, speechTerms: 'AI = artificial intelligence\nCPU = central processing unit\n处理器 = CPU' };
test('term rules are exact, bounded, longest-first and non-recursive', () => {
  assert.equal(applyTerms('AI CPU 处理器 ai XAI AI2', settings), 'artificial intelligence central processing unit CPU ai XAI AI2');
  assert.equal(applyTerms('AI', { ...settings, speechTermsEnabled:false }), 'AI');
  assert.equal(applyTerms('A+B and AB', { speechTermsEnabled:true, speechTerms:'A+B = sum' }), 'sum and AB');
  assert.equal(applyTerms('ABC', { speechTermsEnabled:true, speechTerms:'AB = first\nABC = second' }), 'second');
  for (const invalid of ['AI', 'AI =', '= value', 'A = B\nA = C', 'x'.repeat(20001)]) {
    assert.ok(parseTerms(invalid).error); assert.equal(normalizedTerms(invalid), '');
    assert.equal(applyTerms('AI', { speechTermsEnabled:true, speechTerms:invalid }), 'AI');
  }
});
test('expanded speech fits engine limits while original source offsets remain reconstructable', () => {
  const source = ('AI CPU 处理器. ').repeat(40) + '😀';
  const parts = fitSpeechParts(source, settings, 200);
  assert.ok(parts.length > 1);
  assert.equal(parts.map(part => part.source).join(''), source);
  assert.equal(parts.map(part => part.text).join(''), applyTerms(source, settings));
  for (const part of parts) assert.ok(part.text.length <= 200);
  assert.equal(parts.at(-1).text.endsWith('😀'), true);
});
test('ElevenLabs context requires explicit consent and an exact supported model', () => {
  const context = { previous:'First sentence. Previous AI.', next:'Next CPU. Last sentence.' };
  for (const model of ['fish-audio/s2.1-pro', 'elevenlabs/unknown', 'elevenlabs/eleven-v4:free']) {
    assert.equal(supportsSpeechContext(model), false);
    assert.deepEqual(contextOptions({openRouterModel:model, openRouterContext:true}, context), {});
  }
  const s = {...settings, openRouterModel:'elevenlabs/eleven-multilingual-v2', openRouterContext:true};
  assert.deepEqual(contextOptions({...s, openRouterContext:false}, context), {});
  assert.deepEqual(contextOptions(s, context), { options:{ elevenlabs:{previous_text:'Previous artificial intelligence.',next_text:'Next central processing unit.'} } });
  assert.deepEqual(contextOptions(s, {}), {});
  const long = contextOptions(s, {previous:'😀'.repeat(300), next:'x'.repeat(300)}).options.elevenlabs;
  assert.equal(Array.from(long.previous_text).length, 160);
  assert.equal(Array.from(long.next_text).length, 160);
});
test('context is derived from the current range, not previous playback history', () => {
  assert.deepEqual(adjacentContext(['selected first.', 'selected second.'], 0), {previous:'', next:'selected second.'});
  assert.deepEqual(adjacentContext(['selected first.', 'selected second.'], 1), {previous:'selected first.', next:''});
  assert.deepEqual(adjacentContext(['new document.'], 0), {previous:'', next:''});
  assert.deepEqual(adjacentContext(['A.', 'B.'], 1, 'earlier.', 'later.'), {previous:'A.', next:'later.'});
});
