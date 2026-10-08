'use strict';

// Exact, non-recursive substitutions. The source stays untouched for highlighting.
function parseTerms(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.length > 20000) return { rules: [], error: 'Maximum 20,000 characters. / 最多 20,000 字符。' };
  const rules = [], seen = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const separator = line.indexOf('=');
    const from = line.slice(0, separator).trim(), to = line.slice(separator + 1).trim();
    if (separator < 1 || !from || !to || from.length > 80 || to.length > 120
      || /[\x00-\x1f]/.test(from + to) || seen.has(from) || rules.length >= 100) {
      return { rules: [], error: `Invalid rule on line ${index + 1}. / 第 ${index + 1} 行规则无效。` };
    }
    seen.add(from); rules.push({ from, to });
  }
  rules.sort((a, b) => b.from.length - a.from.length);
  return { rules, error: '' };
}
function normalizedTerms(value) {
  return parseTerms(value).error ? '' : typeof value === 'string' ? value : '';
}
function termTokens(text, settings = {}) {
  const rules = settings.speechTermsEnabled === true ? parseTerms(settings.speechTerms).rules : [];
  const source = String(text || ''), tokens = [];
  const word = value => /[\p{L}\p{N}_]/u.test(value || '');
  for (let i = 0; i < source.length;) {
    const before = Array.from(source.slice(Math.max(0, i - 2), i)).at(-1);
    const rule = rules.find(({ from }) => source.startsWith(from, i)
      && !(/^[A-Za-z0-9_]/.test(from) && word(before))
      && !(/[A-Za-z0-9_]$/.test(from) && word(String.fromCodePoint(source.codePointAt(i + from.length) || 0))));
    const original = rule ? rule.from : String.fromCodePoint(source.codePointAt(i));
    tokens.push({ source: original, text: rule ? rule.to : original }); i += original.length;
  }
  return tokens;
}
function applyTerms(text, settings) {
  return termTokens(text, settings).map(token => token.text).join('');
}
function fitSpeechParts(text, settings, limit = 800) {
  const maximum = Math.max(120, Number(limit) || 800), parts = [];
  let source = '', speech = '';
  for (const token of termTokens(text, settings)) {
    if (source && speech.length + token.text.length > maximum) {
      parts.push({ source, text: speech }); source = ''; speech = '';
    }
    source += token.source; speech += token.text;
  }
  if (source) parts.push({ source, text: speech });
  return parts;
}

// Explicit model allowlist, not a vendor-prefix test. No history/request IDs.
const CONTEXT_MODELS = new Set([
  'elevenlabs/eleven-multilingual-v2', 'elevenlabs/eleven-flash-v2.5',
  'elevenlabs/eleven-v4', 'elevenlabs/eleven-v4-turbo',
]);
function supportsSpeechContext(model) { return CONTEXT_MODELS.has(model); }
function contextOptions(settings = {}, context = {}) {
  if (settings.openRouterContext !== true || !supportsSpeechContext(settings.openRouterModel)) return {};
  const adjacent = (value, previous) => {
    // Keep only the nearest sentence/paragraph, and bound Unicode characters.
    const sentences = String(value || '').trim().match(/[^。！？.!?\n]+[。！？.!?]?/gu) || [];
    const sentence = previous ? sentences.at(-1) : sentences[0];
    const chars = Array.from(applyTerms(sentence || '', settings).trim());
    return (previous ? chars.slice(-160) : chars.slice(0, 160)).join('');
  };
  const previous = adjacent(context.previous, true), next = adjacent(context.next, false);
  const options = { ...(previous ? { previous_text: previous } : {}), ...(next ? { next_text: next } : {}) };
  return Object.keys(options).length ? { options: { elevenlabs: options } } : {};
}
function adjacentContext(parts, index, previous = '', next = '') {
  return { previous: parts.slice(0, index).join('') || previous,
    next: parts.slice(index + 1).join('') || next };
}
module.exports = { parseTerms, normalizedTerms, applyTerms, fitSpeechParts, supportsSpeechContext, contextOptions, adjacentContext };
