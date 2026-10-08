const test = require('node:test');
const assert = require('node:assert/strict');
const { getOpenRouterPricing } = require('./openrouter-pricing');
const during = Date.parse('2026-10-08T08:00:00Z');

test('verified model prices use character units and matching official links', () => {
  for (const [id, amount] of [
    ['elevenlabs/eleven-v4', 40], ['elevenlabs/eleven-multilingual-v2', 40],
    ['elevenlabs/eleven-flash-v2.5', 20], ['elevenlabs/eleven-v4-turbo', 20],
    ['microsoft/mai-voice-2.1-flash', 15], ['microsoft/mai-voice-2-flash', 15],
    ['microsoft/mai-voice-2', 22],
  ]) {
    const en = getOpenRouterPricing(id, 'english', during);
    assert.ok(en.description.includes('$' + amount + '/million characters'));
    assert.ok(en.description.includes('$' + (amount / 100).toFixed(2) + '/10,000 characters'));
    assert.match(en.description, /Checked 2026-10-08, not a live quote/);
    assert.equal(en.url, 'https://openrouter.ai/' + id);
    const zh = getOpenRouterPricing(id, 'chinese', during);
    assert.ok(zh.description.includes(amount + ' 美元/百万字符'));
    assert.match(zh.description, /按字符而非英文单词/);
  }
});

test('offer expires at its UTC boundary and never presents expired discounts as current', () => {
  const end = Date.parse('2026-10-19T15:00:00Z');
  for (const now of [end, end + 86400000, Date.parse('2026-10-07T00:00:00Z'), NaN]) {
    const price = getOpenRouterPricing('elevenlabs/eleven-v4', 'english', now);
    assert.match(price.description, /Last checked list price: USD \$80/);
    assert.doesNotMatch(price.description, /Launch offer:|\$40|\/10,000/);
  }
  assert.match(getOpenRouterPricing('elevenlabs/eleven-v4', 'english', end - 1).description, /Launch offer:/);
  assert.match(getOpenRouterPricing('elevenlabs/eleven-v4', 'chinese', during).description, /2026-10-19 23:00/);
});

test('unknown, custom and malformed IDs never inherit another model price', () => {
  for (const id of ['elevenlabs/unknown', 'elevenlabs/eleven-v4:free', 'fish-audio/s2.1-pro',
    'google/gemini-tts', '__proto__', 'constructor', 'https://example.com/x', 'javascript:alert(1)', '']) {
    const price = getOpenRouterPricing(id, 'english', during);
    assert.match(price.description, /No verified price snapshot/);
    assert.doesNotMatch(price.description, /\$|Launch offer/);
    assert.ok(price.url.startsWith('https://openrouter.ai/'));
  }
  assert.equal(getOpenRouterPricing('  elevenlabs/eleven-v4  ', 'english', during).url,
    'https://openrouter.ai/elevenlabs/eleven-v4');
});

