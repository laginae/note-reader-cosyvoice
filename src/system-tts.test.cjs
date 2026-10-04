const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { buildSystemSpeechCommand, getSystemVoiceKey, normalizeSystemVoice, parseSystemVoices,
  runSystemSpeechCommand, synthesizeSystemSpeech, startSystemNarrator } = require('./system-tts');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = 0;
  child.kill = () => { child.kills++; queueMicrotask(() => child.emit('close', null)); };
  return child;
}

function wave(rate = 16000) {
  const out = Buffer.alloc(48);
  out.write('RIFF'); out.writeUInt32LE(40, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36);
  out.writeUInt32LE(4, 40); out.writeInt16LE(123, 44); out.writeInt16LE(-123, 46);
  return out;
}

test('Windows command uses fixed code, trusted executable and process-local data, not shell interpolation', () => {
  const options = { platform: 'win32', systemRoot: 'C:\\Windows', voice: "Voice '; exit #",
    inputPath: "D:\\notes\\private';.txt", outputPath: 'D:\\out.wav' };
  const command = buildSystemSpeechCommand(options);
  assert.equal(command.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(command.env.NOTE_READER_SYSTEM_VOICE, options.voice);
  assert.equal(command.env.NOTE_READER_SYSTEM_INPUT, options.inputPath);
  const script = Buffer.from(command.args.at(-1), 'base64').toString('utf16le');
  assert.equal(script.includes(options.voice), false);
  assert.equal(script.includes(options.inputPath), false);
  assert.match(script, /SetOutputToWaveFile\(\$env:NOTE_READER_SYSTEM_OUTPUT, \$format\)/);
  assert.match(script, /\$synth.Rate = 0/);
  assert.match(script, /::new\(16000,/);
  assert.match(script, /synth.SpeakProgress \+= handler/);
  assert.equal(script.includes('e.Text'), false);
  assert.equal(command.args.at(-1), buildSystemSpeechCommand({ ...options, voice: 'Another voice' }).args.at(-1));
});

test('macOS command passes voice and filenames as separate arguments and produces fixed PCM WAV', () => {
  assert.deepEqual(buildSystemSpeechCommand({ platform: 'darwin', action: 'list' }).args, ['-v', '?']);
  const command = buildSystemSpeechCommand({ platform: 'darwin', voice: 'Daniel (Enhanced)', inputPath: '/tmp/a b.txt', outputPath: '/tmp/a b.wav' });
  assert.equal(command.executable, '/usr/bin/say');
  assert.deepEqual(command.args, ['-v', 'Daniel (Enhanced)', '--file-format=WAVE', '--data-format=LEI16@24000', '-o', '/tmp/a b.wav', '-f', '/tmp/a b.txt']);
  assert.throws(() => buildSystemSpeechCommand({ platform: 'linux' }), { code: 'SYSTEM_TTS_UNAVAILABLE' });
  assert.throws(() => buildSystemSpeechCommand({ platform: 'darwin', voice: 'bad\nvoice' }), { code: 'SYSTEM_TTS_VOICE' });
});

test('voice catalog parsing preserves multiword and Chinese names, rejects malformed entries and deduplicates', () => {
  assert.deepEqual(parseSystemVoices('\uFEFF[{"id":"Test Voice","language":"en-GB","gender":"Male"},{"id":"Test Voice","language":"en-GB"},{"id":"bad\\nvoice","language":"zh-CN"}]', 'win32'),
    [{ id: 'Test Voice', name: 'Test Voice', language: 'en-GB', gender: 'Male' }]);
  assert.equal(parseSystemVoices('{"id":"慧慧","language":"zh-CN","gender":"Female"}', 'win32')[0].id, '慧慧');
  assert.deepEqual(parseSystemVoices('[]', 'win32'), []);
  assert.throws(() => parseSystemVoices('private process output', 'win32'), { code: 'SYSTEM_TTS_COMMAND' });
  assert.deepEqual(parseSystemVoices('Daniel (Enhanced) en_GB # Hello\n婷婷 zh_CN # 你好\ninvalid\n婷婷 zh_CN # repeat', 'darwin'), [
    { id: 'Daniel (Enhanced)', name: 'Daniel (Enhanced)', language: 'en-GB', gender: '' },
    { id: '婷婷', name: '婷婷', language: 'zh-CN', gender: '' },
  ]);
  assert.equal(normalizeSystemVoice('\0invalid'), '');
  assert.equal(normalizeSystemVoice('a'.repeat(201)), '');
  assert.equal(getSystemVoiceKey('darwin'), 'systemVoiceMac');
  assert.equal(getSystemVoiceKey('win32'), 'systemVoiceWindows');
});

test('process output handles split UTF-8; no shell or visible console is used', async () => {
  const child = fakeChild();
  const result = runSystemSpeechCommand({ executable: 'fixed', args: [], env: {} }, {
    spawnImpl: (_exe, _args, options) => {
      assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
      queueMicrotask(() => {
        const value = Buffer.from('中文');
        child.stdout.emit('data', value.subarray(0, 2));
        child.stdout.emit('data', value.subarray(2)); child.emit('close', 0);
      });
      return child;
    },
  });
  assert.equal(await result, '中文');
  assert.equal(child.kills, 0);
});

test('stop kills only its own process; pre-aborted work never starts', async () => {
  const child = fakeChild(); const other = fakeChild(); const controller = new AbortController();
  const work = runSystemSpeechCommand({ args: [], env: {} }, { spawnImpl: () => child, signal: controller.signal });
  controller.abort();
  await assert.rejects(work, { code: 'SYSTEM_TTS_STOPPED' });
  assert.equal(child.kills, 1); assert.equal(other.kills, 0);
  await assert.rejects(runSystemSpeechCommand({}, { signal: controller.signal, spawnImpl: () => assert.fail('Must not spawn') }), { code: 'SYSTEM_TTS_STOPPED' });
});

test('timeout, excessive output and process failure are bounded and do not expose private stderr', async () => {
  const timeout = fakeChild();
  await assert.rejects(runSystemSpeechCommand({ args: [], env: {} }, { spawnImpl: () => timeout, timeoutMs: 5 }), { code: 'SYSTEM_TTS_TIMEOUT' });
  assert.equal(timeout.kills, 1);
  for (const excessive of [false, true]) {
    const child = fakeChild();
    const result = runSystemSpeechCommand({ args: [], env: {} }, { spawnImpl: () => {
      queueMicrotask(() => { child.stderr.emit('data', excessive ? Buffer.alloc(128 * 1024 + 1) : Buffer.from('secret-note-and-path')); child.emit('close', 1); });
      return child;
    } });
    await assert.rejects(result, error => error.code === 'SYSTEM_TTS_COMMAND' && !error.message.includes('secret-note'));
  }
});

test('unavailable explicit voices and empty catalogs never start synthesis or silently select a fallback', async () => {
  const spawnImpl = () => assert.fail('Must not spawn');
  await assert.rejects(synthesizeSystemSpeech({ platform: 'win32', voices: [], spawnImpl }), { code: 'SYSTEM_TTS_VOICES' });
  await assert.rejects(synthesizeSystemSpeech({ platform: 'win32', voice: 'missing', voices: [{ id: 'installed' }], spawnImpl }), { code: 'SYSTEM_TTS_VOICE' });
});

test('native output is validated before playback/export, including truncation and incompatible formats', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-reader-system-test-'));
  const outputPath = path.join(dir, 'sample.wav');
  try {
    for (const bytes of [wave(), wave(22050), wave().subarray(0, 47)]) {
      fs.writeFileSync(outputPath, bytes);
      const options = { platform: 'win32', voices: [{ id: 'installed' }], outputPath, inputPath: 'synthetic.txt',
        spawnImpl: () => { const child = fakeChild(); queueMicrotask(() => child.emit('close', 0)); return child; } };
      if (bytes.length === 48 && bytes.readUInt32LE(24) === 16000) await synthesizeSystemSpeech(options);
      else await assert.rejects(synthesizeSystemSpeech(options), { code: 'SYSTEM_TTS_AUDIO' });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Narrator launch uses only the trusted built-in executable, never shell interpolation or global process termination', async () => {
  const child = fakeChild(); let unrefs = 0;
  child.unref = () => { unrefs++; };
  await startSystemNarrator({ platform: 'win32', systemRoot: 'C:\\Windows', readyDelayMs: 5,
    spawnImpl: (exe, args, options) => {
      assert.equal(exe, 'C:\\Windows\\System32\\Narrator.exe'); assert.deepEqual(args, []);
      assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
      queueMicrotask(() => child.emit('spawn')); return child;
    } });
  assert.equal(child.kills, 0); assert.equal(unrefs, 1);
  await assert.rejects(startSystemNarrator({ platform: 'darwin', spawnImpl: () => assert.fail('Do not launch on macOS') }), { code: 'SYSTEM_TTS_UNAVAILABLE' });
  await assert.rejects(startSystemNarrator({ platform: 'win32', spawnImpl: () => {
    const failing = fakeChild(); queueMicrotask(() => failing.emit('error', new Error('private path'))); return failing;
  } }), error => error.code === 'SYSTEM_TTS_COMMAND' && !error.message.includes('private path'));
});
