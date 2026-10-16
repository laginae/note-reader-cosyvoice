'use strict';

// Classify locally, but never display raw subprocess output: it may contain
// document fragments, local paths or request URLs with connection tokens.
function edgeTtsError(detail, language, kind = 'failed') {
  const zh = language === 'chinese';
  if (kind === 'command') return zh
    ? '无法启动 Edge TTS。请检查设置中的可执行文件路径及运行权限。'
    : 'Could not start Edge TTS. Check the configured executable path and permissions.';
  if (kind === 'timeout') return zh
    ? 'Edge TTS 合成超时。请检查网络，稍后重试。'
    : 'Edge TTS synthesis timed out. Check the network and try again later.';
  const text = String(detail || '');
  if (/\b403\b/.test(text)) return zh
    ? 'Edge TTS 服务拒绝连接（HTTP 403）。请更新所配置的 edge-tts（建议 7.3.1 或更新版本）后重试；若仍失败，请检查网络和系统时间，或选择其他语音引擎。'
    : 'Edge TTS rejected the connection (HTTP 403). Update the configured edge-tts (7.3.1 or newer recommended). If it persists, check the network and system clock, or use another speech engine.';
  if (/\b429\b/.test(text)) return zh
    ? 'Edge TTS 请求过于频繁（HTTP 429）。请稍后再试。'
    : 'Edge TTS received too many requests (HTTP 429). Please try again later.';
  if (/certificate_verify_failed|ClientConnectorCertificateError/i.test(text)) return zh
    ? 'Edge TTS 无法验证服务器证书。请检查系统时间和网络证书配置。'
    : 'Edge TTS could not verify the server certificate. Check the system clock and network certificate configuration.';
  if (/NoAudioReceived/.test(text)) return zh
    ? 'Edge TTS 未返回音频。请检查音色 ID、网络及 edge-tts 版本。'
    : 'Edge TTS returned no audio. Check the voice ID, network and edge-tts version.';
  return zh ? 'Edge TTS 合成失败。请检查网络、音色 ID 和 edge-tts 版本。'
    : 'Edge TTS synthesis failed. Check the network, voice ID and edge-tts version.';
}

module.exports = { edgeTtsError };
