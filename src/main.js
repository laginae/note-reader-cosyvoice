const { ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting: ObsidianSetting, loadPdfJs, setIcon } = require('obsidian');
const { LANGUAGES, translate: translateInterface, localizedSetting } = require('./i18n');
const { PAGES, createSettingsPages, createSettingsHeader } = require('./settings-pages');
const { resetPageSettings } = require('./settings-reset');
const { SettingsConfirmModal } = require('./settings-confirm');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { extractPdfTextLayout, extractTextFromPdfItems } = require('./pdf-layout');
const { partitionFootnotes, footnoteRules, normalizeFootnoteMode, addFootnoteSettings, splitFootnotesInRange } = require('./pdf-footnotes');
const { recurringEdges, ancillaryLayout, inside: insidePdfRegion, textOf: pdfLinesText, addAncillarySettings } = require('./pdf-ancillary');
const { ACADEMIC_DEFAULTS, academicOptions, academicLatex, mathSpeech, citations, skipTable, omission } = require('./academic-speech');
const { numericTableRegions } = require('./pdf-academic');
const { MAX_HTML_BYTES, captureHtmlSelection, extractHtmlText, getHtmlReaderDocument, isHtmlFile } = require('./html-text');
const { WEB_VIEW_TYPE, captureWebPage, getWebPageUrl, isWebPageView } = require('./web-page');
const { estimatePlayback, formatDuration } = require('./playback-estimate');
const { getSystemVoiceKey, listSystemVoices, normalizeSystemVoice, synthesizeSystemSpeech, systemSpeechError } = require('./system-tts');
const { AccessibleReaderView, DOCUMENT_VIEW_TYPE } = require('./accessible-reader');
const { normalizeReadingHighlight, buildSentenceCues, sentenceAtTime, speechPartOffset } = require('./reading-highlights');
const { buildMarkdownSource, compact } = require('./markdown-source');
const { installNoteHighlights } = require('./note-highlights');
const { NativeToolbarManager } = require('./native-toolbar');
const { PdfReadingHighlights } = require('./pdf-highlights');
const { HtmlReadingHighlights } = require('./html-highlights');
const { COPILOT_DEFAULTS, normalizeCopilotSettings } = require('./copilot-chat');
const { CopilotChatModal, addCopilotChatSettings, readLatestCopilotReply } = require('./copilot-chat-ui');
const { createPdfSpeechChunker } = require('./pdf-chunker');
const { APPEARANCE_DEFAULTS, normalizeAppearance, applyAppearance, clearAppearance } = require('./reader-appearance');
const { SidebarOutline } = require('./sidebar-outline');
const { PdfOutlineModal, addPdfOutlineSettings } = require('./pdf-outline-ui');
const { readerRange } = require('./reader-selection');
const { getSpeechParts, planSpeechParts, adjacentSpeechPart, getSpeechPartTiming } = require('./speech-parts');
const { preparationStatusText } = require('./preparation-status');
const { locateReading } = require('./locate-reading');
const { MIMO_ENDPOINT, MIMO_DEFAULTS, MIMO_VOICES, MIMO_MAX_CHUNK_CHARS, normalizeMimoSettings, buildMimoRequestBody, decodeMimoAudio } = require('./mimo-tts');
const { BYOK_DEFAULTS, normalizeByokSettings, getByokProfile, getByokConfigurationError, assertByokAuthorized, buildByokRequest, safeByokRequestError } = require('./byok-tts');
const { displayByokSettings } = require('./byok-settings');
const {
  MAX_EXPORTED_AUDIO_BYTES,
  bufferToArrayBuffer,
  buildExportAudioFileName,
  mergeAudioFiles,
} = require('./audio-export');
const {
  createReadingAnchor,
  normalizeReadingPositions,
  normalizeAnchorText,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  sliceOriginalTextFromReadingPosition,
  upsertReadingPosition,
  historyMode,
  settingsForStorage,
} = require('./reading-position');
const {
  createIncrementalSpeechChunker,
  parseChunkLimits,
  splitTextForSpeechChunks,
} = require('./semantic-chunker');
const {
  createTaskState,
  transitionTaskState,
} = require('./task-state');

const PLUGIN_ID = 'note-reader-cosyvoice';
const VIEW_TYPE = 'note-reader-cosyvoice-control';
const GITHUB_ISSUES_URL = 'https://github.com/laginae/note-reader-cosyvoice/issues';
const AZURE_TTS_PRIVACY_URL = 'https://learn.microsoft.com/azure/ai-foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security';
const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
const DEFAULT_ONLINE_CHUNK_LIMITS = [200, 400, 800];
const MAX_ONLINE_PREFETCH_CHUNKS = 1;
const DEFAULT_MATH_READING_LANGUAGE = 'english';
const DEFAULT_EDGE_TTS_VOICE = 'en-GB-RyanNeural';
const DEFAULT_EDGE_TTS_EXECUTABLE = 'edge-tts';
const DEFAULT_AZURE_SPEECH_VOICE = 'en-GB-RyanNeural';
const DEFAULT_OPENROUTER_TTS_MODEL = 'fish-audio/s2.1-pro';
const DEFAULT_OPENROUTER_TTS_VOICE = 'b7f1aae6de274690b20cfe990b953b67';
const AZURE_SPEECH_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const OPENROUTER_TTS_ENDPOINT = 'https://openrouter.ai/api/v1/audio/speech';
const RECOMMENDED_SCRIPT_PATH = '%LOCALAPPDATA%\\note-reader-cosyvoice\\cosyvoice-wrapper.ps1';
const SPEED_PRESETS = [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4];
const KEYBOARD_SEEK_SECONDS = 5;
const MATH_READING_LANGUAGES = ['english', 'chinese', 'skip'];
const SETTINGS_LANGUAGES = Object.keys(LANGUAGES);
const AUDIO_EXPORT_LOCATIONS = ['obsidian-attachment', 'note-folder', 'custom-folder'];
const AUDIO_EXPORT_SCOPES = ['entire', 'selection', 'from-selection'];
const CREDENTIAL_SOURCES = ['obsidian-secret', 'key-file'];
const SPEECH_ENGINES = ['local-cosyvoice', 'system-tts', 'edge-tts', 'azure-speech', 'openrouter-tts', 'mimo-tts', 'byok-tts'];
const AZURE_SPEECH_CLOUDS = ['public', 'china'];
const REMOTE_TTS_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const REMOTE_TTS_MAX_ATTEMPTS = 3;
const REMOTE_TTS_RETRY_DELAYS_MS = [750, 1500];
const REMOTE_TTS_RETRY_AFTER_MAX_MS = 10_000;
const REMOTE_TTS_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 524, 529]);
const REMOTE_TTS_RETRYABLE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
]);
const RUNTIME_LOG_MAX_BYTES = 1024 * 1024;
const PDF_MAX_BYTES = 200 * 1024 * 1024;
const PDF_MAX_PAGES = 2000;
const PDF_MAX_TEXT_CHARS = 5_000_000;
const OWNED_CACHE_FILE_PATTERN = /^\d{10,}-\d+-(?:\d+(?:-\d+)?|export)\.(?:txt|wav|mp3)$/i;
const MICROSOFT_VOICE_PRESETS = [
  ['zh-CN-XiaoxiaoNeural', 'Mandarin Chinese - Xiaoxiao (female, warm)', '中文普通话 - 小晓（女声，温暖）'],
  ['zh-CN-XiaoyiNeural', 'Mandarin Chinese - Xiaoyi (female, lively)', '中文普通话 - 小艺（女声，活泼）'],
  ['zh-CN-YunxiNeural', 'Mandarin Chinese - Yunxi (male, lively)', '中文普通话 - 云希（男声，活泼）'],
  ['zh-CN-YunyangNeural', 'Mandarin Chinese - Yunyang (male, professional)', '中文普通话 - 云扬（男声，专业）'],
  ['zh-HK-HiuMaanNeural', 'Cantonese Chinese - HiuMaan (female)', '中文粤语 - 晓曼（女声）'],
  ['zh-TW-HsiaoChenNeural', 'Taiwan Chinese - HsiaoChen (female)', '中文台湾 - 晓臻（女声）'],
  ['en-US-JennyNeural', 'English (US) - Jenny (female)', '美式英语 - Jenny（女声）'],
  ['en-US-GuyNeural', 'English (US) - Guy (male)', '美式英语 - Guy（男声）'],
  ['en-US-AriaNeural', 'English (US) - Aria (female)', '美式英语 - Aria（女声）'],
  ['en-GB-SoniaNeural', 'English (UK) - Sonia (female)', '英式英语 - Sonia（女声）'],
  ['en-GB-RyanNeural', 'English (UK) - Ryan (male)', '英式英语 - Ryan（男声）'],
];
const OPENROUTER_TTS_MODELS = [
  [
    'microsoft/mai-voice-2.1-flash',
    'en-GB-Harry:MAI-Voice-2.1-Flash',
    'Microsoft MAI-Voice-2.1 Flash - low latency, UK English male default',
    'Microsoft MAI-Voice-2.1 Flash - 低延迟、默认英式英语男声',
    'A low-latency Microsoft model with 23 languages and 97 OpenRouter-listed voices. Defaults to UK English male Harry. Curated presets cover Mandarin, UK English and US English, with male and female choices. Currently $15 per million characters; every request still requires ZDR.',
    '微软低延迟语音模型，支持 23 种语言，OpenRouter 列出 97 个音色。默认使用英式英语男声 Harry；精选音色覆盖中文、英式和美式英语的男女声。当前每百万字符 $15；每次请求仍强制 ZDR。',
  ],
  [
    'microsoft/mai-voice-2-flash',
    'en-US-Ethan:MAI-Voice-2-Flash',
    'Microsoft MAI-Voice-2 Flash - low latency, US English male default',
    'Microsoft MAI-Voice-2 Flash - 低延迟、默认美式英语男声',
    'A low-latency Microsoft model for responsive playback. Ethan is the US English male default from Microsoft\'s MAI catalog. It and the additional Microsoft-published voices are compatibility presets because OpenRouter does not list them all. For UK English presets, select MAI-Voice-2.1 Flash.',
    '微软低延迟语音模型，适合快速开始播放。默认使用微软 MAI 官方目录中的美式英语男声 Ethan；Ethan 及其他微软官方音色属于兼容预设，因为 OpenRouter 未完整列出。需要英式英语预设时，可选择 MAI-Voice-2.1 Flash。',
  ],
  [
    'microsoft/mai-voice-2',
    'en-US-Ethan:MAI-Voice-2',
    'Microsoft MAI-Voice-2 - expressive, US English male default',
    'Microsoft MAI-Voice-2 - 表现力强、默认美式英语男声',
    'An expressive Microsoft model for natural long-form narration. Ethan is the US English male default. The plugin also offers other Microsoft-published English and Mandarin ShortNames as compatibility presets even when OpenRouter metadata omits them. For UK English presets, select MAI-Voice-2.1 Flash.',
    '微软表现力语音模型，适合自然长文叙述。默认使用美式英语男声 Ethan；插件还提供 OpenRouter 元数据未列出、但由微软官方发布的其他英文和普通话 ShortName 作为兼容预设。需要英式英语预设时，可选择 MAI-Voice-2.1 Flash。',
  ],
  [
    'google/gemini-3.1-flash-tts-preview',
    'Charon',
    'Google Gemini 3.1 Flash TTS Preview - 30 multilingual voices',
    'Google Gemini 3.1 Flash TTS 预览版 - 30 个多语言音色',
    'OpenRouter lists 30 multilingual voices. Charon is the informative default for academic reading. Google describes voices by delivery style rather than fixed gender or US/UK accent, so the plugin does not make an unsupported male or accent claim.',
    'OpenRouter 列出 30 个多语言音色。默认使用更适合学术朗读的信息型 Charon。Google 按朗读风格而非固定性别或英美口音描述音色，因此插件不会把某个音色无依据地标为男声或特定口音。',
  ],
  [
    'fish-audio/s2.1-pro',
    DEFAULT_OPENROUTER_TTS_VOICE,
    'Fish Audio S2.1 Pro - expressive multilingual narration, 6 voice presets',
    'Fish Audio S2.1 Pro - 多语言表现力朗读，提供 6 种音色预设',
    'Expressive multilingual narration with Fish Audio public voice IDs. Defaults to a measured UK English male voice. OpenRouter currently bills this model per UTF-8 byte, not per character.',
    '多语言表现力朗读，使用 Fish Audio 公开音色 ID。默认选择沉稳的英式英语男声。OpenRouter 当前按 UTF-8 字节而非字符计费。',
  ],
  [
    'hexgrad/kokoro-82m',
    'bm_george',
    'Kokoro 82M - low-cost multilingual TTS, 12 curated voices',
    'Kokoro 82M - 低成本多语言语音，提供 12 种精选音色',
    'A lightweight, low-cost model with preset voices for Chinese, US English, and UK English. OpenRouter lists provider-dependent rates; the lowest currently shown is about $0.62 per million characters, but the ZDR-eligible route may cost more.',
    '轻量低成本模型，预设覆盖中文、美式英语和英式英语。OpenRouter 按供应商显示不同费率；当前页面最低约为每百万字符 $0.62，但符合 ZDR 的实际路由可能更贵。',
  ],
];
// Fish and Kokoro appeared in the speech + ZDR model API check on 2026-09-23;
// this is point-in-time endpoint availability, not a permanent provider-wide guarantee.
// Fish voice IDs point to public Fish Audio voices powered by S2.1 Pro.
// MAI compatibility IDs follow Microsoft's official MAI voice catalog on 2026-08-27.
const OPENROUTER_TTS_PRESETS = [
  // IDs verified in OpenRouter's speech + ZDR catalog on 2026-10-02.
  ['microsoft/mai-voice-2.1-flash', 'en-GB-Harry:MAI-Voice-2.1-Flash', 'Harry (UK English male, default)', 'Harry（英式英语男声，默认）'],
  ['microsoft/mai-voice-2.1-flash', 'en-GB-Emily:MAI-Voice-2.1-Flash', 'Emily (UK English female)', 'Emily（英式英语女声）'],
  ['microsoft/mai-voice-2.1-flash', 'en-US-Ethan:MAI-Voice-2.1-Flash', 'Ethan (US English male)', 'Ethan（美式英语男声）'],
  ['microsoft/mai-voice-2.1-flash', 'en-US-Grant:MAI-Voice-2.1-Flash', 'Grant (US English male)', 'Grant（美式英语男声）'],
  ['microsoft/mai-voice-2.1-flash', 'en-US-Harper:MAI-Voice-2.1-Flash', 'Harper (US English female)', 'Harper（美式英语女声）'],
  ['microsoft/mai-voice-2.1-flash', 'en-US-Olivia:MAI-Voice-2.1-Flash', 'Olivia (US English female)', 'Olivia（美式英语女声）'],
  ['microsoft/mai-voice-2.1-flash', 'zh-CN-Bo:MAI-Voice-2.1-Flash', 'Bo (Mandarin male)', 'Bo（中文普通话男声）'],
  ['microsoft/mai-voice-2.1-flash', 'zh-CN-Wei:MAI-Voice-2.1-Flash', 'Wei (Mandarin male)', 'Wei（中文普通话男声）'],
  ['microsoft/mai-voice-2.1-flash', 'zh-CN-Lan:MAI-Voice-2.1-Flash', 'Lan (Mandarin female)', 'Lan（中文普通话女声）'],
  ['microsoft/mai-voice-2.1-flash', 'zh-CN-Mei:MAI-Voice-2.1-Flash', 'Mei (Mandarin female)', 'Mei（中文普通话女声）'],
  ['microsoft/mai-voice-2-flash', 'en-US-Ethan:MAI-Voice-2-Flash', 'Ethan (US English male; not listed in OpenRouter metadata)', 'Ethan（美式英语男声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2-flash', 'en-US-Olivia:MAI-Voice-2-Flash', 'Olivia (US English female; Microsoft compatibility preset)', 'Olivia（美式英语女声；微软兼容预设）'],
  ['microsoft/mai-voice-2-flash', 'zh-CN-Bo:MAI-Voice-2-Flash', 'Bo (Mandarin male; not listed in OpenRouter metadata)', 'Bo（中文普通话男声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2-flash', 'zh-CN-Wei:MAI-Voice-2-Flash', 'Wei (Mandarin male; not listed in OpenRouter metadata)', 'Wei（中文普通话男声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2-flash', 'zh-CN-Lan:MAI-Voice-2-Flash', 'Lan (Mandarin female; not listed in OpenRouter metadata)', 'Lan（中文普通话女声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2-flash', 'zh-CN-Mei:MAI-Voice-2-Flash', 'Mei (Mandarin female; not listed in OpenRouter metadata)', 'Mei（中文普通话女声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2-flash', 'en-US-Harper:MAI-Voice-2', 'Harper (US English female; OpenRouter-listed ID)', 'Harper（美式英语女声；OpenRouter 已列出）'],
  ['microsoft/mai-voice-2-flash', 'es-MX-Valeria:MAI-Voice-2', 'Valeria (Mexican Spanish)', 'Valeria（墨西哥西班牙语）'],
  ['microsoft/mai-voice-2-flash', 'fr-FR-Soleil:MAI-Voice-2', 'Soleil (French)', 'Soleil（法语）'],
  ['microsoft/mai-voice-2-flash', 'de-DE-Klaus:MAI-Voice-2', 'Klaus (German)', 'Klaus（德语）'],
  ['microsoft/mai-voice-2', 'en-US-Ethan:MAI-Voice-2', 'Ethan (US English male; not listed in OpenRouter metadata)', 'Ethan（美式英语男声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2', 'en-US-Grant:MAI-Voice-2', 'Grant (US English male; Microsoft compatibility preset)', 'Grant（美式英语男声；微软兼容预设）'],
  ['microsoft/mai-voice-2', 'en-US-Jasper:MAI-Voice-2', 'Jasper (US English male; Microsoft compatibility preset)', 'Jasper（美式英语男声；微软兼容预设）'],
  ['microsoft/mai-voice-2', 'zh-CN-Bo:MAI-Voice-2', 'Bo (Mandarin male; not listed in OpenRouter metadata)', 'Bo（中文普通话男声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2', 'zh-CN-Lan:MAI-Voice-2', 'Lan (Mandarin female; not listed in OpenRouter metadata)', 'Lan（中文普通话女声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2', 'zh-CN-Mei:MAI-Voice-2', 'Mei (Mandarin female; not listed in OpenRouter metadata)', 'Mei（中文普通话女声；OpenRouter 元数据未列出）'],
  ['microsoft/mai-voice-2', 'en-US-Harper:MAI-Voice-2', 'Harper (US English)', 'Harper（美式英语）'],
  ['microsoft/mai-voice-2', 'es-MX-Valeria:MAI-Voice-2', 'Valeria (Mexican Spanish)', 'Valeria（墨西哥西班牙语）'],
  ['microsoft/mai-voice-2', 'fr-FR-Soleil:MAI-Voice-2', 'Soleil (French)', 'Soleil（法语）'],
  ['microsoft/mai-voice-2', 'de-DE-Klaus:MAI-Voice-2', 'Klaus (German)', 'Klaus（德语）'],
  ['google/gemini-3.1-flash-tts-preview', 'Charon', 'Charon (multilingual, informative)', 'Charon（多语言，信息型）'],
  ['google/gemini-3.1-flash-tts-preview', 'Rasalgethi', 'Rasalgethi (multilingual, informative)', 'Rasalgethi（多语言，信息型）'],
  ['google/gemini-3.1-flash-tts-preview', 'Sadaltager', 'Sadaltager (multilingual, knowledgeable)', 'Sadaltager（多语言，博学）'],
  ['google/gemini-3.1-flash-tts-preview', 'Schedar', 'Schedar (multilingual, even)', 'Schedar（多语言，平稳）'],
  ['google/gemini-3.1-flash-tts-preview', 'Iapetus', 'Iapetus (multilingual, clear)', 'Iapetus（多语言，清晰）'],
  ['google/gemini-3.1-flash-tts-preview', 'Erinome', 'Erinome (multilingual, clear)', 'Erinome（多语言，清晰）'],
  ['google/gemini-3.1-flash-tts-preview', 'Kore', 'Kore (multilingual, firm)', 'Kore（多语言，坚定）'],
  ['google/gemini-3.1-flash-tts-preview', 'Orus', 'Orus (multilingual, firm)', 'Orus（多语言，坚定）'],
  ['google/gemini-3.1-flash-tts-preview', 'Gacrux', 'Gacrux (multilingual, mature)', 'Gacrux（多语言，成熟）'],
  ['google/gemini-3.1-flash-tts-preview', 'Sulafat', 'Sulafat (multilingual, warm)', 'Sulafat（多语言，温暖）'],
  ['google/gemini-3.1-flash-tts-preview', 'Vindemiatrix', 'Vindemiatrix (multilingual, gentle)', 'Vindemiatrix（多语言，温和）'],
  ['google/gemini-3.1-flash-tts-preview', 'Aoede', 'Aoede (multilingual, breezy)', 'Aoede（多语言，轻快）'],
  ['fish-audio/s2.1-pro', '36ef842120654ee6b38ef43c8f08535a', 'Mandarin male - deep, formal narration', '中文男声 - 浑厚、正式旁白'],
  ['fish-audio/s2.1-pro', '89ca9f5f239946d6b20cdc49bdd40ff7', 'Mandarin female - calm storytelling', '中文女声 - 平静叙述'],
  ['fish-audio/s2.1-pro', '653bbd5adbe34b3d8c867a5311f461c4', 'US English male - calm, measured narrator', '美式英语男声 - 沉稳、语速平缓'],
  ['fish-audio/s2.1-pro', '552756381a5044ba916aeb596ed443bb', 'US English female - clear, measured narrator', '美式英语女声 - 清晰、语速平缓'],
  ['fish-audio/s2.1-pro', 'b7f1aae6de274690b20cfe990b953b67', 'UK English male - measured narrator (default)', '英式英语男声 - 沉稳旁白（默认）'],
  ['fish-audio/s2.1-pro', '7fe3682ee0e44dc88d1b12000cc15268', 'UK English female - calm, informative narrator', '英式英语女声 - 平静、信息型旁白'],
  ['hexgrad/kokoro-82m', 'zf_xiaoxiao', 'Xiaoxiao (Chinese female)', '小晓（中文女声）'],
  ['hexgrad/kokoro-82m', 'zf_xiaoyi', 'Xiaoyi (Chinese female)', '小艺（中文女声）'],
  ['hexgrad/kokoro-82m', 'zm_yunjian', 'Yunjian (Chinese male)', '云健（中文男声）'],
  ['hexgrad/kokoro-82m', 'zm_yunyang', 'Yunyang (Chinese male)', '云扬（中文男声）'],
  ['hexgrad/kokoro-82m', 'af_heart', 'Heart (US English female)', 'Heart（美式英语女声）'],
  ['hexgrad/kokoro-82m', 'af_bella', 'Bella (US English female)', 'Bella（美式英语女声）'],
  ['hexgrad/kokoro-82m', 'am_michael', 'Michael (US English male)', 'Michael（美式英语男声）'],
  ['hexgrad/kokoro-82m', 'am_fenrir', 'Fenrir (US English male)', 'Fenrir（美式英语男声）'],
  ['hexgrad/kokoro-82m', 'bf_emma', 'Emma (UK English female)', 'Emma（英式英语女声）'],
  ['hexgrad/kokoro-82m', 'bf_isabella', 'Isabella (UK English female)', 'Isabella（英式英语女声）'],
  ['hexgrad/kokoro-82m', 'bm_george', 'George (UK English male)', 'George（英式英语男声）'],
  ['hexgrad/kokoro-82m', 'bm_fable', 'Fable (UK English male)', 'Fable（英式英语男声）'],
];
const SETTINGS_UI_TEXT = {
  english: {
    settingsLanguageName: 'Settings language',
    settingsLanguageDesc: 'Choose the language for settings and reader controls.',
    settingsLanguageEnglish: 'English',
    settingsLanguageChinese: '中文',
    speechEngineName: 'Speech engine',
    speechEngineDesc: 'Choose local CosyVoice, installed system speech (Windows/macOS), or opt-in Edge, Azure, OpenRouter, MiMo or a custom speech API (BYOK).',
    speechEngineLocal: 'Local CosyVoice',
    speechEngineSystem: 'System local speech (Windows/macOS)',
    speechEngineEdge: 'Microsoft Edge online voice',
    speechEngineAzure: 'Microsoft Azure Speech',
    speechEngineOpenRouter: 'OpenRouter TTS',
    localScriptName: 'CosyVoice script',
    localScriptDesc: 'PowerShell wrapper used in Local CosyVoice mode.',
    edgeConsentName: 'Allow Edge online processing',
    edgeConsentDesc: 'Required for Edge mode. Each text chunk is sent to Microsoft Edge TTS. The edge-tts interface used here does not provide an explicit ZDR guarantee for this plugin; keep this off for private or sensitive notes.',
    edgeExecutableName: 'Edge TTS executable',
    edgeExecutableDesc: 'Use an absolute edge-tts.exe path to avoid PATH ambiguity. The default value resolves edge-tts from the Obsidian process PATH.',
    edgeCommonVoicesName: 'Common Edge TTS voices',
    edgeCommonVoicesDesc: 'Common Chinese, US English, and UK English online voices. Selecting one fills the Voice ID below.',
    customVoiceOption: 'Custom voice ID',
    edgeVoiceName: 'Edge TTS voice',
    edgeVoiceDesc: 'Voice ID used by Edge mode. Keep a preset above or enter any ID returned by edge-tts --list-voices.',
    azureConsentName: 'Allow Azure online processing',
    azureConsentDesc: 'Required for Azure mode. Each text chunk is sent by HTTPS to the selected Azure Speech cloud and region. Keep this off for private notes unless that processing is acceptable.',
    azurePrivacyName: 'Azure real-time privacy',
    azurePrivacyDesc: 'This plugin uses Azure\'s real-time prebuilt-voice API. Microsoft states that input text and output audio are not retained or stored, so no separate privacy switch is required in Azure. Text is still processed in the selected Azure region. This does not cover batch synthesis, custom voice, or avatar services.',
    azurePrivacyButton: 'Microsoft privacy statement',
    azurePrivacyTooltip: 'Open Microsoft\'s text-to-speech privacy statement',
    credentialSourceName: 'API key storage',
    credentialSourceDesc: 'Use Obsidian SecretStorage on Obsidian 1.11.4 or later, or keep a one-line key file outside the vault as a compatibility fallback.',
    credentialSourceSecret: 'Obsidian SecretStorage (recommended)',
    credentialSourceFile: 'External one-line key file',
    secretStorageUnavailableName: 'Obsidian SecretStorage unavailable',
    secretStorageUnavailableDesc: 'Update Obsidian to 1.11.4 or later, or select the external key-file option.',
    azureCloudName: 'Azure cloud',
    azureCloudDesc: 'Select the cloud that owns the Speech resource and subscription key.',
    azurePublicCloud: 'Azure public cloud',
    azureChinaCloud: 'Azure China operated by 21Vianet',
    azureRegionName: 'Azure Speech region',
    azureRegionDesc: 'Region identifier from the Azure resource, for example eastasia, southeastasia, chinaeast2, or chinanorth3.',
    azureKeyFileName: 'Azure Speech key file',
    azureKeyFileDesc: 'Compatibility fallback: absolute path to a one-line Speech resource key file outside the Obsidian vault. The key itself is not saved in data.json.',
    azureSecretName: 'Azure Speech secret',
    azureSecretDesc: 'Select or create an Obsidian secret containing the Speech resource key. Only the secret name is saved in data.json.',
    azureCommonVoicesName: 'Common Azure Speech voices',
    azureCommonVoicesDesc: 'Common Chinese, US English, and UK English Azure voices. Selecting one fills the Voice ID below.',
    azureVoiceName: 'Azure Speech voice',
    azureVoiceDesc: 'Prebuilt Azure Speech voice ID, for example zh-CN-XiaoxiaoNeural or en-US-JennyNeural.',
    openRouterConsentName: 'Allow OpenRouter online processing',
    openRouterConsentDesc: 'Required for OpenRouter mode. This permits sending text to OpenRouter and an eligible upstream TTS provider, but never relaxes ZDR routing.',
    openRouterKeyFileName: 'OpenRouter API key file',
    openRouterKeyFileDesc: 'Compatibility fallback: absolute path to a one-line OpenRouter API key file outside the Obsidian vault. The key itself is not saved in data.json.',
    openRouterSecretName: 'OpenRouter API secret',
    openRouterSecretDesc: 'Select or create an Obsidian secret containing the OpenRouter API key. Only the secret name is saved in data.json.',
    openRouterModelsName: 'ZDR-compatible OpenRouter TTS models',
    openRouterModelsDesc: 'Built-in choices verified against OpenRouter\'s speech and ZDR model filter for this release. Availability can change; every request still enforces ZDR.',
    customModelOption: 'Custom model ID',
    openRouterModelName: 'OpenRouter TTS model',
    openRouterModelDesc: 'Speech-output model ID. A custom model works only when OpenRouter has an eligible ZDR endpoint for it.',
    openRouterModelInfoName: 'Selected model characteristics',
    customModelInfo: 'Custom model: check its language, voice, and speech-output support in OpenRouter. The request fails if no ZDR endpoint is eligible.',
    openRouterVoicesName: 'Common voices for this model',
    openRouterVoicesDesc: 'Model-specific presets are listed. MAI-Voice-2 also includes Microsoft-published Mandarin IDs that OpenRouter may accept even when its supported_voices metadata omits them; availability can vary by endpoint.',
    openRouterVoiceName: 'OpenRouter TTS voice',
    openRouterVoiceDesc: 'Voice ID supported by the selected model. Voice catalogs differ between models.',
    openRouterVoiceHelpName: 'Find a custom voice ID',
    openRouterVoiceHelpDesc: 'Open the model page and voice catalog to find an ID, then select Custom voice and paste it into OpenRouter TTS voice. MAI requires the full model suffix, for example en-GB-Harry:MAI-Voice-2.1-Flash. Confirm the ID is accepted by the selected OpenRouter model; catalogs can include voices not exposed by its endpoint.',
    openRouterModelPageButton: 'Model page',
    openRouterVoiceCatalogButton: 'Voice catalog',
    openRouterVoiceHelpTooltip: 'Open the official reference for the currently selected model',
    openRouterPrivacyName: 'OpenRouter privacy routing',
    openRouterPrivacyDesc: 'Always enforced: provider.zdr is true and provider data collection is denied. The plugin never falls back to a non-ZDR endpoint. Keep OpenRouter account-level input/output logging and data sharing disabled for private content.',
    speedName: 'Synthesis speed',
    speedDesc: 'Synthesis speed for new segments only; playing and already prepared audio remain unchanged. MiMo treats speed as an instruction, not an exact rate.',
    chunkLimitsName: 'Local chunk limits',
    chunkLimitsDesc: 'Character limits for local CosyVoice and system speech. The first segment plays in up to three audio parts: complete sentences reaching 20 characters, then 40 more, then the remainder (excluding whitespace). It remains one segment in the progress bar.',
    onlineChunkLimitsName: 'Online chunk limits',
    onlineChunkLimitsDesc: 'Used by Edge, Azure, OpenRouter, and MiMo for notes, PDFs, HTML and web pages (default 200,400,800). The first segment plays in up to three audio parts: sentences reaching 20 characters, then 40 more, then the remainder. It remains one visible segment; this can add up to two requests. Prefetch counts audio parts.',
    onlinePrefetchName: 'Online synthesis prefetch',
    onlinePrefetchDesc: 'How many future audio parts an online engine may synthesize early, including the smaller parts inside the first segment. Default 1; choose 0 for strict on-demand synthesis.',
    onlinePrefetchNone: '0 - synthesize only when needed',
    onlinePrefetchOne: '1 - prefetch one chunk',
    audioExportLocationName: 'Audio export save location',
    audioExportLocationDesc: 'Choose where exported audio is saved. Confirmation shows the scope and planned vault path. Web pages have no source folder; Same folder as the note saves web audio at the vault root.',
    audioExportLocationAttachment: 'Obsidian attachment folder (default)',
    audioExportLocationNote: 'Same folder as the note',
    audioExportLocationCustom: 'Custom folder in this vault',
    audioExportFolderName: 'Custom audio folder',
    audioExportFolderDesc: 'Enter a vault-relative folder such as Audio exports. Absolute paths and parent-directory segments are rejected.',
    audioExportFolderPlaceholder: 'Audio exports',
    stripMarkdownName: 'Strip Markdown',
    stripMarkdownDesc: 'Remove frontmatter, links, headings, embeds, and common formatting before synthesis.',
    mathLanguageName: 'Math reading language',
    mathLanguageDesc: 'Choose how short LaTeX formulas are verbalized. Long formulas are skipped in all modes.',
    mathEnglish: 'English',
    mathChinese: 'Chinese',
    mathSkip: 'Skip math',
    rememberPositionName: 'Remember reading position',
    rememberPositionDesc: 'Off by default. Saves bounded resume metadata for local notes, PDFs and HTML only, never their complete body. Web page addresses, content and positions are not saved in history.',
    clearPositionsName: 'Clear saved reading positions',
    clearPositionsDesc: 'Remove all saved resume anchors without changing speech settings or API credentials.',
    clearPositionsButton: 'Clear positions',
    positionsClearedNotice: 'CosyVoice: saved reading positions cleared.',
    cleanupName: 'Clean temporary audio',
    cleanupDesc: 'Delete temporary text and audio after reading, and clear stale files when the plugin starts. Temporary data is stored outside the Obsidian vault.',
    diagnosticName: 'Diagnostic logging',
    diagnosticDesc: 'Off by default. When enabled, only bounded failure metadata is stored in the system temporary directory; note names and child-process output are excluded.',
    clearTemporaryName: 'Clear temporary data',
    clearTemporaryDesc: 'Stop reading and remove plugin-owned temporary text, audio, legacy cache files, and diagnostic logs now.',
    clearNowButton: 'Clear now',
    restoreDefaultsName: 'Restore default settings',
    restoreDefaultsDesc: 'Reset every setting on this page to its default value and save immediately.',
    restoreDefaultsButton: 'Restore defaults',
    settingsRestoredNotice: 'CosyVoice: settings restored to defaults.',
    temporaryDataClearedNotice: 'CosyVoice: temporary text, audio, and diagnostic logs cleared.',
    feedbackName: 'Feedback and bug reports',
    feedbackDesc: 'Open GitHub Issues to report a problem, request a feature, or follow existing reports. Do not include API keys or private note text.',
    feedbackButton: 'Open GitHub Issues',
    feedbackTooltip: 'Open the feedback page in your browser',
  },
  chinese: {
    settingsLanguageName: '设置界面语言',
    settingsLanguageDesc: '选择插件设置和朗读控制面板使用的语言。',
    settingsLanguageEnglish: 'English',
    settingsLanguageChinese: '中文',
    speechEngineName: '语音引擎',
    speechEngineDesc: '选择本地 CosyVoice、已安装的系统语音（Windows/macOS），或主动授权 Edge、Azure、OpenRouter、MiMo、自定义语音 API（BYOK）。',
    speechEngineLocal: '本地 CosyVoice',
    speechEngineSystem: '系统本地语音（Windows/macOS）',
    speechEngineEdge: 'Microsoft Edge 在线语音',
    speechEngineAzure: 'Microsoft Azure Speech',
    speechEngineOpenRouter: 'OpenRouter TTS',
    localScriptName: 'CosyVoice 脚本',
    localScriptDesc: '本地 CosyVoice 模式使用的 PowerShell 包装脚本。',
    edgeConsentName: '允许 Edge 在线处理',
    edgeConsentDesc: 'Edge 模式必须开启。每个文本分段都会发送给 Microsoft Edge TTS。本插件使用的 edge-tts 调用接口未对本插件请求提供明确的 ZDR 保证；私密或敏感笔记建议保持关闭。',
    edgeExecutableName: 'Edge TTS 可执行文件',
    edgeExecutableDesc: '建议填写 edge-tts.exe 的绝对路径，避免 PATH 指向不明确。默认值从 Obsidian 进程的 PATH 中查找 edge-tts。',
    edgeCommonVoicesName: '常用 Edge TTS 音色',
    edgeCommonVoicesDesc: '常用中文、美式英语和英式英语在线音色。选择后会自动填写下方的音色 ID。',
    customVoiceOption: '自定义音色 ID',
    edgeVoiceName: 'Edge TTS 音色',
    edgeVoiceDesc: 'Edge 模式使用的音色 ID。可使用上方预设，或填写 edge-tts --list-voices 返回的任意 ID。',
    azureConsentName: '允许 Azure 在线处理',
    azureConsentDesc: 'Azure 模式必须开启。每个文本分段会通过 HTTPS 发送到所选 Azure Speech 云环境和区域。除非可以接受该处理，否则私密笔记应保持关闭。',
    azurePrivacyName: 'Azure 实时接口隐私说明',
    azurePrivacyDesc: '本插件使用 Azure 实时预构建音色接口。Microsoft 表示输入文本和输出音频不会被保留或存储，无需在 Azure 门户额外开启独立隐私开关；文本仍会发送到所选 Azure 区域处理。此说明不适用于批量合成、定制音色或虚拟人服务。',
    azurePrivacyButton: '查看 Microsoft 隐私说明',
    azurePrivacyTooltip: '在浏览器中打开 Microsoft 官方隐私说明',
    credentialSourceName: 'API 密钥存储方式',
    credentialSourceDesc: 'Obsidian 1.11.4 及以上版本建议使用 SecretStorage；也可以继续使用 Obsidian 库外的单行密钥文件作为兼容回退。',
    credentialSourceSecret: 'Obsidian SecretStorage（推荐）',
    credentialSourceFile: '库外单行密钥文件',
    secretStorageUnavailableName: 'Obsidian SecretStorage 不可用',
    secretStorageUnavailableDesc: '请把 Obsidian 更新到 1.11.4 或更高版本，或改选库外密钥文件。',
    azureCloudName: 'Azure 云环境',
    azureCloudDesc: '选择 Speech 资源和订阅密钥所属的云环境。',
    azurePublicCloud: 'Azure 公有云',
    azureChinaCloud: '由世纪互联运营的 Azure 中国区',
    azureRegionName: 'Azure Speech 区域',
    azureRegionDesc: 'Azure 资源中的区域标识，例如 eastasia、southeastasia、chinaeast2 或 chinanorth3。',
    azureKeyFileName: 'Azure Speech 密钥文件',
    azureKeyFileDesc: '兼容回退方式：填写 Obsidian 库外单行 Speech 资源密钥文件的绝对路径。密钥本身不会保存到 data.json。',
    azureSecretName: 'Azure Speech 秘密',
    azureSecretDesc: '选择或创建一个保存 Speech 资源密钥的 Obsidian 秘密。data.json 只保存秘密名称，不保存密钥值。',
    azureCommonVoicesName: '常用 Azure Speech 音色',
    azureCommonVoicesDesc: '常用中文、美式英语和英式英语 Azure 音色。选择后会自动填写下方的音色 ID。',
    azureVoiceName: 'Azure Speech 音色',
    azureVoiceDesc: 'Azure Speech 预构建音色 ID，例如 zh-CN-XiaoxiaoNeural 或 en-US-JennyNeural。',
    openRouterConsentName: '允许 OpenRouter 在线处理',
    openRouterConsentDesc: 'OpenRouter 模式必须开启。它只表示允许把文本发送给 OpenRouter 及符合条件的上游 TTS 服务商，不会放宽 ZDR 路由。',
    openRouterKeyFileName: 'OpenRouter API 密钥文件',
    openRouterKeyFileDesc: '兼容回退方式：填写 Obsidian 库外单行 OpenRouter API 密钥文件的绝对路径。密钥本身不会保存到 data.json。',
    openRouterSecretName: 'OpenRouter API 秘密',
    openRouterSecretDesc: '选择或创建一个保存 OpenRouter API 密钥的 Obsidian 秘密。data.json 只保存秘密名称，不保存密钥值。',
    openRouterModelsName: '支持 ZDR 的 OpenRouter TTS 模型',
    openRouterModelsDesc: '内置选项已按本版本发布时 OpenRouter 的语音与 ZDR 模型过滤结果核对。可用性可能变化，但每次请求仍会强制使用 ZDR。',
    customModelOption: '自定义模型 ID',
    openRouterModelName: 'OpenRouter TTS 模型',
    openRouterModelDesc: '支持语音输出的模型 ID。自定义模型只有在 OpenRouter 存在符合条件的 ZDR 端点时才能使用。',
    openRouterModelInfoName: '所选模型特点',
    customModelInfo: '自定义模型：请在 OpenRouter 核对其语言、音色和语音输出能力；如果没有符合条件的 ZDR 端点，请求会失败。',
    openRouterVoicesName: '该模型的常用音色',
    openRouterVoicesDesc: '这里只列出与所选模型对应的预设。MAI-Voice-2 还加入了微软官方发布、但 OpenRouter supported_voices 元数据可能遗漏的普通话音色；实际可用性可能随端点变化。',
    openRouterVoiceName: 'OpenRouter TTS 音色',
    openRouterVoiceDesc: '所选模型支持的音色 ID。不同模型的音色目录并不相同。',
    openRouterVoiceHelpName: '查询自定义音色 ID',
    openRouterVoiceHelpDesc: '打开模型页面和音色目录查询 ID，选择“自定义音色”后填入“OpenRouter TTS 音色”。MAI 必须包含完整模型后缀，例如 en-GB-Harry:MAI-Voice-2.1-Flash。请确认该 ID 可用于所选 OpenRouter 模型；官方目录中的部分音色可能尚未由对应端点开放。',
    openRouterModelPageButton: '模型页面',
    openRouterVoiceCatalogButton: '音色目录',
    openRouterVoiceHelpTooltip: '打开当前所选模型的官方查询资料',
    openRouterPrivacyName: 'OpenRouter 隐私路由',
    openRouterPrivacyDesc: '始终强制执行：provider.zdr 为 true，并拒绝供应商收集数据。插件不会降级到非 ZDR 端点。朗读私密内容时，还应关闭 OpenRouter 账户级输入输出日志和数据共享。',
    speedName: '合成语速',
    speedDesc: '仅对新合成的分段生效，正在播放及已预合成的音频不变。MiMo 将速度作为指令理解，并非精确倍速。',
    chunkLimitsName: '本地分段长度',
    chunkLimitsDesc: '本地 CosyVoice 和系统语音的字符数上限，以英文逗号分隔。第一段内部按整句累加至 20 字，再从剩余内容累加至 40 字，最后合成余文（不计空白），最多三段音频；进度条仍显示为同一段。',
    onlineChunkLimitsName: '在线分段长度',
    onlineChunkLimitsDesc: 'Edge、Azure、OpenRouter 和 MiMo 朗读笔记、PDF、HTML 或网页时使用（默认 200,400,800）。第一段内部按整句累加至 20 字，再累加新的 40 字，最后合成余文（不计空白），界面仍显示同一段。最多增加两次请求，预合成数量按小音频计算。',
    onlinePrefetchName: '在线合成预取',
    onlinePrefetchDesc: '允许在线引擎提前合成的后续音频数量，第一段内部的小音频也各算一次。默认 1；选择 0 可严格按需合成。',
    onlinePrefetchNone: '0 - 需要时才合成',
    onlinePrefetchOne: '1 - 提前合成一段',
    audioExportLocationName: '音频导出保存位置',
    audioExportLocationDesc: '选择导出音频的保存位置。确认窗口会显示所选范围和预计库内路径。网页没有原文件目录，选择“与原笔记相同的目录”时会保存到库根目录。',
    audioExportLocationAttachment: 'Obsidian 附件目录（默认）',
    audioExportLocationNote: '与原笔记相同的目录',
    audioExportLocationCustom: '本库内的自定义目录',
    audioExportFolderName: '自定义音频目录',
    audioExportFolderDesc: '填写库内相对目录，例如“导出音频”。不允许绝对路径或返回上级目录的路径。',
    audioExportFolderPlaceholder: '导出音频',
    stripMarkdownName: '移除 Markdown 格式',
    stripMarkdownDesc: '合成前移除 frontmatter、链接、标题、嵌入内容和常见格式标记。',
    mathLanguageName: '数学公式朗读语言',
    mathLanguageDesc: '选择短 LaTeX 公式的朗读方式。所有模式都会跳过过长公式。',
    mathEnglish: '英语',
    mathChinese: '中文',
    mathSkip: '跳过公式',
    rememberPositionName: '记住朗读位置',
    rememberPositionDesc: '默认关闭。只为本地笔记、PDF 和 HTML 保存有限的续读信息，不保存完整正文。网页地址、正文和朗读位置不保存到历史中。',
    clearPositionsName: '清除已保存的朗读位置',
    clearPositionsDesc: '删除全部继续朗读锚点，不改变语音设置或 API 凭据。',
    clearPositionsButton: '清除位置',
    positionsClearedNotice: 'CosyVoice：已清除保存的朗读位置。',
    cleanupName: '清理临时音频',
    cleanupDesc: '朗读后删除临时文本和音频，并在插件启动时清理过期文件。临时数据保存在 Obsidian 库外。',
    diagnosticName: '诊断日志',
    diagnosticDesc: '默认关闭。开启后只在系统临时目录保存有大小限制的失败元数据，不包含笔记名称或子进程输出。',
    clearTemporaryName: '清除临时数据',
    clearTemporaryDesc: '立即停止朗读，并删除本插件产生的临时文本、音频、旧缓存文件和诊断日志。',
    clearNowButton: '立即清除',
    restoreDefaultsName: '恢复默认设置',
    restoreDefaultsDesc: '把本页面的所有设置恢复为默认值并立即保存。',
    restoreDefaultsButton: '恢复默认值',
    settingsRestoredNotice: 'CosyVoice：设置已恢复为默认值。',
    temporaryDataClearedNotice: 'CosyVoice：临时文本、音频和诊断日志已清除。',
    feedbackName: '反馈与问题报告',
    feedbackDesc: '打开 GitHub Issues 报告问题、提出功能建议或查看现有反馈。请勿提交 API 密钥或私密笔记正文。',
    feedbackButton: '打开 GitHub Issues',
    feedbackTooltip: '在浏览器中打开反馈页面',
  },
};
const LATEX_COMMAND_REPLACEMENTS = {
  chinese: [
    ['\\rightarrow', '到'],
    ['\\leftarrow', '到'],
    ['\\approx', '约等于'],
    ['\\times', '乘以'],
    ['\\cdot', '点乘'],
    ['\\leq', '小于等于'],
    ['\\geq', '大于等于'],
    ['\\neq', '不等于'],
    ['\\ne', '不等于'],
    ['\\le', '小于等于'],
    ['\\ge', '大于等于'],
    ['\\pm', '正负'],
    ['\\mp', '负正'],
    ['\\infty', '无穷'],
    ['\\alpha', 'alpha'],
    ['\\beta', 'beta'],
    ['\\gamma', 'gamma'],
    ['\\delta', 'delta'],
    ['\\epsilon', 'epsilon'],
    ['\\theta', 'theta'],
    ['\\lambda', 'lambda'],
    ['\\mu', 'mu'],
    ['\\pi', 'pi'],
    ['\\sigma', 'sigma'],
    ['\\omega', 'omega'],
    ['\\sum', '求和'],
    ['\\int', '积分'],
    ['\\to', '到'],
    ['\\left', ''],
    ['\\right', ''],
  ],
  english: [
    ['\\rightarrow', 'to'],
    ['\\leftarrow', 'from'],
    ['\\approx', 'approximately equal to'],
    ['\\times', 'times'],
    ['\\cdot', 'dot'],
    ['\\leq', 'less than or equal to'],
    ['\\geq', 'greater than or equal to'],
    ['\\neq', 'not equal to'],
    ['\\ne', 'not equal to'],
    ['\\le', 'less than or equal to'],
    ['\\ge', 'greater than or equal to'],
    ['\\pm', 'plus or minus'],
    ['\\mp', 'minus or plus'],
    ['\\infty', 'infinity'],
    ['\\alpha', 'alpha'],
    ['\\beta', 'beta'],
    ['\\gamma', 'gamma'],
    ['\\delta', 'delta'],
    ['\\epsilon', 'epsilon'],
    ['\\theta', 'theta'],
    ['\\lambda', 'lambda'],
    ['\\mu', 'mu'],
    ['\\pi', 'pi'],
    ['\\sigma', 'sigma'],
    ['\\omega', 'omega'],
    ['\\sum', 'sum'],
    ['\\int', 'integral'],
    ['\\to', 'to'],
    ['\\left', ''],
    ['\\right', ''],
  ],
};

const DEFAULT_SETTINGS = {
  settingsLanguage: 'english',
  scriptPath: resolveDefaultScriptPath(),
  speechEngine: 'local-cosyvoice',
  systemVoiceWindows: '',
  systemVoiceMac: '',
  audioExportLocation: 'obsidian-attachment',
  audioExportFolder: '',
  edgeTtsConsent: false,
  edgeTtsExecutable: DEFAULT_EDGE_TTS_EXECUTABLE,
  edgeTtsVoice: DEFAULT_EDGE_TTS_VOICE,
  azureSpeechCloud: 'public',
  azureSpeechConsent: false,
  azureSpeechCredentialSource: 'obsidian-secret',
  azureSpeechKeyPath: '',
  azureSpeechRegion: '',
  azureSpeechSecretName: '',
  azureSpeechVoice: DEFAULT_AZURE_SPEECH_VOICE,
  openRouterConsent: false,
  openRouterCredentialSource: 'obsidian-secret',
  openRouterKeyPath: '',
  openRouterModel: DEFAULT_OPENROUTER_TTS_MODEL,
  openRouterSecretName: '',
  openRouterVoice: DEFAULT_OPENROUTER_TTS_VOICE,
  speed: 1,
  stripMarkdown: true,
  cleanupCache: true,
  diagnosticLogging: false,
  mathReadingLanguage: DEFAULT_MATH_READING_LANGUAGE,
  chunkLimits: DEFAULT_CHUNK_LIMITS.join(','),
  onlineChunkLimits: DEFAULT_ONLINE_CHUNK_LIMITS.join(','),
  onlinePrefetchChunks: 1,
  rememberReadingPosition: false,
  readingPositions: {},
};

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function isPdfFile(file) {
  return Boolean(file && String(file.extension || '').toLowerCase() === 'pdf');
}

function getPdfFileIdentity(file) {
  return String(file && (file.path || file.name) || '');
}

function getFileMtime(file) {
  return Math.max(0, Math.floor(Number(file && file.stat && file.stat.mtime) || 0));
}

function getPdfPageInfoFromNode(node, root) {
  let element = node && node.nodeType === 1 ? node : node && node.parentElement;

  while (element) {
    const getAttribute = typeof element.getAttribute === 'function'
      ? (name) => element.getAttribute(name)
      : () => null;
    const pageNumberValue = getAttribute('data-page-number');
    const pageNumber = Number(pageNumberValue);
    if (pageNumberValue !== null && Number.isInteger(pageNumber) && pageNumber >= 1) {
      return { element, pageNumber };
    }

    const pageIndexValue = getAttribute('data-page-index');
    const pageIndex = Number(pageIndexValue);
    if (pageIndexValue !== null && Number.isInteger(pageIndex) && pageIndex >= 0) {
      return { element, pageNumber: pageIndex + 1 };
    }

    const identity = `${getAttribute('id') || ''} ${getAttribute('aria-label') || ''}`;
    const identityMatch = /(?:pageContainer|page[-_]|\bpage\s+)(\d+)\b/i.exec(identity);
    if (identityMatch) {
      return { element, pageNumber: Number(identityMatch[1]) };
    }

    if (element === root) {
      break;
    }
    element = element.parentElement;
  }

  return null;
}

function getPdfPageNumberFromNode(node, root) {
  const pageInfo = getPdfPageInfoFromNode(node, root);
  return pageInfo ? pageInfo.pageNumber : null;
}

function getFirstRangeRect(range) {
  if (!range) {
    return null;
  }
  try {
    if (typeof range.getClientRects === 'function') {
      const rects = range.getClientRects();
      if (rects && rects.length) {
        return rects[0];
      }
    }
    if (typeof range.getBoundingClientRect === 'function') {
      return range.getBoundingClientRect();
    }
  } catch (error) {
    return null;
  }
  return null;
}

function getPdfSelectionPosition(range, pageElement) {
  if (!range || !pageElement || typeof pageElement.getBoundingClientRect !== 'function') {
    return null;
  }
  let pageRect;
  try {
    pageRect = pageElement.getBoundingClientRect();
  } catch (error) {
    return null;
  }
  const pageLeft = Number(pageRect && pageRect.left);
  const pageTop = Number(pageRect && pageRect.top);
  const pageWidth = Number(pageRect && pageRect.width);
  const pageHeight = Number(pageRect && pageRect.height);
  if (![pageLeft, pageTop, pageWidth, pageHeight].every(Number.isFinite) || pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }

  let selectionRect = null;
  if (typeof range.cloneRange === 'function') {
    try {
      const startRange = range.cloneRange();
      if (startRange && typeof startRange.collapse === 'function') {
        startRange.collapse(true);
        selectionRect = getFirstRangeRect(startRange);
      }
    } catch (error) {
      selectionRect = null;
    }
  }
  const isRectInsidePage = (rect) => {
    const left = Number(rect && rect.left);
    const top = Number(rect && rect.top);
    const width = Math.max(0, Number(rect && rect.width) || 0);
    const height = Math.max(0, Number(rect && rect.height) || 0);
    return Number.isFinite(left)
      && Number.isFinite(top)
      && (width > 0 || height > 0)
      && left >= pageLeft - 2
      && left <= pageLeft + pageWidth + 2
      && top >= pageTop - 2
      && top <= pageTop + pageHeight + 2;
  };
  if (!isRectInsidePage(selectionRect)) {
    selectionRect = getFirstRangeRect(range);
  }
  if (!isRectInsidePage(selectionRect)) {
    return null;
  }

  const selectionLeft = Number(selectionRect.left);
  const selectionTop = Number(selectionRect.top);
  const selectionHeight = Math.max(0, Number(selectionRect.height) || 0);
  const clampRatio = (value) => Math.max(0, Math.min(1, value));
  return {
    xRatio: clampRatio((selectionLeft - pageLeft) / pageWidth),
    yRatio: clampRatio((selectionTop + selectionHeight / 2 - pageTop) / pageHeight),
  };
}

function getPdfSelectionContext(selection, leaves, fallbackFile = null, capturedAt = Date.now()) {
  if (!selection || typeof selection.toString !== 'function' || typeof selection.getRangeAt !== 'function') {
    return null;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText || Number(selection.rangeCount) < 1) {
    return null;
  }

  let range;
  try {
    range = selection.getRangeAt(0);
  } catch (error) {
    return null;
  }
  const startNode = range && range.startContainer;
  if (!startNode) {
    return null;
  }

  for (const leaf of Array.isArray(leaves) ? leaves : []) {
    const view = leaf && leaf.view;
    const root = view && (view.containerEl || view.contentEl);
    if (!root || typeof root.contains !== 'function' || !root.contains(startNode)) {
      continue;
    }

    const file = isPdfFile(view.file) ? view.file : fallbackFile;
    if (!isPdfFile(file)) {
      continue;
    }
    const pageInfo = getPdfPageInfoFromNode(startNode, root);
    if (!pageInfo) {
      continue;
    }
    const selectionPosition = getPdfSelectionPosition(range, pageInfo.element);

    return {
      capturedAt: Number(capturedAt) || Date.now(),
      filePath: getPdfFileIdentity(file),
      fileMtime: getFileMtime(file),
      pageNumber: pageInfo.pageNumber,
      selectedText: selectedText.slice(0, 2000),
      ...(selectionPosition ? { selectionPosition } : {}),
    };
  }

  return null;
}

function normalizePdfSelectionText(text) {
  return normalizeLineBreaks(text)
    .normalize('NFKC')
    .replace(/\u00ad/g, '')
    .replace(/([A-Za-z])-\s+(?=[a-z])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function createNormalizedPdfLayoutMap(layout) {
  const sourceLines = layout && Array.isArray(layout.lines) ? layout.lines : [];
  const lines = [];
  let text = '';

  for (const sourceLine of sourceLines) {
    const lineText = normalizePdfSelectionText(sourceLine && sourceLine.text);
    if (!lineText) {
      continue;
    }
    let start = 0;
    if (text) {
      if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(lineText)) {
        text = text.slice(0, -1);
        start = text.length;
      } else {
        text += ' ';
        start = text.length;
      }
    }
    text += lineText;
    lines.push({
      ...sourceLine,
      normalizedEnd: text.length,
      normalizedStart: start,
    });
  }

  return { lines, text };
}

function getPdfSpatialLineAnchor(pageText, layout, selectionPosition) {
  const xRatio = Number(selectionPosition && selectionPosition.xRatio);
  const yRatio = Number(selectionPosition && selectionPosition.yRatio);
  const pageWidth = Number(layout && layout.pageWidth);
  const pageHeight = Number(layout && layout.pageHeight);
  if (
    ![xRatio, yRatio, pageWidth, pageHeight].every(Number.isFinite)
    || xRatio < 0
    || xRatio > 1
    || yRatio < 0
    || yRatio > 1
    || pageWidth <= 0
    || pageHeight <= 0
  ) {
    return null;
  }

  const mapped = createNormalizedPdfLayoutMap(layout);
  if (!mapped.lines.length || mapped.text !== pageText) {
    return null;
  }
  const targetX = xRatio * pageWidth;
  const targetY = (1 - yRatio) * pageHeight;
  let best = null;

  for (const line of mapped.lines) {
    const xMin = Number(line.xMin);
    const xMax = Number(line.xMax);
    const y = Number(line.y);
    if (![xMin, xMax, y].every(Number.isFinite)) {
      continue;
    }
    const horizontalDistance = targetX < xMin
      ? xMin - targetX
      : targetX > xMax
        ? targetX - xMax
        : 0;
    const verticalDistance = Math.abs(targetY - y);
    const score = verticalDistance + horizontalDistance * 0.4;
    if (!best || score < best.score) {
      best = { horizontalDistance, line, score, verticalDistance };
    }
  }

  if (
    !best
    || best.verticalDistance > Math.max(24, pageHeight * 0.04)
    || best.horizontalDistance > Math.max(30, pageWidth * 0.12)
  ) {
    return null;
  }
  return best.line.normalizedStart;
}

function findPdfSelectionMatchIndices(pageLower, candidateLower) {
  const indexes = [];
  let searchFrom = 0;
  while (candidateLower && searchFrom <= pageLower.length) {
    const index = pageLower.indexOf(candidateLower, searchFrom);
    if (index < 0) {
      break;
    }
    indexes.push(index);
    searchFrom = index + 1;
  }
  return indexes;
}

function slicePdfTextFromSelection(pageText, selectedText, options = {}) {
  const page = normalizePdfSelectionText(pageText);
  const selected = normalizePdfSelectionText(selectedText);
  if (!page || !selected) {
    return { matched: false, text: page };
  }

  const spatialAnchor = getPdfSpatialLineAnchor(
    page,
    options.layout,
    options.selectionPosition
  );
  const minimumCandidateLength = spatialAnchor === null ? 8 : 2;
  const candidateLengths = [selected.length, 400, 240, 160, 100, 60, 30, 16, 8, 4, 2]
    .map((length) => Math.min(selected.length, length))
    .filter((length, index, values) => (
      length >= minimumCandidateLength && values.indexOf(length) === index
    ));
  const pageLower = page.toLocaleLowerCase();

  for (const length of candidateLengths) {
    const candidate = selected.slice(0, length);
    if (spatialAnchor === null) {
      let matchIndex = page.indexOf(candidate);
      if (matchIndex < 0) {
        matchIndex = pageLower.indexOf(candidate.toLocaleLowerCase());
      }
      if (matchIndex >= 0) {
        return { matched: true, text: page.slice(matchIndex) };
      }
      continue;
    }

    const matchIndices = findPdfSelectionMatchIndices(
      pageLower,
      candidate.toLocaleLowerCase()
    );
    if (!matchIndices.length) {
      continue;
    }
    const closestIndex = matchIndices.reduce((closest, current) => (
      Math.abs(current - spatialAnchor) < Math.abs(closest - spatialAnchor)
        ? current
        : closest
    ));
    if (Math.abs(closestIndex - spatialAnchor) <= Math.max(240, selected.length)) {
      return { matched: true, text: page.slice(closestIndex) };
    }
  }

  if (spatialAnchor !== null) {
    return { matched: true, text: page.slice(spatialAnchor) };
  }
  return { matched: false, text: page };
}

function joinPdfPageText(pageTexts) {
  return (Array.isArray(pageTexts) ? pageTexts : [])
    .map((text) => normalizeLineBreaks(text).trim())
    .filter(Boolean)
    .join('\n\n');
}

function getPdfExtractionErrorMessage(error) {
  const message = messageFromError(error);
  if (/password/i.test(`${error && error.name ? error.name : ''} ${message}`)) {
    return 'This PDF is password-protected. Unlock it before reading.';
  }
  if (/invalidpdf|invalid pdf|malformed pdf/i.test(`${error && error.name ? error.name : ''} ${message}`)) {
    return 'This PDF is invalid or damaged and its text could not be extracted.';
  }
  return message;
}

function splitMarkdownTableRow(line) {
  let value = String(line || '').trim();
  if (!value.includes('|')) {
    return [];
  }

  if (value.startsWith('|')) {
    value = value.slice(1);
  }
  if (hasUnescapedTrailingPipe(value)) {
    value = value.slice(0, -1);
  }

  const cells = [];
  let current = '';
  let inCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && value[index + 1] === '|') {
      current += '|';
      index += 1;
      continue;
    }
    if (character === '`') {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function hasUnescapedTrailingPipe(value) {
  if (!value.endsWith('|')) {
    return false;
  }

  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}

function isMarkdownTableDelimiterLine(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function formatMarkdownTableForSpeech(headers, rows, options = {}) {
  if (skipTable(headers, rows, options)) return omission('table', options, headers.concat(...rows).join(' '));
  const tableText = headers.concat(...rows).join(' ');
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(tableText);
  const output = [];
  const headerLabels = headers.map((header) => header.trim()).filter(Boolean);

  if (headerLabels.length) {
    output.push(`${useChineseLabels ? '表格列' : 'Table columns'}: ${headerLabels.join('; ')}${useChineseLabels ? '。' : '.'}`);
  }

  rows.forEach((cells, rowIndex) => {
    const values = [];
    const cellCount = Math.max(headers.length, cells.length);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const cell = String(cells[cellIndex] || '').trim();
      if (!cell) {
        continue;
      }
      const header = String(headers[cellIndex] || '').trim();
      values.push(header ? `${header}: ${cell}` : cell);
    }

    if (values.length) {
      const rowLabel = useChineseLabels ? `第 ${rowIndex + 1} 行` : `Row ${rowIndex + 1}`;
      output.push(`${rowLabel}. ${values.join('; ')}${useChineseLabels ? '。' : '.'}`);
    }
  });

  return output.join('\n');
}

function sanitizeMarkdownTablesForSpeech(text, options = {}) {
  const lines = normalizeLineBreaks(text).split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (headerLine.includes('|') && isMarkdownTableDelimiterLine(delimiterLine)) {
      const headers = splitMarkdownTableRow(headerLine);
      const rows = [];
      let rowIndex = index + 2;

      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes('|')) {
        const cells = splitMarkdownTableRow(lines[rowIndex]);
        if (isMarkdownTableDelimiterLine(lines[rowIndex])) {
          break;
        }
        rows.push(cells);
        rowIndex += 1;
      }

      output.push(formatMarkdownTableForSpeech(headers, rows, options));
      index = rowIndex - 1;
      continue;
    }

    if (!isMarkdownTableDelimiterLine(headerLine)) {
      output.push(headerLine);
    }
  }

  return output.join('\n');
}

function verbalizeNumericCitationsForSpeech(text) {
  return citations(text);
}

function sanitizeTextForSpeech(text, options = {}) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text), options);

  value = value.replace(/^---\n[\s\S]*?\n---\n?/, '');
  value = value.replace(/```[\s\S]*?```/g, ' ');
  value = value.replace(/!\[\[[^\]]+\]\]/g, ' ');
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
  value = verbalizeNumericCitationsForSpeech(value);
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  value = sanitizeMarkdownTablesForSpeech(value, options);
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*?)?\s*\/?>/g, ' ');
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/^\s*[-+*]\s+/gm, '');
  value = value.replace(/[*_~]/g, '');
  value = value.replace(/\|/g, ' ');
  value = value.replace(/[ \t]+/g, ' ');
  // Keep paragraph boundaries: \s also matches newlines and joins unrelated sections.
  value = value.replace(/[ \t]+([，。、；：！？,.])/g, '$1');
  value = value.replace(/([，。、；：！？])[ \t]+/g, '$1');

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function sanitizeLatexForSpeech(text, options = {}) {
  let value = academicLatex(normalizeLineBreaks(text), options);
  const mathReadingLanguage = normalizeMathReadingLanguage(options.mathReadingLanguage);

  return verbalizeLatexCommands(value, mathReadingLanguage);
}

function stripLatexDelimiters(content) {
  let value = String(content || '').trim();

  value = value.replace(/^\$\$([\s\S]*?)\$\$$/, '$1');
  value = value.replace(/^\\\[([\s\S]*?)\\\]$/, '$1');
  value = value.replace(/^\\\(([\s\S]*?)\\\)$/, '$1');
  value = value.replace(/^\$([^$]*)\$$/, '$1');

  return value.trim();
}

function verbalizeShortLatex(content, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  return mathSpeech(stripLatexDelimiters(content), { mathReadingLanguage });
}

function verbalizeLatexCommands(text, mathReadingLanguage = DEFAULT_MATH_READING_LANGUAGE) {
  const language = normalizeMathReadingLanguage(mathReadingLanguage);
  let value = replaceLatexCommands(String(text || ''), language);
  value = replaceLatexSymbolCommands(value, language);
  return cleanupLatexSpeechPreservingLines(value);
}

function replaceLatexCommands(text, mathReadingLanguage) {
  let value = String(text || '');
  let previous = '';
  const fractionSpeech = mathReadingLanguage === 'chinese' ? '$2 分之 $1' : '$1 over $2';

  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, '$1');
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, fractionSpeech);
  }

  return value;
}

function replaceLatexSymbolCommands(text, mathReadingLanguage) {
  let value = String(text || '');
  const replacements = LATEX_COMMAND_REPLACEMENTS[mathReadingLanguage] || LATEX_COMMAND_REPLACEMENTS[DEFAULT_MATH_READING_LANGUAGE];

  for (const [command, speech] of replacements) {
    const replacement = speech ? ` ${speech} ` : ' ';
    value = value.replace(new RegExp(`${escapeRegExp(command)}\\b`, 'g'), replacement);
  }

  return value;
}

function cleanupLatexSpeech(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。、；：！？,.])/g, '$1')
    .replace(/([，。、；：！？])\s+/g, '$1')
    .trim();
}

function cleanupLatexSpeechPreservingLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => cleanupLatexSpeech(line))
    .join('\n');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDefaultScriptPath() {
  return '';
}

function normalizeVolume(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value)) : 1;
}

function normalizeSpeed(value) {
  const speed = Number(value);

  if (!Number.isFinite(speed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.5, speed));
}

function normalizeMathReadingLanguage(value) {
  const language = String(value || DEFAULT_MATH_READING_LANGUAGE).toLowerCase();
  return MATH_READING_LANGUAGES.includes(language) ? language : DEFAULT_MATH_READING_LANGUAGE;
}

function normalizeSettingsLanguage(value) {
  const language = String(value || DEFAULT_SETTINGS.settingsLanguage).toLowerCase();
  return SETTINGS_LANGUAGES.includes(language) ? language : DEFAULT_SETTINGS.settingsLanguage;
}

function normalizeCredentialSource(value) {
  const source = String(value || 'obsidian-secret').trim().toLowerCase();
  return CREDENTIAL_SOURCES.includes(source) ? source : 'obsidian-secret';
}

function getSettingsUiText(language) {
  const normalized = normalizeSettingsLanguage(language);
  return SETTINGS_UI_TEXT[normalized] || Object.fromEntries(Object.entries(SETTINGS_UI_TEXT.english)
    .map(([key, value]) => [key, translateInterface(normalized, value)]));
}

function openExternalUrl(url) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    return false;
  }
  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}

function openGitHubIssues() {
  return openExternalUrl(GITHUB_ISSUES_URL);
}

function openAzureTtsPrivacyDocs() {
  return openExternalUrl(AZURE_TTS_PRIVACY_URL);
}

function getOpenRouterVoiceHelpLinks(modelId, language = 'english') {
  const model = normalizeOpenRouterModel(modelId);
  const modelPage = `https://openrouter.ai/${model.split('/').map(encodeURIComponent).join('/')}`;
  let voiceCatalog = 'https://openrouter.ai/api/v1/models?output_modalities=speech';
  if (model.startsWith('microsoft/mai-voice-')) {
    const locale = normalizeSettingsLanguage(language) === 'chinese' ? 'zh-cn' : 'en-us';
    voiceCatalog = `https://learn.microsoft.com/${locale}/azure/ai-services/speech-service/mai-voices`;
  } else if (model.startsWith('google/gemini-')) {
    voiceCatalog = 'https://ai.google.dev/gemini-api/docs/speech-generation#voice-options';
  } else if (model.startsWith('fish-audio/')) {
    voiceCatalog = 'https://fish.audio/discovery/';
  } else if (model === 'hexgrad/kokoro-82m') {
    voiceCatalog = modelPage;
  }
  return { modelPage, voiceCatalog };
}

function normalizeSpeechEngine(value) {
  const engine = String(value || DEFAULT_SETTINGS.speechEngine).toLowerCase();
  return SPEECH_ENGINES.includes(engine) ? engine : DEFAULT_SETTINGS.speechEngine;
}

function isOnlineSpeechEngine(value) {
  return !['local-cosyvoice', 'system-tts'].includes(normalizeSpeechEngine(value));
}

function normalizeOnlinePrefetchChunks(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count)
    ? Math.min(MAX_ONLINE_PREFETCH_CHUNKS, Math.max(0, count))
    : DEFAULT_SETTINGS.onlinePrefetchChunks;
}

function getChunkLimitsForSpeechEngine(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  if (isOnlineSpeechEngine(speechEngine)) {
    const limits = parseChunkLimits(settings && settings.onlineChunkLimits, DEFAULT_ONLINE_CHUNK_LIMITS);
    if (speechEngine === 'byok-tts') return limits.map(limit => Math.min(limit, getByokProfile(settings)?.chunkLimit || 800));
    const mimoLimit = Math.max(50, Math.min(2000, Math.floor(Number(settings && settings.mimoChunkLimit) || MIMO_MAX_CHUNK_CHARS)));
    return speechEngine === 'mimo-tts' ? limits.map(limit => Math.min(limit, mimoLimit)) : limits;
  }
  return parseChunkLimits(settings && settings.chunkLimits, DEFAULT_CHUNK_LIMITS);
}

function getSynthesisPrefetchCount(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  return isOnlineSpeechEngine(speechEngine)
    ? normalizeOnlinePrefetchChunks(settings && settings.onlinePrefetchChunks)
    : 1;
}

function normalizeEdgeTtsVoice(value) {
  const voice = String(value || '').trim();
  return voice || DEFAULT_EDGE_TTS_VOICE;
}

function normalizeEdgeTtsExecutable(value) {
  const executable = String(value || '').trim();
  return executable || DEFAULT_EDGE_TTS_EXECUTABLE;
}

function normalizeAzureSpeechCloud(value) {
  const cloud = String(value || '').trim().toLowerCase();
  return AZURE_SPEECH_CLOUDS.includes(cloud) ? cloud : 'public';
}

function normalizeAzureSpeechRegion(value) {
  const region = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]{2,32}$/.test(region) ? region : '';
}

function normalizeAzureSpeechVoice(value) {
  const voice = String(value || '').trim();
  return /^[a-z]{2,3}-[a-z]{2}-[a-z0-9][a-z0-9._:-]{1,190}$/i.test(voice)
    ? voice
    : DEFAULT_AZURE_SPEECH_VOICE;
}

function normalizeOpenRouterModel(value) {
  const model = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{1,149}(?::[a-z0-9._-]+)?$/i.test(model)
    ? model
    : DEFAULT_OPENROUTER_TTS_MODEL;
}

function normalizeOpenRouterVoice(value) {
  const voice = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(voice) ? voice : DEFAULT_OPENROUTER_TTS_VOICE;
}

function hasObsidianSecretStorage(app) {
  return Boolean(app && app.secretStorage && typeof app.secretStorage.getSecret === 'function');
}

function hasObsidianSecretStorageUi(app) {
  return hasObsidianSecretStorage(app) && typeof SecretComponent === 'function';
}

function getCredentialValueError(value, serviceLabel) {
  const secret = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!secret) {
    return `${serviceLabel} secret is empty or unavailable.`;
  }
  if (/[\r\n]/.test(secret)) {
    return `${serviceLabel} secret must contain exactly one non-empty line.`;
  }
  return '';
}

function readObsidianSecretValue(secretNameValue, app, serviceLabel) {
  const secretName = String(secretNameValue || '').trim();
  if (!secretName) {
    throw new Error(`Select or create an Obsidian SecretStorage entry for ${serviceLabel}.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(secretName)) {
    throw new Error(`${serviceLabel} secret name must use lowercase letters, numbers, and dashes.`);
  }
  if (!hasObsidianSecretStorage(app)) {
    throw new Error('Obsidian SecretStorage requires Obsidian 1.11.4 or later. Select the external key-file option on older versions.');
  }

  let value;
  try {
    value = app.secretStorage.getSecret(secretName);
  } catch (error) {
    throw new Error(`Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`);
  }
  const valueError = getCredentialValueError(value, serviceLabel);
  if (valueError) {
    throw new Error(valueError);
  }
  return String(value).trim();
}

function getObsidianSecretConfigurationError(secretNameValue, app, serviceLabel) {
  try {
    readObsidianSecretValue(secretNameValue, app, serviceLabel);
    return '';
  } catch (error) {
    return error && error.message ? String(error.message) : `Could not read the ${serviceLabel} secret from Obsidian SecretStorage.`;
  }
}

function getSecretFileConfigurationError(keyPathValue, vaultBasePath, serviceLabel) {
  const keyPath = String(keyPathValue || '').trim();
  if (!keyPath || !path.isAbsolute(keyPath)) {
    return `Set an absolute ${serviceLabel} key file path in the plugin settings.`;
  }
  if (vaultBasePath && isInsideDirectory(keyPath, vaultBasePath)) {
    return `The ${serviceLabel} key file must be stored outside the Obsidian vault.`;
  }
  if (!fs.existsSync(keyPath)) {
    return `${serviceLabel} key file not found: ${keyPath}`;
  }

  return '';
}

function getRemoteCredentialConfigurationError({ credentialSource, secretName, keyPath }, vaultBasePath, app, serviceLabel) {
  if (normalizeCredentialSource(credentialSource) === 'obsidian-secret') {
    return getObsidianSecretConfigurationError(secretName, app, serviceLabel);
  }
  return getSecretFileConfigurationError(keyPath, vaultBasePath, serviceLabel);
}

function buildAzureSpeechEndpoint(settings = {}) {
  const cloud = String(settings.azureSpeechCloud || 'public').trim().toLowerCase();
  const region = normalizeAzureSpeechRegion(settings.azureSpeechRegion);
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    throw new Error('Invalid Azure Speech cloud.');
  }
  if (!region) {
    throw new Error('Invalid Azure Speech region.');
  }
  const domain = cloud === 'china'
    ? 'tts.speech.azure.cn'
    : 'tts.speech.microsoft.com';
  return `https://${region}.${domain}/cognitiveservices/v1`;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildAzureSpeechSsml(text, settings = {}) {
  const voice = normalizeAzureSpeechVoice(settings.azureSpeechVoice);
  const locale = voice.split('-').slice(0, 2).join('-');
  const rate = formatEdgeTtsRate(settings.speed);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(locale)}"><voice name="${escapeXml(voice)}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
}

function getAzureSpeechConfigurationError(settings = {}, vaultBasePath = '', app = null) {
  const cloud = String(settings.azureSpeechCloud || 'public').trim().toLowerCase();
  if (!AZURE_SPEECH_CLOUDS.includes(cloud)) {
    return 'Select a valid Azure Speech cloud in the plugin settings.';
  }
  const region = String(settings.azureSpeechRegion || '').trim().toLowerCase();
  if (!region || normalizeAzureSpeechRegion(region) !== region) {
    return 'Set a valid Azure Speech region in the plugin settings.';
  }
  if (normalizeAzureSpeechVoice(settings.azureSpeechVoice) !== String(settings.azureSpeechVoice || '').trim()) {
    return 'Set a valid Azure Speech voice ID in the plugin settings.';
  }

  return getRemoteCredentialConfigurationError({
    credentialSource: settings.azureSpeechCredentialSource,
    secretName: settings.azureSpeechSecretName,
    keyPath: settings.azureSpeechKeyPath,
  }, vaultBasePath, app, 'Azure Speech');
}

function getOpenRouterConfigurationError(settings = {}, vaultBasePath = '', app = null) {
  if (normalizeOpenRouterModel(settings.openRouterModel) !== String(settings.openRouterModel || '').trim()) {
    return 'Set a valid OpenRouter TTS model ID in the plugin settings.';
  }
  if (normalizeOpenRouterVoice(settings.openRouterVoice) !== String(settings.openRouterVoice || '').trim()) {
    return 'Set a valid OpenRouter TTS voice ID in the plugin settings.';
  }

  return getRemoteCredentialConfigurationError({
    credentialSource: settings.openRouterCredentialSource,
    secretName: settings.openRouterSecretName,
    keyPath: settings.openRouterKeyPath,
  }, vaultBasePath, app, 'OpenRouter API');
}

function buildOpenRouterTtsRequestBody(text, settings = {}) {
  return JSON.stringify({
    model: normalizeOpenRouterModel(settings.openRouterModel),
    input: String(text || ''),
    voice: normalizeOpenRouterVoice(settings.openRouterVoice),
    response_format: 'mp3',
    speed: normalizeSpeed(settings.speed),
    provider: {
      data_collection: 'deny',
      zdr: true,
    },
  });
}

function getMicrosoftVoicePresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === 'chinese' ? 2 : 1;
  return MICROSOFT_VOICE_PRESETS.map((preset) => [preset[0], preset[labelIndex]]);
}

function getEdgeTtsVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}

function getAzureSpeechVoicePresets(language) {
  return getMicrosoftVoicePresets(language);
}

function getOpenRouterTtsModels(language) {
  const normalizedLanguage = normalizeSettingsLanguage(language);
  const labelIndex = normalizedLanguage === 'chinese' ? 3 : 2;
  const infoIndex = normalizedLanguage === 'chinese' ? 5 : 4;
  return OPENROUTER_TTS_MODELS.map((model) => [model[0], model[1], model[labelIndex], model[infoIndex]]);
}

function getDefaultOpenRouterVoiceForModel(modelId) {
  const selected = OPENROUTER_TTS_MODELS.find(([model]) => model === String(modelId || '').trim());
  return selected ? selected[1] : DEFAULT_OPENROUTER_TTS_VOICE;
}

function getOpenRouterTtsPresets(language) {
  const labelIndex = normalizeSettingsLanguage(language) === 'chinese' ? 3 : 2;
  return OPENROUTER_TTS_PRESETS.map((preset) => [preset[0], preset[1], preset[labelIndex]]);
}

function getOpenRouterTtsVoicePresets(modelId, language) {
  const selectedModel = String(modelId || '').trim();
  return getOpenRouterTtsPresets(language).filter(([model]) => model === selectedModel);
}

function hasEdgeTtsConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== 'edge-tts' || settings.edgeTtsConsent === true;
}

function hasAzureSpeechConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== 'azure-speech' || settings.azureSpeechConsent === true;
}

function hasOpenRouterConsent(settings = {}) {
  return normalizeSpeechEngine(settings.speechEngine) !== 'openrouter-tts' || settings.openRouterConsent === true;
}

function getPluginTempCacheDir(vaultBasePath, tempBasePath = os.tmpdir()) {
  const resolvedVaultPath = path.resolve(String(vaultBasePath || ''));
  const vaultKey = crypto.createHash('sha256').update(resolvedVaultPath).digest('hex').slice(0, 16);
  return path.join(tempBasePath, PLUGIN_ID, vaultKey);
}

function isOwnedCacheFileName(fileName) {
  const name = String(fileName || '');
  return OWNED_CACHE_FILE_PATTERN.test(name) || name === 'diagnostic.log';
}

function createSafeRuntimeLogEvent(stage, settings = {}, timestamp = new Date().toISOString()) {
  if (stage !== 'failed') {
    return null;
  }

  return {
    time: timestamp,
    stage: 'failed',
    engine: getSpeechEngineLabel(settings),
  };
}

function formatEdgeTtsRate(speed) {
  const rate = Math.round((normalizeSpeed(speed) - 1) * 100);
  return `${rate >= 0 ? '+' : ''}${rate}%`;
}

function buildEdgeTtsArgs(inputPath, outputPath, settings = {}) {
  return [
    '--voice',
    normalizeEdgeTtsVoice(settings.edgeTtsVoice),
    `--rate=${formatEdgeTtsRate(settings.speed)}`,
    '--file',
    inputPath,
    '--write-media',
    outputPath,
  ];
}

function getSpeechEngineLabel(settings = {}) {
  const speechEngine = normalizeSpeechEngine(settings.speechEngine);
  if (speechEngine === 'system-tts') return settings.settingsLanguage === 'chinese' ? '系统本地语音' : 'System local speech';
  if (speechEngine === 'mimo-tts') return 'Xiaomi MiMo TTS';
  if (speechEngine === 'byok-tts') return 'BYOK TTS';
  if (speechEngine === 'edge-tts') {
    return 'Edge TTS';
  }
  if (speechEngine === 'azure-speech') {
    return 'Azure Speech';
  }
  if (speechEngine === 'openrouter-tts') {
    return 'OpenRouter TTS';
  }
  return 'CosyVoice';
}

function getSpeedPresets() {
  return SPEED_PRESETS.slice();
}

function formatSpeedLabel(speed) {
  return `${normalizeSpeed(speed).toString()}x`;
}

function selectKnownSettings(defaults, candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => [
    key,
    Object.prototype.hasOwnProperty.call(source, key) ? source[key] : defaultValue,
  ]));
}

function createDefaultSettings() {
  return {
    ...ACADEMIC_DEFAULTS,
    ...COPILOT_DEFAULTS,
    ...MIMO_DEFAULTS,
    ...BYOK_DEFAULTS,
    byokProfiles: [],
    ...APPEARANCE_DEFAULTS,
    readingHighlight: 'sentence',
    webReadingHighlight: true,
    webReadingFollow: false,
    readingFollow: false,
    pdfBookmarksOverwrite: false,
    pdfFootnoteMode: 'body',
    pdfSkipHeaders: true,
    pdfIncludeGlossary: false,
    playbackVolume: 1,
    playbackSpeed: 1,
    audioExportFolder: normalizeAudioExportFolder(DEFAULT_SETTINGS.audioExportFolder),
    audioExportLocation: normalizeAudioExportLocation(DEFAULT_SETTINGS.audioExportLocation),
    azureSpeechCloud: normalizeAzureSpeechCloud(DEFAULT_SETTINGS.azureSpeechCloud),
    azureSpeechConsent: DEFAULT_SETTINGS.azureSpeechConsent,
    azureSpeechCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.azureSpeechCredentialSource),
    azureSpeechKeyPath: DEFAULT_SETTINGS.azureSpeechKeyPath,
    azureSpeechRegion: DEFAULT_SETTINGS.azureSpeechRegion,
    azureSpeechSecretName: DEFAULT_SETTINGS.azureSpeechSecretName,
    azureSpeechVoice: normalizeAzureSpeechVoice(DEFAULT_SETTINGS.azureSpeechVoice),
    cleanupCache: DEFAULT_SETTINGS.cleanupCache,
    chunkLimits: parseChunkLimits(DEFAULT_SETTINGS.chunkLimits).join(','),
    onlineChunkLimits: parseChunkLimits(
      DEFAULT_SETTINGS.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(','),
    onlinePrefetchChunks: normalizeOnlinePrefetchChunks(DEFAULT_SETTINGS.onlinePrefetchChunks),
    readingPositions: normalizeReadingPositions(DEFAULT_SETTINGS.readingPositions),
    readingHistoryMode: 'session',
    smartQuickStart: true,
    rapidQuickStart: false,
    rememberReadingPosition: DEFAULT_SETTINGS.rememberReadingPosition,
    diagnosticLogging: DEFAULT_SETTINGS.diagnosticLogging,
    edgeTtsConsent: DEFAULT_SETTINGS.edgeTtsConsent,
    edgeTtsExecutable: normalizeEdgeTtsExecutable(DEFAULT_SETTINGS.edgeTtsExecutable),
    edgeTtsVoice: normalizeEdgeTtsVoice(DEFAULT_SETTINGS.edgeTtsVoice),
    mathReadingLanguage: normalizeMathReadingLanguage(DEFAULT_SETTINGS.mathReadingLanguage),
    openRouterConsent: DEFAULT_SETTINGS.openRouterConsent,
    openRouterCredentialSource: normalizeCredentialSource(DEFAULT_SETTINGS.openRouterCredentialSource),
    openRouterKeyPath: DEFAULT_SETTINGS.openRouterKeyPath,
    openRouterModel: normalizeOpenRouterModel(DEFAULT_SETTINGS.openRouterModel),
    openRouterSecretName: DEFAULT_SETTINGS.openRouterSecretName,
    openRouterVoice: normalizeOpenRouterVoice(DEFAULT_SETTINGS.openRouterVoice),
    settingsLanguage: normalizeSettingsLanguage(DEFAULT_SETTINGS.settingsLanguage),
    scriptPath: resolveDefaultScriptPath(),
    speechEngine: normalizeSpeechEngine(DEFAULT_SETTINGS.speechEngine),
    systemVoiceWindows: normalizeSystemVoice(DEFAULT_SETTINGS.systemVoiceWindows),
    systemVoiceMac: normalizeSystemVoice(DEFAULT_SETTINGS.systemVoiceMac),
    speed: normalizeSpeed(DEFAULT_SETTINGS.speed),
    stripMarkdown: DEFAULT_SETTINGS.stripMarkdown,
  };
}

function createReaderState(overrides = {}) {
  return normalizeReaderState({
    canPause: false,
    canNextChunk: false,
    canPreviousChunk: false,
    canSeek: false,
    canStop: false,
    currentChunk: 0,
    currentText: '',
    error: '',
    isPaused: false,
    label: 'CosyVoice idle',
    phase: 'idle',
    progress: 0,
    source: '',
    status: 'idle',
    totalChunks: 0,
    ...overrides,
  });
}

function normalizeReaderState(state) {
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  const currentChunk = Math.max(0, Math.min(totalChunks || Number.MAX_SAFE_INTEGER, Math.floor(Number(state.currentChunk) || 0)));

  return {
    canPause: Boolean(state.canPause),
    canNextChunk: Boolean(state.canNextChunk),
    canPreviousChunk: Boolean(state.canPreviousChunk),
    canSeek: Boolean(state.canSeek),
    canStop: Boolean(state.canStop),
    currentChunk,
    currentText: String(state.currentText || ''),
    error: String(state.error || ''),
    isPaused: Boolean(state.isPaused),
    label: String(state.label || 'CosyVoice idle'),
    phase: String(state.phase || 'idle'),
    preparationStatus: String(state.preparationStatus || ''),
    progress: clampProgress(state.progress),
    source: String(state.source || ''),
    status: String(state.status || 'idle'),
    totalChunks,
  };
}

function calculateCurrentChunkSeekTime({ progress, currentChunk, totalChunks, duration }) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const chunk = Math.max(0, Math.floor(Number(currentChunk) || 0));
  const seconds = Number(duration);

  if (!total || !chunk || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const chunkStart = (chunk - 1) / total;
  const chunkEnd = chunk / total;
  const clampedProgress = Math.min(chunkEnd, Math.max(chunkStart, clampProgress(progress)));
  const localProgress = (clampedProgress - chunkStart) / (chunkEnd - chunkStart);

  return Math.round(seconds * localProgress * 1000) / 1000;
}

function getTextFromPositionToEnd(lines, position) {
  const sourceLines = Array.isArray(lines) ? lines.map((line) => String(line || '')) : [];
  const line = Math.max(0, Math.min(sourceLines.length - 1, Math.floor(Number(position && position.line) || 0)));
  const ch = Math.max(0, Math.floor(Number(position && position.ch) || 0));

  if (!sourceLines.length) {
    return '';
  }

  const firstLine = sourceLines[line] || '';
  return [firstLine.slice(ch), ...sourceLines.slice(line + 1)].join('\n').trim();
}

function clampProgress(value) {
  const progress = Number(value);

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}

function formatProgressLabel(state) {
  const currentChunk = Math.max(0, Math.floor(Number(state.currentChunk) || 0));
  const totalChunks = Math.max(0, Math.floor(Number(state.totalChunks) || 0));
  return `${currentChunk} / ${totalChunks}`;
}

function isSpaceKeyEvent(event) {
  return event && (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar');
}

function getKeyboardSeekDeltaSeconds(event) {
  if (!event) {
    return 0;
  }

  if (event.code === 'ArrowLeft' || event.key === 'ArrowLeft') {
    return -KEYBOARD_SEEK_SECONDS;
  }

  if (event.code === 'ArrowRight' || event.key === 'ArrowRight') {
    return KEYBOARD_SEEK_SECONDS;
  }

  return 0;
}

function isInteractiveKeyboardTarget(target) {
  if (!target || !target.tagName) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (typeof target.closest === 'function' && target.closest('.cm-editor, .markdown-source-view, [contenteditable="true"]')) {
    return true;
  }

  const tagName = String(target.tagName).toLowerCase();
  if (tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (tagName !== 'input') {
    return false;
  }

  const type = String(
    target.type ||
      (target.attributes && target.attributes.type) ||
      'text'
  ).toLowerCase();
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit'].includes(type);
}

function getChunkNavigationState(currentChunk, totalChunks) {
  const total = Math.max(0, Math.floor(Number(totalChunks) || 0));
  const current = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Math.floor(Number(currentChunk) || 0)));

  return {
    canNextChunk: Boolean(current && current < total),
    canPreviousChunk: current > 1,
  };
}

function previewText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return null;
  }

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, Math.ceil(Number(normalized) * 1000)));
  }

  const retryAtMs = Date.parse(normalized);
  if (!Number.isFinite(retryAtMs)) {
    return null;
  }

  return Math.min(REMOTE_TTS_RETRY_AFTER_MAX_MS, Math.max(0, retryAtMs - nowMs));
}

function isRetryableRemoteError(error) {
  if (!error) {
    return false;
  }

  const statusCode = Number(error.statusCode) || 0;
  if (statusCode) {
    return REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode);
  }

  return REMOTE_TTS_RETRYABLE_ERROR_CODES.has(String(error.code || '').toUpperCase());
}

function getRemoteHttpErrorDetail(statusCode, failureHint) {
  const fallback = failureHint || 'Check the service configuration and account status.';
  if (statusCode === 400 || statusCode === 422) {
    return `The provider rejected the request. Check the selected model, voice, text length, and request format. ${fallback}`;
  }
  if (statusCode === 401) {
    return 'Authentication failed. The API key may be missing, invalid, expired, or associated with a different service account.';
  }
  if (statusCode === 402) {
    return 'Account credit, balance, or spending limit is exhausted. Add credit or raise the provider budget before retrying.';
  }
  if (statusCode === 403) {
    return `The request was forbidden. Check API-key permissions, model or provider access, and required privacy routing. ${fallback}`;
  }
  if (statusCode === 404) {
    return `The requested endpoint, model, voice, region, or resource was not found. ${fallback}`;
  }
  if (statusCode === 413) {
    return 'The text request is too large for the provider. Reduce the online chunk limits and try again.';
  }
  if (statusCode === 429) {
    return 'The service rate limit or request quota has been reached. Wait for the provider reset time, reduce request frequency, or review the account limits.';
  }
  if (statusCode === 408 || statusCode === 425 || statusCode >= 500) {
    return 'The upstream service is temporarily unavailable, busy, or timed out.';
  }
  return fallback;
}

function createRemoteHttpError(serviceLabel, statusCode, failureHint, retryAfterValue) {
  const retryAfterMs = parseRetryAfterMs(retryAfterValue);
  const retryAfterDetail = Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? ` A Retry-After delay of ${Math.ceil(retryAfterMs / 1000)} seconds will be observed before the next attempt.`
    : '';
  const error = new Error(
    `${serviceLabel} returned HTTP ${statusCode}. ${getRemoteHttpErrorDetail(statusCode, failureHint)}${retryAfterDetail}`
  );
  error.statusCode = statusCode;
  error.retryAfterMs = retryAfterMs;
  error.category = statusCode === 402
    ? 'quota'
    : statusCode === 429
      ? 'rate-limit'
      : statusCode === 401
        ? 'authentication'
        : statusCode === 403
          ? 'access'
          : REMOTE_TTS_RETRYABLE_STATUS_CODES.has(statusCode)
            ? 'temporary'
            : 'request';
  return error;
}

function createRemoteRetryExhaustedError(serviceLabel, error, attempts) {
  const statusCode = Number(error && error.statusCode) || 0;
  const failure = statusCode ? `HTTP ${statusCode}` : messageFromError(error);
  const detail = statusCode === 429
    ? 'The rate limit or request quota is still exceeded. Wait for the provider reset time or review the account limits.'
    : 'The upstream provider may be temporarily unavailable. Try again shortly or select another model.';
  const exhaustedError = new Error(
    `${serviceLabel} returned ${failure} after ${attempts} attempts. ` +
    detail
  );
  exhaustedError.statusCode = statusCode || undefined;
  exhaustedError.code = error && error.code;
  exhaustedError.category = error && error.category;
  exhaustedError.retryAfterMs = error && error.retryAfterMs;
  return exhaustedError;
}

function focusElementWithoutScroll(element) {
  if (!element || typeof element.focus !== 'function') {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

function toVaultRelativePath(basePath, filePath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(filePath));

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return relative.split(path.sep).join('/');
}

function getAudioUrlForFile(adapter, basePath, filePath) {
  const vaultPath = toVaultRelativePath(basePath, filePath);

  if (vaultPath && adapter && typeof adapter.getResourcePath === 'function') {
    return adapter.getResourcePath(vaultPath);
  }

  return pathToFileURL(filePath).href;
}

function getAudioMimeType(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() === '.wav'
    ? 'audio/wav'
    : 'audio/mpeg';
}

function createBlobAudioSource(audioBytes, filePath, runtime = globalThis) {
  if (!audioBytes || typeof audioBytes.length !== 'number' || audioBytes.length === 0) {
    return null;
  }

  const BlobConstructor = runtime && runtime.Blob;
  const urlApi = runtime && runtime.URL;
  if (typeof BlobConstructor !== 'function'
    || !urlApi
    || typeof urlApi.createObjectURL !== 'function'
    || typeof urlApi.revokeObjectURL !== 'function') {
    return null;
  }

  try {
    const mimeType = getAudioMimeType(filePath);
    const objectUrl = urlApi.createObjectURL(new BlobConstructor([audioBytes], { type: mimeType }));
    if (!objectUrl) {
      return null;
    }

    let released = false;
    return {
      mimeType,
      url: String(objectUrl),
      release() {
        if (released) {
          return;
        }
        released = true;
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] Could not release temporary audio URL`, error);
        }
      },
    };
  } catch (error) {
    return null;
  }
}

function describeMediaError(mediaError) {
  const code = Number(mediaError && mediaError.code) || 0;
  const descriptions = {
    1: 'playback was aborted',
    2: 'the audio source could not be loaded',
    3: 'the audio could not be decoded',
    4: 'the audio source or format is unsupported',
  };
  return code ? ` (media error ${code}: ${descriptions[code] || 'unknown media failure'})` : '';
}

function resolvePowerShellExecutable() {
  return 'powershell.exe';
}

function isMarkdownFile(file) {
  return Boolean(file && String(file.extension || '').toLowerCase() === 'md');
}

function getAudioExportExtension(speechEngine) {
  return ['local-cosyvoice', 'system-tts', 'mimo-tts'].includes(normalizeSpeechEngine(speechEngine)) ? 'wav' : 'mp3';
}

function normalizeAudioExportScope(value) {
  const normalized = String(value || '').trim();
  return AUDIO_EXPORT_SCOPES.includes(normalized) ? normalized : 'entire';
}

function normalizeAudioExportLocation(value) {
  const normalized = String(value || '').trim();
  return AUDIO_EXPORT_LOCATIONS.includes(normalized)
    ? normalized
    : 'obsidian-attachment';
}

function normalizeVaultRelativeAudioPath(value) {
  const source = String(value || '');
  if (source.includes('\0')) {
    return '';
  }
  const normalized = source
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  const segments = normalized.split('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[A-Za-z]:/.test(normalized)
    || segments.some((segment) => segment.trim() === '.' || segment.trim() === '..')
  ) {
    return '';
  }
  return normalized;
}

function normalizeAudioExportFolder(value) {
  return normalizeVaultRelativeAudioPath(value);
}

function getAvailableVaultAudioPath(vault, requestedPath) {
  const normalizedPath = normalizeVaultRelativeAudioPath(requestedPath);
  if (!normalizedPath) {
    throw new Error('The audio export path must stay inside the current Obsidian vault.');
  }
  if (!vault || typeof vault.getAbstractFileByPath !== 'function') {
    return normalizedPath;
  }

  const extension = path.posix.extname(normalizedPath);
  const stem = extension ? normalizedPath.slice(0, -extension.length) : normalizedPath;
  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const candidate = `${stem}${suffix ? ` ${suffix}` : ''}${extension}`;
    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not choose a non-conflicting name for the exported audio.');
}

function selectMarkdownAudioExportText(documentText, selectionText, selectionStart, scopeValue) {
  const scope = normalizeAudioExportScope(scopeValue);
  if (scope === 'selection') {
    return String(selectionText || '').trim();
  }
  if (scope === 'from-selection') {
    return getTextFromPositionToEnd(
      normalizeLineBreaks(documentText).split('\n'),
      selectionStart
    ).trim();
  }
  return String(documentText || '').trim();
}

function createAudioExportSummary(options = {}) {
  return {
    chunkCount: Math.max(0, Math.floor(Number(options.chunkCount) || 0)),
    documentKind: ['pdf', 'html', 'web'].includes(options.documentKind) ? options.documentKind : 'markdown',
    engineLabel: String(options.engineLabel || 'Speech engine'),
    fileName: String(options.fileName || options.noteName || 'document'),
    insertAfterExport: options.insertAfterExport === true,
    isOnline: isOnlineSpeechEngine(options.speechEngine),
    noteName: String(options.fileName || options.noteName || 'document'),
    scope: normalizeAudioExportScope(options.scope),
    speechEngine: normalizeSpeechEngine(options.speechEngine),
    targetPath: String(options.targetPath || '').trim(),
    textLength: Math.max(0, Math.floor(Number(options.textLength) || 0)),
  };
}

function getAudioExportScopeLabel(languageValue, scopeValue) {
  const useChinese = normalizeSettingsLanguage(languageValue) === 'chinese';
  const scope = normalizeAudioExportScope(scopeValue);
  const labels = useChinese
    ? {
      entire: '全部内容',
      selection: '仅选中内容',
      'from-selection': '从选中位置到末尾',
    }
    : {
      entire: 'Entire document',
      selection: 'Selected text only',
      'from-selection': 'From selection to end',
    };
  return labels[scope];
}

function getAudioExportScopeUiText(languageValue, context = {}) {
  const useChinese = normalizeSettingsLanguage(languageValue) === 'chinese';
  const isPdf = context.documentKind === 'pdf';
  const isHtml = context.documentKind === 'html';
  const isWeb = context.documentKind === 'web';
  const hasSelection = context.hasSelection === true;
  if (useChinese) {
    return {
      cancel: '取消',
      continue: '继续',
      description: isPdf
        ? '选择要从当前文本型 PDF 导出的内容范围。下一步会先在本地解析并计算准确分段，再要求确认。'
        : isWeb ? '选择当前网页的导出范围；只处理已加载的正文。下一步会显示准确字符数、分段数和保存位置并要求确认。'
        : isHtml ? '选择要从当前 HTML 文件导出的正文范围。下一步会在本地提取文字、计算准确分段并要求确认。'
          : '选择要从当前 Markdown 笔记导出的内容范围。下一步会计算准确分段并要求确认。',
      entire: '全部内容',
      fileLabel: isPdf ? 'PDF' : isHtml ? 'HTML' : isWeb ? '网页' : '笔记',
      fromSelection: '从选中位置到末尾',
      noSelection: '当前文件没有可用选区。请先选中文字，再使用后两种范围。',
      scopeLabel: '导出范围',
      selection: '仅选中内容',
      selectionAvailable: hasSelection,
      title: '选择音频导出范围',
    };
  }
  return {
    cancel: 'Cancel',
    continue: 'Continue',
    description: isPdf
      ? 'Choose what to export from the current text-based PDF. The plugin will parse locally, calculate exact segments, and then ask for confirmation.'
      : isWeb ? 'Choose what to export from the loaded web page. Review the readable character count, segments and save path before synthesis.'
      : isHtml ? 'Choose what to export from the current HTML file. Readable text is extracted locally before the estimate and confirmation.'
        : 'Choose what to export from the current Markdown note. The plugin will calculate exact segments and then ask for confirmation.',
    entire: 'Entire document',
    fileLabel: isPdf ? 'PDF' : isHtml ? 'HTML' : isWeb ? 'Web page' : 'Note',
    fromSelection: 'From selection to end',
    noSelection: 'There is no usable selection in the current file. Select text first to use the other two scopes.',
    scopeLabel: 'Export scope',
    selection: 'Selected text only',
    selectionAvailable: hasSelection,
    title: 'Choose audio export scope',
  };
}

function getAudioExportUiText(languageValue, summaryValue) {
  const summary = createAudioExportSummary(summaryValue);
  const useChinese = normalizeSettingsLanguage(languageValue) === 'chinese';
  const numberFormatter = new Intl.NumberFormat(useChinese ? 'zh-CN' : 'en-US');
  if (useChinese) {
    return {
      acknowledge: summary.isOnline
        ? '我了解：上述范围内的可朗读文本将分段发送给所选在线语音服务，并可能消耗 API 额度或产生费用。'
        : '我了解：插件将为上述范围执行本地语音合成，过程可能需要较长时间。',
      cancel: '取消',
      characterLabel: '可朗读字符数',
      confirm: summary.insertAfterExport ? '导出并插入' : '导出音频',
      description: summary.insertAfterExport
        ? '全部分段成功后，音频会保存到下方位置并插入原笔记。'
        : '全部分段成功后，音频会保存到下方位置。',
      engineLabel: '语音引擎',
      fileLabel: summary.documentKind === 'pdf' ? 'PDF' : summary.documentKind === 'html' ? 'HTML' : summary.documentKind === 'web' ? '网页' : '笔记',
      locationLabel: '预计保存位置',
      quotaWarning: summary.isOnline
        ? `将发送 ${numberFormatter.format(summary.textLength)} 个字符，计划按 ${numberFormatter.format(summary.chunkCount)} 个分段顺序合成；临时失败可能触发有限重试，因此实际网络尝试次数可能更高。不会为播放连续性额外预合成。实际额度或费用由服务商和模型决定。`
        : `将执行 ${numberFormatter.format(summary.chunkCount)} 个本地合成分段；不会调用在线 API。`,
      requestLabel: summary.isOnline ? '预计在线请求' : '合成分段',
      scopeLabel: '导出范围',
      scopeValue: getAudioExportScopeLabel('chinese', summary.scope),
      title: '确认导出音频？',
    };
  }
  return {
    acknowledge: summary.isOnline
      ? 'I understand that readable text in the selected scope will be sent in chunks to the selected online speech service and may use API quota or incur charges.'
      : 'I understand that the selected scope will be synthesized locally and may take a long time.',
    cancel: 'Cancel',
    characterLabel: 'Readable characters',
    confirm: summary.insertAfterExport ? 'Export and insert' : 'Export audio',
    description: summary.insertAfterExport
      ? 'After every segment succeeds, the audio will be saved at the location below and embedded in the original note.'
      : 'After every segment succeeds, the audio will be saved at the location below.',
    engineLabel: 'Speech engine',
    fileLabel: summary.documentKind === 'pdf' ? 'PDF' : summary.documentKind === 'html' ? 'HTML' : summary.documentKind === 'web' ? 'Web page' : 'Note',
    locationLabel: 'Planned save location',
    quotaWarning: summary.isOnline
      ? `${numberFormatter.format(summary.textLength)} characters will be sent in ${numberFormatter.format(summary.chunkCount)} planned sequential segments. Temporary failures may trigger bounded retries, so the network attempt count can be higher. No playback-continuity chunks are prefetched. Actual quota or cost depends on the provider and model.`
      : `${numberFormatter.format(summary.chunkCount)} local synthesis segments will run. No online API is used.`,
    requestLabel: summary.isOnline ? 'Estimated online requests' : 'Synthesis segments',
    scopeLabel: 'Export scope',
    scopeValue: getAudioExportScopeLabel('english', summary.scope),
    title: 'Confirm audio export?',
  };
}

class AudioExportScopeModal extends Modal {
  constructor(app, language, context) {
    super(app);
    this.language = language;
    this.context = context || {};
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(result ? normalizeAudioExportScope(result) : null);
    this.close();
  }

  openAndWait() {
    this.open();
    return this.resultPromise;
  }

  onOpen() {
    const ui = getAudioExportScopeUiText(this.language, this.context);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass('note-reader-cosyvoice-export-modal');
    this.contentEl.createEl('p', { text: ui.description });

    const fileSummary = this.contentEl.createEl('dl', { cls: 'note-reader-cosyvoice-export-summary' });
    fileSummary.createEl('dt', { text: ui.fileLabel });
    fileSummary.createEl('dd', { text: String(this.context.fileName || 'document') });

    const scopeRow = this.contentEl.createEl('label', { cls: 'note-reader-cosyvoice-export-scope' });
    scopeRow.createSpan({ text: ui.scopeLabel });
    const select = scopeRow.createEl('select', { attr: { 'aria-label': ui.scopeLabel } });
    const addOption = (value, label, disabled = false) => {
      const option = select.createEl('option', { attr: { value }, text: label });
      option.disabled = disabled;
    };
    addOption('entire', ui.entire);
    addOption('selection', ui.selection, !ui.selectionAvailable);
    addOption('from-selection', ui.fromSelection, !ui.selectionAvailable);
    select.value = 'entire';

    if (!ui.selectionAvailable) {
      this.contentEl.createDiv({ cls: 'note-reader-cosyvoice-export-hint', text: ui.noSelection });
    }

    const actions = this.contentEl.createDiv({ cls: 'note-reader-cosyvoice-export-actions' });
    const cancelButton = actions.createEl('button', { text: ui.cancel });
    const continueButton = actions.createEl('button', { cls: 'mod-cta', text: ui.continue });
    cancelButton.addEventListener('click', () => this.finish(null));
    continueButton.addEventListener('click', () => this.finish(select.value));
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(null);
    }
  }
}

class AudioExportConfirmModal extends Modal {
  constructor(app, language, summary) {
    super(app);
    this.language = language;
    this.summary = createAudioExportSummary(summary);
    this.settled = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  finish(result) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveResult(Boolean(result));
    this.close();
  }

  openAndWait() {
    this.open();
    return this.resultPromise;
  }

  onOpen() {
    const ui = getAudioExportUiText(this.language, this.summary);
    this.titleEl.setText(ui.title);
    this.contentEl.empty();
    this.contentEl.addClass('note-reader-cosyvoice-export-modal');
    this.contentEl.createEl('p', { text: ui.description });

    const summaryEl = this.contentEl.createEl('dl', { cls: 'note-reader-cosyvoice-export-summary' });
    const addSummaryRow = (label, value) => {
      summaryEl.createEl('dt', { text: label });
      summaryEl.createEl('dd', { text: String(value) });
    };
    addSummaryRow(ui.fileLabel, this.summary.fileName);
    addSummaryRow(ui.scopeLabel, ui.scopeValue);
    addSummaryRow(ui.engineLabel, this.summary.engineLabel);
    addSummaryRow(ui.locationLabel, this.summary.targetPath);
    addSummaryRow(ui.characterLabel, new Intl.NumberFormat().format(this.summary.textLength));
    addSummaryRow(ui.requestLabel, new Intl.NumberFormat().format(this.summary.chunkCount));
    this.contentEl.createDiv({
      cls: 'note-reader-cosyvoice-export-warning',
      text: ui.quotaWarning,
    });

    const acknowledgement = this.contentEl.createEl('label', {
      cls: 'note-reader-cosyvoice-export-acknowledgement',
    });
    const checkbox = acknowledgement.createEl('input', {
      attr: { type: 'checkbox' },
    });
    acknowledgement.createSpan({ text: ui.acknowledge });

    const actions = this.contentEl.createDiv({ cls: 'note-reader-cosyvoice-export-actions' });
    const cancelButton = actions.createEl('button', { text: ui.cancel });
    const confirmButton = actions.createEl('button', {
      cls: 'mod-cta',
      text: ui.confirm,
    });
    confirmButton.disabled = true;
    checkbox.addEventListener('change', () => {
      confirmButton.disabled = !checkbox.checked;
    });
    cancelButton.addEventListener('click', () => this.finish(false));
    confirmButton.addEventListener('click', () => {
      if (checkbox.checked) {
        this.finish(true);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult(false);
    }
  }
}

class CosyVoiceReaderPlugin extends Plugin {
  async onload() {
    this.systemSpeechUnloaded = false;
    this.systemVoicesReady = false;
    this.systemVoices = [];
    this.sequence = 0;
    this.activeSession = null;
    this.currentAudio = null;
    this.currentProcess = null;
    this.currentRequests = new Set();
    this.lastMarkdownView = null;
    this.lastReadableFile = null;
    this.lastReadableSource = 'file';
    this.lastWebPageView = null;
    this.webPageObservers = new Map();
    this.webPageStates = new WeakMap();
    this.webReaderRange = null;
    this.webActionSequence = 0;
    this.lastPdfSelection = null;
    this.lastHtmlSelection = null;
    this.htmlSelectionObservers = new Map();
    this.htmlSelectionTimers = new Set();
    this.register(() => this.clearHtmlSelectionObservers());
    this.register(() => this.clearWebPageObservers());
    this.pendingAudioMerge = null;
    this.pauseRequested = false;
    this.readerState = createReaderState();
    this.readerViews = new Set();
    this.documentViews = new Set();
    this.documentModel = null;
    this.documentSequence = 0;
    this.vaultBasePath = null;
    this.cacheDir = null;
    this.legacyCacheDir = null;
    this.legacyLogPath = null;
    this.logPath = null;
    this.statusBar = this.addStatusBarItem();

    await this.loadSettings();
    await this.ensureCacheDir();

    this.registerView(VIEW_TYPE, (leaf) => new CosyVoiceReaderView(leaf, this));
    this.registerView(DOCUMENT_VIEW_TYPE, leaf => new AccessibleReaderView(leaf, this));
    this.nativeToolbars = new NativeToolbarManager(this);
    this.pdfHighlights = new PdfReadingHighlights(this);
    this.htmlHighlights = new HtmlReadingHighlights(this);
    this.register(() => this.htmlHighlights?.destroy());
    this.register(() => { this.nativeToolbars?.destroy(); this.pdfHighlights?.destroy(); });
    this.registerEvent(this.app.workspace.on('layout-change', () => this.nativeToolbars.sync()));
    this.registerEvent(this.app.workspace.on('file-open', () => {
      this.nativeToolbars.sync();
      this.runUserAction('Save reading position', () => this.saveSessionReadingPosition(this.activeSession));
    }));
    this.registerEvent(this.app.workspace.on('editor-change', editor => this.nativeToolbars.invalidate(editor)));
    if (this.app.metadataCache?.on) this.registerEvent(this.app.metadataCache.on('changed', file => this.nativeToolbars.changed(file)));
    this.app.workspace.onLayoutReady?.(() => { if (!this.systemSpeechUnloaded) this.nativeToolbars.sync(); });
    if (typeof this.registerEditorExtension === 'function' && typeof this.registerMarkdownPostProcessor === 'function') {
      this.noteHighlights = installNoteHighlights(this);
      this.register(() => this.noteHighlights?.dispose());
    }
    this.lastMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const initiallyActiveFile = typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
    if (isMarkdownFile(initiallyActiveFile) || isPdfFile(initiallyActiveFile) || isHtmlFile(initiallyActiveFile)) {
      this.lastReadableFile = initiallyActiveFile;
    }
    this.getCurrentWebPageView();
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const activeView = this.app.workspace.activeLeaf?.view;
        if (activeView?.getViewType?.() === DOCUMENT_VIEW_TYPE) {
          this.lastDocumentView = activeView; this.lastReadableSource = 'document';
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          this.lastMarkdownView = view;
        }
        const file = typeof this.app.workspace.getActiveFile === 'function'
          ? this.app.workspace.getActiveFile()
          : null;
        if (activeView?.getViewType?.() !== DOCUMENT_VIEW_TYPE && (isMarkdownFile(file) || isPdfFile(file) || isHtmlFile(file))) {
          this.lastReadableFile = file;
          this.lastReadableSource = 'file';
        }
        this.getCurrentWebPageView();
        this.observeHtmlSelections();
        this.observeWebPages();
        this.renderReaderViews();
      })
    );
    if (typeof document !== 'undefined') {
      this.registerDomEvent(document, 'selectionchange', () => {
        this.capturePdfSelection();
        this.captureWebReaderRange();
      });
    }
    if (typeof window !== 'undefined' && typeof this.registerInterval === 'function') {
      this.registerInterval(window.setInterval(() => {
        this.observeHtmlSelections();
        this.observeWebPages();
      }, 750));
      this.observeHtmlSelections();
      this.observeWebPages();
    }

    this.addRibbonIcon('volume-2', 'Open voice reader controls', () => {
      void this.runUserAction('Open voice reader', () => this.openPreferredReader());
    });
    this.register(() => clearAppearance(this));
    this.register(() => { this.pdfOutlineModal?.close(); this.pdfOutlineCache?.clear(); });
    this.register(() => this.copilotChatModal?.close());
    this.addCommand({
      id: 'read-copilot-chat', name: 'Read saved Copilot chat',
      callback: () => this.openCopilotChat(),
    });

    this.addCommand({
      id: 'pdf-outline-bookmarks', name: 'PDF outline and bookmarks',
      checkCallback: checking => {
        const file = this.getCurrentReadableFile();
        if (!isPdfFile(file)) return false;
        if (!checking) this.openPdfOutline(file);
        return true;
      },
    });

    this.addCommand({
      id: 'open-control-panel',
      name: 'Open voice reader controls',
      callback: () => {
        void this.activateControlView();
      },
    });

    this.addCommand({
      id: 'read-current-note',
      name: 'Read current note, PDF, HTML or web page aloud',
      callback: () => {
        void this.runUserAction('Read file', () => this.readCurrentNote());
      },
    });

    this.addCommand({
      id: 'open-reading-text',
      name: 'Toggle focus reading / Narrator document',
      callback: () => void this.runUserAction('Reading view', () => this.toggleDocumentView()),
    });
    this.addCommand({
      id: 'toggle-reading-toolbar', name: 'Toggle reading toolbar in current note, PDF, HTML or web page',
      callback: () => void this.runUserAction('Reading toolbar', () => this.toggleReadingToolbar()),
    });

    this.addCommand({
      id: 'export-current-note-audio',
      name: 'Export audio from current note, PDF, HTML or web page',
      checkCallback: (checking) => {
        if (!this.canExportCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction('Export audio', () => this.exportCurrentFileAudio({ insertAfterExport: false }));
        }
        return true;
      },
    });

    this.addCommand({
      id: 'export-current-note-audio-and-insert',
      name: 'Export audio from the current note and insert it',
      checkCallback: (checking) => {
        if (!this.canInsertAudioExportIntoCurrentNote()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction('Export and insert audio', () => this.exportCurrentFileAudio({ insertAfterExport: true }));
        }
        return true;
      },
    });

    this.addCommand({
      id: 'retry-audio-export-merge',
      name: 'Retry pending audio export merge only',
      checkCallback: (checking) => {
        if (!this.hasPendingAudioMerge()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction('Retry merge only', () => this.retryPendingAudioMerge());
        }
        return true;
      },
    });

    this.addCommand({
      id: 'resume-current-file',
      name: 'Resume reading current note, PDF or HTML',
      checkCallback: (checking) => {
        if (!this.canResumeCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.runUserAction('Resume reading', () => this.resumeCurrentFile());
        }
        return true;
      },
    });

    this.addCommand({
      id: 'read-current-pdf',
      name: 'Read current PDF aloud',
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === 'function'
          ? this.app.workspace.getActiveFile()
          : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdf(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'read-current-pdf-from-selection',
      name: 'Read current PDF from selection aloud',
      checkCallback: (checking) => {
        const file = typeof this.app.workspace.getActiveFile === 'function'
          ? this.app.workspace.getActiveFile()
          : null;
        if (!isPdfFile(file)) {
          return false;
        }
        if (!checking) {
          void this.readCurrentPdfFromSelection(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'read-selection',
      name: 'Read selection aloud',
      callback: () => {
        void this.runUserAction('Read selection', () => this.readSelection());
      },
    });

    this.addCommand({
      id: 'read-from-selection',
      name: 'Read from selection aloud',
      callback: () => {
        void this.runUserAction('Read from selection', () => this.readFromSelection());
      },
    });

    this.addCommand({
      id: 'pause-or-resume',
      name: 'Pause or resume voice reading',
      callback: () => {
        void this.pauseOrResume();
      },
    });

    this.addCommand({
      id: 'seek-backward-5-seconds',
      name: 'Seek backward 5 seconds',
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(-KEYBOARD_SEEK_SECONDS);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'seek-forward-5-seconds',
      name: 'Seek forward 5 seconds',
      checkCallback: (checking) => {
        if (!this.readerState.canSeek) {
          return false;
        }
        if (!checking) {
          this.seekCurrentAudioBySeconds(KEYBOARD_SEEK_SECONDS);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'previous-reading-chunk',
      name: 'Move to previous reading chunk',
      checkCallback: (checking) => {
        if (!this.readerState.canPreviousChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(-1);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'next-reading-chunk',
      name: 'Move to next reading chunk',
      checkCallback: (checking) => {
        if (!this.readerState.canNextChunk) {
          return false;
        }
        if (!checking) {
          this.jumpToAdjacentChunk(1);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'stop-reading',
      name: 'Stop voice reading',
      callback: () => {
        void this.stopReading();
      },
    });

    this.addSettingTab(new CosyVoiceReaderSettingTab(this.app, this));
    this.register(() => {
      void this.stopReading({ silent: true });
    });

    this.updateStatus('CosyVoice idle');
  }

  async onunload() {
    this.systemSpeechUnloaded = true;
    this.htmlHighlights?.destroy();
    this.nativeToolbars?.destroy(); this.pdfHighlights?.destroy();
    this.noteHighlights?.dispose();
    this.documentSequence = (this.documentSequence || 0) + 1;
    await Promise.resolve(this.documentExtraction?.pdfLoadingTask?.destroy?.()).catch(() => {});
    this.documentExtraction = null;
    this.documentModel = null;
    for (const leaf of this.app.workspace.getLeavesOfType?.(DOCUMENT_VIEW_TYPE) || []) leaf.detach?.();
    this.documentViews?.clear();
    this.systemVoiceController?.abort();
    this.webActionSequence = (this.webActionSequence || 0) + 1;
    this.clearWebPageObservers();
    this.lastWebPageView = null;
    this.webReaderRange = null;
    this.clearHtmlSelectionObservers();
    for (const timer of this.htmlSelectionTimers || []) clearTimeout(timer);
    if (this.htmlSelectionTimers) this.htmlSelectionTimers.clear();
    this.lastHtmlSelection = null;
    await this.stopReading({ silent: true });
    if (this.settings && this.settings.cleanupCache) {
      await this.discardPendingAudioMerge({ silent: true });
    }
  }

  async loadSettings() {
    const defaults = createDefaultSettings();
    const savedSettings = await this.loadData();
    const source = savedSettings && typeof savedSettings === 'object' ? savedSettings : {};
    const removedObsoleteSettings = Object.keys(source).some(
      (key) => !Object.prototype.hasOwnProperty.call(defaults, key)
    );
    const missingKnownSettings = Object.keys(defaults).some(
      (key) => !Object.prototype.hasOwnProperty.call(source, key)
    );
    const hadAzureCredentialSource = Object.prototype.hasOwnProperty.call(source, 'azureSpeechCredentialSource');
    const hadOpenRouterCredentialSource = Object.prototype.hasOwnProperty.call(source, 'openRouterCredentialSource');
    this.settings = selectKnownSettings(defaults, source);
    this.settings.readingHistoryMode = ['off', 'session', 'persistent'].includes(source.readingHistoryMode)
      ? source.readingHistoryMode : source.rememberReadingPosition === true ? 'persistent' : 'session';
    if (this.settings.readingHistoryMode !== 'persistent') this.settings.readingPositions = {};
    normalizeCopilotSettings(this.settings);
    normalizeAppearance(this.settings);
    this.settings.playbackVolume = normalizeVolume(this.settings.playbackVolume);
    this.settings.readingHighlight = normalizeReadingHighlight(this.settings.readingHighlight);
    this.settings.readingFollow = this.settings.readingFollow === true;
    this.settings.playbackSpeed = normalizeSpeed(this.settings.playbackSpeed);
    normalizeMimoSettings(this.settings);
    normalizeByokSettings(this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.systemVoiceWindows = normalizeSystemVoice(this.settings.systemVoiceWindows);
    this.settings.systemVoiceMac = normalizeSystemVoice(this.settings.systemVoiceMac);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = !hadAzureCredentialSource && String(source.azureSpeechKeyPath || '').trim()
      ? 'key-file'
      : normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || '').trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || '').trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = !hadOpenRouterCredentialSource && String(source.openRouterKeyPath || '').trim()
      ? 'key-file'
      : normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || '').trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || '').trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.scriptPath = String(this.settings.scriptPath || defaults.scriptPath);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(',');
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(',');
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    if (removedObsoleteSettings || missingKnownSettings
      || (this.settings.readingHistoryMode !== 'persistent' && Object.keys(source.readingPositions || {}).length)) {
      await this.saveData(settingsForStorage(this.settings));
    }
  }

  async saveSettings() {
    applyAppearance(this);
    this.settings.readingHighlight = normalizeReadingHighlight(this.settings.readingHighlight);
    this.settings.readingFollow = this.settings.readingFollow === true;
    this.settings = selectKnownSettings(createDefaultSettings(), this.settings);
    this.settings.readingHistoryMode = historyMode(this.settings);
    this.settings.smartQuickStart = this.settings.smartQuickStart !== false;
    this.settings.rapidQuickStart = this.settings.rapidQuickStart === true;
    normalizeCopilotSettings(this.settings);
    this.settings.playbackSpeed = normalizeSpeed(this.settings.playbackSpeed);
    this.settings.playbackVolume = normalizeVolume(this.settings.playbackVolume);
    normalizeMimoSettings(this.settings);
    normalizeByokSettings(this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    this.settings.systemVoiceWindows = normalizeSystemVoice(this.settings.systemVoiceWindows);
    this.settings.systemVoiceMac = normalizeSystemVoice(this.settings.systemVoiceMac);
    this.settings.azureSpeechCloud = normalizeAzureSpeechCloud(this.settings.azureSpeechCloud);
    this.settings.azureSpeechConsent = this.settings.azureSpeechConsent === true;
    this.settings.azureSpeechCredentialSource = normalizeCredentialSource(this.settings.azureSpeechCredentialSource);
    this.settings.azureSpeechKeyPath = String(this.settings.azureSpeechKeyPath || '').trim();
    this.settings.azureSpeechRegion = normalizeAzureSpeechRegion(this.settings.azureSpeechRegion);
    this.settings.azureSpeechSecretName = String(this.settings.azureSpeechSecretName || '').trim();
    this.settings.azureSpeechVoice = normalizeAzureSpeechVoice(this.settings.azureSpeechVoice);
    this.settings.edgeTtsConsent = this.settings.edgeTtsConsent === true;
    this.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);
    this.settings.edgeTtsVoice = normalizeEdgeTtsVoice(this.settings.edgeTtsVoice);
    this.settings.diagnosticLogging = this.settings.diagnosticLogging === true;
    this.settings.mathReadingLanguage = normalizeMathReadingLanguage(this.settings.mathReadingLanguage);
    this.settings.openRouterConsent = this.settings.openRouterConsent === true;
    this.settings.openRouterCredentialSource = normalizeCredentialSource(this.settings.openRouterCredentialSource);
    this.settings.openRouterKeyPath = String(this.settings.openRouterKeyPath || '').trim();
    this.settings.openRouterModel = normalizeOpenRouterModel(this.settings.openRouterModel);
    this.settings.openRouterSecretName = String(this.settings.openRouterSecretName || '').trim();
    this.settings.openRouterVoice = normalizeOpenRouterVoice(this.settings.openRouterVoice);
    this.settings.settingsLanguage = normalizeSettingsLanguage(this.settings.settingsLanguage);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(',');
    this.settings.onlineChunkLimits = parseChunkLimits(
      this.settings.onlineChunkLimits,
      DEFAULT_ONLINE_CHUNK_LIMITS
    ).join(',');
    this.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(this.settings.onlinePrefetchChunks);
    this.settings.readingPositions = normalizeReadingPositions(this.settings.readingPositions);
    this.settings.rememberReadingPosition = this.settings.rememberReadingPosition === true;
    await this.saveData(settingsForStorage(this.settings));
  }

  async resetSettingsToDefaults(page = 'all') {
    this.settings = resetPageSettings(this.settings, createDefaultSettings(), page);
    if (['engine', 'all'].includes(page) && this.activeSession?.speechEngine === 'byok-tts') await this.stopReading({ silent: true });
    if (this.currentAudio) {
      this.currentAudio.volume = this.settings.playbackVolume;
      this.currentAudio.playbackRate = this.settings.playbackSpeed;
      this.currentAudio.defaultPlaybackRate = this.settings.playbackSpeed;
    }
    await this.saveSettings();
    this.renderReaderViews();
  }

  async setSpeechSpeed(speed) {
    if (!this.settings) {
      this.settings = createDefaultSettings();
    }

    this.settings.speed = normalizeSpeed(speed);
    await this.saveSettings();
    this.renderReaderViews();
    return this.settings.speed;
  }

  async setPlaybackSpeed(value) {
    if (!this.settings) this.settings = createDefaultSettings();
    this.settings.playbackSpeed = normalizeSpeed(value);
    if (this.currentAudio) {
      this.currentAudio.preservesPitch = true;
      this.currentAudio.defaultPlaybackRate = this.settings.playbackSpeed;
      this.currentAudio.playbackRate = this.settings.playbackSpeed;
    }
    this.renderReaderViews();
    await this.saveSettings();
  }

  setPlaybackVolume(value) {
    if (!this.settings) this.settings = createDefaultSettings();
    this.settings.playbackVolume = normalizeVolume(value);
    if (this.currentAudio) this.currentAudio.volume = this.settings.playbackVolume;
    return this.settings.playbackVolume;
  }

  async ensureCacheDir() {
    const adapter = this.app.vault.adapter;

    if (!adapter || typeof adapter.getBasePath !== 'function') {
      throw new Error('Note and PDF Voice Reader requires the desktop FileSystemAdapter.');
    }

    this.vaultBasePath = adapter.getBasePath();
    this.legacyCacheDir = path.join(this.vaultBasePath, '.obsidian', 'plugins', PLUGIN_ID, 'cache');
    this.legacyLogPath = path.join(this.vaultBasePath, '.obsidian', 'plugins', PLUGIN_ID, 'last-error.log');
    this.cacheDir = getPluginTempCacheDir(this.vaultBasePath);
    this.logPath = path.join(this.cacheDir, 'diagnostic.log');
    await fs.promises.mkdir(this.cacheDir, { recursive: true });

    if (this.settings.cleanupCache) {
      await this.cleanupStaleTemporaryData();
    }
  }

  async cleanupOwnedFilesInDirectory(directoryPath) {
    if (!directoryPath) {
      return;
    }

    let entries;
    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !isOwnedCacheFileName(entry.name)) {
        continue;
      }

      try {
        await fs.promises.unlink(path.join(directoryPath, entry.name));
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          console.warn(`[${PLUGIN_ID}] Could not remove stale temporary file`, entry.name, error);
        }
      }
    }
  }

  async removeLegacyRuntimeLog() {
    if (!this.legacyLogPath) {
      return;
    }

    try {
      await fs.promises.unlink(this.legacyLogPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        console.warn(`[${PLUGIN_ID}] Could not remove legacy runtime log`, error);
      }
    }
  }

  async cleanupStaleTemporaryData() {
    await this.cleanupOwnedFilesInDirectory(this.cacheDir);
    await this.cleanupOwnedFilesInDirectory(this.legacyCacheDir);
    await this.removeLegacyRuntimeLog();

    if (this.legacyCacheDir) {
      try {
        await fs.promises.rmdir(this.legacyCacheDir);
      } catch (error) {
        if (!error || !['ENOENT', 'ENOTEMPTY'].includes(error.code)) {
          console.warn(`[${PLUGIN_ID}] Could not remove empty legacy cache directory`, error);
        }
      }
    }
  }

  async clearTemporaryData() {
    await this.stopReading({ silent: true });
    this.pdfOutlineModal?.close();
    this.pdfOutlineCache?.clear();
    this.pendingAudioMerge = null;
    await this.cleanupStaleTemporaryData();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).temporaryDataClearedNotice);
  }

  async activateControlView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice('CosyVoice: unable to open reader controls.');
        return null;
      }
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
      });
    }

    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  registerReaderView(view) {
    this.readerViews.add(view);
    view.render();
  }

  unregisterReaderView(view) {
    this.readerViews.delete(view);
  }

  renderReaderViews() {
    this.nativeToolbars?.render();
    for (const view of this.readerViews) {
      view.render();
    }
    this.renderDocumentViews();
  }

  registerDocumentView(view) {
    this.documentViews ||= new Set();
    this.documentViews.add(view);
    this.renderDocumentViews();
  }

  unregisterDocumentView(view) {
    this.documentViews?.delete(view);
    if (this.lastDocumentView === view) { this.lastDocumentView = null; this.lastReadableSource = 'file'; }
    if (!this.documentViews?.size) {
      this.documentSequence = (this.documentSequence || 0) + 1;
      void Promise.resolve(this.documentExtraction?.pdfLoadingTask?.destroy?.()).catch(() => {});
      this.documentModel = null;
    }
  }

  renderDocumentViews() {
    applyAppearance(this);
    this.noteHighlights?.update();
    this.pdfHighlights?.update();
    this.htmlHighlights?.update();
    if (!this.documentViews?.size) return;
    const session = this.activeSession;
    if (session && session.kind !== 'audio-export' && Array.isArray(session.chunks)) {
      if (this.documentModel?.speechSessionId !== session.id) this.documentModel = {
        label: session.sourceLabel, chunks: session.chunks, speechSessionId: session.id,
        markdownSource: session.markdownSource,
      };
      this.documentModel.partial = !session.productionComplete;
    }
    for (const view of this.documentViews) view.render();
  }

  async openPreferredReader() {
    const mode = this.settings.readerOpenMode;
    const view = this.getReadingToolbarView();
    if (mode !== 'sidebar' && view) {
      if (!this.nativeToolbars.toolbars.has(view)) this.nativeToolbars.toggle(view);
      if (mode === 'toolbar') { await this.app.workspace.revealLeaf(view.leaf); return; }
    }
    await this.activateControlView();
  }

  getCurrentReadingHighlight() {
    const session = this.activeSession, audio = this.currentAudio;
    if (!session || session.kind === 'audio-export' || session.seekTarget
      || Number.isInteger(session.requestedChunkIndex) || !['playing', 'paused'].includes(this.readerState.phase)) return null;
    const index = session.currentChunkIndex;
    if (!Number.isInteger(index)) return null;
    const sentence = audio?.noteReaderSessionId === session.id && audio.noteReaderChunkIndex === index
      ? sentenceAtTime(audio.noteReaderSentenceCues, audio.currentTime) : null;
    return { index, sentence };
  }

  async activateDocumentView(options = {}) {
    if (this.activeSession?.kind === 'audio-export') {
      new Notice(this.settings.settingsLanguage === 'chinese' ? '请等待音频导出完成后载入正文。' : 'Wait for audio export to finish before loading reading text.');
      return null;
    }
    const context = this.activeSession && this.activeSession.kind !== 'audio-export' ? null
      : this.getCurrentAudioExportContext({ notify: false, captureSelection: false });
    let leaf = this.app.workspace.getLeavesOfType(DOCUMENT_VIEW_TYPE)[0];
    if (!leaf) {
      const previous = this.app.workspace.getMostRecentLeaf?.() || this.app.workspace.activeLeaf;
      this.documentReturnLeaf = previous?.view?.getViewType?.() === VIEW_TYPE ? this.lastMarkdownView?.leaf : previous;
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: DOCUMENT_VIEW_TYPE, active: true });
    }
    this.documentTogglePending = false;
    this.app.workspace.revealLeaf(leaf);
    if (this.activeSession && this.activeSession.kind !== 'audio-export') {
      this.renderDocumentViews(); return leaf;
    }
    if (!options.reload && this.documentModel?.chunks.length && !this.documentModel.partial) { this.renderDocumentViews(); return leaf; }
    const sequence = this.documentSequence = (this.documentSequence || 0) + 1;
    await Promise.resolve(this.documentExtraction?.pdfLoadingTask?.destroy?.()).catch(() => {});
    if (sequence !== this.documentSequence || !this.app.workspace.getLeavesOfType(DOCUMENT_VIEW_TYPE).includes(leaf)) return null;
    const current = () => this.documentSequence === sequence && !this.systemSpeechUnloaded && !this.activeSession;
    const model = { label: context?.fileName || '', chunks: [], loading: true };
    this.documentModel = model; this.renderDocumentViews();
    const extraction = { pdfLoadingTask: null, speechStarted: true };
    this.documentExtraction = extraction;
    try {
      if (!context) throw new Error(this.settings.settingsLanguage === 'chinese'
        ? '请先打开笔记、文本型 PDF、HTML 或网页。' : 'Open a note, text-based PDF, HTML file or web page first.');
      let text;
      if (context.documentKind === 'pdf') {
        text = this.sanitizeAudioExportText(await this.extractPdfText(context.file, extraction, {
          reportProgress: false, isCurrent: current,
        }));
      } else if (context.documentKind === 'html') {
        text = this.prepareHtmlSpeechText(await this.getHtmlFileText(context.file));
      } else if (context.documentKind === 'web') {
        const web = await this.getWebPageContext(context.webView, { article: true });
        text = this.prepareHtmlSpeechText(web.documentText); model.label = web.fileName;
      } else {
        text = this.sanitizeAudioExportText(context.documentText);
        model.markdownSource = buildMarkdownSource(context.documentText, [], value => this.sanitizeAudioExportText(value), {
          filePath: context.file?.path,
        });
      }
      if (!current()) return leaf;
      if (!text?.trim()) throw new Error(this.settings.settingsLanguage === 'chinese' ? '没有可读取的正文。' : 'No readable text found.');
      model.chunks = splitTextForSpeechChunks(text, getChunkLimitsForSpeechEngine(this.settings, this.settings.speechEngine));
      if (model.markdownSource) model.markdownSource = buildMarkdownSource(context.documentText, model.chunks,
        value => this.sanitizeAudioExportText(value), { filePath: context.file?.path });
    } catch (error) {
      if (current()) model.error = messageFromError(error);
    } finally {
      if (this.documentExtraction === extraction) this.documentExtraction = null;
      if (current()) { model.loading = false; this.renderDocumentViews(); }
    }
    return leaf;
  }

  async toggleDocumentView() {
    if (this.documentTogglePending) return;
    this.documentTogglePending = true;
    try {
      const leaves = this.app.workspace.getLeavesOfType(DOCUMENT_VIEW_TYPE);
      if (!leaves.length) return await this.activateDocumentView();
      const returnLeaf = this.documentReturnLeaf;
      this.documentSequence = (this.documentSequence || 0) + 1;
      for (const leaf of leaves) leaf.detach();
      this.documentReturnLeaf = null;
      let attached = false;
      this.app.workspace.iterateAllLeaves?.(leaf => { if (leaf === returnLeaf) attached = true; });
      if (attached) await this.app.workspace.revealLeaf(returnLeaf);
      this.renderReaderViews();
      return null;
    } finally { this.documentTogglePending = false; }
  }

  getReadingToolbarView() {
    const web = this.getCurrentWebPageView();
    if (web) return web;
    const file = this.getCurrentReadableFile();
    if (isHtmlFile(file)) {
      const views = this.getHtmlReaderLeaves().map(leaf => leaf.view).filter(view => view.file?.path === file.path);
      return views.find(view => view === this.app.workspace.activeLeaf?.view) || views[0] || null;
    }
    if (isPdfFile(file)) {
      const views = this.app.workspace.getLeavesOfType('pdf').map(leaf => leaf.view).filter(view => view?.file?.path === file.path);
      return views.find(view => view === this.app.workspace.activeLeaf?.view) || views[0] || null;
    }
    const view = this.getActiveMarkdownView({ notify: false });
    return view?.file?.path === file?.path && file?.extension === 'md' ? view : null;
  }

  toggleReadingToolbar() {
    const view = this.getReadingToolbarView();
    if (view) this.nativeToolbars?.toggle(view);
    else new Notice(this.settings.settingsLanguage === 'chinese' ? '请先打开笔记、PDF、HTML 或网页。' : 'Open a note, PDF, HTML file or web page first.');
  }

  getCurrentDocumentView() {
    const active = this.app.workspace.activeLeaf?.view;
    if (active?.getViewType?.() === DOCUMENT_VIEW_TYPE) return active;
    return this.lastReadableSource === 'document' && this.documentViews?.has(this.lastDocumentView) ? this.lastDocumentView : null;
  }

  async readDocumentSelection(view, scope) {
    if (this.activeSession?.kind === 'audio-export') {
      new Notice(this.settings.settingsLanguage === 'chinese' ? '请等待音频导出完成。' : 'Wait for audio export to finish.'); return;
    }
    const context = view?.getSelectionContext();
    if (!context || !context.selectedText.trim()) {
      new Notice(this.settings.settingsLanguage === 'chinese' ? '请先在专注朗读正文中选中文字。' : 'Select text in Focus reading first.'); return;
    }
    if (scope === 'from-selection' && view.model?.partial) {
      new Notice(this.settings.settingsLanguage === 'chinese' ? '后续页面仍在解析，请等待正文完整后再从选中位置朗读。' : 'Wait for the remaining pages before reading from selection.'); return;
    }
    const text = scope === 'selection' ? context.selectedText : context.text.slice(context.startOffset);
    const focusDisplay = view.model?.markdownSource ? { source: view.model.markdownSource, text: context.text, offset: context.startOffset } : null;
    await this.startReading(text, view.model?.label || 'Focus reading', { plainText: true, focusDisplay });
  }

  captureMarkdownReadingSelection(view) {
    if (!view?.editor || !view.file) return null;
    const sourceText = view.editor.getValue();
    if (view.getMode?.() === 'preview') {
      const range = readerRange(view.contentEl);
      if (!range) return null;
      const offsets = this.noteHighlights?.selectionOffsets(view, range);
      return { sourceText, filePath: view.file.path, selectedText: range.toString(), start: offsets?.start ?? null, end: offsets?.end ?? null };
    }
    const selectedText = view.editor.getSelection();
    if (!selectedText?.trim()) return null;
    return { sourceText, filePath: view.file.path, selectedText,
      start: view.editor.posToOffset(view.editor.getCursor('from')), end: view.editor.posToOffset(view.editor.getCursor('to')) };
  }

  async readMarkdownView(view, scope = 'entire', cachedSelection = null) {
    if (!view?.editor || !isMarkdownFile(view.file)) return;
    const sourceText = view.editor.getValue(), file = view.file;
    let from = 0, to = sourceText.length;
    if (scope !== 'entire') {
      const selection = this.captureMarkdownReadingSelection(view) || cachedSelection;
      if (!selection || selection.filePath !== file.path || selection.sourceText !== sourceText) {
        new Notice(this.settings.settingsLanguage === 'chinese' ? '请在当前笔记中重新选择文字。' : 'Select text in the current note first.'); return;
      }
      if (scope === 'selection' && (!Number.isInteger(selection.start) || !Number.isInteger(selection.end))) {
        await this.startReading(selection.selectedText, file.basename || file.name, { plainText: true }); return;
      }
      if (!Number.isInteger(selection.start)) {
        new Notice(this.settings.settingsLanguage === 'chinese' ? '无法精确定位该选区，请切换到实时预览后重新选择起点。' : 'Unable to locate this selection precisely. Select the starting point in Live Preview.'); return;
      }
      from = selection.start; if (scope === 'selection') to = selection.end;
    }
    await this.startReading(sourceText.slice(from, to), file.basename || file.name, {
      file, sourceKind: 'markdown', sourceText, sourceOffset: from, skipReadingPosition: scope === 'selection',
    });
  }

  async readDocumentFrom(index) {
    const model = this.documentModel;
    if (!model || model.loading || !Number.isInteger(index) || !model.chunks[index]) return;
    if (this.activeSession?.id === model.speechSessionId) {
      const current = this.activeSession.currentChunkIndex || 0;
      if (index === current) this.seekCurrentSegmentToTime(0);
      else this.jumpToAdjacentChunk(index - current);
      return;
    }
    await this.startReading(model.chunks.slice(index).join('\n\n'), model.label, {
      plainText: true, readingChunks: model.chunks.slice(index),
      file: model.markdownSource?.filePath ? this.app.vault?.getAbstractFileByPath(model.markdownSource.filePath) : null,
      sourceKind: model.markdownSource ? 'markdown' : '',
      markdownSource: model.markdownSource ? { ...model.markdownSource, ranges: model.markdownSource.ranges.slice(index) } : null,
    });
  }

  setReaderState(patch) {
    this.readerState = createReaderState({
      ...this.readerState,
      ...patch,
    });
    this.renderReaderViews();
  }

  async runUserAction(label, action) {
    try {
      return await action();
    } catch (error) {
      const message = messageFromError(error);
      if (!this.activeSession) {
        this.updateStatus(`CosyVoice ${label} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
      }
      if (typeof this.writeRuntimeLog === 'function') {
        await this.writeRuntimeLog('failed', { message: `${label}: ${message}` });
      }
      new Notice(`CosyVoice ${label} failed: ${message}`, 10000);
      return null;
    }
  }

  capturePdfSelection() {
    if (typeof document === 'undefined' || typeof document.getSelection !== 'function') {
      return null;
    }

    const selection = document.getSelection();
    const selectedText = selection && typeof selection.toString === 'function'
      ? selection.toString().trim()
      : '';
    if (!selectedText) {
      return null;
    }

    const workspace = this.app && this.app.workspace;
    const leaves = workspace && typeof workspace.getLeavesOfType === 'function'
      ? workspace.getLeavesOfType('pdf')
      : [];
    const activeFile = workspace && typeof workspace.getActiveFile === 'function'
      ? workspace.getActiveFile()
      : null;
    const context = getPdfSelectionContext(selection, leaves, activeFile);
    this.lastPdfSelection = context;
    return context;
  }

  getPdfSelectionForFile(file) {
    const liveSelection = this.capturePdfSelection();
    const context = liveSelection || this.lastPdfSelection;
    return context && context.filePath === getPdfFileIdentity(file) && context.fileMtime === getFileMtime(file) ? context : null;
  }

  getHtmlReaderLeaves() {
    const workspace = this.app && this.app.workspace;
    return workspace && typeof workspace.getLeavesOfType === 'function'
      ? workspace.getLeavesOfType('html-view') || [] : [];
  }

  getWebPageLeaves() {
    const workspace = this.app && this.app.workspace;
    return workspace && typeof workspace.getLeavesOfType === 'function'
      ? workspace.getLeavesOfType(WEB_VIEW_TYPE) || [] : [];
  }

  getCurrentWebPageView() {
    const workspace = this.app && this.app.workspace;
    const active = workspace && workspace.activeLeaf && workspace.activeLeaf.view;
    if (isWebPageView(active)) {
      this.lastWebPageView = active;
      this.lastReadableSource = 'web';
      return active;
    }
    const isPanel = active && typeof active.getViewType === 'function' && active.getViewType() === VIEW_TYPE;
    if (!isPanel) {
      const file = workspace && typeof workspace.getActiveFile === 'function' && workspace.getActiveFile();
      if (file) { this.lastReadableSource = 'file'; return null; }
      if (active) return null;
    }
    return this.lastReadableSource === 'web' && this.getWebPageLeaves().some(leaf => leaf.view === this.lastWebPageView)
      ? this.lastWebPageView : null;
  }

  getWebPageState(view) {
    if (!this.webPageStates) this.webPageStates = new WeakMap();
    if (!this.webPageStates.has(view)) this.webPageStates.set(view, { revision: 0 });
    return this.webPageStates.get(view);
  }

  observeWebPages() {
    if (!this.webPageObservers) this.webPageObservers = new Map();
    const current = new Set();
    for (const { view } of this.getWebPageLeaves()) {
      const element = view && view.webview;
      if (!element || typeof element.addEventListener !== 'function') continue;
      current.add(element);
      if (this.webPageObservers.has(element)) continue;
      const invalidate = (event) => {
        if (event && event.isMainFrame === false) return;
        this.getWebPageState(view).revision += 1;
        if (this.webReaderRange && this.webReaderRange.view === view) this.webReaderRange = null;
      };
      const events = ['did-start-navigation', 'did-navigate-in-page', 'dom-ready', 'destroyed'];
      for (const event of events) element.addEventListener(event, invalidate);
      this.webPageObservers.set(element, () => {
        for (const event of events) element.removeEventListener(event, invalidate);
        invalidate();
      });
    }
    for (const [element, dispose] of this.webPageObservers) {
      if (!current.has(element)) { dispose(); this.webPageObservers.delete(element); }
    }
  }

  clearWebPageObservers() {
    for (const dispose of (this.webPageObservers || new Map()).values()) dispose();
    if (this.webPageObservers) this.webPageObservers.clear();
  }

  captureWebReaderRange() {
    const view = this.getCurrentWebPageView();
    if (!view || view.mode !== 'reader' || !view.readerView) return;
    const root = view.readerView;
    const selection = root.ownerDocument && root.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    // Retain only an in-memory range, not page text, when focus moves to the control panel.
    this.webReaderRange = { view, root, range: range.cloneRange(), url: getWebPageUrl(view),
      revision: this.getWebPageState(view).revision };
  }

  isWebPageContextCurrent(context) {
    return this.getCurrentWebPageView() === context.webView
      && this.getWebPageLeaves().some(leaf => leaf.view === context.webView)
      && context.webElement === context.webView.webview
      && context.webMode === context.webView.mode
      && getWebPageUrl(context.webView) === context.webUrl
      && this.getWebPageState(context.webView).revision === context.webRevision;
  }

  async getWebPageContext(view, options = {}) {
    this.observeWebPages();
    const context = {
      documentKind: 'web', webView: view, webUrl: getWebPageUrl(view),
      webElement: view.webview, webMode: view.mode, webRevision: this.getWebPageState(view).revision,
      file: { basename: 'web-page' }, fileName: 'Web page', hasSelection: false,
    };
    const cached = this.webReaderRange;
    const range = cached && cached.view === view && cached.root === view.readerView
      && cached.url === context.webUrl && cached.revision === context.webRevision ? cached.range : null;
    let snapshot;
    try { snapshot = await captureWebPage(view, { ...options, range, academic: academicOptions(this.settings) }); }
    catch (error) {
      const zh = this.settings.settingsLanguage === 'chinese';
      const timeout = error && error.message === 'WEB_TIMEOUT';
      throw new Error(zh
        ? timeout ? '网页文字提取超时，请等待页面加载完成后重试。' : '无法提取当前网页文字。请在 Obsidian Web viewer 中打开 HTTP/HTTPS 网页，等待加载完成后重试；也可切换阅读视图。'
        : timeout ? 'Web page extraction timed out. Wait for loading to finish and try again.'
          : 'Cannot extract this page. Open a loaded HTTP/HTTPS page in Obsidian Web viewer and try again, or switch to Reader view.');
    }
    if (!this.isWebPageContextCurrent(context)) throw new Error(this.settings.settingsLanguage === 'chinese'
      ? '网页已切换或关闭，请重新选择页面。' : 'The web page changed or closed. Select the page again.');
    return { ...context, fileName: snapshot.title, documentText: snapshot.text,
      hasSelection: Boolean(snapshot.selectionContext), selectionContext: snapshot.selectionContext };
  }

  async readCurrentWebPage(view, scope = 'entire') {
    const action = this.webActionSequence = (this.webActionSequence || 0) + 1;
    new Notice(this.settings.settingsLanguage === 'chinese' ? '正在提取当前网页文字…' : 'Extracting the current web page…', 3000);
    const context = await this.getWebPageContext(view, { article: scope === 'entire' });
    if (action !== this.webActionSequence) return;
    if (scope !== 'entire' && !context.hasSelection) {
      new Notice(this.settings.settingsLanguage === 'chinese'
        ? '请先在当前网页或阅读视图中选中文字。' : 'Select text in the current web page or Reader view first.', 8000);
      return;
    }
    const text = scope === 'entire' ? context.documentText : scope === 'selection'
      ? context.selectionContext.selectedText : context.selectionContext.text.slice(context.selectionContext.startOffset);
    await this.activateControlView();
    if (action !== this.webActionSequence || !this.isWebPageContextCurrent(context)) return;
    await this.startReading(text, `${context.fileName} (Web: ${getAudioExportScopeLabel(this.settings.settingsLanguage, scope)})`, {
      plainText: true, sourceKind: 'web', webContext: context,
    });
  }

  observeHtmlSelections() {
    if (!this.htmlSelectionObservers) this.htmlSelectionObservers = new Map();
    if (!this.htmlSelectionTimers) this.htmlSelectionTimers = new Set();
    const currentDocuments = new Set();
    for (const leaf of this.getHtmlReaderLeaves()) {
      const view = leaf && leaf.view;
      const doc = getHtmlReaderDocument(view);
      if (!isHtmlFile(view && view.file) || !doc || typeof doc.addEventListener !== 'function') continue;
      currentDocuments.add(doc);
      if (this.htmlSelectionObservers.has(doc)) continue;
      const filePath = getPdfFileIdentity(view.file);
      let timer = null;
      const capture = () => {
        if (timer) { clearTimeout(timer); this.htmlSelectionTimers.delete(timer); }
        timer = setTimeout(() => {
          this.htmlSelectionTimers.delete(timer);
          timer = null;
          if (getHtmlReaderDocument(view) !== doc || getPdfFileIdentity(view.file) !== filePath) return;
          const context = captureHtmlSelection(doc, filePath, getFileMtime(view.file));
          if (context) this.lastHtmlSelection = context;
        }, 100);
        this.htmlSelectionTimers.add(timer);
      };
      const events = ['selectionchange', 'mouseup', 'keyup'];
      for (const event of events) doc.addEventListener(event, capture);
      this.htmlSelectionObservers.set(doc, () => {
        for (const event of events) doc.removeEventListener(event, capture);
        if (timer) { clearTimeout(timer); this.htmlSelectionTimers.delete(timer); }
      });
    }
    for (const [doc, dispose] of this.htmlSelectionObservers) {
      if (!currentDocuments.has(doc)) { dispose(); this.htmlSelectionObservers.delete(doc); }
    }
  }

  clearHtmlSelectionObservers() {
    for (const dispose of (this.htmlSelectionObservers || new Map()).values()) dispose();
    if (this.htmlSelectionObservers) this.htmlSelectionObservers.clear();
  }

  getHtmlSelectionForFile(file) {
    const filePath = getPdfFileIdentity(file);
    for (const leaf of this.getHtmlReaderLeaves()) {
      const view = leaf && leaf.view;
      if (getPdfFileIdentity(view && view.file) !== filePath) continue;
      const context = captureHtmlSelection(getHtmlReaderDocument(view), filePath, getFileMtime(file));
      if (context) {
        this.lastHtmlSelection = context;
        return context;
      }
    }
    const context = this.lastHtmlSelection;
    return context && context.filePath === filePath && context.fileMtime === getFileMtime(file) ? context : null;
  }

  async getHtmlFileText(file) {
    if (file.stat && file.stat.size > MAX_HTML_BYTES) throw new Error('HTML file exceeds the 50 MiB size limit.');
    return extractHtmlText(await this.app.vault.cachedRead(file), academicOptions(this.settings));
  }

  prepareHtmlSpeechText(text, settings = this.settings) {
    return verbalizeNumericCitationsForSpeech(sanitizeLatexForSpeech(normalizeLineBreaks(text), academicOptions(settings))).trim();
  }

  async readCurrentHtml(file, scope = 'entire', options = {}) {
    let text;
    if (scope === 'entire') {
      text = await this.getHtmlFileText(file);
    } else {
      const context = this.getHtmlSelectionForFile(file);
      if (!context) {
        new Notice(normalizeSettingsLanguage(this.settings.settingsLanguage) === 'chinese'
          ? '请先在 HTML Reader 中选中文字，再使用选区朗读。'
          : 'Select text in HTML Reader before using a selection reading action.', 8000);
        return;
      }
      text = scope === 'selection' ? context.selectedText : context.text.slice(context.startOffset);
    }
    if (options.resumePosition) {
      const resumed = sliceOriginalTextFromReadingPosition(this.prepareHtmlSpeechText(text), options.resumePosition);
      if (!resumed.matched) {
        new Notice('Saved position changed. Read from the beginning or select a new starting point.', 8000);
        return;
      }
      text = resumed.text;
    }
    await this.activateControlView();
    await this.startReading(text, `${file.basename || file.name || 'HTML'} (HTML: ${getAudioExportScopeLabel(this.settings.settingsLanguage, scope)})`, {
      file, plainText: true, sourceKind: 'html', skipReadingPosition: scope === 'selection',
    });
  }

  getCurrentReadableFile() {
    if (this.getCurrentWebPageView()) return null;
    const workspace = this.app && this.app.workspace;
    const activeFile = workspace && typeof workspace.getActiveFile === 'function'
      ? workspace.getActiveFile()
      : null;
    if (activeFile) {
      if (isMarkdownFile(activeFile) || isPdfFile(activeFile) || isHtmlFile(activeFile)) {
        this.lastReadableFile = activeFile;
        this.lastReadableSource = 'file';
      }
      return activeFile;
    }
    return this.lastReadableSource === 'web' ? null : this.lastReadableFile || null;
  }

  findMarkdownViewForFile(file) {
    if (!isMarkdownFile(file)) {
      return null;
    }
    const targetPath = getPdfFileIdentity(file);
    const workspace = this.app && this.app.workspace;
    const candidates = [];
    if (workspace && typeof workspace.getActiveViewOfType === 'function') {
      candidates.push(workspace.getActiveViewOfType(MarkdownView));
    }
    candidates.push(this.lastMarkdownView);
    if (workspace && typeof workspace.getLeavesOfType === 'function') {
      const leaves = workspace.getLeavesOfType('markdown');
      for (const leaf of Array.isArray(leaves) ? leaves : []) {
        candidates.push(leaf && leaf.view);
      }
    }
    const view = candidates.find((candidate) => candidate
      && candidate.editor
      && getPdfFileIdentity(candidate.file) === targetPath);
    if (view) {
      this.lastMarkdownView = view;
    }
    return view || null;
  }

  getCurrentMarkdownContext(options = {}) {
    const notify = options.notify === true;
    const file = this.getCurrentReadableFile();
    const view = this.findMarkdownViewForFile(file);
    if (!file || !view) {
      if (notify) {
        new Notice('CosyVoice: open a Markdown note before using this action.', 8000);
      }
      return null;
    }
    return { file, view };
  }

  getActiveMarkdownView(options = {}) {
    const context = this.getCurrentMarkdownContext({ notify: options.notify === true });
    return context ? context.view : null;
  }

  getCurrentAudioExportContext(options = {}) {
    const notify = options.notify !== false;
    const webView = this.getCurrentWebPageView();
    if (webView) return { documentKind: 'web', webView, file: { basename: 'web-page' },
      fileName: 'Web page', hasSelection: false };
    const file = this.getCurrentReadableFile();
    if (isMarkdownFile(file)) {
      const view = this.findMarkdownViewForFile(file);
      if (!view || !view.editor) {
        if (notify) {
          new Notice('CosyVoice: open the Markdown note before exporting audio.', 8000);
        }
        return null;
      }
      const documentText = String(view.editor.getValue() || '');
      const selectionText = typeof view.editor.getSelection === 'function'
        ? String(view.editor.getSelection() || '')
        : '';
      const selectionStart = typeof view.editor.getCursor === 'function'
        ? view.editor.getCursor('from')
        : null;
      return {
        documentKind: 'markdown',
        documentText,
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || 'note',
        hasSelection: Boolean(selectionText.trim()),
        selectionStart,
        selectionText,
        view,
      };
    }
    if (isPdfFile(file)) {
      const selectionContext = this.getPdfSelectionForFile(file);
      return {
        documentKind: 'pdf',
        file,
        fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || 'PDF',
        hasSelection: Boolean(selectionContext && selectionContext.selectedText),
        selectionContext,
      };
    }
    if (isHtmlFile(file)) {
      const selectionContext = options.captureSelection === false ? null : this.getHtmlSelectionForFile(file);
      return {
        documentKind: 'html', file, fileMtime: getFileMtime(file),
        fileName: file.basename || file.name || 'HTML',
        hasSelection: Boolean(selectionContext && selectionContext.selectedText), selectionContext,
      };
    }
    if (notify) {
      new Notice('CosyVoice: open a Markdown note, text-based PDF or HTML file before exporting audio.', 8000);
    }
    return null;
  }

  canExportCurrentFile() {
    return Boolean(this.getCurrentAudioExportContext({ notify: false, captureSelection: false }));
  }

  canInsertAudioExportIntoCurrentNote() {
    const context = this.getCurrentAudioExportContext({ notify: false, captureSelection: false });
    return Boolean(context && context.documentKind === 'markdown');
  }

  canExportCurrentNote() {
    return this.canInsertAudioExportIntoCurrentNote();
  }

  getCurrentNoteExportContext() {
    return this.getCurrentMarkdownContext({ notify: true });
  }

  requestAudioExportScope(context) {
    const modal = new AudioExportScopeModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      context
    );
    return modal.openAndWait();
  }

  requestAudioExportConfirmation(summary) {
    const modal = new AudioExportConfirmModal(
      this.app,
      this.settings && this.settings.settingsLanguage,
      summary
    );
    return modal.openAndWait();
  }

  async getAudioExportTargetPlan(noteFile, extension, scope = 'entire') {
    const normalizedExtension = String(extension || '').trim().toLowerCase().replace(/^\./, '');
    if (!['mp3', 'wav'].includes(normalizedExtension)) {
      throw new Error('The selected speech engine returned an unsupported export format.');
    }
    const fileName = buildExportAudioFileName(
      noteFile && (noteFile.basename || noteFile.name) || 'note',
      normalizedExtension,
      normalizeAudioExportScope(scope)
    );
    const location = normalizeAudioExportLocation(
      this.settings && this.settings.audioExportLocation
    );
    let requestedPath = '';

    if (
      location === 'obsidian-attachment'
      && this.app.fileManager
      && typeof this.app.fileManager.getAvailablePathForAttachment === 'function'
    ) {
      requestedPath = await this.app.fileManager.getAvailablePathForAttachment(
        fileName,
        noteFile && noteFile.path
      );
    } else {
      let folder = '';
      if (location === 'custom-folder') {
        folder = normalizeAudioExportFolder(this.settings && this.settings.audioExportFolder);
        if (!folder) {
          throw new Error('Choose a valid custom audio folder in the plugin settings before exporting.');
        }
      } else {
        const noteFolder = path.posix.dirname(String(noteFile && noteFile.path || ''));
        folder = noteFolder && noteFolder !== '.' ? noteFolder : '';
      }
      requestedPath = folder ? `${folder}/${fileName}` : fileName;
    }

    return {
      location,
      targetPath: getAvailableVaultAudioPath(this.app.vault, requestedPath),
    };
  }

  async ensureAudioExportFolder(folderPath) {
    const normalizedFolder = normalizeAudioExportFolder(folderPath);
    if (!normalizedFolder) {
      return;
    }
    const vault = this.app && this.app.vault;
    if (
      !vault
      || typeof vault.getAbstractFileByPath !== 'function'
      || typeof vault.createFolder !== 'function'
    ) {
      throw new Error('This Obsidian version cannot create the custom audio export folder.');
    }

    let currentPath = '';
    for (const segment of normalizedFolder.split('/')) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = vault.getAbstractFileByPath(currentPath);
      if (existing) {
        if (!Array.isArray(existing.children)) {
          throw new Error(`Cannot create the audio export folder because ${currentPath} is a file.`);
        }
        continue;
      }
      try {
        await vault.createFolder(currentPath);
      } catch (error) {
        const concurrentlyCreated = vault.getAbstractFileByPath(currentPath);
        if (!concurrentlyCreated || !Array.isArray(concurrentlyCreated.children)) {
          throw error;
        }
      }
    }
  }

  async createVaultAudioAttachment(noteFile, temporaryAudioPath, extension, targetPlan = null) {
    if (!this.app.vault || typeof this.app.vault.createBinary !== 'function') {
      throw new Error('This Obsidian version cannot create binary attachments.');
    }

    const normalizedExtension = String(extension || '').trim().toLowerCase().replace(/^\./, '');
    const plan = targetPlan && targetPlan.targetPath
      ? {
        location: normalizeAudioExportLocation(targetPlan.location),
        targetPath: targetPlan.targetPath,
      }
      : await this.getAudioExportTargetPlan(noteFile, normalizedExtension);
    let targetPath = normalizeVaultRelativeAudioPath(plan.targetPath);
    if (!targetPath || path.posix.extname(targetPath).toLowerCase() !== `.${normalizedExtension}`) {
      throw new Error('Obsidian returned an invalid attachment path for the exported audio.');
    }
    if (
      typeof this.app.vault.getAbstractFileByPath === 'function'
      && this.app.vault.getAbstractFileByPath(targetPath)
    ) {
      targetPath = getAvailableVaultAudioPath(this.app.vault, targetPath);
    }
    if (plan.location === 'custom-folder') {
      const targetFolder = path.posix.dirname(targetPath);
      await this.ensureAudioExportFolder(targetFolder === '.' ? '' : targetFolder);
    }

    const audioBytes = await fs.promises.readFile(temporaryAudioPath);
    if (!audioBytes.length || audioBytes.length > MAX_EXPORTED_AUDIO_BYTES) {
      throw new Error(`The exported audio is empty or exceeds the ${Math.floor(MAX_EXPORTED_AUDIO_BYTES / (1024 * 1024))} MB safety limit.`);
    }
    return this.app.vault.createBinary(targetPath, bufferToArrayBuffer(audioBytes));
  }

  async insertAudioAttachmentIntoNote(noteFile, audioFile) {
    const generatedLink = this.app.fileManager
      && typeof this.app.fileManager.generateMarkdownLink === 'function'
      ? this.app.fileManager.generateMarkdownLink(audioFile, noteFile.path)
      : `[[${audioFile.path}]]`;
    const embed = generatedLink.startsWith('!') ? generatedLink : `!${generatedLink}`;
    const workspace = this.app && this.app.workspace;
    const activeView = workspace && typeof workspace.getActiveViewOfType === 'function'
      ? workspace.getActiveViewOfType(MarkdownView)
      : null;

    if (activeView && activeView.editor
      && getPdfFileIdentity(activeView.file) === getPdfFileIdentity(noteFile)) {
      activeView.editor.replaceRange(`\n${embed}\n`, activeView.editor.getCursor());
      return 'cursor';
    }

    if (this.app.vault && typeof this.app.vault.process === 'function') {
      await this.app.vault.process(noteFile, (content) => {
        const trimmed = String(content || '').replace(/\s*$/, '');
        return `${trimmed}${trimmed ? '\n\n' : ''}${embed}\n`;
      });
      return 'end';
    }

    throw new Error('The audio was exported, but the original note is no longer open and cannot be updated safely.');
  }

  getPendingAudioMerge() {
    const pending = this.pendingAudioMerge;
    const preparedPaths = pending && Array.isArray(pending.preparedPaths)
      ? pending.preparedPaths
      : [];
    const isValid = Boolean(
      pending
      && preparedPaths.length
      && preparedPaths.every((filePath) => (
        this.cacheDir
        && isInsideDirectory(filePath, this.cacheDir)
        && fs.existsSync(filePath)
      ))
    );
    if (!isValid) {
      this.pendingAudioMerge = null;
      return null;
    }
    return pending;
  }

  hasPendingAudioMerge() {
    return Boolean(this.getPendingAudioMerge());
  }

  preservePendingAudioMerge(job, session) {
    const preparedPaths = Array.isArray(job && job.preparedPaths)
      ? job.preparedPaths.filter((filePath) => (
        this.cacheDir
        && isInsideDirectory(filePath, this.cacheDir)
        && fs.existsSync(filePath)
      ))
      : [];
    if (!preparedPaths.length) {
      return false;
    }
    this.pendingAudioMerge = {
      ...job,
      preparedPaths: preparedPaths.slice(),
    };
    if (session) {
      session.preservedAudioPaths = preparedPaths.slice();
    }
    this.renderReaderViews();
    return true;
  }

  async discardPendingAudioMerge(options = {}) {
    const pending = this.pendingAudioMerge;
    this.pendingAudioMerge = null;
    const paths = pending
      ? [
        ...(Array.isArray(pending.preparedPaths) ? pending.preparedPaths : []),
        pending.temporaryOutputPath,
      ].filter(Boolean)
      : [];
    for (const filePath of paths) {
      await this.removeTempFile(filePath);
    }
    this.renderReaderViews();
    if (!options.silent && pending) {
      new Notice('CosyVoice: kept export segments were removed.');
    }
  }

  createAudioMergeRetryError(error, segmentCount, stage = 'merge') {
    const action = stage === 'merge' ? 'Audio merging' : 'Audio export finalization';
    const retryError = new Error(
      `${action} failed: ${messageFromError(error)} ` +
      `${segmentCount} synthesized segments were kept locally. Use "Retry merge only"; ` +
      'it reuses those files and does not call the TTS API again.'
    );
    retryError.code = 'AUDIO_MERGE_RETRY_AVAILABLE';
    retryError.cause = error;
    return retryError;
  }

  async finalizeMergedAudioExport(job, merged, session) {
    const audioFile = await this.createVaultAudioAttachment(
      job.context.file,
      job.temporaryOutputPath,
      job.extension,
      job.exportPlan
    );
    if (!this.isActive(session)) {
      new Notice(`CosyVoice: the completed audio was saved to ${audioFile.path} after export was stopped.`, 10000);
      return audioFile;
    }

    let insertionLocation = '';
    let insertionError = null;
    if (job.insertAfterExport) {
      try {
        insertionLocation = await this.insertAudioAttachmentIntoNote(job.context.file, audioFile);
      } catch (error) {
        insertionError = error;
      }
    }

    this.updateStatus(`${job.configuration.engineLabel} audio export complete`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: false,
      currentChunk: job.preparedPaths.length,
      currentText: audioFile.path,
      error: insertionError ? messageFromError(insertionError) : '',
      isPaused: false,
      phase: 'complete',
      progress: 1,
      status: 'complete',
      totalChunks: job.preparedPaths.length,
    });
    await this.writeRuntimeLog('audio-export-complete', {
      bytes: merged.bytes,
      chunks: job.preparedPaths.length,
      documentKind: job.context.documentKind,
      inserted: Boolean(insertionLocation),
      scope: job.scope,
    });
    this.activeSession = null;

    const insertedMessage = insertionLocation === 'cursor'
      ? ' and inserted at the current cursor'
      : insertionLocation === 'end'
        ? ' and appended to the original note'
        : '';
    if (insertionError) {
      new Notice(
        `CosyVoice: audio was exported to ${audioFile.path}, but it could not be inserted: ${messageFromError(insertionError)}`,
        12000
      );
    } else {
      new Notice(`CosyVoice: exported ${audioFile.path}${insertedMessage}.`, 10000);
    }
    return audioFile;
  }

  async retryPendingAudioMerge() {
    const job = this.getPendingAudioMerge();
    if (!job) {
      new Notice('CosyVoice: no synthesized export segments are available for merge retry.', 6000);
      this.renderReaderViews();
      return null;
    }

    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const segmentCount = job.preparedPaths.length;
    const session = this.createSpeechSession(
      Array.from({ length: segmentCount }, () => 'kept audio segment'),
      job.sourceLabel,
      job.configuration,
      {
        file: job.context.file,
        kind: 'audio-export',
        sourceKind: job.context.documentKind,
      }
    );
    session.files.push(...job.preparedPaths, job.temporaryOutputPath);
    this.activeSession = session;
    this.updateStatus(`${job.configuration.engineLabel} retrying merge`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: segmentCount,
      currentText: `Combining ${segmentCount} kept synthesized segments without new TTS requests...`,
      error: '',
      isPaused: false,
      phase: 'synthesizing',
      progress: 0.99,
      source: job.sourceLabel,
      status: 'running',
      totalChunks: segmentCount,
    });
    new Notice(
      `CosyVoice: retrying the merge from ${segmentCount} kept segments. No TTS API request will be made.`,
      8000
    );

    try {
      const merged = await mergeAudioFiles(
        job.preparedPaths,
        job.temporaryOutputPath,
        job.extension
      );
      if (!this.isActive(session)) {
        throw new Error('Audio export stopped.');
      }
      const audioFile = await this.finalizeMergedAudioExport(job, merged, session);
      this.pendingAudioMerge = null;
      this.renderReaderViews();
      return audioFile;
    } catch (error) {
      if (this.isActive(session)) {
        this.preservePendingAudioMerge(job, session);
        const retryError = error && error.code === 'AUDIO_MERGE_RETRY_AVAILABLE'
          ? error
          : this.createAudioMergeRetryError(error, segmentCount, 'merge');
        const message = messageFromError(retryError);
        this.updateStatus(`${job.configuration.engineLabel} merge retry error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
        await this.writeRuntimeLog('failed', { message });
        new Notice(`CosyVoice merge retry failed: ${message}`, 12000);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths,
        });
      }
    }
  }

  sanitizeAudioExportText(value, settings = this.settings) {
    return settings.stripMarkdown
      ? sanitizeTextForSpeech(value, academicOptions(settings))
      : normalizeLineBreaks(value).trim();
  }

  isAudioExportContextCurrent(context) {
    if (context.documentKind === 'web') return this.isWebPageContextCurrent(context);
    const currentFile = this.getCurrentReadableFile();
    if (!currentFile || getPdfFileIdentity(currentFile) !== getPdfFileIdentity(context.file)) {
      return false;
    }
    if (context.documentKind === 'markdown') {
      const view = this.findMarkdownViewForFile(currentFile);
      return Boolean(view && view.editor && String(view.editor.getValue() || '') === context.documentText);
    }
    return getFileMtime(currentFile) === context.fileMtime;
  }

  async extractPdfAudioExportText(context, scope, configuration) {
    await this.activateControlView();
    await this.stopReading({ silent: true, preservePendingActions: true });
    this.pauseRequested = false;

    const sourceLabel = `${context.fileName} (PDF export preparation)`;
    const session = this.createSpeechSession([], sourceLabel, configuration, {
      file: context.file,
      kind: 'audio-export',
      sourceKind: 'pdf',
    });
    this.activeSession = session;
    this.updateStatus('PDF export preparation', {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: scope === 'from-selection'
        ? `Extracting PDF from page ${context.selectionContext.pageNumber}...`
        : 'Extracting complete PDF text...',
      error: '',
      isPaused: false,
      phase: 'extracting PDF',
      progress: 0,
      source: sourceLabel,
      status: 'running',
      totalChunks: 0,
    });

    try {
      const selectionContext = scope === 'from-selection' ? context.selectionContext : null;
      const extractedText = await this.extractPdfText(context.file, session, {
        reportProgress: true,
        selectedText: selectionContext ? selectionContext.selectedText : '',
        selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
        startPageNumber: selectionContext ? selectionContext.pageNumber : 1,
      });
      if (!this.isActive(session)) {
        return null;
      }
      if (selectionContext && session.pdfSelectionMatched === false) {
        throw new Error('The selected PDF position could not be matched reliably. Select a slightly longer phrase and try again.');
      }
      const text = this.sanitizeAudioExportText(extractedText);
      if (!text) {
        throw new Error('No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.');
      }
      this.updateStatus('PDF export preparation complete', {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: false,
        currentText: previewText(text),
        isPaused: false,
        phase: 'complete',
        progress: 1,
        status: 'complete',
      });
      session.stopped = true;
      this.activeSession = null;
      return text;
    } catch (error) {
      if (this.isActive(session)) {
        const message = getPdfExtractionErrorMessage(error);
        this.updateStatus('PDF export preparation error', {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
        await this.writeRuntimeLog('failed', { message });
        new Notice(`CosyVoice PDF export failed: ${message}`, 10000);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }

  async exportCurrentFileAudio(options = {}) {
    if (this.audioExportActionRunning) {
      new Notice(this.settings.settingsLanguage === 'chinese'
        ? '已有音频导出正在准备或进行，请先完成或取消。' : 'An audio export is already being prepared or running. Finish or cancel it first.', 6000);
      return null;
    }
    this.audioExportActionRunning = true;
    const actionToken = this.webActionSequence = (this.webActionSequence || 0) + 1;
    try { return await this.exportCurrentFileAudioOnce({ ...options, actionToken }); }
    finally { this.audioExportActionRunning = false; }
  }

  async exportCurrentFileAudioOnce(options = {}) {
    if (this.hasPendingAudioMerge()) {
      new Notice(
        'CosyVoice: a previous export is waiting for "Retry merge only". Retry it first, or use Clear temporary data in settings to discard the kept segments.',
        12000
      );
      return null;
    }
    let context = this.getCurrentAudioExportContext({ notify: true });
    if (!context) {
      return null;
    }
    if (context.documentKind === 'web') context = await this.getWebPageContext(context.webView);
    if (options.actionToken !== this.webActionSequence) return null;
    if (options.expectedDocumentKind && context.documentKind !== options.expectedDocumentKind) {
      new Notice('CosyVoice: open a Markdown note before using this action.', 8000);
      return null;
    }

    const insertAfterExport = options.insertAfterExport === true;
    if (insertAfterExport && context.documentKind !== 'markdown') {
      new Notice('CosyVoice: PDF or HTML audio can be saved as an attachment. Inserting audio is available for Markdown notes only.', 8000);
      return null;
    }

    const scope = Object.prototype.hasOwnProperty.call(options, 'scope')
      ? normalizeAudioExportScope(options.scope)
      : await this.requestAudioExportScope(context);
    if (!scope) {
      return null;
    }
    if (options.actionToken !== this.webActionSequence) return null;
    if (scope !== 'entire' && !context.hasSelection) {
      new Notice('CosyVoice: select text before using the selected-text export scopes.', 8000);
      return null;
    }

    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return null;
    }
    const extension = getAudioExportExtension(configuration.speechEngine);
    const exportPlan = await this.getAudioExportTargetPlan(context.file, extension, scope);
    let text = '';
    if (context.documentKind === 'markdown') {
      text = this.sanitizeAudioExportText(selectMarkdownAudioExportText(
        context.documentText,
        context.selectionText,
        context.selectionStart,
        scope
      ));
    } else if (context.documentKind === 'web') {
      text = this.prepareHtmlSpeechText(scope === 'entire' ? context.documentText
        : scope === 'selection' ? context.selectionContext.selectedText
          : context.selectionContext.text.slice(context.selectionContext.startOffset));
    } else if (context.documentKind === 'html') {
      const htmlText = scope === 'entire' ? await this.getHtmlFileText(context.file)
        : scope === 'selection' ? context.selectionContext.selectedText
          : context.selectionContext.text.slice(context.selectionContext.startOffset);
      text = this.prepareHtmlSpeechText(htmlText);
    } else if (scope === 'selection') {
      text = this.sanitizeAudioExportText(context.selectionContext.selectedText);
    } else {
      text = await this.extractPdfAudioExportText(context, scope, configuration);
      if (!text) {
        return null;
      }
    }

    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    if (!text || !chunks.length) {
      new Notice('CosyVoice: nothing readable in the selected export scope.', 6000);
      return null;
    }
    const summary = createAudioExportSummary({
      chunkCount: chunks.length,
      documentKind: context.documentKind,
      engineLabel: configuration.engineLabel,
      fileName: context.fileName,
      insertAfterExport,
      scope,
      speechEngine: configuration.speechEngine,
      targetPath: exportPlan.targetPath,
      textLength: text.length,
    });
    if (!await this.requestAudioExportConfirmation(summary)) {
      return null;
    }
    if (options.actionToken !== this.webActionSequence) return null;
    if (!this.isAudioExportContextCurrent(context)) {
      new Notice('CosyVoice: the active file changed while export was being prepared. Start again to review a new estimate.', 8000);
      return null;
    }

    await this.activateControlView();
    if (options.actionToken !== this.webActionSequence || !this.isAudioExportContextCurrent(context)) return null;
    await this.stopReading({ silent: true });
    this.pauseRequested = false;
    const sourceLabel = `${context.fileName} (${getAudioExportScopeLabel('english', scope)} audio export)`;
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: context.file,
      kind: 'audio-export',
      sourceKind: context.documentKind,
    });
    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} export 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: '',
      isPaused: false,
      phase: 'queued',
      progress: 0,
      source: sourceLabel,
      status: 'running',
      totalChunks: chunks.length,
    });
    await this.writeRuntimeLog('audio-export-start', {
      chunks: chunks.length,
      documentKind: context.documentKind,
      insertAfterExport,
      scope,
      textLength: text.length,
    });
    new Notice(`${configuration.engineLabel}: exporting ${chunks.length} audio segments.`, 6000);

    const temporaryOutputPath = path.join(
      this.cacheDir,
      `${Date.now()}-${session.id}-export.${extension}`
    );
    session.files.push(temporaryOutputPath);
    const preparedPaths = [];
    let exportStage = 'synthesis';
    let synthesisComplete = false;
    const createMergeJob = () => ({
      configuration: {
        engineLabel: configuration.engineLabel,
        prefetchChunks: 0,
        speechEngine: configuration.speechEngine,
      },
      context: {
        documentKind: context.documentKind,
        file: context.file,
        fileName: context.fileName,
      },
      exportPlan: { ...exportPlan },
      extension,
      insertAfterExport,
      preparedPaths: preparedPaths.slice(),
      scope,
      sourceLabel,
      temporaryOutputPath,
    });

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (!this.isActive(session)) {
          throw new Error('Audio export stopped.');
        }
        session.currentChunkIndex = index;
        const prepared = await this.prepareChunk(chunks[index], index, session);
        preparedPaths.push(prepared.outputPath);
      }
      synthesisComplete = preparedPaths.length === chunks.length;
      if (!this.isActive(session)) {
        throw new Error('Audio export stopped.');
      }

      exportStage = 'merge';
      this.updateStatus(`${configuration.engineLabel} merging audio`, {
        canPause: false,
        canNextChunk: false,
        canPreviousChunk: false,
        canSeek: false,
        canStop: true,
        currentChunk: chunks.length,
        currentText: `Combining ${chunks.length} synthesized segments...`,
        isPaused: false,
        phase: 'synthesizing',
        progress: 0.99,
        status: 'running',
        totalChunks: chunks.length,
      });
      const merged = await mergeAudioFiles(preparedPaths, temporaryOutputPath, extension);
      if (!this.isActive(session)) {
        throw new Error('Audio export stopped.');
      }
      exportStage = 'finalization';
      return await this.finalizeMergedAudioExport(createMergeJob(), merged, session);
    } catch (error) {
      if (this.isActive(session)) {
        let reportedError = error;
        if (synthesisComplete && preparedPaths.length === chunks.length) {
          const mergeJob = createMergeJob();
          if (this.preservePendingAudioMerge(mergeJob, session)) {
            reportedError = this.createAudioMergeRetryError(
              error,
              preparedPaths.length,
              exportStage === 'merge' ? 'merge' : 'finalization'
            );
          }
        }
        const message = messageFromError(reportedError);
        this.updateStatus(`${configuration.engineLabel} audio export error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
        await this.writeRuntimeLog('failed', { message });
        new Notice(`CosyVoice audio export failed: ${message}`, 10000);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
        this.renderReaderViews();
      }
      return null;
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session, {
          preservePaths: session.preservedAudioPaths,
        });
      }
    }
  }

  async exportCurrentNoteAudio(options = {}) {
    return this.exportCurrentFileAudio({
      ...options,
      expectedDocumentKind: 'markdown',
      scope: Object.prototype.hasOwnProperty.call(options, 'scope') ? options.scope : 'entire',
    });
  }

  async readCurrentNote() {
    const webView = this.getCurrentWebPageView();
    if (webView) { await this.readCurrentWebPage(webView); return; }
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile);
      return;
    }
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdf(activeFile);
      return;
    }

    if (!isMarkdownFile(activeFile)) {
      new Notice('CosyVoice: open a Markdown note, PDF or HTML file before reading.', 8000);
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }

    await this.activateControlView();
    await this.startReading(
      view.editor.getValue(),
      view.file?.basename || 'note',
      { file: view.file, sourceKind: 'markdown' }
    );
  }

  getSavedReadingPosition(file) {
    const filePath = getPdfFileIdentity(file);
    if (!filePath || !this.settings || historyMode(this.settings) === 'off') {
      return null;
    }
    return normalizeReadingPositions(this.settings.readingPositions)[filePath] || null;
  }

  canResumeCurrentFile() {
    const file = this.getCurrentReadableFile();
    return Boolean(this.getSavedReadingPosition(file));
  }

  async resumeCurrentFile() {
    if (!this.settings || historyMode(this.settings) === 'off') {
      new Notice('CosyVoice: enable Remember reading position in the plugin settings first.', 8000);
      return;
    }
    const file = this.getCurrentReadableFile();
    const position = this.getSavedReadingPosition(file);
    if (!file || !position) {
      new Notice('CosyVoice: no saved reading position for the current file.', 6000);
      return;
    }

    if (this.activeSession?.filePath === position.filePath && this.currentAudio) {
      if (this.pauseRequested || this.currentAudio.paused) await this.pauseOrResume();
      return;
    }

    if (isHtmlFile(file)) {
      await this.readCurrentHtml(file, 'entire', { resumePosition: position });
      return;
    }
    if (isPdfFile(file)) {
      if (position.fileMtime && getFileMtime(file) !== position.fileMtime) {
        new Notice('PDF changed. Select a new starting point before reading.', 8000);
        return;
      }
      await this.readCurrentPdf(file, { resumePosition: position });
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view || getPdfFileIdentity(view.file) !== position.filePath) {
      new Notice('CosyVoice: open the saved note before resuming.', 6000);
      return;
    }
    const rawText = view.editor.getValue();
    const clean = value => normalizeAnchorText(this.settings.stripMarkdown
      ? sanitizeTextForSpeech(value, academicOptions(this.settings)) : normalizeLineBreaks(value).trim());
    const fullText = clean(rawText);
    let resumeSlice = sliceTextFromReadingPosition(fullText, position);
    if (!resumeSlice.matched) {
      new Notice(this.settings.settingsLanguage === 'chinese'
        ? '原朗读位置已变化，无法可靠定位。请从头朗读或重新选择起点。'
        : 'The saved position changed. Read from the beginning or select a new starting point.', 8000);
      return;
    }
    if (!resumeSlice.text) {
      new Notice('CosyVoice: the saved position is no longer readable.', 6000);
      return;
    }
    const configuration = this.getSpeechConfiguration();
    if (!configuration) return;
    const readingChunks = splitTextForSpeechChunks(resumeSlice.text, configuration.chunkLimits);
    const markdownSource = buildMarkdownSource(rawText,
      [fullText.slice(0, resumeSlice.offset), ...readingChunks], clean, { filePath: file.path });
    if (markdownSource) markdownSource.ranges.shift();
    await this.activateControlView();
    await this.startReading(resumeSlice.text, `${file.basename || file.name || 'note'} (resumed)`, {
      file,
      sourceKind: 'markdown',
      readingChunks,
      markdownSource,
    });
  }

  async clearReadingPositions() {
    this.settings.readingPositions = {};
    await this.saveSettings();
    this.renderReaderViews();
    new Notice(getSettingsUiText(this.settings.settingsLanguage).positionsClearedNotice);
  }

  async saveSessionReadingPosition(session) {
    if (
      !session
      || !this.settings
      || historyMode(this.settings) === 'off'
      || !session.filePath
      || session.skipReadingPosition
      || session.kind === 'audio-export'
      || !['markdown', 'pdf', 'html'].includes(session.sourceKind)
      || !session.chunks.length
      || !Number.isInteger(session.currentChunkIndex)
    ) {
      return false;
    }
    let chunkIndex = Math.max(0, Math.min(session.chunks.length - 1, session.currentChunkIndex));
    if (session.lastCompletedChunkIndex === chunkIndex && chunkIndex + 1 < session.chunks.length) {
      chunkIndex += 1;
    }
    const anchor = createReadingAnchor(session.chunks[chunkIndex]);
    if (!anchor) {
      return false;
    }
    this.settings.readingPositions = upsertReadingPosition(this.settings.readingPositions, {
      anchor,
      audioTime: this.activeSession === session && this.currentAudio ? this.currentAudio.currentTime : 0,
      partIndex: session.currentPartIndex || 0,
      chunkIndex,
      fileMtime: session.fileMtime,
      filePath: session.filePath,
      kind: session.sourceKind,
      pageNumber: session.sourceKind === 'pdf'
        ? ((Array.isArray(session.chunkPageNumbers) && session.chunkPageNumbers[chunkIndex]) || 1)
        : null,
      updatedAt: Date.now(),
    });
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }

  async clearSessionReadingPosition(session) {
    if (!session || !session.filePath || !this.settings || historyMode(this.settings) === 'off') {
      return false;
    }
    const current = normalizeReadingPositions(this.settings.readingPositions);
    if (!current[session.filePath]) {
      return false;
    }
    this.settings.readingPositions = removeReadingPosition(current, session.filePath);
    await this.saveSettings();
    this.renderReaderViews();
    return true;
  }

  async readCurrentPdfFromSelection(pdfFile = null) {
    const file = pdfFile || (
      typeof this.app.workspace.getActiveFile === 'function'
        ? this.app.workspace.getActiveFile()
        : null
    );
    if (!isPdfFile(file)) {
      new Notice('CosyVoice: no active PDF file.');
      return;
    }

    const selectionContext = this.getPdfSelectionForFile(file);
    if (!selectionContext) {
      new Notice('CosyVoice PDF: select text in the PDF first, then try again.', 8000);
      return;
    }

    await this.readCurrentPdf(file, { selectionContext });
  }

  getSpeechConfiguration() {
    const speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
    const engineLabel = getSpeechEngineLabel(this.settings);
    const scriptPath = String(this.settings.scriptPath || '').trim();
    if (speechEngine === 'byok-tts') {
      const profile = getByokProfile(this.settings);
      const error = getByokConfigurationError(profile)
        || getRemoteCredentialConfigurationError(profile, this.vaultBasePath, this.app, 'BYOK API');
      if (error) { new Notice(error, 10000); return null; }
    }
    if (speechEngine === 'system-tts' && !['win32', 'darwin'].includes(os.platform())) {
      new Notice(this.settings.settingsLanguage === 'chinese'
        ? '系统本地语音目前仅支持 Windows 和 macOS。' : systemSpeechError('unavailable').message, 8000);
      return null;
    }
    if (speechEngine === 'mimo-tts') {
      if (this.settings.mimoConsent !== true) {
        new Notice('MiMo TTS: enable online processing consent in settings before reading. Text is sent to Xiaomi; ZDR is not confirmed.', 10000);
        return null;
      }
      const error = getRemoteCredentialConfigurationError({
        credentialSource: this.settings.mimoCredentialSource,
        secretName: this.settings.mimoSecretName,
        keyPath: this.settings.mimoKeyPath,
      }, this.vaultBasePath, this.app, 'MiMo API');
      if (error) {
        new Notice(`MiMo TTS: ${error}`, 10000);
        return null;
      }
    }
    if (speechEngine === 'edge-tts' && !hasEdgeTtsConsent(this.settings)) {
      new Notice('Edge TTS sends text to Microsoft. Enable online processing consent in the plugin settings before reading.', 10000);
      return null;
    }
    if (speechEngine === 'azure-speech' && !hasAzureSpeechConsent(this.settings)) {
      new Notice('Azure Speech sends text to your Microsoft Azure Speech resource. Enable Azure online processing consent before reading.', 10000);
      return null;
    }
    if (speechEngine === 'azure-speech') {
      const configurationError = getAzureSpeechConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`Azure Speech: ${configurationError}`, 10000);
        return null;
      }
    }
    if (speechEngine === 'openrouter-tts' && !hasOpenRouterConsent(this.settings)) {
      new Notice('OpenRouter TTS sends text to OpenRouter and an eligible upstream provider. Enable OpenRouter online processing consent before reading.', 10000);
      return null;
    }
    if (speechEngine === 'openrouter-tts') {
      const configurationError = getOpenRouterConfigurationError(this.settings, this.vaultBasePath, this.app);
      if (configurationError) {
        new Notice(`OpenRouter TTS: ${configurationError}`, 10000);
        return null;
      }
    }
    if (speechEngine === 'local-cosyvoice' && (!scriptPath || !fs.existsSync(scriptPath))) {
      new Notice(`CosyVoice: script not found: ${scriptPath || '(empty)'}`, 8000);
      return null;
    }

    return {
      chunkLimits: getChunkLimitsForSpeechEngine(this.settings, speechEngine),
      byokProfile: speechEngine === 'byok-tts' ? { ...getByokProfile(this.settings) } : null,
      engineLabel,
      prefetchChunks: getSynthesisPrefetchCount(this.settings, speechEngine),
      speechEngine,
      systemVoice: normalizeSystemVoice(this.settings[getSystemVoiceKey()]),
    };
  }

  createSpeechSession(chunks, sourceLabel, configuration, options = {}) {
    if (configuration.byokProfile) assertByokAuthorized(configuration.byokProfile, this.settings);
    const initialChunks = Array.isArray(chunks) ? chunks.slice() : [];
    const id = ++this.sequence;
    return {
      chunkWaiters: new Set(),
      operationWaiters: new Set(),
      chunkPageNumbers: initialChunks.map(() => null),
      chunks: initialChunks,
      currentChunkIndex: null,
      engineLabel: configuration.engineLabel,
      fileMtime: getFileMtime(options.file),
      filePath: getPdfFileIdentity(options.file),
      files: [],
      id,
      kind: options.kind || 'text',
      lastCompletedChunkIndex: null,
      pdfLoadingTask: null,
      pdfSelectionMatched: null,
      prefetchChunks: configuration.prefetchChunks,
      prepareAvailableChunks: null,
      producerError: null,
      productionComplete: options.productionComplete !== false,
      requestedChunkIndex: null,
      sourceLabel,
      sourceKind: options.sourceKind || '',
      markdownSource: options.markdownSource || null,
      speechEngine: configuration.speechEngine,
      smartQuickStart: this.settings.smartQuickStart !== false,
      rapidQuickStart: this.settings.rapidQuickStart === true,
      synthesisSettings: { ...this.settings, byokProfiles: configuration.byokProfile
        ? [{ ...configuration.byokProfile }] : (this.settings.byokProfiles || []).map(profile => ({ ...profile })), readingPositions: {} },
      systemVoice: configuration.systemVoice || '',
      systemSpeechControllers: new Set(),
      speechStarted: false,
      stopped: false,
      taskState: createTaskState(id, options.kind === 'pdf-progressive' ? 'extracting' : 'queued'),
      totalChunks: initialChunks.length,
    };
  }

  transitionSessionPhase(session, phase) {
    if (!session || !session.taskState || !phase) {
      return;
    }
    const taskPhase = phase === 'extracting PDF' ? 'extracting' : phase;
    try {
      session.taskState = transitionTaskState(session.taskState, taskPhase, session.id);
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Reading task state transition was rejected`, error);
    }
  }

  notifySessionChunkWaiters(session) {
    if (!session || !(session.chunkWaiters instanceof Set)) {
      return;
    }
    const waiters = Array.from(session.chunkWaiters);
    session.chunkWaiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }

  notifySessionNavigation(session) {
    this.notifySessionChunkWaiters(session);
    for (const wake of Array.from(session?.operationWaiters || [])) wake();
  }

  async waitForSessionOperation(session, operation, target = null) {
    // Navigation interrupts the wait, not the cached synthesis request.
    session.operationWaiters ||= new Set();
    const navigationPending = () => Number.isInteger(session.requestedChunkIndex)
      && (!target || session.requestedChunkIndex !== target.index || (session.requestedPartIndex || 0) !== target.part);
    let wake;
    const interrupted = new Promise((resolve) => {
      wake = () => resolve(null);
      session.operationWaiters.add(wake);
    });
    try {
      if (!this.isActive(session) || navigationPending()) wake();
      return await Promise.race([interrupted, operation]);
    } catch (error) {
      if (!this.isActive(session) || navigationPending()) return null;
      throw error;
    } finally {
      session.operationWaiters.delete(wake);
    }
  }

  appendSessionChunks(session, chunks, options = {}) {
    if (!this.isActive(session) || !Array.isArray(chunks)) {
      return 0;
    }
    const readableChunks = chunks
      .map((chunk) => {
        const detailed = chunk && typeof chunk === 'object' && Object.prototype.hasOwnProperty.call(chunk, 'text');
        const text = String(detailed ? chunk.text : chunk || '').trim();
        const pageNumber = detailed && chunk.metadata
          ? Math.max(1, Math.floor(Number(chunk.metadata.pageNumber) || 1))
          : (options.pageNumber ? Math.max(1, Math.floor(Number(options.pageNumber) || 1)) : null);
        return text ? { pageNumber, text, footnote: Boolean(chunk.metadata?.footnote) } : null;
      })
      .filter(Boolean);
    if (!readableChunks.length) {
      return 0;
    }

    session.chunks.push(...readableChunks.map((chunk) => chunk.text));
    session.chunkPageNumbers.push(...readableChunks.map((chunk) => chunk.pageNumber));
    session.chunkFootnotes ||= session.chunks.slice(0, -readableChunks.length).map(() => false);
    session.chunkFootnotes.push(...readableChunks.map((chunk) => chunk.footnote));
    session.totalChunks = session.chunks.length;
    const currentChunk = this.readerState.currentChunk;
    this.setReaderState({
      ...getChunkNavigationState(currentChunk, session.totalChunks),
      totalChunks: session.totalChunks,
    });
    this.notifySessionChunkWaiters(session);
    if (typeof session.prepareAvailableChunks === 'function') {
      session.prepareAvailableChunks();
    }
    return readableChunks.length;
  }

  completeSessionChunks(session) {
    session.productionComplete = true;
    session.totalChunks = session.chunks.length;
    this.notifySessionChunkWaiters(session);
  }

  failSessionChunks(session, error) {
    session.producerError = error instanceof Error ? error : new Error(messageFromError(error));
    session.productionComplete = true;
    this.notifySessionChunkWaiters(session);
  }

  async waitForSessionChunk(session, index) {
    while (
      this.isActive(session)
      && index >= session.chunks.length
      && !session.productionComplete
      && !session.producerError
      && !Number.isInteger(session.requestedChunkIndex)
    ) {
      await new Promise((resolve) => {
        const wake = () => {
          session.chunkWaiters.delete(wake);
          resolve();
        };
        session.chunkWaiters.add(wake);
      });
    }

    if (session.producerError) {
      throw session.producerError;
    }
    return index < session.chunks.length ? session.chunks[index] : null;
  }

  openPdfOutline(file) {
    if (isPdfFile(file)) {
      if (this.pdfOutlineModal?.file === file && !this.pdfOutlineModal.closed) return;
      this.pdfOutlineModal?.close();
      this.pdfOutlineModal = new PdfOutlineModal(this, file);
      this.pdfOutlineModal.open();
    }
  }

  async readCurrentPdf(pdfFile = null, options = {}) {
    const file = pdfFile || (
      typeof this.app.workspace.getActiveFile === 'function'
        ? this.app.workspace.getActiveFile()
        : null
    );
    if (!isPdfFile(file)) {
      new Notice('CosyVoice: no active PDF file.');
      return;
    }
    const outlineRange = options.outlineRange || null;
    if (outlineRange && file.stat.mtime !== outlineRange.fileMtime) throw new Error('PDF changed. Reopen the outline.');

    const selectionContext = options && options.selectionContext
      && getPdfFileIdentity(file) === options.selectionContext.filePath
      ? options.selectionContext
      : null;
    const resumePosition = options && options.resumePosition
      && getPdfFileIdentity(file) === options.resumePosition.filePath
      ? options.resumePosition
      : null;
    const startContext = selectionContext || (resumePosition ? {
      filePath: resumePosition.filePath,
      pageNumber: resumePosition.pageNumber,
      selectedText: resumePosition.anchor,
    } : null);

    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }

    await this.activateControlView();
    await this.stopReading({ silent: true });
    this.pauseRequested = false;

    const sourceLabel = file.basename || file.name || 'PDF';
    const readingSourceLabel = resumePosition
      ? `${sourceLabel} (resumed PDF)`
      : selectionContext
        ? `${sourceLabel} (PDF from selection)`
        : `${sourceLabel} (PDF)`;
    const session = this.createSpeechSession([], readingSourceLabel, configuration, {
      file,
      kind: 'pdf-progressive',
      productionComplete: false,
      sourceKind: 'pdf',
    });
    session.pdfOutlineRange = outlineRange;
    session.resumingPosition = Boolean(resumePosition);
    session.pdfContentScope = ['glossary', 'footnotes'].includes(options.contentScope) ? options.contentScope : 'body';
    this.activeSession = session;
    this.updateStatus('PDF text extraction', {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: startContext
        ? `Loading PDF text from page ${startContext.pageNumber}...`
        : 'Loading PDF text...',
      error: '',
      isPaused: false,
      phase: 'extracting PDF',
      progress: 0,
      source: sourceLabel,
      status: 'running',
      totalChunks: 0,
    });

    session.producerPromise = this.producePdfSpeechChunks(
      file,
      session,
      startContext,
      configuration.chunkLimits
    ).then(() => {
      this.completeSessionChunks(session);
    }).catch((error) => {
      this.failSessionChunks(session, error);
    });

    const prefetchNotice = configuration.prefetchChunks > 0
      ? 'Up to one next chunk may be prepared early.'
      : 'Audio is synthesized only as needed.';
    new Notice(
      `${configuration.engineLabel}: progressively reading ${readingSourceLabel}. ${prefetchNotice}`,
      6000
    );
    await this.runSpeechSession(session);
  }

  async producePdfSpeechChunks(file, session, selectionContext, chunkLimits) {
    let chunker = createPdfSpeechChunker(chunkLimits);
    let inFootnotes = false;
    let readableTextLength = 0;
    let selectionFallbackNotified = false;

    await this.extractPdfText(file, session, {
      collectText: false,
      onPageText: async (pageText, pageInfo) => {
        if (!this.isActive(session)) {
          return;
        }
        if (session.resumingPosition && selectionContext && pageInfo.pageNumber === selectionContext.pageNumber
          && session.pdfSelectionMatched === false) {
          throw new Error('Saved PDF position could not be matched. Select a new starting point.');
        }
        if (Boolean(pageInfo.footnote) !== inFootnotes) {
          this.appendSessionChunks(session, chunker.finish());
          chunker = createPdfSpeechChunker(chunkLimits);
          inFootnotes = Boolean(pageInfo.footnote);
        }
        const settings = session.synthesisSettings || this.settings;
        const text = settings.stripMarkdown
          ? sanitizeTextForSpeech(pageText, academicOptions(settings))
          : normalizeLineBreaks(pageText).trim();
        readableTextLength += text.length;
        this.appendSessionChunks(session, chunker.push(text, { pageNumber: pageInfo.pageNumber, footnote: inFootnotes }));

        if (
          selectionContext
          && pageInfo.pageNumber === selectionContext.pageNumber
          && session.pdfSelectionMatched === false
          && !selectionFallbackNotified
        ) {
          if (session.resumingPosition) throw new Error('Saved PDF position could not be matched. Select a new starting point.');
          selectionFallbackNotified = true;
          new Notice(
            `CosyVoice PDF: the selected text could not be matched exactly. Reading from the start of page ${selectionContext.pageNumber}.`,
            10000
          );
        }
      },
      reportProgress: true,
      outlineRange: session.pdfOutlineRange,
      contentScope: session.pdfContentScope,
      selectedText: selectionContext ? selectionContext.selectedText : '',
      selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
      startPageNumber: session.pdfOutlineRange?.startPage || (selectionContext ? selectionContext.pageNumber : 1),
    });

    if (!this.isActive(session)) {
      return;
    }
    this.appendSessionChunks(session, chunker.finish());
    if (!readableTextLength || !session.chunks.length) {
      if (session.pdfContentScope === 'glossary' || session.pdfContentScope === 'footnotes') {
        const zh = this.settings.settingsLanguage === 'chinese';
        throw new Error(session.pdfContentScope === 'glossary'
          ? (zh ? '未可靠识别到术语表。可选中相应文字，使用“仅选中文字”。' : 'No glossary was reliably identified. Select its text and use Selection only.')
          : (zh ? '未可靠识别到脚注。可选中相应文字，使用“仅选中文字”。' : 'No footnotes were reliably identified. Select their text and use Selection only.'));
      }
      throw new Error('No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.');
    }
  }

  async extractPdfText(file, session, options = {}) {
    const settings = session.synthesisSettings || this.settings;
    const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => this.isActive(session);
    if (!isPdfFile(file)) {
      throw new Error('The active file is not a PDF.');
    }
    if (Number(file.stat && file.stat.size) > PDF_MAX_BYTES) {
      throw new Error('This PDF is larger than 200 MB. Split or compress it before reading.');
    }
    if (typeof loadPdfJs !== 'function') {
      throw new Error('PDF text extraction is unavailable in this Obsidian version. Update Obsidian and try again.');
    }
    if (!this.app.vault || typeof this.app.vault.readBinary !== 'function') {
      throw new Error('Obsidian could not read the active PDF.');
    }

    const [pdfjsLib, binary] = await Promise.all([
      loadPdfJs(),
      this.app.vault.readBinary(file),
    ]);
    if (!isCurrent()) {
      return '';
    }
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
      throw new Error('Obsidian PDF.js did not load correctly.');
    }

    const data = binary instanceof Uint8Array
      ? new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)
      : new Uint8Array(binary);
    const loadingTask = pdfjsLib.getDocument({ data });
    session.pdfLoadingTask = loadingTask;
    let pdfDocument = null;

    try {
      pdfDocument = await loadingTask.promise;
      if (!isCurrent()) {
        return '';
      }

      const totalPages = Math.max(0, Math.floor(Number(pdfDocument.numPages) || 0));
      if (!totalPages) {
        throw new Error('This PDF contains no readable pages.');
      }
      if (totalPages > PDF_MAX_PAGES) {
        throw new Error(`This PDF has more than ${PDF_MAX_PAGES} pages. Split it before reading.`);
      }

      const requestedStartPage = Math.floor(Number(options.startPageNumber) || 1);
      const startPageNumber = Math.max(1, Math.min(totalPages, requestedStartPage));
      const selectedText = String(options.selectedText || '').trim();

      const collectText = options.collectText !== false;
      const onPageText = typeof options.onPageText === 'function' ? options.onPageText : null;
      const reportProgress = options.reportProgress !== false;
      if (!onPageText) {
        session.totalChunks = totalPages;
      }
      const pageTexts = [];
      const delayedNotes = [];
      const contentScope = options.contentScope || 'body';
      const footnoteMode = contentScope === 'glossary' ? 'inline' : contentScope === 'footnotes' ? 'footnotes' : normalizeFootnoteMode(options.footnoteMode ?? settings?.pdfFootnoteMode);
      const skipHeaders = settings?.pdfSkipHeaders === true;
      let repeatedHeaders = new Set();
      if (skipHeaders) {
        const samples = [];
        for (let n = 1; n <= Math.min(3, totalPages); n++) {
          if (!isCurrent()) return '';
          const sample = await pdfDocument.getPage(n);
          try {
            const content = await sample.getTextContent();
            samples.push({ items: content.items, viewport: sample.getViewport?.({ scale: 1 }) });
          } finally { sample.cleanup?.(); }
        }
        if (!isCurrent()) return '';
        repeatedHeaders = recurringEdges(samples);
      }
      let textLength = 0;

      const endPageNumber = Math.min(totalPages, options.outlineRange?.endPage || totalPages);
      for (let pageNumber = startPageNumber; pageNumber <= endPageNumber; pageNumber += 1) {
        if (!isCurrent()) {
          return '';
        }

        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            canPause: false,
            canNextChunk: false,
            canPreviousChunk: false,
            canSeek: false,
            canStop: true,
            currentChunk: onPageText ? 0 : pageNumber - 1,
            currentText: `Extracting page ${pageNumber} of ${totalPages}...`,
            phase: 'extracting PDF',
            progress: (pageNumber - 1) / totalPages,
            status: 'running',
            totalChunks: onPageText ? session.totalChunks : totalPages,
          });
        }

        let page = null;
        try {
          page = await pdfDocument.getPage(pageNumber);
          if (!isCurrent()) {
            return '';
          }
          const textContent = await page.getTextContent();
          if (!isCurrent()) {
            return '';
          }
          const viewport = typeof page.getViewport === 'function'
            ? page.getViewport({ scale: 1 })
            : null;
          const rules = await footnoteRules(page, pdfjsLib.OPS);
          const partition = footnoteMode === 'inline' ? null : partitionFootnotes(textContent.items, viewport, rules, { pageNumber });
          const ancillary = ancillaryLayout(textContent.items, viewport, rules, skipHeaders ? repeatedHeaders : new Set());
          const omittedRegions = [...(skipHeaders ? ancillary.headers : []),
            ...(contentScope !== 'glossary' && settings?.pdfIncludeGlossary !== true ? ancillary.glossary : []),
            ...(contentScope === 'body' && footnoteMode !== 'footnotes' ? numericTableRegions(ancillary.layout,viewport,settings) : [])];
          if (!isCurrent()) return '';
          if (session.kind === 'pdf-progressive') {
            session.pdfHighlightPages ||= new Map();
            session.pdfHighlightPages.set(pageNumber, {
              viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
              items: textContent.items.filter(item => item.str?.trim()).map(item => ({
                str: item.str, width: item.width, height: item.height, transform: Array.from(item.transform || []),
              })),
              footnoteRegions: partition?.regions || [],
              footnoteMode,
              omittedRegions,
              glossaryRegions: ancillary.glossary,
              contentScope,
            });
          }
          const pageLayout = extractPdfTextLayout(textContent && textContent.items, { viewport });
          let pageText = pageLayout.text;
          if (options.outlineRange) {
            const range = options.outlineRange;
            if (file.stat.mtime !== range.fileMtime) throw new Error('PDF changed. Reopen the outline.');
            pageText = pageText.slice(pageNumber === range.startPage ? range.startOffset : 0,
              pageNumber === range.endPage ? range.endOffset : undefined);
          }
          if (selectedText && pageNumber === startPageNumber) {
            const selectionSlice = slicePdfTextFromSelection(pageText, selectedText, {
              layout: pageLayout,
              selectionPosition: options.selectionPosition,
            });
            pageText = selectionSlice.text;
            session.pdfSelectionMatched = selectionSlice.matched;
          }
          let noteText = '';
          if (partition?.regions.length) {
            if (!options.outlineRange && !(selectedText && pageNumber === startPageNumber)) {
              pageText = partition.body.text; noteText = partition.notes.text;
            } else {
              const separated = splitFootnotesInRange(pageText, partition);
              pageText = separated.body; noteText = separated.notes;
            }
          }
          if (footnoteMode === 'footnotes') pageText = noteText;
          if (contentScope === 'glossary') {
            pageText = pdfLinesText(ancillary.layout.lines.filter(line => ancillary.glossary.some(region => insidePdfRegion(line, region))));
            noteText = '';
          } else if (omittedRegions.length) {
            const omitted = { notes: { lines: ancillary.layout.lines.filter(line => omittedRegions.some(region => insidePdfRegion(line, region))) } };
            pageText = splitFootnotesInRange(pageText, omitted).body;
          }
          if (footnoteMode === 'after' && noteText) delayedNotes.push({ text: noteText, pageNumber });
          if (collectText) {
            pageTexts.push(pageText);
          }
          textLength += pageText.length + (footnoteMode === 'after' ? noteText.length : 0);
          if (textLength > PDF_MAX_TEXT_CHARS) {
            throw new Error('This PDF contains more than 5,000,000 extractable characters. Split it before reading.');
          }
          if (onPageText) {
            await onPageText(pageText, { pageNumber, totalPages, footnote: footnoteMode === 'footnotes' });
          }
        } finally {
          if (page && typeof page.cleanup === 'function') {
            page.cleanup();
          }
        }

        if (reportProgress && !session.speechStarted) {
          this.updateStatus(`PDF page ${pageNumber}/${totalPages}`, {
            currentChunk: onPageText ? 0 : pageNumber,
            progress: pageNumber / totalPages,
          });
        }
      }

      for (const note of delayedNotes) {
        if (!isCurrent()) return '';
        if (collectText) pageTexts.push(note.text);
        if (onPageText) await onPageText(note.text, { pageNumber: note.pageNumber, totalPages, footnote: true });
      }
      return collectText ? joinPdfPageText(pageTexts) : '';
    } finally {
      const ownsLoadingTask = session.pdfLoadingTask === loadingTask;
      if (ownsLoadingTask) {
        session.pdfLoadingTask = null;
      }
      try {
        if (pdfDocument && typeof pdfDocument.destroy === 'function') {
          await pdfDocument.destroy();
        } else if (ownsLoadingTask && loadingTask && typeof loadingTask.destroy === 'function') {
          loadingTask.destroy();
        }
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not release PDF resources`, error);
      }
    }
  }

  async readSelection() {
    const documentView = this.getCurrentDocumentView();
    if (documentView) { await this.readDocumentSelection(documentView, 'selection'); return; }
    const webView = this.getCurrentWebPageView();
    if (webView) { await this.readCurrentWebPage(webView, 'selection'); return; }
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile, 'selection');
      return;
    }
    if (isPdfFile(activeFile)) {
      const selectionContext = this.getPdfSelectionForFile(activeFile);
      if (!selectionContext) {
        new Notice('CosyVoice PDF: select text in the PDF first, then try again.', 8000);
        return;
      }

      await this.activateControlView();
      await this.startReading(
        selectionContext.selectedText,
        `${activeFile.basename || activeFile.name || 'PDF'} (PDF selection)`
      );
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }

    await this.readMarkdownView(view, 'selection');
  }

  async readFromSelection() {
    const documentView = this.getCurrentDocumentView();
    if (documentView) { await this.readDocumentSelection(documentView, 'from-selection'); return; }
    const webView = this.getCurrentWebPageView();
    if (webView) { await this.readCurrentWebPage(webView, 'from-selection'); return; }
    const activeFile = this.getCurrentReadableFile();
    if (isHtmlFile(activeFile)) {
      await this.readCurrentHtml(activeFile, 'from-selection');
      return;
    }
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdfFromSelection(activeFile);
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }

    await this.readMarkdownView(view, 'from-selection');
  }

  readLatestCopilotReply() { return readLatestCopilotReply(this); }

  openCopilotChat(file = this.app.workspace.activeLeaf?.view?.file) {
    if (this.settings.copilotChatEnabled === false) {
      new Notice(this.settings.settingsLanguage === 'chinese' ? '请先在设置中开启 Copilot 聊天朗读。' : 'Enable Copilot chat reading in settings first.');
      return;
    }
    if (this.copilotChatModal) return;
    this.copilotChatModal = new CopilotChatModal(this, file);
    this.copilotChatModal.open();
  }

  async startReading(rawText, sourceLabel, options = {}) {
    const text = options.plainText || options.sourceKind === 'html' ? this.prepareHtmlSpeechText(rawText)
      : this.settings.stripMarkdown
      ? sanitizeTextForSpeech(rawText, academicOptions(this.settings))
      : normalizeLineBreaks(rawText).trim();

    if (!text) {
      new Notice('CosyVoice: nothing readable in this note.');
      return;
    }

    const configuration = this.getSpeechConfiguration();
    if (!configuration) {
      return;
    }

    await this.stopReading({ silent: true });
    this.pauseRequested = false;

    const chunks = options.readingChunks || splitTextForSpeechChunks(text, configuration.chunkLimits);
    let markdownSource = options.markdownSource || (options.sourceKind === 'markdown' && !options.plainText
      ? buildMarkdownSource(rawText, chunks, value => this.settings.stripMarkdown
        ? sanitizeTextForSpeech(value, academicOptions(this.settings))
        : normalizeLineBreaks(value).trim(), { sourceText: options.sourceText, sourceOffset: options.sourceOffset, filePath: options.file?.path }) : null);
    if (options.focusDisplay) {
      const display = options.focusDisplay;
      let start = compact(display.text.slice(0, display.offset)).length;
      markdownSource = { ...display.source, mappingValid: false, displayMappingValid: true, speech: compact(display.text),
        ranges: chunks.map(chunk => { const from = start; start += compact(chunk).length; return { start: from, end: start }; }) };
    }
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: options.file,
      sourceKind: options.sourceKind || '',
      markdownSource,
    });

    session.webContext = options.webContext;
    session.skipReadingPosition = options.skipReadingPosition === true;

    this.activeSession = session;
    this.updateStatus(`${configuration.engineLabel} 0/${chunks.length}`, {
      canPause: false,
      canNextChunk: false,
      canPreviousChunk: false,
      canSeek: false,
      canStop: true,
      currentChunk: 0,
      currentText: previewText(chunks[0]),
      error: '',
      isPaused: false,
      phase: 'queued',
      progress: 0,
      source: sourceLabel,
      status: 'running',
      totalChunks: chunks.length,
    });
    await this.writeRuntimeLog('start', {
      chunks: chunks.length,
      prefetchChunks: configuration.prefetchChunks,
      source: sourceLabel,
      textLength: text.length,
    });
    new Notice(`${configuration.engineLabel}: reading ${sourceLabel}. First synthesis may take a while.`, 6000);

    await this.runSpeechSession(session);
  }

  async runSpeechSession(session) {
    const preparedChunks = new Map();
    const readyChunks = new Set();
    const getPreparedChunk = (index, part = 0, foreground = false) => {
      planSpeechParts(session, index, foreground && !session.seekTarget);
      const key = `${index}:${part}`;
      if (!preparedChunks.has(key)) {
        const preparing = this.queuePrepareChunk(getSpeechParts(session, index)[part], index, session, part);
        preparing.catch(() => {});
        preparedChunks.set(key, preparing);
        preparing.then(() => readyChunks.add(key), () => {});
      }

      return preparedChunks.get(key);
    };
    session.prepareAvailableChunks = () => {
      if (!this.isActive(session) || Number.isInteger(session.requestedChunkIndex)
        || session.seekTarget || this.pauseRequested || !Number.isInteger(session.prefetchBaseIndex)) {
        return;
      }
      let cursor = { index: session.prefetchBaseIndex, part: session.currentPartIndex || 0 };
      for (let offset = 1; offset <= session.prefetchChunks; offset += 1) {
        cursor = adjacentSpeechPart(session, cursor.index, cursor.part, 1);
        if (!cursor) break;
        getPreparedChunk(cursor.index, cursor.part);
      }
    };

    try {
      let index = 0;
      let part = 0;
      while (this.isActive(session)) {
        if (Number.isInteger(session.requestedChunkIndex) && session.chunks.length) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          part = session.requestedPartIndex || 0;
          session.requestedChunkIndex = null;
          session.requestedPartIndex = null;
        }
        session.prefetchBaseIndex = index;

        if (
          session.kind === 'pdf-progressive'
          && index >= session.chunks.length
          && !session.productionComplete
        ) {
          this.updateStatus('PDF parsing next pages', {
            canPause: true,
            canNextChunk: false,
            canSeek: false,
            canStop: true,
            isPaused: false,
            phase: 'extracting PDF',
            progress: Math.min(0.99, this.readerState.progress),
            status: 'running',
          });
        }

        const chunkText = await this.waitForSessionChunk(session, index);
        if (!this.isActive(session)) {
          break;
        }
        if (Number.isInteger(session.requestedChunkIndex)) {
          continue;
        }
        if (chunkText === null) {
          break;
        }

        session.currentChunkIndex = index;
        session.currentPartIndex = part;
        if (session.lastCompletedChunkIndex === index) session.lastCompletedChunkIndex = null;
        const key = `${index}:${part}`;
        const reused = preparedChunks.has(key);
        const preparation = getPreparedChunk(index, part, true);
        this.updateStatus(`${session.engineLabel} preparing ${index + 1}/${session.totalChunks}`, {
          preparationStatus: readyChunks.has(key) ? 'loading' : reused ? 'waiting' : 'synthesizing',
          phase: 'synthesizing',
          currentChunk: index + 1,
          totalChunks: session.totalChunks,
          ...getChunkNavigationState(index + 1, session.totalChunks),
          canPause: true, canStop: true, canSeek: false,
          progress: session.totalChunks ? (index + this.getSegmentTiming(session, index, part, 0).fraction) / session.totalChunks : 0,
        });
        const prepared = await this.waitForSessionOperation(session, preparation);
        if (!this.isActive(session)) {
          break;
        }

        if (Number.isInteger(session.requestedChunkIndex)) {
          continue;
        }

        if (!session.seekTarget) session.prepareAvailableChunks();

        session.requestedChunkIndex = null;
        await this.playPreparedAudio(prepared, session, index, session.totalChunks, part);

        if (Number.isInteger(session.requestedChunkIndex)) {
          continue;
        } else if (part + 1 < getSpeechParts(session, index).length) {
          part += 1;
        } else {
          session.lastCompletedChunkIndex = index;
          index += 1;
          part = 0;
        }
      }

      if (this.isActive(session)) {
        this.updateStatus(`${session.engineLabel} complete`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          isPaused: false,
          phase: 'complete',
          progress: 1,
          status: 'complete',
        });
        await this.clearSessionReadingPosition(session);
        this.activeSession = null;
      }
    } catch (error) {
      if (this.isActive(session)) {
        const message = session.kind === 'pdf-progressive'
          ? getPdfExtractionErrorMessage(error)
          : messageFromError(error);
        this.updateStatus(`${session.engineLabel} error`, {
          canPause: false,
          canNextChunk: false,
          canPreviousChunk: false,
          canSeek: false,
          canStop: false,
          error: message,
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
        await this.writeRuntimeLog('failed', {
          message,
        });
        const noticePrefix = session.kind === 'pdf-progressive' ? 'CosyVoice PDF' : session.engineLabel;
        new Notice(`${noticePrefix} failed: ${message}`, 10000);
        await this.saveSessionReadingPosition(session);
        await this.cancelSessionOperations(session);
        this.activeSession = null;
      }
    } finally {
      session.prepareAvailableChunks = null;
      session.prefetchBaseIndex = null;
      if (session.producerPromise) {
        await session.producerPromise.catch(() => {});
      }
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }

  async prepareChunk(chunkText, index, session, part = 0) {
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    session.speechStarted = true;
    session.synthesisSpeeds = session.synthesisSpeeds || {};
    const speechEngine = normalizeSpeechEngine(session.speechEngine || this.settings.speechEngine);
    session.synthesisSpeeds[index] = ['system-tts', 'byok-tts'].includes(speechEngine) ? 1 : normalizeSpeed((session.synthesisSettings || this.settings).speed);
    const engineLabel = session.engineLabel || getSpeechEngineLabel(this.settings);
    const outputExtension = getAudioExportExtension(speechEngine);
    const basename = `${Date.now()}-${session.id}-${index}-${part}`;
    const inputPath = path.join(this.cacheDir, `${basename}.txt`);
    const outputPath = path.join(this.cacheDir, `${basename}.${outputExtension}`);

    session.files.push(inputPath, outputPath);
    await fs.promises.writeFile(inputPath, chunkText, { encoding: 'utf8', mode: 0o600 });

    const isAudioExport = session.kind === 'audio-export';
    const isBackgroundPrefetch = Boolean(
      !isAudioExport && Number.isInteger(session.currentChunkIndex)
      && (index !== session.currentChunkIndex || part !== (session.currentPartIndex || 0))
    );
    if (!isBackgroundPrefetch && this.isActive(session) && !Number.isInteger(session.requestedChunkIndex)) {
      this.updateStatus(`${engineLabel} synth ${index + 1}/${session.totalChunks || 0}`, {
        canPause: !isAudioExport,
        ...(isAudioExport
          ? { canNextChunk: false, canPreviousChunk: false }
          : getChunkNavigationState(index + 1, session.totalChunks)),
        canSeek: false,
        canStop: true,
        currentChunk: index + 1,
        currentText: previewText(session.chunks?.[index] || chunkText),
        isPaused: false,
        phase: 'synthesizing',
        progress: session.totalChunks ? (index + this.getSegmentTiming(session, index, part, 0).fraction) / session.totalChunks : 0,
        status: 'running',
        totalChunks: session.totalChunks || 0,
      });
    }
    let alignment;
    try {
      alignment = await this.runSpeechEngine(inputPath, outputPath, session, speechEngine);
    } catch (error) {
      if (speechEngine === 'system-tts' && this.settings.cleanupCache) await this.removeTempFile(outputPath);
      throw error;
    } finally {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(inputPath);
      }
    }

    const outputStat = await fs.promises.stat(outputPath);
    if (outputStat.size <= 44) {
      throw new Error(`${engineLabel} generated an invalid audio file: ${outputStat.size} bytes.`);
    }

    if (!this.isActive(session)) {
      if (this.settings.cleanupCache) {
        await this.removeTempFile(outputPath);
      }
      throw new Error('Reading stopped.');
    }

    const url = getAudioUrlForFile(this.app.vault.adapter, this.vaultBasePath, outputPath);
    await this.writeRuntimeLog('prepared', {
      index,
      outputBytes: outputStat.size,
      urlScheme: String(url).split(':')[0],
    });

    return {
      outputPath,
      url,
      sentenceCues: alignment ? buildSentenceCues(chunkText, alignment.boundaries, alignment.duration) : [],
    };
  }

  queuePrepareChunk(chunkText, index, session, part = 0) {
    const promise = this.prepareChunk(chunkText, index, session, part);
    promise.catch(() => {});
    return promise;
  }

  runSpeechEngine(inputPath, outputPath, session, speechEngine = normalizeSpeechEngine(this.settings.speechEngine)) {
    if (speechEngine === 'byok-tts') return this.runByokTts(inputPath, outputPath, session);
    if (speechEngine === 'system-tts') return this.runSystemTts(inputPath, outputPath, session);
    if (speechEngine === 'edge-tts') {
      return this.runEdgeTts(inputPath, outputPath, session);
    }
    if (speechEngine === 'azure-speech') {
      return this.runAzureSpeech(inputPath, outputPath, session);
    }
    if (speechEngine === 'openrouter-tts') {
      return this.runOpenRouterTts(inputPath, outputPath, session);
    }
    if (speechEngine === 'mimo-tts') {
      return this.runMimoTts(inputPath, outputPath, session);
    }

    return this.runCosyVoice(inputPath, outputPath, session);
  }

  async loadSystemSpeechVoices(refresh = false) {
    if (this.systemSpeechUnloaded) throw systemSpeechError('stopped');
    if (this.systemVoicePromise) return this.systemVoicePromise;
    if (this.systemVoicesReady && !refresh) {
      if (this.systemVoicesError) throw this.systemVoicesError;
      return this.systemVoices;
    }
    const controller = new AbortController();
    this.systemVoiceController = controller;
    this.systemVoicePromise = listSystemVoices({ signal: controller.signal }).then(voices => {
      if (!voices.length) throw systemSpeechError('voices');
      this.systemVoices = voices;
      this.systemVoicesError = null;
      return voices;
    }).catch(error => {
      this.systemVoices = [];
      this.systemVoicesError = error;
      throw error;
    }).finally(() => {
      this.systemVoicesReady = true;
      this.systemVoicePromise = null;
      this.systemVoiceController = null;
    });
    return this.systemVoicePromise;
  }

  async runSystemTts(inputPath, outputPath, session) {
    if (!this.isActive(session)) throw systemSpeechError('stopped');
    const controller = new AbortController();
    session.systemSpeechControllers.add(controller);
    try {
      const voices = await this.loadSystemSpeechVoices();
      if (!this.isActive(session) || controller.signal.aborted) throw systemSpeechError('stopped');
      return await synthesizeSystemSpeech({ inputPath, outputPath, voice: session.systemVoice, voices, signal: controller.signal });
    } catch (error) {
      if (this.settings.settingsLanguage === 'chinese') {
        const messages = {
          SYSTEM_TTS_UNAVAILABLE: '系统本地语音仅支持 Windows 和 macOS。',
          SYSTEM_TTS_VOICES: '没有找到可调用的已安装音色，请按设置页提示安装音色并刷新。',
          SYSTEM_TTS_VOICE: '所选系统音色不可用，请刷新并重新选择；不会回退到在线服务。',
          SYSTEM_TTS_COMMAND: '系统语音调用失败，请检查已安装音色和系统语音服务。',
          SYSTEM_TTS_TIMEOUT: '系统语音合成超时，请尝试其他已安装音色或更短的分段。',
          SYSTEM_TTS_STOPPED: '系统语音已停止。',
          SYSTEM_TTS_AUDIO: '系统语音生成的 WAV 音频无效或不完整。',
        };
        if (messages[error.code]) error.message = messages[error.code];
      }
      throw error;
    } finally {
      session.systemSpeechControllers.delete(controller);
    }
  }

  runCosyVoice(inputPath, outputPath, session) {
    const settings = session.synthesisSettings || this.settings;
    const scriptPath = settings.scriptPath.trim();
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-InputPath',
      inputPath,
      '-OutputPath',
      outputPath,
      '-Speed',
      String(normalizeSpeed(settings.speed)),
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(resolvePowerShellExecutable(), args, {
        cwd: path.dirname(scriptPath),
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      this.currentProcess = child;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error('CosyVoice synthesis timed out after 10 minutes.'));
      }, 10 * 60 * 1000);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }

        if (!this.isActive(session)) {
          reject(new Error('Reading stopped.'));
          return;
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }

        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
        reject(new Error(detail || `CosyVoice exited with code ${code}.`));
      });
    });
  }

  runEdgeTts(inputPath, outputPath, session) {
    const settings = session.synthesisSettings || this.settings;
    const args = buildEdgeTtsArgs(inputPath, outputPath, settings);
    const executable = normalizeEdgeTtsExecutable(settings.edgeTtsExecutable);

    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      this.currentProcess = child;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error('Edge TTS synthesis timed out after 10 minutes.'));
      }, 10 * 60 * 1000);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        reject(new Error(`Edge TTS command failed at ${executable}. Check the configured executable path. ${messageFromError(error)}`));
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }

        if (!this.isActive(session)) {
          reject(new Error('Reading stopped.'));
          return;
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
          return;
        }

        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
        reject(new Error(detail || `Edge TTS exited with code ${code}.`));
      });
    });
  }

  async readSecretFileOutsideVault(configuredPathValue, serviceLabel) {
    const configuredPath = String(configuredPathValue || '').trim();
    const keyPath = await fs.promises.realpath(configuredPath);
    const vaultPath = await fs.promises.realpath(this.vaultBasePath).catch(() => path.resolve(this.vaultBasePath));
    if (isInsideDirectory(keyPath, vaultPath)) {
      throw new Error(`${serviceLabel} key file must be stored outside the Obsidian vault.`);
    }

    const stat = await fs.promises.stat(keyPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8192) {
      throw new Error(`${serviceLabel} key file must be a non-empty text file smaller than 8 KB.`);
    }

    const key = (await fs.promises.readFile(keyPath, 'utf8')).replace(/^\uFEFF/, '').trim();
    if (!key || /[\r\n]/.test(key)) {
      throw new Error(`${serviceLabel} key file must contain exactly one non-empty line.`);
    }
    return key;
  }

  readObsidianSecret(secretNameValue, serviceLabel) {
    return readObsidianSecretValue(secretNameValue, this.app, serviceLabel);
  }

  async readOpenRouterKey(settings = this.settings) {
    if (normalizeCredentialSource(settings.openRouterCredentialSource) === 'obsidian-secret') {
      return this.readObsidianSecret(settings.openRouterSecretName, 'OpenRouter API');
    }
    return this.readSecretFileOutsideVault(settings.openRouterKeyPath, 'OpenRouter API');
  }

  async readAzureSpeechKey(settings = this.settings) {
    if (normalizeCredentialSource(settings.azureSpeechCredentialSource) === 'obsidian-secret') {
      return this.readObsidianSecret(settings.azureSpeechSecretName, 'Azure Speech');
    }
    return this.readSecretFileOutsideVault(settings.azureSpeechKeyPath, 'Azure Speech');
  }

  async waitForRemoteRetry(session, delayMs) {
    let remainingMs = Math.max(0, Number(delayMs) || 0);
    while (remainingMs > 0) {
      const intervalMs = Math.min(100, remainingMs);
      await sleep(intervalMs);
      if (!this.isActive(session)) {
        throw new Error('Reading stopped.');
      }
      remainingMs -= intervalMs;
    }
  }

  async requestRemoteAudio(options) {
    if (!(this.currentRequests instanceof Set)) {
      this.currentRequests = new Set();
    }

    const { session, serviceLabel } = options;
    const maxAttempts = options.retryTemporaryFailures === true ? REMOTE_TTS_MAX_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.requestRemoteAudioOnce(options);
        return;
      } catch (error) {
        if (!this.isActive(session)) {
          throw new Error('Reading stopped.');
        }

        if (!isRetryableRemoteError(error)) {
          throw error;
        }

        if (attempt === maxAttempts) {
          throw maxAttempts > 1
            ? createRemoteRetryExhaustedError(serviceLabel, error, attempt)
            : error;
        }

        const fallbackDelayMs = REMOTE_TTS_RETRY_DELAYS_MS[attempt - 1] || REMOTE_TTS_RETRY_DELAYS_MS.at(-1);
        const retryAfterMs = Number(error.retryAfterMs);
        const delayMs = Number.isFinite(retryAfterMs)
          ? Math.max(fallbackDelayMs, retryAfterMs)
          : fallbackDelayMs;
        await this.waitForRemoteRetry(session, delayMs);
      }
    }
  }

  async requestRemoteAudioOnce({ endpoint, headers, body, outputPath, session, serviceLabel, expectedContentType, failureHint, decodeAudio }) {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        this.currentRequests.delete(request);
        callback(value);
      };

      const request = https.request(endpoint, {
        method: 'POST',
        headers,
      }, (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode !== 200) {
          response.resume();
          finish(reject, createRemoteHttpError(
            serviceLabel,
            statusCode,
            failureHint,
            response.headers && response.headers['retry-after']
          ));
          return;
        }

        const responseHeaders = response.headers || {};
        const contentType = String(responseHeaders['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (expectedContentType && contentType !== expectedContentType) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} returned unexpected content type ${contentType || '(missing)'}.`));
          return;
        }

        const contentLength = Number(responseHeaders['content-length']) || 0;
        if (contentLength > REMOTE_TTS_MAX_AUDIO_BYTES) {
          response.resume();
          finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
          request.destroy();
          return;
        }

        const chunks = [];
        let totalBytes = 0;
        response.on('data', (chunk) => {
          if (settled) {
            return;
          }
          totalBytes += chunk.length;
          if (totalBytes > REMOTE_TTS_MAX_AUDIO_BYTES) {
            response.destroy();
            finish(reject, new Error(`${serviceLabel} response exceeded the 20 MB safety limit.`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('aborted', () => {
          const error = new Error(`${serviceLabel} response was interrupted.`);
          error.code = 'ECONNRESET';
          finish(reject, error);
        });
        response.on('error', (error) => {
          finish(reject, error);
        });
        response.on('end', async () => {
          if (settled) {
            return;
          }
          if (!this.isActive(session)) {
            finish(reject, new Error('Reading stopped.'));
            return;
          }

          try {
            const responseBytes = Buffer.concat(chunks);
            const audioBytes = decodeAudio ? decodeAudio(responseBytes) : responseBytes;
            await fs.promises.writeFile(outputPath, audioBytes, { mode: 0o600 });
            finish(resolve);
          } catch (error) {
            finish(reject, error);
          }
        });
      });

      this.currentRequests.add(request);
      request.setTimeout(2 * 60 * 1000, () => {
        const error = new Error(`${serviceLabel} synthesis timed out after 2 minutes.`);
        error.code = 'ETIMEDOUT';
        finish(reject, error);
        request.destroy();
      });
      request.on('error', (error) => {
        finish(reject, error);
      });
      request.on('close', () => {
        if (!settled && !this.isActive(session)) {
          finish(reject, new Error('Reading stopped.'));
        }
      });
      request.end(body);
    });
  }

  async runAzureSpeech(inputPath, outputPath, session) {
    const settings = session.synthesisSettings || this.settings;
    const [text, subscriptionKey] = await Promise.all([
      fs.promises.readFile(inputPath, 'utf8'),
      this.readAzureSpeechKey(settings),
    ]);
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    const body = buildAzureSpeechSsml(text, settings);
    await this.requestRemoteAudio({
      endpoint: new URL(buildAzureSpeechEndpoint(settings)),
      headers: {
        Accept: 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'User-Agent': 'note-reader-cosyvoice/0.2.6',
        'X-Microsoft-OutputFormat': AZURE_SPEECH_OUTPUT_FORMAT,
      },
      body,
      outputPath,
      session,
      serviceLabel: 'Azure Speech',
      expectedContentType: 'audio/mpeg',
      failureHint: 'Check the selected API credential, cloud, region, voice, resource status, and quota.',
    });
  }

  async runByokTts(inputPath, outputPath, session) {
    const profile = getByokProfile(session.synthesisSettings || this.settings);
    assertByokAuthorized(profile, this.settings);
    const apiKey = profile.credentialSource === 'obsidian-secret'
      ? await this.readObsidianSecret(profile.secretName, 'BYOK API')
      : await this.readSecretFileOutsideVault(profile.keyPath, 'BYOK API');
    const text = await fs.promises.readFile(inputPath, 'utf8');
    assertByokAuthorized(profile, this.settings);
    if (!this.isActive(session)) throw new Error('Reading stopped.');
    const request = buildByokRequest(profile, text, apiKey);
    try {
      await this.requestRemoteAudio({ ...request, outputPath, session,
        decodeAudio: bytes => {
          assertByokAuthorized(profile, this.settings);
          return request.decodeAudio(bytes);
        },
      });
    } catch (error) {
      // Do not surface server bodies, custom endpoint paths or echoed credentials.
      throw safeByokRequestError(error);
    }
  }

  async runMimoTts(inputPath, outputPath, session) {
    const settings = session.synthesisSettings || this.settings;
    if (settings.mimoConsent !== true) throw new Error('MiMo online processing consent is required.');
    const apiKey = normalizeCredentialSource(settings.mimoCredentialSource) === 'obsidian-secret'
      ? await this.readObsidianSecret(settings.mimoSecretName, 'MiMo API')
      : await this.readSecretFileOutsideVault(settings.mimoKeyPath, 'MiMo API');
    const text = await fs.promises.readFile(inputPath, 'utf8');
    if (!this.isActive(session)) throw new Error('Reading stopped.');
    const body = buildMimoRequestBody(text, settings);
    await this.requestRemoteAudio({
      endpoint: new URL(MIMO_ENDPOINT),
      headers: { 'api-key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body, outputPath, session,
      serviceLabel: 'MiMo TTS',
      expectedContentType: 'application/json',
      decodeAudio: decodeMimoAudio,
      failureHint: 'Check the MiMo API key, TTS access, account balance, and rate limits. Promotional free access may change.',
      retryTemporaryFailures: true,
    });
  }

  async runOpenRouterTts(inputPath, outputPath, session) {
    const settings = session.synthesisSettings || this.settings;
    const [text, apiKey] = await Promise.all([
      fs.promises.readFile(inputPath, 'utf8'),
      this.readOpenRouterKey(settings),
    ]);
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    const body = buildOpenRouterTtsRequestBody(text, settings);
    await this.requestRemoteAudio({
      endpoint: new URL(OPENROUTER_TTS_ENDPOINT),
      headers: {
        Accept: 'audio/mpeg',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        'Content-Type': 'application/json',
        'User-Agent': 'note-reader-cosyvoice/0.2.6',
      },
      body,
      outputPath,
      session,
      serviceLabel: 'OpenRouter TTS',
      expectedContentType: 'audio/mpeg',
      failureHint: 'Check the selected API credential, model, voice, account balance, and privacy settings.',
      retryTemporaryFailures: true,
    });
  }

  async createPlayableAudioSource(prepared) {
    const audioBytes = await fs.promises.readFile(prepared.outputPath);
    const blobSource = createBlobAudioSource(audioBytes, prepared.outputPath);
    if (blobSource) {
      return blobSource;
    }

    return {
      mimeType: getAudioMimeType(prepared.outputPath),
      url: prepared.url,
      release() {},
    };
  }

  releaseAudioSource(audio) {
    if (!audio || typeof audio.noteReaderReleaseSource !== 'function') {
      return;
    }
    const release = audio.noteReaderReleaseSource;
    audio.noteReaderReleaseSource = null;
    release();
  }

  getSegmentTiming(session = this.activeSession, index = Math.max(0, (this.readerState.currentChunk || 1) - 1),
    part = session?.currentPartIndex || 0, time = this.currentAudio?.currentTime || 0) {
    const timing = session?.chunks?.[index] !== undefined
      ? getSpeechPartTiming(session, index, part, time, ['system-tts', 'byok-tts'].includes(session.speechEngine) ? 1 : normalizeSpeed(this.settings.speed))
      : { duration: Number(this.currentAudio?.duration) || 0, current: time, offset: 0 };
    return { ...timing, fraction: timing.duration > 0 ? Math.min(1, timing.current / timing.duration) : 0 };
  }

  async playPreparedAudio(prepared, session, index, total, part = 0) {
    if (!this.isActive(session)) {
      return;
    }

    if (!session.seekTarget) await this.waitWhilePaused(session);
    if (!this.isActive(session) || (Number.isInteger(session.requestedChunkIndex)
      && (session.requestedChunkIndex !== index || (session.requestedPartIndex || 0) !== part))) {
      return;
    }

    this.updateStatus(`${session.engineLabel} loading audio`, { preparationStatus: 'loading' });
    const loadingSource = this.createPlayableAudioSource(prepared);
    const source = await this.waitForSessionOperation(session, loadingSource, { index, part });
    if (!source) {
      // Navigation must not wait for an obsolete file load, but its URL still needs cleanup.
      loadingSource.then(value => value.release(), () => {}).catch(() => {});
      return;
    }
    if (!this.isActive(session) || (Number.isInteger(session.requestedChunkIndex)
      && (session.requestedChunkIndex !== index || (session.requestedPartIndex || 0) !== part))) {
      source.release();
      return;
    }

    await new Promise((resolve, reject) => {
      let audio;
      let settled = false;
      let seekMetadataTimer = null;
      const getPlaybackTotal = () => Math.max(
        1,
        Math.floor(Number(session.totalChunks) || 0),
        Math.floor(Number(total) || 0)
      );
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (seekMetadataTimer) clearTimeout(seekMetadataTimer);
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        this.releaseAudioSource(audio);
        callback(value);
      };

      try {
        audio = new Audio();
        audio.volume = normalizeVolume(this.settings.playbackVolume);
        audio.preservesPitch = true;
        audio.defaultPlaybackRate = normalizeSpeed(this.settings.playbackSpeed);
        audio.playbackRate = normalizeSpeed(this.settings.playbackSpeed);
        audio.noteReaderReleaseSource = source.release;
        audio.noteReaderSessionId = session.id;
        audio.noteReaderChunkIndex = index;
        const partOffset = session.chunks?.[index] === undefined ? null
          : speechPartOffset(session.chunks[index], getSpeechParts(session, index), part);
        audio.noteReaderSentenceCues = partOffset === null ? [] : (prepared.sentenceCues || []).map(cue => ({
          ...cue, start: cue.start + partOffset, end: cue.end + partOffset,
        }));
        audio.preload = 'auto';
        const recordDuration = () => {
          if (this.isActive(session) && Number.isFinite(audio.duration) && audio.duration > 0) {
            session.audioDurations = session.audioDurations || {};
            session.partDurations ||= {};
            session.partDurations[`${index}:${part}`] = audio.duration;
            session.audioDurations[index] = getSpeechParts(session, index).length > 1
              ? this.getSegmentTiming(session, index, part, audio.currentTime).duration : audio.duration;
          }
        };
        const applyPlaybackSpeed = () => {
          if (settled || !this.isActive(session)) return;
          audio.defaultPlaybackRate = normalizeSpeed(this.settings.playbackSpeed);
          audio.playbackRate = audio.defaultPlaybackRate;
          audio.preservesPitch = true;
        };
        audio.onloadedmetadata = () => {
          if (seekMetadataTimer) clearTimeout(seekMetadataTimer);
          applyPlaybackSpeed();
          recordDuration();
          if (settled || !this.isActive(session) || !session.seekTarget) return;
          const target = session.seekTarget;
          if (target.index !== index || (target.part || 0) !== part) {
            session.requestedChunkIndex = target.index;
            session.requestedPartIndex = target.part || 0;
            finish(resolve);
            return;
          }
          const duration = audio.duration;
          if (!Number.isFinite(duration) || duration <= 0) {
            finish(reject, new Error('Cannot seek across segments: audio duration is unavailable.'));
            return;
          }
          if (target.fromEnd) {
            target.time += duration;
            target.fromEnd = false;
          }
          const previous = adjacentSpeechPart(session, index, part, -1);
          const next = adjacentSpeechPart(session, index, part, 1);
          if (target.time < 0 && previous) {
            Object.assign(target, previous);
            target.fromEnd = true;
          } else if (target.time >= duration && next) {
            target.time -= duration;
            Object.assign(target, next);
          } else {
            audio.currentTime = Math.max(0, Math.min(duration, target.time));
            session.seekTarget = null;
            if (!this.pauseRequested) session.prepareAvailableChunks?.();
            this.updateStatus(this.pauseRequested ? 'CosyVoice paused' : 'CosyVoice playing', {
              canSeek: true, isPaused: Boolean(this.pauseRequested),
              phase: this.pauseRequested ? 'paused' : 'playing',
              status: this.pauseRequested ? 'paused' : 'running',
              progress: (index + this.getSegmentTiming(session, index, part, audio.currentTime).fraction) / getPlaybackTotal(),
            });
            if (!this.pauseRequested) Promise.resolve(audio.play()).catch((error) => finish(reject, error));
            return;
          }
          session.requestedChunkIndex = target.index;
          session.requestedPartIndex = target.part || 0;
          finish(resolve);
        };
        audio.onplaying = applyPlaybackSpeed;
        audio.ondurationchange = recordDuration;
        this.currentAudio = audio;
        const playbackTotal = getPlaybackTotal();
        this.updateStatus(`${session.engineLabel || getSpeechEngineLabel(this.settings)} play ${index + 1}/${playbackTotal}`, {
          canPause: true,
          canNextChunk: index + 1 < playbackTotal,
          canPreviousChunk: index > 0,
          canSeek: true,
          canStop: true,
          currentChunk: index + 1,
          currentText: previewText(Array.isArray(session.chunks) ? session.chunks[index] : ''),
          isPaused: false,
          phase: 'playing',
          preparationStatus: '',
          progress: (index + this.getSegmentTiming(session, index, part, 0).fraction) / playbackTotal,
          status: 'running',
          totalChunks: playbackTotal,
        });
        void this.writeRuntimeLog('play', {
          index,
          urlScheme: String(source.url).split(':')[0],
        });

        let lastProgressUpdate = 0;
        audio.ontimeupdate = () => {
          if (settled || !this.isActive(session)) return;
          recordDuration();
          const now = Date.now();
          if (now - lastProgressUpdate < 250) {
            return;
          }
          lastProgressUpdate = now;
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const chunkProgress = duration ? this.getSegmentTiming(session, index, part, audio.currentTime).fraction : 0;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            progress: (index + chunkProgress) / currentTotal,
            totalChunks: currentTotal,
          });
        };

        audio.onended = () => {
          if (settled) return;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            canPause: false,
            ...getChunkNavigationState(index + 1, currentTotal),
            canSeek: false,
            isPaused: false,
            progress: (index + this.getSegmentTiming(session, index, part, audio.duration || 0).fraction) / currentTotal,
            totalChunks: currentTotal,
          });
          finish(resolve);
        };

        audio.onerror = () => {
          finish(reject, new Error(`Unable to play ${prepared.outputPath}${describeMediaError(audio.error)}`));
        };

        if (session.seekTarget) {
          seekMetadataTimer = setTimeout(() => {
            finish(reject, new Error('Timed out loading audio duration for cross-segment seeking.'));
          }, 15000);
        }
        audio.src = source.url;
        // Loading a new source can reset playbackRate to defaultPlaybackRate.
        applyPlaybackSpeed();
        if (session.seekTarget) {
          audio.load();
        } else {
          Promise.resolve(audio.play()).catch((error) => {
            finish(reject, error);
          });
        }
      } catch (error) {
        if (audio) {
          finish(reject, error);
        } else {
          source.release();
          reject(error);
        }
      }
    });
  }

  async waitWhilePaused(session) {
    while (this.isActive(session) && this.pauseRequested) {
      this.updateStatus('CosyVoice paused', {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: Boolean(this.currentAudio),
        canStop: true,
        isPaused: true,
        phase: 'paused',
        status: 'paused',
      });
      await sleep(100);
    }
  }

  handleReaderKeydown(event, options = {}) {
    if (
      !event ||
      event.defaultPrevented ||
      isInteractiveKeyboardTarget(event.target)
    ) {
      return false;
    }

    const seekDeltaSeconds = getKeyboardSeekDeltaSeconds(event);
    if (seekDeltaSeconds) {
      if (!this.seekCurrentAudioBySeconds(seekDeltaSeconds)) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
      return true;
    }

    const state = this.readerState || createReaderState();
    if (
      options.allowPause === false ||
      event.repeat ||
      !state.canPause ||
      !isSpaceKeyEvent(event)
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(this.pauseOrResume()).finally(() => {
      if (options.focusPanel) {
        focusElementWithoutScroll(options.focusPanel);
      }
    });
    return true;
  }

  seekToProgress(progress) {
    const session = this.activeSession;
    if (session && session.kind === 'audio-export') return false;
    const total = session && Array.isArray(session.chunks) ? session.chunks.length : 0;
    if (this.isActive(session) && total > 0) {
      const target = Math.min(total - 1, Math.floor(clampProgress(progress) * total));
      const current = Math.max(0, (this.readerState.currentChunk || 1) - 1);
      if (target !== current) return this.jumpToAdjacentChunk(target - current);
    }
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return false;
    }

    const seekTime = calculateCurrentChunkSeekTime({
      progress,
      currentChunk: this.readerState.currentChunk,
      totalChunks: this.readerState.totalChunks,
      duration: this.getSegmentTiming().duration,
    });

    if (seekTime === null) {
      return false;
    }

    return this.seekCurrentSegmentToTime(seekTime);
  }

  async locateCurrentReading() {
    if (this.locatingReading) return;
    this.locatingReading = true;
    try {
      const result = await locateReading(this);
      const messages = {
        unavailable: ['No locatable reading position is available.', '当前没有可定位的朗读位置。'],
        changed: ['The source has changed or the web page is no longer open. Restart reading to locate it safely.', '原文已变化或网页已关闭，请重新开始朗读后再定位。'],
        unmatched: ['The document is open, but the current passage could not be located reliably.', '已尝试打开原文，但无法可靠定位当前段落。'],
        page: ['Located the PDF page; the paragraph is not yet available.', '已定位到 PDF 对应页，暂未定位到具体段落。'],
        segment: ['Located the current segment; the exact spoken passage could not be matched.', '已定位到当前合成段，暂未精确匹配正在朗读的句子。'],
      };
      if (messages[result]) new Notice(translateInterface(this.settings.settingsLanguage, ...messages[result]));
    } finally { this.locatingReading = false; }
  }

  seekCurrentAudioBySeconds(deltaSeconds) {
    const audio = this.currentAudio;
    const delta = Number(deltaSeconds);
    const session = this.activeSession;
    if (!Number.isFinite(delta) || session?.kind === 'audio-export') {
      return false;
    }
    if (this.isActive(session) && session.seekTarget) {
      session.seekTarget.time += delta;
      return true;
    }
    if (!audio) return false;

    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const time = currentTime + delta;
    const duration = audio.duration;
    if (this.isActive(session) && Array.isArray(session.chunks)
      && Number.isFinite(duration) && duration > 0 && (time < 0 || time >= duration)) {
      const index = Math.max(0, (this.readerState.currentChunk || 1) - 1);
      const adjacent = adjacentSpeechPart(session, index, session.currentPartIndex || 0, time < 0 ? -1 : 1);
      if (adjacent) {
        session.seekTarget = time < 0
          ? { ...adjacent, time, fromEnd: true }
          : { ...adjacent, time: time - duration, fromEnd: false };
        session.requestedChunkIndex = session.seekTarget.index;
        session.requestedPartIndex = session.seekTarget.part;
        this.notifySessionNavigation(session);
        this.pauseRequested = Boolean(this.pauseRequested || audio.paused);
        audio.pause();
        if (typeof audio.onended === 'function') audio.onended();
        this.updateStatus(this.settings.settingsLanguage === 'chinese' ? '正在跨段定位' : 'Seeking across segments', {
          canSeek: true, canPause: true, canStop: true,
          isPaused: this.pauseRequested, phase: 'queued', status: this.pauseRequested ? 'paused' : 'running',
        });
        return true;
      }
    }
    return this.seekCurrentAudioToTime(currentTime + delta);
  }

  seekCurrentAudioToTime(seekTime) {
    const audio = this.currentAudio;
    const requestedTime = Number(seekTime);
    if (!audio || !Number.isFinite(requestedTime)) {
      return false;
    }

    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    try {
      audio.currentTime = duration
        ? Math.min(duration, Math.max(0, requestedTime))
        : Math.max(0, requestedTime);
    } catch (error) {
      return false;
    }

    if (!duration) {
      return true;
    }

    const chunkIndex = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    const chunkProgress = duration ? this.getSegmentTiming().fraction : 0;
    this.setReaderState({
      progress: this.readerState.totalChunks ? (chunkIndex + chunkProgress) / this.readerState.totalChunks : 0,
    });
    return true;
  }

  seekCurrentSegmentToTime(time) {
    const session = this.activeSession;
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(time) || session?.seekTarget) return false;
    const index = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    if (!this.isActive(session) || getSpeechParts(session, index).length <= 1) return this.seekCurrentAudioToTime(time);
    const timing = this.getSegmentTiming();
    let localTime = Math.max(0, Math.min(timing.duration, time));
    let part = 0;
    while (part + 1 < timing.durations.length && localTime >= timing.durations[part]) {
      localTime -= timing.durations[part++];
    }
    if (part === (session.currentPartIndex || 0)) return this.seekCurrentAudioToTime(localTime);
    session.seekTarget = { index, part, time: localTime, fromEnd: false };
    session.requestedChunkIndex = index;
    session.requestedPartIndex = part;
    this.notifySessionNavigation(session);
    this.pauseRequested = Boolean(this.pauseRequested || audio.paused);
    audio.pause();
    audio.onended?.();
    this.setReaderState({ canSeek: false, canPause: true, isPaused: this.pauseRequested });
    return true;
  }

  jumpToAdjacentChunk(deltaChunks) {
    const session = this.activeSession;
    const total = Math.max(0, Math.floor(Number(this.readerState.totalChunks) || 0));
    const currentChunk = Math.max(0, Math.floor(Number(this.readerState.currentChunk) || 0));
    const delta = Math.trunc(Number(deltaChunks) || 0);

    if (!this.isActive(session) || !total || !currentChunk || !delta) {
      return false;
    }

    const currentIndex = Math.max(0, Math.min(total - 1, currentChunk - 1));
    const targetIndex = Math.max(0, Math.min(total - 1, currentIndex + delta));
    if (targetIndex === currentIndex) {
      return false;
    }

    session.requestedChunkIndex = targetIndex;
    session.requestedPartIndex = 0;
    session.seekTarget = null;
    this.pauseRequested = false;
    this.notifySessionNavigation(session);

    const audio = this.currentAudio;
    if (audio && typeof audio.pause === 'function') {
      audio.pause();
    }
    if (audio && typeof audio.onended === 'function') {
      audio.onended();
    }

    this.updateStatus(`${getSpeechEngineLabel(this.settings)} jump ${targetIndex + 1}/${total}`, {
      canPause: true,
      ...getChunkNavigationState(targetIndex + 1, total),
      canSeek: false,
      canStop: true,
      currentChunk: targetIndex + 1,
      currentText: previewText(session.chunks?.[targetIndex] || ''),
      isPaused: false,
      phase: 'queued',
      preparationStatus: '',
      progress: total ? targetIndex / total : 0,
      status: 'running',
      totalChunks: total,
    });

    return true;
  }

  async pauseOrResume() {
    const audio = this.activeSession?.seekTarget ? null : this.currentAudio;

    if (this.activeSession && this.activeSession.kind === 'audio-export') {
      new Notice('CosyVoice: audio export can be stopped but not paused.', 6000);
      return;
    }

    if (!audio) {
      if (!this.activeSession) {
        new Notice('CosyVoice: nothing is playing.');
        return;
      }

      this.pauseRequested = !this.pauseRequested;
      this.updateStatus(this.pauseRequested ? 'CosyVoice paused' : 'CosyVoice waiting', {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: false,
        canStop: true,
        isPaused: this.pauseRequested,
        phase: this.pauseRequested ? 'paused' : 'synthesizing',
        status: this.pauseRequested ? 'paused' : 'running',
      });
      return;
    }

    if (audio.paused) {
      this.pauseRequested = false;
      await audio.play();
      this.updateStatus('CosyVoice playing', {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: false,
        phase: 'playing',
        status: 'running',
      });
    } else {
      this.pauseRequested = true;
      audio.pause();
      void this.runUserAction('Save reading position', () => this.saveSessionReadingPosition(this.activeSession));
      this.updateStatus('CosyVoice paused', {
        canPause: true,
        ...getChunkNavigationState(this.readerState.currentChunk, this.readerState.totalChunks),
        canSeek: true,
        canStop: true,
        isPaused: true,
        phase: 'paused',
        status: 'paused',
      });
    }
  }

  async cancelSessionOperations(session) {
    if (session) {
      session.stopped = true;
      for (const controller of session.systemSpeechControllers || []) controller.abort();
      this.notifySessionNavigation(session);
    }

    if (session && session.pdfLoadingTask && typeof session.pdfLoadingTask.destroy === 'function') {
      try {
        await session.pdfLoadingTask.destroy();
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Could not cancel PDF loading`, error);
      }
      session.pdfLoadingTask = null;
    }

    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    if (this.currentRequests instanceof Set) {
      for (const request of Array.from(this.currentRequests)) {
        request.destroy();
      }
      this.currentRequests.clear();
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.releaseAudioSource(this.currentAudio);
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio = null;
    }
  }

  async stopReading(options = {}) {
    if (!options.preservePendingActions) this.webActionSequence = (this.webActionSequence || 0) + 1;
    const previous = this.activeSession;
    await this.saveSessionReadingPosition(previous);
    this.transitionSessionPhase(previous, 'stopping');
    this.sequence += 1;
    this.pauseRequested = false;
    await this.cancelSessionOperations(previous);
    this.transitionSessionPhase(previous, 'idle');

    this.activeSession = null;
    this.updateStatus('CosyVoice idle', createReaderState());

    if (previous && this.settings && this.settings.cleanupCache) {
      await this.cleanupSessionFiles(previous);
    }

    if (!options.silent) {
      new Notice('CosyVoice: stopped.');
    }
  }

  async cleanupSessionFiles(session, options = {}) {
    if (!session || !Array.isArray(session.files)) {
      return;
    }

    const preservedPaths = new Set(
      (Array.isArray(options.preservePaths) ? options.preservePaths : [])
        .filter(Boolean)
        .map((filePath) => path.resolve(filePath))
    );
    for (const filePath of session.files) {
      if (preservedPaths.has(path.resolve(filePath))) {
        continue;
      }
      await this.removeTempFile(filePath);
    }
  }

  async removeTempFile(filePath) {
    if (!this.cacheDir || !isInsideDirectory(filePath, this.cacheDir)) {
      return;
    }

    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        console.warn(`[${PLUGIN_ID}] Could not remove temp file`, filePath, error);
      }
    }
  }

  isActive(session) {
    return Boolean(session && this.activeSession === session && !session.stopped && session.id === this.sequence);
  }

  updateStatus(text, patch = {}) {
    if (patch && patch.phase && this.activeSession) {
      this.transitionSessionPhase(this.activeSession, patch.phase);
    }
    if (this.statusBar) {
      this.statusBar.setText(text);
    }
    this.setReaderState({
      label: text,
      ...patch,
    });
  }

  async writeRuntimeLog(stage, _details = {}) {
    if (!this.logPath || !this.settings || !this.settings.diagnosticLogging) {
      return;
    }

    const event = createSafeRuntimeLogEvent(stage, this.settings);
    if (!event) {
      return;
    }

    const line = `${JSON.stringify(event)}\n`;

    try {
      const stat = await fs.promises.stat(this.logPath).catch((error) => {
        if (error && error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });
      if (stat && stat.size + Buffer.byteLength(line, 'utf8') > RUNTIME_LOG_MAX_BYTES) {
        await fs.promises.unlink(this.logPath);
      }
      await fs.promises.appendFile(this.logPath, line, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Could not write runtime log`, error);
    }
  }
};

class CosyVoiceReaderView extends ItemView {
  translate(text) {
    if (this.plugin.settings?.settingsLanguage !== 'chinese') return translateInterface(this.plugin.settings?.settingsLanguage, text);
    return {
      'Voice Reader': '语音朗读', 'Voice reader controls': '朗读控制面板',
      'Previous chunk': '上一段', 'Next chunk': '下一段', 'Reading progress': '朗读进度',
      'Read selection': '朗读选中文字', 'Read from selection': '从选中位置朗读',
      'Read file': '朗读全文', 'Export audio': '导出音频',
      'Reading text': '朗读视图',
      'Reading view': '朗读视图',
      'Reading toolbar': '朗读工具栏',
      'Focus reading': '专注朗读',
      'Open reading view': '进入朗读视图',
      'Exit reading view': '退出朗读视图',
      'Export & insert audio': '导出并插入音频', 'Retry merge only': '仅重试拼接',
      'Resume file': '从上次位置续读', 'Resume': '继续', 'Pause': '暂停', 'Stop': '停止',
      'Resume reading (or press Space)': '继续朗读（也可按空格键）',
      'Pause reading (or press Space)': '暂停朗读（也可按空格键）',
      'Export all, selected, or remaining audio from the current note, PDF, HTML or web page': '导出当前笔记、PDF、HTML 或网页的全部、选中部分或选中位置以后的音频',
      'Export audio and insert it into the current Markdown note': '导出音频并插入当前 Markdown 笔记',
      'Audio can be inserted into Markdown notes, not PDF, HTML or web pages': '音频只能插入 Markdown 笔记，不能插入 PDF、HTML 或网页',
      'Reuse the kept synthesized segments without making any TTS API requests': '复用保留的分段音频，不再调用语音 API',
      'Phase': '阶段', 'Source': '来源', 'Text': '文本',
      'Overall progress': '全文进度', 'Current segment': '当前段',
      'Current segment progress': '当前段播放进度', 'Waiting for audio': '等待音频',
    }[text] || text;
  }

  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.handlePanelKeydown = this.handlePanelKeydown.bind(this);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.translate('Voice Reader');
  }

  getIcon() {
    return 'volume-2';
  }

  async onOpen() {
    this.plugin.registerReaderView(this);
  }

  async onClose() {
    this.sidebarOutline?.destroy();
    this.plugin.unregisterReaderView(this);
  }

  render() {
    if (this.sidebarOutline?.root.contains(this.sidebarOutline.root.ownerDocument.activeElement)) return;
    if (this.volumeInteracting) return;
    if (this.chunkSeekEditing && this.chunkSeekAudio === this.plugin.currentAudio
      && this.plugin.readerState?.canSeek) return;
    this.chunkSeekEditing = false;
    const root = this.contentEl || this.containerEl.children[1] || this.containerEl;
    const state = this.plugin.readerState || createReaderState();

    this.sidebarOutline?.root.remove();
    root.empty();
    root.addClass('note-reader-cosyvoice-view');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', this.translate('Voice reader controls'));
    root.addEventListener('keydown', this.handlePanelKeydown);

    const header = root.createDiv({ cls: 'note-reader-cosyvoice-panel-header' });
    header.createEl('h3', { text: this.translate('Voice Reader') });
    header.createDiv({ cls: `note-reader-cosyvoice-state is-${state.status}`, text: state.label });

    const progressWrap = root.createDiv({ cls: 'note-reader-cosyvoice-progress-wrap' });
    const progressHeading = progressWrap.createDiv({ cls: 'note-reader-progress-heading' });
    progressHeading.createDiv({ cls: 'note-reader-cosyvoice-section-label', text: this.translate('Overall progress') });
    this.createIconButton(progressHeading, 'locate-fixed', this.plugin.settings.settingsLanguage === 'chinese'
      ? '定位正在朗读的位置' : 'Locate current reading', () => this.plugin.locateCurrentReading(),
      !this.plugin.activeSession || this.plugin.activeSession.kind === 'audio-export', { triggerOnPointerDown: true });
    const progressControls = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-progress-controls' });
    this.createIconButton(progressControls, 'skip-back', 'Previous chunk', () => {
      this.plugin.jumpToAdjacentChunk(-1);
    }, !state.canPreviousChunk, { triggerOnPointerDown: true });
    const canNavigateProgress = state.canSeek || state.canNextChunk || state.canPreviousChunk;
    const progressTrack = progressControls.createDiv({
      cls: `note-reader-cosyvoice-progress-track${canNavigateProgress ? ' is-seekable' : ''}`,
    });
    const progressFill = progressTrack.createDiv({ cls: 'note-reader-cosyvoice-progress-fill' });
    progressFill.style.width = `${Math.round(state.progress * 100)}%`;
    const progressInput = progressTrack.createEl('input', {
      cls: 'note-reader-cosyvoice-progress-input',
      attr: {
        'aria-label': `${this.translate('Reading progress')} - ${this.plugin.settings?.settingsLanguage === 'chinese'
          ? '跳转到指定分段的开头；未合成的分段需要等待合成。'
          : 'Jump to the start of a segment; unprepared segments require synthesis.'}`,
        max: '1000',
        min: '0',
        step: '1',
        'aria-description': this.plugin.settings?.settingsLanguage === 'chinese'
          ? '跳转到指定分段的开头；未合成的分段需要等待合成。'
          : 'Jump to the start of a segment; unprepared segments require synthesis.',
        type: 'range',
        value: String(Math.round(state.progress * 1000)),
      },
    });
    progressInput.disabled = !canNavigateProgress;
    progressInput.addEventListener('pointerdown', (event) => {
      if (!canNavigateProgress || event.button !== 0) return;
      const bounds = progressInput.getBoundingClientRect();
      if (!bounds.width) return;
      event.preventDefault();
      event.stopPropagation();
      this.seekToSegment(clampProgress((event.clientX - bounds.left) / bounds.width));
    });
    progressInput.addEventListener('input', () => {
      if (!canNavigateProgress) {
        return;
      }
      const requestedProgress = Number(progressInput.value) / 1000;
      this.seekToSegment(requestedProgress);
    });
    this.createIconButton(progressControls, 'skip-forward', 'Next chunk', () => {
      this.plugin.jumpToAdjacentChunk(1);
    }, !state.canNextChunk, { triggerOnPointerDown: true });

    const meta = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-meta' });
    meta.createSpan({ text: formatProgressLabel(state) });
    meta.createSpan({ text: `${Math.round(state.progress * 100)}%` });

    const estimate = estimatePlayback(this.plugin.activeSession,
      Math.max(0, (state.currentChunk || 1) - 1),
      this.plugin.getSegmentTiming().current, ['system-tts', 'byok-tts'].includes(this.plugin.activeSession?.speechEngine) ? 1 : this.plugin.settings.speed,
      normalizeSpeed(this.plugin.settings.playbackSpeed));
    if (estimate) {
      const zh = this.plugin.settings.settingsLanguage === 'chinese';
      const timing = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-meta' });
      timing.style.flexWrap = 'wrap';
      timing.style.gap = '4px 12px';
      timing.createSpan({ text: `${zh ? '预计总时长' : 'Estimated total'} ${formatDuration(estimate.total)}` });
      timing.createSpan({ text: `${zh ? '预计剩余' : 'Estimated remaining'} ${formatDuration(estimate.remaining)}` });
      if (estimate.partial) progressWrap.createDiv({
        cls: 'note-reader-cosyvoice-meta',
        text: zh ? '仅计已解析页面，随解析更新' : 'Parsed pages only; updates as parsing continues',
      });
      timing.title = zh ? '未合成部分按文本估算；不含网络等待和暂停时间。' : 'Text estimate for unsynthesized chunks; excludes network waits and pauses.';
    }

    this.createChunkSeekPanel(root, state);
    const seekControls = root.createDiv({ cls: 'note-reader-cosyvoice-actions' });
    const zhControls = this.plugin.settings?.settingsLanguage === 'chinese';
    this.createActionButton(seekControls, 'rotate-ccw', zhControls ? '后退 5 秒' : 'Back 5s', () => {
      this.plugin.seekCurrentAudioBySeconds(-KEYBOARD_SEEK_SECONDS);
    }, !state.canSeek && !this.plugin.activeSession?.seekTarget, { triggerOnPointerDown: true });
    this.createActionButton(seekControls, 'rotate-cw', zhControls ? '前进 5 秒' : 'Forward 5s', () => {
      this.plugin.seekCurrentAudioBySeconds(KEYBOARD_SEEK_SECONDS);
    }, !state.canSeek && !this.plugin.activeSession?.seekTarget, { triggerOnPointerDown: true });

    const playbackOptions = root.createDiv({ cls: 'note-reader-cosyvoice-playback-options' });
    this.createSpeedPanel(playbackOptions);
    this.createVolumePanel(playbackOptions);

    const actions = root.createDiv({ cls: 'note-reader-cosyvoice-actions' });
    const canExportFile = typeof this.plugin.canExportCurrentFile !== 'function'
      || this.plugin.canExportCurrentFile();
    const canInsertExport = typeof this.plugin.canInsertAudioExportIntoCurrentNote !== 'function'
      || this.plugin.canInsertAudioExportIntoCurrentNote();
    this.createActionButton(actions, 'play', 'Read selection', () => {
      this.runPluginAction('Read selection', () => this.plugin.readSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, 'list-start', 'Read from selection', () => {
      this.runPluginAction('Read from selection', () => this.plugin.readFromSelection());
    }, false, { triggerOnPointerDown: true });
    this.createActionButton(actions, 'file-text', 'Read file', () => {
      this.runPluginAction('Read file', () => this.plugin.readCurrentNote());
    }, false, { triggerOnPointerDown: true });
    this.sidebarOutline ||= new SidebarOutline(this.plugin, root.ownerDocument);
    root.appendChild(this.sidebarOutline.root); this.sidebarOutline.refresh();
    const extra = root.createEl('details', { cls: 'note-reader-sidebar-extra' });
    extra.open = Boolean(this.extraOpen);
    extra.createEl('summary', { text: zhControls ? '更多操作' : 'More actions' });
    extra.addEventListener('toggle', () => { this.extraOpen = extra.open; });
    const secondaryActions = extra.createDiv({ cls: 'note-reader-cosyvoice-actions' });
    this.createActionButton(secondaryActions, 'audio-lines', 'Reading toolbar', () => {
      this.runPluginAction('Reading toolbar', () => this.plugin.toggleReadingToolbar());
    }, false, { triggerOnPointerDown: true });
    const readingViewButton = this.createActionButton(secondaryActions, 'book-open', 'Focus reading', () => {
      this.runPluginAction('Focus reading', () => this.plugin.toggleDocumentView());
    }, false, { triggerOnPointerDown: true });
    readingViewButton.setAttribute('aria-pressed', String(Boolean(this.plugin.documentViews?.size)));
    readingViewButton.setAttribute('aria-description', this.translate(this.plugin.documentViews?.size ? 'Exit reading view' : 'Open reading view'));
    this.createActionButton(secondaryActions, 'download', 'Export audio', () => {
      this.runPluginAction('Export audio', () => this.plugin.exportCurrentFileAudio({ insertAfterExport: false }));
    }, !canExportFile, {
      title: 'Export all, selected, or remaining audio from the current note, PDF, HTML or web page',
      triggerOnPointerDown: true,
    });
    this.createActionButton(secondaryActions, 'paperclip', 'Export & insert audio', () => {
      this.runPluginAction('Export and insert audio', () => this.plugin.exportCurrentFileAudio({ insertAfterExport: true }));
    }, !canInsertExport, {
      title: canInsertExport
        ? 'Export audio and insert it into the current Markdown note'
        : 'Audio can be inserted into Markdown notes, not PDF, HTML or web pages',
      triggerOnPointerDown: true,
    });
    if (this.plugin.settings.copilotChatEnabled !== false) this.createActionButton(secondaryActions, 'messages-square', zhControls ? '聊天朗读' : 'Read Copilot chat', () => {
      this.runPluginAction('Read Copilot chat', () => this.plugin.openCopilotChat());
    }, this.plugin.activeSession?.kind === 'audio-export', { triggerOnPointerDown: true });
    const hasPendingAudioMerge = typeof this.plugin.hasPendingAudioMerge === 'function'
      && this.plugin.hasPendingAudioMerge();
    if (hasPendingAudioMerge) {
      this.createActionButton(actions, 'refresh-cw', 'Retry merge only', () => {
        this.runPluginAction('Retry merge only', () => this.plugin.retryPendingAudioMerge());
      }, Boolean(this.plugin.activeSession), {
        title: 'Reuse the kept synthesized segments without making any TTS API requests',
        triggerOnPointerDown: true,
      });
    }
    const canResumeFile = typeof this.plugin.canResumeCurrentFile === 'function'
      && this.plugin.canResumeCurrentFile();
    this.createActionButton(actions, 'history', 'Resume file', () => {
      this.runPluginAction('Resume file', () => this.plugin.resumeCurrentFile());
    }, !canResumeFile, { triggerOnPointerDown: true });
    this.createActionButton(
      seekControls,
      state.isPaused ? 'play' : 'pause',
      state.isPaused ? 'Resume' : 'Pause',
      () => {
        void this.plugin.pauseOrResume();
      },
      !state.canPause,
      {
        title: state.isPaused
          ? 'Resume reading (or press Space)'
          : 'Pause reading (or press Space)',
        triggerOnPointerDown: true,
      }
    );
    this.createActionButton(
      seekControls,
      'square',
      'Stop',
      () => {
        this.runPluginAction('Stop', () => this.plugin.stopReading());
      },
      !state.canStop,
      { triggerOnPointerDown: true }
    );

    const details = extra.createDiv({ cls: 'note-reader-cosyvoice-details' });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: this.translate('Phase') });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-value', text: preparationStatusText(state, this.plugin.settings.settingsLanguage) || state.phase });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: this.translate('Source') });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-value', text: state.source || '-' });

    if (state.error) {
      root.createDiv({ cls: 'note-reader-cosyvoice-error', text: state.error });
    }

    const preview = root.createDiv({ cls: 'note-reader-cosyvoice-preview' });
    preview.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: this.translate('Text') });
    preview.createDiv({
      cls: 'note-reader-cosyvoice-preview-text',
      text: state.currentText || '-',
    });
  }

  seekToSegment(progress) {
    const state = this.plugin.readerState;
    const count = this.plugin.activeSession?.chunks?.length || state.totalChunks;
    if (!count) return;
    const target = Math.min(count - 1, Math.floor(clampProgress(progress) * count));
    const current = Math.max(0, (state.currentChunk || 1) - 1);
    if (target !== current) this.plugin.jumpToAdjacentChunk(target - current);
    else this.plugin.seekCurrentSegmentToTime(0);
  }

  createChunkSeekPanel(parent, state) {
    const audio = this.plugin.currentAudio;
    const timing = this.plugin.getSegmentTiming();
    const duration = timing.duration;
    const enabled = Boolean(state.canSeek && duration > 0 && !this.plugin.activeSession?.seekTarget);
    const panel = parent.createDiv({ cls: 'note-reader-cosyvoice-chunk-seek' });
    const header = panel.createDiv({ cls: 'note-reader-cosyvoice-meta' });
    header.createSpan({ text: `${this.translate('Current segment')} ${state.currentChunk || 0} / ${state.totalChunks || 0}` });
    const current = timing.current;
    const timeLabel = header.createSpan({ text: enabled
      ? `${formatDuration(current)} / ${formatDuration(duration)}` : this.translate('Waiting for audio') });
    const slider = panel.createEl('input', { attr: {
      type: 'range', min: '0', max: '1000', step: '1',
      value: String(duration > 0 ? Math.round(current / duration * 1000) : 0),
      'aria-label': this.translate('Current segment progress'),
    } });
    slider.disabled = !enabled;
    const begin = () => {
      if (!enabled) return;
      this.chunkSeekEditing = true;
      this.chunkSeekAudio = audio;
    };
    const finish = () => { this.chunkSeekEditing = false; };
    slider.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !enabled) return;
      begin();
      try { slider.setPointerCapture(event.pointerId); } catch (_) { finish(); }
    });
    slider.addEventListener('keydown', begin);
    slider.addEventListener('blur', () => { finish(); this.render(); });
    slider.addEventListener('pointercancel', () => { finish(); this.render(); });
    slider.addEventListener('lostpointercapture', finish);
    slider.addEventListener('pointerup', finish);
    slider.addEventListener('input', () => {
      timeLabel.textContent = `${formatDuration(Number(slider.value) / 1000 * duration)} / ${formatDuration(duration)}`;
    });
    slider.addEventListener('change', () => {
      if (enabled && audio === this.plugin.currentAudio && this.plugin.readerState.canSeek
        && !this.plugin.activeSession?.seekTarget) {
        this.plugin.seekCurrentSegmentToTime(Number(slider.value) / 1000 * duration);
      }
      finish();
      this.render();
    });
  }

  createVolumePanel(parent) {
    const zh = this.plugin.settings?.settingsLanguage === 'chinese';
    const panel = parent.createDiv({ cls: 'note-reader-cosyvoice-speed-panel' });
    const header = panel.createDiv({ cls: 'note-reader-cosyvoice-speed-header' });
    header.createSpan({ text: zh ? '\u97f3\u91cf' : 'Volume' });
    const volume = normalizeVolume(this.plugin.settings?.playbackVolume);
    const label = header.createSpan({ text: `${Math.round(volume * 100)}%` });
    const slider = panel.createEl('input', { attr: {
      type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(volume * 100)),
      'aria-label': zh ? '\u64ad\u653e\u97f3\u91cf' : 'Playback volume',
    } });
    slider.style.width = '100%';
    slider.addEventListener('pointerdown', (event) => {
      if (Number.isFinite(event.button) && event.button !== 0) return;
      this.volumeInteracting = true;
      try { slider.setPointerCapture(event.pointerId); } catch (_) { this.volumeInteracting = false; }
    });
    const release = () => { this.volumeInteracting = false; };
    slider.addEventListener('lostpointercapture', release);
    slider.addEventListener('pointerup', release);
    slider.addEventListener('pointercancel', release);
    slider.addEventListener('blur', release);
    slider.addEventListener('keydown', () => { this.volumeInteracting = true; });
    slider.addEventListener('keyup', release);
    slider.addEventListener('input', () => {
      const next = this.plugin.setPlaybackVolume(Number(slider.value) / 100);
      label.textContent = `${Math.round(next * 100)}%`;
    });
    slider.addEventListener('change', () => {
      this.runPluginAction('Save playback volume', () => this.plugin.saveSettings());
    });
  }

  createSpeedPanel(parent) {
    const currentSpeed = normalizeSpeed(this.plugin.settings && this.plugin.settings.playbackSpeed);
    const panel = parent.createDiv({ cls: 'note-reader-cosyvoice-speed-panel' });
    const header = panel.createDiv({ cls: 'note-reader-cosyvoice-speed-header' });
    header.createSpan({ cls: 'note-reader-cosyvoice-detail-label', text: this.plugin.settings?.settingsLanguage === 'chinese' ? '播放倍速' : 'Playback speed' });
    header.title = this.plugin.settings?.settingsLanguage === 'chinese'
      ? '立即调节播放倍速，不重新合成音频，不改变导出文件。'
      : 'Immediate playback speed; no resynthesis or changes to exported files.';
    header.createSpan({ cls: 'note-reader-cosyvoice-speed-current', text: formatSpeedLabel(currentSpeed) });

    const options = panel.createDiv({ cls: 'note-reader-cosyvoice-speed-options' });
    for (const speed of getSpeedPresets()) {
      const isActive = Math.abs(currentSpeed - speed) < 0.001;
      const speedTitle = this.plugin.settings?.settingsLanguage === 'chinese'
        ? `播放倍速设为 ${formatSpeedLabel(speed)}` : `Set playback speed to ${formatSpeedLabel(speed)}`;
      const button = options.createEl('button', {
        cls: `note-reader-cosyvoice-speed-option${isActive ? ' is-active' : ''}`,
        text: formatSpeedLabel(speed),
        attr: {
          'aria-label': speedTitle,
          'aria-pressed': String(isActive),
        },
      });
      this.wireButtonAction(button, () => {
        this.runPluginAction('Set playback speed', () => this.plugin.setPlaybackSpeed(speed));
      }, { triggerOnPointerDown: true });
    }
  }

  handlePanelKeydown(event) {
    this.plugin.handleReaderKeydown(event, { allowPause: true, focusPanel: event.currentTarget });
  }

  focusPanel(panel) {
    focusElementWithoutScroll(panel);
  }

  runPluginAction(label, action) {
    if (this.plugin && typeof this.plugin.runUserAction === 'function') {
      void this.plugin.runUserAction(label, action);
      return;
    }
    try {
      const result = action();
      if (result && typeof result.catch === 'function') {
        void result.catch((error) => console.error(`[${PLUGIN_ID}] ${label} failed`, error));
      }
    } catch (error) {
      console.error(`[${PLUGIN_ID}] ${label} failed`, error);
    }
  }

  createIconButton(parent, icon, label, onClick, disabled = false, options = {}) {
    label = this.translate(label);
    const button = parent.createEl('button', {
      cls: 'note-reader-cosyvoice-icon-button',
      attr: {
        'aria-label': label,
      },
    });
    button.disabled = disabled;

    if (typeof setIcon === 'function') {
      setIcon(button, icon);
    }

    this.wireButtonAction(button, onClick, options);
    return button;
  }

  createActionButton(parent, icon, label, onClick, disabled = false, options = {}) {
    label = this.translate(label);
    const button = parent.createEl('button', {
      cls: 'note-reader-cosyvoice-action',
      attr: {
        'aria-label': [this.translate('Pause'), this.translate('Resume')].includes(label) ? this.translate(options.title || label) : label,
        'aria-description': this.translate(options.title || label),
      },
    });
    button.disabled = disabled;

    const iconEl = button.createSpan({ cls: 'note-reader-cosyvoice-action-icon' });
    if (typeof setIcon === 'function') {
      setIcon(iconEl, icon);
    }

    button.createSpan({ cls: 'note-reader-cosyvoice-action-label', text: label });
    this.wireButtonAction(button, onClick, options);
    return button;
  }

  wireButtonAction(button, onClick, options = {}) {
    let pointerHandled = false;
    if (options.triggerOnPointerDown) {
      button.addEventListener('pointerdown', (event) => {
        if (button.disabled || event.defaultPrevented || (Number.isFinite(event.button) && event.button !== 0)) {
          return;
        }

        pointerHandled = true;
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      });
    }

    button.addEventListener('click', (event) => {
      if (button.disabled) return;
      if (pointerHandled) {
        pointerHandled = false;
        event.preventDefault();
        return;
      }

      onClick(event);
    });
  }
}

class CosyVoiceReaderSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide() {
    this.displaySequence = (this.displaySequence || 0) + 1;
  }

  displaySystemSpeechSettings(containerEl, language) {
    const Setting = localizedSetting(ObsidianSetting, language);
    const zh = language === 'chinese';
    const label = (en, cn) => zh ? cn : en;
    const plugin = this.plugin;
    const supported = ['win32', 'darwin'].includes(os.platform());
    const sequence = this.displaySequence;
    const redraw = () => {
      if (sequence === this.displaySequence && !plugin.systemSpeechUnloaded
        && plugin.settings.speechEngine === 'system-tts') this.display();
    };
    new Setting(containerEl).setName(label('Local speech privacy', '系统本地语音与隐私'))
      .setDesc(label(
        'Uses installed Windows SAPI or macOS say voices. No API key, local model, automatic download or cloud fallback. Offline voices keep reading text on this computer, like local CosyVoice. Downloads need internet; exported audio and vault sync have separate privacy implications.',
        '调用已安装的 Windows SAPI 或 macOS say 音色，无需 API 密钥或本地模型，不自动下载，也不回退到云端。离线音色与本地 CosyVoice 一样让朗读正文留在本机。下载需要联网；导出音频和库同步的隐私需另外考虑。'));
    const voices = plugin.systemVoices || [];
    const key = getSystemVoiceKey();
    const selected = normalizeSystemVoice(plugin.settings[key]);
    const status = !supported ? label('Windows and macOS only.', '仅支持 Windows 和 macOS。')
      : plugin.systemVoicesError ? label('No usable voice list. Check installed voices, then refresh.', '无法获取可用音色列表，请检查已安装音色后刷新。')
      : plugin.systemVoicesReady ? label(`${voices.length} installed voices accessible to this plugin.`, `检测到 ${voices.length} 种插件可调用的已安装音色。`)
      : label('Detecting installed voices...', '正在检测已安装音色……');
    new Setting(containerEl).setClass('note-reader-cosyvoice-system-voice')
      .setName(label('Installed system voice', '已安装的系统音色')).setDesc(status)
      .addDropdown(dropdown => {
        dropdown.addOption('', label('System default (already installed)', '系统默认（已安装音色）'));
        for (const voice of voices) {
          const gender = voice.gender === 'Male' ? label('male', '男声') : voice.gender === 'Female' ? label('female', '女声') : '';
          dropdown.addOption(voice.id, [voice.name, voice.language, gender].filter(Boolean).join(' / '));
        }
        if (selected && !voices.some(voice => voice.id === selected)) {
          dropdown.addOption(selected, label(`Unavailable: ${selected}`, `不可用：${selected}`));
        }
        dropdown.setValue(selected).setDisabled(!supported).onChange(async value => {
          plugin.settings[key] = normalizeSystemVoice(value);
          await plugin.saveSettings();
        });
      })
      .addButton(button => button.setButtonText(label('Refresh', '刷新')).setDisabled(!supported)
        .onClick(async () => {
          button.setDisabled(true);
          try { await plugin.loadSystemSpeechVoices(true); }
          catch { new Notice(label('Could not load installed voices. See the system voice help below.', '无法加载已安装音色，请查看下方系统音色帮助。'), 8000); }
          finally { redraw(); }
        }))
      .addButton(button => button.setButtonText(label('Preview', '试听')).setDisabled(!supported || !voices.length || Boolean(plugin.systemVoicesError))
        .onClick(() => {
          if (plugin.settings.speechEngine !== 'system-tts') return;
          if (plugin.activeSession) {
            new Notice(label('Stop the current reading or export before previewing.', '请先停止当前朗读或导出，再试听音色。'));
            return;
          }
          const currentVoice = normalizeSystemVoice(plugin.settings[key]);
          const voice = voices.find(item => item.id === currentVoice) || (!currentVoice ? voices[0] : null);
          const sample = /^zh/i.test(voice?.language || '')
            ? '这是系统本地语音试听。朗读文本在本机处理。' : 'This is a local system voice preview. Reading text stays on this computer.';
          void plugin.runUserAction(label('System voice preview', '系统音色试听'), () => plugin.startReading(sample, 'system voice preview', { plainText: true }));
        }));
    new Setting(containerEl).setName(label('Playback speed', '播放倍速'))
      .setDesc(label('System speech is synthesized at its normal pace. Use the reader panel playback rate and volume controls; exported WAV audio remains at normal pace.',
        '系统语音按正常语速合成。使用朗读面板调节播放倍速和音量；导出的 WAV 音频保持正常语速。'));
    new Setting(containerEl).setName(label('Windows Narrator natural voices: no direct synthesis', 'Windows 讲述人自然音色：不能直接合成'))
      .setDesc(label(
        'This plugin cannot currently call Windows Narrator Natural / Natural HD voices for direct audio synthesis, even after download. Microsoft does not currently provide a supported public interface for this plugin to use those Narrator voices; Windows system speech uses SAPI, not Narrator. Downloading again or refreshing cannot unlock them. Alternatively, open Reading text and explicitly start Narrator to use its selected natural voice; plugin pause, seek, sentence sync and export do not control Narrator. This limitation does not apply to macOS voices or Microsoft online speech services.',
        '当前插件不能调用 Windows 讲述人的 Natural / Natural HD 自然音色进行直接音频合成，即使已下载安装也不例外。微软目前尚未提供可供本插件受支持地调用这些讲述人音色的公开接口；Windows 系统语音使用 SAPI，并非讲述人。重复下载或刷新不能解锁。替代方式：打开“朗读正文”并主动启动讲述人，使用讲述人设置中的自然音色；插件的暂停、跳转、句子同步和导出不能控制讲述人。此限制不针对 macOS 音色或微软在线语音服务。'));
    new Setting(containerEl).setName(label('Windows: voice downloads and compatibility', 'Windows：音色下载与兼容性'))
      .setDesc(label(
        'For ordinary system voices usable by this plugin: Settings -> Time & language -> Speech -> Manage voices -> Add voices; then Refresh above. Narrator-only downloads are separate: recent Windows 11 uses Settings -> Accessibility -> Narrator (or Win+Ctrl+N) -> Narrator\'s voice -> Add voices -> Add. Older layouts may say Add natural voices / Add legacy voices. Downloading Narrator Natural / Natural HD voices does not enable direct synthesis by this plugin; use Reading text with Narrator instead. Do not change the registry to expose them.',
        '安装本插件可用的普通系统音色：设置 → 时间和语言 → 语音 → 管理语音 → 添加语音，安装后点击上方刷新。仅供讲述人使用的音色另行下载：新版 Windows 11 为设置 → 辅助功能 → 讲述人（或按 Win+Ctrl+N）→ 讲述人的声音 → 添加语音 → 添加。旧版界面可能显示“添加自然语音”或“添加旧版语音”。下载讲述人的 Natural / Natural HD 自然音色不会使本插件获得直接合成能力，可改用“朗读正文”配合讲述人；不建议修改注册表强行开放。'))
      .addButton(button => button.setButtonText(label('Microsoft help', '微软官方步骤')).onClick(() => {
        const url = 'https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices';
        if (!openExternalUrl(url)) new Notice(url, 8000);
      }));
    new Setting(containerEl).setName(label('macOS: more / enhanced voices', 'macOS：更多音色 / 增强音色'))
      .setDesc(label(
        'System Settings -> Accessibility -> Read & Speak (Spoken Content on older versions) -> System voice -> manage voices / download. Choose the language and an offered enhanced voice, finish downloading, then refresh above. Names vary by macOS version; Siri-only voices may not appear in say. Downloading is optional.',
        '系统设置 → 辅助功能 → 朗读与说话（旧版为朗读内容）→ 系统声音 → 管理声音 / 下载。选择语言及可用的增强音色，完成下载后点击上方刷新。不同 macOS 版本名称可能不同；仅供 Siri 使用的音色可能不会出现在 say 列表中。下载并非必需。'))
      .addButton(button => button.setButtonText(label('Apple help', '苹果官方步骤')).onClick(() => {
        const url = 'https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac';
        if (!openExternalUrl(url)) new Notice(url, 8000);
      }));
    if (supported && (!plugin.systemVoicesReady || plugin.systemVoicePromise)) {
      void plugin.loadSystemSpeechVoices().catch(() => {}).finally(redraw);
    }
  }

  display() {
    this.displaySequence = (this.displaySequence || 0) + 1;
    let { containerEl } = this;
    containerEl.empty();

    const settingsLanguage = normalizeSettingsLanguage(this.plugin.settings.settingsLanguage);
    const Setting = localizedSetting(ObsidianSetting, settingsLanguage);
    const ui = getSettingsUiText(settingsLanguage);
    const selectedSpeechEngine = normalizeSpeechEngine(this.plugin.settings.speechEngine);
    const microsoftVoicePresets = getMicrosoftVoicePresets(settingsLanguage);
    const commonVoiceIds = new Set(microsoftVoicePresets.map(([id]) => id));

    createSettingsHeader(containerEl, settingsLanguage, async value => {
      this.plugin.settings.settingsLanguage = normalizeSettingsLanguage(value);
      await this.plugin.saveSettings();
      this.plugin.renderReaderViews();
      this.display();
    });

    const pages = createSettingsPages(containerEl, settingsLanguage, this.settingsPage, page => { this.settingsPage = page; });
    new Setting(pages.privacy)
      .setName(translateInterface(settingsLanguage, 'General privacy (all speech engines)', '通用隐私说明（适用于所有语音模式）'))
      .setDesc(translateInterface(settingsLanguage,
        'The plugin provides no developer-operated relay for reading text or API keys and has no built-in usage telemetry. Online reading sends text to your selected speech service or configured endpoint. Local wrappers and third-party programs control their own network behavior.',
        '插件不提供用于中转朗读正文或 API 密钥的开发者服务器，也不内置使用情况遥测。在线朗读文本发送给你选择或配置的语音服务；本地包装脚本、第三方程序的网络行为由它们自身决定。'));
    new Setting(pages.privacy)
      .setName(translateInterface(settingsLanguage, 'What may be stored locally', '哪些数据可能保存在本地'))
      .setDesc(translateInterface(settingsLanguage,
        'Reading may create temporary text and audio, removed according to cleanup settings. Configuration, exported audio, optional reading history and diagnostic logs may remain locally. Provider training and retention policies are separate; see the notice for each speech mode. Revoking permission cannot recall data already sent.',
        '朗读可能生成临时文本和音频，按清理设置删除。配置、导出音频、可选续读记录及诊断日志可能保存在本地。服务商的训练和留存政策需另行核实，请查看各语音模式的说明；撤销授权不能收回已经发送的数据。'));
    if (!['english','chinese'].includes(settingsLanguage)) new Setting(pages.privacy)
      .setDesc(translateInterface(settingsLanguage, 'Some advanced help remains in English. Interface language does not change the speech voice.'));
    containerEl = pages.engine;
    new Setting(containerEl)
      .setName(ui.speechEngineName)
      .setDesc(ui.speechEngineDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local-cosyvoice', ui.speechEngineLocal)
          .addOption('system-tts', ui.speechEngineSystem)
          .addOption('edge-tts', ui.speechEngineEdge)
          .addOption('azure-speech', ui.speechEngineAzure)
          .addOption('openrouter-tts', ui.speechEngineOpenRouter)
          .addOption('mimo-tts', 'Xiaomi MiMo TTS')
          .addOption('byok-tts', settingsLanguage === 'chinese' ? '自定义语音 API（BYOK）' : 'Custom speech API (BYOK)')
          .setValue(selectedSpeechEngine)
          .onChange(async (value) => {
            this.plugin.settings.speechEngine = normalizeSpeechEngine(value);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (selectedSpeechEngine === 'system-tts') this.displaySystemSpeechSettings(containerEl, settingsLanguage);
    if (selectedSpeechEngine === 'byok-tts') displayByokSettings(this, containerEl, {
      canUseSecrets: hasObsidianSecretStorageUi(this.app),
      credentialError: profile => getRemoteCredentialConfigurationError(profile, this.plugin.vaultBasePath, this.app, 'BYOK API'),
      openPrivacy: () => {
        const button = this.containerEl.ownerDocument.getElementById(pages.privacy.getAttribute('aria-labelledby'));
        button?.click();
        button?.focus();
        button?.scrollIntoView?.({ block: 'nearest' });
      },
    });

    if (selectedSpeechEngine === 'mimo-tts') {
      const zh = settingsLanguage === 'chinese';
      const label = (en, cn) => zh ? cn : en;
      new Setting(containerEl)
        .setName(label('Allow MiMo online processing', '允许 MiMo 在线处理'))
        .setDesc(label(
          'Sends reading text to Xiaomi. Xiaomi states that supplied text is not used for training without prior consent. Zero data retention is NOT confirmed. This switch permits synthesis only, not model training.',
          '朗读文本会发送给小米。小米声明未经事先同意不会将提供的文本用于训练，但未确认零数据保留（ZDR）。此开关仅授权在线合成，不授权模型训练。'))
        .addToggle(toggle => toggle.setValue(this.plugin.settings.mimoConsent === true).onChange(async value => {
          this.plugin.settings.mimoConsent = value;
          await this.plugin.saveSettings();
        }));
      new Setting(containerEl)
        .setName(label('MiMo model and pricing', 'MiMo 模型与价格'))
        .setDesc(label('mimo-v2.5-tts with built-in voices. Listed as temporarily free on 2026-09-27; limits and pricing may change. Speed is a natural-language instruction, not an exact synthesis rate.',
          '使用 mimo-v2.5-tts 官方预置音色。2026-09-27 官方列为限时免费，额度及价格可能变化。合成语速通过自然语言指令控制，不保证精确倍率。'))
        .addButton(button => button.setButtonText(label('Pricing', '官方价格')).onClick(() => window.open('https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go')))
        .addButton(button => button.setButtonText(label('Privacy', '隐私政策')).onClick(() => window.open('https://privacy.mi.com/XiaomiMiMoPlatform/zh_CN/')));
      new Setting(containerEl).setName(label('MiMo completeness protection', 'MiMo 完整性保护'))
        .setDesc(label('Abnormal completion stops reading without automatic resynthesis. Normal completion does not prove every word was spoken.',
          '异常结束会停止朗读，不自动重新合成。正常结束标记仍不能证明每个字都已读出。'));
      new Setting(containerEl).setName(label('MiMo chunk character cap', 'MiMo 每段字符上限'))
        .setDesc(label('Client precaution, not an API limit. Default 200; adjustable 50-2000. Effective size is the smaller of this cap and online chunk limits. Smaller chunks increase request count.',
          '客户端保守值，不是接口上限。默认 200，可调 50–2000；与在线分段设置取较小值。较小的分段会增加请求次数。'))
        .addText(text => text.setValue(String(this.plugin.settings.mimoChunkLimit || 200)).onChange(async value => {
          if (!/^\d+$/.test(value) || Number(value) < 50 || Number(value) > 2000) return;
          this.plugin.settings.mimoChunkLimit = Number(value);
          await this.plugin.saveSettings();
        }));
      const credentialSource = normalizeCredentialSource(this.plugin.settings.mimoCredentialSource);
      new Setting(containerEl).setName(ui.credentialSourceName).setDesc(ui.credentialSourceDesc)
        .addDropdown(dropdown => dropdown.addOption('obsidian-secret', ui.credentialSourceSecret)
          .addOption('key-file', ui.credentialSourceFile).setValue(credentialSource).onChange(async value => {
            this.plugin.settings.mimoCredentialSource = normalizeCredentialSource(value);
            await this.plugin.saveSettings();
            this.display();
          }));
      if (credentialSource === 'obsidian-secret') {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl).setName(label('MiMo API secret', 'MiMo API 秘密'))
            .setDesc(label('Use a regular MiMo API key, not a Token Plan key. Only the secret name is saved in data.json.',
              '使用普通 MiMo API Key，不是 Token Plan 密钥。data.json 只保存秘密名称，不保存密钥。'))
            .addComponent(element => new SecretComponent(this.app, element)
              .setValue(this.plugin.settings.mimoSecretName || '').onChange(async value => {
                this.plugin.settings.mimoSecretName = String(value || '').trim();
                await this.plugin.saveSettings();
              }));
        } else {
          new Setting(containerEl).setName(ui.secretStorageUnavailableName).setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl).setName(label('MiMo API key file', 'MiMo API 密钥文件'))
          .setDesc(label('Absolute path to a one-line MiMo API key file outside the vault. Do not paste the key here.',
            '填写库外单行 MiMo API 密钥文件的绝对路径，不要在这里粘贴密钥。'))
          .addText(text => text.setValue(this.plugin.settings.mimoKeyPath || '').onChange(async value => {
            this.plugin.settings.mimoKeyPath = value.trim();
            await this.plugin.saveSettings();
          }));
      }
      new Setting(containerEl).setName(label('MiMo voice', 'MiMo 音色'))
        .setDesc(label('Eight official voices. English accents are not specified by Xiaomi. Default: Bai Hua (Chinese male).',
          '8 种官方音色。官方未明确区分英语音色的英式或美式口音。默认白桦（中文男声）。'))
        .addDropdown(dropdown => {
          for (const [id, en, cn] of MIMO_VOICES) dropdown.addOption(id, `${id} - ${label(en, cn)}`);
          dropdown.setValue(this.plugin.settings.mimoVoice || MIMO_DEFAULTS.mimoVoice).onChange(async value => {
            this.plugin.settings.mimoVoice = value;
            await this.plugin.saveSettings();
          });
        });
    }

    if (selectedSpeechEngine === 'local-cosyvoice') {
      new Setting(containerEl)
        .setName(ui.localScriptName)
        .setDesc(ui.localScriptDesc)
        .addText((text) => {
          text
            .setPlaceholder(RECOMMENDED_SCRIPT_PATH)
            .setValue(this.plugin.settings.scriptPath)
            .onChange(async (value) => {
              this.plugin.settings.scriptPath = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.addClass('note-reader-cosyvoice-script-input');
        });
    }

    if (selectedSpeechEngine === 'edge-tts') {
      new Setting(containerEl)
        .setName(ui.edgeConsentName)
        .setDesc(ui.edgeConsentDesc)
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.edgeTtsConsent === true).onChange(async (value) => {
            this.plugin.settings.edgeTtsConsent = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName(ui.edgeExecutableName)
        .setDesc(ui.edgeExecutableDesc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_EDGE_TTS_EXECUTABLE)
            .setValue(normalizeEdgeTtsExecutable(this.plugin.settings.edgeTtsExecutable))
            .onChange(async (value) => {
              this.plugin.settings.edgeTtsExecutable = normalizeEdgeTtsExecutable(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.addClass('note-reader-cosyvoice-script-input');
        });

      const currentEdgeVoice = normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice);
      new Setting(containerEl)
        .setName(ui.edgeCommonVoicesName)
        .setDesc(ui.edgeCommonVoicesDesc)
        .addDropdown((dropdown) => {
          for (const [voiceId, label] of microsoftVoicePresets) {
            dropdown.addOption(voiceId, label);
          }
          dropdown
            .addOption('__custom__', ui.customVoiceOption)
            .setValue(commonVoiceIds.has(currentEdgeVoice) ? currentEdgeVoice : '__custom__')
            .onChange(async (value) => {
              if (value === '__custom__') {
                return;
              }
              this.plugin.settings.edgeTtsVoice = value;
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName(ui.edgeVoiceName)
        .setDesc(ui.edgeVoiceDesc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_EDGE_TTS_VOICE)
            .setValue(normalizeEdgeTtsVoice(this.plugin.settings.edgeTtsVoice))
            .onChange(async (value) => {
              this.plugin.settings.edgeTtsVoice = normalizeEdgeTtsVoice(value);
              await this.plugin.saveSettings();
            });
        });
    }

    if (selectedSpeechEngine === 'azure-speech') {
      new Setting(containerEl)
        .setName(ui.azureConsentName)
        .setDesc(ui.azureConsentDesc)
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.azureSpeechConsent === true).onChange(async (value) => {
            this.plugin.settings.azureSpeechConsent = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(pages.privacy)
        .setName(ui.azurePrivacyName)
        .setDesc(ui.azurePrivacyDesc)
        .addButton((button) => {
          button
            .setButtonText(ui.azurePrivacyButton)
            .setTooltip(ui.azurePrivacyTooltip)
            .onClick(() => {
              if (!openAzureTtsPrivacyDocs()) {
                new Notice(AZURE_TTS_PRIVACY_URL, 8000);
              }
            });
        });

      new Setting(containerEl)
        .setName(ui.azureCloudName)
        .setDesc(ui.azureCloudDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption('public', ui.azurePublicCloud)
            .addOption('china', ui.azureChinaCloud)
            .setValue(normalizeAzureSpeechCloud(this.plugin.settings.azureSpeechCloud))
            .onChange(async (value) => {
              this.plugin.settings.azureSpeechCloud = normalizeAzureSpeechCloud(value);
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName(ui.azureRegionName)
        .setDesc(ui.azureRegionDesc)
        .addText((text) => {
          text
            .setPlaceholder('eastasia')
            .setValue(this.plugin.settings.azureSpeechRegion || '')
            .onChange(async (value) => {
              this.plugin.settings.azureSpeechRegion = normalizeAzureSpeechRegion(value);
              await this.plugin.saveSettings();
            });
        });

      const azureCredentialSource = normalizeCredentialSource(this.plugin.settings.azureSpeechCredentialSource);
      new Setting(containerEl)
        .setName(ui.credentialSourceName)
        .setDesc(ui.credentialSourceDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption('obsidian-secret', ui.credentialSourceSecret)
            .addOption('key-file', ui.credentialSourceFile)
            .setValue(azureCredentialSource)
            .onChange(async (value) => {
              this.plugin.settings.azureSpeechCredentialSource = normalizeCredentialSource(value);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      if (azureCredentialSource === 'obsidian-secret') {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl)
            .setName(ui.azureSecretName)
            .setDesc(ui.azureSecretDesc)
            .addComponent((element) => new SecretComponent(this.app, element)
              .setValue(this.plugin.settings.azureSpeechSecretName || '')
              .onChange(async (value) => {
                this.plugin.settings.azureSpeechSecretName = String(value || '').trim();
                await this.plugin.saveSettings();
              }));
        } else {
          new Setting(containerEl)
            .setName(ui.secretStorageUnavailableName)
            .setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl)
          .setName(ui.azureKeyFileName)
          .setDesc(ui.azureKeyFileDesc)
          .addText((text) => {
            text
              .setPlaceholder('%LOCALAPPDATA%\\note-reader-cosyvoice\\azure-speech-key.txt')
              .setValue(this.plugin.settings.azureSpeechKeyPath || '')
              .onChange(async (value) => {
                this.plugin.settings.azureSpeechKeyPath = value.trim();
                await this.plugin.saveSettings();
              });
            text.inputEl.addClass('note-reader-cosyvoice-script-input');
          });
      }

      const currentAzureVoice = normalizeAzureSpeechVoice(this.plugin.settings.azureSpeechVoice);
      new Setting(containerEl)
        .setName(ui.azureCommonVoicesName)
        .setDesc(ui.azureCommonVoicesDesc)
        .addDropdown((dropdown) => {
          for (const [voiceId, label] of microsoftVoicePresets) {
            dropdown.addOption(voiceId, label);
          }
          dropdown
            .addOption('__custom__', ui.customVoiceOption)
            .setValue(commonVoiceIds.has(currentAzureVoice) ? currentAzureVoice : '__custom__')
            .onChange(async (value) => {
              if (value === '__custom__') {
                return;
              }
              this.plugin.settings.azureSpeechVoice = value;
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName(ui.azureVoiceName)
        .setDesc(ui.azureVoiceDesc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_AZURE_SPEECH_VOICE)
            .setValue(currentAzureVoice)
            .onChange(async (value) => {
              this.plugin.settings.azureSpeechVoice = normalizeAzureSpeechVoice(value);
              await this.plugin.saveSettings();
            });
        });
    }

    if (selectedSpeechEngine === 'openrouter-tts') {
      new Setting(containerEl)
        .setName(ui.openRouterConsentName)
        .setDesc(ui.openRouterConsentDesc)
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.openRouterConsent === true).onChange(async (value) => {
            this.plugin.settings.openRouterConsent = value;
            await this.plugin.saveSettings();
          });
        });

      const openRouterCredentialSource = normalizeCredentialSource(this.plugin.settings.openRouterCredentialSource);
      new Setting(containerEl)
        .setName(ui.credentialSourceName)
        .setDesc(ui.credentialSourceDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption('obsidian-secret', ui.credentialSourceSecret)
            .addOption('key-file', ui.credentialSourceFile)
            .setValue(openRouterCredentialSource)
            .onChange(async (value) => {
              this.plugin.settings.openRouterCredentialSource = normalizeCredentialSource(value);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      if (openRouterCredentialSource === 'obsidian-secret') {
        if (hasObsidianSecretStorageUi(this.app)) {
          new Setting(containerEl)
            .setName(ui.openRouterSecretName)
            .setDesc(ui.openRouterSecretDesc)
            .addComponent((element) => new SecretComponent(this.app, element)
              .setValue(this.plugin.settings.openRouterSecretName || '')
              .onChange(async (value) => {
                this.plugin.settings.openRouterSecretName = String(value || '').trim();
                await this.plugin.saveSettings();
              }));
        } else {
          new Setting(containerEl)
            .setName(ui.secretStorageUnavailableName)
            .setDesc(ui.secretStorageUnavailableDesc);
        }
      } else {
        new Setting(containerEl)
          .setName(ui.openRouterKeyFileName)
          .setDesc(ui.openRouterKeyFileDesc)
          .addText((text) => {
            text
              .setPlaceholder('%LOCALAPPDATA%\\note-reader-cosyvoice\\openrouter-api-key.txt')
              .setValue(this.plugin.settings.openRouterKeyPath || '')
              .onChange(async (value) => {
                this.plugin.settings.openRouterKeyPath = value.trim();
                await this.plugin.saveSettings();
              });
            text.inputEl.addClass('note-reader-cosyvoice-script-input');
          });
      }

      const currentOpenRouterModel = normalizeOpenRouterModel(this.plugin.settings.openRouterModel);
      const currentOpenRouterVoice = normalizeOpenRouterVoice(this.plugin.settings.openRouterVoice);
      const openRouterModels = getOpenRouterTtsModels(settingsLanguage);
      const selectedOpenRouterModel = openRouterModels.find(([model]) => model === currentOpenRouterModel);
      new Setting(containerEl)
        .setName(ui.openRouterModelsName)
        .setDesc(ui.openRouterModelsDesc)
        .addDropdown((dropdown) => {
          for (const [model, , label] of openRouterModels) {
            dropdown.addOption(model, label);
          }
          dropdown
            .addOption('__custom__', ui.customModelOption)
            .setValue(selectedOpenRouterModel ? currentOpenRouterModel : '__custom__')
            .onChange(async (value) => {
              if (value === '__custom__') {
                return;
              }
              this.plugin.settings.openRouterModel = value;
              this.plugin.settings.openRouterVoice = getDefaultOpenRouterVoiceForModel(value);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName(ui.openRouterModelName)
        .setDesc(ui.openRouterModelDesc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_OPENROUTER_TTS_MODEL)
            .setValue(currentOpenRouterModel)
            .onChange(async (value) => {
              this.plugin.settings.openRouterModel = normalizeOpenRouterModel(value);
              await this.plugin.saveSettings();
            });
          text.inputEl.addClass('note-reader-cosyvoice-script-input');
        });

      new Setting(containerEl)
        .setName(ui.openRouterModelInfoName)
        .setDesc(selectedOpenRouterModel ? selectedOpenRouterModel[3] : ui.customModelInfo);

      const openRouterVoicePresets = getOpenRouterTtsVoicePresets(currentOpenRouterModel, settingsLanguage);
      const openRouterVoiceIds = new Set(openRouterVoicePresets.map(([, voice]) => voice));
      new Setting(containerEl)
        .setName(ui.openRouterVoicesName)
        .setDesc(ui.openRouterVoicesDesc)
        .addDropdown((dropdown) => {
          for (const [, voice, label] of openRouterVoicePresets) {
            dropdown.addOption(voice, label);
          }
          dropdown
            .addOption('__custom__', ui.customVoiceOption)
            .setValue(openRouterVoiceIds.has(currentOpenRouterVoice) ? currentOpenRouterVoice : '__custom__')
            .onChange(async (value) => {
              if (value === '__custom__') {
                return;
              }
              this.plugin.settings.openRouterVoice = value;
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName(ui.openRouterVoiceName)
        .setDesc(ui.openRouterVoiceDesc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_OPENROUTER_TTS_VOICE)
            .setValue(currentOpenRouterVoice)
            .onChange(async (value) => {
              this.plugin.settings.openRouterVoice = normalizeOpenRouterVoice(value);
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName(ui.openRouterVoiceHelpName)
        .setDesc(ui.openRouterVoiceHelpDesc)
        .addButton((button) => {
          button.setButtonText(ui.openRouterModelPageButton)
            .setTooltip(ui.openRouterVoiceHelpTooltip)
            .onClick(() => {
              const url = getOpenRouterVoiceHelpLinks(this.plugin.settings.openRouterModel, settingsLanguage).modelPage;
              if (!openExternalUrl(url)) new Notice(url, 8000);
            });
        })
        .addButton((button) => {
          button.setButtonText(ui.openRouterVoiceCatalogButton)
            .setTooltip(ui.openRouterVoiceHelpTooltip)
            .onClick(() => {
              const url = getOpenRouterVoiceHelpLinks(this.plugin.settings.openRouterModel, settingsLanguage).voiceCatalog;
              if (!openExternalUrl(url)) new Notice(url, 8000);
            });
        });

      new Setting(pages.privacy)
        .setName(ui.openRouterPrivacyName)
        .setDesc(ui.openRouterPrivacyDesc);
    }

    containerEl = pages.playback;
    containerEl.createEl('h3', { text: translateInterface(settingsLanguage, 'Playback', '播放') });
    new Setting(containerEl)
      .setName(translateInterface(settingsLanguage, 'Smart quick start', '智能快速起读'))
      .setDesc(translateInterface(settingsLanguage,
        'Standard uses complete sentences at 20 then 40 characters. Rapid lets a complete first sentence of 5–19 non-whitespace characters play sooner, then uses 40; otherwise it follows Standard. No extra prefetch or splitting of existing requests. Exports are unchanged. Applies to the next reading session; latency varies by provider.',
        '标准模式按整句累加至20字，再从余文累加40字。极速模式允许5～19字的首个完整短句提前播放，随后仍用40字门槛；不符合时沿用标准规则（不计空白）。不增加预合成数量、不拆分已有请求，导出不变。下次朗读生效，实际提速取决于服务商。'))
      .addDropdown(dropdown => dropdown
        .addOption('off', translateInterface(settingsLanguage, 'Off', '关闭'))
        .addOption('standard', translateInterface(settingsLanguage, 'Standard quick start', '标准起读'))
        .addOption('rapid', translateInterface(settingsLanguage, 'Rapid quick start', '极速起读'))
        .setValue(this.plugin.settings.smartQuickStart === false ? 'off' : this.plugin.settings.rapidQuickStart === true ? 'rapid' : 'standard')
        .onChange(async value => {
        this.plugin.settings.smartQuickStart = value !== 'off';
        this.plugin.settings.rapidQuickStart = value === 'rapid';
        await this.plugin.saveSettings();
      }));
    if (!['system-tts', 'byok-tts'].includes(selectedSpeechEngine)) new Setting(containerEl)
      .setName(ui.speedName)
      .setDesc(ui.speedDesc)
      .addSlider((slider) => {
        slider
          .setLimits(0.5, 2, 0.05)
          .setValue(this.plugin.settings.speed)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.speed = normalizeSpeed(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(ui.chunkLimitsName)
      .setDesc(ui.chunkLimitsDesc)
      .addText((text) => {
        text.setValue(this.plugin.settings.chunkLimits).onChange(async (value) => {
          this.plugin.settings.chunkLimits = parseChunkLimits(value).join(',');
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(ui.onlineChunkLimitsName)
      .setDesc(ui.onlineChunkLimitsDesc)
      .addText((text) => {
        text.setValue(this.plugin.settings.onlineChunkLimits).onChange(async (value) => {
          this.plugin.settings.onlineChunkLimits = parseChunkLimits(
            value,
            DEFAULT_ONLINE_CHUNK_LIMITS
          ).join(',');
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(ui.onlinePrefetchName)
      .setDesc(ui.onlinePrefetchDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('0', ui.onlinePrefetchNone)
          .addOption('1', ui.onlinePrefetchOne)
          .setValue(String(normalizeOnlinePrefetchChunks(this.plugin.settings.onlinePrefetchChunks)))
          .onChange(async (value) => {
            this.plugin.settings.onlinePrefetchChunks = normalizeOnlinePrefetchChunks(value);
            await this.plugin.saveSettings();
          });
      });

    containerEl = pages.storage;
    new Setting(containerEl)
      .setName(ui.audioExportLocationName)
      .setDesc(ui.audioExportLocationDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('obsidian-attachment', ui.audioExportLocationAttachment)
          .addOption('note-folder', ui.audioExportLocationNote)
          .addOption('custom-folder', ui.audioExportLocationCustom)
          .setValue(normalizeAudioExportLocation(this.plugin.settings.audioExportLocation))
          .onChange(async (value) => {
            this.plugin.settings.audioExportLocation = normalizeAudioExportLocation(value);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (normalizeAudioExportLocation(this.plugin.settings.audioExportLocation) === 'custom-folder') {
      new Setting(containerEl)
        .setName(ui.audioExportFolderName)
        .setDesc(ui.audioExportFolderDesc)
        .addText((text) => {
          text
            .setPlaceholder(ui.audioExportFolderPlaceholder)
            .setValue(this.plugin.settings.audioExportFolder)
            .onChange(async (value) => {
              this.plugin.settings.audioExportFolder = normalizeAudioExportFolder(value);
              await this.plugin.saveSettings();
            });
        });
    }

    containerEl = pages.playback;
    containerEl.createEl('h3', { text: translateInterface(settingsLanguage, 'Appearance', '外观') });
    const zhReading = this.plugin.settings.settingsLanguage === 'chinese';
    new Setting(containerEl)
      .setName(zhReading ? '左侧朗读图标打开方式' : 'Ribbon icon opens')
      .setDesc(zhReading ? '工具栏用于 Markdown 笔记；PDF、HTML 和网页使用侧边栏。' : 'The toolbar is for Markdown notes; PDF, HTML and web pages use the sidebar.')
      .addDropdown(dropdown => dropdown.addOption('sidebar', zhReading ? '侧边栏' : 'Sidebar')
        .addOption('toolbar', zhReading ? '朗读工具栏' : 'Reading toolbar').addOption('both', zhReading ? '两者同时' : 'Both')
        .setValue(this.plugin.settings.readerOpenMode).onChange(async value => { this.plugin.settings.readerOpenMode = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(zhReading ? '高亮颜色' : 'Highlight color')
      .addColorPicker(picker => picker.setValue(this.plugin.settings.highlightColor).onChange(async value => {
        this.plugin.settings.highlightColor = value; await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
      }));
    new Setting(containerEl).setName(zhReading ? '高亮强度' : 'Highlight strength')
      .addSlider(slider => slider.setLimits(5, 60, 1).setValue(this.plugin.settings.highlightStrength).setDynamicTooltip().onChange(async value => {
        this.plugin.settings.highlightStrength = value; await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
      }))
      .addButton(button => button.setButtonText(zhReading ? '恢复默认高亮' : 'Reset highlighting').onClick(async () => {
        this.plugin.settings.highlightColor = APPEARANCE_DEFAULTS.highlightColor;
        this.plugin.settings.highlightStrength = APPEARANCE_DEFAULTS.highlightStrength;
        this.plugin.settings.noteHighlightBorder = APPEARANCE_DEFAULTS.noteHighlightBorder;
        this.plugin.settings.readingHighlight = 'sentence';
        await this.plugin.saveSettings(); this.plugin.renderDocumentViews(); this.display();
      }));
    new Setting(containerEl).setName(zhReading ? '笔记高亮左侧标线' : 'Note highlight side marker')
      .setDesc(zhReading ? '默认关闭。需要更明显的位置提示时，为笔记高亮增加左侧细线。'
        : 'Off by default. Add a thin side marker for a more visible reading position in notes.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.noteHighlightBorder === true).onChange(async value => {
        this.plugin.settings.noteHighlightBorder = value; await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
      }));
    new Setting(containerEl)
      .setName(zhReading ? '正文朗读标记' : 'Reading text highlight')
      .setDesc(zhReading ? '在原笔记、专注朗读和 PDF 文字层中淡色标记当前段。Windows 常规音色有可靠时间信息且对应原文时，可在编辑器标记句子。PDF 仅标记能准确匹配的已渲染文字；扫描页、复杂公式或不确定位置不强行标记。不增加 API 请求。'
        : 'Subtle marks in original notes, Focus reading and rendered PDF text layers. Editor sentence marks require verified Windows timing and exact source text. PDF marks require a reliable text match; scanned pages and uncertain formulas/layouts are left unmarked. No extra API requests.')
      .addDropdown(dropdown => dropdown.addOption('off', zhReading ? '关闭' : 'Off')
        .addOption('segment', zhReading ? '当前段' : 'Current segment')
        .addOption('sentence', zhReading ? '当前句子（如支持，否则当前段）' : 'Sentence if available, otherwise segment')
        .setValue(normalizeReadingHighlight(this.plugin.settings.readingHighlight)).onChange(async value => {
          this.plugin.settings.readingHighlight = value;
          await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
        }));
    new Setting(containerEl)
      .setName(zhReading ? 'HTML / 网页段落高亮' : 'HTML / web paragraph highlight')
      .setDesc(zhReading ? '仅标记可准确匹配的当前朗读段落，沿用高亮颜色和强度。不改动原文、不增加 API 请求；重复文字、动态页面或不支持的嵌入内容可能无法标记。正文朗读标记关闭时也不高亮。'
        : 'Mark uniquely matched current segments using the highlight color and strength. No text changes or extra API requests. Repeated text, dynamic pages and unsupported embedded content may remain unmarked. Requires reading text highlight to be enabled.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.webReadingHighlight !== false).onChange(async value => {
        this.plugin.settings.webReadingHighlight = value;
        await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
      }));
    new Setting(containerEl)
      .setName(zhReading ? 'HTML / 网页跟随滚动' : 'Follow HTML / web reading')
      .setDesc(zhReading ? '默认关闭。开启后在切换段落且标记不在可见区域时滚动，不移动键盘焦点。'
        : 'Off by default. On segment changes, scroll an off-screen highlight into view without moving keyboard focus.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.webReadingFollow === true).onChange(async value => {
        this.plugin.settings.webReadingFollow = value;
        await this.plugin.saveSettings(); this.plugin.renderDocumentViews();
      }));
    new Setting(containerEl)
      .setName(zhReading ? '正文跟随滚动' : 'Follow reading text')
      .setDesc(zhReading ? '默认关闭。开启后仅在标记移出可见区域时滚动；手动滚动会暂停跟随，不抢占键盘焦点。'
        : 'Off by default. Scrolls only when the highlight leaves the viewport. Manual scrolling suspends following without moving keyboard focus.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.readingFollow === true).onChange(async value => {
        this.plugin.settings.readingFollow = value;
        await this.plugin.saveSettings();
        for (const view of this.plugin.documentViews || []) { view.manualScroll = false; view.lastHighlight = ''; }
        this.plugin.noteHighlights?.resetFollowing();
        this.plugin.renderDocumentViews();
      }));
    new Setting(containerEl)
      .setName(zhReading ? '专注朗读与系统讲述人' : 'Focus reading and system Narrator')
      .setDesc(zhReading ? '打开本地解析的正文，不调用语音 API。Windows 用户可在正文视图中主动启动讲述人，使用其设置中的自然音色；插件不能直接合成该音色，也不能用播放器按钮控制讲述人。'
        : 'Open locally parsed text without TTS API requests. On Windows, explicitly start Narrator from that view to use its selected natural voice. Plugin playback controls and audio export do not control Narrator.')
      .addButton(button => button.setButtonText(zhReading ? '切换专注朗读' : 'Toggle focus reading').onClick(() => {
        void this.plugin.runUserAction('Reading view', () => this.plugin.toggleDocumentView());
      }));

    containerEl.createEl('h3', { text: 'Copilot' });
    addCopilotChatSettings(containerEl, this.plugin);
    containerEl = pages.academic;
    new Setting(containerEl)
      .setName(ui.stripMarkdownName)
      .setDesc(ui.stripMarkdownDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.stripMarkdown).onChange(async (value) => {
          this.plugin.settings.stripMarkdown = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName(zhReading ? '公式朗读策略' : 'Formula reading')
      .setDesc(zhReading ? '智能模式默认跳过复杂公式；支持的短公式在本地转换。完整模式也不会猜读无法可靠解析的公式。需开启“移除 Markdown 格式”。' : 'Smart mode skips complex formulas. Supported short formulas are converted locally; unsupported notation is never guessed. Requires Strip Markdown.')
      .addDropdown(dropdown => dropdown.addOption('smart', zhReading ? '智能：跳过复杂公式' : 'Smart: skip complex formulas')
        .addOption('all', zhReading ? '朗读支持的公式' : 'Read supported formulas').addOption('skip', zhReading ? '跳过所有公式' : 'Skip all formulas')
        .setValue(academicOptions(this.plugin.settings).academicMathMode).onChange(async value => { this.plugin.settings.academicMathMode=value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(zhReading ? '公式读法' : 'Formula style')
      .setDesc(zhReading ? '简洁模式使用 sub、bar 等符号名；bar 表示上划线，不一定表示平均值。' : 'Short symbols use sub and bar; bar names the symbol, not necessarily a mean.')
      .addDropdown(dropdown => dropdown.addOption('concise',zhReading ? '简洁（sub、bar）' : 'Concise (sub, bar)')
        .addOption('verbose',zhReading ? '明确（下标、subscript）' : 'Explicit (subscript)')
        .setValue(academicOptions(this.plugin.settings).academicMathStyle).onChange(async value => { this.plugin.settings.academicMathStyle=value; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName(ui.mathLanguageName)
      .setDesc(zhReading ? '公式转换目前支持中文和英文，与界面语言及语音音色分别设置。' : 'Formula conversion supports Chinese and English, independently of interface language and speech voice.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('english', ui.mathEnglish)
          .addOption('chinese', ui.mathChinese)
          .addOption('skip', ui.mathSkip)
          .setValue(normalizeMathReadingLanguage(this.plugin.settings.mathReadingLanguage))
          .onChange(async (value) => {
            this.plugin.settings.mathReadingLanguage = normalizeMathReadingLanguage(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName(zhReading ? '表格朗读策略' : 'Table reading')
      .setDesc(zhReading ? '智能模式跳过较长且数字密集的表格，保留标题、小表及文字表。PDF 只过滤能可靠识别的带标题数字表格；无法确定时保留。选中的 HTML 表格仍完整提取。' : 'Smart mode skips long numeric tables, retaining captions, small tables and text tables. PDF filtering requires a recognizable caption and numeric rows; uncertain content is retained. Selected HTML tables are preserved.')
      .addDropdown(dropdown => dropdown.addOption('smart',zhReading ? '智能：跳过长数字表格' : 'Smart: skip long numeric tables')
        .addOption('all',zhReading ? '完整朗读表格' : 'Read all tables').addOption('skip',zhReading ? '跳过所有已识别表格' : 'Skip all recognized tables')
        .setValue(academicOptions(this.plugin.settings).academicTableMode).onChange(async value => { this.plugin.settings.academicTableMode=value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName(zhReading ? '简短提示略过内容' : 'Announce skipped content')
      .setDesc(zhReading ? '略过公式或表格数据时简短提示。关闭后直接继续正文。PDF 保留表格标题，不额外插入提示。' : 'Briefly announce omitted formulas or table data. Disable for uninterrupted prose.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.academicSkipNotice !== false).onChange(async value => { this.plugin.settings.academicSkipNotice=value; await this.plugin.saveSettings(); }));
    containerEl.createEl('h3', { text: translateInterface(settingsLanguage, 'PDF content', 'PDF 内容') });
    addFootnoteSettings(containerEl, this.plugin, Setting);
    addAncillarySettings(containerEl, this.plugin, Setting);
    addPdfOutlineSettings(containerEl, this.plugin);

    containerEl = pages.storage;
    containerEl.createEl('h3', { text: translateInterface(settingsLanguage, 'Storage and maintenance', '存储与维护') });
    new Setting(containerEl)
      .setName(ui.rememberPositionName)
      .setDesc(translateInterface(settingsLanguage,
        'Session-only history stays in memory and is cleared on reload or exit. Persistent history stores local file paths, short text anchors and positions, not audio. Regenerated audio resumes at the segment start. Web pages are excluded.',
        '默认仅本次运行：记录只放内存，重载或退出后清空。跨重启保留会保存本地文件路径、短文本定位片段及位置，不保留音频；重新合成时从段首续读。网页不记录历史。'))
      .addDropdown((dropdown) => {
        dropdown.addOption('off', translateInterface(settingsLanguage, 'Off', '关闭'))
          .addOption('session', translateInterface(settingsLanguage, 'This session only', '仅本次运行'))
          .addOption('persistent', translateInterface(settingsLanguage, 'Keep across restarts', '跨重启保留'))
          .setValue(historyMode(this.plugin.settings)).onChange(async (value) => {
          this.plugin.settings.readingHistoryMode = value;
          this.plugin.settings.rememberReadingPosition = value === 'persistent';
          await this.plugin.saveSettings();
          this.plugin.renderReaderViews();
        });
      });

    new Setting(containerEl)
      .setName(ui.clearPositionsName)
      .setDesc(ui.clearPositionsDesc)
      .addButton((button) => {
        button
          .setButtonText(ui.clearPositionsButton)
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearReadingPositions();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(ui.cleanupName)
      .setDesc(ui.cleanupDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.cleanupCache).onChange(async (value) => {
          this.plugin.settings.cleanupCache = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(pages.privacy)
      .setName(ui.diagnosticName)
      .setDesc(ui.diagnosticDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.diagnosticLogging === true).onChange(async (value) => {
          this.plugin.settings.diagnosticLogging = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(ui.clearTemporaryName)
      .setDesc(ui.clearTemporaryDesc)
      .addButton((button) => {
        button
          .setButtonText(ui.clearNowButton)
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearTemporaryData();
          });
      });

    containerEl = pages.privacy;
    new Setting(containerEl)
      .setName(ui.feedbackName)
      .setDesc(ui.feedbackDesc)
      .addButton((button) => {
        button
          .setButtonText(ui.feedbackButton)
          .setTooltip(ui.feedbackTooltip)
          .onClick(() => {
            if (!openGitHubIssues()) {
              new Notice(GITHUB_ISSUES_URL, 8000);
            }
          });
      });

    const resetDescription = translateInterface(settingsLanguage,
      'Credentials, service configuration, interface language and reading records are preserved; no files are deleted. Synthesis changes apply to the next reading session. Resetting history mode to session-only removes its disk copy but keeps records in memory until exit.',
      '保留密钥引用、服务配置、界面语言和朗读记录，不删除文件。合成相关修改在下次朗读生效。历史模式恢复为仅本次运行时移除磁盘副本，内存记录保留至退出。');
    for (const [id, en, zh] of PAGES) {
      const title = translateInterface(settingsLanguage, 'Restore this page defaults', '恢复本页默认设置');
      const pageResetDescription = id === 'privacy'
        ? translateInterface(settingsLanguage, 'Turn off diagnostic logging. Other pages are unchanged.', '关闭诊断日志，不影响其他页面设置。')
        : translateInterface(settingsLanguage, 'Reset this category only. Credentials and records are preserved.', '仅恢复当前分类；保留密钥引用和朗读记录。');
      new Setting(pages[id]).setName(title).setDesc(pageResetDescription)
        .addButton(button => button.setButtonText(title).onClick(() => {
          new SettingsConfirmModal(this.plugin, `${title}: ${translateInterface(settingsLanguage, en, zh)}`, id === 'privacy' ? pageResetDescription : resetDescription, async () => {
            await this.plugin.resetSettingsToDefaults(id); this.display(); new Notice(ui.settingsRestoredNotice);
          }).open();
        }));
    }
    new Setting(containerEl)
      .setName(translateInterface(settingsLanguage, 'Restore all default settings', '恢复全部默认设置'))
      .setDesc(resetDescription)
      .addButton((button) => {
        button.setButtonText(ui.restoreDefaultsButton).setWarning().onClick(() => {
          new SettingsConfirmModal(this.plugin, translateInterface(settingsLanguage, 'Restore all default settings', '恢复全部默认设置'), resetDescription, async () => {
            await this.plugin.resetSettingsToDefaults();
            new Notice(ui.settingsRestoredNotice); this.display();
          }).open();
        });
      });
  }
}

module.exports = {
  default: CosyVoiceReaderPlugin,
  __test: {
    AccessibleReaderView,
    DOCUMENT_VIEW_TYPE,
    CosyVoiceReaderSettingTab,
    AZURE_TTS_PRIVACY_URL,
    DEFAULT_ONLINE_CHUNK_LIMITS,
    GITHUB_ISSUES_URL,
    VIEW_TYPE,
    buildAzureSpeechEndpoint,
    buildAzureSpeechSsml,
    buildEdgeTtsArgs,
    buildOpenRouterTtsRequestBody,
    calculateCurrentChunkSeekTime,
    createAudioExportSummary,
    createBlobAudioSource,
    createDefaultSettings,
    createIncrementalSpeechChunker,
    createReadingAnchor,
    createReaderState,
    createRemoteHttpError,
    createRemoteRetryExhaustedError,
    createSafeRuntimeLogEvent,
    createTaskState,
    describeMediaError,
    extractPdfTextLayout,
    extractTextFromPdfItems,
    formatProgressLabel,
    formatSpeedLabel,
    getAzureSpeechConfigurationError,
    getAzureSpeechVoicePresets,
    getDefaultOpenRouterVoiceForModel,
    getEdgeTtsVoicePresets,
    getObsidianSecretConfigurationError,
    getOpenRouterConfigurationError,
    getOpenRouterTtsModels,
    getOpenRouterTtsPresets,
    getOpenRouterTtsVoicePresets,
    getOpenRouterVoiceHelpLinks,
    getChunkLimitsForSpeechEngine,
    getPdfPageNumberFromNode,
    getPdfSelectionContext,
    getPdfSelectionPosition,
    getPluginTempCacheDir,
    getSettingsUiText,
    getTextFromPositionToEnd,
    getAudioUrlForFile,
    getAudioExportExtension,
    getAudioExportScopeLabel,
    getAudioExportScopeUiText,
    getAudioExportUiText,
    getAvailableVaultAudioPath,
    getRemoteHttpErrorDetail,
    getSpeedPresets,
    getSynthesisPrefetchCount,
    hasAzureSpeechConsent,
    hasEdgeTtsConsent,
    hasObsidianSecretStorage,
    hasOpenRouterConsent,
    isRetryableRemoteError,
    isMarkdownFile,
    isPdfFile,
    isOwnedCacheFileName,
    isOnlineSpeechEngine,
    joinPdfPageText,
    normalizeAzureSpeechCloud,
    normalizeAzureSpeechRegion,
    normalizeAzureSpeechVoice,
    normalizeAudioExportFolder,
    normalizeAudioExportLocation,
    normalizeAudioExportScope,
    normalizeCredentialSource,
    normalizeEdgeTtsExecutable,
    normalizeEdgeTtsVoice,
    normalizeMathReadingLanguage,
    normalizeOpenRouterModel,
    normalizeOpenRouterVoice,
    normalizeOnlinePrefetchChunks,
    normalizePdfSelectionText,
    normalizeReadingPositions,
    normalizeSettingsLanguage,
    normalizeSpeechEngine,
    openAzureTtsPrivacyDocs,
    openGitHubIssues,
    parseRetryAfterMs,
    resolveDefaultScriptPath,
    resolvePowerShellExecutable,
    readObsidianSecretValue,
    sanitizeTextForSpeech,
    sanitizeLatexForSpeech,
    slicePdfTextFromSelection,
    sliceTextFromReadingPosition,
    selectKnownSettings,
    selectMarkdownAudioExportText,
    splitTextForSpeechChunks,
    transitionTaskState,
    upsertReadingPosition,
    toVaultRelativePath,
    verbalizeShortLatex,
  },
};

function isInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function messageFromError(error) {
  if (!error) {
    return 'unknown error';
  }

  if (error.message) {
    return String(error.message);
  }

  return String(error);
}
