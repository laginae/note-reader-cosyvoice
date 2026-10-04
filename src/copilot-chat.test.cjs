const test = require('node:test');
const assert = require('node:assert/strict');
const { COPILOT_DEFAULTS, normalizeChatFolder, normalizeCopilotSettings, listChatFiles, parseChatTranscript,
  selectChatText, loadChatSnapshot, verifyChatSnapshot } = require('./copilot-chat');

const message = (role, text) => `**${role}**: ${text}\n[Timestamp: 2026/10/05 10:00:00]`;
const transcript = (...messages) => `---\ntags:\n  - copilot-conversation\nbackendId: example\n---\n\n${messages.join('\n\n')}`;

test('Copilot role parsing reads only selected saved replies and removes context, timestamps and private envelopes', () => {
  const parsed = parseChatTranscript(transcript(
    message('user', 'First question.\n[Context: Notes: Context.md | URLs: https://example.test]'),
    message('ai', '<think>Internal reasoning.</think>First answer.'),
    message('user', 'Second question.'), message('ai', '<tool_call>Internal tool payload.</tool_call>Second answer.'),
    message('user', 'Third question.'), message('ai', 'Third answer.')));
  assert.equal(selectChatText(parsed).text, 'Third answer.');
  assert.equal(selectChatText(parsed, 'two').text, 'Second answer.\n\nThird answer.');
  assert.equal(selectChatText(parsed, 'turn').text, 'Question: Third question.\n\nAnswer: Third answer.');
  assert.equal(selectChatText(parsed, 'two', true, true).text, '提问：Second question.\n\n回答：Second answer.\n\n提问：Third question.\n\n回答：Third answer.');
  assert.equal(parsed.awaitingReply, false);
  assert.equal(parseChatTranscript(transcript(message('ai', '中文与 English.')).replace(/\n/g, '\r\n')).messages[0].text, '中文与 English.');
});

test('fenced examples cannot create extra messages; incomplete replies, system and tool messages are not selected', () => {
  const example = 'Example:\n```md\n**ai**: Not a real reply.\n[Timestamp: Example]\n```\nActual answer.';
  const parsed = parseChatTranscript(transcript(message('user', 'Question.'), message('ai', example),
    message('tool', 'Do not read tool results.'), message('system', 'Do not read system instructions.'), '**ai**: Still generating'));
  assert.equal(parsed.messages.length, 5);
  assert.equal(parsed.awaitingReply, true);
  assert.equal(selectChatText(parsed).text, example);
  assert.throws(() => selectChatText(parseChatTranscript(transcript(message('user', 'Unanswered.')))), /CHAT_NO_REPLY/);
  assert.throws(() => selectChatText(parseChatTranscript('**ai**: Incomplete')), /CHAT_NO_REPLY/);
  assert.throws(() => parseChatTranscript('# Ordinary note\nNo transcript here.'), /CHAT_FORMAT/);
  assert.throws(() => parseChatTranscript('---\nUnclosed metadata'), /CHAT_FORMAT/);
});

test('a new pending question does not get paired with an older answer', () => {
  const parsed = parseChatTranscript(transcript(message('user', 'Answered question.'), message('ai', 'Saved answer.'), message('user', 'Pending question.')));
  assert.equal(selectChatText(parsed, 'turn').text, 'Question: Answered question.\n\nAnswer: Saved answer.');
  assert.equal(selectChatText(parsed).awaitingReply, true);
});

test('conversation discovery is metadata-only and stays in explicit folders or standard Copilot directories', () => {
  const files = ['copilot/copilot-conversations/A.md', 'Archive/copilot-conversations/B.md', 'Other/Ordinary.md',
    '.obsidian/copilot-conversations/Hidden.md', 'Custom/Chats/C.md', 'Custom/Chats-extra/D.md']
    .map((path, index) => ({ path, stat: { mtime: index } }));
  const vault = { getMarkdownFiles: () => files, read: () => assert.fail('Listing must not read chat contents') };
  assert.deepEqual(listChatFiles(vault).map(f => f.path), files.slice(0, 2).reverse().map(f => f.path));
  assert.deepEqual(listChatFiles(vault, 'Custom/Chats').map(f => f.path), ['Custom/Chats/C.md']);
  for (const path of ['/', '../Chats', 'C:\\Chats', '//server/Chats', '.obsidian', 'Chats/../Other']) {
    assert.throws(() => normalizeChatFolder(path), /CHAT_FOLDER/);
    assert.throws(() => listChatFiles(vault, path), /CHAT_FOLDER/);
  }
  assert.equal(normalizeChatFolder(' Custom\\Chats/ '), 'Custom/Chats');
  const settings = { ...COPILOT_DEFAULTS, copilotChatScope: 'all', copilotChatFolder: '../invalid', copilotIncludeQuestions: 'true' };
  normalizeCopilotSettings(settings);
  assert.equal(settings.copilotChatScope, 'latest'); assert.equal(settings.copilotChatFolder, '../invalid');
  assert.equal(settings.copilotIncludeQuestions, false);
});

test('snapshot validation detects save races, same-stat rewrites, renamed/deleted notes and oversized files', async () => {
  let raw = transcript(message('ai', 'Saved answer.'));
  const file = { path: 'copilot/copilot-conversations/A.md', stat: { mtime: 1, size: raw.length } };
  let current = file;
  const vault = { getAbstractFileByPath: () => current, read: async () => raw };
  const snapshot = await loadChatSnapshot(vault, file); await verifyChatSnapshot(vault, snapshot);
  raw = raw.replace('Saved', 'Other'); await assert.rejects(verifyChatSnapshot(vault, snapshot), /CHAT_CHANGED/);
  raw = snapshot.raw; file.stat.mtime++; await assert.rejects(verifyChatSnapshot(vault, snapshot), /CHAT_CHANGED/);
  file.stat.mtime--; current = null; await assert.rejects(verifyChatSnapshot(vault, snapshot), /CHAT_CHANGED/);
  current = file; vault.read = async () => { file.stat.mtime++; return raw; };
  await assert.rejects(loadChatSnapshot(vault, file), /CHAT_CHANGED/);
  file.stat.size = 3 * 1024 * 1024; await assert.rejects(loadChatSnapshot(vault, file), /CHAT_SIZE/);
});

module.exports = { message, transcript };
