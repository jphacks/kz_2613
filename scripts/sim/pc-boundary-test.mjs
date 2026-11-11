import assert from 'node:assert/strict';
import {decodePcMessage,decodeHotspotResult} from '../../apps/web/src/shared/transport/pc-messages.ts';
const game={phase:'lobby',epoch:0,connected:[],profile:null,launch:null};
const state={type:'state',game,inject:{mode:'off',active:false,emergencyHotkeyError:null},slots:[{name:'P1',assigned:false}]};
const decode=value=>decodePcMessage(JSON.stringify(value));
assert.deepEqual(decode(state),state,'Rustの空き枠とnullable状態を受理する');
assert.deepEqual(decode({...state,slots:[{name:'P1',connected:true,clientStats:null}]}).game,game);
assert.deepEqual(decode({...state,game:{...game,lineupDisconnected:['P2','P3']}}).game.lineupDisconnected,['P2','P3']);
const warning = {at:1000,stalls:3,maxStallMs:400};
assert.deepEqual(decode({...state,slots:[{name:'P1',net:{stalls:0,lastWarning:warning}}]}).slots[0].net.lastWarning,warning);
assert.equal(decode({...state,slots:[{name:'P1',net:{stalls:0,lastWarning:{...warning,at:'invalid'}}}]}),null);
for(const value of [null,[],{...state,game:{...game,lineupDisconnected:['P8']}},{type:'state'},{...state,game:{...game,epoch:'0'}},{...state,inject:{mode:'on',active:'yes'}},
  {...state,slots:[{name:'P8',connected:true}]},{...state,games:[{id:'game',source:'manual',name:{}}]},
  {type:'remote',epoch:0,route:'app',kind:'move',dx:'1',dy:0},{type:'remote',epoch:0,route:'app',control:'ENTER',state:'future'},
  {type:'key_result',ok:'yes'},{type:'manual_result',message:[]}])assert.equal(decode(value),null);
for(const value of [{type:'remote',epoch:0,route:'app',kind:'move',dx:1,dy:2},{type:'remote',epoch:0,route:'app',control:'ENTER',state:'down'},{type:'manual_result',message:'保存失敗'}])assert.deepEqual(decode(value),value);
assert.deepEqual(decode({type:'future',payload:{}}),{type:'unknown'});
assert.equal(decodePcMessage({type:'state'}),null);
assert.equal(decodeHotspotResult({ok:true,error:{}}),null);
assert.equal(decodeHotspotResult({ok:'yes'}),null);
assert.deepEqual(decodeHotspotResult({ok:false,error:'拒否'}),{ok:false,error:'拒否'});
console.log('合格: PC通知のRust互換・不正snapshotとremote拒否・未知type隔離');
