// 端末内だけの検証用集計。個人情報や入力内容を記録・送信しない。
const samples = new Map();
function add(name,value) {
  if (!Number.isFinite(value) || value < 0 || value > 10000) return;
  const values = samples.get(name) || []; values.push(value);
  if (values.length > 500) values.shift(); samples.set(name,values);
}
function summary() {
  return Object.fromEntries([...samples].map(([name,values]) => {
    const ordered = [...values].sort((a,b)=>a-b);
    return [name,{n:values.length,p50:ordered[Math.floor(ordered.length*.5)],p95:ordered[Math.min(ordered.length-1,Math.floor(ordered.length*.95))],max:ordered.at(-1)}];
  }));
}
export function recordInputMetric(name,eventTime) {
  if (!Number.isFinite(eventTime)) return;
  const timestamp = eventTime > 1e12 ? eventTime - performance.timeOrigin : eventTime;
  add(name,performance.now() - timestamp);
}
export const inputMetrics = Object.freeze({add,summary});
