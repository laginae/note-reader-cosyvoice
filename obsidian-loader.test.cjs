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

const allowedBuiltins = new Set(['fs', 'path', 'child_process', 'url']);
const mainPath = path.join(__dirname, 'main.js');
const code = fs.readFileSync(mainPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
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
assert.ok(!/\bObsidian\b/.test(manifest.description));
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
  cleanupCache: true,
  chunkLimits: '40,80,120,160,280,320',
  mathReadingLanguage: 'english',
  scriptPath: '',
  speed: 1,
  stripMarkdown: true,
});
assert.strictEqual(moduleObject.exports.__test.resolveDefaultScriptPath(), '');
assert.ok(!moduleObject.exports.__test.resolveDefaultScriptPath().toLowerCase().includes(['her', 'mes'].join('')));
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('chinese'), 'chinese');
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('skip'), 'skip');
assert.strictEqual(moduleObject.exports.__test.normalizeMathReadingLanguage('bad'), 'english');
const mutatedDefaults = moduleObject.exports.__test.createDefaultSettings();
mutatedDefaults.chunkLimits = '999';
assert.strictEqual(moduleObject.exports.__test.createDefaultSettings().chunkLimits, '40,80,120,160,280,320');
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

const root = new FakeElement('section');
let pauseOrResumeCalls = 0;
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
  jumpToAdjacentChunk: (deltaChunks) => {
    chunkNavigationCalls.push(deltaChunks);
  },
  pauseOrResume: async () => {
    pauseOrResumeCalls += 1;
  },
  readCurrentNote: () => {},
  readFromSelection: () => {},
  readSelection: () => {},
  seekCurrentAudioBySeconds: (deltaSeconds) => {
    seekBySecondsCalls.push(deltaSeconds);
  },
  seekToProgress: () => {},
  setSpeechSpeed: () => {},
  stopReading: () => {},
});
readerView.contentEl = root;
readerView.containerEl = { children: [null, root] };
readerView.render();

assert.strictEqual(root.attributes.tabindex, '0');
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
const pausePointerEvent = createPointerEvent();
pauseButton.dispatchEvent(pausePointerEvent);
assert.strictEqual(pauseOrResumeCalls, 2);
assert.strictEqual(pausePointerEvent.defaultPrevented, true);

const previousChunkButton = findElementByAriaLabel(root, 'Previous chunk');
assert.ok(previousChunkButton);
previousChunkButton.dispatchEvent(createPointerEvent({ type: 'click' }));
assert.deepStrictEqual(chunkNavigationCalls, [-1]);

nextChunkButton.dispatchEvent(createPointerEvent({ type: 'click' }));
assert.deepStrictEqual(chunkNavigationCalls, [-1, 1]);

(async () => {
  const plugin = Object.create(PluginClass.prototype);
  let savedSettings = null;
  plugin.settings = {
    cleanupCache: false,
    chunkLimits: '999',
    mathReadingLanguage: 'chinese',
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
  const synthStatus = prepareStatuses.find((entry) => entry.patch.phase === 'synthesizing');
  assert.strictEqual(synthStatus.patch.canPreviousChunk, true);
  assert.strictEqual(synthStatus.patch.canNextChunk, true);
  for (const filePath of prepareSession.files) {
    fs.rmSync(filePath, { force: true });
  }
  fs.rmSync(prepareTempDir, { force: true, recursive: true });

  console.log('obsidian loader tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
