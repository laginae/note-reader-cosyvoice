const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const loaded = { exports: {} };
new Function('require', 'module', fs.readFileSync(`${__dirname}/sidebar-outline.js`, 'utf8'))(
  name => name === 'obsidian' ? { setIcon() {}, Notice: class {} } : require(name), loaded);
const { SidebarOutline } = loaded.exports;
test('PDF playback refresh never calls the notifying Markdown getter', () => {
  const doc = new JSDOM('').window.document;
  const plugin = { settings: {}, getCurrentReadableFile: () => ({ extension: 'pdf', path: 'paper.pdf' }),
    getActiveMarkdownView: () => assert.fail('Must not request a Markdown note during PDF rendering') };
  const outline = new SidebarOutline(plugin, doc);
  for (let i = 0; i < 20; i++) outline.refresh();
  assert.equal(outline.entries.length, 0);
  assert.equal(outline.buttons[0].disabled, true);
});
test('sidebar outline preserves selection and expands sections only after explicit action', async () => {
  const doc = new JSDOM('<main/>').window.document;
  let text = '# One\nBody.\n# Two\nFinal.';
  const file = { path: 'public.md', extension: 'md' }, view = { file, editor: { getValue: () => text } }, calls = [];
  const plugin = { settings: {}, getActiveMarkdownView: () => view, getCurrentReadableFile: () => file,
    app: { metadataCache: { getFileCache: () => ({ headings: [
      { heading: 'One', level: 1, position: { start: { offset: 0, line: 0 }, end: { offset: 5 } } },
      { heading: 'Two', level: 1, position: { start: { offset: 12, line: 2 }, end: { offset: 17 } } },
    ] }) } }, startReading: (...args) => calls.push(args) };
  const outline = new SidebarOutline(plugin, doc); outline.refresh();
  outline.select.value = '0'; outline.refresh(); assert.equal(outline.select.value, '0'); assert.equal(calls.length, 0);
  await outline.read(false); assert.equal(calls[0][0], '# One\nBody.\n');
  await outline.read(true); assert.equal(calls[1][0], text);
  text += ' Changed.'; await outline.read(false); assert.equal(calls.length, 2);
  outline.destroy(); assert.equal(outline.text, '');
});
