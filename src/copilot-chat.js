'use strict';

const MAX_CHAT_BYTES = 2 * 1024 * 1024;
const CHAT_SCOPES = ['latest', 'two', 'turn'];
const COPILOT_DEFAULTS = { copilotChatEnabled: true, copilotChatFolder: '', copilotChatScope: 'latest', copilotIncludeQuestions: false };

function normalizeChatFolder(value) {
  const original = String(value || '').trim().replace(/\\/g, '/');
  if (!original) return '';
  const folder = original.replace(/\/+$/, '');
  if (!folder) throw new Error('CHAT_FOLDER');
  if (folder.startsWith('/') || /[:\x00-\x1f]/.test(folder)
    || folder.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) throw new Error('CHAT_FOLDER');
  return folder;
}

function normalizeCopilotSettings(settings) {
  settings.copilotChatEnabled = settings.copilotChatEnabled !== false;
  settings.copilotChatScope = CHAT_SCOPES.includes(settings.copilotChatScope) ? settings.copilotChatScope : 'latest';
  settings.copilotIncludeQuestions = settings.copilotIncludeQuestions === true;
  // Keep invalid saved paths visible for correction; never broaden them to the default search.
  settings.copilotChatFolder = typeof settings.copilotChatFolder === 'string' ? settings.copilotChatFolder.trim() : '';
}

function listChatFiles(vault, configuredFolder = '') {
  const folder = normalizeChatFolder(configuredFolder);
  return vault.getMarkdownFiles().filter(file => {
    const path = file.path;
    return typeof path === 'string' && !path.split('/').some(part => part.startsWith('.'))
      && (folder ? path.startsWith(`${folder}/`) : /(?:^|\/)copilot-conversations\//i.test(path));
  }).sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0) || a.path.localeCompare(b.path));
}

function removePrivateBlocks(text) {
  // Saved assistant messages can still contain provider reasoning or tool envelopes.
  return text.replace(/<(think|thinking|analysis|tool_call|tool_calls|tool_result|tool_results|system)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim();
}

function parseChatTranscript(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_CHAT_BYTES) throw new Error('CHAT_SIZE');
  let body = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---', 4);
    if (end < 0) throw new Error('CHAT_FORMAT');
    body = body.slice(end + 4).replace(/^\n/, '');
  }
  const messages = [];
  let current = null, fence = null;
  const finish = () => {
    if (!current) return;
    const lines = [...current.lines];
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    const footer = !fence && /^\[Timestamp: ([^\n\]]+)\]$/.exec(lines.at(-1) || '');
    if (footer) lines.pop();
    while (lines.length && (!lines.at(-1).trim() || /^\[Context: .*\]$/.test(lines.at(-1)))) lines.pop();
    messages.push({ role: current.role, text: removePrivateBlocks(lines.join('\n')), saved: Boolean(footer), timestamp: footer?.[1] || '' });
  };
  for (const line of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      if (current) current.lines.push(line);
      continue;
    }
    const header = !fence && /^\*\*(user|ai|assistant|system|tool)\*\*: ?(.*)$/.exec(line);
    let previous = '';
    if (header && current) for (let i = current.lines.length - 1; i >= 0; i--) {
      if (current.lines[i].trim()) { previous = current.lines[i]; break; }
    }
    if (header && (!current || /^\[Timestamp: [^\n\]]+\]$/.test(previous || ''))) {
      finish();
      current = { role: header[1] === 'assistant' ? 'ai' : header[1], lines: [header[2]] };
    } else if (current) current.lines.push(line);
  }
  finish();
  if (!messages.length) throw new Error('CHAT_FORMAT');
  return { messages, awaitingReply: messages.at(-1).role === 'user' || !messages.at(-1).saved };
}

function selectChatText(transcript, scope = 'latest', includeQuestions = false, chinese = false) {
  if (!CHAT_SCOPES.includes(scope)) throw new Error('CHAT_SCOPE');
  const messages = transcript.messages;
  const answers = messages.map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'ai' && message.saved && message.text);
  const chosen = answers.slice(scope === 'two' ? -2 : -1);
  if (!chosen.length) throw new Error('CHAT_NO_REPLY');
  const selected = new Set();
  for (const { index } of chosen) {
    if (includeQuestions || scope === 'turn') {
      for (let i = index - 1; i >= 0; i--) {
        if (messages[i].role === 'ai') break;
        if (messages[i].role === 'user') {
          if (messages[i].saved && messages[i].text) selected.add(i);
          break;
        }
      }
    }
    selected.add(index);
  }
  const withRoles = scope === 'turn' || includeQuestions;
  const text = [...selected].sort((a, b) => a - b).map(index => {
    const message = messages[index];
    const label = message.role === 'user' ? (chinese ? '提问：' : 'Question: ') : (chinese ? '回答：' : 'Answer: ');
    return `${withRoles ? label : ''}${message.text}`;
  }).join('\n\n');
  return { text, replyCount: chosen.length, awaitingReply: transcript.awaitingReply };
}

async function loadChatSnapshot(vault, file) {
  const path = file.path, mtime = file.stat?.mtime, size = file.stat?.size;
  if (!(size >= 0) || size > MAX_CHAT_BYTES) throw new Error('CHAT_SIZE');
  if (vault.getAbstractFileByPath(path) !== file) throw new Error('CHAT_CHANGED');
  const raw = await vault.read(file);
  if (file.path !== path || file.stat?.mtime !== mtime || file.stat?.size !== size || vault.getAbstractFileByPath(path) !== file) throw new Error('CHAT_CHANGED');
  return { file, path, mtime, size, raw, transcript: parseChatTranscript(raw) };
}

async function verifyChatSnapshot(vault, snapshot) {
  const { file, path, mtime, size, raw } = snapshot;
  if (vault.getAbstractFileByPath(path) !== file || file.path !== path || file.stat?.mtime !== mtime || file.stat?.size !== size) throw new Error('CHAT_CHANGED');
  if (await vault.read(file) !== raw || file.path !== path || file.stat?.mtime !== mtime || file.stat?.size !== size
    || vault.getAbstractFileByPath(path) !== file) throw new Error('CHAT_CHANGED');
}

module.exports = { MAX_CHAT_BYTES, COPILOT_DEFAULTS, CHAT_SCOPES, normalizeChatFolder, normalizeCopilotSettings,
  listChatFiles, parseChatTranscript, selectChatText, loadChatSnapshot, verifyChatSnapshot };
