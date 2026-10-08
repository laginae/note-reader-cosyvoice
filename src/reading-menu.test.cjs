const test = require('node:test');
const assert = require('node:assert/strict');
const { registerReadingMenu, syncEditingToolbar } = require('./reading-menu');

function fixture(start = 6, end = 10) {
  let handler, text = 'First next sentence.';
  const calls = [], notices = [], items = [];
  const file = { extension: 'md', path: 'test.md' }, view = { file, getMode: () => 'source' };
  const editor = { getValue: () => text, getCursor: which => which === 'from' ? start : end, posToOffset: value => value };
  const plugin = { settings: { settingsLanguage: 'chinese' }, registerEvent() {}, addCommand(command) { this.command=command; }, app: { workspace: { on(name, fn) { assert.equal(name, 'editor-menu'); handler = fn; } } } };
  registerReadingMenu(plugin, snapshot => calls.push(snapshot), message => notices.push(message));
  const menu = { addItem(fn) { const item = { setTitle(v) { this.title = v; return this; }, setIcon() { return this; }, onClick(fn) { this.click = fn; return this; } }; fn(item); items.push(item); } };
  return { plugin, editor, open: () => handler(menu, editor, view), items, calls, notices, view, edit: v => text = v, cursor: (a,b) => { start=a; end=b; } };
}
test('reading menu captures selection and starting offset before the menu takes focus', () => {
  const f = fixture(); f.open(); f.cursor(0,0);
  assert.deepEqual(f.items.map(i => i.title), ['从此处开始朗读', '朗读选中内容']);
  f.items[0].click(); f.items[1].click();
  assert.equal(f.calls[0].text, 'next sentence.'); assert.equal(f.calls[1].text, 'next');
  assert.equal(f.calls[0].start, 6); assert.equal(f.calls[1].selection, true);
});
test('caret has only read-from-here; empty endings have no action', () => {
  const f = fixture(6,6); f.open(); assert.equal(f.items.length,1);
  const empty = fixture(20,20); empty.open(); assert.equal(empty.items.length,0);
});
test('changed text or document rejects a stale menu without reading', () => {
  const f=fixture(); f.open(); f.edit('changed'); f.items[0].click();
  assert.equal(f.calls.length,0); assert.equal(f.notices.length,1);
  const g=fixture(); g.open(); g.view.file={extension:'md',path:'other.md'}; g.items[1].click();
  assert.equal(g.calls.length,0); assert.equal(g.notices.length,1);
});
test('non-editor PDF and preview do not offer misleading source positions', () => {
  const f=fixture(); f.view.file.extension='pdf'; f.open(); assert.equal(f.items.length,0);
  const g=fixture(); g.view.getMode=()=> 'preview'; g.open(); assert.equal(g.items.length,0);
});
test('menu can be disabled independently; toolbar supports selection or reading to end', () => {
  const f=fixture(); f.plugin.settings.readingContextMenu=false; f.open(); assert.equal(f.items.length,0);
  f.plugin.command.editorCallback(f.editor,f.view); assert.equal(f.calls[0].text,'next');
  f.plugin.settings.readingFloatingAction='from-selection';
  f.plugin.command.editorCallback(f.editor,f.view); assert.equal(f.calls[1].text,'next sentence.');
  assert.equal(f.calls[1].selection,false);
  f.cursor(6,6); f.plugin.command.editorCallback(f.editor,f.view); assert.equal(f.calls.length,2);
});
test('optional toolbar integration is idempotent, updates labels, and removes only its dedicated command', async () => {
  const plugin=fixture().plugin; plugin.manifest={id:'reader'};
  const original=[{id:'editing-toolbar:ai-tools'},{id:'other',name:'Keep'}];
  let saves=0;
  const toolbar={settings:{menuCommands:[...original],followingCommands:[],enableMultipleConfig:false},async saveSettings(){saves++;}};
  plugin.app.plugins={plugins:{'editing-toolbar':toolbar}};
  await syncEditingToolbar(plugin); assert.equal(saves,0);
  plugin.settings.readingFloatingToolbar=true;
  await syncEditingToolbar(plugin); await syncEditingToolbar(plugin); assert.equal(saves,1);
  assert.equal(toolbar.settings.menuCommands[1].id,'reader:read-toolbar-selection');
  plugin.settings.readingFloatingAction='from-selection'; await syncEditingToolbar(plugin);
  assert.equal(toolbar.settings.menuCommands[1].name,'从选中位置开始朗读');
  plugin.settings.readingFloatingToolbar=false; await syncEditingToolbar(plugin);
  assert.deepEqual(toolbar.settings.menuCommands,original);
});
