const fs = require('fs');
const path = require('path');
const os = require('os');
const { env: systemEnvironment } = require('process');
const { spawn } = require('child_process');
const { parseWaveBuffer } = require('./audio-export');

const MAX_COMMAND_OUTPUT = 128 * 1024;
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
    @{ id = $_.VoiceInfo.Name; name = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name; gender = $_.VoiceInfo.Gender.ToString() }
  })
  if ($env:NOTE_READER_SYSTEM_ACTION -eq 'list') {
    [Console]::Write((ConvertTo-Json -InputObject $voices -Compress -Depth 4))
  } else {
    if ($voices.Count -eq 0) { throw 'No installed voices' }
    if ($env:NOTE_READER_SYSTEM_VOICE) {
      if (-not ($voices | Where-Object { $_.id -ceq $env:NOTE_READER_SYSTEM_VOICE })) { throw 'Voice unavailable' }
      $synth.SelectVoice($env:NOTE_READER_SYSTEM_VOICE)
    }
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.Rate = 0
    $synth.SetOutputToWaveFile($env:NOTE_READER_SYSTEM_OUTPUT, $format)
    Add-Type -ReferencedAssemblies ([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location) -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class NoteReaderWord {
  public int Start { get; set; }
  public int Length { get; set; }
  public double Time { get; set; }
}
public class NoteReaderBoundaries {
  public List<NoteReaderWord> Words = new List<NoteReaderWord>();
  public bool Complete = true;
  public void Speak(SpeechSynthesizer synth, string text) {
    EventHandler<SpeakProgressEventArgs> handler = (sender, e) => {
      if (Words.Count >= 1024) { Complete = false; return; }
      Words.Add(new NoteReaderWord { Start = e.CharacterPosition, Length = e.CharacterCount, Time = e.AudioPosition.TotalSeconds });
    };
    synth.SpeakProgress += handler;
    try { synth.Speak(text); } finally { synth.SpeakProgress -= handler; }
  }
}
'@
    $text = [System.IO.File]::ReadAllText($env:NOTE_READER_SYSTEM_INPUT, [System.Text.Encoding]::UTF8)
    $boundaries = New-Object NoteReaderBoundaries
    $boundaries.Speak($synth, $text)
    $synth.SetOutputToNull()
    [Console]::Write((ConvertTo-Json -InputObject @{ sourceLength = $text.Length; complete = $boundaries.Complete; words = @($boundaries.Words.ToArray()) } -Compress -Depth 4))
  }
} finally { $synth.Dispose() }
`;

function systemSpeechError(code) {
  const messages = {
    unavailable: 'System speech is supported on Windows and macOS only.',
    voices: 'No usable installed system voices were found. Open system speech settings to install a voice, then refresh.',
    voice: 'The selected system voice is unavailable. Refresh the list and choose an installed voice; no online fallback is used.',
    command: 'System speech could not run. Check the installed system voices and the operating system speech service.',
    timeout: 'System speech timed out. Try another installed voice or a shorter segment.',
    stopped: 'System speech stopped.',
    audio: 'System speech generated invalid or incomplete WAV audio.',
  };
  const error = new Error(messages[code] || messages.command);
  error.code = `SYSTEM_TTS_${code.toUpperCase()}`;
  return error;
}

function normalizeSystemVoice(value) {
  const voice = typeof value === 'string' ? value.trim() : '';
  return voice.length <= 200 && !/[\x00-\x1f\x7f]/.test(voice) ? voice : '';
}

function getSystemVoiceKey(platform = os.platform()) {
  return platform === 'darwin' ? 'systemVoiceMac' : 'systemVoiceWindows';
}

function buildSystemSpeechCommand(options = {}) {
  const platform = options.platform || os.platform();
  if (platform !== 'win32' && platform !== 'darwin') throw systemSpeechError('unavailable');
  const listing = options.action === 'list';
  const voice = normalizeSystemVoice(options.voice);
  if (options.voice && voice !== options.voice) throw systemSpeechError('voice');
  if (platform === 'win32') {
    // Only fixed code is encoded. Paths and voice names are process-local data, never script source.
    return {
      executable: path.win32.join(options.systemRoot || systemEnvironment.SystemRoot || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')],
      env: { NOTE_READER_SYSTEM_ACTION: listing ? 'list' : 'speak', NOTE_READER_SYSTEM_VOICE: voice,
        NOTE_READER_SYSTEM_INPUT: listing ? '' : options.inputPath, NOTE_READER_SYSTEM_OUTPUT: listing ? '' : options.outputPath },
    };
  }
  return {
    executable: '/usr/bin/say',
    args: listing ? ['-v', '?'] : [
      ...(voice ? ['-v', voice] : []),
      '--file-format=WAVE', '--data-format=LEI16@24000', '-o', options.outputPath, '-f', options.inputPath,
    ],
    env: {},
  };
}

function parseSystemVoices(output, platform = os.platform()) {
  let voices;
  if (platform === 'win32') {
    try { voices = JSON.parse(String(output).replace(/^\uFEFF/, '')); }
    catch { throw systemSpeechError('command'); }
    if (!Array.isArray(voices)) voices = voices ? [voices] : [];
  } else {
    voices = String(output).split(/\r?\n/).flatMap(line => {
      const match = line.match(/^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9_-]+)\s+#/);
      return match ? [{ id: match[1].trim(), name: match[1].trim(), language: match[2].replace(/_/g, '-'), gender: '' }] : [];
    });
  }
  const seen = new Set();
  return voices.filter(voice => {
    if (!voice || typeof voice.id !== 'string' || !voice.id || normalizeSystemVoice(voice.id) !== voice.id
      || typeof voice.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/i.test(voice.language)
      || seen.has(voice.id)) return false;
    seen.add(voice.id);
    return true;
  }).slice(0, 1000).map(voice => ({ id: voice.id, name: voice.id, language: voice.language,
    gender: ['Male', 'Female'].includes(voice.gender) ? voice.gender : '' }));
}

function runSystemSpeechCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(systemSpeechError('stopped')); return; }
    let child, timer, settled = false, closed = false, bytes = 0;
    const chunks = [];
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error) {
        if (!child || closed) { reject(error); return; }
        // Wait briefly for owned file handles to close before temporary-audio cleanup.
        const killTimer = setTimeout(() => reject(error), 1000);
        child.once('close', () => { clearTimeout(killTimer); reject(error); });
        child.kill();
      }
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const abort = () => finish(systemSpeechError('stopped'));
    try {
      child = (options.spawnImpl || spawn)(command.executable, command.args, {
        windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...systemEnvironment, ...command.env },
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', chunk => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > MAX_COMMAND_OUTPUT) finish(systemSpeechError('command'));
        else chunks.push(Buffer.from(chunk));
      });
      child.stderr.on('data', chunk => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > MAX_COMMAND_OUTPUT) finish(systemSpeechError('command'));
      });
      child.on('error', () => finish(systemSpeechError('command')));
      child.on('close', code => { closed = true; finish(code === 0 ? null : systemSpeechError('command')); });
      timer = setTimeout(() => finish(systemSpeechError('timeout')), options.timeoutMs || 120000);
      if (options.signal?.aborted) abort();
    } catch { finish(systemSpeechError('command')); }
  });
}

async function listSystemVoices(options = {}) {
  const platform = options.platform || os.platform();
  const output = await runSystemSpeechCommand(buildSystemSpeechCommand({ ...options, action: 'list' }), {
    ...options, timeoutMs: options.timeoutMs || 15000,
  });
  return parseSystemVoices(output, platform);
}

async function synthesizeSystemSpeech(options = {}) {
  const platform = options.platform || os.platform();
  const voices = options.voices || await listSystemVoices(options);
  if (options.signal?.aborted) throw systemSpeechError('stopped');
  if (!voices.length) throw systemSpeechError('voices');
  const voice = normalizeSystemVoice(options.voice);
  if (options.voice && (voice !== options.voice || !voices.some(item => item.id === voice))) throw systemSpeechError('voice');
  const output = await runSystemSpeechCommand(buildSystemSpeechCommand({ ...options, platform, action: 'speak', voice }), options);
  if (options.signal?.aborted) throw systemSpeechError('stopped');
  let duration;
  try {
    const buffer = await fs.promises.readFile(options.outputPath);
    const parsed = parseWaveBuffer(buffer);
    if (parsed.audioFormat !== 1 || parsed.channels !== 1 || parsed.bitsPerSample !== 16
      || parsed.sampleRate !== (platform === 'win32' ? 16000 : 24000)
      || !parsed.dataChunks.some(chunk => chunk.length > 0)) throw systemSpeechError('audio');
    duration = parsed.dataChunks.reduce((total, chunk) => total + chunk.length, 0) / parsed.byteRate;
  } catch { throw systemSpeechError('audio'); }
  let boundaries = [];
  // Boundary metadata contains offsets only, not words or note names; never log child output.
  if (platform === 'win32' && output) {
    try {
      const data = JSON.parse(output);
      const text = await fs.promises.readFile(options.inputPath, 'utf8');
      if (data.complete === true && data.sourceLength === text.length && Array.isArray(data.words)
        && data.words.length <= 1024) boundaries = data.words.map(word => ({ start: word.Start, length: word.Length, time: word.Time }));
    } catch { /* Audio remains usable when alignment metadata is unavailable. */ }
  }
  return { duration, boundaries };
}

function startSystemNarrator(options = {}) {
  if ((options.platform || os.platform()) !== 'win32') return Promise.reject(systemSpeechError('unavailable'));
  return new Promise((resolve, reject) => {
    let child, timer, settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(systemSpeechError('command'));
      else { child?.unref?.(); resolve(); }
    };
    try {
      child = (options.spawnImpl || spawn)(path.win32.join(options.systemRoot || systemEnvironment.SystemRoot || 'C:\\Windows',
        'System32', 'Narrator.exe'), [], { shell: false, windowsHide: true, stdio: 'ignore' });
      child.once('error', () => finish(true));
      child.once('exit', code => finish(code !== 0));
      child.once('spawn', () => { timer = setTimeout(() => finish(false), options.readyDelayMs || 500); });
    } catch { finish(true); }
  });
}

module.exports = { buildSystemSpeechCommand, getSystemVoiceKey, listSystemVoices, normalizeSystemVoice,
  parseSystemVoices, runSystemSpeechCommand, synthesizeSystemSpeech, systemSpeechError, startSystemNarrator };
