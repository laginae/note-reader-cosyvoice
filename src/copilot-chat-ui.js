'use strict';

const { Modal, Notice, Setting, setIcon } = require('obsidian');
const { CHAT_SCOPES, normalizeChatFolder, listChatFiles, selectChatText, loadChatSnapshot, verifyChatSnapshot } = require('./copilot-chat');

const SCOPE_LABELS = {
  latest: ['最新一条回复', 'Latest reply'], two: ['最近两条回复', 'Last two replies'], turn: ['最近一轮问答', 'Latest question and answer'],
};
const ERRORS = {
  CHAT_EMPTY: ['未找到已保存的 Copilot 对话。请先保存对话或检查对话目录设置。', 'No saved Copilot conversation found. Save a chat or check the conversation folder.'],
  CHAT_FOLDER: ['请使用仓库内的目录路径，不支持绝对路径或上级目录。', 'Use a vault-relative folder without parent or hidden directories.'],
  CHAT_SIZE: ['对话超过 2 MB，或文件大小不可用。请打开文件并选中需要朗读的部分。', 'Chat exceeds 2 MB or its size is unavailable. Open the note and read a selection instead.'],
  CHAT_FORMAT: ['未识别到 Copilot 对话格式。请在 Copilot 中保存为 Markdown 后刷新。', 'Copilot transcript format not recognized. Save the chat as Markdown in Copilot, then refresh.'],
  CHAT_CHANGED: ['对话已变化，请刷新预览后再播放。', 'Conversation changed. Refresh the preview before playing.'],
  CHAT_NO_REPLY: ['尚无已保存的 AI 回复。请等待回复保存后刷新。', 'No saved AI reply yet. Refresh after the reply has been saved.'],
};
function node(parent, tag, className = '', text = '') {
  const el = parent.ownerDocument.createElement(tag); el.className = className; el.textContent = text; parent.append(el); return el;
}
function t(plugin, zh, en) { return plugin.settings.settingsLanguage === 'chinese' ? zh : en; }
function preparationKey(plugin) {
  return JSON.stringify([plugin.settings.speechEngine, plugin.settings.stripMarkdown, plugin.settings.mathReadingLanguage, plugin.settings.settingsLanguage]);
}

async function readLatestCopilotReply(plugin, options = {}) {
  if (plugin.latestCopilotReadPending) return;
  const say = (zh, en) => new Notice(t(plugin, zh, en));
  if (plugin.settings.copilotChatEnabled === false) { say('请先开启 Copilot 聊天朗读。', 'Enable Copilot chat reading first.'); return; }
  if (plugin.activeSession?.kind === 'audio-export') { say('请等待音频导出完成。', 'Wait for the audio export to finish.'); return; }
  plugin.latestCopilotReadPending = true;
  const action = plugin.webActionSequence = (plugin.webActionSequence || 0) + 1;
  const key = preparationKey(plugin), folder = plugin.settings.copilotChatFolder;
  const cancelled = () => plugin.webActionSequence !== action || options.isCancelled?.()
    || plugin.settings.copilotChatEnabled === false;
  try {
    const vault = plugin.app.vault, file = listChatFiles(vault, folder)[0];
    if (!file) throw new Error('CHAT_EMPTY');
    const snapshot = await loadChatSnapshot(vault, file);
    if (cancelled()) return;
    const selection = selectChatText(snapshot.transcript, 'latest', false);
    if (!plugin.sanitizeAudioExportText(selection.text).trim()) throw new Error('CHAT_NO_REPLY');
    await verifyChatSnapshot(vault, snapshot);
    if (cancelled()) return;
    if (folder !== plugin.settings.copilotChatFolder || key !== preparationKey(plugin)
      || listChatFiles(vault, folder)[0] !== file) throw new Error('CHAT_CHANGED');
    if (plugin.activeSession?.kind === 'audio-export') { say('请等待音频导出完成。', 'Wait for the audio export to finish.'); return; }
    const label = `Copilot · ${file.basename || file.name} · ${t(plugin, '最新一条回复', 'Latest reply')}`;
    options.beforeStart?.();
    await plugin.runUserAction('Read latest Copilot reply', () => plugin.startReading(selection.text, label, { sourceKind: 'copilot', skipReadingPosition: true }));
  } catch (error) {
    if (!cancelled()) say(...(ERRORS[error.message] || ['无法读取最近对话，请重试或打开聊天朗读窗口。', 'Cannot read the latest conversation. Retry or open the chat picker.']));
  } finally { plugin.latestCopilotReadPending = false; }
}

class CopilotChatModal extends Modal {
  constructor(plugin, preferredFile = null) {
    super(plugin.app); this.plugin = plugin; this.preferredFile = preferredFile;
    this.closed = false; this.sequence = 0; this.listeners = []; this.busy = false;
  }
  text(zh, en) { return t(this.plugin, zh, en); }
  icon(parent, name, label, action) {
    const button = node(parent, 'button', 'clickable-icon'); button.type = 'button'; button.setAttribute('aria-label', label); setIcon(button, name);
    button.addEventListener('click', () => { void action(); }); return button;
  }
  async onOpen() {
    this.modalEl.classList.add('note-reader-chat-modal');
    node(this.contentEl, 'h2', '', this.text('Copilot 聊天朗读', 'Read Copilot chat'));
    const filters = node(this.contentEl, 'div', 'note-reader-chat-filters');
    this.search = node(filters, 'input'); this.search.type = 'search'; this.search.placeholder = this.text('搜索已保存的对话', 'Search saved conversations');
    this.search.setAttribute('aria-label', this.search.placeholder);
    this.refresh = this.icon(filters, 'refresh-cw', this.text('刷新对话与预览', 'Refresh conversations and preview'), () => this.reload());
    this.files = node(this.contentEl, 'select', 'note-reader-chat-files'); this.files.setAttribute('aria-label', this.text('已保存的对话', 'Saved conversation'));
    this.pathLabel = node(this.contentEl, 'div', 'note-reader-chat-path');
    const choices = node(this.contentEl, 'div', 'note-reader-chat-choices');
    // Modal.scope is owned by Obsidian's keyboard handling and must not be replaced.
    this.readingScopeSelect = node(choices, 'select'); this.readingScopeSelect.setAttribute('aria-label', this.text('朗读范围', 'Reading scope'));
    for (const value of CHAT_SCOPES) { const option = node(this.readingScopeSelect, 'option', '', this.text(...SCOPE_LABELS[value])); option.value = value; }
    this.readingScopeSelect.value = this.plugin.settings.copilotChatScope || 'latest';
    const questionLabel = node(choices, 'label', 'note-reader-chat-question');
    this.questions = node(questionLabel, 'input'); this.questions.type = 'checkbox'; this.questions.checked = this.plugin.settings.copilotIncludeQuestions === true;
    node(questionLabel, 'span', '', this.text('包含我的提问', 'Include my questions'));
    this.questionPreference = this.questions.checked;
    this.status = node(this.contentEl, 'p', 'note-reader-chat-status'); this.status.setAttribute('role', 'status');
    this.preview = node(this.contentEl, 'textarea', 'note-reader-chat-preview'); this.preview.readOnly = true;
    this.preview.setAttribute('aria-label', this.text('即将朗读的文字', 'Text to be read'));
    this.destination = node(this.contentEl, 'p', 'note-reader-chat-destination');
    const footer = node(this.contentEl, 'div', 'note-reader-chat-footer');
    this.latestReplyButton = node(footer, 'button', '', this.text('朗读最近回答', 'Read latest reply'));
    this.latestReplyButton.type = 'button';
    this.latestReplyButton.setAttribute('aria-label', this.text('直接朗读最近保存对话的最新一条回答', 'Read the latest saved reply in the most recently saved conversation'));
    this.latestReplyButton.addEventListener('click', async () => {
      if (this.busy || this.closed) return;
      this.busy = true; this.latestReplyButton.disabled = true; this.play.disabled = true;
      try { await readLatestCopilotReply(this.plugin, { isCancelled: () => this.closed, beforeStart: () => this.close() }); }
      finally { this.busy = false; if (!this.closed) { this.latestReplyButton.disabled = false; this.drawPreview(); } }
    });
    this.openNote = this.icon(footer, 'file-text', this.text('打开对话笔记', 'Open conversation note'), async () => {
      const file = this.catalog.find(file => file.path === this.files.value);
      if (file) { this.close(); await this.app.workspace.getLeaf(false).openFile(file); }
    });
    this.play = node(footer, 'button', 'mod-cta', this.text('开始朗读', 'Read aloud')); this.play.type = 'button'; this.play.disabled = true;
    this.play.addEventListener('click', () => { void this.read(); });
    this.search.addEventListener('input', () => this.drawFiles(this.files.value));
    this.files.addEventListener('change', () => { void this.loadSelected(); });
    this.readingScopeSelect.addEventListener('change', () => this.drawPreview());
    this.questions.addEventListener('change', () => { this.questionPreference = this.questions.checked; this.drawPreview(); });
    if (this.app.vault.on) for (const event of ['modify', 'rename', 'delete']) this.listeners.push(this.app.vault.on(event, file => {
      if (file === this.snapshot?.file) this.invalidate(this.text(...ERRORS.CHAT_CHANGED));
    }));
    await this.reload(this.preferredFile?.path);
  }
  invalidate(message = '') {
    this.sequence++; this.snapshot = null; this.rawText = ''; this.preview.value = ''; this.play.disabled = true; this.status.textContent = message;
  }
  showError(error) { this.invalidate(this.text(...(ERRORS[error.message] || ['无法读取此对话，请刷新后重试。', 'Cannot read this conversation. Refresh and try again.']))); }
  async reload(preferredPath = this.files.value) {
    if (this.busy || this.closed) return;
    this.invalidate();
    try {
      this.catalog = listChatFiles(this.app.vault, this.plugin.settings.copilotChatFolder);
      this.drawFiles(preferredPath);
      this.drawPreview();
      if (this.files.value) await this.loadSelected();
    } catch (error) { this.showError(error); }
  }
  drawFiles(preferredPath) {
    const query = this.search.value.trim().toLocaleLowerCase();
    const matches = this.catalog.filter(file => file.path.toLocaleLowerCase().includes(query));
    const choices = matches.slice(0, 200);
    const preferred = matches.find(file => file.path === preferredPath);
    if (preferred && !choices.includes(preferred)) choices.push(preferred);
    this.files.replaceChildren();
    const empty = node(this.files, 'option', '', this.text('选择对话', 'Choose a conversation')); empty.value = '';
    for (const file of choices) {
      const modified = new Date(file.stat.mtime).toLocaleString(this.plugin.settings.settingsLanguage === 'chinese' ? 'zh-CN' : 'en-US');
      const option = node(this.files, 'option', '', `${file.path} · ${modified}`); option.value = file.path;
    }
    this.files.value = preferred?.path || '';
    this.openNote.disabled = !this.files.value;
    if (!this.files.value) {
      this.pathLabel.textContent = '';
      this.invalidate(!this.catalog.length
        ? this.text('未找到对话。请开启 Copilot 的“Autosave Chat as Markdown”，或在本插件设置中指定对话目录。', 'No conversations found. Enable Copilot Autosave Chat as Markdown or set the conversation folder in this plugin.')
        : !matches.length ? this.text('没有匹配的对话。', 'No matching conversations.')
          : this.text('请选择要朗读的对话。列表按保存时间排序，最多显示 200 项。', 'Choose a conversation. Sorted by save time; up to 200 matches shown.'));
    }
  }
  async loadSelected() {
    this.invalidate(this.text('正在读取已保存的对话…', 'Loading saved conversation...'));
    const sequence = this.sequence, file = this.catalog.find(file => file.path === this.files.value);
    this.openNote.disabled = !file; this.pathLabel.textContent = file?.path || '';
    if (!file) { this.status.textContent = this.text('请选择对话。', 'Choose a conversation.'); return; }
    try {
      const snapshot = await loadChatSnapshot(this.app.vault, file);
      if (this.closed || sequence !== this.sequence) return;
      this.snapshot = snapshot; this.drawPreview();
    } catch (error) { if (!this.closed && sequence === this.sequence) this.showError(error); }
  }
  drawPreview() {
    const turn = this.readingScopeSelect.value === 'turn'; this.questions.disabled = turn;
    this.questions.checked = turn || this.questionPreference;
    this.drawDestination();
    if (!this.snapshot) return;
    try {
      const selection = selectChatText(this.snapshot.transcript, this.readingScopeSelect.value, this.questions.checked, this.plugin.settings.settingsLanguage === 'chinese');
      this.rawText = selection.text; this.preview.value = this.plugin.sanitizeAudioExportText(selection.text);
      this.preparedKey = preparationKey(this.plugin);
      this.play.disabled = !this.preview.value || this.busy;
      this.status.textContent = `${selection.replyCount} ${this.text('条回复', selection.replyCount === 1 ? 'reply' : 'replies')} · ${this.preview.value.length} ${this.text('字符', 'characters')}`;
      if (selection.awaitingReply) this.status.textContent += this.text('。最新消息尚无已保存回复，当前预览为此前已保存的回答。', '. The newest message has no saved reply yet; this preview uses earlier saved answers.');
      if (!this.preview.value) this.status.textContent = this.text('所选回复清理后没有可朗读文字。', 'No readable text remains in the selected replies.');
    } catch (error) { this.rawText = ''; this.preview.value = ''; this.play.disabled = true; this.status.textContent = this.text(...(ERRORS[error.message] || ERRORS.CHAT_NO_REPLY)); }
  }
  drawDestination() {
    const engine = this.plugin.settings.speechEngine;
    const labels = { 'local-cosyvoice': 'CosyVoice', 'system-tts': this.text('系统语音', 'System speech'), 'edge-tts': 'Edge TTS', 'azure-speech': 'Azure Speech', 'openrouter-tts': 'OpenRouter TTS', 'mimo-tts': 'MiMo TTS' };
    this.destination.textContent = `${labels[engine] || engine || ''} · ${['local-cosyvoice', 'system-tts'].includes(engine)
      ? this.text('在本机合成语音', 'Speech is synthesized locally')
      : this.text('所选文字将发送给此在线语音服务', 'Selected text will be sent to this online speech service')}`;
  }
  async read() {
    if (this.busy || this.closed || !this.snapshot || !this.rawText || this.play.disabled) return;
    if (this.plugin.settings.copilotChatEnabled === false) { this.close(); return; }
    if (this.plugin.activeSession?.kind === 'audio-export') {
      this.status.textContent = this.text('请等待音频导出完成后再开始朗读。', 'Wait for the audio export to finish before reading.'); return;
    }
    if (this.preparedKey !== preparationKey(this.plugin)) {
      this.drawPreview(); this.status.textContent = this.text('语音或文字设置已变化，请核对新预览后再次点击播放。', 'Speech or text settings changed. Review the updated preview, then play again.'); return;
    }
    this.busy = true; this.play.disabled = true;
    const snapshot = this.snapshot, rawText = this.rawText, scope = this.readingScopeSelect.value, sequence = this.sequence, action = this.plugin.webActionSequence;
    try {
      await verifyChatSnapshot(this.app.vault, snapshot);
      if (this.closed || this.sequence !== sequence || this.plugin.webActionSequence !== action
        || this.rawText !== rawText || this.readingScopeSelect.value !== scope || this.plugin.settings.copilotChatEnabled === false) return;
      if (this.preparedKey !== preparationKey(this.plugin)) { this.drawPreview(); return; }
      const label = `Copilot · ${snapshot.file.basename || snapshot.path.replace(/.*\//, '').replace(/\.md$/i, '')} · ${this.text(...SCOPE_LABELS[this.readingScopeSelect.value])}`;
      this.close();
      void this.plugin.runUserAction('Read Copilot chat', () => this.plugin.startReading(rawText, label, { sourceKind: 'copilot', skipReadingPosition: true }));
    } catch (error) { if (!this.closed && this.sequence === sequence) this.showError(error); }
    finally { this.busy = false; if (!this.closed && this.snapshot) this.play.disabled = !this.preview.value; }
  }
  onClose() {
    this.closed = true; this.sequence++;
    for (const ref of this.listeners) this.app.vault.offref?.(ref);
    this.listeners = []; this.snapshot = null; this.catalog = []; this.rawText = '';
    this.contentEl.replaceChildren();
    if (this.plugin.copilotChatModal === this) this.plugin.copilotChatModal = null;
  }
}

function addCopilotChatSettings(container, plugin) {
  const label = (zh, en) => t(plugin, zh, en);
  new Setting(container).setName(label('Copilot 聊天朗读', 'Copilot chat reading'))
    .setDesc(label('朗读已保存的 Copilot Markdown 对话，使用当前语音引擎。在线引擎会收到所选文字。', 'Read saved Copilot Markdown conversations using the selected speech engine. Online engines receive the selected text.'))
    .addToggle(toggle => toggle.setValue(plugin.settings.copilotChatEnabled !== false).onChange(async value => {
      plugin.settings.copilotChatEnabled = value;
      if (!value) plugin.copilotChatModal?.close();
      await plugin.saveSettings(); plugin.renderReaderViews(); plugin.nativeToolbars?.render();
    }));
  new Setting(container).setName(label('Copilot 对话目录', 'Copilot conversation folder'))
    .setDesc(label('留空自动查找仓库中名为 copilot-conversations 的目录。自定义路径以仓库根目录为起点。', 'Leave empty to find copilot-conversations folders in the vault. Custom paths are relative to the vault root.'))
    .addText(input => input.setPlaceholder('copilot/copilot-conversations').setValue(plugin.settings.copilotChatFolder || '').onChange(async value => {
      try { plugin.settings.copilotChatFolder = normalizeChatFolder(value); await plugin.saveSettings(); }
      catch (_) { new Notice(label(...ERRORS.CHAT_FOLDER)); }
    }));
  new Setting(container).setName(label('聊天默认朗读范围', 'Default chat reading scope'))
    .addDropdown(dropdown => {
      for (const value of CHAT_SCOPES) dropdown.addOption(value, label(...SCOPE_LABELS[value]));
      dropdown.setValue(plugin.settings.copilotChatScope).onChange(async value => { plugin.settings.copilotChatScope = value; await plugin.saveSettings(); });
    });
  new Setting(container).setName(label('聊天朗读包含我的提问', 'Include my questions in chat reading'))
    .addToggle(toggle => toggle.setValue(plugin.settings.copilotIncludeQuestions === true).onChange(async value => {
      plugin.settings.copilotIncludeQuestions = value; await plugin.saveSettings();
    }));
}

module.exports = { CopilotChatModal, addCopilotChatSettings, readLatestCopilotReply };
