// 視点のホスト受信の空白 (200ms以上) を、端末の送信時刻・lseqの欠番・空白後のまとまり着に対応付ける (#275)。
// 端末 (performance.now) とホスト (Instant) の時計は同期していないので、直接の差を片道遅延と呼ばない。
// 各パケットの「受信 − 送信」から試行内の最小値を引いた相対遅れ (最も速く届いたときより何ms遅れたか) だけを使う。
//   node scripts/device/look-gap-analysis.mjs <trial.json.gz>...   # 試行ごとの集計と空白の一覧をJSONで出す
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const GAP_MS = 200;
// 空白の直後に、この間隔以内で続けて届いたパケットを「まとまり着」とみなす (送信は約33ms間隔)
const BURST_MS = 10;

/** 試行1つの視点受信 (lseq・受信時刻・経路) と端末の送信時刻 (lseq k は times[k-1]) */
export function lookPackets(report) {
  const times = report.lookPerformance?.times;
  if (!Array.isArray(times)) throw new Error('lookPerformance.times がない');
  const received = report.hostInputTrace.events.filter(e => e.stage === 'received' && e.data?.type === 'look');
  const epochs = new Set(received.map(e => e.data.epoch));
  if (epochs.size > 1) throw new Error(`視点のepochが複数ある: ${[...epochs]}`);
  return {times, packets: received.map(e => ({lseq: e.data.lseq, via: e.data.via, recvMs: e.data.receivedUs / 1000, sendMs: times[e.data.lseq - 1]}))
    .filter(p => Number.isFinite(p.sendMs)).sort((a, b) => a.recvMs - b.recvMs)};
}

/**
 * 空白の分類。
 * - sender: 端末がその間に送っていない (届いたかに関係なく、端末の送信時刻の最大間隔が空白とほぼ同じ)
 * - delayed: 端末は送っていて、空白中に送ったパケットが空白の後にまとめて届いた (網・無線・受信側で滞留)
 * - lost: 端末は送っていたが、空白中に送ったパケットが届いていない (欠落。届いた次のパケットは遅れていない)
 * - mixed: 遅着と欠落の両方
 */
export function classifyGap({maxSendGapMs, arrivalGapMs, lostInGap, delayedAfter}) {
  if (maxSendGapMs >= arrivalGapMs * 0.8) return 'sender';
  if (delayedAfter > 0 && lostInGap > 0) return 'mixed';
  if (delayedAfter > 0) return 'delayed';
  return lostInGap > 0 ? 'lost' : 'delayed';
}

export function analyzeLookGaps(report) {
  const {times, packets} = lookPackets(report);
  const base = Math.min(...packets.map(p => p.recvMs - p.sendMs));
  const excess = p => p.recvMs - p.sendMs - base;
  const seen = new Set(packets.map(p => p.lseq));
  const gaps = [];
  for (let i = 1; i < packets.length; i++) {
    const prev = packets[i - 1], next = packets[i];
    const arrivalGapMs = next.recvMs - prev.recvMs;
    if (arrivalGapMs < GAP_MS) continue;
    // 空白の後に続けて届いたパケット (まとまり着)
    const burst = [next];
    for (let k = i + 1; k < packets.length && packets[k].recvMs - packets[k - 1].recvMs <= BURST_MS; k++) burst.push(packets[k]);
    // 空白の間に端末が送ったパケット: 前に届いた最後の送信時刻から、次に届いたパケットの送信時刻まで
    const sentInGap = [];
    for (let l = 1; l <= times.length; l++) if (times[l - 1] > prev.sendMs && times[l - 1] < prev.sendMs + arrivalGapMs) sentInGap.push(l);
    const lostInGap = sentInGap.filter(l => !seen.has(l)).length;
    const delayedAfter = burst.filter(p => excess(p) >= GAP_MS * 0.5).length;
    const sendSpanMs = next.sendMs - prev.sendMs;
    // 端末の送信時刻の最大間隔 (欠落したパケットも含む)。欠落で sendSpanMs が広がっても送信側の空白と誤らない
    let maxSendGapMs = 0;
    for (let l = prev.lseq + 1; l <= Math.max(prev.lseq + 1, next.lseq); l++) maxSendGapMs = Math.max(maxSendGapMs, times[l - 1] - times[l - 2]);
    gaps.push({
      atMs: Math.round(prev.recvMs - packets[0].recvMs), arrivalGapMs: round(arrivalGapMs), sendSpanMs: round(sendSpanMs), maxSendGapMs: round(maxSendGapMs),
      prevLseq: prev.lseq, nextLseq: next.lseq, sentInGap: sentInGap.length, lostInGap, burst: burst.length, delayedAfter,
      nextExcessMs: round(excess(next)), maxBurstExcessMs: round(Math.max(...burst.map(excess))), outOfOrder: next.lseq < prev.lseq,
      via: [...new Set([prev.via, ...burst.map(p => p.via)])], viaSwitch: burst.some(p => p.via !== prev.via),
      kind: classifyGap({maxSendGapMs, arrivalGapMs, lostInGap, delayedAfter}),
    });
  }
  const kinds = {};
  for (const g of gaps) kinds[g.kind] = (kinds[g.kind] || 0) + 1;
  const excesses = packets.map(excess).sort((a, b) => a - b);
  const q = f => round(excesses[Math.min(excesses.length - 1, Math.floor(f * excesses.length))]);
  return {
    condition: report.condition, trial: report.trial, wsOnly: report.wsOnly, sent: times.length, received: packets.length,
    lost: times.length - seen.size, gaps: gaps.length, kinds, excessMs: {p50: q(0.5), p95: q(0.95), p99: q(0.99), max: round(excesses.at(-1))},
    detail: gaps,
  };
}

const round = v => Math.round(v * 10) / 10;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = process.argv.slice(2).map(f => analyzeLookGaps(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))));
  console.log(JSON.stringify(results, null, 1));
}
