'use strict';

const MAX_ERROR_BYTES = 32768;
const REASONS = {
  provider_rejected: 'The upstream provider rejected this segment without giving a specific reason. HTTP 400 alone does not establish insufficient credit.',
  payment_required: 'The service reported insufficient credit or a spending limit.',
  string_too_long: 'The service reported that the input exceeds its text length limit.',
  invalid_voice: 'The service rejected the selected voice.',
  invalid_model: 'The service rejected the selected model.',
  invalid_speed: 'The service rejected the synthesis speed.',
  invalid_ssml: 'The service reported invalid speech markup or unsupported XML characters.',
  content_policy: 'The service reported a content-policy rejection.',
  rate_limit_exceeded: 'The service reported a rate or concurrency limit.',
  no_provider: 'No provider satisfied the requested routing requirements.',
  invalid_request: 'The service reported an invalid request.',
};
const PARAMS = new Set(['input', 'voice', 'model', 'speed', 'response_format', 'provider', 'instructions', 'previous_text', 'next_text']);

// Never copy server strings into errors: providers may echo private input or keys.
function safeRemoteErrorDetail(bytes) {
  if (!bytes || Buffer.byteLength(bytes) > MAX_ERROR_BYTES) return null;
  let parsed;
  try { parsed = JSON.parse(String(bytes)); } catch (_) { return null; }
  const error = parsed?.error || parsed;
  if (!error || typeof error !== 'object') return null;
  const values = [error.message, error.code, error.type, error.metadata?.error_type];
  let upstream = error.metadata?.raw;
  if (typeof upstream === 'string') {
    try { upstream = JSON.parse(upstream); } catch (_) { values.push(upstream); upstream = null; }
  }
  if (upstream && typeof upstream === 'object') {
    const detail = upstream.error || upstream;
    values.push(detail.message, detail.code, detail.type);
  }
  const text = values.filter(v => typeof v === 'string').join(' ').slice(0, MAX_ERROR_BYTES).toLowerCase();
  let reason = null;
  if (/insufficient.{0,30}(credit|balance)|payment_required|quota_exceeded|spending.{0,15}limit/.test(text)) reason = 'payment_required';
  else if (/string_too_long|text.{0,25}too long|input.{0,25}(too long|length.{0,12}exceed)|maximum.{0,20}characters/.test(text)) reason = 'string_too_long';
  else if (/ssml|invalid.{0,20}xml|invalid.{0,20}(unicode|control character)/.test(text)) reason = 'invalid_ssml';
  else if (/invalid_voice|voice.{0,25}(invalid|not found|not supported|unsupported)|unsupported.{0,15}voice/.test(text)) reason = 'invalid_voice';
  else if (/invalid_model|model.{0,25}(not found|not supported)/.test(text)) reason = 'invalid_model';
  else if (/speed.{0,25}(invalid|range|between|not supported)/.test(text)) reason = 'invalid_speed';
  else if (/content_policy|content.{0,20}(filter|moderation)|safety.{0,12}(filter|policy)/.test(text)) reason = 'content_policy';
  else if (/rate_limit|too many requests|concurren/.test(text)) reason = 'rate_limit_exceeded';
  else if (/no.{0,20}provider|no endpoints/.test(text)) reason = 'no_provider';
  else if (/invalid_request|invalid parameter/.test(text)) reason = 'invalid_request';
  else if (/provider returned 400/.test(text)) reason = 'provider_rejected';
  const parameter = PARAMS.has(error.param) ? error.param : null;
  if (!reason && !parameter) return null;
  return { reason, parameter, message: `${reason ? REASONS[reason] : 'The service rejected a request parameter.'}${parameter ? ` Parameter: ${parameter}.` : ''}` };
}

module.exports = { safeRemoteErrorDetail, MAX_ERROR_BYTES };
