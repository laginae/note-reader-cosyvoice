const test = require('node:test');
const assert = require('node:assert/strict');
const { preparationStatusText } = require('./preparation-status');

test('preparation labels distinguish reuse, synthesis and loading without stale playback messages', () => {
  for (const [status, en, zh] of [
    ['waiting', 'Waiting for existing synthesis', '等待已有合成完成'],
    ['synthesizing', 'Synthesizing target segment', '正在合成目标段'],
    ['loading', 'Loading audio', '正在加载音频'],
  ]) {
    const state = { phase: 'synthesizing', preparationStatus: status };
    assert.ok(preparationStatusText(state, 'english').startsWith(en));
    assert.ok(preparationStatusText(state, 'chinese').startsWith(zh));
    for (const phase of ['playing', 'paused', 'idle', 'complete', 'error']) {
      assert.equal(preparationStatusText({ ...state, phase }, 'chinese'), '');
    }
  }
});
test('concise status follows the UI language, including pause, PDF preparation and export', () => {
  const { playbackStatusText } = require('./preparation-status');
  assert.equal(playbackStatusText({phase:'paused',label:'CosyVoice paused'},'chinese'),'已暂停');
  assert.equal(playbackStatusText({phase:'synthesizing',currentChunk:3},'chinese'),'正在准备第 3 段');
  assert.equal(playbackStatusText({phase:'extracting PDF'},'chinese'),'正在解析 PDF 页面');
  assert.equal(playbackStatusText({phase:'complete',label:'Voice audio export complete'},'english'),'Export complete');
});
