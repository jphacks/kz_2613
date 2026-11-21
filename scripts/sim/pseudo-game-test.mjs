import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pseudoGameHarness,replayPseudoGame} from './fixtures/pseudo-game-harness.mjs';
import {decodePcMessage} from '../../apps/web/src/shared/transport/pc-messages.ts';
// legacy-js-last-with-reactの/gameを移植前に同じ時計・12系列で再生した固定trace。
// 旧JSのコピー/読み込みは残さず、観測結果を変換後の製品TSと照合する。
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/pseudo-game-baseline.json',import.meta.url),'utf8'));
const h=pseudoGameHarness();
assert.deepEqual(JSON.parse(JSON.stringify(replayPseudoGame(h))),baseline);
const inject={type:'inject',entry:{out:'KEY_W',state:'down',slot:'P1',ok:true,label:'W'}};
const look={type:'look',entry:{dx:2,dy:-1,slot:'P2'}};
for(const value of [inject,look,{...look,entry:{...look.entry,dx:0,dy:0}}])assert.deepEqual(decodePcMessage(JSON.stringify(value)),value);
const invalid=[{type:'inject'},{type:'look'},
  ...[null,[],{...inject.entry,state:'future'},{...inject.entry,ok:1},{...inject.entry,label:{}},{...inject.entry,out:null},{...inject.entry,slot:3}].map(entry=>({type:'inject',entry})),
  ...[null,[],{...look.entry,dx:'1'},{...look.entry,dy:null},{...look.entry,slot:[]}].map(entry=>({type:'look',entry}))];
const before=JSON.parse(JSON.stringify(h.snapshot()));
for(const value of invalid){assert.equal(decodePcMessage(JSON.stringify(value)),null);assert.doesNotThrow(()=>h.sockets[0].receive(value));}
assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot())),before,'不正通知は照合結果を変えない');
const socket=h.sockets[0],staleMessage=socket.onmessage,staleClose=socket.onclose;
h.dispose();h.dispose();assert.equal(h.timerCount(),0);assert.equal(h.frameCount(),0);
assert.equal(socket.readyState,3);
const sent=socket.sent.length;
staleMessage({data:JSON.stringify(inject)});staleClose();
h.window.fire('keydown',{code:'KeyW'});h.window.fire('wheel',{deltaY:1});h.document.fire('visibilitychange');h.el('resetStats').fire('click');h.advance(5000);h.frame();
assert.equal(socket.sent.length,sent,'破棄後は入力照合やfocus通知を再開しない');
assert.deepEqual(JSON.parse(JSON.stringify(h.snapshot())),before,'破棄後の旧イベント・通知は描画を変えない');
assert.equal(h.sockets.length,1);assert.equal(h.timerCount(),0);assert.equal(h.frameCount(),0);
const reconnecting=pseudoGameHarness();reconnecting.sockets[0].close();assert(reconnecting.timerCount()>0);
reconnecting.dispose();reconnecting.advance(5000);assert.equal(reconnecting.sockets.length,1);assert.equal(reconnecting.timerCount(),0);
console.log('合格: 疑似ゲーム12系列の変換前traceと一致・不正通知拒否・旧イベント無効化・再接続/タイマー/フレーム破棄');
