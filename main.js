const { ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, setIcon } = require('obsidian');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const PLUGIN_ID = 'note-reader-cosyvoice';
const VIEW_TYPE = 'note-reader-cosyvoice-control';
const DEFAULT_CHUNK_LIMITS = [40, 80, 120, 160, 280, 320];
const SPEED_PRESETS = [1, 1.25, 1.5, 2];
const LATEX_FORMULA_MAX_CHARS = 12;
const LATEX_COMMAND_REPLACEMENTS = [
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
];

const DEFAULT_SETTINGS = {
  scriptPath: resolveDefaultScriptPath(),
  speed: 1,
  stripMarkdown: true,
  cleanupCache: true,
  chunkLimits: DEFAULT_CHUNK_LIMITS.join(','),
};

function normalizeLineBreaks(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function sanitizeTextForSpeech(text) {
  let value = sanitizeLatexForSpeech(normalizeLineBreaks(text));

  value = value.replace(/^---\n[\s\S]*?\n---\n?/, '');
  value = value.replace(/```[\s\S]*?```/g, ' ');
  value = value.replace(/!\[\[[^\]]+\]\]/g, ' ');
  value = value.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  value = value.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/<[^>]+>/g, ' ');
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/^\s*[-+*]\s+/gm, '');
  value = value.replace(/[*_~]/g, '');
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

function sanitizeLatexForSpeech(text) {
  let value = normalizeLineBreaks(text);

  value = value.replace(/\$\$([\s\S]*?)\$\$/g, replaceLatexFormula);
  value = value.replace(/\\\[([\s\S]*?)\\\]/g, replaceLatexFormula);
  value = value.replace(/\\\(([\s\S]*?)\\\)/g, replaceLatexFormula);
  value = value.replace(/\$([^$\n]+?)\$/g, replaceLatexFormula);

  return verbalizeLatexCommands(value);
}

function replaceLatexFormula(match, content) {
  if (isLongLatexFormula(content)) {
    return ' ';
  }

  return ` ${verbalizeShortLatex(content)} `;
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

function verbalizeShortLatex(content) {
  let value = stripLatexDelimiters(content);

  value = verbalizeLatexCommands(value);
  value = value.replace(/_/g, ' 下标 ');
  value = value.replace(/\^/g, ' 上标 ');
  value = value.replace(/\+/g, ' 加 ');
  value = value.replace(/=/g, ' 等于 ');
  value = value.replace(/[{}()[\]]/g, ' ');
  value = value.replace(/\\/g, ' ');

  return cleanupLatexSpeech(value);
}

function verbalizeLatexCommands(text) {
  let value = replaceLatexCommands(String(text || ''));
  value = replaceLatexSymbolCommands(value);
  return cleanupLatexSpeechPreservingLines(value);
}

function replaceLatexCommands(text) {
  let value = String(text || '');
  let previous = '';

  while (value !== previous) {
    previous = value;
    value = value.replace(/\\(?:textbf|mathbf|boldsymbol|textit|emph|mathrm|operatorname|text)\s*\{([^{}]*)\}/g, '$1');
    value = value.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 分之 $2');
  }

  return value;
}

function replaceLatexSymbolCommands(text) {
  let value = String(text || '');

  for (const [command, speech] of LATEX_COMMAND_REPLACEMENTS) {
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

function parseChunkLimits(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());

  const limits = list
    .map((item) => Math.floor(Number(item)))
    .filter((item) => Number.isFinite(item) && item > 0);

  return limits.length ? limits : DEFAULT_CHUNK_LIMITS.slice();
}

function splitTextForSpeechChunks(text, maxLengths = DEFAULT_CHUNK_LIMITS) {
  const limits = parseChunkLimits(maxLengths);
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > 0) {
    const limit = limits[Math.min(chunks.length, limits.length - 1)];

    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    const cut = chooseChunkCut(remaining, limit);
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(cut).trim();
  }

  return chunks;
}

function chooseChunkCut(text, limit) {
  const minUsefulCut = Math.floor(limit * 0.45);
  const search = text.slice(0, limit + 1);

  for (const pattern of [/[。！？!?]\s?/g, /[，,；;：:]\s?/g, /\s/g]) {
    let match;
    let best = -1;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(search)) !== null) {
      const end = match.index + match[0].length;
      if (end > 0 && end <= limit) {
        best = end;
      }
    }

    if (best >= minUsefulCut) {
      return best;
    }
  }

  return limit;
}

function resolveDefaultScriptPath() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');

  return path.join(localAppData, 'note-reader-cosyvoice', 'cosyvoice-wrapper.ps1');
}

function normalizeSpeed(value) {
  const speed = Number(value);

  if (!Number.isFinite(speed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.5, speed));
}

function getSpeedPresets() {
  return SPEED_PRESETS.slice();
}

function formatSpeedLabel(speed) {
  return `${normalizeSpeed(speed).toString()}x`;
}

function createDefaultSettings() {
  return {
    cleanupCache: DEFAULT_SETTINGS.cleanupCache,
    chunkLimits: parseChunkLimits(DEFAULT_SETTINGS.chunkLimits).join(','),
    scriptPath: resolveDefaultScriptPath(),
    speed: normalizeSpeed(DEFAULT_SETTINGS.speed),
    stripMarkdown: DEFAULT_SETTINGS.stripMarkdown,
  };
}

function createReaderState(overrides = {}) {
  return normalizeReaderState({
    canPause: false,
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

function previewText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function resolvePowerShellExecutable() {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const windowsPowerShell = path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  if (fs.existsSync(windowsPowerShell)) {
    return windowsPowerShell;
  }

  return 'powershell.exe';
}

class CosyVoiceReaderPlugin extends Plugin {
  async onload() {
    this.sequence = 0;
    this.activeSession = null;
    this.currentAudio = null;
    this.currentProcess = null;
    this.lastMarkdownView = null;
    this.pauseRequested = false;
    this.readerState = createReaderState();
    this.readerViews = new Set();
    this.vaultBasePath = null;
    this.cacheDir = null;
    this.logPath = null;
    this.statusBar = this.addStatusBarItem();

    await this.loadSettings();
    await this.ensureCacheDir();

    this.registerView(VIEW_TYPE, (leaf) => new CosyVoiceReaderView(leaf, this));
    this.lastMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
          this.lastMarkdownView = view;
        }
      })
    );

    this.addRibbonIcon('volume-2', 'Open CosyVoice reader controls', () => {
      void this.activateControlView();
    });

    this.addCommand({
      id: 'open-control-panel',
      name: 'Open CosyVoice reader controls',
      callback: () => {
        void this.activateControlView();
      },
    });

    this.addCommand({
      id: 'read-current-note',
      name: 'Read current note with CosyVoice',
      callback: () => {
        void this.readCurrentNote();
      },
    });

    this.addCommand({
      id: 'read-selection',
      name: 'Read selection with CosyVoice',
      callback: () => {
        void this.readSelection();
      },
    });

    this.addCommand({
      id: 'read-from-selection',
      name: 'Read from selection with CosyVoice',
      callback: () => {
        void this.readFromSelection();
      },
    });

    this.addCommand({
      id: 'pause-or-resume',
      name: 'Pause or resume CosyVoice reading',
      callback: () => {
        void this.pauseOrResume();
      },
    });

    this.addCommand({
      id: 'stop-reading',
      name: 'Stop CosyVoice reading',
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
  }

  async loadSettings() {
    const defaults = createDefaultSettings();
    this.settings = Object.assign({}, defaults, await this.loadData());
    this.settings.speed = normalizeSpeed(this.settings.speed);
    this.settings.scriptPath = String(this.settings.scriptPath || defaults.scriptPath);
    this.settings.chunkLimits = parseChunkLimits(this.settings.chunkLimits).join(',');
  }

  async saveSettings() {
    this.settings.speed = normalizeSpeed(this.settings.speed);
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
      throw new Error('Note Reader CosyVoice requires the desktop FileSystemAdapter.');
    }

    this.vaultBasePath = adapter.getBasePath();
    this.cacheDir = path.join(this.vaultBasePath, '.obsidian', 'plugins', PLUGIN_ID, 'cache');
    this.logPath = path.join(this.vaultBasePath, '.obsidian', 'plugins', PLUGIN_ID, 'last-error.log');
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
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

  getActiveMarkdownView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView) || this.lastMarkdownView;

    if (!view || !view.editor) {
      new Notice('CosyVoice: no active Markdown note.');
      return null;
    }

    this.lastMarkdownView = view;
    return view;
  }

  async readCurrentNote() {
    const view = this.getActiveMarkdownView();
    if (!view) {
      return;
    }

    const selection = view.editor.getSelection();
    const text = selection && selection.trim() ? selection : view.editor.getValue();
    await this.activateControlView();
    await this.startReading(text, selection && selection.trim() ? 'selection' : view.file?.basename || 'note');
  }

  async readSelection() {
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
    await this.startReading(text, 'from selection');
  }

  async startReading(rawText, sourceLabel) {
    const text = this.settings.stripMarkdown
      ? sanitizeTextForSpeech(rawText)
      : normalizeLineBreaks(rawText).trim();

    if (!text) {
      new Notice('CosyVoice: nothing readable in this note.');
      return;
    }

    const scriptPath = this.settings.scriptPath.trim();
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      new Notice(`CosyVoice: script not found: ${scriptPath || '(empty)'}`, 8000);
      return;
    }

    await this.stopReading({ silent: true });
    this.pauseRequested = false;

    const chunks = splitTextForSpeechChunks(text, parseChunkLimits(this.settings.chunkLimits));
    const session = {
      id: ++this.sequence,
      stopped: false,
      files: [],
      totalChunks: chunks.length,
    };

    this.activeSession = session;
    this.updateStatus(`CosyVoice 0/${chunks.length}`, {
      canPause: false,
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
      source: sourceLabel,
      textLength: text.length,
    });
    new Notice(`CosyVoice: reading ${sourceLabel}. First synthesis may take a while.`, 6000);

    try {
      let nextPrepared = this.queuePrepareChunk(chunks[0], 0, session);

      for (let index = 0; index < chunks.length; index += 1) {
        if (!this.isActive(session)) {
          break;
        }

        const prepared = await nextPrepared;
        const nextIndex = index + 1;
        nextPrepared =
          nextIndex < chunks.length ? this.queuePrepareChunk(chunks[nextIndex], nextIndex, session) : null;

        await this.playPreparedAudio(prepared, session, index, chunks.length);
      }

      if (this.isActive(session)) {
        this.updateStatus('CosyVoice complete', {
          canPause: false,
          canStop: false,
          isPaused: false,
          phase: 'complete',
          progress: 1,
          status: 'complete',
        });
        this.activeSession = null;
      }
    } catch (error) {
      if (this.isActive(session)) {
        this.updateStatus('CosyVoice error', {
          canPause: false,
          canStop: false,
          error: messageFromError(error),
          isPaused: false,
          phase: 'error',
          status: 'error',
        });
        await this.writeRuntimeLog('failed', {
          message: messageFromError(error),
        });
        new Notice(`CosyVoice failed: ${messageFromError(error)}`, 10000);
      }
    } finally {
      if (this.settings.cleanupCache) {
        await this.cleanupSessionFiles(session);
      }
    }
  }

  async prepareChunk(chunkText, index, session) {
    if (!this.isActive(session)) {
      throw new Error('Reading stopped.');
    }

    const basename = `${Date.now()}-${session.id}-${index}`;
    const inputPath = path.join(this.cacheDir, `${basename}.txt`);
    const outputPath = path.join(this.cacheDir, `${basename}.wav`);

    session.files.push(inputPath, outputPath);
    await fs.promises.writeFile(inputPath, chunkText, 'utf8');

    this.updateStatus(`CosyVoice synth ${index + 1}/${session.totalChunks || 0}`, {
      canPause: true,
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
    await this.runCosyVoice(inputPath, outputPath, session);

    const outputStat = await fs.promises.stat(outputPath);
    if (outputStat.size <= 44) {
      throw new Error(`CosyVoice generated an invalid WAV file: ${outputStat.size} bytes.`);
    }

    if (!this.isActive(session)) {
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

  playPreparedAudio(prepared, session, index, total) {
    return new Promise((resolve, reject) => {
      if (!this.isActive(session)) {
        resolve();
        return;
      }

      this.waitWhilePaused(session).then(() => {
        if (!this.isActive(session)) {
          resolve();
          return;
        }

        const audio = new Audio(prepared.url);
        audio.preload = 'auto';
        this.currentAudio = audio;
        this.updateStatus(`CosyVoice play ${index + 1}/${total}`, {
          canPause: true,
          canSeek: true,
          canStop: true,
          currentChunk: index + 1,
          isPaused: false,
          phase: 'playing',
          progress: total ? index / total : 0,
          status: 'running',
          totalChunks: total,
        });
        void this.writeRuntimeLog('play', {
          index,
          urlScheme: String(prepared.url).split(':')[0],
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
          this.setReaderState({
            progress: total ? (index + chunkProgress) / total : 0,
          });
        };

        audio.onended = () => {
          if (this.currentAudio === audio) {
            this.currentAudio = null;
          }
          this.setReaderState({
            canPause: false,
            canSeek: false,
            isPaused: false,
            progress: total ? (index + 1) / total : 1,
          });
          resolve();
        };

        audio.onerror = () => {
          if (this.currentAudio === audio) {
            this.currentAudio = null;
          }
          reject(new Error(`Unable to play ${prepared.outputPath}`));
        };

        audio.play().catch((error) => {
          if (this.currentAudio === audio) {
            this.currentAudio = null;
          }
          reject(error);
        });
      }).catch(reject);
    });
  }

  async waitWhilePaused(session) {
    while (this.isActive(session) && this.pauseRequested) {
      this.updateStatus('CosyVoice paused', {
        canPause: true,
        canSeek: Boolean(this.currentAudio),
        canStop: true,
        isPaused: true,
        phase: 'paused',
        status: 'paused',
      });
      await sleep(100);
    }
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

    audio.currentTime = seekTime;
    const chunkIndex = Math.max(0, (this.readerState.currentChunk || 1) - 1);
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const chunkProgress = duration ? seekTime / duration : 0;
    this.setReaderState({
      progress: this.readerState.totalChunks ? (chunkIndex + chunkProgress) / this.readerState.totalChunks : 0,
    });
    return true;
  }

  async pauseOrResume() {
    const audio = this.currentAudio;

    if (!audio) {
      if (!this.activeSession) {
        new Notice('CosyVoice: nothing is playing.');
        return;
      }

      this.pauseRequested = !this.pauseRequested;
      this.updateStatus(this.pauseRequested ? 'CosyVoice paused' : 'CosyVoice waiting', {
        canPause: true,
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
        canSeek: true,
        canStop: true,
        isPaused: true,
        phase: 'paused',
        status: 'paused',
      });
    }
  }

  async stopReading(options = {}) {
    const previous = this.activeSession;
    this.sequence += 1;

    if (previous) {
      previous.stopped = true;
    }
    this.pauseRequested = false;

    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio = null;
    }

    this.activeSession = null;
    this.updateStatus('CosyVoice idle', createReaderState());

    if (previous && this.settings && this.settings.cleanupCache) {
      await this.cleanupSessionFiles(previous);
    }

    if (!options.silent) {
      new Notice('CosyVoice: stopped.');
    }
  }

  async cleanupSessionFiles(session) {
    if (!session || !Array.isArray(session.files)) {
      return;
    }

    for (const filePath of session.files) {
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
    if (this.statusBar) {
      this.statusBar.setText(text);
    }
    this.setReaderState({
      label: text,
      ...patch,
    });
  }

  async writeRuntimeLog(stage, details = {}) {
    if (!this.logPath) {
      return;
    }

    const event = {
      time: new Date().toISOString(),
      stage,
      ...details,
    };

    try {
      await fs.promises.appendFile(this.logPath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Could not write runtime log`, error);
    }
  }
};

class CosyVoiceReaderView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'CosyVoice Reader';
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

    const header = root.createDiv({ cls: 'note-reader-cosyvoice-panel-header' });
    header.createEl('h3', { text: 'CosyVoice Reader' });
    header.createDiv({ cls: `note-reader-cosyvoice-state is-${state.status}`, text: state.label });

    const progressWrap = root.createDiv({ cls: 'note-reader-cosyvoice-progress-wrap' });
    const progressTrack = progressWrap.createDiv({
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

    const meta = progressWrap.createDiv({ cls: 'note-reader-cosyvoice-meta' });
    meta.createSpan({ text: formatProgressLabel(state) });
    meta.createSpan({ text: `${Math.round(state.progress * 100)}%` });

    this.createSpeedPanel(root);

    const actions = root.createDiv({ cls: 'note-reader-cosyvoice-actions' });
    this.createActionButton(actions, 'play', 'Read selection', () => {
      void this.plugin.readSelection();
    });
    this.createActionButton(actions, 'list-start', 'Read from selection', () => {
      void this.plugin.readFromSelection();
    });
    this.createActionButton(actions, 'file-text', 'Read note', () => {
      void this.plugin.readCurrentNote();
    });
    this.createActionButton(
      actions,
      state.isPaused ? 'play' : 'pause',
      state.isPaused ? 'Resume' : 'Pause',
      () => {
        void this.plugin.pauseOrResume();
      },
      !state.canPause
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

  createActionButton(parent, icon, label, onClick, disabled = false) {
    const button = parent.createEl('button', {
      cls: 'note-reader-cosyvoice-action',
      attr: {
        'aria-label': label,
        title: label,
      },
    });
    button.disabled = disabled;

    const iconEl = button.createSpan({ cls: 'note-reader-cosyvoice-action-icon' });
    if (typeof setIcon === 'function') {
      setIcon(iconEl, icon);
    }

    button.createSpan({ cls: 'note-reader-cosyvoice-action-label', text: label });
    button.addEventListener('click', onClick);
    return button;
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

    containerEl.createEl('h2', { text: 'Note Reader CosyVoice' });

    new Setting(containerEl)
      .setName('CosyVoice script')
      .setDesc('PowerShell wrapper used to call your local CosyVoice service.')
      .addText((text) => {
        text
          .setPlaceholder(resolveDefaultScriptPath())
          .setValue(this.plugin.settings.scriptPath)
          .onChange(async (value) => {
            this.plugin.settings.scriptPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('note-reader-cosyvoice-script-input');
      });

    new Setting(containerEl)
      .setName('Speed')
      .setDesc('Speech speed passed to the local CosyVoice wrapper.')
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
      .setName('Chunk limits')
      .setDesc('Comma-separated character limits. Earlier chunks are shorter so playback starts sooner.')
      .addText((text) => {
        text.setValue(this.plugin.settings.chunkLimits).onChange(async (value) => {
          this.plugin.settings.chunkLimits = parseChunkLimits(value).join(',');
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Strip Markdown')
      .setDesc('Remove frontmatter, links, headings, embeds, and common formatting before synthesis.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.stripMarkdown).onChange(async (value) => {
          this.plugin.settings.stripMarkdown = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Clean temporary audio')
      .setDesc('Delete generated text and WAV files after reading finishes or stops.')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.cleanupCache).onChange(async (value) => {
          this.plugin.settings.cleanupCache = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Restore default settings')
      .setDesc('Reset every setting on this page to its default value and save immediately.')
      .addButton((button) => {
        button
          .setButtonText('Restore defaults')
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettingsToDefaults();
            new Notice('CosyVoice: settings restored to defaults.');
            this.display();
          });
      });

    containerEl.createEl('p', {
      cls: 'note-reader-cosyvoice-muted',
      text: 'Commands: read current note, read selection, pause or resume, and stop.',
    });
  }
}

module.exports = {
  default: CosyVoiceReaderPlugin,
  __test: {
    VIEW_TYPE,
    calculateCurrentChunkSeekTime,
    createDefaultSettings,
    createReaderState,
    formatProgressLabel,
    formatSpeedLabel,
    getTextFromPositionToEnd,
    getAudioUrlForFile,
    getSpeedPresets,
    resolveDefaultScriptPath,
    resolvePowerShellExecutable,
    sanitizeTextForSpeech,
    sanitizeLatexForSpeech,
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
