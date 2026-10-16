const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { splitPdfSpeechChunks } = require('./pdf-chunker');
const loaded = {exports:{}};
new Function('require','module','exports',fs.readFileSync(`${__dirname}/../main.js`,'utf8'))(
  name => name === 'obsidian' ? new Proxy({}, {get:()=>class {}}) : require(name), loaded, loaded.exports);

test('PDF selection reaches playback with sentence chunks, not page-line chunks', async () => {
  const plugin=Object.create(loaded.exports.default.prototype);
  plugin.settings=loaded.exports.__test.createDefaultSettings();
  const text='The first sentence is wrapped\nacross several lines and ends here. Another sentence\ncontinues to its full stop. Last.';
  plugin.getCurrentDocumentView=()=>null;
  plugin.getCurrentWebPageView=()=>null;
  plugin.getCurrentReadableFile=()=>({path:'public.pdf',basename:'public',extension:'pdf'});
  plugin.getPdfSelectionForFile=()=>({selectedText:text});
  plugin.activateControlView=async()=>{};
  plugin.getSpeechConfiguration=()=>({chunkLimits:[75],engineLabel:'Mock',speechEngine:'local-cosyvoice'});
  plugin.stopReading=async()=>{};
  plugin.createSpeechSession=(chunks,label,configuration,options)=>({chunks,options});
  plugin.updateStatus=()=>{};
  plugin.writeRuntimeLog=async()=>{};
  plugin.runSpeechSession=async session=>{plugin.completed=session;};
  await plugin.readSelection();
  assert.deepEqual(plugin.completed.chunks,splitPdfSpeechChunks(text,[75]));
  assert.equal(plugin.completed.chunks[0],'The first sentence is wrapped across several lines and ends here.');
  assert.ok(plugin.completed.chunks.every(chunk=>!chunk.includes('\n')));
  assert.equal(plugin.completed.skipReadingPosition,true);
});

test('PDF selected math reaches the speech session as words without altering the captured selection', async () => {
  const plugin=Object.create(loaded.exports.default.prototype);
  plugin.settings={...loaded.exports.__test.createDefaultSettings(),mathReadingLanguage:'chinese'};
  const item=(str,x)=>({str,width:str.length*5,height:12,transform:[12,0,0,12,x,700]});
  const context={selectedText:'The relation is 𝑥 = 𝑦 + 2.',selectionLayout:[{viewport:{width:600,height:800},
    items:[item('The relation is',40),item('𝑥',130),item('=',145),item('𝑦',160),item('+',175),item('2',190),item('.',205)]}]};
  const original=JSON.stringify(context);
  plugin.getCurrentDocumentView=()=>null;
  plugin.getCurrentWebPageView=()=>null;
  plugin.getCurrentReadableFile=()=>({path:'public.pdf',basename:'public',extension:'pdf'});
  plugin.getPdfSelectionForFile=()=>context;
  plugin.activateControlView=async()=>{};
  plugin.getSpeechConfiguration=()=>({chunkLimits:[200],engineLabel:'Mock',speechEngine:'local-cosyvoice'});
  plugin.stopReading=async()=>{};
  plugin.createSpeechSession=(chunks)=>({chunks});
  plugin.updateStatus=()=>{};
  plugin.writeRuntimeLog=async()=>{};
  plugin.runSpeechSession=async session=>{plugin.completed=session;};
  await plugin.readSelection();
  assert.match(plugin.completed.chunks.join(' '),/The relation is x equals y plus 2/);
  assert.doesNotMatch(plugin.completed.chunks.join(' '),/[=+]|等于/);
  assert.equal(JSON.stringify(context),original);
});
