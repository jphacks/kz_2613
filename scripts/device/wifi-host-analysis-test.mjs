import assert from 'node:assert/strict';
import {analyzeHostInput} from './wifi-host-analysis.mjs';
const base={slot:'P1',epoch:2,iseq:3};
const report={performance:{raw:{sends:[{type:'input',via:'ws',epoch:2,iseq:3,at:9000}]}},hostInputTrace:{limitReached:false,events:[
  {stage:'received',us:1100,data:{...base,via:'rtc',receivedUs:1000}},
  {stage:'received',us:1300,data:{...base,via:'ws',receivedUs:1200}},
  {stage:'buffer',us:1400,data:{...base,next:2}},
  {stage:'accepted',us:4000,data:{...base,via:'rtc',out:'KEY_SPACE',state:'down',stale:false}},
  {stage:'output',us:12000,data:{slot:'P1',out:'KEY_SPACE',state:'down',startedUs:11000}},
]}};
const a=analyzeHostInput(report);
assert.equal(a.timing.receiveToAcceptMs.p95,3);
assert.equal(a.timing.bufferToAcceptMs.p95,2.6);
assert.equal(a.timing.acceptToDryOutputMs.p95,8);
assert.equal(a.timing.adapterCallMs.p95,1);
assert.equal(a.orderGapCount,1);assert.equal(a.outputMatched,1);
// Androidの時計の原点を変えてもhost内の遅延は変化しない。
const shifted=structuredClone(report);shifted.performance.raw.sends[0].at+=1e9;
assert.deepEqual(analyzeHostInput(shifted).timing,a.timing);
const duplicate=structuredClone(report);duplicate.hostInputTrace.events.push(report.hostInputTrace.events[3]);assert.throws(()=>analyzeHostInput(duplicate),/不一致/);
const wrongEpoch=structuredClone(report);wrongEpoch.hostInputTrace.events[3].data.epoch=3;assert.throws(()=>analyzeHostInput(wrongEpoch),/不一致/);
const capped=structuredClone(report);capped.hostInputTrace.limitReached=true;assert.throws(()=>analyzeHostInput(capped),/上限/);
console.log('合格: host内の受信/順序待ち/出力時刻の対応、未同期時計の原点不変、重複/epoch混入/上限の拒否');
