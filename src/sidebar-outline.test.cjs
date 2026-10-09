const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const loaded = { exports: {} };
new Function('require', 'module', fs.readFileSync(`${__dirname}/sidebar-outline.js`, 'utf8'))(
  name => name === 'obsidian' ? { setIcon() {}, Notice: class {} } : require(name), loaded);
const { SidebarOutline } = loaded.exports;
function fixture() {
  const doc = new JSDOM('<main/>').window.document, calls = [];
  const text = '# Parent\nIntro\n## Child\nBody\n### Deep\nDetails\n# Next\nEnd';
  const headings = [...text.matchAll(/^(#+) (.+)$/gm)].map(m => ({ heading: m[2], level: m[1].length,
    position: { start: { offset: m.index, line: text.slice(0, m.index).split('\n').length - 1 }, end: { offset: m.index + m[0].length } } }));
  const file = { path: 'sample.md', extension: 'md', stat: { mtime: 1 } };
  const view = { file, editor: { getValue: () => text, offsetToPos: from => ({ line: from, ch: 0 }),
    scrollIntoView: range => calls.push(['locate', range]) } };
  const plugin = { settings: {}, getCurrentReadableFile: () => file, getActiveMarkdownView: () => view,
    app: { metadataCache: { getFileCache: () => ({ headings }) } },
    runUserAction: (_label, fn) => fn(), startReading: (...args) => calls.push(['read', ...args]) };
  const outline = new SidebarOutline(plugin, doc); doc.querySelector('main').appendChild(outline.root); outline.refresh();
  return { outline, plugin, calls, file, view, text, doc };
}
test('empty workspace is safe', () => {
  const o = new SidebarOutline({ settings: {}, getCurrentReadableFile: () => null }, new JSDOM('').window.document);
  o.refresh(); assert.equal(o.rows.size, 0); o.destroy();
});
test('tree shows two levels, expands all, searches hidden descendants and preserves state', () => {
  const { outline: o, doc } = fixture();
  assert.deepEqual([...o.rows.keys()], [0, 1, 3]);
  o.setExpanded(true); assert.equal(o.rows.size, 4);
  o.setExpanded(false); assert.deepEqual([...o.rows.keys()], [0, 3]);
  o.search.value = 'deep'; o.search.dispatchEvent(new doc.defaultView.Event('input'));
  assert.deepEqual([...o.rows.keys()], [0, 1, 2]);
  o.refresh(); assert.equal(o.search.value, 'deep');
  o.search.value = ''; o.search.dispatchEvent(new doc.defaultView.Event('input'));
  assert.deepEqual([...o.rows.keys()], [0, 3]);
});
test('navigation is separate from playback and export blocks synthesis but not navigation', async () => {
  const { outline: o, plugin, calls, text } = fixture();
  await o.locate(1); assert.equal(calls[0][0], 'locate');
  await o.read(false, 1); assert.equal(calls[1][1], text.slice(text.indexOf('## Child'), text.indexOf('# Next')));
  await o.read(true, 1); assert.equal(calls[2][1], text.slice(text.indexOf('## Child')));
  plugin.activeSession = { kind: 'audio-export' }; o.refresh();
  assert.equal(o.rows.get(1).play.disabled, true);
  await o.read(true, 1); assert.equal(calls.length, 3);
  await o.locate(1); assert.equal(calls.length, 4);
});
test('file switching restores query and expansion without stale playback', async () => {
  const { outline: o, plugin, file, calls } = fixture();
  o.setExpanded(false); o.state.scroll = 120;
  plugin.getCurrentReadableFile = () => ({ path: 'another.md', extension: 'md' });
  await o.read(true, 0); assert.equal(calls.length, 0);
  plugin.getCurrentReadableFile = () => file; o.refresh();
  assert.deepEqual([...o.rows.keys()], [0, 3]); assert.equal(o.state.scroll, 120);
});
test('current heading updates but manual directory browsing prevents auto-expansion', () => {
  const { outline: o, plugin, file, text, doc } = fixture();
  const source = { mappingValid: true, ranges: [{ start: 0, end: 1 }], blocks: [{ start: 0, end: 1,
    from: text.indexOf('### Deep'), to: text.length }] };
  plugin.activeSession = { filePath: file.path, currentChunkIndex: 0, markdownSource: source };
  o.refresh(); assert.equal(o.rows.get(2).title.getAttribute('aria-current'), 'location');
  o.list.dispatchEvent(new doc.defaultView.Event('wheel')); o.setExpanded(false); o.updateCurrent(true);
  assert.equal(o.rows.has(2), false);
  o.state.manual = false; o.updateCurrent(true); assert.equal(o.rows.has(2), true);
});
test('PDF cached outline uses source entries and section playback boundaries', async () => {
  const { outline: o, plugin, calls } = fixture();
  const file = { path: 'sample.pdf', extension: 'pdf', stat: { mtime: 1, size: 10 } };
  const entries = [{ title: 'One', level: 1, page: 1, offset: 0, x: 0, y: 100 },
    { title: 'Two', level: 1, page: 2, offset: 3, x: 0, y: 100 }];
  plugin.app.vault = {}; plugin.app.workspace = { openLinkText: link => calls.push(['locate', link]) };
  plugin.pdfOutlineCache = { get: () => ({ model: { entries, pages: [{ number: 1, text: 'First page' }, { number: 2, text: 'Second page' }] }, entries: [] }) };
  plugin.readCurrentPdf = (...args) => calls.push(['pdf', ...args]); plugin.getCurrentReadableFile = () => file;
  o.refresh(); assert.equal(o.rows.size, 2);
  await o.locate(1); assert.match(calls[0][1], /#page=2/);
  await o.read(false, 0); assert.equal(calls[1][2].outlineRange.endOffset, 3);
  await o.read(true, 0); assert.equal(calls[2][2].outlineRange.endOffset, 11);
});
test('late PDF reads cannot replace another document and close prevents loading', async () => {
  const { outline: o, plugin, file } = fixture(); let resolve;
  plugin.app.vault = { readBinary: () => new Promise(r => { resolve = r; }) };
  plugin.getCurrentReadableFile = () => ({ path: 'slow.pdf', extension: 'pdf', stat: { mtime: 1, size: 1 } });
  o.refresh(); plugin.getCurrentReadableFile = () => file; o.refresh();
  resolve(new ArrayBuffer(0)); await new Promise(r => setImmediate(r));
  assert.equal(o.path, file.path); assert.equal(o.entries.length, 4);
  o.destroy(); o.refresh(); assert.equal(o.entries.length, 0);
});
test('HTML outline locates without synthesis and reads only selected section', async () => {
  const { outline: o, plugin, calls } = fixture();
  const html = new JSDOM('<h1>First</h1><p>Alpha</p><h1>Second</h1><p>Beta</p>').window.document;
  const file = { path: 'sample.html', extension: 'html', stat: { mtime: 1 } };
  const view = { file, mainView: { iframe: { contentDocument: html } } };
  html.querySelector('h1').scrollIntoView = () => calls.push(['locate']);
  plugin.app.workspace = { getLeavesOfType: () => [{ view }] }; plugin.getCurrentReadableFile = () => file;
  o.refresh(); assert.equal(o.entries.length, 2);
  await o.locate(0); assert.deepEqual(calls, [['locate']]);
  await o.read(false, 0); assert.match(calls[1][1], /Alpha/); assert.doesNotMatch(calls[1][1], /Beta/);
  html.querySelector('h1').textContent = 'Changed'; await o.read(true, 0); assert.equal(calls.length, 2);
});
test('PDF playback refresh never calls the notifying Markdown getter', () => {
  const doc = new JSDOM('').window.document;
  const plugin = { settings: {}, getCurrentReadableFile: () => ({ extension: 'pdf', path: 'paper.pdf' }),
    getActiveMarkdownView: () => assert.fail('Must not request a Markdown note during PDF rendering') };
  const outline = new SidebarOutline(plugin, doc);
  for (let i = 0; i < 20; i++) outline.refresh();
  assert.equal(outline.entries.length, 0);
  assert.equal(outline.rows.size, 0);
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
  outline.refresh(); assert.equal(outline.rows.size, 2); assert.equal(calls.length, 0);
  await outline.read(false, 0); assert.equal(calls[0][0], '# One\nBody.\n');
  await outline.read(true, 0); assert.equal(calls[1][0], text);
  text += ' Changed.'; await outline.read(false, 0); assert.equal(calls.length, 2);
  outline.destroy(); assert.equal(outline.text, '');
});
