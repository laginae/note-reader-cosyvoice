const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DeviceAudioCache}=require('./device-audio-cache');
const loaded={exports:{}};
new Function('require','module','exports',fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'))(
  name=>name==='obsidian'?{Plugin:class{},ItemView:class{},Modal:class{},PluginSettingTab:class{}}:require(name),loaded,loaded.exports);
test('desktop device cache uses session-owned playback files, never plaintext, and respects revoked consent',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cozy-cache-test-'));
  try {
    const plugin=Object.create(loaded.exports.default.prototype),rows=new Map();
    plugin.settings={...loaded.exports.__test.createDefaultSettings(),persistentAudioCache:true,speechEngine:'mimo-tts',mimoConsent:true};
    plugin.cacheDir=dir;plugin.vaultBasePath=dir;plugin.app={vault:{adapter:{getResourcePath:value=>'app://test/'+value}}};
    plugin.deviceAudioCache=new DeviceAudioCache({get:async key=>rows.get(key),put:async(key,value)=>rows.set(key,value),clear:async()=>rows.clear()},()=>true);
    plugin.isActive=()=>true;
    let requests=0;
    plugin.synthesizeChunk=async(_text,index,session)=>{
      requests++;const outputPath=path.join(dir,`public-${requests}.wav`);session.files.push(outputPath);
      await fs.promises.writeFile(outputPath,Buffer.alloc(64));
      return {outputPath,sentenceCues:[]};
    };
    const session=id=>({id,files:[],speechEngine:'mimo-tts',chunks:['A public test.'],audioParts:{0:['A public test.']},synthesisSettings:{...plugin.settings}});
    const a=session(1);await plugin.prepareChunk(a.chunks[0],0,a);
    for(let i=0;i<50&&!rows.size;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(rows.size,1);
    const b=session(2),audio=await plugin.prepareChunk(b.chunks[0],0,b);
    assert.equal(requests,1);assert.ok(b.files.includes(audio.outputPath));assert.equal(fs.statSync(audio.outputPath).size,64);
    assert.ok(fs.readdirSync(dir).every(name=>!name.endsWith('.txt')));
    let checks=0;plugin.isActive=()=>++checks===1;
    plugin.removeTempFile=async file=>fs.promises.unlink(file);
    const stopped=session(3);
    await assert.rejects(plugin.prepareChunk(stopped.chunks[0],0,stopped),/stopped/);
    assert.equal(fs.existsSync(stopped.files[0]),false);
    plugin.isActive=()=>true;
    plugin.settings.mimoConsent=false;
    await assert.rejects(plugin.prepareChunk(b.chunks[0],0,session(3)),/permission/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
