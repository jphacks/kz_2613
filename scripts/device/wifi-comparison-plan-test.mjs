import assert from 'node:assert/strict';
import {createComparisonPlan} from './wifi-comparison-plan.mjs';

const baseline = {assets: 'a'.repeat(40), transport: 'rtc-ws', ackObserver: false};
const plan = (axis, change) => createComparisonPlan({axis, baseline, candidate: {...baseline, ...change}});
const transport = plan('transport', {transport: 'ws-only'});
assert.deepEqual(transport.order.map(({label, trial}) => [label, trial]), [
  ['baseline', 1], ['candidate', 1], ['candidate', 2],
  ['baseline', 2], ['baseline', 3], ['candidate', 3],
]);
for (const {label, trial, args} of transport.order) {
  assert.deepEqual(args.slice(0, 6), ['--benchmark-ms', '60000', '--condition', label, '--trial', String(trial)]);
  assert.equal(args.includes('--ws-only'), label === 'candidate');
  assert(!args.includes('--ack-observer'));
}
assert.equal(plan('assets', {assets: 'b'.repeat(40)}).order[1].assets, 'b'.repeat(40));
assert(plan('ackObserver', {ackObserver: true}).order[1].args.includes('--ack-observer'));
assert(!transport.order.some(({args}) => args.includes('--no-periodic-ice')));
assert.equal(plan('periodicIce', {periodicIce: false}).order.filter(({args}) => args.includes('--no-periodic-ice')).length, 3);
assert(!transport.order.some(({args}) => args.includes('--no-host-trace')));
assert.equal(plan('hostTrace', {hostTrace: false}).order.filter(({args}) => args.includes('--no-host-trace')).length, 3);
assert.throws(() => plan('hostTrace', {hostTrace: false, periodicIce: false}), /1項目/);
assert.throws(() => plan('transport', {transport: 'ws-only', periodicIce: false}), /RTCあり/);
assert.throws(() => plan('transport', {transport: 'ws-only', assets: 'b'.repeat(40)}), /1項目/);
assert.throws(() => plan('transport', {}), /1項目/);
assert.throws(() => plan('assets', {assets: 'short'}), /SHA/);
assert.throws(() => createComparisonPlan({
  axis: 'assets',
  baseline: {...baseline, ackObserver: true},
  candidate: {...baseline, assets: 'b'.repeat(40), ackObserver: true},
}), /独立/);
console.log('合格: Wi-Fi試行順・60秒・比較軸・runner引数');
