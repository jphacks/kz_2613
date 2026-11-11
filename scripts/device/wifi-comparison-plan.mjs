import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function createComparisonPlan({axis, baseline, candidate}) {
  const axes = ['assets', 'transport', 'ackObserver', 'periodicIce'];
  assert(axes.includes(axis), '比較軸が不明です');
  for (const condition of [baseline, candidate]) {
    assert(/^[a-f0-9]{40}$/.test(condition?.assets ?? ''), '資産の完全なコミットSHAが必要です');
    assert(['rtc-ws', 'ws-only'].includes(condition.transport), '通信方式が不明です');
    assert.equal(typeof condition.ackObserver, 'boolean', '先行ACK観測の有無が必要です');
    assert(condition.periodicIce === undefined || typeof condition.periodicIce === 'boolean', '定期ICE観測の指定が不正です');
    assert(condition.periodicIce !== false || condition.transport === 'rtc-ws', '定期ICE観測の無効化はRTCありの試行だけで使用する');
  }
  baseline = {...baseline, periodicIce: baseline.periodicIce ?? true};
  candidate = {...candidate, periodicIce: candidate.periodicIce ?? true};
  for (const key of axes) {
    assert.equal(baseline[key] !== candidate[key], key === axis, '比較軸の1項目だけを変更してください');
  }
  assert(axis === 'ackObserver' || !baseline.ackObserver, '先行ACK診断は独立した系列にしてください');

  const durationMs = 60_000;
  const order = [];
  for (let trial = 1; trial <= 3; trial++) {
    const labels = trial % 2 === 1 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const label of labels) {
      const condition = label === 'baseline' ? baseline : candidate;
      const args = ['--benchmark-ms', String(durationMs), '--condition', label, '--trial', String(trial)];
      if (condition.transport === 'ws-only') args.push('--ws-only');
      if (condition.ackObserver) args.push('--ack-observer');
      if (!condition.periodicIce) args.push('--no-periodic-ice');
      order.push({label, trial, assets: condition.assets, args});
    }
  }
  return {version: 1, axis, durationMs, order};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 3, '使用法: node scripts/device/wifi-comparison-plan.mjs <比較条件JSON>');
  const plan = createComparisonPlan(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify(plan, null, 2));
}
