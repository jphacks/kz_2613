import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareOverhead,traceTiming} from './summarize-wifi-overhead.mjs';
import {validateSelectedPairs} from './wifi-route.mjs';
import {createComparisonPlan} from './wifi-comparison-plan.mjs';

const assets = 'a'.repeat(40);
const baseline = {assets, transport:'rtc-ws', ackObserver:false, periodicIce:true};
const plan = createComparisonPlan({axis:'periodicIce', baseline, candidate:{...baseline,periodicIce:false}});
function report(trial, periodicIce) {
  const sends = Array.from({length:224}, (_, i) => ({type:'input', via:'ws', epoch:2, iseq:i + 5, at:i * 10}));
  const hostInputTrace = {limitReached:false, events:sends.flatMap(({iseq,epoch}, index) => {
    const us = index * 10_000;
    const base = {slot:'P1',iseq,epoch,via:'ws'};
    return [
      {stage:'received',us,data:{...base,receivedUs:us}},
      {stage:'buffer',us:us + 500,data:{...base,next:iseq}},
      {stage:'accepted',us:us + 1000,data:{...base,out:'SPACE',state:'down',stale:false}},
      {stage:'output',us:us + 3000,data:{slot:'P1',out:'SPACE',state:'down',startedUs:us + 2000}},
    ];
  })};
  const acks = sends.map(send => ({via:'ws', iseq:send.iseq, at:send.at + (periodicIce ? 3 : 2)}));
  acks.unshift({via:'ws', iseq:4, at:999});
  acks.push({...acks[1], at:2000});
  const network = {pc:'192.168.1.2', android:'192.168.1.3'};
  const pair = {
    connectionState:'connected',
    transport:{type:'transport', selectedCandidatePairId:'pair', dtlsState:'connected', iceState:'connected'},
    pair:{id:'pair', localCandidateId:'phone', remoteCandidateId:'pc', state:'succeeded', nominated:true,
      bytesSent:10, bytesReceived:20, currentRoundTripTime:0.002},
    local:{id:'phone', address:network.android, protocol:'udp', candidateType:'host'},
    remote:{id:'pc', address:network.pc, protocol:'udp', candidateType:'host'},
  };
  const labels = ['input-end','look-end'];
  const samples = labels.map(label => ({label, http:{networkResponse:true},
    webSocket:{urlUsesLanAddress:true}, adbReverseUsed:false,
    selectedPairs:JSON.parse(JSON.stringify(validateSelectedPairs([pair], network)))}));
  const events = [
    {method:'Network.responseReceived',params:{type:'Document',response:{remoteIPAddress:network.pc,remotePort:8080}}},
    {method:'Network.webSocketCreated',params:{url:`ws://${network.pc}:8080/ws`}},
  ];
  return {trial, periodicIce, wsOnly:false, players:3, ackObserver:false, hostTrace:true,
    hostExit:{code:0}, benchmarkMs:60000, performance:{workload:{cycles:48}, raw:{sends, acks}},
    hostInputTrace,
    sourceCommit:assets, sourceDirty:false, binarySha256:'same',
    runner:{commit:'same',dirty:false,modules:{'runner.mjs':'same'}}, uiAssets:{'main.js':'same'},
    device:{android:'16',chrome:'Chrome/1',size:'390x844',density:'1'},
    lookPerformance:{moves:1800},
    networkProof:{pcWifiActive:true, androidWifiActive:true, androidRouteViaWlan:true,
      usbTethering:false, adbReverseMappings:0, host:{ownedHostEstablishedLanSocket:true,androidNonLoopbackPeer:true}, samples},
    privateProof:{network, events, samples:labels.map(label => ({label,stats:[structuredClone(pair)]}))}};
}
const fixtures = plan.order.map(({label, trial}, i) => ({
  ...report(trial, label === 'baseline'), condition:label, date:new Date(i * 180_000).toISOString(),
}));
const compare = (reports, comparisonPlan = plan) =>
  compareOverhead(reports.map(({privateProof, ...report}) => ({report,privateProof})), comparisonPlan);
const results = compare(fixtures);
assert.deepEqual(results.map(result => [result.on.ackRttMs.n,result.off.ackRttMs.n,result.ackRttOnMinusOffMs.p95]),
  [[224,224,1],[224,224,1],[224,224,1]]);
assert.equal(results[0].on.endpointIceRttMs.n, 2);
assert.equal(results[0].on.endpointIceRttMs.p50, 2);
assert.equal(results[0].on.hostReceiveToAcceptMs.p50, 1);
assert.equal(results[0].off.hostAcceptToDryOutputMs.p50, 2);
assert.equal(traceTiming({hostTrace:false}), null);
assert.throws(() => traceTiming({...fixtures[0],hostTrace:false}), /無効/);
assert.throws(() => traceTiming({...fixtures[0],hostInputTrace:{limitReached:true}}), /上限/);
assert.equal(results[0].on.sendToEarlyAckMs, null);
assert.equal(results[0].on.earlyToLateAckMs, null);
for (const [mutate, expected] of [
  [r => r.ackObserver = true, /先行ACK観測が計画と不一致/],
  [r => r.periodicIce = true, /定期ICE観測が計画と不一致/],
  [r => r.date = fixtures[1].date, /開始時刻/],
  [r => r.uiAssets['main.js'] = 'other', /資産ハッシュ/],
  [r => r.runner.modules['runner.mjs'] = 'other', /runner不一致/],
  [r => r.runner.dirty = true, /未コミット/],
  [r => r.device.chrome = 'Chrome/2', /端末条件/],
  [r => r.lookPerformance.moves = 1799, /負荷条件/],
  [r => r.privateProof.network.android = '192.168.1.4', /LAN構成/],
  [r => r.networkProof.adbReverseMappings = 1, /Wi-Fi経路/],
  [r => r.privateProof.samples.pop(), /生記録/],
  [r => r.privateProof.samples[0].stats[0].local.address = '127.0.0.1', /Android wlan0/],
  [r => r.trial = 1, /試行順/],
  [r => r.performance.raw.acks.splice(4,1), /未ACK/],
]) {
  const input = structuredClone(fixtures);
  mutate(input[2]);
  assert.throws(() => compare(input), expected);
}
assert(!JSON.stringify(results).includes('192.168.'));
const reordered = [...fixtures];
[reordered[1], reordered[2]] = [reordered[2], reordered[1]];
assert.throws(() => compare(reordered), /試行順/);

// 計画の形式を使い、トレースなしの記録を集計側だけで検証する。
const tracePlan = {...plan, axis:'hostTrace', order:plan.order.map(step => ({
  ...step, args:step.args.map(arg => arg === '--no-periodic-ice' ? '--no-host-trace' : arg),
}))};
const traceFixtures = tracePlan.order.map(({label,trial}, index) => {
  const fixture = {...report(trial,true), condition:label, date:new Date(index * 180_000).toISOString(),
    hostTrace:label === 'baseline'};
  if (!fixture.hostTrace) delete fixture.hostInputTrace;
  return fixture;
});
for (const pair of compare(traceFixtures, tracePlan)) {
  assert.equal(pair.on.hostReceiveToAcceptMs.n, 224);
  assert.equal(pair.on.hostAcceptToDryOutputMs.p50, 2);
  assert.equal(pair.off.hostReceiveToAcceptMs, null);
  assert.equal(pair.off.hostAcceptToDryOutputMs, null);
  assert.equal(pair.off.ackRttMs.n, 224);
  assert.equal(pair.off.endpointIceRttMs.n, 2);
}
const wrongTrace = structuredClone(traceFixtures);
wrongTrace[1].hostInputTrace = wrongTrace[0].hostInputTrace;
assert.throws(() => compare(wrongTrace, tracePlan), /トレース無効/);

const ackPlan = createComparisonPlan({axis:'ackObserver', baseline, candidate:{...baseline,ackObserver:true}});
const ackFixtures = ackPlan.order.map(({label,trial}, index) => {
  const fixture = {...report(trial,true), condition:label, date:new Date(index * 180_000).toISOString(),
    ackObserver:label === 'candidate'};
  const raw = fixture.performance.raw;
  if (fixture.ackObserver) raw.earlyAcks = raw.sends.map(send => ({iseq:send.iseq, at:send.at + 1, via:'ws'}));
  return fixture;
});
for (const pair of compare(ackFixtures, ackPlan)) {
  assert.equal(pair.on.sendToEarlyAckMs.p50, 1);
  assert.equal(pair.on.earlyToLateAckMs.p50, 2);
  assert.equal(pair.off.sendToEarlyAckMs, null);
}
const wrongAck = structuredClone(ackFixtures);
wrongAck[1].performance.raw.earlyAcks[0].at = -1;
assert.throws(() => compare(wrongAck, ackPlan), /時刻順序/);

const temp = realpathSync(tmpdir());
const directory = realpathSync(mkdtempSync(join(temp, 'recooplay-276-')));
try {
  const planFile = join(directory, 'plan.json');
  writeFileSync(planFile, JSON.stringify(plan));
  const files = fixtures.map(({privateProof, ...report}, index) => {
    const runDirectory = join(directory, String(index));
    mkdirSync(runDirectory);
    const summary = join(runDirectory, 'summary.json');
    writeFileSync(summary, JSON.stringify(report));
    writeFileSync(join(runDirectory, 'network.private.json'), JSON.stringify(privateProof));
    return summary;
  });
  const script = fileURLToPath(new URL('./summarize-wifi-overhead.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, planFile, ...args],
    {encoding:'utf8', timeout:5000, windowsHide:true});
  const good = run(...files);
  assert.ifError(good.error);
  assert.equal(good.status, 0, good.stderr);
  assert.deepEqual(JSON.parse(good.stdout), results);
  const failed = run(...files.slice(0, 5), join(directory, '192.168.1.3', 'summary.json'));
  assert.ifError(failed.error);
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /照合できません/);
  assert.doesNotMatch(failed.stderr, /192\.168\.|recooplay-276-/);
} finally {
  assert(dirname(directory) === temp && basename(directory).startsWith('recooplay-276-'));
  rmSync(directory, {recursive:true, force:true});
}
console.log('合格: 3系列、計画・経路・欠測の照合、CLI入出力と失敗時の秘匿（合成記録）');
