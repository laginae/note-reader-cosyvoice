'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { PlaybackControls } = require('../src/playback-controls');
const rect = (x,y,width,height) => ({left:x,top:y,right:x+width,bottom:y+height,width,height});
const tick = () => new Promise(resolve=>setTimeout(resolve,0));
function fixture() {
  const dom = new JSDOM('<main></main><aside></aside><div class="status-bar"></div>'), doc=dom.window.document;
  let state={active:false,canToggle:false}, calls=0, stops=0, errors=0, icons=0;
  dom.window.matchMedia=()=>({matches:true});
  const first={containerEl:doc.querySelector('main')}, second={containerEl:doc.querySelector('aside')};
  first.containerEl.getBoundingClientRect=()=>rect(0,0,500,700);
  second.containerEl.getBoundingClientRect=()=>rect(500,0,500,700);
  doc.querySelector('.status-bar').getBoundingClientRect=()=>rect(0,670,1000,30);
  const plugin={settings:{},app:{workspace:{activeLeaf:{view:first}}}};
  const adapter={playback:()=>state,activeView:()=>first,togglePlayback:()=>{calls++; state={...state,paused:!state.paused};},
    stopPlayback:()=>{stops++;state={...state,active:false,canStop:false};},playbackError:()=>{errors++;}};
  const controls=new PlaybackControls(plugin,adapter,()=>{icons++;}); controls.sync([first,second]);
  const active=(session=1,paused=false)=>{state={active:true,canToggle:true,canStop:true,session,paused,title:'Public reading sample'};controls.update();};
  return {doc,dom,plugin,adapter,controls,first,second,active,setState:value=>{state=value;controls.update();},
    counts:()=>({calls,stops,errors,icons}),cleanup:()=>{controls.destroy();dom.window.close();}};
}
test('pause controls never start speech when idle and update in place during synthesis or pause', async t=>{
  const f=fixture();t.after(f.cleanup); const button=f.controls.button(f.first.containerEl);
  assert.equal(button.disabled,true); assert.equal(button.getAttribute('aria-label'),'Start reading first');
  button.click();await tick();assert.equal(f.counts().calls,0);
  f.active();assert.equal(button.disabled,false);assert.equal(button.dataset.icon,'pause');
  button.click();await tick();assert.equal(button.dataset.icon,'play');assert.match(button.getAttribute('aria-label'),/Resume reading: Public/);
  button.click();await tick();assert.equal(button.dataset.icon,'pause');assert.equal(f.counts().calls,2);
  const paints=f.counts().icons;for(let i=0;i<50;i++)f.controls.update();assert.equal(f.counts().icons,paints);
  assert.equal(f.first.containerEl.firstElementChild,button);
  f.setState({active:false,canToggle:false});assert.equal(button.disabled,true);
});
test('floating control allocates no UI or observers unless opted in and a reading session exists', t=>{
  const f=fixture();t.after(f.cleanup);let observers=0;
  f.dom.window.ResizeObserver=class{constructor(){observers++;}observe(){}disconnect(){}};
  f.active();assert.equal(f.controls.floating,undefined);assert.equal(observers,0);
  f.plugin.settings.floatingPauseButton='true';f.controls.update();assert.equal(observers,0);
  f.plugin.settings.floatingPauseButton=true;f.controls.update();const floating=f.controls.floating;
  assert.ok(floating);assert.equal(observers,1);assert.equal(f.doc.querySelectorAll('.cozy-floating-playback').length,1);
  f.active(1,true);assert.equal(f.controls.floating,floating);assert.equal(floating.button.dataset.icon,'play');
  f.setState({active:false,canToggle:false});assert.equal(f.doc.querySelector('.cozy-floating-playback'),null);
  assert.equal(f.first.containerEl.classList.contains('cozy-playback-host'),false);
  assert.equal(f.counts().calls,0);
});
test('only one floating button follows the active pane and disabling removes it immediately', t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const old=f.controls.floating.button;
  f.plugin.app.workspace.activeLeaf.view=f.second;f.controls.update();
  assert.equal(f.doc.querySelectorAll('.cozy-floating-playback').length,1);assert.equal(old.isConnected,false);
  assert.ok(f.second.containerEl.contains(f.controls.floating.button));
  f.plugin.settings.floatingPauseButton=false;f.controls.update();assert.equal(f.doc.querySelector('.cozy-floating-playback'),null);
  assert.equal(f.counts().calls,0);
});
test('pending resume blocks duplicate clicks across both controls without losing later sessions', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const finishes=[];
  f.adapter.togglePlayback=()=>new Promise(resolve=>{finishes.push(resolve);});
  const a=f.controls.button(f.first.containerEl),b=f.controls.button(f.second.containerEl);
  a.click();assert.equal(a.disabled,true);assert.equal(b.disabled,true);const pending=f.controls.pending;
  b.click();assert.equal(f.controls.pending,pending);
  f.active(2);assert.equal(a.disabled,false);b.click();const newer=f.controls.pending;assert.notEqual(newer,pending);
  finishes[0]();await tick();assert.equal(f.controls.pending,newer);assert.equal(b.disabled,true);
  finishes[1]();await tick();assert.equal(b.disabled,false);
});
test('stale pointer intentions and keyboard repeat never act on a replacement session', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const button=f.controls.button(f.first.containerEl);
  button.dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));f.active(2);
  button.dispatchEvent(new f.dom.window.MouseEvent('click',{detail:1,bubbles:true}));await tick();assert.equal(f.counts().calls,0);
  const repeated=new f.dom.window.KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true});
  button.dispatchEvent(repeated);assert.equal(repeated.defaultPrevented,true);
  button.click();await tick();assert.equal(f.counts().calls,1);
});
test('pause command remains inside the input gesture and failures leave controls usable', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const button=f.controls.button(f.first.containerEl);
  let synchronous=false;f.adapter.togglePlayback=()=>{synchronous=true;throw Error('Public fixture failure');};
  button.click();assert.equal(synchronous,true);await tick();assert.equal(f.counts().errors,1);assert.equal(button.disabled,false);
});
test('floating placement clears status and mobile bars, follows the visual viewport and respects safe insets', t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'42px');
  const bar=f.doc.createElement('div');bar.className='mobile-navbar';bar.getBoundingClientRect=()=>rect(0,610,500,60);f.doc.body.append(bar);
  floating.configure();assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'102px');
  bar.style.display='none';floating.layout();assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'42px');
  Object.defineProperty(f.dom.window,'visualViewport',{value:{height:420,width:400,offsetTop:20,offsetLeft:0},configurable:true});
  floating.button.style.scrollMarginBottom='34px';floating.button.style.scrollMarginRight='12px';floating.layout();
  assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'306px');
  assert.equal(floating.root.style.getPropertyValue('--cozy-playback-right'),'128px');
  assert.equal(floating.button.hidden,false);
  f.dom.window.visualViewport.height=40;floating.layout();assert.equal(floating.button.hidden,true);
  delete f.dom.window.visualViewport;
});
test('non-overlapping and invisible pane toolbars do not displace the floating button', t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  const bar=f.doc.createElement('div');bar.className='note-reader-mobile-dock';bar.getBoundingClientRect=()=>rect(0,580,200,70);f.doc.body.append(bar);
  floating.configure();assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'42px');
  bar.getBoundingClientRect=()=>rect(0,580,500,70);bar.style.visibility='hidden';floating.configure();
  assert.equal(floating.root.style.getPropertyValue('--cozy-playback-bottom'),'42px');
});
test('a positioned document pane keeps its layout and is not forced to relative positioning', t=>{
  const f=fixture();t.after(f.cleanup);f.first.containerEl.style.position='absolute';
  f.plugin.settings.floatingPauseButton=true;f.active();
  assert.equal(f.first.containerEl.classList.contains('cozy-playback-host'),false);
  assert.equal(f.dom.window.getComputedStyle(f.first.containerEl).position,'absolute');
  assert.ok(f.first.containerEl.querySelector('.cozy-floating-playback'));
});
test('a crowded outline owns its corner until it closes, rather than being covered by the floating control', t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  const outline=f.doc.createElement('section');outline.className='cozy-mini-panel';
  outline.getBoundingClientRect=()=>rect(250,100,240,560);f.first.containerEl.append(outline);
  floating.configure();assert.equal(floating.button.hidden,true);
  outline.hidden=true;floating.layout();assert.equal(floating.button.hidden,false);
});
test('destroy removes geometry listeners and ignores delayed actions', async t=>{
  const f=fixture();t.after(()=>f.dom.window.close());f.plugin.settings.floatingPauseButton=true;f.active();let finish;
  f.adapter.togglePlayback=()=>new Promise(resolve=>{finish=resolve;});const floating=f.controls.floating;
  floating.button.click();f.controls.destroy();finish();await tick();f.dom.window.dispatchEvent(new f.dom.window.Event('resize'));
  assert.equal(floating.timer,undefined);assert.equal(f.doc.querySelector('.cozy-floating-playback'),null);assert.equal(f.controls.buttons.size,0);
});

function pointer(f, target, type, pointerType='mouse') {
  const event=new f.dom.window.MouseEvent(type,{bubbles:type==='pointerdown',button:0});
  Object.defineProperty(event,'pointerType',{value:pointerType});target.dispatchEvent(event);
}

test('stop remains available during buffering and calls the existing stop action synchronously', async t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;
  f.setState({active:true,canToggle:false,canStop:true,session:1});const floating=f.controls.floating;
  assert.equal(floating.button.disabled,true);assert.equal(floating.stopButton.disabled,false);
  assert.equal(floating.stopButton.dataset.icon,'square');assert.equal(floating.stopButton.getAttribute('aria-label'),'Stop reading');
  floating.stopButton.click();assert.equal(f.counts().stops,1);await tick();assert.equal(f.controls.floating,null);
  floating.stopButton.click();await tick();assert.equal(f.counts().stops,1);
});

test('stop can interrupt pending resume and blocks duplicate actions without blocking a replacement session', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const toggles=[],stops=[];
  f.adapter.togglePlayback=()=>new Promise(resolve=>toggles.push(resolve));
  f.adapter.stopPlayback=()=>new Promise(resolve=>stops.push(resolve));
  const pause=f.controls.button(f.first.containerEl),stop=f.controls.button(f.first.containerEl,'stop');
  pause.click();assert.equal(stop.disabled,false);stop.click();const previous=f.controls.stopping;
  assert.equal(stop.disabled,true);stop.click();assert.equal(stops.length,1);
  toggles[0]();await tick();assert.equal(pause.disabled,true);
  f.active(2,true);assert.equal(pause.disabled,false);assert.equal(stop.disabled,false);
  stop.click();const current=f.controls.stopping;assert.notEqual(previous,current);
  stops[0]();await tick();assert.equal(f.controls.stopping,current);assert.equal(stop.disabled,true);
  stops[1]();await tick();assert.equal(stop.disabled,false);
});

test('stop rejects stale pointer intent, excluded states and detached controls', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const stop=f.controls.button(f.first.containerEl,'stop');
  pointer(f,stop,'pointerdown');f.active(2);stop.dispatchEvent(new f.dom.window.MouseEvent('click',{detail:1}));
  await tick();assert.equal(f.counts().stops,0);
  f.setState({active:true,canStop:false,session:2});stop.click();await tick();assert.equal(f.counts().stops,0);
  f.active(3);f.controls.forget(stop);stop.click();await tick();assert.equal(f.counts().stops,0);
  const detached=f.controls.button(f.first.containerEl,'stop');detached.remove();detached.click();await tick();assert.equal(f.counts().stops,0);
});

test('stop failures restore controls and late errors never target a replacement session', async t=>{
  const f=fixture();t.after(f.cleanup);f.active();const stop=f.controls.button(f.first.containerEl,'stop');
  f.adapter.stopPlayback=()=>{throw Error('Public stop failure');};stop.click();await tick();
  assert.equal(f.counts().errors,1);assert.equal(stop.disabled,false);
  let reject;f.adapter.stopPlayback=()=>new Promise((_,failure)=>{reject=failure;});stop.click();f.active(2);
  reject(Error('Old public stop failure'));await tick();assert.equal(f.counts().errors,1);assert.equal(stop.disabled,false);
});

test('desktop stop reveal keeps the pause anchor stable and survives updates during the leave delay', async t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  const anchor=floating.root.style.cssText;assert.equal(floating.root.classList.contains('is-expanded'),false);
  pointer(f,floating.root,'pointerenter');assert.equal(floating.root.classList.contains('is-expanded'),true);
  assert.equal(floating.root.style.cssText,anchor);
  pointer(f,floating.root,'pointerleave');f.controls.update();assert.equal(floating.root.classList.contains('is-expanded'),true);
  pointer(f,floating.root,'pointerenter');await new Promise(r=>setTimeout(r,280));
  assert.equal(floating.root.classList.contains('is-expanded'),true);
  pointer(f,floating.root,'pointerleave');f.controls.update();await new Promise(r=>setTimeout(r,280));
  assert.equal(floating.root.classList.contains('is-expanded'),false);assert.equal(floating.root.style.cssText,anchor);
});

test('mouse click focus does not pin Stop open, while keyboard focus exposes it for Tab navigation', async t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  pointer(f,floating.root,'pointerenter');pointer(f,floating.button,'pointerdown');floating.button.focus();
  pointer(f,floating.root,'pointerleave');await new Promise(r=>setTimeout(r,280));
  assert.equal(floating.root.classList.contains('is-expanded'),false);
  floating.button.blur();floating.button.focus();assert.equal(floating.root.classList.contains('is-expanded'),true);
  floating.stopButton.focus();assert.equal(floating.root.classList.contains('is-expanded'),true);
  f.plugin.settings.floatingStopButton=false;f.controls.update();assert.equal(floating.stopSlot.hidden,true);
  assert.equal(f.doc.activeElement,floating.button);
});

test('touch Stop stays visible and actual mouse input restores hover behavior on a hybrid desktop', async t=>{
  const f=fixture();t.after(f.cleanup);f.dom.window.matchMedia=()=>({matches:false});
  f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  assert.equal(floating.root.classList.contains('is-expanded'),true);assert.equal(floating.root.classList.contains('is-touch-controls'),true);
  pointer(f,floating.root,'pointerleave','touch');await new Promise(r=>setTimeout(r,280));
  assert.equal(floating.root.classList.contains('is-expanded'),true);
  pointer(f,floating.root,'pointerenter','mouse');pointer(f,floating.root,'pointerleave');await new Promise(r=>setTimeout(r,280));
  assert.equal(floating.root.classList.contains('is-expanded'),false);
  pointer(f,floating.button,'pointerdown','touch');assert.equal(floating.root.classList.contains('is-expanded'),true);
});

test('the optional Stop yields to nearby content without moving or hiding Pause', t=>{
  const f=fixture();t.after(f.cleanup);f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  const anchor=floating.root.style.cssText, outline=f.doc.createElement('section');outline.className='cozy-mini-panel';
  outline.getBoundingClientRect=()=>rect(410,520,90,80);f.first.containerEl.append(outline);
  floating.configure();assert.equal(floating.stopSlot.hidden,true);assert.equal(floating.button.hidden,false);
  assert.equal(floating.root.style.cssText,anchor);outline.hidden=true;floating.layout();assert.equal(floating.stopSlot.hidden,false);
  f.plugin.settings.floatingStopButton=false;f.controls.update();assert.equal(floating.stopSlot.hidden,true);
  f.plugin.settings.floatingStopButton=true;f.controls.update();assert.equal(floating.stopSlot.hidden,false);
});

test('destroy cancels Stop reveal timers and forgotten stop listeners cannot affect new sessions', async t=>{
  const f=fixture();t.after(()=>f.dom.window.close());f.plugin.settings.floatingPauseButton=true;f.active();const floating=f.controls.floating;
  pointer(f,floating.root,'pointerenter');pointer(f,floating.root,'pointerleave');assert.ok(floating.hideTimer);
  f.controls.destroy();floating.stopButton.click();await new Promise(r=>setTimeout(r,280));
  assert.equal(f.counts().stops,0);assert.equal(f.controls.buttons.size,0);assert.equal(floating.root.isConnected,false);
});
