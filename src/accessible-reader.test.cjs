const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

let narratorStarts = 0, openedModal, markdownHandler;
const moduleObject = { exports: {} };
const obsidian = {
  ItemView: class { constructor(leaf) { this.contentEl = leaf.root; this.icon = 'document'; } },
  Modal: class { constructor() {} open() { openedModal = this; } },
  Setting: class {}, Notice: class {}, setIcon: (node, name) => { node.dataset.icon = name; },
  Component: class { load() {} unload() { this.unloaded = true; } },
  MarkdownRenderer: { render: async (...args) => markdownHandler(...args) },
};
new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, 'accessible-reader.js'), 'utf8'))(
  name => name === 'obsidian' ? obsidian : name === 'os' ? { platform: () => 'win32' }
    : name === './system-tts' ? { startSystemNarrator: async () => { narratorStarts++; } } : require(name),
  moduleObject, moduleObject.exports);
const { AccessibleReaderView } = moduleObject.exports;

function fixture(chunks = ['First sentence. Second sentence.']) {
  const dom = new JSDOM('<main></main>');
  const plugin = {
    settings: { settingsLanguage: 'english', readingHighlight: 'sentence', readingFollow: false },
    documentModel: { label: 'Public sample', chunks, speechSessionId: 1 },
    activeSession: { id: 1 }, highlight: { index: 0, sentence: null },
    getCurrentReadingHighlight() { return this.highlight; },
    registerDocumentView(view) { view.render(); }, unregisterDocumentView() {},
    saveSettings: async () => {}, runUserAction: async (_label, action) => action(),
    activateControlView: async () => {}, activateDocumentView: async () => {}, toggleDocumentView: async () => {}, readDocumentFrom: async () => {}, app: {},
  };
  const view = new AccessibleReaderView({ root: dom.window.document.querySelector('main') }, plugin);
  view.build(); view.render();
  return { dom, plugin, view };
}

test('full text is real accessible DOM, including offscreen paragraphs; raw HTML never executes', () => {
  const text = '<script>window.stolen=true</script><img src="https://example.invalid/private"> Plain text.';
  const { dom, view } = fixture([text, ...Array.from({ length: 29 }, (_, i) => `Public paragraph ${i + 2}.`)]);
  assert.equal(view.body.getAttribute('role'), 'document');
  assert.equal(view.body.querySelectorAll('p').length, 30);
  assert.equal(view.nodes[0].paragraph.textContent, text);
  assert.equal(view.body.querySelector('script,img,iframe'), null);
  assert.match(view.body.textContent, /Public paragraph 30/);
  assert.equal(dom.window.stolen, undefined);
});

test('progress, pause and sentence highlighting preserve paragraph identity, selection and focus', () => {
  const { dom, view, plugin } = fixture();
  const paragraph = view.nodes[0].paragraph;
  paragraph.focus();
  const selection = dom.window.getSelection(), range = dom.window.document.createRange();
  range.selectNodeContents(view.nodes[0].spans[0].span); selection.addRange(range);
  const selected = selection.toString();
  plugin.highlight.sentence = { start: 16, end: 32 };
  view.render(); view.render();
  assert.equal(view.nodes[0].paragraph, paragraph);
  assert.equal(dom.window.document.activeElement, paragraph);
  assert.equal(selection.toString(), selected);
  assert.match(view.body.querySelector('.is-current-sentence').textContent, /Second sentence/);
  assert.equal(view.body.querySelector('.is-current-segment'), null);
  plugin.highlight.sentence = null; view.render();
  assert.equal(view.body.querySelector('.is-current-sentence'), null);
  assert.equal(view.body.querySelector('.is-current-segment'), paragraph);
  plugin.settings.readingHighlight = 'off'; view.render();
  assert.equal(view.body.querySelector('.is-current-segment,.is-current-sentence'), null);
});

test('progressive PDF appends without replacing prior paragraphs; language changes do not rebuild text', () => {
  const { view, plugin } = fixture(['Paragraph one.']);
  const first = view.nodes[0].paragraph;
  plugin.documentModel.chunks.push('Paragraph two.'); view.render();
  assert.equal(view.nodes[0].paragraph, first); assert.equal(view.nodes.length, 2);
  plugin.settings.settingsLanguage = 'chinese'; view.render();
  assert.equal(view.readButton.getAttribute('aria-label'), '从选中位置朗读');
  assert.equal(view.readButton.hasAttribute('title'), false);
  assert.equal(view.highlightSelect.options[2].textContent, '句子（如支持）');
  assert.equal(view.nodes[0].paragraph, first);
});

test('follow is off by default, does not steal focus, and suspends on manual scrolling', () => {
  const { dom, view, plugin } = fixture(['Paragraph one.', 'Paragraph two.']);
  let scrolls = 0;
  const first = view.nodes[0].paragraph, second = view.nodes[1].paragraph;
  second.scrollIntoView = () => { scrolls++; };
  second.getBoundingClientRect = () => ({ top: 900, bottom: 920 });
  view.scroller.getBoundingClientRect = () => ({ top: 0, bottom: 400 });
  first.focus(); plugin.highlight = { index: 1, sentence: null }; view.render();
  assert.equal(scrolls, 0);
  plugin.settings.readingFollow = true; view.lastHighlight = ''; view.render();
  assert.equal(scrolls, 1); assert.equal(dom.window.document.activeElement, first);
  view.scroller.dispatchEvent(new dom.window.Event('wheel')); view.lastHighlight = ''; view.render();
  assert.equal(scrolls, 1); assert.equal(view.followInput.checked, false);
});

test('Narrator requires explicit confirmation, complete text and stopped plugin playback', async () => {
  const { view, plugin } = fixture(); narratorStarts = 0; openedModal = null;
  await view.startNarrator(); assert.equal(openedModal, null);
  plugin.activeSession = null;
  plugin.documentModel.partial = true; view.render();
  await view.startNarrator(); assert.equal(openedModal, null);
  plugin.documentModel.partial = false; view.render();
  await view.startNarrator(); assert.ok(openedModal); assert.equal(narratorStarts, 0);
  await openedModal.start(); assert.equal(narratorStarts, 1);
  assert.equal(view.body.ownerDocument.activeElement, view.nodes[0].paragraph);
});

test('large document rendering yields in batches and stops when the view closes', async () => {
  const { view, plugin } = fixture(Array.from({ length: 450 }, (_, i) => `Public sentence ${i}.`));
  assert.equal(view.nodes.length, 200); assert.equal(view.narratorButton.disabled, true);
  const deadline = Date.now() + 2000;
  while (view.nodes.length < 450 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(view.nodes.length, 450);
  plugin.activeSession = null; view.render(); assert.equal(view.narratorButton.disabled, false);
  await view.onClose(); assert.equal(view.nodes.length, 0); assert.equal(view.contentEl.textContent, '');
});

test('native Markdown preserves headings, lists and tables; audio updates keep selectable DOM', async () => {
  const { view, plugin, dom } = fixture(['Title First sentence. Second sentence. One Two']);
  const source = { displayText: '# Title\n\nFirst sentence. **Second sentence.**\n\n- One\n- Two',
    speech: 'TitleFirstsentence.Secondsentence.OneTwo', filePath: 'public.md', mappingValid: true,
    ranges: [{ start: 0, end: 44 }] };
  markdownHandler = async (_app, markdown, target, filePath) => {
    assert.equal(markdown, source.displayText); assert.equal(filePath, 'public.md');
    target.innerHTML = '<h1>Title</h1><p>First sentence. <strong>Second sentence.</strong></p><ul><li>One</li><li>Two</li></ul><table><tr><td>1</td><td>2</td></tr></table>';
  };
  plugin.documentModel.markdownSource = source;
  // New model starts one native render; modifying the same model must also be loadable.
  plugin.documentModel = { ...plugin.documentModel }; view.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(view.body.querySelector('h1,strong,ul,table'));
  const paragraph = view.body.querySelector('p'), selection = dom.window.getSelection(), range = dom.window.document.createRange();
  paragraph.focus(); range.selectNodeContents(paragraph); selection.addRange(range); const selected = selection.toString();
  plugin.documentModel = { ...plugin.documentModel, speechSessionId: 2 }; plugin.activeSession.id = 2;
  view.render(); view.render();
  assert.equal(view.body.querySelector('p'), paragraph); assert.equal(selection.toString(), selected);
  assert.equal(dom.window.document.activeElement, paragraph);
  assert.equal(view.getDisplayText(), 'Focus reading');
});

test('a delayed old Markdown render writes only into its detached container', async () => {
  const { view, plugin } = fixture(['First.']); let finish;
  markdownHandler = async (_app, _markdown, target) => {
    await new Promise(resolve => { finish = resolve; }); target.innerHTML = '<p>Old text.</p>';
  };
  plugin.documentModel = { chunks: ['Old text.'], markdownSource: { displayText: 'Old text.', speech: 'Oldtext.', ranges: [], filePath: '', mappingValid: false } };
  view.render();
  plugin.documentModel = { chunks: ['New text.'] }; view.render();
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.body.textContent, 'New text.');
});

test('reading view has a localized exit action', async () => {
  const { view, plugin } = fixture(); let toggles = 0;
  plugin.toggleDocumentView = async () => { toggles++; };
  view.exitButton.click(); assert.equal(toggles, 1);
  plugin.settings.settingsLanguage = 'chinese'; view.render();
  assert.equal(view.exitButton.getAttribute('aria-label'), '退出专注朗读');
});

test('focused reader selection survives toolbar focus and is invalidated when its document changes', () => {
  const { dom, view, plugin } = fixture(['Repeat. Earlier.', 'Repeat. Later.']);
  const doc = dom.window.document, text = view.nodes[1].spans[0].span.firstChild;
  const range = doc.createRange(); range.setStart(text, 0); range.setEnd(text, 7);
  doc.getSelection().addRange(range); view.captureSelection();
  doc.getSelection().removeAllRanges(); view.readButton.focus();
  assert.equal(view.getSelectionContext().selectedText, 'Repeat.');
  assert.match(view.getSelectionContext().text.slice(view.getSelectionContext().startOffset), /^Repeat\. Later\./);
  plugin.documentModel = { chunks: ['Different document.'] }; view.render();
  assert.equal(view.getSelectionContext(), null);
});
