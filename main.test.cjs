const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;

class MockPlugin {}
class MockItemView {}
class MockModal {}
class MockPluginSettingTab {}
class MockSetting {}
class MockNotice {}
class MockMarkdownView {}
function mockSetIcon() {}
async function mockLoadPdfJs() {
  return {};
}

Module._load = function loadWithObsidianMock(request, parent, isMain) {
  if (request === 'obsidian') {
    return {
      ItemView: MockItemView,
      MarkdownView: MockMarkdownView,
      Modal: MockModal,
      Notice: MockNotice,
      Plugin: MockPlugin,
      PluginSettingTab: MockPluginSettingTab,
      Setting: MockSetting,
      loadPdfJs: mockLoadPdfJs,
      normalizePath: (value) => String(value || '').replace(/\\/g, '/'),
      setIcon: mockSetIcon,
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

try {
  const pluginModule = require('./main');
  const progressProbe = {
    activeSession: { chunks: ['a', 'b', 'c', 'd'] },
    readerState: { currentChunk: 1 },
    isActive: () => true,
    jumpToAdjacentChunk: delta => delta,
  };
  assert.strictEqual(pluginModule.default.prototype.seekToProgress.call(progressProbe, 0.6), 2);
  assert.strictEqual(pluginModule.default.prototype.seekToProgress.call(progressProbe, 1), 3);
  progressProbe.activeSession.kind = 'audio-export';
  assert.strictEqual(pluginModule.default.prototype.seekToProgress.call(progressProbe, 0.6), false);
  assert.strictEqual(pluginModule.__test.normalizeSpeechEngine('mimo-tts'), 'mimo-tts');
  assert.strictEqual(pluginModule.__test.isOnlineSpeechEngine('mimo-tts'), true);
  assert.strictEqual(pluginModule.__test.getAudioExportExtension('mimo-tts'), 'wav');
  assert.strictEqual(pluginModule.__test.createDefaultSettings().mimoConsent, false);
  assert.deepStrictEqual(pluginModule.__test.getChunkLimitsForSpeechEngine({ onlineChunkLimits: '100,400,800' }, 'mimo-tts'), [100,200,200]);
  assert.deepStrictEqual(pluginModule.__test.getChunkLimitsForSpeechEngine({ onlineChunkLimits: '100,400,800' }, 'openrouter-tts'), [100,400,800]);
  assert.strictEqual(typeof pluginModule.default, 'function');
  assert.strictEqual(
    Object.getPrototypeOf(pluginModule.default.prototype),
    MockPlugin.prototype
  );
  assert.strictEqual(
    pluginModule.__test.GITHUB_ISSUES_URL,
    'https://github.com/laginae/note-reader-cosyvoice/issues'
  );
  assert.strictEqual(
    pluginModule.__test.AZURE_TTS_PRIVACY_URL,
    'https://learn.microsoft.com/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security'
  );
  assert.match(pluginModule.__test.getSettingsUiText('english').edgeConsentDesc, /ZDR/);
  assert.match(pluginModule.__test.getSettingsUiText('chinese').edgeConsentDesc, /ZDR/);
  assert.match(pluginModule.__test.getSettingsUiText('english').azurePrivacyDesc, /no separate privacy switch/i);
  assert.match(pluginModule.__test.getSettingsUiText('chinese').azurePrivacyDesc, /无需.*额外开启.*隐私开关/);
  let opened = null;
  global.window = {
    open: (...args) => {
      opened = args;
      return {};
    },
  };
  assert.strictEqual(pluginModule.__test.openGitHubIssues(), true);
  assert.deepStrictEqual(opened, [
    'https://github.com/laginae/note-reader-cosyvoice/issues',
    '_blank',
    'noopener,noreferrer',
  ]);
  assert.strictEqual(pluginModule.__test.openAzureTtsPrivacyDocs(), true);
  assert.deepStrictEqual(opened, [
    'https://learn.microsoft.com/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security',
    '_blank',
    'noopener,noreferrer',
  ]);
  delete global.window;
  console.log('main export tests passed');
} finally {
  Module._load = originalLoad;
}
