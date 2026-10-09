'use strict';

const { translate } = require('./i18n');

function preparationStatusText(state, language) {
  if (!['queued', 'synthesizing'].includes(state?.phase)) return '';
  const labels = {
    synthesizing: ['Synthesizing target segment', '正在合成目标段'],
    waiting: ['Waiting for existing synthesis (no duplicate request)', '等待已有合成完成（不重复请求）'],
    loading: ['Loading audio', '正在加载音频'],
    'rate-limited': ['Provider rate limit; reducing concurrency and waiting', '接口限流，已降低并发并等待'],
  };
  const label = labels[state.preparationStatus];
  return label ? translate(language, ...label) : '';
}

module.exports = { preparationStatusText };
