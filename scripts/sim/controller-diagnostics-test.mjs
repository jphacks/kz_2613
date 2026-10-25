// 実際のcontrollerとphone-viewを最小DOM・通信・タイマーで実行する。OS入力は送らない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPhoneView} from '../../apps/web-static/scripts/phone-view.js';
import {phoneAdvice} from '../../apps/web-static/app-view.js';

class Element {
  constructor(id='') {
    this.id=id;this.handlers=new Map();this.dataset={};this.open=false;this.textContent='';
    this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};
  }
  addEventListener(name,fn){const list=this.handlers.get(name)||[];list.push(fn);this.handlers.set(name,list);}
  fire(name,extra={}){for(const fn of this.handlers.get(name)||[])fn({pointerId:1,timeStamp:0,preventDefault(){},...extra});}
  setPointerCapture(){} replaceChildren(){} append(){}
  showModal(){this.open=true;} close(){this.open=false;}
}

const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const attack=el('attack');attack.dataset.ctl='ATTACK';
const intervals=[],sent=[],portrait={matches:true,addEventListener(){}};
const document={
  hidden:false,body:{dataset:{}},documentElement:{style:{setProperty(){}}},
  getElementById:el,querySelector:()=>new Element(),querySelectorAll:s=>s==='[data-ctl]'?[attack]:[],
  addEventListener(){},createElement:()=>new Element(),createTextNode:text=>({textContent:text}),
};
class Socket {
  constructor(){this.readyState=1;Socket.last=this;}
  send(raw){sent.push({message:JSON.parse(raw),diagnosticsOpen:el('phoneDiagnostics').open});}
  close(){}
}
let cooperative;
const previousDocument=globalThis.document;
globalThis.document=document;
try {
  const context={
    document,console,Map,Set,Date,Math,JSON,Number,performance:{now:()=>1000},
    window:{addEventListener(){}},navigator:{userAgent:'試験用'},location:{host:'review.invalid'},
    localStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=> 'controller-test'},
    matchMedia:()=>portrait,WebSocket:Socket,
    setInterval:(fn,ms)=>{const timer={fn,ms};intervals.push(timer);return timer;},clearInterval(){},
    setTimeout(){},alert(){},confirm:()=>true,
    createPhoneView,phoneAdvice,bindTouchpad:()=>({reset(){}}),
    bindCooperativeInput:options=>{cooperative=options;return {release(){},resetEpoch(){}};},
    myActions:()=>null,recordInputMetric(){},inputMetrics:{summary:()=>({})},
    createFastChannel:()=>({isOpen:()=>false,start(){},close(){},signal(){},send:()=>false}),
  };
  const source=fs.readFileSync(new URL('../../apps/web-static/scripts/controller.js',import.meta.url),'utf8');
  vm.runInNewContext(source.replace(/^import .*$/gm,''),context);
  Socket.last.onmessage({data:JSON.stringify({type:'game',game:{phase:'coop',epoch:7,connected:['P1','P2','P3']}})});
  assert.equal(cooperative.isOpen(),true);
  attack.fire('pointerdown');
  el('phoneSettingsBtn').fire('click');
  assert(el('phoneDiagnostics').open);
  assert.deepEqual(sent.map(x=>x.message.type),['input','input','release_inputs']);
  assert.equal(sent[0].message.state,'down');assert.equal(sent[1].message.state,'up');
  assert.equal(sent[2].message.epoch,7);
  assert.equal(sent[2].diagnosticsOpen,false,'診断を開く前にサーバーへ停止を要求する');
  assert.equal(cooperative.isOpen(),false,'診断中は視点を送らない');
  const before=sent.length;attack.fire('pointerdown',{pointerId:2});
  assert.equal(sent.length,before,'診断中の操作押下は送らない');
  el('burst').fire('click');
  const burst=intervals.find(t=>t.ms===50);
  for(let i=0;i<200;i++)burst.fn();
  const packets=sent.map(x=>x.message).filter(m=>m.burst);
  assert.equal(packets.length,200);
  packets.forEach((packet,i)=>{assert.equal(packet.state,i%2?'up':'down');assert.equal(packet.button,'BURST');assert.equal(packet.epoch,7);});
  for(let i=1;i<packets.length;i++)assert.equal(packets[i].iseq,packets[i-1].iseq+1);
  console.log('合格: 診断前のサーバー停止要求、診断中の操作・視点抑止、通信テスト200件の押下・解放と連番');
} finally {
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
}
