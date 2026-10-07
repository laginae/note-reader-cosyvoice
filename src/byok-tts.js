'use strict';

const { createHash, randomUUID } = require('crypto');
const { extractMp3Frames } = require('./audio-export');

const BYOK_DEFAULTS = { byokProfiles: [], byokActiveProfileId: '' };
const BYOK_PROVIDERS = {
  'openai-compatible': { name: 'OpenAI-compatible', endpoint: 'https://api.openai.com/v1/audio/speech', model: 'gpt-4o-mini-tts', voice: 'onyx', docs: 'https://developers.openai.com/api/docs/guides/text-to-speech' },
  elevenlabs: { name: 'ElevenLabs', endpoint: 'https://api.elevenlabs.io/v1/text-to-speech', model: 'eleven_multilingual_v2', voice: '', docs: 'https://elevenlabs.io/docs/api-reference/text-to-speech/convert' },
  minimax: { name: 'MiniMax', endpoint: 'https://api.minimax.io/v1/t2a_v2', model: 'speech-2.8-hd', voice: '', docs: 'https://platform.minimax.io/docs/api-reference/speech-t2a-http' },
};
const MAX_BYOK_PROFILES = 20;
const clean = (value, max = 256) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function byokError(message) {
  const error = new Error(`BYOK: ${message}`);
  error.byokSafe = true;
  return error;
}

function createByokProfile(provider = 'openai-compatible') {
  if (!Object.hasOwn(BYOK_PROVIDERS, provider)) provider = 'openai-compatible';
  const preset = BYOK_PROVIDERS[provider];
  return normalizeProfile({ id: randomUUID(), name: preset.name, provider, ...preset });
}

function normalizeProfile(value = {}) {
  const provider = clean(value.provider, 32);
  const preset = Object.hasOwn(BYOK_PROVIDERS, provider) ? BYOK_PROVIDERS[provider] : null;
  const name = clean(value.name, 80) || 'BYOK';
  // Older profiles did not track manual names and kept the initial preset label.
  const autoName = typeof value.autoName === 'boolean' ? value.autoName
    : Object.values(BYOK_PROVIDERS).some(item => item.name === name);
  return {
    id: clean(value.id, 80), name: autoName && preset ? preset.name : name, autoName,
    provider, endpoint: clean(value.endpoint, 2048),
    model: clean(value.model), voice: clean(value.voice),
    credentialSource: value.credentialSource === 'key-file' ? 'key-file' : 'obsidian-secret',
    secretName: clean(value.secretName), keyPath: clean(value.keyPath, 2048),
    chunkLimit: Math.max(50, Math.min(2000, Math.floor(Number(value.chunkLimit) || 800))),
    consent: /^[a-f0-9]{64}$/.test(value.consent || '') ? value.consent : '',
  };
}

function normalizeByokSettings(settings) {
  const ids = new Set();
  settings.byokProfiles = (Array.isArray(settings.byokProfiles) ? settings.byokProfiles : [])
    .filter(value => value && typeof value === 'object').slice(0, MAX_BYOK_PROFILES)
    .map(normalizeProfile).filter(profile => {
      if (!profile.id || ids.has(profile.id)) return false;
      ids.add(profile.id); return true;
    });
  settings.byokActiveProfileId = ids.has(settings.byokActiveProfileId) ? settings.byokActiveProfileId : '';
}

function getByokProfile(settings) {
  return settings?.byokProfiles?.find(profile => profile.id === settings.byokActiveProfileId) || null;
}

function validateByokEndpoint(profile) {
  let url;
  try { url = new URL(profile.endpoint); } catch { throw byokError('Enter a complete HTTPS speech endpoint. / 请填写完整 HTTPS 语音接口地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /[\s\\]/.test(profile.endpoint)) {
    throw byokError('Only HTTPS addresses without embedded credentials, query parameters or fragments are allowed. / 地址须为 HTTPS，不能含密钥、查询参数或片段。');
  }
  if (!Object.hasOwn(BYOK_PROVIDERS, profile.provider)) throw byokError('Choose a supported API type. / 请选择支持的接口类型。');
  if (profile.provider === 'elevenlabs' && url.href !== BYOK_PROVIDERS.elevenlabs.endpoint) {
    throw byokError('Use the ElevenLabs text-to-speech endpoint shown in the preset. / 请使用预设的 ElevenLabs 语音接口。');
  }
  if (profile.provider === 'minimax' && !['https://api.minimax.io/v1/t2a_v2', 'https://api.minimaxi.com/v1/t2a_v2'].includes(url.href)) {
    throw byokError('Use the MiniMax international or mainland China speech endpoint. / 请使用 MiniMax 国际站或国内站语音接口。');
  }
  return url.href;
}

function byokConsentFingerprint(profile) {
  if (!profile) return '';
  try {
    return createHash('sha256').update(JSON.stringify([
      'byok-consent-v1', profile.provider, validateByokEndpoint(profile), profile.model, profile.voice,
      profile.credentialSource, profile.credentialSource === 'key-file' ? profile.keyPath : profile.secretName,
    ])).digest('hex');
  } catch { return ''; }
}

function hasByokConsent(profile) {
  const fingerprint = byokConsentFingerprint(profile);
  return Boolean(fingerprint && profile.consent === fingerprint);
}

function getByokConfigurationError(profile, requireConsent = true) {
  if (!profile) return 'BYOK: add and select an API profile. / 请添加并选择接口配置。';
  try { validateByokEndpoint(profile); } catch (error) { return error.message; }
  if (!profile.model || !profile.voice || /[\r\n]/.test(profile.model + profile.voice)) return 'BYOK: enter a model and voice ID. / 请填写模型和音色 ID。';
  if (requireConsent && !hasByokConsent(profile)) return 'BYOK: confirm data processing and billing risks for this configuration in settings. / 请在设置中确认当前配置的数据处理与费用风险。';
  return null;
}

function updateByokProfile(profile, patch) {
  const next = normalizeProfile({ ...profile, ...patch,
    ...(Object.hasOwn(patch, 'name') ? { autoName: false } : {}), id: profile.id });
  if (next.endpoint !== profile.endpoint || next.provider !== profile.provider) {
    // Never carry an existing credential over to a newly selected destination.
    next.secretName = ''; next.keyPath = ''; next.consent = '';
  }
  if (byokConsentFingerprint(next) !== byokConsentFingerprint(profile)) next.consent = '';
  return next;
}

function assertByokAuthorized(profile, settings) {
  const error = getByokConfigurationError(profile);
  if (error) throw byokError(error.replace(/^BYOK: /, ''));
  const live = settings?.byokProfiles?.find(item => item.id === profile.id);
  if (!hasByokConsent(live) || byokConsentFingerprint(live) !== byokConsentFingerprint(profile)
    || live.chunkLimit !== profile.chunkLimit || settings.byokActiveProfileId !== profile.id
    || (settings.speechEngine && settings.speechEngine !== 'byok-tts')) {
    throw byokError('Authorization changed or was revoked; reading stopped. / 授权已更改或撤销，朗读已停止。');
  }
}

function decodeByokMp3(bytes) {
  try { extractMp3Frames(bytes); } catch { throw byokError('The service did not return valid MP3 audio. / 服务未返回有效 MP3 音频。'); }
  return bytes;
}

function decodeMinimaxAudio(bytes) {
  let response;
  try { response = JSON.parse(bytes.toString('utf8')); } catch { throw byokError('Invalid MiniMax response. / MiniMax 响应格式无效。'); }
  const code = response?.base_resp?.status_code;
  if (code !== 0) {
    const detail = code === 1008 ? 'Insufficient balance. / 余额不足。'
      : code === 1002 ? 'Rate limit reached. / 请求频率超限。'
        : code === 1004 ? 'Authentication failed. / 密钥认证失败。'
          : 'Check the model, voice, account and service status. / 请检查模型、音色、账户和服务状态。';
    throw byokError(`MiniMax ${Number.isInteger(code) ? code : 'error'}: ${detail}`);
  }
  const audio = response?.data?.audio;
  if (response?.data?.status !== 2 || typeof audio !== 'string' || !audio.length || audio.length % 2 || !/^[a-f0-9]+$/i.test(audio)) {
    throw byokError('MiniMax did not return complete inline audio. / MiniMax 未返回完整的内嵌音频。');
  }
  return decodeByokMp3(Buffer.from(audio, 'hex'));
}

function buildByokRequest(profile, text, apiKey) {
  const error = getByokConfigurationError(profile);
  if (error) throw byokError(error.replace(/^BYOK: /, ''));
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw byokError('Invalid API credential. / API 密钥无效。');
  if (typeof text !== 'string' || !text.trim() || text.length > profile.chunkLimit) throw byokError('Empty text or segment exceeds the profile limit. / 文本为空或超出当前配置的分段上限。');
  let endpoint = validateByokEndpoint(profile);
  const headers = { 'Content-Type': 'application/json', Accept: profile.provider === 'minimax' ? 'application/json' : 'audio/mpeg' };
  let body;
  if (profile.provider === 'elevenlabs') {
    endpoint += `/${encodeURIComponent(profile.voice)}?output_format=mp3_44100_128`;
    headers['xi-api-key'] = apiKey;
    body = { text, model_id: profile.model };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = profile.provider === 'minimax'
      ? { model: profile.model, text, stream: false, voice_setting: { voice_id: profile.voice, speed: 1 }, audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 }, output_format: 'hex' }
      : { model: profile.model, input: text, voice: profile.voice, response_format: 'mp3', speed: 1 };
  }
  return { endpoint, headers, body: JSON.stringify(body), serviceLabel: 'BYOK TTS',
    decodeAudio: profile.provider === 'minimax' ? decodeMinimaxAudio : decodeByokMp3,
    retryTemporaryFailures: false };
}

function safeByokRequestError(error) {
  if (error?.byokSafe) return error;
  const status = Number(error?.statusCode);
  const detail = status === 401 || status === 403 ? 'Check the API key and account permissions. / 请检查密钥和账户权限。'
    : status === 402 ? 'Insufficient balance or billing quota. / 余额不足或计费额度已用尽。'
      : status === 429 ? 'Rate or quota limit reached. / 请求频率或额度超限。'
        : status >= 300 && status < 400 ? 'Redirects are not followed; check the endpoint. / 不会跟随重定向，请检查接口地址。'
          : 'Check connectivity, HTTPS endpoint, speech model, voice and account. / 请检查网络、HTTPS 接口、语音模型、音色和账户。';
  return byokError(`${Number.isInteger(status) && status >= 100 && status <= 599 ? `HTTP ${status}. ` : ''}${detail} No automatic retry. / 未自动重试。`);
}

module.exports = { BYOK_DEFAULTS, BYOK_PROVIDERS, MAX_BYOK_PROFILES, createByokProfile, normalizeByokSettings,
  getByokProfile, validateByokEndpoint, byokConsentFingerprint, hasByokConsent, getByokConfigurationError,
  updateByokProfile, assertByokAuthorized, buildByokRequest, decodeByokMp3, decodeMinimaxAudio, safeByokRequestError };
