const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { COPILOT_DEFAULTS } = require('./copilot-chat');
const source = fs.readFileSync(`${__dirname}/copilot-chat-ui.js`, 'utf8');
const note = (question, answer) => `**user**: ${question}\n[Timestamp: time]\n\n**ai**: ${answer}\n[Timestamp: time]`;

function fixture() {
  const dom = new JSDOM('<div class="modal"><div class="modal-content"></div></div>');
  const doc = dom.window.document, calls = [], reads = [], notices = [], listeners = new Map();
  const files = ['A', 'B'].map((name, i) => ({ path: `copilot/copilot-conversations/${name}.md`, basename: name,
    stat: { mtime: i + 1, size: 200 } }));
  const texts = new Map([[files[0], note('Question A.', 'Answer A.')], [files[1], note('Question B.', 'Answer B.')]]);
  const vault = { getMarkdownFiles: () => files, getAbstractFileByPath: path => files.find(file => file.path === path),
    read: async file => { reads.push(file); return texts.get(file); },
    on(event, handler) { const ref = { event, handler }; listeners.set(ref, handler); return ref; }, offref(ref) { listeners.delete(ref); } };
  const plugin = { settings: { ...COPILOT_DEFAULTS, settingsLanguage: 'chinese', speechEngine: 'mimo-tts', stripMarkdown: true },
    app: { vault, workspace: { getLeaf: () => ({ openFile: async file => calls.push(['open', file]) }) } },
    sanitizeAudioExportText: text => text, runUserAction: async (_label, action) => action(),
    startReading: async (...args) => calls.push(args), webActionSequence: 0 };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name === 'obsidian' ? {
    Modal: class { constructor(app) {
      this.app = app; this.modalEl = doc.querySelector('.modal'); this.contentEl = doc.querySelector('.modal-content');
      this.scope = { unregister() {} }; this.hostScope = this.scope;
    }
      close() {
        assert.equal(this.scope, this.hostScope, 'Modal.scope belongs to the host keymap, not a form control');
        this.scope.unregister(); this.onClose();
      } }, Notice: class { constructor(text) { notices.push(text); } }, Setting: class {}, setIcon(node, icon) { node.dataset.icon = icon; },
  } : require(name), loaded, loaded.exports);
  const modal = new loaded.exports.CopilotChatModal(plugin); plugin.copilotChatModal = modal;
  return { dom, doc, plugin, modal, files, texts, vault, calls, reads, listeners, notices,
    quickRead: options => loaded.exports.readLatestCopilotReply(plugin, options) };
}

test('chat picker requires an explicit conversation when current chat is unknown and does not synthesize during preview', async () => {
  const f = fixture(); await f.modal.onOpen();
  assert.equal(f.modal.files.value, ''); assert.equal(f.reads.length, 0); assert.equal(f.modal.play.disabled, true);
  f.modal.files.value = f.files[0].path; await f.modal.loadSelected();
  assert.equal(f.modal.preview.value, 'Answer A.'); assert.equal(f.calls.length, 0);
  assert.match(f.modal.destination.textContent, /MiMo TTS.*在线/);
  f.modal.readingScopeSelect.value = 'turn'; f.modal.drawPreview();
  assert.equal(f.modal.preview.value, '提问：Question A.\n\n回答：Answer A.');
  assert.equal(f.modal.questions.disabled, true);
  await f.modal.read();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], '提问：Question A.\n\n回答：Answer A.');
  assert.deepEqual(f.calls[0][2], { sourceKind: 'copilot', skipReadingPosition: true });
  assert.equal(f.listeners.size, 0); assert.equal(f.plugin.copilotChatModal, null); f.dom.window.close();
});

test('an explicitly open saved chat is preferred even when a different chat was modified more recently', async () => {
  const f = fixture(); f.modal.preferredFile = f.files[0]; await f.modal.onOpen();
  assert.equal(f.modal.files.value, f.files[0].path); assert.equal(f.modal.preview.value, 'Answer A.');
  assert.equal(f.calls.length, 0);
  f.modal.search.value = 'B.md'; f.modal.drawFiles(f.modal.files.value);
  assert.equal(f.modal.files.value, ''); assert.equal(f.modal.preview.value, ''); assert.equal(f.modal.play.disabled, true);
  f.modal.close(); f.dom.window.close();
});

test('changed notes and engine changes require a new preview before any speech request', async () => {
  const f = fixture(); f.modal.preferredFile = f.files[0]; await f.modal.onOpen();
  f.texts.set(f.files[0], note('Question A.', 'New answer A.')); await f.modal.read();
  assert.equal(f.calls.length, 0); assert.match(f.modal.status.textContent, /已变化/); assert.equal(f.modal.play.disabled, true);
  await f.modal.reload(); assert.equal(f.modal.preview.value, 'New answer A.');
  f.plugin.settings.speechEngine = 'system-tts'; await f.modal.read();
  assert.equal(f.calls.length, 0); assert.match(f.modal.destination.textContent, /本机/);
  await f.modal.read(); assert.equal(f.calls.length, 1); f.dom.window.close();
});

test('late loads cannot replace the chosen conversation or restore a closed modal', async () => {
  const f = fixture(); await f.modal.onOpen(); let resolve;
  const read = f.vault.read; f.vault.read = file => file === f.files[0] ? new Promise(done => { resolve = done; }) : read(file);
  f.modal.files.value = f.files[0].path; const pending = f.modal.loadSelected();
  f.modal.files.value = f.files[1].path; await f.modal.loadSelected();
  resolve(f.texts.get(f.files[0])); await pending;
  assert.equal(f.modal.preview.value, 'Answer B.');
  f.modal.files.value = f.files[0].path; const closing = f.modal.loadSelected(); f.modal.close();
  resolve(f.texts.get(f.files[0])); await closing; assert.equal(f.modal.snapshot, null);
  assert.equal(f.calls.length, 0); f.dom.window.close();
});

test('double clicks, Stop and changing the selected scope during validation never start stale or duplicate playback', async () => {
  for (const change of ['double', 'stop', 'scope', 'close']) {
    const f = fixture(); f.modal.preferredFile = f.files[0]; await f.modal.onOpen(); let resolve;
    f.vault.read = () => new Promise(done => { resolve = done; });
    const pending = f.modal.read();
    if (change === 'double') await f.modal.read();
    if (change === 'stop') f.plugin.webActionSequence++;
    if (change === 'scope') { f.modal.readingScopeSelect.value = 'turn'; f.modal.drawPreview(); }
    if (change === 'close') f.modal.close();
    resolve(f.texts.get(f.files[0])); await pending;
    assert.equal(f.calls.length, change === 'double' ? 1 : 0);
    if (!f.modal.closed) f.modal.close(); f.dom.window.close();
  }
});

test('saved chat changes invalidate the preview and raw HTML never executes or loads remote resources', async () => {
  const f = fixture(); f.texts.set(f.files[0], note('Question.', '<img src="https://example.invalid/test"><script>throw 1</script>Answer.'));
  f.modal.preferredFile = f.files[0]; await f.modal.onOpen();
  assert.equal(f.doc.querySelectorAll('img,script').length, 0);
  for (const [ref, handler] of f.listeners) if (ref.event === 'modify') handler(f.files[0]);
  assert.equal(f.modal.play.disabled, true); assert.equal(f.modal.preview.value, '');
  f.modal.close(); assert.equal(f.listeners.size, 0); f.dom.window.close();
});

test('closing the chat picker preserves the host keymap scope before and after preview errors', async () => {
  for (const invalid of [false, true]) {
    const f = fixture(); const scope = f.modal.scope;
    f.modal.preferredFile = f.files[0];
    if (invalid) f.texts.set(f.files[0], 'Not a chat transcript');
    await f.modal.onOpen();
    assert.equal(f.modal.scope, scope);
    assert.notEqual(f.modal.readingScopeSelect, scope);
    f.modal.close();
    assert.equal(f.modal.closed, true);
    assert.equal(f.plugin.copilotChatModal, null);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.calls.length, 0);
    f.dom.window.close();
  }
});

test('quick reading uses only the latest saved answer in the newest chat, ignoring scope defaults', async () => {
  const f = fixture(); f.plugin.settings.copilotChatScope = 'turn'; f.plugin.settings.copilotIncludeQuestions = true;
  await f.quickRead();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'Answer B.');
  assert.match(f.calls[0][1], /Copilot · B/); assert.equal(f.plugin.latestCopilotReadPending, false);
  f.dom.window.close();
});

test('quick reading does not fall back to an older chat without a saved answer', async () => {
  const f = fixture(); f.texts.set(f.files[1], '**user**: Pending\n[Timestamp: time]');
  await f.quickRead(); assert.equal(f.calls.length, 0); assert.match(f.notices[0], /尚无已保存/);
  f.vault.getMarkdownFiles = () => []; await f.quickRead(); assert.match(f.notices[1], /未找到/);
  f.dom.window.close();
});

test('quick reading guards repeated clicks, Stop, modal closing, changed files, settings and exports', async () => {
  for (const change of ['double', 'stop', 'close', 'rewrite', 'engine', 'folder', 'export', 'disabled']) {
    const f = fixture(); let resolve; let closed = false;
    const read = f.vault.read;
    f.vault.read = file => { f.vault.read = read; return new Promise(done => { resolve = done; }); };
    const pending = f.quickRead({ isCancelled: () => closed });
    if (change === 'double') await f.quickRead();
    if (change === 'stop') f.plugin.webActionSequence++;
    if (change === 'close') closed = true;
    if (change === 'rewrite') f.texts.set(f.files[1], note('New question', 'New answer'));
    if (change === 'engine') f.plugin.settings.speechEngine = 'system-tts';
    if (change === 'folder') f.plugin.settings.copilotChatFolder = 'other';
    if (change === 'export') f.plugin.activeSession = { kind: 'audio-export' };
    if (change === 'disabled') f.plugin.settings.copilotChatEnabled = false;
    resolve(note('Question B.', 'Answer B.')); await pending;
    assert.equal(f.calls.length, change === 'double' ? 1 : 0, change);
    assert.equal(f.plugin.latestCopilotReadPending, false);
    f.dom.window.close();
  }
});

test('quick reply button works without choosing a conversation and closes the host modal', async () => {
  const f = fixture(); await f.modal.onOpen();
  assert.equal(f.modal.files.value, ''); f.modal.latestReplyButton.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'Answer B.');
  assert.equal(f.modal.closed, true); assert.equal(f.listeners.size, 0);
  f.dom.window.close();
});
