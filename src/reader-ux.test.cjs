'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');

test('playback ticks preserve focused controls and do not read the editor; a changed note refreshes the outline', t => {
  const { dom, doc, api, plugin, pluginClass } = settingsFixture('chinese');
  t.after(() => dom.window.close());
  const file = {path:'sample.md',extension:'md',stat:{mtime:1,size:42}}; let reads=0;
  let value='# Public example\n\nAn example.';
  const view={file,editor:{getValue(){reads++;return value;}}};
  plugin.app.metadataCache={getFileCache:()=>({headings:[{heading:value.split('\n')[0].slice(2),level:1,
    position:{start:{line:0,offset:0},end:{line:0,offset:value.indexOf('\n')<0?value.length:value.indexOf('\n')}}}]})};
  Object.assign(plugin,{
    getCurrentReadableFile:()=>file, findMarkdownViewForFile:()=>view, getSegmentTiming:()=>({current:10,duration:100}),
    readerState:api.createReaderState({phase:'playing',canPause:true,canSeek:true,currentChunk:3,totalChunks:10}),
    activeSession:{chunks:Array(10).fill('Example.')},currentAudio:{duration:100},
  });
  const panel = new api.ReaderPanel(null,plugin); panel.contentEl=doc.body.createDiv(); panel.render();
  t.after(()=>panel.sidebarOutline.destroy());
  const button=panel.panel.presets[0][1]; button.focus(); reads=0;
  for(let i=0;i<10;i++){plugin.readerState.progress=.21+i/1000;panel.render();}
  assert.equal(doc.activeElement,button);assert.equal(reads,0);
  plugin.readerState.isPaused=true; panel.render(); assert.equal(panel.panel.status.textContent,'已暂停');
  assert.equal(doc.activeElement,button);
  const seeks=[]; plugin.seekToProgress=pluginClass.prototype.seekToProgress;
  plugin.isActive=session=>session===plugin.activeSession;
  plugin.seekCurrentSegmentToTime=seconds=>seeks.push(Math.round(seconds));
  const slider=panel.panel.progress;
  slider.dispatchEvent(new dom.window.Event('pointerdown')); slider.value='280'; slider.dispatchEvent(new dom.window.Event('input'));
  panel.render(); assert.equal(slider.value,'280'); assert.deepEqual(seeks,[]);
  slider.dispatchEvent(new dom.window.Event('change')); assert.deepEqual(seeks,[80]);
  value='# A new heading'; file.stat.mtime++; panel.render(true);
  assert.equal(panel.sidebarOutline.entries[0].title,'A new heading'); assert.equal(doc.activeElement,button);
});

test('local academic preview follows real settings; closing it does not synthesize, save or read a note', async t => {
  const {dom,doc,rows,plugin}=settingsFixture('english');t.after(()=>dom.window.close());
  const details=doc.querySelector('.cozy-academic-preview');
  const results=()=>Array.from(details.querySelectorAll('dd'),el=>el.textContent);
  assert.deepEqual(results(),['','','']); details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));
  const initial=results();assert.match(initial[0],/f of x/i);assert.match(initial[1],/excluding/i);
  const change=async(name,v)=>rows.find(r=>r.nameEl.textContent===name).change(v);
  await change('Simple function speech','compact'); await change('Interval speech (concise style)','range');
  await change('Repeat table headers for each row',false);
  const changed=results();assert.doesNotMatch(changed[0],/ of /);assert.doesNotMatch(changed[1],/excluding/);
  assert.notEqual(changed[2],initial[2]);assert.equal(plugin.saves,3);
  details.open=false;await change('Repeat table headers for each row',true);
  assert.deepEqual(results(),changed);
});
