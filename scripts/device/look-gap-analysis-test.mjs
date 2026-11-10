// 視点受信の空白の分類 (#275) を合成データで確かめる。実機の合格の根拠には使わない。
import assert from 'node:assert/strict';
import {analyzeLookGaps, classifyGap} from './look-gap-analysis.mjs';

// 端末は 33ms ごとに送る。ホスト時計は端末と 1,000,000ms ずれ、通常は 5ms で届く
function report(arrive) {
  const times = Array.from({length: 40}, (_, i) => 1000 + i * 33);
  const events = [];
  times.forEach((t, i) => {
    const at = arrive(i + 1, t);
    if (at != null) events.push({stage: 'received', data: {type: 'look', epoch: 3, lseq: i + 1, via: 'rtc', receivedUs: (at + 1_000_000) * 1000}});
  });
  return {condition: 'test', trial: '1', wsOnly: false, lookPerformance: {times}, hostInputTrace: {events}};
}

// lseq 10〜17 が 250ms 滞留してまとめて届く: 端末は送っていた (遅着)
const held = analyzeLookGaps(report((l, t) => l >= 10 && l <= 17 ? 1000 + 9 * 33 + 5 + 250 + l * 0.1 : t + 5));
assert.equal(held.gaps, 1); assert.equal(held.detail[0].kind, 'delayed');
assert(held.detail[0].burst >= 7, '空白後のまとめ着を数える'); assert.equal(held.detail[0].lostInGap, 0);
assert(held.detail[0].sendSpanMs < 50, '端末の送信間隔は空いていない');

// lseq 10〜17 が届かない: 欠落 (次のパケットは遅れていない)
const lost = analyzeLookGaps(report((l, t) => l >= 10 && l <= 17 ? null : t + 5));
assert.equal(lost.detail[0].kind, 'lost'); assert.equal(lost.lost, 8);

// 端末が 300ms 送っていない (送信時刻自体が空いている) 場合は送信側
assert.equal(classifyGap({maxSendGapMs: 300, arrivalGapMs: 310, lostInGap: 0, delayedAfter: 0}), 'sender');
assert.equal(classifyGap({maxSendGapMs: 33, arrivalGapMs: 280, lostInGap: 1, delayedAfter: 3}), 'mixed');
// 端末が送っていない区間は、届いたパケットの前後でも送信側と判定する
const idleReport = report((l, t) => t + 5 + (l >= 11 ? 300 : 0));
idleReport.lookPerformance.times = idleReport.lookPerformance.times.map((t, i) => t + (i >= 10 ? 300 : 0));
const idle = analyzeLookGaps(idleReport);
assert.equal(idle.detail[0].kind, 'sender');

// 空白がなければ何も出さない
assert.equal(analyzeLookGaps(report((l, t) => t + 5)).gaps, 0);
console.log('合格: 視点受信の空白を送信側・遅着・欠落に分類する (合成データ、時計のずれを打ち消す)');
