const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { ReadingWait } = require('./reading-wait');
const { PlaybackTimings } = require('./preparation-pool');
const { renderReadingWait, waitLabel } = require('./reading-wait-ui');
const { settingsFixture } = require('./test-helpers/settings-fixture.cjs');
const tick = () => new Promise(resolve=>setImmediate(resolve));

function fixture(plugin={}) {
  let now=0, next=0, refreshed=0;
  const timers=new Map(), timings=new PlaybackTimings(()=>now), session={preparationPool:{cooldownUntil:0}};
  Object.assign(plugin,{activeSession:session,pauseRequested:false,isActive:s=>plugin.activeSession===s&&!s.stopped,
    refreshWaitControls:()=>refreshed++});
  const wait=session.readingWait=new ReadingWait(plugin,session,timings,{schedule:(fn,d)=>{
    timers.set(++next,{at:now+d,fn});return next;},cancel:id=>timers.delete(id)});
  const advance=ms=>{
    const end=now+ms;
    for(;;){const due=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!due||due[1].at>end)break;
      now=due[1].at;timers.delete(due[0]);due[1].fn();}
    now=end;
  };
  return {plugin,session,wait,advance,timings,timers,refreshed:()=>refreshed};
}

test('slow feedback counts only the foreground wait, excludes pause time and records numbers only',()=>{
  const f=fixture(), r=f.wait.attempt('0:1',1,false); r.cancel=()=>true;
  f.advance(50000);
  const t=f.wait.begin('0:1');
  f.advance(7999);assert.equal(f.wait.view(),null);assert.equal(f.refreshed(),0);
  f.advance(1);assert.equal(f.wait.view().seconds,8);assert.equal(f.wait.view().ticket,null);
  f.plugin.pauseRequested=true;f.wait.pause(true);f.advance(100000);assert.equal(f.wait.view(),null);
  f.plugin.pauseRequested=false;f.wait.pause(false);f.advance(8000);
  assert.equal(f.wait.view().seconds,16);assert.ok(f.wait.view().ticket);
  f.wait.mark(r,'receiving');f.advance(2000);assert.equal(f.wait.view().stage,'receiving');assert.equal(f.wait.view().ticket,null);
  f.wait.mark(r,'backoff');f.advance(3000);assert.equal(f.wait.view().ticket,null);
  const next=f.wait.attempt('0:1',2,false);f.advance(1000);
  assert.match(waitLabel(f.wait.view(),'chinese'),/第 2 次请求/);
  f.wait.forget(next);f.advance(300);f.wait.end(t,true);
  const row=f.timings.snapshot().longWaits[0];
  assert.deepEqual(row,{ms:22300,responseMs:17000,receiveMs:2000,retryWaitMs:3000,otherMs:300,attempts:2,manualRetries:0,completed:1});
  for(let i=0;i<12;i++)f.timings.recordLongWait({...row,text:'not retained'});
  assert.equal(f.timings.snapshot().longWaits.length,8);assert.doesNotMatch(JSON.stringify(f.timings.snapshot()),/not retained/);
  assert.equal(f.wait.view(),null);assert.equal(f.timers.size,0);
});

test('a stale prompt, an unrelated prefetch, a recent download or a provider cooldown cannot resend',()=>{
  const f=fixture(),r=f.wait.attempt('1:2',1,false),bg=f.wait.attempt('1:3',1,false);
  let sends=0;r.cancel=()=>{sends++;return true;};bg.cancel=()=>assert.fail('wrong request');
  f.wait.begin('1:2');f.advance(16000);const ticket=f.wait.view().ticket;
  f.session.preparationPool.cooldownUntil=f.wait.now()+10000;assert.equal(f.wait.retry(ticket),false);
  f.advance(10001);f.wait.begin('1:2');f.advance(16000);
  assert.equal(f.wait.retry(ticket),false,'returning to the same target must not revive its old confirmation');
  f.wait.mark(r,'receiving');f.advance(14000);r.activity=f.wait.now();f.advance(3000);assert.equal(f.wait.view().ticket,null);
  f.advance(15000);const current=f.wait.view().ticket;assert.equal(f.wait.retry(current),true);
  assert.equal(f.wait.retry(current),false);assert.equal(sends,1);
  f.wait.dispose();assert.equal(f.timers.size,0);
});

test('the wait row keeps keyboard focus on updates and disappears when audio is ready',()=>{
  const {JSDOM}=require('jsdom'),dom=new JSDOM('<section></section>'),parent=dom.window.document.querySelector('section');
  const clicked=[],p={settings:{settingsLanguage:'chinese'},confirmReadingRetry:k=>clicked.push(k)};
  const token={},base={stage:'response',attempt:1,seconds:16,ticket:token};
  const row=renderReadingWait(p,parent,null,base,()=>{}),button=row.querySelector('button');button.focus();
  assert.equal(renderReadingWait(p,parent,row,{...base,seconds:17},()=>{}),row);
  assert.equal(dom.window.document.activeElement,button);button.click();assert.deepEqual(clicked,[token]);
  assert.match(row.textContent,/语音接口返回.*17 秒/);
  renderReadingWait(p,parent,row,{...base,stage:'limited',ticket:null},()=>{});assert.ok(button.disabled&&button.hidden);
  assert.equal(renderReadingWait(p,parent,row,null,()=>{}),null);assert.equal(parent.children.length,0);dom.window.close();
});

async function transportCase(action) {
  const {plugin,pluginClass,dom}=settingsFixture('english','mimo-tts'),f=fixture(plugin),requests=[];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cozy-wait-test-')), original=https.request;
  plugin.requestRemoteAudioOnce=pluginClass.prototype.requestRemoteAudioOnce;
  plugin.readerState={phase:'playing'};
  f.session.preparationPool.throttle=delay=>{f.session.preparationPool.cooldownUntil=f.wait.now()+delay;};
  try{
    https.request=(_ep,_opts,respond)=>{
      const r=new EventEmitter();Object.assign(r,{destroyed:false,respond,setTimeout(){},end(body){this.body=body;},
        destroy(error){this.destroyed=true;if(error)this.emit('error',error);}});
      requests.push(r);return r;
    };
    const start=(key,name,automatic=true)=>pluginClass.prototype.requestRemoteAudio.call(plugin,{
      endpoint:new URL('https://example.invalid/'),headers:{},body:'public sample '+name,outputPath:path.join(dir,name),
      expectedContentType:'audio/mpeg',session:f.session,partKey:key,serviceLabel:'Test',retryTemporaryFailures:automatic});
    const reply=(r,status=200)=>{
      const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':'audio/mpeg','retry-after':'2'};
      res.destroy=()=>{res.emit('close');};r.respond(res);return res;
    };
    const success=r=>{const res=reply(r);res.emit('data',Buffer.from('public audio'));res.complete=true;res.emit('end');res.emit('close');r.emit('close');};
    await action({...f,pluginClass,requests,start,reply,success,dir});
  }finally{https.request=original;f.wait.dispose();dom.window.close();for(const n of await fs.readdir(dir))await fs.unlink(path.join(dir,n));await fs.rmdir(dir);}
}

test('manual retry closes just the foreground socket before replaying the identical part once',()=>transportCase(async f=>{
  f.wait.begin('4:1');const active=f.start('4:1','one'),bg=f.start('4:2','two');
  f.advance(15000);const ticket=f.wait.view().ticket;assert.ok(f.wait.retry(ticket));assert.equal(f.wait.retry(ticket),false);
  assert.ok(f.requests[0].destroyed);assert.equal(f.requests[1].destroyed,false);
  const late=f.reply(f.requests[0]);late.emit('data',Buffer.from('stale'));late.emit('end');
  await tick();assert.equal(f.requests.length,2);assert.deepEqual(await fs.readdir(f.dir),[]);
  f.requests[0].emit('close');await tick();assert.equal(f.requests.length,3);
  assert.equal(f.requests[2].body,f.requests[0].body);f.advance(180000);assert.equal(f.wait.view().ticket,null);
  f.success(f.requests[2]);f.success(f.requests[1]);await Promise.all([active,bg]);
  assert.equal(await fs.readFile(path.join(f.dir,'one'),'utf8'),'public audio');
  assert.equal(f.plugin.currentRequests.size,0);
  f.wait.end(f.wait.target,true);assert.equal(f.timings.snapshot().longWaits[0].manualRetries,1);
}));

test('navigation during cancellation abandons a manual retry without submitting it',()=>transportCase(async f=>{
  f.wait.begin('3:0');const op=f.start('3:0','one');f.advance(16000);
  assert.ok(f.wait.retry(f.wait.view().ticket));f.session.requestedChunkIndex=4;
  f.requests[0].emit('close');await assert.rejects(op,{name:'AbortError'});
  assert.equal(f.requests.length,1);assert.equal(f.plugin.currentRequests.size,0);
}));

test('HTTP 429 backoff is visible, never manually bypassed, and existing automatic retry is preserved',()=>transportCase(async f=>{
  f.wait.begin('0:0');let wake;
  f.plugin.waitForRemoteRetry=(_s,delay)=>{assert.equal(delay,2000);return new Promise(r=>{wake=r;});};
  const op=f.start('0:0','one');f.advance(16000);const previous=f.wait.view().ticket;
  const response=f.reply(f.requests[0],429);response.emit('end');await tick();
  assert.equal(f.wait.view().stage,'limited');assert.equal(f.wait.retry(previous),false);assert.equal(f.requests.length,1);
  f.advance(2000);wake();await tick();assert.equal(f.wait.view().attempt,2);
  f.success(f.requests[1]);await op;assert.equal(f.timings.snapshot().counts.httpAutomaticRetry,1);
}));

test('an early socket or incomplete response close settles without an indefinitely pending promise',()=>transportCase(async f=>{
  for(const started of [false,true]){
    const op=f.start('0:0','one',false),r=f.requests.at(-1);
    if(started) f.reply(r).emit('close');else r.emit('close');
    await assert.rejects(op,{code:'ECONNRESET'});assert.equal(f.plugin.currentRequests.size,0);
  }
}));

test('a pause during cancellation sends nothing until resume and a concurrent cooldown has elapsed',()=>transportCase(async f=>{
  const key='5:1';f.wait.begin(key);const op=f.start(key,'one');f.advance(16000);
  assert.ok(f.wait.retry(f.wait.view().ticket));f.plugin.pauseRequested=true;f.wait.pause(true);
  f.requests[0].emit('close');await tick();
  f.advance(60000);assert.equal(f.requests.length,1);assert.equal(f.wait.gates.size,1);assert.equal(f.timers.size,0);
  f.session.preparationPool.cooldownUntil=f.wait.now()+2000;
  f.plugin.pauseRequested=false;f.wait.pause(false);await tick();f.advance(1999);await tick();
  assert.equal(f.requests.length,1);f.advance(1);await tick();assert.equal(f.requests.length,2);
  f.success(f.requests[1]);await op;assert.equal(f.wait.gates.size,0);
}));

test('manual resend is the last attempt, not a new chain of automatic retries',()=>transportCase(async f=>{
  f.wait.begin('0:0');const op=f.start('0:0','one');f.advance(16000);
  assert.ok(f.wait.retry(f.wait.view().ticket));f.requests[0].emit('close');await tick();
  assert.equal(f.requests.length,2);const bad=f.reply(f.requests[1],503);bad.emit('end');
  await assert.rejects(op,/503/);assert.equal(f.requests.length,2);
}));

test('stopping while a confirmed resend is parked releases the gate without resending',()=>transportCase(async f=>{
  f.wait.begin('0:0');const op=f.start('0:0','one');f.advance(16000);
  assert.ok(f.wait.retry(f.wait.view().ticket));f.plugin.pauseRequested=true;f.wait.pause(true);
  f.requests[0].emit('close');await tick();assert.equal(f.wait.gates.size,1);
  f.session.stopped=true;f.wait.dispose();await assert.rejects(op,{name:'AbortError'});
  assert.equal(f.requests.length,1);assert.equal(f.wait.gates.size,0);assert.equal(f.timers.size,0);
}));

test('a slow prefetched subpart can be retried inside the playback loop without replaying its neighbor',()=>transportCase(async f=>{
  const p=f.plugin,s=f.session,methods=f.pluginClass.prototype,played=[];
  Object.assign(s,{id:1,kind:'text',speechEngine:'mimo-tts',engineLabel:'Test',bufferMode:'balanced',prefetchChunks:1,
    productionComplete:true,chunks:['Public first. Public second.','Public third.'],totalChunks:2,
    plannedAudioParts:new Set([0,1]),audioParts:{0:['Public first.','Public second.'],1:['Public third.']}});
  p.playbackTimings=f.timings;p.settings.cleanupCache=false;
  p.waitForSessionChunk=methods.waitForSessionChunk;p.waitForSessionOperation=methods.waitForSessionOperation;
  p.updateStatus=()=>{};p.getSegmentTiming=()=>({fraction:0});p.clearSessionReadingPosition=async()=>{};
  p.bufferingHint={start(){},stop(){}};p.isActive=session=>p.activeSession===session;
  p.queuePrepareChunk=async(_text,index,_session,part)=>{
    if(index===0 && part===1)await f.start('0:1','one');
    return {index,part};
  };
  p.playPreparedAudio=async(audio,_s,i,_total,j)=>{assert.deepEqual(audio,{index:i,part:j});played.push([i,j]);};
  const done=methods.runSpeechSession.call(p,s);await tick();
  assert.deepEqual(played,[[0,0]]);assert.equal(f.requests.length,1);assert.equal(s.readingWait.target.key,'0:1');
  f.advance(16000);assert.ok(s.readingWait.retry(s.readingWait.view().ticket));f.requests[0].emit('close');
  await tick();assert.equal(f.requests.length,2);f.success(f.requests[1]);await done;
  assert.deepEqual(played,[[0,0],[0,1],[1,0]]);assert.equal(p.activeSession,null);
  assert.equal(s.readingWait.target,null);assert.equal(s.readingWait.requests.size,0);
}));
