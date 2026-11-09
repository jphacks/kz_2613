// 両端の未同期時計を直接減算しない。host内はInstant、端末内はperformance.now。
import assert from 'node:assert/strict';
import {summarize} from './android-performance.mjs';
export function analyzeHostInput(report) {
  const trace=report.hostInputTrace;assert(trace&&!trace.limitReached,'入力別host traceが必要（上限到達不可）');
  const sends=report.performance.raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
  const events=trace.events;
  const epoch=sends[0].epoch??events.find(e=>e.stage==='accepted'&&e.data.slot==='P1'&&e.data.iseq===sends[0].iseq)?.data.epoch;
  const ids=new Set(sends.map(s=>s.iseq));
  const selected=e=>e.data.slot==='P1'&&e.data.epoch===epoch&&ids.has(e.data.iseq);
  const accepted=events.filter(e=>e.stage==='accepted'&&selected(e));
  assert.equal(accepted.length,sends.length,'host受理数が送信数と不一致');
  assert.equal(new Set(accepted.map(e=>e.data.iseq)).size,sends.length,'host重複受理');
  const emitted=events.filter(e=>e.stage==='output'&&e.data.slot==='P1');
  const used=new Set(),rows=[];
  for(const a of accepted){
    assert(!a.data.stale,'主比較に旧epoch受理が混在');
    const receives=events.filter(e=>e.stage==='received'&&selected(e)&&e.data.iseq===a.data.iseq);
    const receipt=Math.min(...receives.map(e=>e.data.receivedUs).filter(Number.isFinite));
    assert(Number.isFinite(receipt)&&receipt<=a.us,'受信→受理の単調時計対応がない');
    const buffered=events.find(e=>e.stage==='buffer'&&selected(e)&&e.data.iseq===a.data.iseq);
    assert(buffered&&buffered.us<=a.us);
    const output=emitted.find(e=>!used.has(e)&&e.data.out===a.data.out&&e.data.state===a.data.state&&e.data.startedUs>=a.us);
    if(output)used.add(output);
    rows.push({epoch,iseq:a.data.iseq,via:a.data.via,out:a.data.out,state:a.data.state,receivedUs:receipt,acceptedUs:a.us,bufferedUs:buffered.us,orderGap:buffered.data.next<a.data.iseq,
      receiveToAcceptMs:(a.us-receipt)/1000,bufferToAcceptMs:(a.us-buffered.us)/1000,
      outputStartedUs:output?.data.startedUs,outputFinishedUs:output?.us,acceptToDryOutputMs:output?(output.us-a.us)/1000:undefined,adapterCallMs:output?(output.us-output.data.startedUs)/1000:undefined});
  }
  const timing={};
  for(const key of ['receiveToAcceptMs','bufferToAcceptMs','acceptToDryOutputMs','adapterCallMs'])timing[key]=summarize(rows.map(r=>r[key]));
  const arrival={};
  for(const via of ['ws','rtc']){
    const receipts=events.filter(e=>e.stage==='received'&&selected(e)&&e.data.via===via&&Number.isFinite(e.data.receivedUs));
    const ordered=[...receipts].sort((a,b)=>a.data.receivedUs-b.data.receivedUs);
    const gaps=ordered.slice(1).map((e,i)=>(e.data.receivedUs-ordered[i].data.receivedUs)/1000);
    const matched=sends.map(s=>({send:s.at,receive:receipts.find(e=>e.data.iseq===s.iseq)?.data.receivedUs})).filter(r=>Number.isFinite(r.receive));
    const variation=matched.slice(1).map((r,i)=>(r.receive-matched[i].receive)/1000-(r.send-matched[i].send));
    arrival[via]={received:receipts.length,arrivalIntervalMs:summarize(gaps),intervalVariationMs:summarize(variation),absoluteIntervalVariationMs:summarize(variation.map(Math.abs)),note:'間隔差の変動。絶対時計差/片道遅延ではない。入力間隔には意図的な休止を含む。'};
  }
  const look={};
  for(const via of ['ws','rtc']){
    const receipts=events.filter(e=>e.stage==='received'&&e.data.slot==='P1'&&e.data.type==='look'&&e.data.via===via&&Number.isFinite(e.data.receivedUs)).sort((a,b)=>a.data.receivedUs-b.data.receivedUs);
    const gaps=receipts.slice(1).map((e,i)=>(e.data.receivedUs-receipts[i].data.receivedUs)/1000);
    look[via]={received:receipts.length,arrivalIntervalMs:summarize(gaps),gaps200ms:gaps.filter(g=>g>=200).length,maxGapMs:gaps.length?Math.max(...gaps):null};
  }
  return {epoch,logicalInputs:sends.length,accepted:accepted.length,missing:0,duplicateAccepted:0,outputMatched:used.size,outputUnmatched:rows.filter(r=>r.outputFinishedUs===undefined).length,orderGapCount:rows.filter(r=>r.orderGap).length,timing,arrival,look,rows};
}
