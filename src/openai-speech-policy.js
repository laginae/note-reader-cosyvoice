'use strict';

const REALTIME_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets';
const REALTIME_MODEL = 'gpt-realtime-2.1-mini';
const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const SPEECH_SHUTDOWN = Date.parse('2027-01-06T00:00:00Z');

function isOfficialLegacySpeech(profile) {
  if (profile?.provider !== 'openai-compatible') return false;
  try { return new URL(profile.endpoint).href === 'https://api.openai.com/v1/audio/speech'; }
  catch { return false; }
}

function openAiSpeechNotice(profile, chinese = false, now = Date.now()) {
  if (!isOfficialLegacySpeech(profile) || !/^(tts-1(?:-hd)?|gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?)$/.test(profile.model)) return '';
  if (chinese) return `${now >= SPEECH_SHUTDOWN ? '已到官方公告的停用日期。' : ''}OpenAI 公告此模型将于 2027-01-06 停用。请另建配置选择 OpenAI Realtime（实验性），或使用其他语音服务；不能只替换模型名。现有设置及授权不会自动迁移。`;
  return `${now >= SPEECH_SHUTDOWN ? 'The announced shutdown date has passed. ' : ''}OpenAI schedules this model for shutdown on 2027-01-06. Create a separate OpenAI Realtime (experimental) profile or choose another speech service; changing the model ID alone is not a migration. Existing settings and consent are not migrated automatically.`;
}

function realtimeConfigurationError(profile) {
  if (isOfficialLegacySpeech(profile) && /^gpt-realtime/.test(profile.model)) return 'BYOK: Realtime models require the OpenAI Realtime API type, not /audio/speech. / Realtime 模型须选择 OpenAI Realtime 接口类型，不能使用 /audio/speech。';
  if (profile?.provider !== 'openai-realtime') return '';
  if (profile.endpoint !== REALTIME_ENDPOINT) return 'BYOK: OpenAI Realtime requires its fixed official endpoint. / OpenAI Realtime 仅允许预设的官方接口。';
  if (profile.model !== REALTIME_MODEL || !REALTIME_VOICES.includes(profile.voice)) return 'BYOK: use the verified Realtime model and a listed voice. / 请使用已适配的 Realtime 模型及列表内音色。';
  return '';
}

module.exports = { REALTIME_ENDPOINT, REALTIME_MODEL, REALTIME_VOICES, SPEECH_SHUTDOWN,
  isOfficialLegacySpeech, openAiSpeechNotice, realtimeConfigurationError };
