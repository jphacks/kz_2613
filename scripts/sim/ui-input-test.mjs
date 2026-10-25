// DOMの入力境界・キャンセル・RTC形式を、OS入力なしで検証する。
import assert from 'node:assert/strict';
import {bindTouchpad} from '../../apps/web-static/scripts/touchpad.js';
import {bindCooperativeInput} from '../../apps/web-static/scripts/cooperative-input.js';
import {createFastChannel} from '../../apps/web-static/scripts/transport.js';
import {createVirtualCursor} from '../../apps/web-static/scripts/virtual-cursor.js';
const intervals = [];
const originalInterval = globalThis.setInterval;
globalThis.setInterval = (fn,ms) => { intervals.push({fn,ms}); return intervals.length; };
class Element {
  constructor() { this.handlers = new Map(); this.style = {}; this.value = '2'; this.classList = {add(){},remove(){},toggle(){}}; }
  addEventListener(name,fn) { const list = this.handlers.get(name)||[]; list.push(fn);this.handlers.set(name,list); }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,width:200,height:200}; }
  fire(name,extra={}) { for (const fn of this.handlers.get(name)||[]) fn({type:name,pointerId:1,clientX:100,clientY:100,timeStamp:performance.now(),preventDefault(){},...extra}); }
}
let passed=0;
async function test(name,fn) { await fn();passed++;console.log(`合格: ${name}`); }
try {
  await test('タッチパッド: キャンセル・無効化で未送信移動を捨て、解放を1回通知する',()=>{
    const pad = new Element(), messages=[]; let enabled=true,taps=0;
    bindTouchpad(pad,{enabled:()=>enabled,send:m=>messages.push(m),tap:()=>taps++});
    const tick=intervals.at(-1).fn;
    pad.fire('pointerdown');pad.fire('pointermove',{clientX:150});pad.fire('pointercancel');tick();
    assert.deepEqual(messages.map(m=>m.kind),['release']);
    pad.fire('pointerdown');pad.fire('pointerup');assert.equal(taps,1);
    pad.fire('pointerdown');pad.fire('pointermove',{clientX:160}); enabled=false;tick();enabled=true;tick();
    assert.equal(messages.length,1);
  });
  await test('協力入力: 視点30Hz、epoch変更・キャンセルで累積値と未送信移動を初期化する',()=>{
    const elements=Object.fromEntries(['stick','pad','sens','sensVal'].map(id=>[id,new Element()]));
    globalThis.document={getElementById:id=>elements[id]};globalThis.localStorage={getItem:()=>null,setItem(){}};
    let game={phase:'coop',epoch:8},cancelled=0;const packets=[],down=[],up=[];
    const input=bindCooperativeInput({getGame:()=>game,getRole:()=> 'P2',isOpen:()=>true,ctlDown:c=>down.push(c),ctlUp:c=>up.push(c),sendLook:m=>packets.push(m),onCancel:()=>cancelled++});
    const timer=intervals.at(-1);assert.equal(timer.ms,33);
    elements.pad.fire('pointerdown');elements.pad.fire('pointermove',{clientX:110});timer.fn();
    assert.equal(packets[0].cx,20);assert.equal(packets[0].epoch,8);
    elements.pad.fire('pointermove',{clientX:120});elements.pad.fire('pointercancel');timer.fn();assert.equal(packets.length,1);assert.equal(cancelled,1);
    game={phase:'coop',epoch:9}; input.resetEpoch();
    elements.pad.fire('pointerdown');elements.pad.fire('pointermove',{clientX:105});timer.fn();
    assert.equal(packets[1].cx,10);assert.equal(packets[1].lseq,1);assert.equal(packets[1].epoch,9);
    elements.stick.fire('pointerdown',{clientY:0});assert(down.includes('FWD'));elements.stick.fire('lostpointercapture');assert(up.includes('FWD'));assert.equal(cancelled,2);
  });
  await test('WebRTC: 再送なし・STUNなしを維持し、文字列／バイナリ／Blobと旧接続を安全に扱う',async()=>{
    const peers=[],signaled=[],rtts=[];
    class Peer {
      constructor(config){this.config=config;peers.push(this);}
      createDataChannel(name,options){this.name=name;this.options=options;this.dc={readyState:'open',send(){},close(){}};return this.dc;}
      async createOffer(){return {type:'offer',sdp:'試験用'};}
      async setLocalDescription(description){this.localDescription=description;}
      close(){}
    }
    globalThis.window={RTCPeerConnection:Peer};globalThis.RTCPeerConnection=Peer;
    const fast=createFastChannel({signal:m=>signaled.push(m),enabled:()=>true,getPhase:()=> 'coop',onRtt:r=>rtts.push(r),onPath(){}});
    await fast.start();const first=peers[0];assert.deepEqual(first.config,{iceServers:[]});assert.deepEqual(first.options,{ordered:false,maxRetransmits:0});
    const response=JSON.stringify({type:'kpong',t:performance.now()});
    await first.dc.onmessage({data:response});await first.dc.onmessage({data:new TextEncoder().encode(response).buffer});await first.dc.onmessage({data:new Blob([response])});
    assert.equal(rtts.length,3);await first.dc.onmessage({data:'不正JSON'});assert.equal(rtts.length,3);
    await fast.start();const count=signaled.length;first.onicecandidate({candidate:{candidate:'古い候補',sdpMid:'0'}});await first.dc.onmessage({data:response});
    assert.equal(signaled.length,count);assert.equal(rtts.length,3);fast.close();assert.equal(fast.send({type:'input'}),false);
  });
  await test('PC仮想カーソル: 無効ボタンは実行せず、クリックと画面移動・スクロールを区別する',()=>{
    let clicks=0,scrolled=0;const button={disabled:true,click(){clicks++;}};
    globalThis.innerWidth=1280;globalThis.innerHeight=720;
    const page={scrollBy({top}){scrolled+=top;}};
    globalThis.document={createElement:()=>({style:{},setAttribute(){}}),body:{append(){}},documentElement:page,elementFromPoint:()=>({closest:()=>button,parentElement:page,scrollHeight:0,clientHeight:0})};
    const cursor=createVirtualCursor();
    assert(cursor.handle({kind:'move',dx:20,dy:30}));
    cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicks,0);
    button.disabled=false;cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicks,1);
    cursor.handle({control:'REMOTE_RIGHT',state:'down'});assert.equal(clicks,1);
    cursor.handle({control:'REMOTE_WHEEL_DOWN',state:'down'});assert.equal(scrolled,120);
    assert.equal(cursor.handle({control:'RIGHT',state:'down'}),false);
  });
  console.log(`${passed}/${passed} 合格（UI入力、OS入力なし）`);
} finally { globalThis.setInterval=originalInterval; }
