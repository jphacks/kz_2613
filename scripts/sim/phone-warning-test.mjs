import assert from 'node:assert/strict';
import {inputWarnText} from '../../apps/web/src/shared/model/phone.ts';
import {decodeServerMessage} from '../../apps/web/src/shared/transport/protocol.ts';
const game={phase:'coop',connected:['P1','P2','P3'],inputTarget:false,mouseBlocked:false};
assert.equal(inputWarnText({isHost:true,game,name:'Minecraft',notice:''}),'','通常時は案内を出さない');
const blocked=inputWarnText({isHost:false,game:{...game,mouseBlocked:true},name:'Minecraft',notice:'ホスト向けの注意'});
assert.match(blocked,/メニューなどを表示中/);assert.match(blocked,/Esc/);assert.doesNotMatch(blocked,/ホスト向けの注意/,'参加者にはホスト向けの注意を出さない');
const host=inputWarnText({isHost:true,game:{...game,inputTarget:true,mouseBlocked:true},name:'Minecraft',notice:'注意'});
assert.match(host,/前面に戻すまで/);assert.match(host,/マウス操作/);assert.match(host,/注意$/,'前面の案内・マウスの案内・ホスト向けの順');
// 通信の境界: mouseBlocked は真偽値だけを受け付ける
const wire=value=>decodeServerMessage(JSON.stringify({type:'game',game:{phase:'lobby',epoch:1,connected:['P1'],mouseBlocked:value}}));
assert.ok(wire(true));assert.equal(wire('yes'),null,'真偽値でない mouseBlocked は拒否する');
console.log('合格: マウス操作を止めている間の案内（参加者・ホスト別）と、mouseBlocked の境界検証');
