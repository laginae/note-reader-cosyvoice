'use strict';
// Called from Obsidian with its window; tests a separate, disposable database.
exports.run = async function(runtime) {
  const fs = require('node:fs'), path = require('node:path');
  const code = fs.readFileSync(path.join(__dirname,'../src/device-audio-cache.js'),'utf8');
  const moduleObject = {exports:{}};
  new runtime.Function('module',code)(moduleObject);
  const { IndexedAudioStore, DeviceAudioCache, audioCacheKey, TTL_MS } = moduleObject.exports;
  const namespace=['cozy-public-runtime-check',Date.now()];
  let store = new IndexedAudioStore(namespace,runtime.indexedDB);
  const now=Date.now();
  const key=await audioCacheKey('A fixed public cache test.',{speechEngine:'test',speed:1});
  const audio={arrayBuffer:new runtime.ArrayBuffer(64),mimeType:'audio/wav'};
  const check=(condition,label)=>{if(!condition)throw Error(label);};
  let databaseName;
  try {
    await store.put(key,audio,now);check((await store.get(key,now)).arrayBuffer.byteLength===64,'roundtrip');
    databaseName=(await store.open()).name;
    await store.close();store=new IndexedAudioStore(namespace,runtime.indexedDB);
    check((await store.get(key,now)).arrayBuffer.byteLength===64,'reopen');
    check(!await store.get(key,now+TTL_MS),'expiry');
    await store.put('old',audio,now-TTL_MS);await store.prune(now);check(!await store.get('old',now),'prune');
    const cache=new DeviceAudioCache(store,()=>true);const token=cache.token();
    await cache.put(key,audio,token);await cache.clear();await cache.put(key,audio,token);
    check(!await cache.get(key),'clear prevents late writes');
    return {roundtrip:true,reopen:true,expiry:true,prune:true,clearLateWrite:true,privateDataUsed:false};
  } finally {
    await store.clear();await store.close();
    if(databaseName)runtime.indexedDB.deleteDatabase(databaseName);
  }
};
