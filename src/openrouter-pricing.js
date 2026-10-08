'use strict';

// Official model pages: https://openrouter.ai/{model}
// Launch offer: https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/
const CHECKED = '2026-10-08';
const OFFER_END = Date.parse('2026-10-19T15:00:00Z');
const RATES = Object.freeze({
  'elevenlabs/eleven-multilingual-v2': 80,
  'elevenlabs/eleven-flash-v2.5': 40,
  'elevenlabs/eleven-v4': 80,
  'elevenlabs/eleven-v4-turbo': 40,
  'microsoft/mai-voice-2.1-flash': 15,
  'microsoft/mai-voice-2-flash': 15,
  'microsoft/mai-voice-2': 22,
});

function getOpenRouterPricing(modelId, language = 'english', now = Date.now()) {
  const model = String(modelId || '').trim();
  const zh = language === 'chinese';
  const label = (en, cn) => zh ? cn : en;
  const url = /^[a-z0-9.-]+\/[a-z0-9._:-]+$/i.test(model)
    ? 'https://openrouter.ai/' + model.split('/').map(encodeURIComponent).join('/')
    : 'https://openrouter.ai/models';
  const result = {
    name: label('OpenRouter price reference', 'OpenRouter 价格参考'),
    button: label('Official pricing', '官方价格'),
    url,
    description: label('No verified price snapshot for this model. Check its official pricing and billing unit before use.',
      '该模型暂无已核对的价格快照，使用前请查看官方价格及计费单位。'),
  };
  if (!Object.prototype.hasOwnProperty.call(RATES, model)) return result;
  const list = RATES[model];
  const eleven = model.startsWith('elevenlabs/');
  const offerActive = eleven && now >= Date.parse(CHECKED + 'T00:00:00Z') && now < OFFER_END;
  const rate = offerActive ? list / 2 : list;
  const estimate = (rate / 100).toFixed(2);
  let price = label('Reference: USD $' + rate + '/million characters; about $' + estimate + '/10,000 characters.',
    '参考价：' + rate + ' 美元/百万字符；约 ' + estimate + ' 美元/一万字符。');
  if (offerActive) {
    price = label('Launch offer: USD $' + rate + '/million characters (list $' + list + '); about $' + estimate + '/10,000 characters. Ends 2026-10-19 15:00 UTC.',
      '限时五折：' + rate + ' 美元/百万字符（原价 ' + list + '）；约 ' + estimate + ' 美元/一万字符。截止北京时间 2026-10-19 23:00。');
  } else if (eleven) {
    price = label('Last checked list price: USD $' + list + '/million characters. The recorded launch offer is not active; verify the current price.',
      '上次核对的原价：' + list + ' 美元/百万字符。已记录的优惠不在有效期内，请核对现价。');
  }
  result.description = price + ' ' + label(
    'Checked ' + CHECKED + ', not a live quote. Per character, not per word. Repeat synthesis can add cost; fees and taxes excluded. Final charges follow OpenRouter.',
    '核对日期 ' + CHECKED + '，非实时报价。按字符而非英文单词计费；重复合成可能增加费用，不含手续费及税费，以 OpenRouter 实际账单为准。');
  return result;
}

module.exports = { getOpenRouterPricing };

