const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loaded = { exports: {} };
new Function('require','module',fs.readFileSync(`${__dirname}/pdf-outline-ui.js`,'utf8'))(
  name => name==='obsidian' ? {Modal:class{},Notice:class{}} : require(name),loaded);
const { persistBookmarks, unusedPath } = loaded.exports;
test('outline bulk selection updates all entries without modifying titles or levels', () => {
  const modal = { entries: [{ title: '1. Intro', level: 1, enabled: false }, { title: '1.1 Detail', level: 2, enabled: true }], draw() {} };
  loaded.exports.PdfOutlineModal.prototype.selectAll.call(modal, true);
  assert.ok(modal.entries.every(row => row.enabled));
  loaded.exports.PdfOutlineModal.prototype.selectAll.call(modal, false);
  assert.ok(modal.entries.every(row => !row.enabled)); assert.equal(modal.entries[1].title, '1.1 Detail'); assert.equal(modal.entries[1].level, 2);
});
function vaultFixture() {
  const original=new Uint8Array([1,2,3]).buffer, files=new Map([['public.pdf',original]]), operations=[];
  const file={path:'public.pdf'};
  return {file,original,files,operations,vault:{
    adapter:{exists:async path=>files.has(path)},
    readBinary:async f=>files.get(f.path),
    createBinary:async(path,data)=>{if(files.has(path))throw Error('Exists');operations.push(['create',path]);files.set(path,data);return {path};},
    modifyBinary:async(f,data)=>{operations.push(['modify',f.path]);files.set(f.path,data);},
    getAbstractFileByPath:path=>files.has(path)?{path}:null,
  }};
}
test('save-copy never mutates the original; filenames avoid existing files',async()=>{
  const {vault,file,original,files,operations}=vaultFixture();
  const path=await unusedPath(vault,file,'.bookmarks');
  await persistBookmarks(vault,file,original,new Uint8Array([4,5]),path,null);
  assert.deepEqual(operations,[['create','public.bookmarks.pdf']]);
  assert.equal(files.get('public.pdf'),original);
  assert.equal(await unusedPath(vault,file,'.bookmarks'),'public.bookmarks-1.pdf');
});
test('overwrite backs up and verifies before modifying; failed backup blocks overwrite',async()=>{
  const {vault,file,original,files,operations}=vaultFixture();
  await persistBookmarks(vault,file,original,new Uint8Array([4,5]),file.path,'public.backup.pdf');
  assert.deepEqual(operations,[['create','public.backup.pdf'],['modify','public.pdf']]);
  assert.deepEqual(new Uint8Array(files.get('public.backup.pdf')),new Uint8Array(original));
  const broken=vaultFixture();broken.vault.createBinary=async()=>{throw Error('Disk full');};
  await assert.rejects(persistBookmarks(broken.vault,broken.file,broken.original,new Uint8Array([4]),'public.pdf','backup.pdf'),/Disk full/);
  assert.equal(broken.files.get('public.pdf'),broken.original);
});
test('external changes and missing backup prevent original replacement',async()=>{
  const {vault,file,original,files,operations}=vaultFixture();
  await assert.rejects(persistBookmarks(vault,file,original,new Uint8Array([4]),'public.pdf',null),/backup/);
  files.set('public.pdf',new Uint8Array([9]).buffer);
  await assert.rejects(persistBookmarks(vault,file,original,new Uint8Array([4]),'public.pdf','backup.pdf'),/changed/);
  assert.deepEqual(operations,[]);
});
