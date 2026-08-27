const { ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, loadPdfJs, setIcon } = require('obsidian');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { extractPdfTextLayout, extractTextFromPdfItems } = require('./pdf-layout');
const {
  MAX_EXPORTED_AUDIO_BYTES,
  bufferToArrayBuffer,
  buildExportAudioFileName,
  mergeAudioFiles,
} = require('./audio-export');
const {
  createReadingAnchor,
  normalizeReadingPositions,
  removeReadingPosition,
  sliceTextFromReadingPosition,
  upsertReadingPosition,
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
const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
const DEFAULT_ONLINE_CHUNK_LIMITS = [200, 400, 800];
const MAX_ONLINE_PREFETCH_CHUNKS = 1;
const DEFAULT_MATH_READING_LANGUAGE = 'english';
const DEFAULT_EDGE_TTS_VOICE = 'en-GB-RyanNeural';
const DEFAULT_EDGE_TTS_EXECUTABLE = 'edge-tts';
const DEFAULT_AZURE_SPEECH_VOICE = 'en-GB-RyanNeural';
const DEFAULT_OPENROUTER_TTS_MODEL = 'hexgrad/kokoro-82m';
const DEFAULT_OPENROUTER_TTS_VOICE = 'bm_george';
const AZURE_SPEECH_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const OPENROUTER_TTS_ENDPOINT = 'https://openrouter.ai/api/v1/audio/speech';
const RECOMMENDED_SCRIPT_PATH = '%LOCALAPPDATA%\\note-reader-cosyvoice\\cosyvoice-wrapper.ps1';
const SPEED_PRESETS = [1, 1.25, 1.5, 2, 1.1, 1.2, 1.3, 1.4];
const KEYBOARD_SEEK_SECONDS = 5;
const LATEX_FORMULA_MAX_CHARS = 12;
const MATH_READING_LANGUAGES = ['english', 'chinese', 'skip'];
const SETTINGS_LANGUAGES = ['english', 'chinese'];
const AUDIO_EXPORT_LOCATIONS = ['obsidian-attachment', 'note-folder', 'custom-folder'];
const AUDIO_EXPORT_SCOPES = ['entire', 'selection', 'from-selection'];
const CREDENTIAL_SOURCES = ['obsidian-secret', 'key-file'];
const SPEECH_ENGINES = ['local-cosyvoice', 'edge-tts', 'azure-speech', 'openrouter-tts'];
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
const OWNED_CACHE_FILE_PATTERN = /^\d{10,}-\d+-(?:\d+|export)\.(?:txt|wav|mp3)$/i;
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
    'microsoft/mai-voice-2-flash',
    'en-US-Harper:MAI-Voice-2',
    'Microsoft MAI-Voice-2 Flash - low latency, 4 listed voices',
    'Microsoft MAI-Voice-2 Flash - 低延迟、当前公开 4 个音色',
    'A low-latency Microsoft model for responsive playback. OpenRouter currently lists only four voices: US English, Mexican Spanish, French, and German; no Chinese or UK English voice IDs are exposed.',
    '微软低延迟语音模型，适合快速开始播放。OpenRouter 当前只列出 4 个音色：美式英语、墨西哥西班牙语、法语和德语，未公开中文或英式英语音色 ID。',
  ],
  [
    'microsoft/mai-voice-2',
    'en-US-Harper:MAI-Voice-2',
    'Microsoft MAI-Voice-2 - expressive, with Mandarin compatibility voices',
    'Microsoft MAI-Voice-2 - 表现力强、含中文兼容音色',
    'An expressive Microsoft model for natural long-form narration. In addition to the four voices listed by OpenRouter, the plugin offers three Microsoft-published Mandarin ShortNames as compatibility presets. OpenRouter endpoint availability can change.',
    '微软表现力语音模型，适合自然长文叙述。除 OpenRouter 元数据列出的 4 个音色外，插件还提供微软官方发布的 3 个普通话 ShortName 作为兼容预设；OpenRouter 端点的实际可用性可能变化。',
  ],
  [
    'google/gemini-3.1-flash-tts-preview',
    'Kore',
    'Google Gemini 3.1 Flash TTS Preview - 30 multilingual voices',
    'Google Gemini 3.1 Flash TTS 预览版 - 30 个多语言音色',
    'OpenRouter lists 30 multilingual voices. Google describes them by delivery style rather than fixed gender or US/UK accent, so the presets use official style labels only.',
    'OpenRouter 列出 30 个多语言音色。Google 按朗读风格而非固定性别或英美口音描述这些音色，因此预设只使用官方风格标签。',
  ],
  [
    'hexgrad/kokoro-82m',
    'bm_george',
    'Kokoro 82M - lightweight, low cost, many preset voices',
    'Kokoro 82M - 轻量、低成本、预设音色丰富',
    'OpenRouter lists 54 voices. The plugin provides 12 curated presets covering Chinese, US English, and UK English, with both female and male voices in every group. George remains the restrained academic-reading default.',
    'OpenRouter 列出 54 个音色。本插件提供 12 个精选预设，完整覆盖中文、美式英语和英式英语的男女声；默认 George 男声适合较克制的学术朗读。',
  ],
];
// OpenRouter-listed IDs were checked against its speech + ZDR model API on 2026-08-26.
// Standard MAI Mandarin compatibility IDs follow Microsoft's MAI voice catalog on 2026-08-27.
const OPENROUTER_TTS_PRESETS = [
  ['microsoft/mai-voice-2-flash', 'en-US-Harper:MAI-Voice-2', 'Harper (US English)', 'Harper（美式英语）'],
  ['microsoft/mai-voice-2-flash', 'es-MX-Valeria:MAI-Voice-2', 'Valeria (Mexican Spanish)', 'Valeria（墨西哥西班牙语）'],
  ['microsoft/mai-voice-2-flash', 'fr-FR-Soleil:MAI-Voice-2', 'Soleil (French)', 'Soleil（法语）'],
  ['microsoft/mai-voice-2-flash', 'de-DE-Klaus:MAI-Voice-2', 'Klaus (German)', 'Klaus（德语）'],
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
    settingsLanguageDesc: 'Choose the language used on this plugin settings page.',
    settingsLanguageEnglish: 'English',
    settingsLanguageChinese: '中文',
    speechEngineName: 'Speech engine',
    speechEngineDesc: 'Choose local CosyVoice, Microsoft Edge online voice, Microsoft Azure Speech, or OpenRouter TTS. Online modes send text to their service providers.',
    speechEngineLocal: 'Local CosyVoice',
    speechEngineEdge: 'Microsoft Edge online voice',
    speechEngineAzure: 'Microsoft Azure Speech',
    speechEngineOpenRouter: 'OpenRouter TTS',
    localScriptName: 'CosyVoice script',
    localScriptDesc: 'PowerShell wrapper used in Local CosyVoice mode.',
    edgeConsentName: 'Allow Edge online processing',
    edgeConsentDesc: 'Required for Edge mode. When enabled, each text chunk is sent to Microsoft Edge TTS. Keep this off for private or sensitive notes.',
    edgeExecutableName: 'Edge TTS executable',
    edgeExecutableDesc: 'Use an absolute edge-tts.exe path to avoid PATH ambiguity. The default value resolves edge-tts from the Obsidian process PATH.',
    edgeCommonVoicesName: 'Common Edge TTS voices',
    edgeCommonVoicesDesc: 'Common Chinese, US English, and UK English online voices. Selecting one fills the Voice ID below.',
    customVoiceOption: 'Custom voice ID',
    edgeVoiceName: 'Edge TTS voice',
    edgeVoiceDesc: 'Voice ID used by Edge mode. Keep a preset above or enter any ID returned by edge-tts --list-voices.',
    azureConsentName: 'Allow Azure online processing',
    azureConsentDesc: 'Required for Azure mode. Each text chunk is sent by HTTPS to the selected Azure Speech cloud and region. Keep this off for private notes unless that processing is acceptable.',
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
    openRouterPrivacyName: 'OpenRouter privacy routing',
    openRouterPrivacyDesc: 'Always enforced: provider.zdr is true and provider data collection is denied. The plugin never falls back to a non-ZDR endpoint. Keep OpenRouter account-level input/output logging and data sharing disabled for private content.',
    speedName: 'Speed',
    speedDesc: 'Speech speed passed to the selected speech engine.',
    chunkLimitsName: 'Local chunk limits',
    chunkLimitsDesc: 'Comma-separated character limits used by Local CosyVoice. Earlier chunks are shorter so playback starts sooner.',
    onlineChunkLimitsName: 'Online chunk limits',
    onlineChunkLimitsDesc: 'Used by Edge, Azure, and OpenRouter for notes and PDFs. The default 200,400,800 balances startup latency, continuity, and request count.',
    onlinePrefetchName: 'Online synthesis prefetch',
    onlinePrefetchDesc: 'How many future chunks an online engine may synthesize early. The default 1 improves continuity while limiting unused work to at most one chunk; choose 0 for strict on-demand synthesis.',
    onlinePrefetchNone: '0 - synthesize only when needed',
    onlinePrefetchOne: '1 - prefetch one chunk',
    audioExportLocationName: 'Audio export save location',
    audioExportLocationDesc: 'Choose where audio exported from notes or PDFs is saved. The confirmation dialog shows the selected scope and planned vault path before synthesis starts.',
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
    rememberPositionDesc: 'Off by default. When enabled, the plugin stores only the file path, page or chunk number, a short text anchor, and a timestamp. It never stores the note or PDF body in reading history.',
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
    commandsFooter: 'Commands also include resume the current file, seek backward or forward 5 seconds, and move to the previous or next reading chunk.',
  },
  chinese: {
    settingsLanguageName: '设置界面语言',
    settingsLanguageDesc: '选择本插件设置页面使用的语言。',
    settingsLanguageEnglish: 'English',
    settingsLanguageChinese: '中文',
    speechEngineName: '语音引擎',
    speechEngineDesc: '选择本地 CosyVoice、Microsoft Edge 在线语音、Microsoft Azure Speech 或 OpenRouter TTS。在线模式会把文本发送给相应服务商。',
    speechEngineLocal: '本地 CosyVoice',
    speechEngineEdge: 'Microsoft Edge 在线语音',
    speechEngineAzure: 'Microsoft Azure Speech',
    speechEngineOpenRouter: 'OpenRouter TTS',
    localScriptName: 'CosyVoice 脚本',
    localScriptDesc: '本地 CosyVoice 模式使用的 PowerShell 包装脚本。',
    edgeConsentName: '允许 Edge 在线处理',
    edgeConsentDesc: 'Edge 模式必须开启。开启后，每个文本分段都会发送给 Microsoft Edge TTS。私密或敏感笔记建议保持关闭。',
    edgeExecutableName: 'Edge TTS 可执行文件',
    edgeExecutableDesc: '建议填写 edge-tts.exe 的绝对路径，避免 PATH 指向不明确。默认值从 Obsidian 进程的 PATH 中查找 edge-tts。',
    edgeCommonVoicesName: '常用 Edge TTS 音色',
    edgeCommonVoicesDesc: '常用中文、美式英语和英式英语在线音色。选择后会自动填写下方的音色 ID。',
    customVoiceOption: '自定义音色 ID',
    edgeVoiceName: 'Edge TTS 音色',
    edgeVoiceDesc: 'Edge 模式使用的音色 ID。可使用上方预设，或填写 edge-tts --list-voices 返回的任意 ID。',
    azureConsentName: '允许 Azure 在线处理',
    azureConsentDesc: 'Azure 模式必须开启。每个文本分段会通过 HTTPS 发送到所选 Azure Speech 云环境和区域。除非可以接受该处理，否则私密笔记应保持关闭。',
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
    openRouterPrivacyName: 'OpenRouter 隐私路由',
    openRouterPrivacyDesc: '始终强制执行：provider.zdr 为 true，并拒绝供应商收集数据。插件不会降级到非 ZDR 端点。朗读私密内容时，还应关闭 OpenRouter 账户级输入输出日志和数据共享。',
    speedName: '语速',
    speedDesc: '传递给当前语音引擎的朗读速度。',
    chunkLimitsName: '本地分段长度',
    chunkLimitsDesc: '本地 CosyVoice 使用的字符数上限，以英文逗号分隔。前几个分段较短，可更快开始播放。',
    onlineChunkLimitsName: '在线分段长度',
    onlineChunkLimitsDesc: 'Edge、Azure 和 OpenRouter 朗读笔记或 PDF 时使用。默认 200,400,800，用于平衡启动速度、连贯性和请求次数。',
    onlinePrefetchName: '在线合成预取',
    onlinePrefetchDesc: '允许在线引擎提前合成的后续分段数量。默认 1 可改善衔接，并把可能未使用的提前合成限制为最多一段；选择 0 可严格按需合成。',
    onlinePrefetchNone: '0 - 需要时才合成',
    onlinePrefetchOne: '1 - 提前合成一段',
    audioExportLocationName: '音频导出保存位置',
    audioExportLocationDesc: '选择从笔记或 PDF 导出的音频保存位置。开始合成前，确认窗口会显示所选范围和预计的库内路径。',
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
    rememberPositionDesc: '默认关闭。开启后只保存文件路径、页码或分段序号、短文本锚点和时间，不会把笔记或 PDF 正文保存到朗读历史中。',
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
    commandsFooter: '命令还包括从当前文件保存的位置继续朗读、后退或前进 5 秒，以及跳到上一个或下一个朗读分段。',
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

function formatMarkdownTableForSpeech(headers, rows) {
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

function sanitizeMarkdownTablesForSpeech(text) {
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

      output.push(formatMarkdownTableForSpeech(headers, rows));
      index = rowIndex - 1;
      continue;
    }

    if (!isMarkdownTableDelimiterLine(headerLine)) {
      output.push(headerLine);
    }
  }

  return output.join('\n');
}

function joinCitationSpeechParts(parts, useChineseLabels) {
  if (useChineseLabels) {
    return parts.join('、');
  }
  if (parts.length <= 1) {
    return parts[0] || '';
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function verbalizeNumericCitationsForSpeech(text) {
  const value = String(text || '');
  const useChineseLabels = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value);

  return value.replace(
    /\[(\d+(?:\s*(?:[,;]|[-–—])\s*\d+)*)\](?:\([^)]*\))?/g,
    (match, content) => {
      const numbers = content.match(/\d+/g) || [];
      if (!numbers.length || numbers.some((number) => Number(number) < 1 || Number(number) > 999)) {
        return match;
      }

      const parts = content
        .split(/\s*[,;]\s*/)
        .map((part) => {
          const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part);
          if (!range) {
            return part.trim();
          }
          return `${range[1]} ${useChineseLabels ? '到' : 'to'} ${range[2]}`;
        })
        .filter(Boolean);
      const isPlural = parts.length > 1 || /[-–—]/.test(content);
      const label = useChineseLabels ? '参考文献' : (isPlural ? 'references' : 'reference');
      return ` ${label} ${joinCitationSpeechParts(parts, useChineseLabels)} `;
    }
  );
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
  value = sanitizeMarkdownTablesForSpeech(value);
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/<[^>]+>/g, ' ');
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/^\s*[-+*]\s+/gm, '');
  value = value.replace(/[*_~]/g, '');
  value = value.replace(/\|/g, ' ');
  value = value.replace(/[ \t]+/g, ' ');
  value = value.replace(/\s+([，。、；：！？,.])/g, '$1');
  value = value.replace(/([，。、；：！？])\s+/g, '$1');

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function sanitizeLatexForSpeech(text, options = {}) {
  let value = normalizeLineBreaks(text);
  const mathReadingLanguage = normalizeMathReadingLanguage(options.mathReadingLanguage);

  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));
  value = value.replace(/\$([^$\n]+?)\$/g, (match, content) => replaceLatexFormula(match, content, mathReadingLanguage));

  return verbalizeLatexCommands(value, mathReadingLanguage);
}

function replaceLatexFormula(match, content, mathReadingLanguage) {
  if (mathReadingLanguage === 'skip' || isLongLatexFormula(content)) {
    return ' ';
  }

  return ` ${verbalizeShortLatex(content, mathReadingLanguage)} `;
}

function isLongLatexFormula(content) {
  return stripLatexDelimiters(content).replace(/\s+/g, '').length > LATEX_FORMULA_MAX_CHARS;
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
  let value = stripLatexDelimiters(content);
  const language = normalizeMathReadingLanguage(mathReadingLanguage);

  value = verbalizeLatexCommands(value, language);
  value = verbalizeLatexAbsoluteValues(value, language);
  value = value.replace(/_/g, language === 'chinese' ? ' 下标 ' : ' subscript ');
  value = value.replace(/\^/g, language === 'chinese' ? ' 上标 ' : ' superscript ');
  value = value.replace(/\+/g, language === 'chinese' ? ' 加 ' : ' plus ');
  value = value.replace(/=/g, language === 'chinese' ? ' 等于 ' : ' equals ');
  value = value.replace(/[{}()[\]]/g, ' ');
  value = value.replace(/\\/g, ' ');

  return cleanupLatexSpeech(value);
}

function verbalizeLatexAbsoluteValues(text, mathReadingLanguage) {
  let value = String(text || '').replace(/\\(?:lvert|rvert|vert)\b/g, '|');
  value = value.replace(/\|([^|\n]+)\|/g, (_match, inner) => (
    mathReadingLanguage === 'chinese'
      ? `${inner} 的绝对值`
      : `absolute value of ${inner}`
  ));
  return value.replace(/\|/g, ' ');
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
  const fractionSpeech = mathReadingLanguage === 'chinese' ? '$1 分之 $2' : '$1 over $2';

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
  return SETTINGS_UI_TEXT[normalizeSettingsLanguage(language)];
}

function normalizeSpeechEngine(value) {
  const engine = String(value || DEFAULT_SETTINGS.speechEngine).toLowerCase();
  return SPEECH_ENGINES.includes(engine) ? engine : DEFAULT_SETTINGS.speechEngine;
}

function isOnlineSpeechEngine(value) {
  return normalizeSpeechEngine(value) !== 'local-cosyvoice';
}

function normalizeOnlinePrefetchChunks(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count)
    ? Math.min(MAX_ONLINE_PREFETCH_CHUNKS, Math.max(0, count))
    : DEFAULT_SETTINGS.onlinePrefetchChunks;
}

function getChunkLimitsForSpeechEngine(settings, speechEngine = normalizeSpeechEngine(settings && settings.speechEngine)) {
  if (isOnlineSpeechEngine(speechEngine)) {
    return parseChunkLimits(settings && settings.onlineChunkLimits, DEFAULT_ONLINE_CHUNK_LIMITS);
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
  return normalizeSpeechEngine(speechEngine) === 'local-cosyvoice' ? 'wav' : 'mp3';
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
    documentKind: options.documentKind === 'pdf' ? 'pdf' : 'markdown',
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
  const hasSelection = context.hasSelection === true;
  if (useChinese) {
    return {
      cancel: '取消',
      continue: '继续',
      description: isPdf
        ? '选择要从当前文本型 PDF 导出的内容范围。下一步会先在本地解析并计算准确分段，再要求确认。'
        : '选择要从当前 Markdown 笔记导出的内容范围。下一步会计算准确分段并要求确认。',
      entire: '全部内容',
      fileLabel: isPdf ? 'PDF' : '笔记',
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
      : 'Choose what to export from the current Markdown note. The plugin will calculate exact segments and then ask for confirmation.',
    entire: 'Entire document',
    fileLabel: isPdf ? 'PDF' : 'Note',
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
      fileLabel: summary.documentKind === 'pdf' ? 'PDF' : '笔记',
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
    fileLabel: summary.documentKind === 'pdf' ? 'PDF' : 'Note',
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
    this.sequence = 0;
    this.activeSession = null;
    this.currentAudio = null;
    this.currentProcess = null;
    this.currentRequests = new Set();
    this.lastMarkdownView = null;
    this.lastReadableFile = null;
    this.lastPdfSelection = null;
    this.pendingAudioMerge = null;
    this.pauseRequested = false;
    this.readerState = createReaderState();
    this.readerViews = new Set();
    this.vaultBasePath = null;
    this.cacheDir = null;
    this.legacyCacheDir = null;
    this.legacyLogPath = null;
    this.logPath = null;
    this.statusBar = this.addStatusBarItem();

    await this.loadSettings();
    await this.ensureCacheDir();

    this.registerView(VIEW_TYPE, (leaf) => new CosyVoiceReaderView(leaf, this));
    this.lastMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const initiallyActiveFile = typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
    if (isMarkdownFile(initiallyActiveFile) || isPdfFile(initiallyActiveFile)) {
      this.lastReadableFile = initiallyActiveFile;
    }
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          this.lastMarkdownView = view;
        }
        const file = typeof this.app.workspace.getActiveFile === 'function'
          ? this.app.workspace.getActiveFile()
          : null;
        if (isMarkdownFile(file) || isPdfFile(file)) {
          this.lastReadableFile = file;
        }
        this.renderReaderViews();
      })
    );
    if (typeof document !== 'undefined') {
      this.registerDomEvent(document, 'selectionchange', () => {
        this.capturePdfSelection();
      });
    }

    this.addRibbonIcon('volume-2', 'Open voice reader controls', () => {
      void this.activateControlView();
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
      name: 'Read current note or PDF aloud',
      callback: () => {
        void this.runUserAction('Read file', () => this.readCurrentNote());
      },
    });

    this.addCommand({
      id: 'export-current-note-audio',
      name: 'Export audio from current note or PDF',
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
      name: 'Resume reading current note or PDF',
      checkCallback: (checking) => {
        if (!this.canResumeCurrentFile()) {
          return false;
        }
        if (!checking) {
          void this.resumeCurrentFile();
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
        void this.readSelection();
      },
    });

    this.addCommand({
      id: 'read-from-selection',
      name: 'Read from selection aloud',
      callback: () => {
        void this.readFromSelection();
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
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
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
    if (removedObsoleteSettings || missingKnownSettings) {
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    this.settings = selectKnownSettings(createDefaultSettings(), this.settings);
    this.settings.audioExportFolder = normalizeAudioExportFolder(this.settings.audioExportFolder);
    this.settings.audioExportLocation = normalizeAudioExportLocation(this.settings.audioExportLocation);
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.speechEngine = normalizeSpeechEngine(this.settings.speechEngine);
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
    await this.saveData(this.settings);
  }

  async resetSettingsToDefaults() {
    this.settings = createDefaultSettings();
    await this.saveSettings();
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
    for (const view of this.readerViews) {
      view.render();
    }
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
    return context && context.filePath === getPdfFileIdentity(file) ? context : null;
  }

  getCurrentReadableFile() {
    const workspace = this.app && this.app.workspace;
    const activeFile = workspace && typeof workspace.getActiveFile === 'function'
      ? workspace.getActiveFile()
      : null;
    if (activeFile) {
      if (isMarkdownFile(activeFile) || isPdfFile(activeFile)) {
        this.lastReadableFile = activeFile;
      }
      return activeFile;
    }
    return this.lastReadableFile || null;
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
    const notify = options.notify !== false;
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

  getActiveMarkdownView() {
    const context = this.getCurrentMarkdownContext({ notify: true });
    return context ? context.view : null;
  }

  getCurrentAudioExportContext(options = {}) {
    const notify = options.notify !== false;
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
    if (notify) {
      new Notice('CosyVoice: open a Markdown note or text-based PDF before exporting audio.', 8000);
    }
    return null;
  }

  canExportCurrentFile() {
    return Boolean(this.getCurrentAudioExportContext({ notify: false }));
  }

  canInsertAudioExportIntoCurrentNote() {
    const context = this.getCurrentAudioExportContext({ notify: false });
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

  sanitizeAudioExportText(value) {
    return this.settings.stripMarkdown
      ? sanitizeTextForSpeech(value, {
        mathReadingLanguage: this.settings.mathReadingLanguage,
      })
      : normalizeLineBreaks(value).trim();
  }

  isAudioExportContextCurrent(context) {
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
    await this.stopReading({ silent: true });
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
    if (this.hasPendingAudioMerge()) {
      new Notice(
        'CosyVoice: a previous export is waiting for "Retry merge only". Retry it first, or use Clear temporary data in settings to discard the kept segments.',
        12000
      );
      return null;
    }
    const context = this.getCurrentAudioExportContext({ notify: true });
    if (!context) {
      return null;
    }
    if (options.expectedDocumentKind && context.documentKind !== options.expectedDocumentKind) {
      new Notice('CosyVoice: open a Markdown note before using this action.', 8000);
      return null;
    }

    const insertAfterExport = options.insertAfterExport === true;
    if (insertAfterExport && context.documentKind !== 'markdown') {
      new Notice('CosyVoice: PDF audio can be saved as an attachment but cannot be inserted into the PDF.', 8000);
      return null;
    }

    const scope = Object.prototype.hasOwnProperty.call(options, 'scope')
      ? normalizeAudioExportScope(options.scope)
      : await this.requestAudioExportScope(context);
    if (!scope) {
      return null;
    }
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
    if (!this.isAudioExportContextCurrent(context)) {
      new Notice('CosyVoice: the active file changed while export was being prepared. Start again to review a new estimate.', 8000);
      return null;
    }

    await this.activateControlView();
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
    const activeFile = this.getCurrentReadableFile();
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdf(activeFile);
      return;
    }

    if (!isMarkdownFile(activeFile)) {
      new Notice('CosyVoice: open a Markdown note or PDF before reading.', 8000);
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
    if (!filePath || !this.settings || !this.settings.rememberReadingPosition) {
      return null;
    }
    return normalizeReadingPositions(this.settings.readingPositions)[filePath] || null;
  }

  canResumeCurrentFile() {
    const file = this.app && this.app.workspace && typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
    return Boolean(this.getSavedReadingPosition(file));
  }

  async resumeCurrentFile() {
    if (!this.settings || !this.settings.rememberReadingPosition) {
      new Notice('CosyVoice: enable Remember reading position in the plugin settings first.', 8000);
      return;
    }
    const file = typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
    const position = this.getSavedReadingPosition(file);
    if (!file || !position) {
      new Notice('CosyVoice: no saved reading position for the current file.', 6000);
      return;
    }

    if (isPdfFile(file)) {
      await this.readCurrentPdf(file, { resumePosition: position });
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view || getPdfFileIdentity(view.file) !== position.filePath) {
      new Notice('CosyVoice: open the saved note before resuming.', 6000);
      return;
    }
    const fullText = this.settings.stripMarkdown
      ? sanitizeTextForSpeech(view.editor.getValue(), { mathReadingLanguage: this.settings.mathReadingLanguage })
      : normalizeLineBreaks(view.editor.getValue()).trim();
    let resumeSlice = sliceTextFromReadingPosition(fullText, position);
    if (!resumeSlice.matched) {
      const configuration = this.getSpeechConfiguration();
      if (!configuration) {
        return;
      }
      const chunks = splitTextForSpeechChunks(fullText, configuration.chunkLimits);
      const fallbackIndex = Math.min(Math.max(0, position.chunkIndex), Math.max(0, chunks.length - 1));
      resumeSlice = { matched: false, text: chunks.slice(fallbackIndex).join('\n\n') };
      new Notice('CosyVoice: the saved text anchor changed. Resuming from the nearest saved chunk.', 8000);
    }
    if (!resumeSlice.text) {
      new Notice('CosyVoice: the saved position is no longer readable.', 6000);
      return;
    }
    await this.activateControlView();
    await this.startReading(resumeSlice.text, `${file.basename || file.name || 'note'} (resumed)`, {
      file,
      sourceKind: 'markdown',
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
      || !this.settings.rememberReadingPosition
      || !session.filePath
      || session.kind === 'audio-export'
      || !['markdown', 'pdf'].includes(session.sourceKind)
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
    if (!session || !session.filePath || !this.settings || !this.settings.rememberReadingPosition) {
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
      engineLabel,
      prefetchChunks: getSynthesisPrefetchCount(this.settings, speechEngine),
      speechEngine,
    };
  }

  createSpeechSession(chunks, sourceLabel, configuration, options = {}) {
    const initialChunks = Array.isArray(chunks) ? chunks.slice() : [];
    const id = ++this.sequence;
    return {
      chunkWaiters: new Set(),
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
      speechEngine: configuration.speechEngine,
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
        return text ? { pageNumber, text } : null;
      })
      .filter(Boolean);
    if (!readableChunks.length) {
      return 0;
    }

    session.chunks.push(...readableChunks.map((chunk) => chunk.text));
    session.chunkPageNumbers.push(...readableChunks.map((chunk) => chunk.pageNumber));
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
    const chunker = createIncrementalSpeechChunker(chunkLimits, { detailed: true });
    let readableTextLength = 0;
    let selectionFallbackNotified = false;

    await this.extractPdfText(file, session, {
      collectText: false,
      onPageText: async (pageText, pageInfo) => {
        if (!this.isActive(session)) {
          return;
        }
        const text = this.settings.stripMarkdown
          ? sanitizeTextForSpeech(pageText, { mathReadingLanguage: this.settings.mathReadingLanguage })
          : normalizeLineBreaks(pageText).trim();
        readableTextLength += text.length;
        this.appendSessionChunks(session, chunker.push(text, { pageNumber: pageInfo.pageNumber }));

        if (
          selectionContext
          && pageInfo.pageNumber === selectionContext.pageNumber
          && session.pdfSelectionMatched === false
          && !selectionFallbackNotified
        ) {
          selectionFallbackNotified = true;
          new Notice(
            `CosyVoice PDF: the selected text could not be matched exactly. Reading from the start of page ${selectionContext.pageNumber}.`,
            10000
          );
        }
      },
      reportProgress: true,
      selectedText: selectionContext ? selectionContext.selectedText : '',
      selectionPosition: selectionContext ? selectionContext.selectionPosition : null,
      startPageNumber: selectionContext ? selectionContext.pageNumber : 1,
    });

    if (!this.isActive(session)) {
      return;
    }
    this.appendSessionChunks(session, chunker.finish());
    if (!readableTextLength || !session.chunks.length) {
      throw new Error('No extractable text was found. This PDF may be scanned or image-only; run OCR first and try again.');
    }
  }

  async extractPdfText(file, session, options = {}) {
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
    if (!this.isActive(session)) {
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
      if (!this.isActive(session)) {
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
      let textLength = 0;

      for (let pageNumber = startPageNumber; pageNumber <= totalPages; pageNumber += 1) {
        if (!this.isActive(session)) {
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
          if (!this.isActive(session)) {
            return '';
          }
          const textContent = await page.getTextContent();
          if (!this.isActive(session)) {
            return '';
          }
          const viewport = typeof page.getViewport === 'function'
            ? page.getViewport({ scale: 1 })
            : null;
          const pageLayout = extractPdfTextLayout(textContent && textContent.items, { viewport });
          let pageText = pageLayout.text;
          if (selectedText && pageNumber === startPageNumber) {
            const selectionSlice = slicePdfTextFromSelection(pageText, selectedText, {
              layout: pageLayout,
              selectionPosition: options.selectionPosition,
            });
            pageText = selectionSlice.text;
            session.pdfSelectionMatched = selectionSlice.matched;
          }
          if (collectText) {
            pageTexts.push(pageText);
          }
          textLength += pageText.length;
          if (textLength > PDF_MAX_TEXT_CHARS) {
            throw new Error('This PDF contains more than 5,000,000 extractable characters. Split it before reading.');
          }
          if (onPageText) {
            await onPageText(pageText, { pageNumber, totalPages });
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
    const activeFile = typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
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

    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice('CosyVoice: select text first.');
      return;
    }

    await this.activateControlView();
    await this.startReading(selection, 'selection');
  }

  async readFromSelection() {
    const activeFile = typeof this.app.workspace.getActiveFile === 'function'
      ? this.app.workspace.getActiveFile()
      : null;
    if (isPdfFile(activeFile)) {
      await this.readCurrentPdfFromSelection(activeFile);
      return;
    }

    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }

    const selection = view.editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice('CosyVoice: select a start point first.');
      return;
    }

    const from = view.editor.getCursor('from');
    const lines = view.editor.getValue().split(/\r\n?|\n/);
    const text = getTextFromPositionToEnd(lines, from);

    if (!text) {
      new Notice('CosyVoice: nothing to read after selection.');
      return;
    }

    await this.activateControlView();
    await this.startReading(text, 'from selection', { file: view.file, sourceKind: 'markdown' });
  }

  async startReading(rawText, sourceLabel, options = {}) {
    const text = this.settings.stripMarkdown
      ? sanitizeTextForSpeech(rawText, { mathReadingLanguage: this.settings.mathReadingLanguage })
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

    const chunks = splitTextForSpeechChunks(text, configuration.chunkLimits);
    const session = this.createSpeechSession(chunks, sourceLabel, configuration, {
      file: options.file,
      sourceKind: options.sourceKind || '',
    });

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
    const getPreparedChunk = (index) => {
      if (!preparedChunks.has(index)) {
        const preparing = this.queuePrepareChunk(session.chunks[index], index, session);
        preparing.catch(() => {});
        preparedChunks.set(index, preparing);
      }

      return preparedChunks.get(index);
    };
    session.prepareAvailableChunks = () => {
      if (!this.isActive(session) || !Number.isInteger(session.prefetchBaseIndex)) {
        return;
      }
      for (let offset = 1; offset <= session.prefetchChunks; offset += 1) {
        const prefetchIndex = session.prefetchBaseIndex + offset;
        if (prefetchIndex < session.chunks.length) {
          getPreparedChunk(prefetchIndex);
        }
      }
    };

    try {
      let index = 0;
      while (this.isActive(session)) {
        if (Number.isInteger(session.requestedChunkIndex) && session.chunks.length) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
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
        if (chunkText === null) {
          break;
        }

        session.currentChunkIndex = index;
        const prepared = await getPreparedChunk(index);
        if (!this.isActive(session)) {
          break;
        }

        if (Number.isInteger(session.requestedChunkIndex) && session.requestedChunkIndex !== index) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
          continue;
        }

        session.prepareAvailableChunks();

        session.requestedChunkIndex = null;
        await this.playPreparedAudio(prepared, session, index, session.totalChunks);
        session.lastCompletedChunkIndex = index;

        if (Number.isInteger(session.requestedChunkIndex)) {
          index = Math.max(0, Math.min(session.chunks.length - 1, session.requestedChunkIndex));
          session.requestedChunkIndex = null;
        } else {
          index += 1;
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

  async prepareChunk(chunkText, index, session) {
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    session.speechStarted = true;
    const speechEngine = normalizeSpeechEngine(session.speechEngine || this.settings.speechEngine);
    const engineLabel = session.engineLabel || getSpeechEngineLabel(this.settings);
    const outputExtension = speechEngine === 'local-cosyvoice' ? 'wav' : 'mp3';
    const basename = `${Date.now()}-${session.id}-${index}`;
    const inputPath = path.join(this.cacheDir, `${basename}.txt`);
    const outputPath = path.join(this.cacheDir, `${basename}.${outputExtension}`);

    session.files.push(inputPath, outputPath);
    await fs.promises.writeFile(inputPath, chunkText, { encoding: 'utf8', mode: 0o600 });

    const isAudioExport = session.kind === 'audio-export';
    const isBackgroundPrefetch = Boolean(
      this.currentAudio
      && Number.isInteger(session.currentChunkIndex)
      && index !== session.currentChunkIndex
    );
    if (!isBackgroundPrefetch) {
      this.updateStatus(`${engineLabel} synth ${index + 1}/${session.totalChunks || 0}`, {
        canPause: !isAudioExport,
        ...(isAudioExport
          ? { canNextChunk: false, canPreviousChunk: false }
          : getChunkNavigationState(index + 1, session.totalChunks)),
        canSeek: false,
        canStop: true,
        currentChunk: index + 1,
        currentText: previewText(chunkText),
        isPaused: false,
        phase: 'synthesizing',
        progress: session.totalChunks ? index / session.totalChunks : 0,
        status: 'running',
        totalChunks: session.totalChunks || 0,
      });
    }
    try {
      await this.runSpeechEngine(inputPath, outputPath, session, speechEngine);
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
    };
  }

  queuePrepareChunk(chunkText, index, session) {
    const promise = this.prepareChunk(chunkText, index, session);
    promise.catch(() => {});
    return promise;
  }

  runSpeechEngine(inputPath, outputPath, session, speechEngine = normalizeSpeechEngine(this.settings.speechEngine)) {
    if (speechEngine === 'edge-tts') {
      return this.runEdgeTts(inputPath, outputPath, session);
    }
    if (speechEngine === 'azure-speech') {
      return this.runAzureSpeech(inputPath, outputPath, session);
    }
    if (speechEngine === 'openrouter-tts') {
      return this.runOpenRouterTts(inputPath, outputPath, session);
    }

    return this.runCosyVoice(inputPath, outputPath, session);
  }

  runCosyVoice(inputPath, outputPath, session) {
    const scriptPath = this.settings.scriptPath.trim();
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
      String(normalizeSpeed(this.settings.speed)),
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
    const args = buildEdgeTtsArgs(inputPath, outputPath, this.settings);
    const executable = normalizeEdgeTtsExecutable(this.settings.edgeTtsExecutable);

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

  async readOpenRouterKey() {
    if (normalizeCredentialSource(this.settings.openRouterCredentialSource) === 'obsidian-secret') {
      return this.readObsidianSecret(this.settings.openRouterSecretName, 'OpenRouter API');
    }
    return this.readSecretFileOutsideVault(this.settings.openRouterKeyPath, 'OpenRouter API');
  }

  async readAzureSpeechKey() {
    if (normalizeCredentialSource(this.settings.azureSpeechCredentialSource) === 'obsidian-secret') {
      return this.readObsidianSecret(this.settings.azureSpeechSecretName, 'Azure Speech');
    }
    return this.readSecretFileOutsideVault(this.settings.azureSpeechKeyPath, 'Azure Speech');
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

  async requestRemoteAudioOnce({ endpoint, headers, body, outputPath, session, serviceLabel, expectedContentType, failureHint }) {
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
            await fs.promises.writeFile(outputPath, Buffer.concat(chunks), { mode: 0o600 });
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
    const [text, subscriptionKey] = await Promise.all([
      fs.promises.readFile(inputPath, 'utf8'),
      this.readAzureSpeechKey(),
    ]);
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    const body = buildAzureSpeechSsml(text, this.settings);
    await this.requestRemoteAudio({
      endpoint: new URL(buildAzureSpeechEndpoint(this.settings)),
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

  async runOpenRouterTts(inputPath, outputPath, session) {
    const [text, apiKey] = await Promise.all([
      fs.promises.readFile(inputPath, 'utf8'),
      this.readOpenRouterKey(),
    ]);
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    const body = buildOpenRouterTtsRequestBody(text, this.settings);
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

  async playPreparedAudio(prepared, session, index, total) {
    if (!this.isActive(session)) {
      return;
    }

    await this.waitWhilePaused(session);
    if (!this.isActive(session)) {
      return;
    }

    const source = await this.createPlayableAudioSource(prepared);
    if (!this.isActive(session)) {
      source.release();
      return;
    }

    await new Promise((resolve, reject) => {
      let audio;
      let settled = false;
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
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        this.releaseAudioSource(audio);
        callback(value);
      };

      try {
        audio = new Audio();
        audio.noteReaderReleaseSource = source.release;
        audio.preload = 'auto';
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
          progress: index / playbackTotal,
          status: 'running',
          totalChunks: playbackTotal,
        });
        void this.writeRuntimeLog('play', {
          index,
          urlScheme: String(source.url).split(':')[0],
        });

        let lastProgressUpdate = 0;
        audio.ontimeupdate = () => {
          const now = Date.now();
          if (now - lastProgressUpdate < 250) {
            return;
          }
          lastProgressUpdate = now;
          const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          const chunkProgress = duration ? audio.currentTime / duration : 0;
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            progress: (index + chunkProgress) / currentTotal,
            totalChunks: currentTotal,
          });
        };

        audio.onended = () => {
          const currentTotal = getPlaybackTotal();
          this.setReaderState({
            canPause: false,
            ...getChunkNavigationState(index + 1, currentTotal),
            canSeek: false,
            isPaused: false,
            progress: (index + 1) / currentTotal,
            totalChunks: currentTotal,
          });
          finish(resolve);
        };

        audio.onerror = () => {
          finish(reject, new Error(`Unable to play ${prepared.outputPath}${describeMediaError(audio.error)}`));
        };

        audio.src = source.url;
        Promise.resolve(audio.play()).catch((error) => {
          finish(reject, error);
        });
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
    const audio = this.currentAudio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return false;
    }

    const seekTime = calculateCurrentChunkSeekTime({
      progress,
      currentChunk: this.readerState.currentChunk,
      totalChunks: this.readerState.totalChunks,
      duration: audio.duration,
    });

    if (seekTime === null) {
      return false;
    }

    return this.seekCurrentAudioToTime(seekTime);
  }

  seekCurrentAudioBySeconds(deltaSeconds) {
    const audio = this.currentAudio;
    const delta = Number(deltaSeconds);
    if (!audio || !Number.isFinite(delta)) {
      return false;
    }

    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
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
    const chunkProgress = duration ? audio.currentTime / duration : 0;
    this.setReaderState({
      progress: this.readerState.totalChunks ? (chunkIndex + chunkProgress) / this.readerState.totalChunks : 0,
    });
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
    this.pauseRequested = false;

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
      isPaused: false,
      phase: 'queued',
      progress: total ? targetIndex / total : 0,
      status: 'running',
      totalChunks: total,
    });

    return true;
  }

  async pauseOrResume() {
    const audio = this.currentAudio;

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
      this.notifySessionChunkWaiters(session);
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
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.handlePanelKeydown = this.handlePanelKeydown.bind(this);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Voice Reader';
  }

  getIcon() {
    return 'volume-2';
  }

  async onOpen() {
    this.plugin.registerReaderView(this);
  }

  async onClose() {
    this.plugin.unregisterReaderView(this);
  }

  render() {
    const root = this.contentEl || this.containerEl.children[1] || this.containerEl;
    const state = this.plugin.readerState || createReaderState();

    root.empty();
    root.addClass('note-reader-cosyvoice-view');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'Voice reader controls');
    root.addEventListener('keydown', this.handlePanelKeydown);

    const header = root.createDiv({ cls: 'note-reader-cosyvoice-panel-header' });
    header.createEl('h3', { text: 'Voice Reader' });
    header.createDiv({ cls: `note-reader-cosyvoice-state is-${state.status}`, text: state.label });

    const progressWrap = root.createDiv({ cls: 'note-reader-cosyvoice-progress-wrap' });
    const progressControls = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-progress-controls' });
    this.createIconButton(progressControls, 'skip-back', 'Previous chunk', () => {
      this.plugin.jumpToAdjacentChunk(-1);
    }, !state.canPreviousChunk, { triggerOnPointerDown: true });
    const progressTrack = progressControls.createDiv({
      cls: `note-reader-cosyvoice-progress-track${state.canSeek ? ' is-seekable' : ''}`,
    });
    const progressFill = progressTrack.createDiv({ cls: 'note-reader-cosyvoice-progress-fill' });
    progressFill.style.width = `${Math.round(state.progress * 100)}%`;
    const progressInput = progressTrack.createEl('input', {
      cls: 'note-reader-cosyvoice-progress-input',
      attr: {
        'aria-label': 'Reading progress',
        max: '1000',
        min: '0',
        step: '1',
        title: state.canSeek ? 'Drag to seek within the current audio chunk' : 'Progress is seekable while audio is playing',
        type: 'range',
        value: String(Math.round(state.progress * 1000)),
      },
    });
    progressInput.disabled = !state.canSeek;
    progressInput.addEventListener('input', () => {
      if (!state.canSeek) {
        return;
      }
      const requestedProgress = Number(progressInput.value) / 1000;
      this.plugin.seekToProgress(requestedProgress);
    });
    this.createIconButton(progressControls, 'skip-forward', 'Next chunk', () => {
      this.plugin.jumpToAdjacentChunk(1);
    }, !state.canNextChunk, { triggerOnPointerDown: true });

    const meta = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-meta' });
    meta.createSpan({ text: formatProgressLabel(state) });
    meta.createSpan({ text: `${Math.round(state.progress * 100)}%` });

    this.createSpeedPanel(root);

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
    this.createActionButton(actions, 'download', 'Export audio', () => {
      this.runPluginAction('Export audio', () => this.plugin.exportCurrentFileAudio({ insertAfterExport: false }));
    }, !canExportFile, {
      title: 'Export all, selected, or remaining audio from the current note or PDF',
      triggerOnPointerDown: true,
    });
    this.createActionButton(actions, 'paperclip', 'Export & insert audio', () => {
      this.runPluginAction('Export and insert audio', () => this.plugin.exportCurrentFileAudio({ insertAfterExport: true }));
    }, !canInsertExport, {
      title: canInsertExport
        ? 'Export audio and insert it into the current Markdown note'
        : 'Audio can be inserted into Markdown notes, not PDF files',
      triggerOnPointerDown: true,
    });
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
      void this.plugin.resumeCurrentFile();
    }, !canResumeFile);
    this.createActionButton(
      actions,
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
      actions,
      'square',
      'Stop',
      () => {
        void this.plugin.stopReading();
      },
      !state.canStop
    );

    const details = root.createDiv({ cls: 'note-reader-cosyvoice-details' });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: 'Phase' });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-value', text: state.phase });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: 'Source' });
    details.createDiv({ cls: 'note-reader-cosyvoice-detail-value', text: state.source || '-' });

    if (state.error) {
      root.createDiv({ cls: 'note-reader-cosyvoice-error', text: state.error });
    }

    const preview = root.createDiv({ cls: 'note-reader-cosyvoice-preview' });
    preview.createDiv({ cls: 'note-reader-cosyvoice-detail-label', text: 'Text' });
    preview.createDiv({
      cls: 'note-reader-cosyvoice-preview-text',
      text: state.currentText || '-',
    });
  }

  createSpeedPanel(parent) {
    const currentSpeed = normalizeSpeed(this.plugin.settings && this.plugin.settings.speed);
    const panel = parent.createDiv({ cls: 'note-reader-cosyvoice-speed-panel' });
    const header = panel.createDiv({ cls: 'note-reader-cosyvoice-speed-header' });
    header.createSpan({ cls: 'note-reader-cosyvoice-detail-label', text: 'Speed' });
    header.createSpan({ cls: 'note-reader-cosyvoice-speed-current', text: formatSpeedLabel(currentSpeed) });

    const options = panel.createDiv({ cls: 'note-reader-cosyvoice-speed-options' });
    for (const speed of getSpeedPresets()) {
      const isActive = Math.abs(currentSpeed - speed) < 0.001;
      const button = options.createEl('button', {
        cls: `note-reader-cosyvoice-speed-option${isActive ? ' is-active' : ''}`,
        text: formatSpeedLabel(speed),
        attr: {
          'aria-label': `Set speech speed to ${formatSpeedLabel(speed)}`,
          'aria-pressed': String(isActive),
          title: `Set speech speed to ${formatSpeedLabel(speed)}`,
        },
      });
      button.addEventListener('click', () => {
        void this.plugin.setSpeechSpeed(speed);
      });
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
    const button = parent.createEl('button', {
      cls: 'note-reader-cosyvoice-icon-button',
      attr: {
        'aria-label': label,
        title: label,
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
    const button = parent.createEl('button', {
      cls: 'note-reader-cosyvoice-action',
      attr: {
        'aria-label': label,
        title: options.title || label,
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

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Note and PDF Voice Reader' });
    const settingsLanguage = normalizeSettingsLanguage(this.plugin.settings.settingsLanguage);
    const ui = getSettingsUiText(settingsLanguage);
    const selectedSpeechEngine = normalizeSpeechEngine(this.plugin.settings.speechEngine);
    const microsoftVoicePresets = getMicrosoftVoicePresets(settingsLanguage);
    const commonVoiceIds = new Set(microsoftVoicePresets.map(([id]) => id));

    new Setting(containerEl)
      .setName(ui.settingsLanguageName)
      .setDesc(ui.settingsLanguageDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('english', ui.settingsLanguageEnglish)
          .addOption('chinese', ui.settingsLanguageChinese)
          .setValue(settingsLanguage)
          .onChange(async (value) => {
            this.plugin.settings.settingsLanguage = normalizeSettingsLanguage(value);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(ui.speechEngineName)
      .setDesc(ui.speechEngineDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local-cosyvoice', ui.speechEngineLocal)
          .addOption('edge-tts', ui.speechEngineEdge)
          .addOption('azure-speech', ui.speechEngineAzure)
          .addOption('openrouter-tts', ui.speechEngineOpenRouter)
          .setValue(selectedSpeechEngine)
          .onChange(async (value) => {
            this.plugin.settings.speechEngine = normalizeSpeechEngine(value);
            await this.plugin.saveSettings();
            this.display();
          });
      });

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
              .setPlaceholder('C:\\Users\\you\\AppData\\Local\\note-reader-cosyvoice\\azure-speech-key.txt')
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
              .setPlaceholder('C:\\Users\\you\\AppData\\Local\\note-reader-cosyvoice\\openrouter-api-key.txt')
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
        .setName(ui.openRouterPrivacyName)
        .setDesc(ui.openRouterPrivacyDesc);
    }

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(ui.stripMarkdownName)
      .setDesc(ui.stripMarkdownDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.stripMarkdown).onChange(async (value) => {
          this.plugin.settings.stripMarkdown = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(ui.mathLanguageName)
      .setDesc(ui.mathLanguageDesc)
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

    new Setting(containerEl)
      .setName(ui.rememberPositionName)
      .setDesc(ui.rememberPositionDesc)
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.rememberReadingPosition === true).onChange(async (value) => {
          this.plugin.settings.rememberReadingPosition = value;
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

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName(ui.restoreDefaultsName)
      .setDesc(ui.restoreDefaultsDesc)
      .addButton((button) => {
        button
          .setButtonText(ui.restoreDefaultsButton)
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettingsToDefaults();
            new Notice(ui.settingsRestoredNotice);
            this.display();
          });
      });

    containerEl.createEl('p', {
      cls: 'note-reader-cosyvoice-muted',
      text: ui.commandsFooter,
    });
  }
}

module.exports = {
  default: CosyVoiceReaderPlugin,
  __test: {
    DEFAULT_ONLINE_CHUNK_LIMITS,
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
