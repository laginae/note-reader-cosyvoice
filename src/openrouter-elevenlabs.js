'use strict';

// OpenRouter speech catalog and ZDR endpoint list checked on 2026-10-08.
// This is a preset snapshot, not a permanent privacy or availability guarantee.
const ELEVENLABS_MODELS = [
  ['elevenlabs/eleven-multilingual-v2', 'george', 'ElevenLabs Multilingual v2 - long-form narration', 'ElevenLabs Multilingual v2 - 长文朗读',
    'Long-form narration candidate. Normal-speed synthesis; adjust playback speed in the player. ZDR and denial of data collection are required. Adjacent context is off by default.',
    '长文朗读候选。按正常语速合成，在播放器调整倍速。强制 ZDR 并禁止数据收集。默认不附带相邻上下文。'],
  ['elevenlabs/eleven-flash-v2.5', 'george', 'ElevenLabs Flash v2.5 - fast synthesis', 'ElevenLabs Flash v2.5 - 快速合成',
    'Speed-focused speech model. Normal-speed synthesis; adjust playback speed in the player. Requests require ZDR and deny data collection.',
    '侧重合成速度的语音模型。按正常语速合成，在播放器调整倍速。请求强制 ZDR 并禁止数据收集。'],
  ['elevenlabs/eleven-v4', 'george', 'ElevenLabs Eleven v4 - expressive narration', 'ElevenLabs Eleven v4 - 表现力朗读',
    'Expressive narration with support for audio tags in the input. The plugin adds no tags; existing tags may affect delivery. Normal-speed synthesis with local playback speed control. ZDR is required.',
    '表现力朗读，支持正文中的语音标签。插件不会添加标签；原文已有标签可能影响语气。按正常语速合成，倍速在播放器调整。强制 ZDR。'],
  ['elevenlabs/eleven-v4-turbo', 'george', 'ElevenLabs Eleven v4 Turbo - responsive narration', 'ElevenLabs Eleven v4 Turbo - 快速响应朗读',
    'Responsive expressive speech. No automatic performance tags; adjacent context is off by default. Normal-speed synthesis with local playback speed control. ZDR is required.',
    '侧重响应速度的表现力语音。不自动添加表演标签，默认不附带相邻正文。按正常语速合成，倍速在播放器调整。强制 ZDR。'],
];
const ELEVENLABS_VOICES = [
  ['george', 'George', 'George'],
  ['sarah', 'Sarah', 'Sarah'],
  ['daniel', 'Daniel', 'Daniel'],
  ['alice', 'Alice', 'Alice'],
  ['brian', 'Brian', 'Brian'],
  ['lily', 'Lily', 'Lily'],
];
function isElevenLabsModel(model) {
  return /^elevenlabs\//.test(String(model || '').trim());
}
module.exports = { ELEVENLABS_MODELS, ELEVENLABS_VOICES, isElevenLabsModel };
