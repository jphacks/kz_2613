// 実製品TSの診断前解放・入力停止・通信テストをOS入力なしで確認する。
import assert from 'node:assert/strict';
import {controllerHarness} from './fixtures/phone-harness.mjs';
const h=controllerHarness();await h.ready();
h.control('act:attack').fire('pointerdown');
assert.equal(h.inputs().length,1,'診断前は協力入力が有効');
let openedAtSend;
const socket=h.sockets[0],send=socket.send.bind(socket);
socket.send=raw=>{if(JSON.parse(raw).type==='release_inputs')openedAtSend=h.el('phoneDiagnostics').open;send(raw);};
h.el('phoneSettingsBtn').fire('click');
assert(h.el('phoneDiagnostics').open);
const sent=h.messages().filter(m=>['input','release_inputs'].includes(m.type));
assert.deepEqual(sent.map(m=>m.type),['input','input','release_inputs']);
assert.equal(sent[0].state,'down');assert.equal(sent[1].state,'up');
assert.equal(sent[2].epoch,7);assert.equal(openedAtSend,false,'診断を開く前にサーバーへ停止を要求する');
const before=h.inputs().length;h.control('act:jump').fire('pointerdown',{pointerId:2});
h.el('pad').fire('pointerdown');h.el('pad').fire('pointermove',{clientX:150});h.advance(40);
assert.equal(h.inputs().length,before,'診断中の操作押下は送らない');
assert(!h.messages().some(m=>m.type==='look'),'診断中は視点を送らない');
h.el('burst').fire('click');
for(let i=0;i<200;i++){socket.receive({type:'pong',t:1000});h.advance(50);}
const packets=h.messages().filter(m=>m.burst);
assert.equal(packets.length,200);
packets.forEach((packet,i)=>{assert.equal(packet.state,i%2?'up':'down');assert.equal(packet.button,'BURST');assert.equal(packet.epoch,7);});
for(let i=1;i<packets.length;i++)assert.equal(packets[i].iseq,packets[i-1].iseq+1);
h.dispose();
console.log('合格: 診断前のサーバー停止要求、診断中の操作・視点抑止、通信テスト200件の押下・解放と連番');
