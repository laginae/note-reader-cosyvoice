const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { planSpeechParts } = require('./speech-parts');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('synthesis receives substituted text while original highlight text and request-local context survive', async () => {
  const f = settingsFixture('english', 'openrouter-tts', {openRouterModel:'elevenlabs/eleven-v4', openRouterContext:true,
    speechTermsEnabled:true,speechTerms:'BESS = B E S S'});
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-terms-test-'));
  try {
    const plugin = Object.create(f.pluginClass.prototype);
    Object.assign(plugin, { settings:f.plugin.settings, cacheDir:dir, vaultBasePath:dir,
      app:{vault:{adapter:{getResourcePath:()=> 'test-audio'}}}, isActive:()=>true,
      updateStatus(){}, writeRuntimeLog:async()=>{}, getSegmentTiming:()=>({fraction:0}) });
    const session = {id:1,files:[],speechEngine:'openrouter-tts',chunks:['Before.', 'BESS works.', 'After.'],
      totalChunks:3,currentChunkIndex:1,synthesisSettings:{...plugin.settings},speechPartLimit:800};
    planSpeechParts(session,1);
    plugin.runSpeechEngine = async (input, output, snapshot, engine, context) => {
      assert.equal(await fs.readFile(input,'utf8'), 'B E S S works.');
      assert.equal(snapshot, session); assert.equal(engine, 'openrouter-tts');
      const request = JSON.parse(f.api.buildOpenRouterTtsRequestBody('B E S S works.', snapshot.synthesisSettings, context));
      assert.deepEqual(request.provider, {data_collection:'deny', zdr:true, options:{elevenlabs:{previous_text:'Before.',next_text:'After.'}}});
      await fs.writeFile(output, new Uint8Array(100));
      return {boundaries:[], duration:1};
    };
    const prepared = await plugin.prepareChunk('BESS works.',1,session);
    assert.deepEqual(prepared.sentenceCues, []);
    assert.equal(session.chunks[1], 'BESS works.');
  } finally { await fs.rm(dir,{recursive:true,force:true}); f.dom.window.close(); }
});

test('context settings are model-specific and term settings are shared, validated and persistent', async () => {
  for (const engine of ['mimo-tts', 'openrouter-tts']) {
    const f = settingsFixture('english', engine, { openRouterModel:'elevenlabs/eleven-v4', openRouterContext:true });
    assert.equal(Boolean(f.doc.querySelector('.reader-speech-options')), engine === 'openrouter-tts');
    const rule = f.rows.find(row => row.nameEl.textContent === 'Term rules');
    await rule.change('BESS = B E S S');
    assert.equal(f.plugin.settings.speechTerms, 'BESS = B E S S');
    await rule.change('invalid');
    assert.equal(f.plugin.settings.speechTerms, 'BESS = B E S S');
    assert.equal(rule.controlEl.querySelector('textarea').getAttribute('aria-invalid'), 'true');
    f.plugin.settings.openRouterModel = 'fish-audio/s2.1-pro'; f.tab.display();
    assert.equal(f.doc.querySelector('.reader-speech-options'), null);
    assert.equal(f.plugin.settings.openRouterContext, true);
    f.dom.window.close();
  }
});

test('term expansion keeps session source chunks intact and bounds all planned requests', () => {
  const source = ('BESS control. ').repeat(30);
  const session = { chunks:[source], speechPartLimit:200, smartQuickStart:true, rapidQuickStart:true,
    synthesisSettings:{speechTermsEnabled:true,speechTerms:'BESS = battery energy storage system'} };
  const parts = planSpeechParts(session, 0, true);
  assert.equal(parts.join(''), source);
  assert.equal(session.chunks[0], source);
  assert.ok(session.audioSpeechParts[0].every(text => text.length <= 200));
  assert.equal(session.audioSpeechParts[0].join(''), source.replaceAll('BESS', 'battery energy storage system'));
  assert.deepEqual(planSpeechParts(session, 0, false), parts);
});
