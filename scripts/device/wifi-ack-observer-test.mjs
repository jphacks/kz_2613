import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ackPhases,earlyAckSource} from './wifi-ack-observer.mjs';
const raw={sends:[{type:'input',via:'ws',iseq:9,at:10},{type:'input',via:'rtc',iseq:9,at:10.1}],acks:[{iseq:9,at:18,via:'rtc'}]};
const before=[{iseq:8,at:900},{iseq:9,at:15,via:'rtc'}];
const a=ackPhases(raw,before);assert.equal(a.n,1);assert.equal(a.earlyRttMs.p95,5);assert.equal(a.lateRttMs.p95,8);assert.equal(a.dispatchMs.p95,3);
assert.throws(()=>ackPhases(raw,[]),/対応がない/);
assert.throws(()=>ackPhases(raw,[{iseq:9,at:19}]),/順序/);
class Socket {
  constructor(url){this.url=url;this.listeners=[];}
  addEventListener(type,fn){if(type==='message')this.listeners.push(fn);}
  set onmessage(fn){this.addEventListener('message',fn);}
  receive(data){for(const fn of this.listeners)fn({data});}
}
let tick=0;
const context={window:{WebSocket:Socket},performance:{now:()=>++tick}};
vm.runInNewContext(earlyAckSource,context);
const socket=new context.window.WebSocket('ws://192.168.1.2:8080/ws');
socket.onmessage=()=>{assert.equal(context.window.__wifiEarlyAcks.length,1);tick+=3;};
socket.addEventListener('message',()=>assert(tick>context.window.__wifiEarlyAcks[0].at));
socket.receive(JSON.stringify({type:'ack',iseq:9,via:'ws'}));
assert.equal(context.window.__wifiEarlyAcks[0].iseq,9);
assert(socket instanceof Socket,'native socketのprototypeを保つ');
const other=new context.window.WebSocket('ws://192.168.1.2:8080/other');other.receive('{"type":"ack","iseq":10}');assert.equal(context.window.__wifiEarlyAcks.length,1);
console.log('合格: ACKの製品処理前/後の観測を分離し、warmupと送信コピーを除外');
