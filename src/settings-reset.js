'use strict';

const PAGE_KEYS = {
  engine: ['speechEngine', 'systemVoiceWindows', 'systemVoiceMac', 'edgeTtsConsent', 'edgeTtsVoice',
    'azureSpeechConsent', 'azureSpeechVoice', 'openRouterConsent', 'openRouterModel', 'openRouterVoice',
    'mimoConsent', 'mimoVoice', 'mimoChunkLimit', 'openRouterContext'],
  playback: ['speed', 'playbackSpeed', 'playbackVolume', 'chunkLimits', 'onlineChunkLimits', 'onlinePrefetchChunks',
    'smartQuickStart', 'rapidQuickStart', 'highlightColor', 'highlightStrength', 'noteHighlightBorder', 'readerOpenMode', 'readingHighlight', 'readingFollow',
    'webReadingHighlight', 'webReadingFollow', 'copilotChatEnabled', 'copilotChatScope', 'copilotIncludeQuestions'],
  academic: ['stripMarkdown', 'academicMathMode', 'academicMathStyle', 'academicTableMode', 'academicSkipNotice',
    'mathReadingLanguage', 'pdfBookmarksOverwrite', 'pdfFootnoteMode', 'pdfSkipHeaders', 'pdfIncludeGlossary', 'speechTermsEnabled', 'speechTerms'],
  storage: ['audioExportLocation', 'audioExportFolder', 'cleanupCache', 'readingHistoryMode', 'rememberReadingPosition'],
  privacy: ['diagnosticLogging'],
};

function resetPageSettings(settings, defaults, page) {
  const keys = page === 'all' ? Object.values(PAGE_KEYS).flat() : PAGE_KEYS[page];
  if (!keys) throw new Error('Unknown settings page');
  const next = { ...settings };
  for (const key of keys) if (Object.hasOwn(defaults, key)) next[key] = defaults[key];
  // Preserve saved profiles and secret references, but require renewed permission.
  if (['engine', 'all'].includes(page) && Array.isArray(next.byokProfiles)) {
    next.byokProfiles = next.byokProfiles.map(profile => ({ ...profile, consent: '' }));
  }
  return next;
}

module.exports = { PAGE_KEYS, resetPageSettings };
