import assert from 'node:assert/strict';
import {createMonitor} from '../../apps/web/src/shared/transport/monitor.ts';
const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
const timers=new Map();let id=0;
globalThis.setTimeout=(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;};
globalThis.clearTimeout=id=>timers.delete(id);
const sockets=[],received=[],connections=[];
const socket=()=>{const s={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw));},close(){this.closed=true;this.onclose?.();}};sockets.push(s);return s;};
try{
 const monitor=createMonitor({page:'overlay',socket,onMessage:m=>received.push(m),onConnection:c=>connections.push(c)});
 const first=sockets[0];first.onopen();
 assert.deepEqual(first.sent,[{type:'monitor',page:'overlay'}],'観客表示は登録だけ送り操作を送らない');
 for(const data of ['不正JSON','null','[]','{"type":"state"}',{type:'state'}])first.onmessage({data});
 assert.equal(received.length,0);
 first.onmessage({data:JSON.stringify({type:'game',game:{phase:'lobby',epoch:0,connected:[],profile:null}})});
 assert.equal(received.length,1);first.onclose();
 assert.deepEqual(connections,[true,false]);assert.equal([...timers.values()][0].ms,1000);
 const staleMessage=first.onmessage,staleClose=first.onclose;
 const timer=[...timers][0];timers.delete(timer[0]);timer[1].fn();
 staleMessage({data:'{"type":"future"}'});staleClose();assert.equal(timers.size,0);assert.equal(received.length,1);
 const second=sockets[1];second.onopen();second.onclose();assert.equal(timers.size,1);
 monitor.dispose();monitor.dispose();assert.equal(timers.size,0);
 staleClose();assert.equal(timers.size,0);assert.equal(sockets.length,2);
 assert.deepEqual(second.sent,[{type:'monitor',page:'overlay'}]);
 const active=createMonitor({page:'overlay',socket,onMessage:m=>received.push(m)});const third=sockets[2];const staleOpen=third.onopen;
 active.dispose();staleOpen();assert(third.closed);assert.equal(third.sent.length,0);assert.equal(third.onmessage,null);
 console.log('合格: monitorの登録専用送信・不正受信拒否・1秒再接続・旧socket無効化・冪等破棄');
}finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
