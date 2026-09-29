const MIMO_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
const { parseWaveBuffer } = require('./audio-export');
// Conservative client-side mitigation, not a provider-advertised limit.
const MIMO_MAX_CHUNK_CHARS = 200;
const MIMO_DEFAULTS = {
  mimoConsent: false,
  mimoChunkLimit: 200,
  mimoCredentialSource: 'obsidian-secret',
  mimoSecretName: '',
  mimoKeyPath: '',
  mimoVoice: '白桦',
};
const MIMO_VOICES = [
  ['Dean', 'English male', '英文男声'],
  ['Milo', 'English male', '英文男声'],
  ['Mia', 'English female', '英文女声'],
  ['Chloe', 'English female', '英文女声'],
  ['苏打', 'Chinese male', '中文男声'],
  ['白桦', 'Chinese male', '中文男声'],
  ['冰糖', 'Chinese female', '中文女声'],
  ['茉莉', 'Chinese female', '中文女声'],
];

function normalizeMimoSettings(settings) {
  settings.mimoChunkLimit = Math.max(50, Math.min(2000, Math.floor(Number(settings.mimoChunkLimit) || MIMO_MAX_CHUNK_CHARS)));
  settings.mimoConsent = settings.mimoConsent === true;
  settings.mimoCredentialSource = settings.mimoCredentialSource === 'key-file' ? 'key-file' : 'obsidian-secret';
  settings.mimoSecretName = String(settings.mimoSecretName || '').trim();
  settings.mimoKeyPath = String(settings.mimoKeyPath || '').trim();
  settings.mimoVoice = MIMO_VOICES.some(([id]) => id === settings.mimoVoice) ? settings.mimoVoice : MIMO_DEFAULTS.mimoVoice;
}

function buildMimoRequestBody(text, settings) {
  const normalized = { ...settings };
  normalizeMimoSettings(normalized);
  const speed = Number(settings.speed);
  const rate = Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1;
  return JSON.stringify({
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: `Read the supplied text faithfully in a calm, neutral academic narration style at ${rate} times normal speaking speed. Do not summarize or add words.` },
      { role: 'assistant', content: String(text) },
    ],
    audio: { format: 'wav', voice: normalized.mimoVoice },
    stream: false,
  });
}

function decodeMimoAudio(bytes) {
  // Never expose response text: upstream errors can echo notes or credentials.
  let data;
  let choice;
  try {
    const response = JSON.parse(bytes.toString('utf8'));
    choice = response.choices?.[0];
    data = choice?.message?.audio?.data;
    if (response.error) throw new Error();
  } catch {
    throw new Error('MiMo TTS returned an invalid audio response.');
  }
  if (choice?.finish_reason !== 'stop') {
    const reason = choice?.finish_reason;
    const detail = reason === 'length'
      ? 'Generation reached its length limit; the audio may omit the end of this segment.'
      : reason === 'content_filter'
        ? 'The provider blocked this segment with its content filter.'
        : 'The provider did not confirm normal completion.';
    throw new Error(`MiMo TTS: ${detail} Reading stopped without advancing. Select this segment and retry with shorter chunks. / 本段未确认完整生成，已停止，未跳到下一段；请缩短分段后重试。`);
  }
  if (typeof data !== 'string' || !data.length || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('MiMo TTS returned missing or invalid base64 audio.');
  }
  const audio = Buffer.from(data, 'base64');
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('MiMo TTS returned invalid WAV audio.');
  }
  try {
    if (audio.readUInt32LE(4) + 8 !== audio.length) throw new Error();
    parseWaveBuffer(audio);
  } catch {
    throw new Error('MiMo TTS returned truncated or invalid WAV data. Reading stopped without advancing. / 音频不完整，已停止，未跳到下一段。');
  }
  return audio;
}

module.exports = { MIMO_ENDPOINT, MIMO_DEFAULTS, MIMO_VOICES, MIMO_MAX_CHUNK_CHARS, normalizeMimoSettings, buildMimoRequestBody, decodeMimoAudio };
