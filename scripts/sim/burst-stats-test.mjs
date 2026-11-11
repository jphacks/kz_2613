import assert from 'node:assert/strict';
import {createBurstRecorder,formatBurstResult,percentile,summarizeBurst} from '../../apps/web/src/phone/burst-stats.ts';
// 手計算: 1..100ms の100件。最近順位法で p50=50, p95=95, p99=99, 最大=100, 平均=50.5→51(丸め)
const hundred=Array.from({length:100},(_,i)=>i+1);
const s=summarizeBurst(hundred);
assert.deepEqual(s,{n:100,avg:51,p50:50,p95:95,p99:99,max:100},'100件の手計算と一致する');
assert.equal(percentile([7],0.99),7,'1件でも範囲外にならない');assert.equal(summarizeBurst([]),null,'空は null');
assert.equal(summarizeBurst([30,10,20]).p50,20,'並べ替えてから算出する');
// 連続3回のテスト: 各回の最大が前回を引き継がない
const maxes=[];
for(const spike of [682,90,40]){
  const run=createBurstRecorder();
  for(let i=1;i<=200;i++){run.track(i);run.ack(i,i===100?spike:20,i%2?'rtc':'ws');}
  const r=run.summary();maxes.push(r.all.max);
  assert.equal(r.sent,200);assert.equal(r.unacked,0);assert.equal(r.all.n,200);assert.equal(r.rtc.n+r.ws.n,200,'経路別の件数の合計が全体に一致');
}
assert.deepEqual(maxes,[682,90,40],'各回の最大は前回の値を引き継がない');
// このテストの入力以外・二重のACKは数えない。未ACKは数える
const run=createBurstRecorder();run.track(1);run.track(2);run.track(3);
assert.equal(run.ack(99,5,'ws'),false,'別の入力のACKは無視');assert.equal(run.ack(1,10,'rtc'),true);assert.equal(run.ack(1,500,'rtc'),false,'二重ACKは一度だけ');
const r=run.summary();assert.equal(r.unacked,2);assert.equal(r.all.n,1);assert.equal(r.all.max,10);assert.equal(r.ws,null);
const text=formatBurstResult(r);assert.match(text,/p50 10 p95 10 p99 10/);assert.match(text,/未ACK 2/);assert.match(text,/WS なし/);
console.log('合格: 通信テストを1回ごとに分離、p50/p95/p99が手計算と一致、他入力・二重ACKの除外、経路別集計');
