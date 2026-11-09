import assert from 'node:assert/strict';
import {trialAcks} from './wifi-trial-acks.mjs';
function trial(values){return {sends:values.map((v,i)=>({type:'input',via:'ws',iseq:i+1,at:100})),acks:values.map((v,i)=>({iseq:i+1,at:100+v,via:i%2?'rtc':'ws'}))};}
const first=trial(Array.from({length:100},(_,i)=>i+1));
first.acks.push({iseq:999,at:10000,via:'rtc'}); // 他の試行/warmupの遅着
first.acks.push({iseq:1,at:10000,via:'rtc'}); // 同じ入力の二重ACK
const a=trialAcks(first);
assert.deepEqual(a.ackRttMs,{n:100,p50:50,p95:95,p99:99,mean:50.5,max:100});
assert.deepEqual(a.firstVia,{ws:50,rtc:50});assert.equal(a.excludedAcks,1);assert.equal(a.duplicateAcks,1);
for(let i=0;i<3;i++){const b=trialAcks(trial([2,3]));assert.equal(b.ackRttMs.max,3);assert.equal(b.ackRttMs.n,2);assert.equal(b.unacked,0);}
const missing=trial([2,3]);missing.acks.pop();assert.equal(trialAcks(missing).unacked,1);
console.log('合格: 試行別ACK分離、p50/p95/p99、先着件数、warmup/重複除外、連続試行の最大値独立（#259）');
