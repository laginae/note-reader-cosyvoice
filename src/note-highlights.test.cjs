const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { buildMarkdownSource } = require('./markdown-source');

function fixture() {
  const dom = new JSDOM('<div class="markdown-preview-view"><p>Second paragraph.</p></div>');
  const element = dom.window.document.querySelector('p'), infoField = {}, clean = text => text.trim();
  const text = 'First paragraph.\n\nSecond paragraph.';
  const source = buildMarkdownSource(text, ['First paragraph.', 'Second paragraph.'], clean, { filePath: 'public.md' });
  const plugin = { settings: { readingHighlight: 'sentence', readingFollow: false },
    activeSession: { markdownSource: source, chunks: ['First paragraph.', 'Second paragraph.'] },
    getCurrentReadingHighlight: () => ({ index: 1, sentence: null }),
    registerEditorExtension(extension) { this.extension = extension; },
    registerMarkdownPostProcessor(processor) { this.processor = processor; },
    app: { workspace: { getLeavesOfType: () => [] } },
  };
  const loaded = { exports: {} };
  const obsidian = { editorInfoField: infoField, MarkdownRenderChild: class {
    constructor(node) { this.containerEl = node; } registerDomEvent(node, event, handler) { node.addEventListener(event, handler); }
  } };
  const state = { StateEffect: { define() {
    const type = { of: value => ({ value, is: other => other === type }) }; return type;
  } } };
  const view = { ViewPlugin: { fromClass: (Class, spec) => ({ Class, spec }) },
    Decoration: { none: [], set: ranges => ranges, mark: options => ({ range: (from, to) => ({ from, to, class: options.class }) }),
      line: options => ({ range: from => ({ from, class: options.class }) }) },
    EditorView: { scrollIntoView() { assert.fail('Following is off by default'); } },
  };
  new Function('require', 'module', 'exports', fs.readFileSync(`${__dirname}/note-highlights.js`, 'utf8'))(
    name => name === 'obsidian' ? obsidian : name === '@codemirror/state' ? state : name === '@codemirror/view' ? view : require(name), loaded, loaded.exports);
  const controller = loaded.exports.installNoteHighlights(plugin);
  let child, sectionText = text;
  const context = { sourcePath: 'public.md', getSectionInfo: () => ({ text: sectionText, lineStart: 2, lineEnd: 2 }),
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
  return { plugin, controller, element, child, editor, editorView, selection, setSectionText: value => { sectionText = value; } };
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
