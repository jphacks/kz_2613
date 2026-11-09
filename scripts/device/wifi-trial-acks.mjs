import assert from 'node:assert/strict';
import {summarize} from './android-performance.mjs';
// 新しいraw窓の送信iseqだけを数える。通常診断の累計や遅着warmup ACKを混ぜない。
export function trialAcks(raw) {
  const sends=raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
  const ids=new Set(sends.map(s=>s.iseq));assert.equal(ids.size,sends.length,'論理送信iseqの重複');
  const ack=new Map();let excludedAcks=0,duplicateAcks=0;
  for(const value of raw.acks){
    if(!ids.has(value.iseq)){excludedAcks++;continue;}
    if(ack.has(value.iseq)){duplicateAcks++;continue;}
    ack.set(value.iseq,value);
  }
  const times=sends.filter(s=>ack.has(s.iseq)).map(s=>ack.get(s.iseq).at-s.at);
  assert(times.every(t=>t>=0),'ACKと送信の端末内時計の対応が不正');
  const rows=sends.filter(s=>ack.has(s.iseq)).map(s=>({iseq:s.iseq,via:ack.get(s.iseq).via,rttMs:ack.get(s.iseq).at-s.at}));
  return {ackRttMs:summarize(times),unacked:sends.length-ack.size,firstVia:[...ack.values()].reduce((counts,value)=>(counts[value.via]=(counts[value.via]??0)+1,counts),{}),excludedAcks,duplicateAcks,rows};
}
