'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { listSystemVoices, synthesizeSystemSpeech } = require('../src/system-tts');
const { buildSentenceCues, sentenceRanges } = require('../src/reading-highlights');

async function main() {
  if (os.platform() !== 'win32') throw new Error('This live timing check requires Windows.');
  const voices = await listSystemVoices();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-public-timing-'));
  try {
    const samples = [
      { voice: voices.find(voice => voice.language.startsWith('en-')), text: 'The first public sentence is short. The second public sentence is longer. This is the final sentence.' },
      { voice: voices.find(voice => voice.language.startsWith('zh-')), text: '第一句是公开测试文字。第二句也仅用于本地测试。第三句说明测试已经结束。' },
    ];
    for (let index = 0; index < samples.length; index++) {
      const { voice, text } = samples[index];
      if (!voice) { console.log(`sample ${index}: no installed voice for this language`); continue; }
      const inputPath = path.join(dir, `sample-${index}.txt`), outputPath = path.join(dir, `sample-${index}.wav`);
      fs.writeFileSync(inputPath, text, { encoding: 'utf8', mode: 0o600 });
      const result = await synthesizeSystemSpeech({ voice: voice.id, voices, inputPath, outputPath });
      const cues = buildSentenceCues(text, result.boundaries, result.duration);
      if (cues.length !== sentenceRanges(text).length) console.log(JSON.stringify({ sample: index,
        duration: result.duration, boundaries: result.boundaries, cues, expectedSentences: sentenceRanges(text).length }));
      assert.equal(cues.length, sentenceRanges(text).length);
      console.log(JSON.stringify({ sample: index, words: result.boundaries.length, sentences: cues.length,
        duration: Math.round(result.duration * 100) / 100, verified: true }));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
