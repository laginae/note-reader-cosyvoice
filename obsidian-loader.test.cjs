const assert = require('assert');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { EventEmitter } = require('events');

class MockPlugin {}
class MockItemView {}
class MockModal {}
class MockPluginSettingTab {}
class MockSetting {}
class MockNotice {}
class MockMarkdownView {}
function mockSetIcon() {}
let mockPdfJsLib = null;
async function mockLoadPdfJs() {
  if (!mockPdfJsLib) {
    throw new Error('PDF.js mock is not configured');
  }
  return mockPdfJsLib;
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.classNames = [];
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.focusCount = 0;
    this.focusOptions = [];
  }

  empty() {
    this.children = [];
  }

  addClass(className) {
    this.classNames.push(...String(className || '').split(/\s+/).filter(Boolean));
  }

  createDiv(options = {}) {
    return this.createEl('div', options);
  }

  createSpan(options = {}) {
    return this.createEl('span', options);
  }

  createEl(tagName, options = {}) {
    const child = new FakeElement(tagName);

    if (options.cls) {
      child.addClass(options.cls);
    }

    if (Object.prototype.hasOwnProperty.call(options, 'text')) {
      child.textContent = String(options.text);
    }

    if (options.attr) {
      for (const [name, value] of Object.entries(options.attr)) {
        child.setAttribute(name, value);
      }
    }

    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);

    if (name === 'value') {
      this.value = String(value);
    }
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }

    if (!this.listeners[type].includes(listener)) {
      this.listeners[type].push(listener);
    }
  }

  dispatchEvent(event) {
    if (!event.target) {
      event.target = this;
    }

    event.currentTarget = this;

    for (const listener of this.listeners[event.type] || []) {
      listener(event);
    }
  }

  focus(options = {}) {
    this.focusCount += 1;
    this.focusOptions.push(options);
  }
}

function createKeyboardEvent(overrides = {}) {
  return {
    code: 'Space',
    defaultPrevented: false,
    key: ' ',
    propagationStopped: false,
    repeat: false,
    type: 'keydown',
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

function createPointerEvent(overrides = {}) {
  return {
    button: 0,
    defaultPrevented: false,
    propagationStopped: false,
    type: 'pointerdown',
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

function findElementByAriaLabel(root, label) {
  if (root.attributes && root.attributes['aria-label'] === label) {
    return root;
  }

  for (const child of root.children || []) {
    const result = findElementByAriaLabel(child, label);
    if (result) {
      return result;
    }
  }

  return null;
}

const allowedBuiltins = new Set(['crypto', 'fs', 'https', 'os', 'path', 'child_process', 'url']);
const mainPath = path.join(__dirname, 'main.js');
const code = fs.readFileSync(mainPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const moduleObject = { exports: {} };

function obsidianStyleRequire(request) {
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

  if (allowedBuiltins.has(request)) {
    return require(request);
  }

  throw new Error(`Obsidian-style loader cannot resolve ${request}`);
}

const pluginFactory = new Function(
  'require',
  'module',
  'exports',
  `${code}\nmodule.exports.__test.CosyVoiceReaderView = CosyVoiceReaderView;\n//# sourceURL=plugin:note-reader-cosyvoice`
);
pluginFactory(obsidianStyleRequire, moduleObject, moduleObject.exports);

const PluginClass = moduleObject.exports.default || moduleObject.exports;
const testVaultPath = path.resolve('test-vault');
const testAudioPath = path.join(testVaultPath, '.obsidian', 'plugins', 'note-reader-cosyvoice', 'cache', 'a.wav');
assert.strictEqual(manifest.id, 'note-reader-cosyvoice');
assert.strictEqual(manifest.name, 'Note and PDF Voice Reader');
assert.strictEqual(manifest.version, '0.4.3');
assert.ok(!/\bObsidian\b/.test(manifest.description));
assert.ok(!code.includes('Note Reader CosyVoice'));
assert.ok(!code.includes('CosyVoice Reader'));
assert.ok(!/\bprocess\.env\b/.test(code));
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
const blobUrlEvents = [];
class FakeBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options.type;
  }
}
const fakeBlobRuntime = {
  Blob: FakeBlob,
  URL: {
    createObjectURL: (blob) => {
      blobUrlEvents.push({ action: 'create', blob });
      return 'blob:test-audio';
    },
    revokeObjectURL: (url) => {
      blobUrlEvents.push({ action: 'revoke', url });
    },
  },
};
const blobAudioSource = moduleObject.exports.__test.createBlobAudioSource(
  Buffer.from([0xff, 0xf3, 0xe4, 0xc4]),
  'speech.mp3',
  fakeBlobRuntime
);
assert.strictEqual(blobAudioSource.url, 'blob:test-audio');
assert.strictEqual(blobAudioSource.mimeType, 'audio/mpeg');
assert.strictEqual(blobUrlEvents[0].blob.type, 'audio/mpeg');
blobAudioSource.release();
blobAudioSource.release();
assert.deepStrictEqual(blobUrlEvents.map((event) => event.action), ['create', 'revoke']);
assert.strictEqual(
  moduleObject.exports.__test.createBlobAudioSource(Buffer.from([1]), 'speech.wav', {}),
  null
);
assert.strictEqual(
  moduleObject.exports.__test.describeMediaError({ code: 4 }),
  ' (media error 4: the audio source or format is unsupported)'
);
assert.ok(moduleObject.exports.__test.resolvePowerShellExecutable().toLowerCase().endsWith('powershell.exe'));
assert.strictEqual(moduleObject.exports.__test.VIEW_TYPE, 'note-reader-cosyvoice-control');
assert.deepStrictEqual(moduleObject.exports.__test.createReaderState(), {
  canPause: false,
  canNextChunk: false,
  canPreviousChunk: false,
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
  audioExportFolder: '',
  audioExportLocation: 'obsidian-attachment',
  azureSpeechCloud: 'public',
  azureSpeechConsent: false,
  azureSpeechCredentialSource: 'obsidian-secret',
  azureSpeechKeyPath: '',
  azureSpeechRegion: '',
  azureSpeechSecretName: '',
  azureSpeechVoice: 'en-GB-RyanNeural',
  cleanupCache: true,
  chunkLimits: '40,80,120,160,280,320',
  onlineChunkLimits: '200,400,800',
  onlinePrefetchChunks: 1,
  readingPositions: {},
  rememberReadingPosition: false,
  diagnosticLogging: false,
  edgeTtsConsent: false,
  edgeTtsExecutable: 'edge-tts',
  edgeTtsVoice: 'en-GB-RyanNeural',
  mathReadingLanguage: 'english',
  openRouterConsent: false,
  openRouterCredentialSource: 'obsidian-secret',
  openRouterKeyPath: '',
  openRouterModel: 'hexgrad/kokoro-82m',
  openRouterSecretName: '',
  openRouterVoice: 'bm_george',
  settingsLanguage: 'english',
  scriptPath: '',
  speechEngine: 'local-cosyvoice',
  speed: 1,
  stripMarkdown: true,
});
assert.strictEqual(moduleObject.exports.__test.resolveDefaultScriptPath(), '');
assert.ok(!moduleObject.exports.__test.resolveDefaultScriptPath().toLowerCase().includes(['her', 'mes'].join('')));
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('chinese'), 'chinese');
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('skip'), 'skip');
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('bad'), 'english');
const reportedOpenRouterText = 'As a reference, the static scheme (S) uses no forecast information. Its interval is centered at zero, and the half-width is taken directly as the 0.95 empirical quantile of $|Y\\_{k,h}|$ on the same hold-out data:';
const sanitizedReportedOpenRouterText = moduleObject.exports.__test.sanitizeTextForSpeech(reportedOpenRouterText);
assert.ok(sanitizedReportedOpenRouterText.includes('absolute value of Y subscript k,h'));
assert.ok(!/[|$\\]/.test(sanitizedReportedOpenRouterText));
const reportedMarkdownTable = `**Table I. Coverage**

| Region | Dataset | Invalid ratio [%] |
| :----: | :-----: | ----------------: |
| CN-NE  | 2023    | 0.5               |`;
const sanitizedMarkdownTable = moduleObject.exports.__test.sanitizeTextForSpeech(reportedMarkdownTable);
assert.ok(sanitizedMarkdownTable.includes('Table columns: Region; Dataset; Invalid ratio [%].'));
assert.ok(sanitizedMarkdownTable.includes('Row 1. Region: CN-NE; Dataset: 2023; Invalid ratio [%]: 0.5.'));
assert.ok(!/[|]/.test(sanitizedMarkdownTable));
assert.ok(!/-{3,}/.test(sanitizedMarkdownTable));
const reportedCitationText = 'The results are given in Supplementary Material S3 [28], [29], and verified on the test month [30].';
assert.strictEqual(
  moduleObject.exports.__test.sanitizeTextForSpeech(reportedCitationText),
  'The results are given in Supplementary Material S3 reference 28, reference 29, and verified on the test month reference 30.'
);
assert.strictEqual(
  moduleObject.exports.__test.sanitizeTextForSpeech('Units [s] and [%] stay unchanged.'),
  'Units [s] and [%] stay unchanged.'
);
assert.strictEqual(moduleObject.exports.__test.normalizeSettingsLanguage('chinese'), 'chinese');
assert.strictEqual(moduleObject.exports.__test.normalizeSettingsLanguage('bad'), 'english');
assert.strictEqual(moduleObject.exports.__test.normalizeCredentialSource('key-file'), 'key-file');
assert.strictEqual(moduleObject.exports.__test.normalizeCredentialSource('bad'), 'obsidian-secret');
assert.strictEqual(moduleObject.exports.__test.getSettingsUiText('english').speechEngineName, 'Speech engine');
assert.strictEqual(moduleObject.exports.__test.getSettingsUiText('chinese').speechEngineName, '语音引擎');
assert.ok(moduleObject.exports.__test.getSettingsUiText('chinese').openRouterConsentDesc.includes('不会放宽 ZDR'));
assert.deepStrictEqual(
  Object.keys(moduleObject.exports.__test.getSettingsUiText('english')).sort(),
  Object.keys(moduleObject.exports.__test.getSettingsUiText('chinese')).sort()
);
const settingTabCode = code.slice(
  code.indexOf('class CosyVoiceReaderSettingTab'),
  code.indexOf('module.exports =')
);
assert.ok(!/\.set(?:Name|Desc|ButtonText)\(\s*['"]/.test(settingTabCode));
assert.strictEqual(moduleObject.exports.__test.normalizeSpeechEngine('edge-tts'), 'edge-tts');
assert.strictEqual(moduleObject.exports.__test.normalizeSpeechEngine('azure-speech'), 'azure-speech');
assert.strictEqual(moduleObject.exports.__test.normalizeSpeechEngine('openrouter-tts'), 'openrouter-tts');
assert.strictEqual(moduleObject.exports.__test.normalizeSpeechEngine('bad'), 'local-cosyvoice');
assert.deepStrictEqual(
  moduleObject.exports.__test.getChunkLimitsForSpeechEngine({
    chunkLimits: '10,20',
    onlineChunkLimits: '200,400,800',
    speechEngine: 'local-cosyvoice',
  }),
  [10, 20]
);
assert.deepStrictEqual(
  moduleObject.exports.__test.getChunkLimitsForSpeechEngine({
    onlineChunkLimits: 'invalid',
    speechEngine: 'openrouter-tts',
  }),
  [200, 400, 800]
);
assert.strictEqual(moduleObject.exports.__test.getSynthesisPrefetchCount({ speechEngine: 'local-cosyvoice' }), 1);
assert.strictEqual(moduleObject.exports.__test.getSynthesisPrefetchCount({ speechEngine: 'openrouter-tts' }), 1);
assert.strictEqual(moduleObject.exports.__test.getSynthesisPrefetchCount({
  onlinePrefetchChunks: 0,
  speechEngine: 'openrouter-tts',
}), 0);
assert.strictEqual(moduleObject.exports.__test.getSynthesisPrefetchCount({
  onlinePrefetchChunks: 1,
  speechEngine: 'azure-speech',
}), 1);
assert.strictEqual(moduleObject.exports.__test.normalizeOnlinePrefetchChunks(99), 1);
assert.strictEqual(moduleObject.exports.__test.normalizeOnlinePrefetchChunks('invalid'), 1);
assert.strictEqual(moduleObject.exports.__test.normalizeEdgeTtsExecutable('  '), 'edge-tts');
assert.strictEqual(moduleObject.exports.__test.normalizeEdgeTtsExecutable(' C:\\Tools\\edge-tts.exe '), 'C:\\Tools\\edge-tts.exe');
assert.strictEqual(moduleObject.exports.__test.normalizeEdgeTtsVoice('  '), 'en-GB-RyanNeural');
assert.strictEqual(moduleObject.exports.__test.hasEdgeTtsConsent({ speechEngine: 'local-cosyvoice' }), true);
assert.strictEqual(moduleObject.exports.__test.hasEdgeTtsConsent({ speechEngine: 'edge-tts' }), false);
assert.strictEqual(moduleObject.exports.__test.hasEdgeTtsConsent({ speechEngine: 'edge-tts', edgeTtsConsent: true }), true);
assert.strictEqual(moduleObject.exports.__test.normalizeAzureSpeechCloud('CHINA'), 'china');
assert.strictEqual(moduleObject.exports.__test.normalizeAzureSpeechCloud('invalid'), 'public');
assert.strictEqual(moduleObject.exports.__test.normalizeAzureSpeechRegion(' EastAsia '), 'eastasia');
assert.strictEqual(moduleObject.exports.__test.normalizeAzureSpeechRegion('https://example.test'), '');
assert.strictEqual(moduleObject.exports.__test.normalizeAzureSpeechVoice(' en-US-JennyNeural '), 'en-US-JennyNeural');
assert.strictEqual(
  moduleObject.exports.__test.normalizeAzureSpeechVoice('zh-CN-Xiaoxiao:DragonHDLatestNeural'),
  'zh-CN-Xiaoxiao:DragonHDLatestNeural'
);
assert.strictEqual(
  moduleObject.exports.__test.buildAzureSpeechEndpoint({ azureSpeechCloud: 'public', azureSpeechRegion: 'eastasia' }),
  'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1'
);
assert.strictEqual(
  moduleObject.exports.__test.buildAzureSpeechEndpoint({ azureSpeechCloud: 'china', azureSpeechRegion: 'chinaeast2' }),
  'https://chinaeast2.tts.speech.azure.cn/cognitiveservices/v1'
);
assert.throws(
  () => moduleObject.exports.__test.buildAzureSpeechEndpoint({ azureSpeechCloud: 'invalid', azureSpeechRegion: 'eastasia' }),
  /Invalid Azure Speech cloud/
);
assert.throws(
  () => moduleObject.exports.__test.buildAzureSpeechEndpoint({ azureSpeechCloud: 'public', azureSpeechRegion: 'https://example.test' }),
  /Invalid Azure Speech region/
);
assert.strictEqual(moduleObject.exports.__test.hasAzureSpeechConsent({ speechEngine: 'local-cosyvoice' }), true);
assert.strictEqual(moduleObject.exports.__test.hasAzureSpeechConsent({ speechEngine: 'azure-speech' }), false);
assert.strictEqual(
  moduleObject.exports.__test.hasAzureSpeechConsent({ speechEngine: 'azure-speech', azureSpeechConsent: true }),
  true
);
assert.strictEqual(
  moduleObject.exports.__test.getAzureSpeechConfigurationError({ azureSpeechRegion: '' }),
  'Set a valid Azure Speech region in the plugin settings.'
);
const azureSsml = moduleObject.exports.__test.buildAzureSpeechSsml('A < B & C', {
  azureSpeechVoice: 'en-US-JennyNeural',
  speed: 1.25,
});
assert.ok(azureSsml.includes('xml:lang="en-US"'));
assert.ok(azureSsml.includes('name="en-US-JennyNeural"'));
assert.ok(azureSsml.includes('rate="+25%"'));
assert.ok(azureSsml.includes('A &lt; B &amp; C'));
assert.strictEqual(
  moduleObject.exports.__test.normalizeOpenRouterModel(' hexgrad/kokoro-82m '),
  'hexgrad/kokoro-82m'
);
assert.strictEqual(moduleObject.exports.__test.normalizeOpenRouterModel('https://invalid.test'), 'hexgrad/kokoro-82m');
assert.strictEqual(moduleObject.exports.__test.normalizeOpenRouterVoice(' zf_xiaoxiao '), 'zf_xiaoxiao');
assert.strictEqual(moduleObject.exports.__test.hasOpenRouterConsent({ speechEngine: 'local-cosyvoice' }), true);
assert.strictEqual(moduleObject.exports.__test.hasOpenRouterConsent({ speechEngine: 'openrouter-tts' }), false);
assert.strictEqual(
  moduleObject.exports.__test.hasOpenRouterConsent({ speechEngine: 'openrouter-tts', openRouterConsent: true }),
  true
);
assert.strictEqual(
  moduleObject.exports.__test.getOpenRouterConfigurationError({
    openRouterCredentialSource: 'key-file',
    openRouterModel: 'hexgrad/kokoro-82m',
    openRouterVoice: 'zf_xiaoxiao',
  }),
  'Set an absolute OpenRouter API key file path in the plugin settings.'
);
const secretStorageApp = {
  secretStorage: {
    getSecret: (name) => ({
      'azure-speech-key': 'azure-secret-value',
      'openrouter-api-key': 'openrouter-secret-value',
    })[name] || null,
  },
};
assert.strictEqual(moduleObject.exports.__test.hasObsidianSecretStorage(secretStorageApp), true);
assert.strictEqual(moduleObject.exports.__test.hasObsidianSecretStorage({}), false);
assert.strictEqual(
  moduleObject.exports.__test.getObsidianSecretConfigurationError(
    'openrouter-api-key',
    secretStorageApp,
    'OpenRouter API'
  ),
  ''
);
assert.match(
  moduleObject.exports.__test.getObsidianSecretConfigurationError('missing-key', secretStorageApp, 'OpenRouter API'),
  /empty or unavailable/
);
assert.strictEqual(
  moduleObject.exports.__test.getOpenRouterConfigurationError({
    openRouterCredentialSource: 'obsidian-secret',
    openRouterModel: 'hexgrad/kokoro-82m',
    openRouterSecretName: 'openrouter-api-key',
    openRouterVoice: 'zf_xiaoxiao',
  }, '', secretStorageApp),
  ''
);
assert.strictEqual(
  moduleObject.exports.__test.readObsidianSecretValue('azure-speech-key', secretStorageApp, 'Azure Speech'),
  'azure-secret-value'
);
assert.throws(
  () => moduleObject.exports.__test.readObsidianSecretValue('Invalid Secret', secretStorageApp, 'Azure Speech'),
  /lowercase letters, numbers, and dashes/
);
assert.throws(
  () => moduleObject.exports.__test.readObsidianSecretValue('missing-key', secretStorageApp, 'Azure Speech'),
  /empty or unavailable/
);
const openRouterBody = JSON.parse(moduleObject.exports.__test.buildOpenRouterTtsRequestBody('private text', {
  openRouterModel: 'hexgrad/kokoro-82m',
  openRouterVoice: 'zf_xiaoxiao',
  speed: 1.25,
}));
assert.deepStrictEqual(openRouterBody, {
  model: 'hexgrad/kokoro-82m',
  input: 'private text',
  voice: 'zf_xiaoxiao',
  response_format: 'mp3',
  speed: 1.25,
  provider: {
    data_collection: 'deny',
    zdr: true,
  },
});
const openRouterBodyWithIgnoredRelaxation = JSON.parse(
  moduleObject.exports.__test.buildOpenRouterTtsRequestBody('private text', {
    openRouterModel: 'hexgrad/kokoro-82m',
    openRouterVoice: 'zf_xiaoxiao',
    openRouterZdrOnly: false,
  })
);
assert.strictEqual(openRouterBodyWithIgnoredRelaxation.provider.zdr, true);
assert.strictEqual(openRouterBodyWithIgnoredRelaxation.provider.data_collection, 'deny');
assert.strictEqual(moduleObject.exports.__test.isRetryableRemoteError({ statusCode: 502 }), true);
assert.strictEqual(moduleObject.exports.__test.isRetryableRemoteError({ statusCode: 403 }), false);
assert.strictEqual(moduleObject.exports.__test.isRetryableRemoteError({ code: 'ECONNRESET' }), true);
assert.strictEqual(moduleObject.exports.__test.isRetryableRemoteError(new Error('invalid voice')), false);
assert.strictEqual(moduleObject.exports.__test.parseRetryAfterMs('1.5'), 1500);
assert.strictEqual(moduleObject.exports.__test.parseRetryAfterMs('120'), 10000);
assert.strictEqual(moduleObject.exports.__test.parseRetryAfterMs('invalid'), null);
const openRouterModelIds = moduleObject.exports.__test.getOpenRouterTtsModels().map(([model]) => model);
assert.deepStrictEqual(openRouterModelIds, [
  'microsoft/mai-voice-2-flash',
  'microsoft/mai-voice-2',
  'google/gemini-3.1-flash-tts-preview',
  'hexgrad/kokoro-82m',
]);
assert.ok(!openRouterModelIds.some((model) => model.startsWith('qwen/')));
assert.ok(!openRouterModelIds.some((model) => model.startsWith('x-ai/')));
assert.ok(moduleObject.exports.__test.getOpenRouterTtsPresets().every(
  ([model]) => openRouterModelIds.includes(model)
));
const openRouterVoicesByModel = new Map(openRouterModelIds.map((model) => [
  model,
  moduleObject.exports.__test.getOpenRouterTtsVoicePresets(model),
]));
for (const [model, presets] of openRouterVoicesByModel) {
  const voiceIds = presets.map(([, voice]) => voice);
  const voiceNames = presets.map(([, , label]) => label.split(' (')[0].trim().toLowerCase());
  assert.strictEqual(new Set(voiceIds).size, voiceIds.length, `${model} has duplicate voice presets`);
  assert.strictEqual(new Set(voiceNames).size, voiceNames.length, `${model} has duplicate voice names`);
  assert.ok(voiceIds.includes(
    moduleObject.exports.__test.getDefaultOpenRouterVoiceForModel(model)
  ), `${model} is missing its default voice preset`);
}
const expectedMaiFlashVoices = [
  'en-US-Ethan:MAI-Voice-2-Flash',
  'en-US-Olivia:MAI-Voice-2-Flash',
  'zh-CN-Bo:MAI-Voice-2-Flash',
  'zh-CN-Wei:MAI-Voice-2-Flash',
  'zh-CN-Lan:MAI-Voice-2-Flash',
  'zh-CN-Mei:MAI-Voice-2-Flash',
  'en-US-Harper:MAI-Voice-2',
  'es-MX-Valeria:MAI-Voice-2',
  'fr-FR-Soleil:MAI-Voice-2',
  'de-DE-Klaus:MAI-Voice-2',
];
assert.deepStrictEqual(
  openRouterVoicesByModel.get('microsoft/mai-voice-2-flash').map(([, voice]) => voice),
  expectedMaiFlashVoices
);
const expectedMaiStandardVoices = [
  'en-US-Ethan:MAI-Voice-2',
  'en-US-Grant:MAI-Voice-2',
  'en-US-Jasper:MAI-Voice-2',
  'zh-CN-Bo:MAI-Voice-2',
  'zh-CN-Lan:MAI-Voice-2',
  'zh-CN-Mei:MAI-Voice-2',
  'en-US-Harper:MAI-Voice-2',
  'es-MX-Valeria:MAI-Voice-2',
  'fr-FR-Soleil:MAI-Voice-2',
  'de-DE-Klaus:MAI-Voice-2',
];
assert.deepStrictEqual(
  openRouterVoicesByModel.get('microsoft/mai-voice-2').map(([, voice]) => voice),
  expectedMaiStandardVoices
);
assert.ok(openRouterVoicesByModel.get('microsoft/mai-voice-2-flash').some(
  ([, voice, label]) => voice === 'zh-CN-Bo:MAI-Voice-2-Flash'
    && label.includes('Mandarin male')
    && label.includes('not listed')
));
const geminiVoicePresets = openRouterVoicesByModel.get('google/gemini-3.1-flash-tts-preview');
assert.ok(geminiVoicePresets.length >= 6);
assert.ok(geminiVoicePresets.some(([, voice, label]) => voice === 'Sadaltager' && label.includes('knowledgeable')));
const kokoroVoicePresets = openRouterVoicesByModel.get('hexgrad/kokoro-82m');
assert.ok(kokoroVoicePresets.length >= 6);
for (const prefix of ['zf_', 'zm_', 'af_', 'am_', 'bf_', 'bm_']) {
  assert.ok(
    kokoroVoicePresets.filter(([, voice]) => voice.startsWith(prefix)).length >= 2,
    `Kokoro is missing two presets for ${prefix}`
  );
}
assert.ok(moduleObject.exports.__test.getOpenRouterTtsModels('chinese').find(
  ([model, , , info]) => model === 'microsoft/mai-voice-2-flash'
    && info.includes('低延迟')
    && info.includes('Ethan')
    && info.includes('没有发布英式英语')
));
assert.ok(moduleObject.exports.__test.getOpenRouterTtsModels('chinese').find(
  ([model, , , info]) => model === 'microsoft/mai-voice-2'
    && info.includes('美式英语男声 Ethan')
    && info.includes('兼容预设')
));
assert.strictEqual(
  moduleObject.exports.__test.getDefaultOpenRouterVoiceForModel('microsoft/mai-voice-2'),
  'en-US-Ethan:MAI-Voice-2'
);
assert.strictEqual(
  moduleObject.exports.__test.getDefaultOpenRouterVoiceForModel('microsoft/mai-voice-2-flash'),
  'en-US-Ethan:MAI-Voice-2-Flash'
);
assert.strictEqual(
  moduleObject.exports.__test.getDefaultOpenRouterVoiceForModel('google/gemini-3.1-flash-tts-preview'),
  'Charon'
);
assert.strictEqual(
  moduleObject.exports.__test.getDefaultOpenRouterVoiceForModel('hexgrad/kokoro-82m'),
  'bm_george'
);
assert.ok(moduleObject.exports.__test.getOpenRouterTtsVoicePresets(
  'microsoft/mai-voice-2-flash',
  'chinese'
).some(([, voice, label]) => voice === 'en-US-Harper:MAI-Voice-2' && label.includes('美式英语')));
assert.ok(moduleObject.exports.__test.getOpenRouterTtsVoicePresets(
  'microsoft/mai-voice-2-flash',
  'chinese'
).some(([, voice, label]) => voice === 'en-US-Ethan:MAI-Voice-2-Flash'
  && label.includes('美式英语男声')
  && label.includes('元数据未列出')));
for (const voice of ['zh-CN-Bo:MAI-Voice-2', 'zh-CN-Lan:MAI-Voice-2', 'zh-CN-Mei:MAI-Voice-2']) {
  assert.ok(moduleObject.exports.__test.getOpenRouterTtsVoicePresets(
    'microsoft/mai-voice-2',
    'chinese'
  ).some(([, presetVoice, label]) => presetVoice === voice
    && label.includes('中文普通话')
    && label.includes('元数据未列出')));
}
assert.ok(moduleObject.exports.__test.getOpenRouterTtsPresets().some(
  ([model, voice]) => model === 'hexgrad/kokoro-82m' && voice === 'zf_xiaoxiao'
));
for (const voice of ['am_michael', 'am_fenrir', 'bm_george', 'bm_fable']) {
  assert.ok(kokoroVoicePresets.some(([, presetVoice, label]) => presetVoice === voice
    && label.includes('English male')));
}
assert.ok(moduleObject.exports.__test.getAzureSpeechVoicePresets('chinese').some(
  ([id, label]) => id === 'en-US-JennyNeural' && label.includes('美式英语')
));
assert.ok(moduleObject.exports.__test.getAzureSpeechVoicePresets().some(([id]) => id === 'zh-CN-XiaoxiaoNeural'));
assert.ok(moduleObject.exports.__test.getAzureSpeechVoicePresets().some(([id]) => id === 'en-US-JennyNeural'));
assert.ok(moduleObject.exports.__test.getAzureSpeechVoicePresets().some(([id]) => id === 'en-GB-SoniaNeural'));
assert.ok(moduleObject.exports.__test.getEdgeTtsVoicePresets().some(([id]) => id === 'zh-CN-YunxiNeural'));
assert.ok(moduleObject.exports.__test.getEdgeTtsVoicePresets().some(([id]) => id === 'en-US-GuyNeural'));
assert.ok(moduleObject.exports.__test.getEdgeTtsVoicePresets().some(([id]) => id === 'en-GB-RyanNeural'));
assert.strictEqual(moduleObject.exports.__test.isOwnedCacheFileName('1750000000000-7-1.txt'), true);
assert.strictEqual(moduleObject.exports.__test.isOwnedCacheFileName('1750000000000-7-export.mp3'), true);
assert.strictEqual(moduleObject.exports.__test.isOwnedCacheFileName('diagnostic.log'), true);
assert.strictEqual(moduleObject.exports.__test.isOwnedCacheFileName('keep-me.txt'), false);
assert.strictEqual(moduleObject.exports.__test.getAudioExportExtension('local-cosyvoice'), 'wav');
assert.strictEqual(moduleObject.exports.__test.getAudioExportExtension('openrouter-tts'), 'mp3');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportLocation('note-folder'), 'note-folder');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportLocation('custom-folder'), 'custom-folder');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportLocation('outside-vault'), 'obsidian-attachment');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportFolder('Audio\\Academic/'), 'Audio/Academic');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportFolder('../outside'), '');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportFolder('Audio/ .. /outside'), '');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportFolder('Audio\0outside'), '');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportFolder('C:\\outside'), '');
assert.strictEqual(
  moduleObject.exports.__test.getAvailableVaultAudioPath({
    getAbstractFileByPath: (candidate) => candidate === 'Audio/Paper - narration.mp3'
      ? { path: candidate }
      : null,
  }, 'Audio/Paper - narration.mp3'),
  'Audio/Paper - narration 1.mp3'
);
const onlineExportSummary = moduleObject.exports.__test.createAudioExportSummary({
  chunkCount: 12,
  documentKind: 'pdf',
  engineLabel: 'OpenRouter TTS',
  insertAfterExport: true,
  noteName: 'Paper',
  scope: 'from-selection',
  speechEngine: 'openrouter-tts',
  targetPath: 'Audio/Paper - narration.mp3',
  textLength: 1234,
});
assert.strictEqual(onlineExportSummary.isOnline, true);
assert.strictEqual(onlineExportSummary.insertAfterExport, true);
assert.strictEqual(onlineExportSummary.documentKind, 'pdf');
assert.strictEqual(onlineExportSummary.scope, 'from-selection');
assert.ok(moduleObject.exports.__test.getAudioExportUiText('english', onlineExportSummary).quotaWarning.includes('12 planned sequential segments'));
assert.strictEqual(moduleObject.exports.__test.getAudioExportUiText('english', onlineExportSummary).locationLabel, 'Planned save location');
assert.strictEqual(moduleObject.exports.__test.getAudioExportUiText('english', onlineExportSummary).scopeValue, 'From selection to end');
assert.ok(moduleObject.exports.__test.getAudioExportUiText('chinese', onlineExportSummary).acknowledge.includes('API 额度'));
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportScope('selection'), 'selection');
assert.strictEqual(moduleObject.exports.__test.normalizeAudioExportScope('unknown'), 'entire');
assert.strictEqual(
  moduleObject.exports.__test.selectMarkdownAudioExportText(
    'First line\nSecond selected line\nThird line',
    'Second selected line',
    { line: 1, ch: 0 },
    'selection'
  ),
  'Second selected line'
);
assert.strictEqual(
  moduleObject.exports.__test.selectMarkdownAudioExportText(
    'First line\nSecond selected line\nThird line',
    'Second selected line',
    { line: 1, ch: 7 },
    'from-selection'
  ),
  'selected line\nThird line'
);
assert.strictEqual(
  moduleObject.exports.__test.getAudioExportScopeUiText('chinese', {
    documentKind: 'pdf',
    hasSelection: true,
  }).fromSelection,
  '从选中位置到末尾'
);
const quotaError = moduleObject.exports.__test.createRemoteHttpError('OpenRouter TTS', 402, 'fallback');
assert.strictEqual(quotaError.category, 'quota');
assert.ok(quotaError.message.includes('credit, balance, or spending limit'));
const rateLimitError = moduleObject.exports.__test.createRemoteHttpError('OpenRouter TTS', 429, 'fallback', '2');
assert.strictEqual(rateLimitError.category, 'rate-limit');
assert.ok(rateLimitError.message.includes('rate limit or request quota'));
assert.ok(rateLimitError.message.includes('Retry-After delay of 2 seconds'));
assert.ok(moduleObject.exports.__test.createRemoteRetryExhaustedError(
  'OpenRouter TTS',
  rateLimitError,
  3
).message.includes('rate limit or request quota is still exceeded'));
assert.strictEqual(moduleObject.exports.__test.createSafeRuntimeLogEvent('start'), null);
assert.deepStrictEqual(
  moduleObject.exports.__test.createSafeRuntimeLogEvent(
    'failed',
    { speechEngine: 'edge-tts' },
    '2026-08-25T00:00:00.000Z'
  ),
  { time: '2026-08-25T00:00:00.000Z', stage: 'failed', engine: 'Edge TTS' }
);
const edgeArgs = moduleObject.exports.__test.buildEdgeTtsArgs('in.txt', 'out.mp3', {
  edgeTtsVoice: 'zh-CN-XiaoyiNeural',
  speed: 1.25,
});
assert.ok(edgeArgs.some((arg) => arg.includes('+25%')));
assert.ok(edgeArgs.includes('--file'));
assert.ok(edgeArgs.includes('in.txt'));
assert.ok(!edgeArgs.includes('--text'));
const mutatedDefaults = moduleObject.exports.__test.createDefaultSettings();
mutatedDefaults.chunkLimits = '999';
assert.strictEqual(moduleObject.exports.__test.createDefaultSettings().chunkLimits, '40,80,120,160,280,320');
assert.deepStrictEqual(
  moduleObject.exports.__test.selectKnownSettings({ first: 1, second: 2 }, { first: 3, obsolete: 4 }),
  { first: 3, second: 2 }
);
assert.deepStrictEqual(moduleObject.exports.__test.getSpeedPresets(), [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4]);
const mutatedSpeedPresets = moduleObject.exports.__test.getSpeedPresets();
mutatedSpeedPresets.push(99);
assert.deepStrictEqual(moduleObject.exports.__test.getSpeedPresets(), [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4]);
assert.strictEqual(moduleObject.exports.__test.formatSpeedLabel(1), '1x');
assert.strictEqual(moduleObject.exports.__test.formatSpeedLabel(1.1), '1.1x');
assert.strictEqual(moduleObject.exports.__test.formatSpeedLabel(1.25), '1.25x');
assert.strictEqual(
  moduleObject.exports.__test.formatProgressLabel({ currentChunk: 2, totalChunks: 5 }),
  '2 / 5'
);
assert.strictEqual(
  moduleObject.exports.__test.sanitizeTextForSpeech('长公式 $\\int_0^1 x^2 + y^2 + z^2 dx$ 跳过，短公式 $a_b$ 读。'),
  '长公式 跳过，短公式 a subscript b 读。'
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
assert.strictEqual(moduleObject.exports.__test.isPdfFile({ extension: 'pdf' }), true);
assert.strictEqual(moduleObject.exports.__test.isPdfFile({ extension: 'PDF' }), true);
assert.strictEqual(moduleObject.exports.__test.isPdfFile({ extension: 'md' }), false);
assert.strictEqual(
  moduleObject.exports.__test.extractTextFromPdfItems([
    { str: 'Multi-', hasEOL: true },
    { str: 'column' },
    { str: 'reading' },
    { str: '.', hasEOL: true },
    { str: '中文' },
    { str: '朗读' },
    { str: '。' },
  ]),
  'Multicolumn reading.\n中文朗读。'
);
assert.strictEqual(
  moduleObject.exports.__test.extractTextFromPdfItems([
    { str: 'Hello' },
    { str: ',' },
    { str: 'world' },
    { str: '!' },
  ]),
  'Hello, world!'
);
assert.strictEqual(
  moduleObject.exports.__test.joinPdfPageText(['First page.', '', '  第二页。  ']),
  'First page.\n\n第二页。'
);
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection(
    'Introduction.\nSelected passage continues on this page.',
    'Selected passage'
  ),
  { matched: true, text: 'Selected passage continues on this page.' }
);
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection(
    'A multi-\ncolumn anchor continues.',
    'multicolumn anchor'
  ),
  { matched: true, text: 'multicolumn anchor continues.' }
);
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection('Page text only.', 'missing selection'),
  { matched: false, text: 'Page text only.' }
);
const repeatedPdfLayout = {
  lines: [
    { text: 'Repeated passage in the full-width abstract.', xMax: 550, xMin: 50, y: 700 },
    { text: 'Left-column context.', xMax: 280, xMin: 50, y: 500 },
    { text: 'Repeated passage in the right-column body.', xMax: 550, xMin: 320, y: 500 },
    { text: 'Right-column continuation.', xMax: 550, xMin: 320, y: 480 },
  ],
  pageHeight: 800,
  pageWidth: 600,
  twoColumn: true,
};
const repeatedPdfText = repeatedPdfLayout.lines.map((line) => line.text).join('\n');
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection(repeatedPdfText, 'Repeated passage'),
  {
    matched: true,
    text: 'Repeated passage in the full-width abstract. Left-column context. Repeated passage in the right-column body. Right-column continuation.',
  }
);
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection(
    repeatedPdfText,
    'Repeated passage',
    {
      layout: repeatedPdfLayout,
      selectionPosition: { xRatio: 0.6, yRatio: 0.375 },
    }
  ),
  {
    matched: true,
    text: 'Repeated passage in the right-column body. Right-column continuation.',
  }
);
assert.deepStrictEqual(
  moduleObject.exports.__test.slicePdfTextFromSelection(
    repeatedPdfText,
    'Re',
    {
      layout: repeatedPdfLayout,
      selectionPosition: { xRatio: 0.6, yRatio: 0.375 },
    }
  ),
  {
    matched: true,
    text: 'Repeated passage in the right-column body. Right-column continuation.',
  }
);
const pdfSelectionRoot = {
  contains(node) {
    return node === pdfSelectionTextNode || node === pdfSelectionPage;
  },
};
const pdfSelectionPage = {
  nodeType: 1,
  parentElement: pdfSelectionRoot,
  getAttribute(name) {
    return name === 'data-page-number' ? '3' : null;
  },
};
const pdfSelectionTextNode = { nodeType: 3, parentElement: pdfSelectionPage };
const pdfSelectionFile = { extension: 'pdf', name: 'paper.pdf', path: 'papers/paper.pdf' };
const pdfSelectionContext = moduleObject.exports.__test.getPdfSelectionContext({
  rangeCount: 1,
  getRangeAt: () => ({ startContainer: pdfSelectionTextNode }),
  toString: () => 'Selected PDF passage',
}, [{ view: { containerEl: pdfSelectionRoot, file: pdfSelectionFile } }], null, 12345);
assert.deepStrictEqual(pdfSelectionContext, {
  capturedAt: 12345,
  filePath: 'papers/paper.pdf',
  pageNumber: 3,
  selectedText: 'Selected PDF passage',
});
pdfSelectionPage.getBoundingClientRect = () => ({
  height: 700,
  left: 100,
  top: 100,
  width: 500,
});
const positionedPdfSelectionContext = moduleObject.exports.__test.getPdfSelectionContext({
  rangeCount: 1,
  getRangeAt: () => ({
    cloneRange: () => ({
      collapse: () => {},
      getClientRects: () => [{ height: 14, left: 360, top: 250, width: 1 }],
    }),
    startContainer: pdfSelectionTextNode,
  }),
  toString: () => 'Selected PDF passage',
}, [{ view: { containerEl: pdfSelectionRoot, file: pdfSelectionFile } }], null, 12345);
assert.deepStrictEqual(positionedPdfSelectionContext, {
  capturedAt: 12345,
  filePath: 'papers/paper.pdf',
  pageNumber: 3,
  selectedText: 'Selected PDF passage',
  selectionPosition: {
    xRatio: 0.52,
    yRatio: 157 / 700,
  },
});

const root = new FakeElement('section');
let pauseOrResumeCalls = 0;
let readFileCalls = 0;
const exportNoteCalls = [];
const seekBySecondsCalls = [];
const chunkNavigationCalls = [];
const readerView = new moduleObject.exports.__test.CosyVoiceReaderView({}, {
  readerState: moduleObject.exports.__test.createReaderState({
    canNextChunk: true,
    canPause: true,
    canPreviousChunk: true,
    canSeek: true,
    canStop: true,
    currentChunk: 2,
    isPaused: false,
    label: 'CosyVoice playing',
    phase: 'playing',
    status: 'running',
    totalChunks: 4,
  }),
  settings: moduleObject.exports.__test.createDefaultSettings(),
  handleReaderKeydown(event, options) {
    return PluginClass.prototype.handleReaderKeydown.call(this, event, options);
  },
  jumpToAdjacentChunk: (deltaChunks) => {
    chunkNavigationCalls.push(deltaChunks);
  },
  pauseOrResume: async () => {
    pauseOrResumeCalls += 1;
  },
  readCurrentNote: () => {
    readFileCalls += 1;
  },
  readFromSelection: () => {},
  readSelection: () => {},
  runUserAction: async (_label, action) => action(),
  exportCurrentFileAudio: (options) => {
    exportNoteCalls.push(options);
  },
  seekCurrentAudioBySeconds: (deltaSeconds) => {
    seekBySecondsCalls.push(deltaSeconds);
    return true;
  },
  seekToProgress: () => {},
  setSpeechSpeed: () => {},
  stopReading: () => {},
});
readerView.contentEl = root;
readerView.containerEl = { children: [null, root] };
readerView.render();

assert.strictEqual(root.attributes.tabindex, '0');
const readFileButton = findElementByAriaLabel(root, 'Read file');
assert.ok(readFileButton);
assert.strictEqual(readFileButton.disabled, false);
const readFilePointerEvent = createPointerEvent();
readFileButton.dispatchEvent(readFilePointerEvent);
assert.strictEqual(readFileCalls, 1);
assert.strictEqual(readFilePointerEvent.defaultPrevented, true);
readFileButton.dispatchEvent(createPointerEvent({ type: 'click' }));
assert.strictEqual(readFileCalls, 1);
const exportNoteButton = findElementByAriaLabel(root, 'Export audio');
const exportInsertButton = findElementByAriaLabel(root, 'Export & insert audio');
assert.ok(exportNoteButton);
assert.ok(exportInsertButton);
assert.strictEqual(exportNoteButton.disabled, false);
assert.strictEqual(exportInsertButton.disabled, false);
exportNoteButton.dispatchEvent(createPointerEvent());
exportInsertButton.dispatchEvent(createPointerEvent());
assert.deepStrictEqual(exportNoteCalls, [
  { insertAfterExport: false },
  { insertAfterExport: true },
]);
const spaceEvent = createKeyboardEvent();
root.dispatchEvent(spaceEvent);
assert.strictEqual(pauseOrResumeCalls, 1);
assert.strictEqual(spaceEvent.defaultPrevented, true);
assert.strictEqual(spaceEvent.propagationStopped, true);

const inputSpaceEvent = createKeyboardEvent({ target: new FakeElement('input') });
root.dispatchEvent(inputSpaceEvent);
assert.strictEqual(pauseOrResumeCalls, 1);
assert.strictEqual(inputSpaceEvent.defaultPrevented, false);

const leftArrowEvent = createKeyboardEvent({ code: 'ArrowLeft', key: 'ArrowLeft' });
root.dispatchEvent(leftArrowEvent);
assert.deepStrictEqual(seekBySecondsCalls, [-5]);
assert.strictEqual(leftArrowEvent.defaultPrevented, true);
assert.strictEqual(leftArrowEvent.propagationStopped, true);
assert.strictEqual(root.focusCount, 1);

const rightArrowEvent = createKeyboardEvent({ code: 'ArrowRight', key: 'ArrowRight' });
root.dispatchEvent(rightArrowEvent);
assert.deepStrictEqual(seekBySecondsCalls, [-5, 5]);
assert.strictEqual(root.focusCount, 2);

const nextChunkButton = findElementByAriaLabel(root, 'Next chunk');
assert.ok(nextChunkButton);
const buttonArrowEvent = createKeyboardEvent({
  code: 'ArrowRight',
  key: 'ArrowRight',
  target: nextChunkButton,
});
root.dispatchEvent(buttonArrowEvent);
assert.deepStrictEqual(seekBySecondsCalls, [-5, 5, 5]);

const progressInput = findElementByAriaLabel(root, 'Reading progress');
assert.ok(progressInput);
const progressArrowEvent = createKeyboardEvent({
  code: 'ArrowLeft',
  key: 'ArrowLeft',
  target: progressInput,
});
root.dispatchEvent(progressArrowEvent);
assert.deepStrictEqual(seekBySecondsCalls, [-5, 5, 5, -5]);

const inputArrowEvent = createKeyboardEvent({
  code: 'ArrowRight',
  key: 'ArrowRight',
  target: new FakeElement('input'),
});
root.dispatchEvent(inputArrowEvent);
assert.deepStrictEqual(seekBySecondsCalls, [-5, 5, 5, -5]);
assert.strictEqual(inputArrowEvent.defaultPrevented, false);

const pauseButton = findElementByAriaLabel(root, 'Pause');
assert.ok(pauseButton);
assert.strictEqual(pauseButton.attributes.title, 'Pause reading (or press Space)');
const pausePointerEvent = createPointerEvent();
pauseButton.dispatchEvent(pausePointerEvent);
assert.strictEqual(pauseOrResumeCalls, 2);
assert.strictEqual(pausePointerEvent.defaultPrevented, true);

const pausedRoot = new FakeElement('section');
readerView.plugin.readerState = moduleObject.exports.__test.createReaderState({
  canPause: true,
  isPaused: true,
  label: 'CosyVoice paused',
  phase: 'paused',
  status: 'paused',
});
const pausedReaderView = new moduleObject.exports.__test.CosyVoiceReaderView({}, readerView.plugin);
pausedReaderView.contentEl = pausedRoot;
pausedReaderView.containerEl = { children: [null, pausedRoot] };
pausedReaderView.render();
const resumeButton = findElementByAriaLabel(pausedRoot, 'Resume');
assert.ok(resumeButton);
assert.strictEqual(resumeButton.attributes.title, 'Resume reading (or press Space)');

const previousChunkButton = findElementByAriaLabel(root, 'Previous chunk');
assert.ok(previousChunkButton);
previousChunkButton.dispatchEvent(createPointerEvent());
assert.deepStrictEqual(chunkNavigationCalls, [-1]);

previousChunkButton.dispatchEvent(createPointerEvent({ type: 'click' }));
assert.deepStrictEqual(chunkNavigationCalls, [-1]);

nextChunkButton.dispatchEvent(createPointerEvent({ type: 'click' }));
assert.deepStrictEqual(chunkNavigationCalls, [-1, 1]);

(async () => {
  const startupVaultDir = path.join(__dirname, '.test-startup-vault');
  fs.rmSync(startupVaultDir, { force: true, recursive: true });
  fs.mkdirSync(startupVaultDir, { recursive: true });
  const legacyPluginDir = path.join(startupVaultDir, '.obsidian', 'plugins', 'note-reader-cosyvoice');
  const legacyCacheDir = path.join(legacyPluginDir, 'cache');
  const legacyOwnedFile = path.join(legacyCacheDir, '1750000000000-1-0.txt');
  const legacyKeepFile = path.join(legacyCacheDir, 'keep-me.txt');
  const legacyLogFile = path.join(legacyPluginDir, 'last-error.log');
  fs.mkdirSync(legacyCacheDir, { recursive: true });
  fs.writeFileSync(legacyOwnedFile, 'private text');
  fs.writeFileSync(legacyKeepFile, 'unrelated');
  fs.writeFileSync(legacyLogFile, 'legacy details');

  const startupTempCacheDir = moduleObject.exports.__test.getPluginTempCacheDir(startupVaultDir);
  fs.rmSync(startupTempCacheDir, { force: true, recursive: true });
  fs.mkdirSync(startupTempCacheDir, { recursive: true });
  const staleTempFile = path.join(startupTempCacheDir, '1750000000001-1-0.mp3');
  const staleDiagnosticLog = path.join(startupTempCacheDir, 'diagnostic.log');
  fs.writeFileSync(staleTempFile, Buffer.alloc(64));
  fs.writeFileSync(staleDiagnosticLog, 'bounded log');
  const startupPlugin = Object.create(PluginClass.prototype);
  let startupDomEvents = 0;
  startupPlugin.app = {
    vault: {
      adapter: {
        getBasePath: () => startupVaultDir,
      },
    },
    workspace: {
      detachLeavesOfType: () => {},
      getActiveViewOfType: () => null,
      getLeavesOfType: () => [],
      getRightLeaf: () => ({
        setViewState: async () => {},
      }),
      on: () => ({}),
      revealLeaf: async () => {},
    },
  };
  const startupCommandIds = [];
  startupPlugin.addCommand = (command) => {
    startupCommandIds.push(command.id);
  };
  startupPlugin.addRibbonIcon = () => {};
  startupPlugin.addSettingTab = () => {};
  startupPlugin.addStatusBarItem = () => ({ setText: () => {} });
  startupPlugin.loadData = async () => ({
    edgeTtsVoice: 'en-GB-RyanNeural',
    obsoleteSetting: 'remove-me',
  });
  startupPlugin.register = () => {};
  startupPlugin.registerDomEvent = () => {
    startupDomEvents += 1;
  };
  startupPlugin.registerEvent = () => {};
  startupPlugin.registerView = () => {};
  let startupSavedData = null;
  startupPlugin.saveData = async (value) => {
    startupSavedData = value;
  };

  await startupPlugin.onload();

  assert.strictEqual(startupDomEvents, 0);
  assert.strictEqual(startupPlugin.cacheDir, startupTempCacheDir);
  assert.strictEqual(startupPlugin.settings.edgeTtsVoice, 'en-GB-RyanNeural');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(startupPlugin.settings, 'obsoleteSetting'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(startupSavedData, 'obsoleteSetting'), false);
  assert.ok(startupCommandIds.includes('seek-backward-5-seconds'));
  assert.ok(startupCommandIds.includes('seek-forward-5-seconds'));
  assert.ok(startupCommandIds.includes('previous-reading-chunk'));
  assert.ok(startupCommandIds.includes('next-reading-chunk'));
  assert.ok(startupCommandIds.includes('resume-current-file'));
  assert.ok(startupCommandIds.includes('export-current-note-audio'));
  assert.ok(startupCommandIds.includes('export-current-note-audio-and-insert'));
  assert.ok(startupCommandIds.includes('retry-audio-export-merge'));
  assert.strictEqual(fs.existsSync(legacyOwnedFile), false);
  assert.strictEqual(fs.existsSync(legacyKeepFile), true);
  assert.strictEqual(fs.existsSync(legacyLogFile), false);
  assert.strictEqual(fs.existsSync(staleTempFile), false);
  assert.strictEqual(fs.existsSync(staleDiagnosticLog), false);
  await startupPlugin.onunload();
  fs.rmSync(startupTempCacheDir, { force: true, recursive: true });
  fs.rmSync(startupVaultDir, { force: true, recursive: true });

  const exportTempDir = path.join(__dirname, '.test-audio-export');
  fs.rmSync(exportTempDir, { force: true, recursive: true });
  fs.mkdirSync(exportTempDir, { recursive: true });
  const exportFile = {
    basename: 'Research note',
    extension: 'md',
    name: 'Research note.md',
    path: 'Notes/Research note.md',
    stat: { mtime: 1234 },
  };
  const exportView = {
    editor: {
      getValue: () => 'First paragraph for export. Second paragraph for export.',
    },
    file: exportFile,
  };
  const exportPlugin = Object.create(PluginClass.prototype);
  exportPlugin.app = {
    workspace: {
      getActiveFile: () => exportFile,
      getActiveViewOfType: () => null,
      getLeavesOfType: (type) => type === 'markdown' ? [{ view: exportView }] : [],
    },
  };
  exportPlugin.cacheDir = exportTempDir;
  exportPlugin.currentAudio = null;
  exportPlugin.currentProcess = null;
  exportPlugin.currentRequests = new Set();
  exportPlugin.readerState = moduleObject.exports.__test.createReaderState();
  exportPlugin.readerViews = new Set();
  exportPlugin.sequence = 0;
  exportPlugin.lastMarkdownView = exportView;
  exportPlugin.lastReadableFile = exportFile;
  exportPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: true,
    chunkLimits: '18,24',
    speechEngine: 'local-cosyvoice',
  };
  exportPlugin.getSpeechConfiguration = () => ({
    chunkLimits: [18, 24],
    engineLabel: 'Local CosyVoice',
    prefetchChunks: 1,
    speechEngine: 'local-cosyvoice',
  });
  assert.strictEqual(exportPlugin.canExportCurrentNote(), true);
  assert.strictEqual(exportPlugin.getCurrentNoteExportContext().view, exportView);
  let exportSummary = null;
  let exportPrepareCalls = 0;
  let exportStopCalls = 0;
  exportPlugin.requestAudioExportConfirmation = async (summary) => {
    exportSummary = summary;
    return false;
  };
  exportPlugin.activateControlView = async () => {};
  exportPlugin.stopReading = async () => {
    exportStopCalls += 1;
  };
  exportPlugin.prepareChunk = async () => {
    exportPrepareCalls += 1;
    throw new Error('confirmation gate failed');
  };
  assert.strictEqual(await exportPlugin.exportCurrentNoteAudio(), null);
  assert.ok(exportSummary.chunkCount > 1);
  assert.strictEqual(exportSummary.targetPath, 'Notes/Research note - narration.wav');
  assert.strictEqual(exportPrepareCalls, 0);
  assert.strictEqual(exportStopCalls, 0);

  function createExportTestWave(sample) {
    const output = Buffer.alloc(46);
    output.write('RIFF', 0, 'ascii');
    output.writeUInt32LE(38, 4);
    output.write('WAVE', 8, 'ascii');
    output.write('fmt ', 12, 'ascii');
    output.writeUInt32LE(16, 16);
    output.writeUInt16LE(1, 20);
    output.writeUInt16LE(1, 22);
    output.writeUInt32LE(24000, 24);
    output.writeUInt32LE(48000, 28);
    output.writeUInt16LE(2, 32);
    output.writeUInt16LE(16, 34);
    output.write('data', 36, 'ascii');
    output.writeUInt32LE(2, 40);
    output.writeInt16LE(sample, 44);
    return output;
  }

  exportPlugin.requestAudioExportConfirmation = async () => true;
  exportPlugin.createSpeechSession = PluginClass.prototype.createSpeechSession;
  exportPlugin.isActive = PluginClass.prototype.isActive;
  exportPlugin.updateStatus = (_label, patch = {}) => {
    exportPlugin.readerState = { ...exportPlugin.readerState, ...patch };
  };
  exportPlugin.writeRuntimeLog = async () => {};
  exportPlugin.cleanupSessionFiles = async () => {};
  exportPlugin.cancelSessionOperations = async (session) => {
    session.stopped = true;
  };
  exportPlugin.prepareChunk = async (_text, index, session) => {
    exportPrepareCalls += 1;
    const outputPath = path.join(exportTempDir, `chunk-${index}.wav`);
    fs.writeFileSync(outputPath, createExportTestWave(index + 1));
    session.files.push(outputPath);
    return { outputPath };
  };
  let exportedAttachmentInput = null;
  exportPlugin.createVaultAudioAttachment = async (_noteFile, temporaryAudioPath, extension, targetPlan) => {
    exportedAttachmentInput = fs.readFileSync(temporaryAudioPath);
    assert.strictEqual(extension, 'wav');
    assert.deepStrictEqual(targetPlan, {
      location: 'obsidian-attachment',
      targetPath: 'Notes/Research note - narration.wav',
    });
    return { path: 'Attachments/Research note - narration.wav' };
  };
  let insertedExport = false;
  exportPlugin.insertAudioAttachmentIntoNote = async () => {
    insertedExport = true;
    return 'cursor';
  };
  exportPrepareCalls = 0;
  const exportedAttachment = await exportPlugin.exportCurrentNoteAudio({ insertAfterExport: true });
  assert.strictEqual(exportStopCalls, 1);
  assert.strictEqual(exportPrepareCalls, exportSummary.chunkCount);
  assert.strictEqual(exportedAttachment.path, 'Attachments/Research note - narration.wav');
  assert.strictEqual(exportedAttachmentInput.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(insertedExport, true);
  assert.strictEqual(exportPlugin.activeSession, null);

  exportPlugin.cleanupSessionFiles = PluginClass.prototype.cleanupSessionFiles;
  exportPlugin.removeTempFile = PluginClass.prototype.removeTempFile;
  exportPlugin.pendingAudioMerge = null;
  let mergeFailurePrepareCalls = 0;
  exportPlugin.prepareChunk = async (_text, index, session) => {
    mergeFailurePrepareCalls += 1;
    const outputPath = path.join(exportTempDir, `merge-failure-chunk-${index}.wav`);
    fs.writeFileSync(outputPath, index === 1 ? Buffer.alloc(64) : createExportTestWave(index + 10));
    session.files.push(outputPath);
    return { outputPath };
  };
  exportPlugin.createVaultAudioAttachment = async () => {
    throw new Error('Attachment creation must not run before a successful merge.');
  };
  const failedMergeExport = await exportPlugin.exportCurrentNoteAudio({ insertAfterExport: false });
  assert.strictEqual(failedMergeExport, null);
  assert.ok(exportPlugin.pendingAudioMerge);
  assert.strictEqual(exportPlugin.pendingAudioMerge.preparedPaths.length, exportSummary.chunkCount);
  assert.ok(exportPlugin.pendingAudioMerge.preparedPaths.every((filePath) => fs.existsSync(filePath)));
  assert.ok(exportPlugin.readerState.error.includes('Retry merge only'));
  assert.ok(exportPlugin.readerState.error.includes('does not call the TTS API again'));

  const keptMergePaths = exportPlugin.pendingAudioMerge.preparedPaths.slice();
  keptMergePaths.forEach((filePath, index) => {
    fs.writeFileSync(filePath, createExportTestWave(index + 20));
  });
  exportPlugin.prepareChunk = async () => {
    throw new Error('Retry merge only must not synthesize any audio.');
  };
  exportPlugin.createVaultAudioAttachment = async (_noteFile, temporaryAudioPath, extension, targetPlan) => {
    assert.strictEqual(extension, 'wav');
    assert.strictEqual(fs.readFileSync(temporaryAudioPath).toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(targetPlan.targetPath, 'Notes/Research note - narration.wav');
    return { path: 'Attachments/Research note - narration retry.wav' };
  };
  const retriedMergeAttachment = await exportPlugin.retryPendingAudioMerge();
  assert.strictEqual(retriedMergeAttachment.path, 'Attachments/Research note - narration retry.wav');
  assert.strictEqual(exportPlugin.pendingAudioMerge, null);
  assert.strictEqual(mergeFailurePrepareCalls, exportSummary.chunkCount);
  assert.ok(keptMergePaths.every((filePath) => !fs.existsSync(filePath)));

  const pdfExportFile = {
    basename: 'Research paper',
    extension: 'pdf',
    name: 'Research paper.pdf',
    path: 'Papers/Research paper.pdf',
    stat: { mtime: 2222 },
  };
  const pdfSelectionContext = {
    pageNumber: 3,
    selectedText: 'Selected PDF paragraph for audio export.',
    selectionPosition: { xRatio: 0.6, yRatio: 0.3 },
  };
  exportPlugin.getCurrentAudioExportContext = () => ({
    documentKind: 'pdf',
    file: pdfExportFile,
    fileMtime: 2222,
    fileName: 'Research paper',
    hasSelection: true,
    selectionContext: pdfSelectionContext,
  });
  exportPlugin.isAudioExportContextCurrent = () => true;
  exportPlugin.settings.audioExportLocation = 'note-folder';
  const pdfPreparedText = [];
  exportPlugin.prepareChunk = async (text, index, session) => {
    pdfPreparedText.push(text);
    const outputPath = path.join(exportTempDir, `pdf-export-chunk-${index}.wav`);
    fs.writeFileSync(outputPath, createExportTestWave(index + 30));
    session.files.push(outputPath);
    return { outputPath };
  };
  let pdfExportTargetPlan = null;
  exportPlugin.createVaultAudioAttachment = async (_file, temporaryAudioPath, extension, targetPlan) => {
    assert.strictEqual(extension, 'wav');
    assert.strictEqual(fs.readFileSync(temporaryAudioPath).toString('ascii', 0, 4), 'RIFF');
    pdfExportTargetPlan = targetPlan;
    return { path: targetPlan.targetPath };
  };
  const selectedPdfAudio = await exportPlugin.exportCurrentFileAudio({
    insertAfterExport: false,
    scope: 'selection',
  });
  assert.strictEqual(selectedPdfAudio.path, 'Papers/Research paper - selection narration.wav');
  assert.strictEqual(pdfExportTargetPlan.targetPath, selectedPdfAudio.path);
  assert.ok(pdfPreparedText.join(' ').includes('Selected PDF paragraph for audio export'));

  let extractedPdfScope = null;
  exportPlugin.extractPdfAudioExportText = async (_context, scope) => {
    extractedPdfScope = scope;
    return 'Selected PDF paragraph followed by the remaining pages.';
  };
  const continuedPdfAudio = await exportPlugin.exportCurrentFileAudio({
    insertAfterExport: false,
    scope: 'from-selection',
  });
  assert.strictEqual(extractedPdfScope, 'from-selection');
  assert.strictEqual(continuedPdfAudio.path, 'Papers/Research paper - continued narration.wav');

  const attachmentSourcePath = path.join(exportTempDir, 'attachment-source.wav');
  fs.writeFileSync(attachmentSourcePath, createExportTestWave(7));
  const attachmentPlugin = Object.create(PluginClass.prototype);
  let requestedAttachment = null;
  let createdAttachment = null;
  const createdAudioFile = { path: 'Attachments/Research note - narration.wav' };
  attachmentPlugin.app = {
    fileManager: {
      generateMarkdownLink: (file, sourcePath) => {
        assert.strictEqual(file, createdAudioFile);
        assert.strictEqual(sourcePath, exportFile.path);
        return '[[Attachments/Research note - narration.wav]]';
      },
      getAvailablePathForAttachment: async (fileName, sourcePath) => {
        requestedAttachment = { fileName, sourcePath };
        return createdAudioFile.path;
      },
    },
    vault: {
      createBinary: async (targetPath, arrayBuffer) => {
        createdAttachment = { bytes: Buffer.from(arrayBuffer), targetPath };
        return createdAudioFile;
      },
    },
    workspace: {
      getActiveViewOfType: () => null,
    },
  };
  assert.strictEqual(
    await attachmentPlugin.createVaultAudioAttachment(exportFile, attachmentSourcePath, 'wav'),
    createdAudioFile
  );
  assert.deepStrictEqual(requestedAttachment, {
    fileName: 'Research note - narration.wav',
    sourcePath: exportFile.path,
  });
  assert.strictEqual(createdAttachment.targetPath, createdAudioFile.path);
  assert.strictEqual(createdAttachment.bytes.toString('ascii', 0, 4), 'RIFF');

  attachmentPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    audioExportLocation: 'note-folder',
  };
  attachmentPlugin.app.vault.getAbstractFileByPath = (candidate) => (
    candidate === 'Notes/Research note - narration.wav' ? { path: candidate } : null
  );
  assert.deepStrictEqual(
    await attachmentPlugin.getAudioExportTargetPlan(exportFile, 'wav'),
    {
      location: 'note-folder',
      targetPath: 'Notes/Research note - narration 1.wav',
    }
  );

  const customFolders = new Set();
  let customCreatedAttachment = null;
  attachmentPlugin.settings.audioExportLocation = 'custom-folder';
  attachmentPlugin.settings.audioExportFolder = 'Audio exports/Academic';
  attachmentPlugin.app.vault.getAbstractFileByPath = (candidate) => (
    customFolders.has(candidate) ? { children: [], path: candidate } : null
  );
  attachmentPlugin.app.vault.createFolder = async (folderPath) => {
    customFolders.add(folderPath);
  };
  attachmentPlugin.app.vault.createBinary = async (targetPath, arrayBuffer) => {
    customCreatedAttachment = { bytes: Buffer.from(arrayBuffer), path: targetPath };
    return customCreatedAttachment;
  };
  const customPlan = await attachmentPlugin.getAudioExportTargetPlan(exportFile, 'wav');
  assert.deepStrictEqual(customPlan, {
    location: 'custom-folder',
    targetPath: 'Audio exports/Academic/Research note - narration.wav',
  });
  assert.strictEqual(
    await attachmentPlugin.createVaultAudioAttachment(
      exportFile,
      attachmentSourcePath,
      'wav',
      customPlan
    ),
    customCreatedAttachment
  );
  assert.deepStrictEqual([...customFolders], ['Audio exports', 'Audio exports/Academic']);
  assert.strictEqual(customCreatedAttachment.path, customPlan.targetPath);
  assert.strictEqual(customCreatedAttachment.bytes.toString('ascii', 0, 4), 'RIFF');

  let insertedText = '';
  attachmentPlugin.app.workspace.getActiveViewOfType = () => ({
    editor: {
      getCursor: () => ({ ch: 0, line: 2 }),
      replaceRange: (text) => {
        insertedText = text;
      },
    },
    file: exportFile,
  });
  assert.strictEqual(
    await attachmentPlugin.insertAudioAttachmentIntoNote(exportFile, createdAudioFile),
    'cursor'
  );
  assert.strictEqual(insertedText, '\n![[Attachments/Research note - narration.wav]]\n');

  let processedNote = '';
  attachmentPlugin.app.workspace.getActiveViewOfType = () => null;
  attachmentPlugin.app.vault.process = async (_file, updater) => {
    processedNote = updater('Note body\n');
  };
  assert.strictEqual(
    await attachmentPlugin.insertAudioAttachmentIntoNote(exportFile, createdAudioFile),
    'end'
  );
  assert.strictEqual(processedNote, 'Note body\n\n![[Attachments/Research note - narration.wav]]\n');
  fs.rmSync(exportTempDir, { force: true, recursive: true });

  const pdfFile = {
    basename: 'paper',
    extension: 'pdf',
    name: 'paper.pdf',
    stat: { size: 1024 },
  };
  let pdfDestroyed = false;
  let pdfPageCleanupCount = 0;
  let receivedPdfData = null;
  mockPdfJsLib = {
    getDocument: ({ data }) => {
      receivedPdfData = data;
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (pageNumber) => ({
            cleanup: () => {
              pdfPageCleanupCount += 1;
            },
            getTextContent: async () => ({
              items: pageNumber === 1
                ? [{ str: 'First' }, { str: 'page' }, { str: '.' }]
                : [{ str: '第二页' }, { str: '。' }],
            }),
          }),
          destroy: async () => {
            pdfDestroyed = true;
          },
        }),
      };
    },
  };
  const pdfSession = { id: 41, stopped: false };
  const pdfStatuses = [];
  const pdfPlugin = Object.create(PluginClass.prototype);
  pdfPlugin.app = {
    vault: {
      readBinary: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
    },
  };
  pdfPlugin.activeSession = pdfSession;
  pdfPlugin.sequence = pdfSession.id;
  pdfPlugin.updateStatus = (label, state) => {
    pdfStatuses.push({ label, state });
  };
  const extractedPdfText = await pdfPlugin.extractPdfText(pdfFile, pdfSession);
  assert.strictEqual(extractedPdfText, 'First page.\n\n第二页。');
  assert.ok(receivedPdfData instanceof Uint8Array);
  assert.strictEqual(receivedPdfData.byteLength, 4);
  assert.strictEqual(pdfPageCleanupCount, 2);
  assert.strictEqual(pdfDestroyed, true);
  assert.strictEqual(pdfSession.pdfLoadingTask, null);
  assert.ok(pdfStatuses.some(({ label }) => label === 'PDF page 2/2'));

  const selectedPdfPages = [];
  mockPdfJsLib = {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (pageNumber) => {
          selectedPdfPages.push(pageNumber);
          return {
            cleanup: () => {},
            getTextContent: async () => ({
              items: pageNumber === 2
                ? [
                    { str: 'Before' },
                    { str: 'selected' },
                    { str: 'anchor' },
                    { str: 'after' },
                    { str: '.' },
                  ]
                : [{ str: 'Third' }, { str: 'page' }, { str: '.' }],
            }),
          };
        },
        destroy: async () => {},
      }),
    }),
  };
  const selectedPdfSession = { id: 43, stopped: false };
  pdfPlugin.activeSession = selectedPdfSession;
  pdfPlugin.sequence = selectedPdfSession.id;
  const selectedPdfText = await pdfPlugin.extractPdfText(pdfFile, selectedPdfSession, {
    selectedText: 'selected anchor',
    startPageNumber: 2,
  });
  assert.strictEqual(selectedPdfText, 'selected anchor after.\n\nThird page.');
  assert.deepStrictEqual(selectedPdfPages, [2, 3]);
  assert.strictEqual(selectedPdfSession.pdfSelectionMatched, true);

  const progressivePdfPlugin = Object.create(PluginClass.prototype);
  progressivePdfPlugin.sequence = 60;
  progressivePdfPlugin.readerState = moduleObject.exports.__test.createReaderState();
  progressivePdfPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    speechEngine: 'openrouter-tts',
    stripMarkdown: false,
  };
  progressivePdfPlugin.setReaderState = () => {};
  const progressivePdfSession = progressivePdfPlugin.createSpeechSession([], 'paper.pdf', {
    engineLabel: 'OpenRouter TTS',
    prefetchChunks: 0,
    speechEngine: 'openrouter-tts',
  }, {
    kind: 'pdf-progressive',
    productionComplete: false,
  });
  progressivePdfPlugin.activeSession = progressivePdfSession;
  let releaseRemainingPdfPages;
  let firstPdfPageDelivered;
  const remainingPdfPages = new Promise((resolve) => {
    releaseRemainingPdfPages = resolve;
  });
  const firstPdfPage = new Promise((resolve) => {
    firstPdfPageDelivered = resolve;
  });
  progressivePdfPlugin.extractPdfText = async (_file, _session, options) => {
    await options.onPageText('A'.repeat(210), { pageNumber: 1, totalPages: 2 });
    firstPdfPageDelivered();
    await remainingPdfPages;
    await options.onPageText('B'.repeat(500), { pageNumber: 2, totalPages: 2 });
    return '';
  };
  const progressivePdfProducer = progressivePdfPlugin.producePdfSpeechChunks(
    pdfFile,
    progressivePdfSession,
    null,
    [200, 400, 800]
  );
  await firstPdfPage;
  assert.strictEqual(progressivePdfSession.chunks.length, 1);
  assert.strictEqual(progressivePdfSession.chunks[0], 'A'.repeat(200));
  releaseRemainingPdfPages();
  await progressivePdfProducer;
  assert.deepStrictEqual(
    progressivePdfSession.chunks,
    moduleObject.exports.__test.splitTextForSpeechChunks(
      `${'A'.repeat(210)}\n\n${'B'.repeat(500)}`,
      [200, 400, 800]
    )
  );
  mockPdfJsLib = null;

  let cancelledPdfLoading = false;
  const pdfStopSession = {
    id: 42,
    stopped: false,
    pdfLoadingTask: {
      destroy: async () => {
        cancelledPdfLoading = true;
      },
    },
  };
  const pdfStopPlugin = Object.create(PluginClass.prototype);
  pdfStopPlugin.activeSession = pdfStopSession;
  pdfStopPlugin.currentAudio = null;
  pdfStopPlugin.currentProcess = null;
  pdfStopPlugin.currentRequests = new Set();
  pdfStopPlugin.pauseRequested = false;
  pdfStopPlugin.sequence = pdfStopSession.id;
  pdfStopPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: false,
  };
  pdfStopPlugin.updateStatus = () => {};
  await pdfStopPlugin.stopReading({ silent: true });
  assert.strictEqual(cancelledPdfLoading, true);
  assert.strictEqual(pdfStopSession.stopped, true);
  assert.strictEqual(pdfStopSession.pdfLoadingTask, null);
  assert.strictEqual(pdfStopPlugin.activeSession, null);

  const demandPlugin = Object.create(PluginClass.prototype);
  demandPlugin.sequence = 70;
  demandPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: false,
    onlinePrefetchChunks: 0,
    speechEngine: 'openrouter-tts',
  };
  demandPlugin.readerState = moduleObject.exports.__test.createReaderState();
  demandPlugin.updateStatus = () => {};
  const demandEvents = [];
  demandPlugin.queuePrepareChunk = (_text, index) => {
    demandEvents.push(`prepare:${index}`);
    return Promise.resolve({ outputPath: `${index}.mp3` });
  };
  demandPlugin.playPreparedAudio = async (_prepared, _session, index) => {
    demandEvents.push(`play:${index}`);
  };
  const demandSession = demandPlugin.createSpeechSession(['first', 'second'], 'note', {
    engineLabel: 'OpenRouter TTS',
    prefetchChunks: 0,
    speechEngine: 'openrouter-tts',
  });
  demandPlugin.activeSession = demandSession;
  await demandPlugin.runSpeechSession(demandSession);
  assert.deepStrictEqual(demandEvents, ['prepare:0', 'play:0', 'prepare:1', 'play:1']);

  const prefetchPlugin = Object.create(PluginClass.prototype);
  prefetchPlugin.sequence = 75;
  prefetchPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: false,
    speechEngine: 'openrouter-tts',
  };
  prefetchPlugin.readerState = moduleObject.exports.__test.createReaderState();
  prefetchPlugin.updateStatus = () => {};
  const prefetchEvents = [];
  prefetchPlugin.queuePrepareChunk = (_text, index) => {
    prefetchEvents.push(`prepare:${index}`);
    return Promise.resolve({ outputPath: `${index}.mp3` });
  };
  prefetchPlugin.playPreparedAudio = async (_prepared, _session, index) => {
    prefetchEvents.push(`play:${index}`);
  };
  const prefetchSession = prefetchPlugin.createSpeechSession(['first', 'second'], 'note', {
    engineLabel: 'OpenRouter TTS',
    prefetchChunks: moduleObject.exports.__test.getSynthesisPrefetchCount(prefetchPlugin.settings),
    speechEngine: 'openrouter-tts',
  });
  prefetchPlugin.activeSession = prefetchSession;
  await prefetchPlugin.runSpeechSession(prefetchSession);
  assert.deepStrictEqual(prefetchEvents, ['prepare:0', 'prepare:1', 'play:0', 'play:1']);

  const arrivingPrefetchPlugin = Object.create(PluginClass.prototype);
  arrivingPrefetchPlugin.sequence = 77;
  arrivingPrefetchPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: false,
    speechEngine: 'openrouter-tts',
  };
  arrivingPrefetchPlugin.readerState = moduleObject.exports.__test.createReaderState();
  arrivingPrefetchPlugin.setReaderState = () => {};
  arrivingPrefetchPlugin.updateStatus = () => {};
  const arrivingPrefetchEvents = [];
  arrivingPrefetchPlugin.queuePrepareChunk = (_text, index) => {
    arrivingPrefetchEvents.push(`prepare:${index}`);
    return Promise.resolve({ outputPath: `${index}.mp3` });
  };
  arrivingPrefetchPlugin.playPreparedAudio = async (_prepared, session, index) => {
    arrivingPrefetchEvents.push(`play:${index}`);
    if (index === 0) {
      assert.strictEqual(arrivingPrefetchPlugin.appendSessionChunks(
        session,
        [{ metadata: { pageNumber: 2 }, text: 'second page chunk' }]
      ), 1);
      arrivingPrefetchPlugin.completeSessionChunks(session);
      await Promise.resolve();
      assert.ok(arrivingPrefetchEvents.includes('prepare:1'));
    }
  };
  const arrivingPrefetchSession = arrivingPrefetchPlugin.createSpeechSession(
    ['first page chunk'],
    'paper.pdf',
    {
      engineLabel: 'OpenRouter TTS',
      prefetchChunks: 1,
      speechEngine: 'openrouter-tts',
    },
    { kind: 'pdf-progressive', productionComplete: false }
  );
  arrivingPrefetchPlugin.activeSession = arrivingPrefetchSession;
  await arrivingPrefetchPlugin.runSpeechSession(arrivingPrefetchSession);
  assert.deepStrictEqual(
    arrivingPrefetchEvents,
    ['prepare:0', 'play:0', 'prepare:1', 'play:1']
  );
  arrivingPrefetchSession.stopped = true;
  assert.strictEqual(arrivingPrefetchPlugin.appendSessionChunks(
    arrivingPrefetchSession,
    ['stale chunk']
  ), 0);

  const waitingPlugin = Object.create(PluginClass.prototype);
  waitingPlugin.sequence = 80;
  waitingPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    cleanupCache: false,
  };
  waitingPlugin.readerState = moduleObject.exports.__test.createReaderState();
  waitingPlugin.currentAudio = null;
  waitingPlugin.currentProcess = null;
  waitingPlugin.currentRequests = new Set();
  waitingPlugin.pauseRequested = false;
  waitingPlugin.updateStatus = () => {};
  const waitingSession = waitingPlugin.createSpeechSession([], 'paper.pdf', {
    engineLabel: 'OpenRouter TTS',
    prefetchChunks: 0,
    speechEngine: 'openrouter-tts',
  }, {
    kind: 'pdf-progressive',
    productionComplete: false,
  });
  waitingPlugin.activeSession = waitingSession;
  const waitingRun = waitingPlugin.runSpeechSession(waitingSession);
  await Promise.resolve();
  await waitingPlugin.stopReading({ silent: true });
  await waitingRun;
  assert.strictEqual(waitingSession.stopped, true);
  assert.strictEqual(waitingSession.chunkWaiters.size, 0);

  const routePlugin = Object.create(PluginClass.prototype);
  let routedPdfFile = null;
  routePlugin.app = {
    workspace: {
      getActiveFile: () => pdfFile,
    },
  };
  routePlugin.getActiveMarkdownView = () => {
    throw new Error('A PDF must not fall back to the last Markdown note.');
  };
  routePlugin.readCurrentPdf = async (file) => {
    routedPdfFile = file;
  };
  await routePlugin.readCurrentNote();
  assert.strictEqual(routedPdfFile, pdfFile);

  const noteFile = {
    basename: 'Full note',
    extension: 'md',
    name: 'Full note.md',
    path: 'Notes/Full note.md',
  };
  const noteRoutePlugin = Object.create(PluginClass.prototype);
  let routedNoteReading = null;
  noteRoutePlugin.app = {
    workspace: {
      getActiveFile: () => noteFile,
    },
  };
  noteRoutePlugin.getActiveMarkdownView = () => ({
    editor: {
      getSelection: () => 'stale selected words',
      getValue: () => 'The complete note body.',
    },
    file: noteFile,
  });
  noteRoutePlugin.activateControlView = async () => {};
  noteRoutePlugin.startReading = async (text, source, options) => {
    routedNoteReading = { options, source, text };
  };
  await noteRoutePlugin.readCurrentNote();
  assert.strictEqual(routedNoteReading.text, 'The complete note body.');
  assert.strictEqual(routedNoteReading.source, 'Full note');
  assert.strictEqual(routedNoteReading.options.file, noteFile);
  assert.strictEqual(routedNoteReading.options.sourceKind, 'markdown');

  const panelRoutePlugin = Object.create(PluginClass.prototype);
  let panelRoutedPdfFile = null;
  panelRoutePlugin.app = {
    workspace: {
      getActiveFile: () => null,
    },
  };
  panelRoutePlugin.lastReadableFile = pdfFile;
  panelRoutePlugin.readCurrentPdf = async (file) => {
    panelRoutedPdfFile = file;
  };
  await panelRoutePlugin.readCurrentNote();
  assert.strictEqual(panelRoutedPdfFile, pdfFile);

  const pdfFromSelectionRoutePlugin = Object.create(PluginClass.prototype);
  let routedPdfSelectionFile = null;
  pdfFromSelectionRoutePlugin.app = {
    workspace: {
      getActiveFile: () => pdfFile,
    },
  };
  pdfFromSelectionRoutePlugin.getActiveMarkdownView = () => {
    throw new Error('A PDF selection must not fall back to the last Markdown note.');
  };
  pdfFromSelectionRoutePlugin.readCurrentPdfFromSelection = async (file) => {
    routedPdfSelectionFile = file;
  };
  await pdfFromSelectionRoutePlugin.readFromSelection();
  assert.strictEqual(routedPdfSelectionFile, pdfFile);

  const credentialMigrationPlugin = Object.create(PluginClass.prototype);
  let migratedSettings = null;
  credentialMigrationPlugin.loadData = async () => ({
    azureSpeechKeyPath: 'C:\\Keys\\azure.txt',
    openRouterKeyPath: 'C:\\Keys\\openrouter.txt',
  });
  credentialMigrationPlugin.saveData = async (value) => {
    migratedSettings = value;
  };
  await credentialMigrationPlugin.loadSettings();
  assert.strictEqual(credentialMigrationPlugin.settings.azureSpeechCredentialSource, 'key-file');
  assert.strictEqual(credentialMigrationPlugin.settings.openRouterCredentialSource, 'key-file');
  assert.strictEqual(migratedSettings.azureSpeechCredentialSource, 'key-file');
  assert.strictEqual(migratedSettings.openRouterCredentialSource, 'key-file');
  assert.strictEqual(migratedSettings.azureSpeechSecretName, '');
  assert.strictEqual(migratedSettings.openRouterSecretName, '');

  const positionPlugin = Object.create(PluginClass.prototype);
  let savedPositionSettings = null;
  positionPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    rememberReadingPosition: true,
  };
  positionPlugin.saveData = async (value) => {
    savedPositionSettings = value;
  };
  positionPlugin.renderReaderViews = () => {};
  const positionSession = {
    chunkPageNumbers: [4, 4],
    chunks: [
      'A private paragraph anchor that is long enough to find again. '.repeat(8),
      'The next paragraph.',
    ],
    currentChunkIndex: 0,
    fileMtime: 123,
    filePath: 'papers/private.pdf',
    lastCompletedChunkIndex: null,
    sourceKind: 'pdf',
  };
  assert.strictEqual(await positionPlugin.saveSessionReadingPosition(positionSession), true);
  const savedPdfPosition = savedPositionSettings.readingPositions['papers/private.pdf'];
  assert.strictEqual(savedPdfPosition.pageNumber, 4);
  assert.strictEqual(savedPdfPosition.chunkIndex, 0);
  assert.ok(savedPdfPosition.anchor.length <= 180);
  assert.ok(savedPdfPosition.anchor.length < positionSession.chunks[0].length);
  assert.strictEqual(await positionPlugin.clearSessionReadingPosition(positionSession), true);
  assert.strictEqual(savedPositionSettings.readingPositions['papers/private.pdf'], undefined);

  const resumeFile = {
    basename: 'resume-note',
    extension: 'md',
    name: 'resume-note.md',
    path: 'notes/resume-note.md',
    stat: { mtime: 123 },
  };
  const resumePlugin = Object.create(PluginClass.prototype);
  resumePlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    readingPositions: {
      [resumeFile.path]: {
        anchor: 'Saved anchor begins here and continues.',
        chunkIndex: 1,
        filePath: resumeFile.path,
        kind: 'markdown',
        updatedAt: 100,
      },
    },
    rememberReadingPosition: true,
    stripMarkdown: false,
  };
  resumePlugin.app = {
    workspace: {
      getActiveFile: () => resumeFile,
    },
  };
  resumePlugin.getActiveMarkdownView = () => ({
    editor: {
      getValue: () => 'Earlier text.\n\nSaved anchor begins here and continues. Final text.',
    },
    file: resumeFile,
  });
  resumePlugin.activateControlView = async () => {};
  let resumedMarkdown = null;
  resumePlugin.startReading = async (text, source, options) => {
    resumedMarkdown = { options, source, text };
  };
  await resumePlugin.resumeCurrentFile();
  assert.ok(resumedMarkdown.text.startsWith('Saved anchor begins here'));
  assert.strictEqual(resumedMarkdown.options.file, resumeFile);

  const resumePdfFile = {
    basename: 'resume-paper',
    extension: 'pdf',
    name: 'resume-paper.pdf',
    path: 'papers/resume-paper.pdf',
  };
  resumePlugin.app.workspace.getActiveFile = () => resumePdfFile;
  resumePlugin.settings.readingPositions = {
    [resumePdfFile.path]: {
      anchor: 'Saved PDF anchor text',
      chunkIndex: 3,
      filePath: resumePdfFile.path,
      kind: 'pdf',
      pageNumber: 7,
      updatedAt: 200,
    },
  };
  let resumedPdf = null;
  resumePlugin.readCurrentPdf = async (file, options) => {
    resumedPdf = { file, options };
  };
  await resumePlugin.resumeCurrentFile();
  assert.strictEqual(resumedPdf.file, resumePdfFile);
  assert.strictEqual(resumedPdf.options.resumePosition.pageNumber, 7);

  const runtimeLogDir = path.join(__dirname, '.test-runtime-log');
  const runtimeLogPath = path.join(runtimeLogDir, 'diagnostic.log');
  fs.rmSync(runtimeLogDir, { force: true, recursive: true });
  fs.mkdirSync(runtimeLogDir, { recursive: true });
  const logPlugin = Object.create(PluginClass.prototype);
  logPlugin.logPath = runtimeLogPath;
  logPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    diagnosticLogging: false,
    speechEngine: 'edge-tts',
  };
  await logPlugin.writeRuntimeLog('failed', { message: 'PRIVATE NOTE CONTENT' });
  assert.strictEqual(fs.existsSync(runtimeLogPath), false);
  logPlugin.settings.diagnosticLogging = true;
  await logPlugin.writeRuntimeLog('start', { source: 'PRIVATE NOTE TITLE' });
  assert.strictEqual(fs.existsSync(runtimeLogPath), false);
  await logPlugin.writeRuntimeLog('failed', { message: 'PRIVATE NOTE CONTENT' });
  const runtimeLogEvent = JSON.parse(fs.readFileSync(runtimeLogPath, 'utf8').trim());
  assert.deepStrictEqual(Object.keys(runtimeLogEvent).sort(), ['engine', 'stage', 'time']);
  assert.strictEqual(runtimeLogEvent.engine, 'Edge TTS');
  assert.ok(!fs.readFileSync(runtimeLogPath, 'utf8').includes('PRIVATE'));
  fs.writeFileSync(runtimeLogPath, Buffer.alloc(1024 * 1024));
  await logPlugin.writeRuntimeLog('failed', { message: 'PRIVATE NOTE CONTENT' });
  assert.ok(fs.statSync(runtimeLogPath).size < 1024);
  fs.rmSync(runtimeLogDir, { force: true, recursive: true });

  const plugin = Object.create(PluginClass.prototype);
  let savedSettings = null;
  plugin.settings = {
    cleanupCache: false,
    chunkLimits: '999',
    edgeTtsVoice: 'zh-CN-XiaoyiNeural',
    mathReadingLanguage: 'chinese',
    scriptPath: 'custom.ps1',
    speechEngine: 'edge-tts',
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

  plugin.settings.openRouterSecretName = 'openrouter-api-key';
  await plugin.saveSettings();
  assert.strictEqual(savedSettings.openRouterSecretName, 'openrouter-api-key');
  assert.ok(!JSON.stringify(savedSettings).includes('openrouter-secret-value'));

  const originalAudio = global.Audio;
  try {
    let releasedSuccessSource = 0;
    let successfulAudioUrl = '';
    class SuccessfulAudio {
      constructor() {
        this.currentTime = 0;
        this.duration = 1;
        this.error = null;
        this.paused = false;
      }

      set src(url) {
        successfulAudioUrl = url;
      }

      play() {
        Promise.resolve().then(() => this.onended());
        return Promise.resolve();
      }
    }
    global.Audio = SuccessfulAudio;
    const playbackSession = { id: 21, stopped: false };
    const playbackPlugin = Object.create(PluginClass.prototype);
    playbackPlugin.activeSession = playbackSession;
    playbackPlugin.currentAudio = null;
    playbackPlugin.isActive = PluginClass.prototype.isActive;
    playbackPlugin.sequence = playbackSession.id;
    playbackPlugin.readerState = moduleObject.exports.__test.createReaderState();
    playbackPlugin.settings = {
      ...moduleObject.exports.__test.createDefaultSettings(),
      speechEngine: 'openrouter-tts',
    };
    playbackPlugin.createPlayableAudioSource = async () => ({
      url: 'blob:openrouter-success',
      release: () => {
        releasedSuccessSource += 1;
      },
    });
    playbackPlugin.releaseAudioSource = PluginClass.prototype.releaseAudioSource;
    playbackPlugin.setReaderState = (patch) => {
      playbackPlugin.readerState = moduleObject.exports.__test.createReaderState({
        ...playbackPlugin.readerState,
        ...patch,
      });
    };
    playbackPlugin.updateStatus = (_label, patch) => playbackPlugin.setReaderState(patch);
    playbackPlugin.waitWhilePaused = async () => {};
    playbackPlugin.writeRuntimeLog = async () => {};

    await playbackPlugin.playPreparedAudio({ outputPath: 'unused.mp3' }, playbackSession, 0, 1);
    assert.strictEqual(successfulAudioUrl, 'blob:openrouter-success');
    assert.strictEqual(releasedSuccessSource, 1);
    assert.strictEqual(playbackPlugin.currentAudio, null);
    assert.strictEqual(playbackPlugin.readerState.progress, 1);

    let releasedFailedSource = 0;
    class UnsupportedAudio extends SuccessfulAudio {
      constructor() {
        super();
        this.error = { code: 4 };
      }

      play() {
        Promise.resolve().then(() => this.onerror());
        return Promise.resolve();
      }
    }
    global.Audio = UnsupportedAudio;
    playbackPlugin.createPlayableAudioSource = async () => ({
      url: 'blob:openrouter-error',
      release: () => {
        releasedFailedSource += 1;
      },
    });
    await assert.rejects(
      () => playbackPlugin.playPreparedAudio({ outputPath: 'failed.mp3' }, playbackSession, 0, 1),
      /media error 4: the audio source or format is unsupported/
    );
    assert.strictEqual(releasedFailedSource, 1);
    assert.strictEqual(playbackPlugin.currentAudio, null);
  } finally {
    if (typeof originalAudio === 'undefined') {
      delete global.Audio;
    } else {
      global.Audio = originalAudio;
    }
  }

  const seekPlugin = Object.create(PluginClass.prototype);
  const seekStates = [];
  seekPlugin.currentAudio = {
    currentTime: 8,
    duration: 20,
  };
  seekPlugin.readerState = moduleObject.exports.__test.createReaderState({
    canSeek: true,
    currentChunk: 3,
    totalChunks: 4,
  });
  seekPlugin.setReaderState = (patch) => {
    seekStates.push(patch);
    seekPlugin.readerState = moduleObject.exports.__test.createReaderState({
      ...seekPlugin.readerState,
      ...patch,
    });
  };

  assert.strictEqual(seekPlugin.seekCurrentAudioBySeconds(5), true);
  assert.strictEqual(seekPlugin.currentAudio.currentTime, 13);
  assert.deepStrictEqual(seekStates.pop(), { progress: 0.6625 });

  assert.strictEqual(seekPlugin.seekCurrentAudioBySeconds(-30), true);
  assert.strictEqual(seekPlugin.currentAudio.currentTime, 0);
  assert.deepStrictEqual(seekStates.pop(), { progress: 0.5 });

  seekPlugin.currentAudio = {
    currentTime: 8,
    duration: Number.NaN,
  };
  assert.strictEqual(seekPlugin.seekCurrentAudioBySeconds(5), true);
  assert.strictEqual(seekPlugin.currentAudio.currentTime, 13);

  const globalSeekPlugin = Object.create(PluginClass.prototype);
  const globalSeekCalls = [];
  globalSeekPlugin.readerState = moduleObject.exports.__test.createReaderState({
    canPause: true,
    canSeek: true,
    currentChunk: 1,
    totalChunks: 2,
  });
  globalSeekPlugin.seekCurrentAudioBySeconds = (deltaSeconds) => {
    globalSeekCalls.push(deltaSeconds);
    return true;
  };
  assert.strictEqual(typeof globalSeekPlugin.handleReaderKeydown, 'function');
  const globalRightArrowEvent = createKeyboardEvent({
    code: 'ArrowRight',
    currentTarget: null,
    key: 'ArrowRight',
    target: new FakeElement('body'),
  });
  globalSeekPlugin.handleReaderKeydown(globalRightArrowEvent, { focusPanel: null });
  assert.deepStrictEqual(globalSeekCalls, [5]);
  assert.strictEqual(globalRightArrowEvent.defaultPrevented, true);

  const globalSpaceEvent = createKeyboardEvent({
    target: new FakeElement('body'),
  });
  globalSeekPlugin.pauseOrResume = () => {
    throw new Error('Global Space should not pause reading.');
  };
  assert.strictEqual(globalSeekPlugin.handleReaderKeydown(globalSpaceEvent, { allowPause: false }), false);
  assert.strictEqual(globalSpaceEvent.defaultPrevented, false);

  const jumpPlugin = Object.create(PluginClass.prototype);
  let pausedForJump = false;
  let endedForJump = false;
  jumpPlugin.activeSession = {
    requestedChunkIndex: null,
    stopped: false,
    totalChunks: 4,
  };
  jumpPlugin.readerState = moduleObject.exports.__test.createReaderState({
    canNextChunk: true,
    canPreviousChunk: true,
    currentChunk: 3,
    totalChunks: 4,
  });
  const jumpStatuses = [];
  jumpPlugin.updateStatus = (label, patch) => {
    jumpStatuses.push({ label, patch });
    jumpPlugin.readerState = moduleObject.exports.__test.createReaderState({
      ...jumpPlugin.readerState,
      label,
      ...patch,
    });
  };
  jumpPlugin.currentAudio = {
    pause: () => {
      pausedForJump = true;
    },
    onended: () => {
      endedForJump = true;
    },
  };

  assert.strictEqual(jumpPlugin.jumpToAdjacentChunk(-1), true);
  assert.strictEqual(jumpPlugin.activeSession.requestedChunkIndex, 1);
  assert.strictEqual(pausedForJump, true);
  assert.strictEqual(endedForJump, true);
  assert.strictEqual(jumpStatuses.pop().patch.currentChunk, 2);

  jumpPlugin.readerState = moduleObject.exports.__test.createReaderState({
    currentChunk: 1,
    totalChunks: 4,
  });
  jumpPlugin.activeSession.requestedChunkIndex = null;
  assert.strictEqual(jumpPlugin.jumpToAdjacentChunk(-1), false);
  assert.strictEqual(jumpPlugin.activeSession.requestedChunkIndex, null);

  const preparePlugin = Object.create(PluginClass.prototype);
  const prepareSession = {
    files: [],
    id: 7,
    stopped: false,
    totalChunks: 4,
  };
  const prepareStatuses = [];
  const prepareTempDir = path.join(__dirname, '.test-cache');
  fs.mkdirSync(prepareTempDir, { recursive: true });
  preparePlugin.activeSession = prepareSession;
  preparePlugin.app = {
    vault: {
      adapter: {
        getResourcePath: (vaultPath) => `app://local/${vaultPath}`,
      },
    },
  };
  preparePlugin.cacheDir = prepareTempDir;
  preparePlugin.settings = moduleObject.exports.__test.createDefaultSettings();
  preparePlugin.readerState = moduleObject.exports.__test.createReaderState();
  preparePlugin.sequence = 7;
  preparePlugin.vaultBasePath = __dirname;
  preparePlugin.isActive = PluginClass.prototype.isActive;
  preparePlugin.writeRuntimeLog = async () => {};
  preparePlugin.updateStatus = (label, patch) => {
    prepareStatuses.push({ label, patch });
    preparePlugin.readerState = moduleObject.exports.__test.createReaderState({
      ...preparePlugin.readerState,
      label,
      ...patch,
    });
  };
  preparePlugin.runCosyVoice = async (inputPath, outputPath) => {
    assert.ok(fs.existsSync(inputPath));
    fs.writeFileSync(outputPath, Buffer.alloc(45));
  };

  const preparedChunk = await preparePlugin.prepareChunk('chunk text', 1, prepareSession);
  assert.ok(preparedChunk.outputPath.endsWith('.wav'));
  assert.strictEqual(fs.existsSync(prepareSession.files[0]), false);
  assert.strictEqual(fs.existsSync(preparedChunk.outputPath), true);
  const synthStatus = prepareStatuses.find((entry) => entry.patch.phase === 'synthesizing');
  assert.strictEqual(synthStatus.patch.canPreviousChunk, true);
  assert.strictEqual(synthStatus.patch.canNextChunk, true);

  prepareSession.currentChunkIndex = 0;
  preparePlugin.currentAudio = {};
  prepareStatuses.length = 0;
  const backgroundPreparedChunk = await preparePlugin.prepareChunk(
    'background prefetched chunk',
    2,
    prepareSession
  );
  assert.ok(backgroundPreparedChunk.outputPath.endsWith('.wav'));
  assert.strictEqual(prepareStatuses.length, 0);
  preparePlugin.currentAudio = null;

  const edgeSession = {
    files: [],
    id: 7,
    stopped: false,
    totalChunks: 2,
  };
  const edgePlugin = Object.create(PluginClass.prototype);
  edgePlugin.activeSession = edgeSession;
  edgePlugin.app = preparePlugin.app;
  edgePlugin.cacheDir = prepareTempDir;
  edgePlugin.readerState = moduleObject.exports.__test.createReaderState();
  edgePlugin.sequence = 7;
  edgePlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    speechEngine: 'edge-tts',
  };
  edgePlugin.vaultBasePath = __dirname;
  edgePlugin.isActive = PluginClass.prototype.isActive;
  edgePlugin.writeRuntimeLog = async () => {};
  edgePlugin.updateStatus = () => {};
  edgePlugin.runCosyVoice = async () => {
    throw new Error('local model unavailable');
  };
  edgePlugin.runEdgeTts = async (inputPath, outputPath) => {
    assert.ok(fs.existsSync(inputPath));
    assert.ok(outputPath.endsWith('.mp3'));
    fs.writeFileSync(outputPath, Buffer.alloc(64));
  };

  const edgeChunk = await edgePlugin.prepareChunk('edge chunk', 0, edgeSession);
  assert.ok(edgeChunk.outputPath.endsWith('.mp3'));
  assert.strictEqual(fs.existsSync(edgeSession.files[0]), false);
  assert.strictEqual(fs.existsSync(edgeChunk.outputPath), true);

  const inactiveSession = {
    files: [],
    id: 22,
    stopped: false,
    totalChunks: 1,
  };
  const inactivePreparePlugin = Object.create(PluginClass.prototype);
  inactivePreparePlugin.activeSession = inactiveSession;
  inactivePreparePlugin.app = preparePlugin.app;
  inactivePreparePlugin.cacheDir = prepareTempDir;
  inactivePreparePlugin.readerState = moduleObject.exports.__test.createReaderState();
  inactivePreparePlugin.sequence = inactiveSession.id;
  inactivePreparePlugin.settings = moduleObject.exports.__test.createDefaultSettings();
  inactivePreparePlugin.vaultBasePath = __dirname;
  inactivePreparePlugin.isActive = PluginClass.prototype.isActive;
  inactivePreparePlugin.removeTempFile = PluginClass.prototype.removeTempFile;
  inactivePreparePlugin.updateStatus = () => {};
  inactivePreparePlugin.writeRuntimeLog = async () => {};
  inactivePreparePlugin.runCosyVoice = async (_inputPath, outputPath) => {
    fs.writeFileSync(outputPath, Buffer.alloc(64));
    inactiveSession.stopped = true;
  };
  await assert.rejects(
    () => inactivePreparePlugin.prepareChunk('cancelled chunk', 0, inactiveSession),
    /Reading stopped/
  );
  const inactiveOutputPath = inactiveSession.files.find((filePath) => filePath.endsWith('.wav'));
  assert.strictEqual(fs.existsSync(inactiveOutputPath), false);

  const remoteVaultDir = path.join(__dirname, '.test-remote-vault');
  const remoteSecretDir = path.join(__dirname, '.test-remote-secret');
  fs.mkdirSync(remoteVaultDir, { recursive: true });
  fs.mkdirSync(remoteSecretDir, { recursive: true });
  const originalHttpsRequest = https.request;
  const azureInputPath = path.join(prepareTempDir, 'azure-input.txt');
  const azureOutputPath = path.join(prepareTempDir, 'azure-output.mp3');
  const azureKeyPath = path.join(remoteSecretDir, 'azure-key.txt');
  fs.writeFileSync(azureInputPath, 'private <text> & symbols');
  fs.writeFileSync(azureKeyPath, 'test-subscription-key\n');

  const azureSession = { id: 9, stopped: false };
  const azurePlugin = Object.create(PluginClass.prototype);
  azurePlugin.activeSession = azureSession;
  azurePlugin.cacheDir = prepareTempDir;
  azurePlugin.currentRequests = new Set();
  azurePlugin.sequence = 9;
  azurePlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    azureSpeechCloud: 'public',
    azureSpeechConsent: true,
    azureSpeechCredentialSource: 'key-file',
    azureSpeechKeyPath: azureKeyPath,
    azureSpeechRegion: 'eastasia',
    azureSpeechVoice: 'en-US-JennyNeural',
    speechEngine: 'azure-speech',
    speed: 1.25,
  };
  azurePlugin.vaultBasePath = remoteVaultDir;
  azurePlugin.isActive = PluginClass.prototype.isActive;

  let azureEndpoint = '';
  let azureOptions = null;
  let azureRequestBody = '';
  try {
    https.request = (endpoint, options, callback) => {
      azureEndpoint = String(endpoint);
      azureOptions = options;
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = (body) => {
        azureRequestBody = body;
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = { 'content-length': '64', 'content-type': 'audio/mpeg' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
          response.emit('data', Buffer.alloc(64));
          response.emit('end');
        });
      };
      return request;
    };

    await azurePlugin.runAzureSpeech(azureInputPath, azureOutputPath, azureSession);
  } finally {
    https.request = originalHttpsRequest;
  }

  assert.strictEqual(azureEndpoint, 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.strictEqual(azureOptions.method, 'POST');
  assert.strictEqual(azureOptions.headers['Ocp-Apim-Subscription-Key'], 'test-subscription-key');
  assert.strictEqual(azureOptions.headers['X-Microsoft-OutputFormat'], 'audio-24khz-48kbitrate-mono-mp3');
  assert.strictEqual(azureOptions.headers['Content-Type'], 'application/ssml+xml');
  assert.ok(azureRequestBody.includes('private &lt;text&gt; &amp; symbols'));
  assert.ok(azureRequestBody.includes('name="en-US-JennyNeural"'));
  assert.strictEqual(fs.statSync(azureOutputPath).size, 64);
  assert.strictEqual(azurePlugin.currentRequests.size, 0);

  const azureVaultKeyPath = path.join(remoteVaultDir, 'azure-key.txt');
  fs.writeFileSync(azureVaultKeyPath, 'inside-vault-key');
  azurePlugin.settings.azureSpeechKeyPath = azureVaultKeyPath;
  await assert.rejects(
    () => azurePlugin.readAzureSpeechKey(),
    /must be stored outside the Obsidian vault/
  );

  const openRouterInputPath = path.join(prepareTempDir, 'openrouter-input.txt');
  const openRouterOutputPath = path.join(prepareTempDir, 'openrouter-output.mp3');
  const openRouterInvalidOutputPath = path.join(prepareTempDir, 'openrouter-invalid.mp3');
  const openRouterKeyPath = path.join(remoteSecretDir, 'openrouter-key.txt');
  fs.writeFileSync(openRouterInputPath, 'OpenRouter private text');
  fs.writeFileSync(openRouterKeyPath, 'unused-file-key\n');

  const openRouterSession = { id: 10, stopped: false };
  const openRouterPlugin = Object.create(PluginClass.prototype);
  openRouterPlugin.activeSession = openRouterSession;
  openRouterPlugin.cacheDir = prepareTempDir;
  openRouterPlugin.currentRequests = new Set();
  openRouterPlugin.sequence = 10;
  openRouterPlugin.app = {
    secretStorage: {
      getSecret: (name) => name === 'openrouter-api-key' ? 'test-openrouter-key' : null,
    },
  };
  openRouterPlugin.settings = {
    ...moduleObject.exports.__test.createDefaultSettings(),
    openRouterConsent: true,
    openRouterCredentialSource: 'obsidian-secret',
    openRouterKeyPath,
    openRouterModel: 'hexgrad/kokoro-82m',
    openRouterSecretName: 'openrouter-api-key',
    openRouterVoice: 'zf_xiaoxiao',
    speechEngine: 'openrouter-tts',
    speed: 1.25,
  };
  openRouterPlugin.vaultBasePath = remoteVaultDir;
  openRouterPlugin.isActive = PluginClass.prototype.isActive;

  let openRouterEndpoint = '';
  let openRouterOptions = null;
  let openRouterRequestBody = '';
  try {
    https.request = (endpoint, options, callback) => {
      openRouterEndpoint = String(endpoint);
      openRouterOptions = options;
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = (body) => {
        openRouterRequestBody = body;
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = { 'content-length': '64', 'content-type': 'audio/mpeg' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
          response.emit('data', Buffer.alloc(64));
          response.emit('end');
        });
      };
      return request;
    };

    await openRouterPlugin.runOpenRouterTts(openRouterInputPath, openRouterOutputPath, openRouterSession);
  } finally {
    https.request = originalHttpsRequest;
  }

  assert.strictEqual(openRouterEndpoint, 'https://openrouter.ai/api/v1/audio/speech');
  assert.strictEqual(openRouterOptions.method, 'POST');
  assert.strictEqual(openRouterOptions.headers.Authorization, 'Bearer test-openrouter-key');
  assert.strictEqual(openRouterOptions.headers.Accept, 'audio/mpeg');
  assert.deepStrictEqual(JSON.parse(openRouterRequestBody).provider, {
    data_collection: 'deny',
    zdr: true,
  });
  assert.strictEqual(JSON.parse(openRouterRequestBody).response_format, 'mp3');
  assert.strictEqual(fs.statSync(openRouterOutputPath).size, 64);
  assert.strictEqual(openRouterPlugin.currentRequests.size, 0);

  const openRouterRetryOutputPath = path.join(prepareTempDir, 'openrouter-retry.mp3');
  const openRouterRetryDelays = [];
  let openRouterRetryAttempts = 0;
  openRouterPlugin.waitForRemoteRetry = async (session, delayMs) => {
    assert.strictEqual(openRouterPlugin.isActive(session), true);
    openRouterRetryDelays.push(delayMs);
  };
  try {
    https.request = (_endpoint, _options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = () => {
        openRouterRetryAttempts += 1;
        process.nextTick(() => {
          const response = new EventEmitter();
          const succeeded = openRouterRetryAttempts === 3;
          response.statusCode = succeeded ? 200 : 502;
          response.headers = succeeded
            ? { 'content-length': '64', 'content-type': 'audio/mpeg' }
            : { 'content-type': 'application/json', 'retry-after': '0' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
          if (succeeded) {
            response.emit('data', Buffer.alloc(64));
            response.emit('end');
          }
        });
      };
      return request;
    };

    await openRouterPlugin.runOpenRouterTts(openRouterInputPath, openRouterRetryOutputPath, openRouterSession);
  } finally {
    https.request = originalHttpsRequest;
  }
  assert.strictEqual(openRouterRetryAttempts, 3);
  assert.deepStrictEqual(openRouterRetryDelays, [750, 1500]);
  assert.strictEqual(fs.statSync(openRouterRetryOutputPath).size, 64);
  assert.strictEqual(openRouterPlugin.currentRequests.size, 0);

  let openRouterExhaustedAttempts = 0;
  try {
    https.request = (_endpoint, _options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = () => {
        openRouterExhaustedAttempts += 1;
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 502;
          response.headers = { 'content-type': 'application/json' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
        });
      };
      return request;
    };

    await assert.rejects(
      () => openRouterPlugin.runOpenRouterTts(openRouterInputPath, openRouterRetryOutputPath, openRouterSession),
      /HTTP 502 after 3 attempts.*temporarily unavailable/
    );
  } finally {
    https.request = originalHttpsRequest;
  }
  assert.strictEqual(openRouterExhaustedAttempts, 3);
  assert.strictEqual(openRouterPlugin.currentRequests.size, 0);

  let openRouterForbiddenAttempts = 0;
  try {
    https.request = (_endpoint, _options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = () => {
        openRouterForbiddenAttempts += 1;
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 403;
          response.headers = { 'content-type': 'application/json' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
        });
      };
      return request;
    };

    await assert.rejects(
      () => openRouterPlugin.runOpenRouterTts(openRouterInputPath, openRouterRetryOutputPath, openRouterSession),
      /HTTP 403.*Check the selected API credential/
    );
  } finally {
    https.request = originalHttpsRequest;
  }
  assert.strictEqual(openRouterForbiddenAttempts, 1);
  assert.strictEqual(openRouterPlugin.currentRequests.size, 0);

  let openRouterInvalidAttempts = 0;
  try {
    https.request = (_endpoint, _options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = () => request.emit('close');
      request.end = () => {
        openRouterInvalidAttempts += 1;
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = { 'content-length': '16', 'content-type': 'application/json' };
          response.resume = () => {};
          response.destroy = () => {};
          callback(response);
        });
      };
      return request;
    };

    await assert.rejects(
      () => openRouterPlugin.runOpenRouterTts(openRouterInputPath, openRouterInvalidOutputPath, openRouterSession),
      /unexpected content type application\/json/
    );
  } finally {
    https.request = originalHttpsRequest;
  }
  assert.strictEqual(openRouterInvalidAttempts, 1);
  assert.strictEqual(fs.existsSync(openRouterInvalidOutputPath), false);
  assert.strictEqual(openRouterPlugin.currentRequests.size, 0);

  const vaultKeyPath = path.join(remoteVaultDir, 'openrouter-key.txt');
  fs.writeFileSync(vaultKeyPath, 'inside-vault-key');
  openRouterPlugin.settings.openRouterCredentialSource = 'key-file';
  openRouterPlugin.settings.openRouterKeyPath = vaultKeyPath;
  await assert.rejects(
    () => openRouterPlugin.readOpenRouterKey(),
    /must be stored outside the Obsidian vault/
  );

  fs.rmSync(remoteVaultDir, { force: true, recursive: true });
  fs.rmSync(remoteSecretDir, { force: true, recursive: true });
  for (const filePath of prepareSession.files) {
    fs.rmSync(filePath, { force: true });
  }
  for (const filePath of edgeSession.files) {
    fs.rmSync(filePath, { force: true });
  }
  fs.rmSync(prepareTempDir, { force: true, recursive: true });

  console.log('obsidian loader tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
