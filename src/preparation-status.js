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

function playbackStatusText(state = {}, language, exporting = false) {
  const t = (en, zh) => translate(language, en, zh);
  const n = Number(state.currentChunk) || 0;
  if (state.phase === 'error') return t('Failed', '操作失败');
  if (state.phase === 'complete') return exporting || /export|merge/i.test(state.label) ? t('Export complete', '导出完成') : t('Finished reading', '朗读完毕');
  if (exporting || /export|merging audio|retrying merge/i.test(state.label)) {
    if (/merg/i.test(state.label)) return t('Combining audio', '正在拼接音频');
    return t('Exporting audio', '正在导出音频');
  }
  if (state.isPaused || state.phase === 'paused') return t('Paused', '已暂停');
  if (state.phase === 'extracting PDF') return t('Reading PDF pages', '正在解析 PDF 页面');
  if (state.preparationStatus === 'loading') return t('Loading audio', '正在加载音频');
  if (state.preparationStatus === 'rate-limited') return t('Waiting for the speech service', '正在等待语音服务');
  if (state.phase === 'queued' || state.phase === 'synthesizing') return n
    ? t('Preparing segment {n}', '正在准备第 {n} 段').replace('{n}', n) : t('Preparing audio', '正在准备音频');
  if (state.phase === 'playing') return t('Playing', '正在朗读');
  return state.phase === 'idle' || !state.label ? t('Ready', '就绪') : state.label;
}

module.exports = { preparationStatusText, playbackStatusText };
