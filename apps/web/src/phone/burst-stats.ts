/** 通信テスト 1 回分のACK往復時間だけを集める (#259)。常時の統計 (rtts) とは混ぜない */
export interface BurstSummary {n: number; avg: number; p50: number; p95: number; p99: number; max: number}
export type BurstPath = 'rtc' | 'ws';

/** 最近順位法 (nearest-rank)。n 件を昇順にしたときの ceil(p×n) 番目の値 */
export function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

export function summarizeBurst(values: readonly number[]): BurstSummary | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const round = (v: number) => Math.round(v);
  return {
    n: values.length,
    avg: round(values.reduce((a, b) => a + b, 0) / values.length),
    p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), p99: round(percentile(sorted, 0.99)),
    max: round(sorted[sorted.length - 1]),
  };
}

export function createBurstRecorder() {
  const outstanding = new Set<number>();
  const all: number[] = [];
  const byPath: Record<BurstPath, number[]> = {rtc: [], ws: []};
  let sent = 0;
  return {
    /** このテストで送った入力の iseq を登録する */
    track(iseq: number) { outstanding.add(iseq); sent++; },
    /** ACK を受けたとき。このテストの入力でなければ無視する (二重ACKも一度だけ数える) */
    ack(iseq: number, rtt: number, via: string | undefined): boolean {
      if (!outstanding.delete(iseq)) return false;
      all.push(rtt);
      if (via === 'rtc' || via === 'ws') byPath[via].push(rtt);
      return true;
    },
    summary() {
      return {sent, unacked: outstanding.size, all: summarizeBurst(all), rtc: summarizeBurst(byPath.rtc), ws: summarizeBurst(byPath.ws)};
    },
  };
}

export type BurstRecorder = ReturnType<typeof createBurstRecorder>;

export function formatBurstResult(r: ReturnType<BurstRecorder['summary']>): string {
  const line = (label: string, s: BurstSummary | null) => s ? `${label} ${s.n}件 平均${s.avg} p50 ${s.p50} p95 ${s.p95} p99 ${s.p99} 最大${s.max}ms` : `${label} なし`;
  return `通信テスト: ${r.sent}件 / 未ACK ${r.unacked}\n${line('ACK全体', r.all)}\n${line('WebRTC', r.rtc)}\n${line('WS', r.ws)}`;
}
