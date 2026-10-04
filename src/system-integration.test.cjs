const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const notices = [];
const rows = [];
class Setting {
  constructor() { this.buttons = []; this.options = {}; rows.push(this); }
  setName(value) { this.name = value; return this; }
  setDesc(value) { this.desc = value; return this; }
  setClass(value) { this.className = value; return this; }
  addDropdown(callback) {
    const dropdown = { addOption: (key, value) => { this.options[key] = value; return dropdown; },
      setValue: value => { this.value = value; return dropdown; },
      setDisabled: value => { this.disabled = value; return dropdown; },
      onChange: action => { this.change = action; return dropdown; } };
    callback(dropdown); return this;
  }
  addButton(callback) {
    const button = { setButtonText: value => { button.text = value; return button; },
      setDisabled: value => { button.disabled = value; return button; },
      onClick: action => { button.click = action; return button; } };
    this.buttons.push(button); callback(button); return this;
  }
}
const loaded = { exports: {} };
// Desktop plugin loaders provide built-ins through require, not necessarily a global process.
new Function('require', 'module', 'exports', 'process', fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'))(
  name => name === 'obsidian' ? { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {},
    Setting, Notice: class { constructor(message) { notices.push(message); } } } : require(name),
  loaded, loaded.exports, undefined
);
const { default: PluginClass, __test: api } = loaded.exports;

function fixture() {
  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { ...api.createDefaultSettings(), speechEngine: 'system-tts', scriptPath: '', speed: 2,
    systemVoiceWindows: 'Test voice', systemVoiceMac: 'Test voice' };
  plugin.sequence = 0;
  plugin.readerState = api.createReaderState();
  plugin.saveData = async () => {};
  return plugin;
}

test('system speech is offline, exports WAV and preserves the previous engine default', () => {
  assert.equal(api.normalizeSpeechEngine('system-tts'), 'system-tts');
  assert.equal(api.isOnlineSpeechEngine('system-tts'), false);
  assert.equal(api.getAudioExportExtension('system-tts'), 'wav');
  assert.equal(api.createDefaultSettings().speechEngine, 'local-cosyvoice');
  assert.deepEqual(api.getChunkLimitsForSpeechEngine({ chunkLimits: '40,80,120', onlineChunkLimits: '200,400,800' }, 'system-tts'), [40,80,120]);
});

test('configuration does not read API secrets or require CosyVoice; session captures its voice', () => {
  const plugin = fixture();
  plugin.app = { get secretStorage() { assert.fail('Local mode must not read secrets'); } };
  const config = plugin.getSpeechConfiguration();
  if (!['win32', 'darwin'].includes(os.platform())) { assert.equal(config, null); return; }
  assert.equal(config.speechEngine, 'system-tts');
  assert.equal(config.systemVoice, 'Test voice');
  const session = plugin.createSpeechSession(['Public sample.'], 'sample', config);
  plugin.settings.systemVoiceWindows = 'Changed'; plugin.settings.systemVoiceMac = 'Changed';
  assert.equal(session.systemVoice, 'Test voice');
  assert.equal(session.systemSpeechControllers.size, 0);
});

test('native dispatcher never calls another engine; stop cancels each owned native operation', async () => {
  const plugin = fixture(); const calls = [];
  plugin.runSystemTts = async (...args) => calls.push(args);
  plugin.runCosyVoice = plugin.runEdgeTts = plugin.runAzureSpeech = plugin.runOpenRouterTts = plugin.runMimoTts = () => assert.fail('Must not fall back');
  const session = plugin.createSpeechSession(['Public sample.'], 'sample', { speechEngine: 'system-tts' });
  await plugin.runSpeechEngine('input', 'output', session, 'system-tts');
  assert.deepEqual(calls[0], ['input', 'output', session]);
  const a = new AbortController(), b = new AbortController(), other = new AbortController();
  session.systemSpeechControllers.add(a); session.systemSpeechControllers.add(b);
  await plugin.cancelSessionOperations(session);
  assert.equal(session.stopped, true); assert.equal(a.signal.aborted, true); assert.equal(b.signal.aborted, true);
  assert.equal(other.signal.aborted, false);
});

test('changing settings preserves credentials and selected engine, normalizes only voice identifiers', async () => {
  const plugin = fixture(); let saved;
  plugin.settings.speechEngine = 'mimo-tts'; plugin.settings.mimoSecretName = 'mimo-key';
  plugin.settings.systemVoiceWindows = ' Valid voice '; plugin.settings.systemVoiceMac = 'bad\nvoice';
  plugin.saveData = async value => { saved = value; };
  await plugin.saveSettings();
  assert.equal(saved.speechEngine, 'mimo-tts'); assert.equal(saved.mimoSecretName, 'mimo-key');
  assert.equal(saved.systemVoiceWindows, 'Valid voice'); assert.equal(saved.systemVoiceMac, '');
});

test('stopping while voice enumeration is pending never launches a native synthesis', async () => {
  const plugin = fixture();
  const session = plugin.createSpeechSession(['Public sample.'], 'sample', { speechEngine: 'system-tts' });
  plugin.activeSession = session;
  let resolve;
  plugin.loadSystemSpeechVoices = () => new Promise(ok => { resolve = ok; });
  const work = plugin.runSystemTts('missing-public-test.txt', 'missing-public-test.wav', session);
  await plugin.cancelSessionOperations(session);
  resolve([{ id: 'Test voice' }]);
  await assert.rejects(work, { code: 'SYSTEM_TTS_STOPPED' });
  assert.equal(session.systemSpeechControllers.size, 0);
});

test('system settings show bilingual optional download steps, availability caveats and installed voices', async () => {
  const plugin = fixture(); plugin.systemVoicesReady = true;
  plugin.systemVoices = [{ id: 'Test voice', name: 'Test voice', language: 'en-GB', gender: 'Male' }];
  const tab = new api.CosyVoiceReaderSettingTab({}, plugin);
  tab.displaySequence = 1;
  for (const language of ['english', 'chinese']) {
    rows.length = 0;
    tab.displaySystemSpeechSettings({}, language);
    const content = rows.map(row => `${row.name} ${row.desc}`).join('\n');
    assert.match(content, /Win\+Ctrl\+N/); assert.match(content, /SAPI/); assert.match(content, /Siri/);
    assert.match(content, /Natural HD/);
    assert.match(content, language === 'chinese' ? /当前插件不能调用 Windows 讲述人/ : /cannot currently call Windows Narrator/);
    assert.match(content, language === 'chinese' ? /尚未提供.*公开接口/ : /does not currently provide a supported public interface/);
    assert.match(content, language === 'chinese' ? /重复下载或刷新不能解锁/ : /Downloading again or refreshing cannot unlock/);
    assert.match(content, language === 'chinese' ? /讲述人的声音 → 添加语音 → 添加/ : /Narrator's voice -> Add voices -> Add/);
    assert.match(content, language === 'chinese' ? /旧版界面可能/ : /Older layouts may/);
    assert.match(content, /CosyVoice/); assert.match(content, /macOS/);
    assert.match(content, language === 'chinese' ? /不回退到云端/ : /cloud fallback/);
    assert.equal(rows[1].options['Test voice'].includes('en-GB'), true);
    assert.equal(rows[1].options['Test voice'].includes(language === 'chinese' ? '男声' : 'male'), true);
    let previewText;
    plugin.runUserAction = async (_label, action) => action();
    plugin.startReading = async text => { previewText = text; };
    await rows[1].buttons.find(button => /Preview|试听/.test(button.text)).click();
    assert.match(previewText, /local system voice preview/);
    const before = notices.length;
    plugin.activeSession = {};
    rows[1].buttons.find(button => /Preview|试听/.test(button.text)).click();
    assert.equal(notices.length, before + 1);
    plugin.activeSession = null;
  }
});

test('missing saved voice stays visible as unavailable rather than being silently replaced', () => {
  const plugin = fixture(); plugin.systemVoicesReady = true; plugin.systemVoices = [];
  rows.length = 0;
  const tab = new api.CosyVoiceReaderSettingTab({}, plugin);
  tab.displaySystemSpeechSettings({}, 'english');
  assert.equal(rows[1].value, 'Test voice'); assert.equal(rows[1].options['Test voice'], 'Unavailable: Test voice');
});

test('native settings redraw the latest language after pending detection, never after hide', async () => {
  const plugin = fixture(); plugin.systemVoicesReady = false;
  let resolve;
  plugin.systemVoicePromise = new Promise(ok => { resolve = ok; });
  plugin.loadSystemSpeechVoices = () => plugin.systemVoicePromise;
  const tab = new api.CosyVoiceReaderSettingTab({}, plugin);
  let redraws = 0;
  tab.display = () => { redraws++; };
  tab.displaySequence = 1;
  tab.displaySystemSpeechSettings({}, 'english');
  tab.displaySequence = 2;
  tab.displaySystemSpeechSettings({}, 'chinese');
  resolve([]);
  await new Promise(ok => setImmediate(ok));
  assert.equal(redraws, ['win32', 'darwin'].includes(os.platform()) ? 1 : 0);
  tab.displaySystemSpeechSettings({}, 'chinese');
  tab.hide();
  await new Promise(ok => setImmediate(ok));
  assert.equal(redraws, ['win32', 'darwin'].includes(os.platform()) ? 1 : 0);
});
