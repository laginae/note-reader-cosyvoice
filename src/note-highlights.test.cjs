const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { buildMarkdownSource } = require('./markdown-source');

function fixture(options = {}) {
  const dom = new JSDOM(`<div class="markdown-preview-view">${options.html || '<p>Second paragraph.</p>'}</div>`);
  const element = dom.window.document.querySelector('.markdown-preview-view').firstElementChild, infoField = {}, clean = options.clean || (text => text.trim());
  const text = options.text || 'First paragraph.\n\nSecond paragraph.';
  const chunks = options.chunks || ['First paragraph.', 'Second paragraph.'];
  const source = buildMarkdownSource(text, chunks, clean, { filePath: 'public.md' });
  const notices = [], scrolls = [];
  const plugin = { settings: { readingHighlight: 'sentence', readingFollow: false },
    activeSession: { markdownSource: source, chunks },
    getCurrentReadingHighlight: () => ({ index: 1, sentence: null }),
    registerEditorExtension(extension) { this.extension = extension; },
    registerMarkdownPostProcessor(processor) { this.processor = processor; },
    app: { workspace: { getLeavesOfType: () => [] } },
  };
  const loaded = { exports: {} };
  const obsidian = { editorInfoField: infoField, Notice: class { constructor(message) { notices.push(message); } }, MarkdownRenderChild: class {
    constructor(node) { this.containerEl = node; } registerDomEvent(node, event, handler) { node.addEventListener(event, handler); }
  } };
  const state = { EditorSelection: { range: (from, to) => ({ from, to }) }, StateEffect: { define() {
    const type = { of: value => ({ value, is: other => other === type }) }; return type;
  } } };
  const view = { ViewPlugin: { fromClass: (Class, spec) => ({ Class, spec }) },
    Decoration: { none: [], set: ranges => ranges, mark: options => ({ range: (from, to) => ({ from, to, class: options.class }) }),
      line: options => ({ range: from => ({ from, class: options.class }) }) },
    EditorView: { scrollIntoView(position) { scrolls.push(position); return { is: () => false }; } },
  };
  new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/note-highlights.js`, 'utf8'))(
    name => name === 'obsidian' ? obsidian : name === '@codemirror/state' ? state : name === '@codemirror/view' ? view : require(name), loaded, loaded.exports);
  const controller = loaded.exports.installNoteHighlights(plugin);
  let child, sectionText = text;
  const context = { sourcePath: 'public.md', getSectionInfo: () => ({ text: sectionText, lineStart: options.lineStart ?? 2, lineEnd: options.lineEnd ?? 2 }),
    addChild(value) { child = value; child.onload(); } };
  plugin.processor(element, context);
  const selection = { anchor: 3, head: 8 }, stateObject = { selection, doc: documentText(text),
    field: () => ({ file: { path: 'public.md' } }) };
  let editor;
  const editorView = { state: stateObject, dispatch(transaction) {
    assert.equal(transaction.selection, undefined); assert.equal(transaction.changes, undefined);
    editor?.update({ docChanged: false, transactions: [{ effects: transaction.effects }] });
  } };
  editor = new plugin.extension.Class(editorView);
  return { plugin, controller, element, child, editor, editorView, selection, notices, scrolls, source, context, dom,
    setSectionText: value => { sectionText = value; } };
}

function documentText(text) {
  return { length: text.length, toString: () => text, lineAt(position) {
    const from = text.lastIndexOf('\n', position - 1) + 1;
    const end = text.indexOf('\n', position);
    return { from, to: end < 0 ? text.length : end };
  } };
}

test('original editor and reading pane mark the correct block without changing selection or content', () => {
  const { element, editor, editorView, selection, controller } = fixture();
  controller.update();
  assert.equal(element.classList.contains('note-reader-note-segment'), true);
  assert.equal(editor.decorations.length, 2);
  assert.equal(editor.decorations[1].class, 'note-reader-note-line');
  assert.equal(editor.decorations[0].from, 'First paragraph.\n\n'.length);
  assert.equal(editorView.state.selection, selection);
  assert.equal(element.textContent, 'Second paragraph.');
});

test('editing, switching files, stopping and disabling highlights clear source marks', () => {
  const { plugin, controller, element, editor, editorView, setSectionText } = fixture();
  editorView.state.doc = { toString: () => 'Edited text.' }; setSectionText('Edited text.');
  editor.update({ docChanged: true, transactions: [] }); controller.update();
  assert.equal(editor.decorations.length, 0); assert.equal(element.classList.contains('note-reader-note-segment'), false);
  editorView.state.doc = documentText(plugin.activeSession.markdownSource.text);
  editorView.state.field = () => ({ file: { path: 'another.md' } }); controller.update();
  assert.equal(editor.decorations.length, 0);
  plugin.activeSession = null; controller.update();
  assert.equal(editor.decorations.length, 0);
});

test('sentence marks require verified cues and an exact unambiguous source match', () => {
  const { plugin, controller, editor, element } = fixture();
  plugin.getCurrentReadingHighlight = () => ({ index: 1, sentence: { start: 0, end: 17 } }); controller.update();
  assert.equal(editor.decorations[0].class, 'note-reader-note-sentence');
  assert.equal(element.classList.contains('note-reader-note-segment'), true);
  plugin.settings.readingHighlight = 'off'; controller.update();
  assert.equal(editor.decorations.length, 0); assert.equal(element.classList.contains('note-reader-note-segment'), false);
});

test('closing a render child or unloading removes all temporary marks', () => {
  const { controller, child, element, editor } = fixture(); controller.update();
  child.onunload(); assert.equal(element.classList.contains('note-reader-note-segment'), false);
  controller.dispose(); assert.equal(editor.decorations.length, 0);
  controller.update(); assert.equal(element.classList.contains('note-reader-note-segment'), false);
});

test('Markdown marks survive repeated playback updates and backward/forward segment changes', () => {
  const { plugin, controller, element, editor, editorView, selection } = fixture();
  let index = 1; plugin.getCurrentReadingHighlight = () => ({ index, sentence: null });
  for (const next of [1, 1, 0, 0, 1, 0, 1, 1]) {
    index = next; controller.update();
    assert.equal(element.classList.contains('note-reader-note-segment'), index === 1);
    assert.equal(editor.decorations[0].from, index === 1 ? 'First paragraph.\n\n'.length : 0);
    assert.equal(editorView.state.selection, selection);
  }
  element.classList.remove('note-reader-note-segment'); controller.update();
  assert.ok(element.classList.contains('note-reader-note-segment'));
  controller.dispose();
});

test('audio parts advance within one logical segment without whole-line tinting for a partial sentence', () => {
  const text = 'First public sentence. Second public sentence.';
  const f = fixture({ text, chunks: [text], html: `<p>${text}</p>`, lineStart: 0, lineEnd: 0 });
  f.plugin.activeSession.audioParts = { 0: ['First public sentence.', 'Second public sentence.'] };
  f.plugin.getCurrentReadingHighlight = () => ({ index: 0 });
  f.controller.update();
  assert.equal(f.editor.decorations.length, 1);
  assert.equal(f.editor.decorations[0].to, 'First public sentence.'.length);
  f.plugin.activeSession.currentPartIndex = 1; f.controller.update();
  assert.equal(f.editor.decorations[0].from, text.indexOf('Second'));
  assert.equal(f.editor.decorations[0].to, text.length);
  assert.equal(f.editorView.state.selection, f.selection);
  f.controller.dispose(); f.dom.window.close();
});

test('reading mode marks individual repeated list items, preserves checkbox state and clears old marks', () => {
  const text = '- [x] Public task.\n- Repeated item.\n- Repeated item.';
  const clean = t => t.replace(/^[-*+] (?:\[[ x]\] )?/gm, '').trim();
  const spoken = clean(text), chunks = ['Public task.', 'Repeated item.', 'Repeated item.'];
  const f = fixture({ text, chunks: [spoken], clean, lineStart: 0, lineEnd: 2,
    html: '<ul><li><input type="checkbox" checked>Public task.</li><li>Repeated item.</li><li>Repeated item.</li></ul>' });
  const before = f.element.textContent;
  f.plugin.activeSession.audioParts = { 0: chunks };
  f.plugin.getCurrentReadingHighlight = () => ({ index: 0 });
  for (let i = 0; i < 3; i++) {
    f.plugin.activeSession.currentPartIndex = i; f.controller.update();
    assert.equal(f.element.classList.contains('note-reader-note-segment'), false);
    const items = [...f.element.querySelectorAll('li')];
    assert.deepEqual(items.map(n => n.classList.contains('note-reader-note-segment')), items.map((_, j) => i === j));
  }
  assert.equal(f.element.textContent, before);
  assert.equal(f.element.querySelector('input').checked, true);
  f.element.querySelectorAll('li')[2].textContent = 'Changed rendered item.';
  f.controller.update();
  assert.equal(f.element.querySelectorAll('.note-reader-note-segment').length, 0);
  f.controller.dispose(); assert.equal(f.element.querySelectorAll('.note-reader-note-segment').length, 0);
  f.dom.window.close();
});

test('source edits notify once per session and repeated updates reuse editor document text', () => {
  const f = fixture();
  let reads = 0;
  const text = f.source.text;
  f.editorView.state.doc = { ...documentText(text), toString: () => { reads++; return text; } };
  for (let i = 0; i < 20; i++) f.controller.update();
  assert.equal(reads, 1); assert.equal(f.notices.length, 0);
  f.editorView.state.doc = documentText('Edited public note.'); f.setSectionText('Edited public note.');
  f.editor.update({ docChanged: true, transactions: [] });
  for (let i = 0; i < 20; i++) f.controller.update();
  assert.equal(f.notices.length, 1);
  assert.equal(f.editor.decorations.length, 0);
  f.controller.dispose(); f.dom.window.close();
});

test('editor following does not scroll a visible target or override manual scrolling', () => {
  const f = fixture();
  f.plugin.settings.readingFollow = true;
  f.editorView.scrollDOM = { getBoundingClientRect: () => ({ top: 0, bottom: 100 }) };
  f.editorView.coordsAtPos = () => ({ top: 20, bottom: 40 });
  f.controller.update(); assert.deepEqual(f.scrolls, []);
  f.plugin.getCurrentReadingHighlight = () => ({ index: 0 });
  f.editorView.coordsAtPos = () => ({ top: 200, bottom: 220 });
  f.controller.update(); assert.equal(f.scrolls.length, 1); assert.equal(f.scrolls[0].from, 0);
  f.editor.manualScroll = true; f.plugin.getCurrentReadingHighlight = () => ({ index: 1 });
  f.controller.update(); assert.equal(f.scrolls.length, 1);
  f.controller.dispose(); f.dom.window.close();
});

test('editor follows the end as well as the start, and aligns overlong ranges at their beginning', () => {
  const f = fixture(); f.plugin.settings.readingFollow = true;
  f.editorView.scrollDOM = { getBoundingClientRect: () => ({ top: 0, bottom: 200 }) };
  f.editorView.coordsAtPos = pos => pos < 25 ? { top: 140, bottom: 160 } : { top: 220, bottom: 240 };
  f.controller.update(); assert.equal(f.scrolls.length, 1);
  assert.deepEqual(f.scrolls[0], { from: 18, to: 35 });
  f.controller.update(); assert.equal(f.scrolls.length, 1);
  f.controller.resetFollowing();
  f.editorView.coordsAtPos = pos => pos < 25 ? { top: 140, bottom: 160 } : { top: 500, bottom: 520 };
  f.controller.update(); assert.equal(f.scrolls[1], 18);
  f.controller.resetFollowing();
  f.editorView.coordsAtPos = pos => pos < 25 ? { top: 140, bottom: 160 } : null;
  f.controller.update(); assert.equal(f.scrolls[2], 18);
  f.controller.dispose(); f.dom.window.close();
});
