const assert = require('assert');
const fs = require('fs');
const path = require('path');

class MockPlugin {}
class MockItemView {}
class MockPluginSettingTab {}
class MockSetting {}
class MockNotice {}
class MockMarkdownView {}
function mockSetIcon() {}

const allowedBuiltins = new Set(['fs', 'path', 'child_process', 'url']);
const mainPath = path.join(__dirname, 'main.js');
const code = fs.readFileSync(mainPath, 'utf8');
const moduleObject = { exports: {} };

function obsidianStyleRequire(request) {
  if (request === 'obsidian') {
    return {
      ItemView: MockItemView,
      MarkdownView: MockMarkdownView,
      Notice: MockNotice,
      Plugin: MockPlugin,
      PluginSettingTab: MockPluginSettingTab,
      Setting: MockSetting,
      setIcon: mockSetIcon,
    };
  }

  if (allowedBuiltins.has(request)) {
    return require(request);
  }

  throw new Error(`Obsidian-style loader cannot resolve ${request}`);
}

const pluginFactory = new Function('require', 'module', 'exports', `${code}\n//# sourceURL=plugin:note-reader-cosyvoice`);
pluginFactory(obsidianStyleRequire, moduleObject, moduleObject.exports);

const PluginClass = moduleObject.exports.default || moduleObject.exports;
const testVaultPath = path.resolve('test-vault');
const testAudioPath = path.join(testVaultPath, '.obsidian', 'plugins', 'note-reader-cosyvoice', 'cache', 'a.wav');
assert.strictEqual(typeof PluginClass, 'function');
assert.strictEqual(Object.getPrototypeOf(PluginClass.prototype), MockPlugin.prototype);
assert.strictEqual(
  moduleObject.exports.__test.toVaultRelativePath(testVaultPath, testAudioPath),
  '.obsidian/plugins/note-reader-cosyvoice/cache/a.wav'
);
assert.strictEqual(
  moduleObject.exports.__test.getAudioUrlForFile(
    { getResourcePath: (vaultPath) => `app://local/${vaultPath}` },
    testVaultPath,
    testAudioPath
  ),
  'app://local/.obsidian/plugins/note-reader-cosyvoice/cache/a.wav'
);
assert.ok(moduleObject.exports.__test.resolvePowerShellExecutable().toLowerCase().endsWith('powershell.exe'));
assert.strictEqual(moduleObject.exports.__test.VIEW_TYPE, 'note-reader-cosyvoice-control');
assert.deepStrictEqual(moduleObject.exports.__test.createReaderState(), {
  canPause: false,
  canStop: false,
  currentChunk: 0,
  currentText: '',
  error: '',
  isPaused: false,
  label: 'CosyVoice idle',
  canSeek: false,
  phase: 'idle',
  progress: 0,
  source: '',
  status: 'idle',
  totalChunks: 0,
});
assert.deepStrictEqual(moduleObject.exports.__test.createDefaultSettings(), {
  cleanupCache: true,
  chunkLimits: '40,80,120,160,280,320',
  scriptPath: moduleObject.exports.__test.resolveDefaultScriptPath(),
  speed: 1,
  stripMarkdown: true,
});
assert.ok(
  moduleObject.exports.__test.resolveDefaultScriptPath().endsWith(
    path.join('note-reader-cosyvoice', 'cosyvoice-wrapper.ps1')
  )
);
assert.ok(!moduleObject.exports.__test.resolveDefaultScriptPath().toLowerCase().includes(['her', 'mes'].join('')));
const mutatedDefaults = moduleObject.exports.__test.createDefaultSettings();
mutatedDefaults.chunkLimits = '999';
assert.strictEqual(moduleObject.exports.__test.createDefaultSettings().chunkLimits, '40,80,120,160,280,320');
assert.deepStrictEqual(moduleObject.exports.__test.getSpeedPresets(), [1, 1.25, 1.5, 2]);
const mutatedSpeedPresets = moduleObject.exports.__test.getSpeedPresets();
mutatedSpeedPresets.push(99);
assert.deepStrictEqual(moduleObject.exports.__test.getSpeedPresets(), [1, 1.25, 1.5, 2]);
assert.strictEqual(moduleObject.exports.__test.formatSpeedLabel(1), '1x');
assert.strictEqual(moduleObject.exports.__test.formatSpeedLabel(1.25), '1.25x');
assert.strictEqual(
  moduleObject.exports.__test.formatProgressLabel({ currentChunk: 2, totalChunks: 5 }),
  '2 / 5'
);
assert.strictEqual(
  moduleObject.exports.__test.sanitizeTextForSpeech('长公式 $\\int_0^1 x^2 + y^2 + z^2 dx$ 跳过，短公式 $a_b$ 读。'),
  '长公式 跳过，短公式 a 下标 b 读。'
);
assert.strictEqual(
  moduleObject.exports.__test.calculateCurrentChunkSeekTime({
    progress: 0.375,
    currentChunk: 2,
    totalChunks: 4,
    duration: 10,
  }),
  5
);
assert.strictEqual(
  moduleObject.exports.__test.calculateCurrentChunkSeekTime({
    progress: 0.1,
    currentChunk: 2,
    totalChunks: 4,
    duration: 10,
  }),
  0
);
assert.strictEqual(
  moduleObject.exports.__test.getTextFromPositionToEnd(['第一行', '第二行内容', '第三行'], { line: 1, ch: 2 }),
  '行内容\n第三行'
);

(async () => {
  const plugin = Object.create(PluginClass.prototype);
  let savedSettings = null;
  plugin.settings = {
    cleanupCache: false,
    chunkLimits: '999',
    scriptPath: 'custom.ps1',
    speed: 2,
    stripMarkdown: false,
  };
  plugin.saveData = async (settings) => {
    savedSettings = settings;
  };
  let renderCount = 0;
  plugin.renderReaderViews = () => {
    renderCount += 1;
  };

  await plugin.setSpeechSpeed(1.25);

  assert.strictEqual(plugin.settings.speed, 1.25);
  assert.strictEqual(savedSettings.speed, 1.25);
  assert.strictEqual(renderCount, 1);

  await plugin.resetSettingsToDefaults();

  assert.deepStrictEqual(plugin.settings, moduleObject.exports.__test.createDefaultSettings());
  assert.deepStrictEqual(savedSettings, moduleObject.exports.__test.createDefaultSettings());
  assert.notStrictEqual(savedSettings, moduleObject.exports.__test.createDefaultSettings());
  console.log('obsidian loader tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
