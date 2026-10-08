const test = require('node:test');
const assert = require('node:assert/strict');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const { planSpeechParts } = require('./speech-parts');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ELEVENLABS_MODELS } = require('./openrouter-elevenlabs');
const { getOpenRouterPricing } = require('./openrouter-pricing');

test('price reference follows preset and custom model changes without touching credentials', async () => {
  for (const language of ['english', 'chinese']) {
    const f = settingsFixture(language, 'openrouter-tts', {openRouterModel:'elevenlabs/eleven-v4'});
    try {
      const priceRow = () => f.rows.find(row => row.settingEl.isConnected
        && row.nameEl.textContent === getOpenRouterPricing('', language).name);
      assert.equal(priceRow().descEl.textContent, getOpenRouterPricing('elevenlabs/eleven-v4', language).description);
      const modelRow = f.rows.find(row => row.settingEl.isConnected
        && row.controlEl.querySelector('option[value="elevenlabs/eleven-v4"]'));
      await modelRow.change('microsoft/mai-voice-2');
      assert.equal(priceRow().descEl.textContent, getOpenRouterPricing('microsoft/mai-voice-2', language).description);
      const inputRow = f.rows.find(row => row.settingEl.isConnected
        && row.controlEl.querySelector('input')?.value === 'microsoft/mai-voice-2');
      const keyPath = f.plugin.settings.openRouterKeyPath;
      await inputRow.change('other/custom-tts');
      assert.equal(priceRow().descEl.textContent, getOpenRouterPricing('other/custom-tts', language).description);
      assert.equal(f.plugin.settings.openRouterKeyPath, keyPath);
      f.plugin.settings.speechEngine = 'system-tts'; f.tab.display();
      assert.equal(priceRow(), undefined);
    } finally { f.dom.window.close(); }
  }
});

test('voice guidance and placeholders follow model switches in English and Chinese', async () => {
  for (const language of ['english', 'chinese']) {
    const f = settingsFixture(language, 'openrouter-tts', {openRouterModel:'microsoft/mai-voice-2.1-flash'});
    const rowNamed = (...names) => f.rows.find(row => row.settingEl.isConnected && names.includes(row.nameEl.textContent));
    const voices = () => rowNamed('Common voices for this model', '该模型的常用音色');
    const help = () => rowNamed('Find a custom voice ID', '查询自定义音色 ID');
    const model = () => f.rows.find(row => row.settingEl.isConnected
      && row.controlEl.querySelector('option[value="elevenlabs/eleven-v4"]'));
    try {
      assert.match(voices().descEl.textContent, /MAI/);
      assert.match(help().descEl.textContent, /MAI/);
      for (const [id] of ELEVENLABS_MODELS) {
        await model().change(id);
        assert.match(voices().descEl.textContent, /ElevenLabs/);
        assert.match(help().descEl.textContent, /george/);
        assert.doesNotMatch(voices().descEl.textContent + help().descEl.textContent, /MAI|Microsoft|微软/);
        const input = rowNamed('OpenRouter TTS voice', 'OpenRouter TTS 音色').controlEl.querySelector('input');
        assert.equal(input.placeholder, 'george');
        assert.equal(input.value, 'george');
      }
      await model().change('fish-audio/s2.1-pro');
      assert.doesNotMatch(voices().descEl.textContent + help().descEl.textContent, /MAI|ElevenLabs|george/);
      await model().change('microsoft/mai-voice-2.1-flash');
      assert.match(help().descEl.textContent, /MAI/);
      assert.doesNotMatch(help().descEl.textContent, /ElevenLabs|george/);
    } finally { f.dom.window.close(); }
  }
});

test('synthesis receives substituted text while original highlight text and request-local context survive', async () => {
  const f = settingsFixture('english', 'openrouter-tts', {openRouterModel:'elevenlabs/eleven-v4', openRouterContext:true,
    speechTermsEnabled:true,speechTerms:'AI = artificial intelligence'});
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-terms-test-'));
  try {
    const plugin = Object.create(f.pluginClass.prototype);
    Object.assign(plugin, { settings:f.plugin.settings, cacheDir:dir, vaultBasePath:dir,
      app:{vault:{adapter:{getResourcePath:()=> 'test-audio'}}}, isActive:()=>true,
      updateStatus(){}, writeRuntimeLog:async()=>{}, getSegmentTiming:()=>({fraction:0}) });
    const session = {id:1,files:[],speechEngine:'openrouter-tts',chunks:['Before.', 'AI works.', 'After.'],
      totalChunks:3,currentChunkIndex:1,synthesisSettings:{...plugin.settings},speechPartLimit:800};
    planSpeechParts(session,1);
    plugin.runSpeechEngine = async (input, output, snapshot, engine, context) => {
      assert.equal(await fs.readFile(input,'utf8'), 'artificial intelligence works.');
      assert.equal(snapshot, session); assert.equal(engine, 'openrouter-tts');
      const request = JSON.parse(f.api.buildOpenRouterTtsRequestBody('artificial intelligence works.', snapshot.synthesisSettings, context));
      assert.deepEqual(request.provider, {data_collection:'deny', zdr:true, options:{elevenlabs:{previous_text:'Before.',next_text:'After.'}}});
      await fs.writeFile(output, new Uint8Array(100));
      return {boundaries:[], duration:1};
    };
    const prepared = await plugin.prepareChunk('AI works.',1,session);
    assert.deepEqual(prepared.sentenceCues, []);
    assert.equal(session.chunks[1], 'AI works.');
  } finally { await fs.rm(dir,{recursive:true,force:true}); f.dom.window.close(); }
});

test('context settings are model-specific and term settings are shared, validated and persistent', async () => {
  for (const engine of ['mimo-tts', 'openrouter-tts']) {
    const f = settingsFixture('english', engine, { openRouterModel:'elevenlabs/eleven-v4', openRouterContext:true });
    assert.equal(Boolean(f.doc.querySelector('.reader-speech-options')), engine === 'openrouter-tts');
    const rule = f.rows.find(row => row.nameEl.textContent === 'Term rules');
    await rule.change('AI = artificial intelligence');
    assert.equal(f.plugin.settings.speechTerms, 'AI = artificial intelligence');
    await rule.change('invalid');
    assert.equal(f.plugin.settings.speechTerms, 'AI = artificial intelligence');
    assert.equal(rule.controlEl.querySelector('textarea').getAttribute('aria-invalid'), 'true');
    f.plugin.settings.openRouterModel = 'fish-audio/s2.1-pro'; f.tab.display();
    assert.equal(f.doc.querySelector('.reader-speech-options'), null);
    assert.equal(f.plugin.settings.openRouterContext, true);
    f.dom.window.close();
  }
});

test('term expansion keeps session source chunks intact and bounds all planned requests', () => {
  const source = ('AI control. ').repeat(30);
  const session = { chunks:[source], speechPartLimit:200, smartQuickStart:true, rapidQuickStart:true,
    synthesisSettings:{speechTermsEnabled:true,speechTerms:'AI = artificial intelligence'} };
  const parts = planSpeechParts(session, 0, true);
  assert.equal(parts.join(''), source);
  assert.equal(session.chunks[0], source);
  assert.ok(session.audioSpeechParts[0].every(text => text.length <= 200));
  assert.equal(session.audioSpeechParts[0].join(''), source.replaceAll('AI', 'artificial intelligence'));
  assert.deepEqual(planSpeechParts(session, 0, false), parts);
});
