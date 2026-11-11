import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {trialAcks} from './wifi-trial-acks.mjs';
import {validateHttpWs, validateSelectedPairs} from './wifi-route.mjs';
import {summarize} from './android-performance.mjs';
import {analyzeHostInput} from './wifi-host-analysis.mjs';
import {ackPhases} from './wifi-ack-observer.mjs';

const percentiles = ['p50', 'p95', 'p99', 'mean', 'max'];
const statsOnly = value => value?.n > 0
  ? Object.fromEntries(['n', ...percentiles].map(key => {
    assert(Number.isFinite(value[key]) && value[key] >= 0, '統計値が不正');
    return [key, value[key]];
  }))
  : null;

export function traceTiming(report) {
  if (report.hostTrace === false) {
    assert(!report.hostInputTrace, 'トレース無効の試行にトレースが含まれている');
    return null;
  }
  const analysis = analyzeHostInput(report);
  assert.equal(analysis.outputUnmatched, 0, '入力とdry出力の対応が不足');
  return analysis.timing;
}

// 各区間は別の指標。条件間で直接比較できる端末内のACK往復だけ差分を出す。
export function compareOverhead(records, plan) {
  const {axis, order, durationMs} = plan;
  assert(['ackObserver', 'periodicIce', 'hostTrace'].includes(axis));
  assert.equal(plan.version, 1, '試行計画の版が不正');
  assert.equal(durationMs, 60_000, '試行計画の計測時間が不正');
  assert.equal(order.length, 6, '試行計画は各条件3回');
  assert.equal(records.length, 6);
  const first = records[0].report;
  const pairs = Array.from({length:3}, () => new Map());
  const settingByLabel = new Map();
  let previousTime = -Infinity;
  for (const [index, {report, privateProof}] of records.entries()) {
    const step = order[index];
    const plannedTrial = Math.floor(index / 2) + 1;
    const plannedLabel = [0, 3, 4].includes(index) ? 'baseline' : 'candidate';
    assert(step.trial === plannedTrial && step.label === plannedLabel, '試行計画の交互順が不正');
    assert(report.condition === step.label && Number(report.trial) === step.trial, '試行順またはラベルが計画と不一致');
    assert.equal(report.sourceCommit, step.assets, '資産コミットが計画と不一致');
    assert.equal(report.wsOnly, step.args.includes('--ws-only'), '通信方式が計画と不一致');
    assert.equal(report.ackObserver, step.args.includes('--ack-observer'), '先行ACK観測が計画と不一致');
    assert.equal(report.periodicIce, !report.wsOnly && !step.args.includes('--no-periodic-ice'), '定期ICE観測が計画と不一致');
    if (axis === 'hostTrace') {
      assert.equal(report.hostTrace, !step.args.includes('--no-host-trace'), 'ホストトレースが計画と不一致');
    }
    const started = Date.parse(report.date);
    assert(Number.isFinite(started) && started > previousTime, '記録の開始時刻が試行順と不一致');
    previousTime = started;
    assert(!report.error && !report.cleanupFailures?.length && report.hostExit?.code === 0, '成功した試行が必要');
    assert(report.benchmarkMs === durationMs && report.performance.workload.cycles === 48
      && report.lookPerformance?.moves === 1800, '負荷条件が不一致');
    assert(report.sourceDirty === false && report.runner.dirty === false, '未コミットの変更を含む試行');
    assert.equal(report.binarySha256, first.binarySha256, 'ホストバイナリ不一致');
    assert.equal(report.sourceCommit, first.sourceCommit, '資産コミット不一致');
    assert.deepEqual(report.uiAssets, first.uiAssets, '資産ハッシュ不一致');
    assert.deepEqual(report.runner, first.runner, 'runner不一致');
    assert(report.device?.android && report.device.chrome && report.device.size && report.device.density, '端末情報が不足');
    assert.deepEqual(report.device, first.device, '端末条件が不一致');
    for (const field of ['wsOnly', 'players', 'ackObserver', 'periodicIce', 'hostTrace']) {
      if (field !== axis) assert.equal(report[field], first[field], '比較軸以外の条件が不一致');
    }
    assert.equal(typeof report[axis], 'boolean', '観測設定が不明');
    if (settingByLabel.has(step.label)) {
      assert.equal(report[axis], settingByLabel.get(step.label), '同じラベル内で観測設定が変化した');
    }
    settingByLabel.set(step.label, report[axis]);
    const proof = report.networkProof;
    assert(proof?.pcWifiActive && proof.androidWifiActive && proof.androidRouteViaWlan
      && !proof.usbTethering && proof.adbReverseMappings === 0, 'Wi-Fi経路の証拠不足');
    assert(proof.host?.ownedHostEstablishedLanSocket && proof.host.androidNonLoopbackPeer, 'ホスト側のLAN接続証拠不足');
    const firstNetwork = records[0].privateProof.network;
    assert(privateProof.network.pc === firstNetwork.pc && privateProof.network.android === firstNetwork.android
      && proof.topology === first.networkProof.topology, '試行途中でLAN構成が変化した');
    const document = privateProof.events.find(event => event.method === 'Network.responseReceived'
      && event.params.type === 'Document' && event.params.response.remoteIPAddress === privateProof.network.pc);
    assert(document, 'LAN文書の応答がない');
    validateHttpWs(privateProof.events, privateProof.network, document.params.response.remotePort);
    const endpointRtts = [];
    for (const label of ['input-end', 'look-end']) {
      const sample = proof.samples.find(value => value.label === label);
      const raw = privateProof.samples.find(value => value.label === label);
      assert(sample?.http.networkResponse && sample.webSocket.urlUsesLanAddress && !sample.adbReverseUsed);
      assert(raw, '選択候補対の生記録がない');
      if (report.wsOnly) {
        assert.equal(raw.stats.length, 0);
        assert.equal(sample.selectedPairs.length, 0);
      } else {
        const selected = validateSelectedPairs(raw.stats, privateProof.network);
        // runnerのJSON保存では未取得の統計プロパティ（undefined）が省略される。
        assert.deepEqual(sample.selectedPairs, JSON.parse(JSON.stringify(selected)));
        endpointRtts.push(...selected.map(value => value.currentRoundTripTimeMs));
      }
    }
    const pair = pairs[Number(report.trial) - 1];
    assert(pair && !pair.has(report[axis]), '試行番号の不正または重複');
    const acks = trialAcks(report.performance.raw);
    assert.equal(acks.unacked, 0, '未ACKあり');
    assert.equal(acks.ackRttMs.n, 224, '操作標本数の不一致');
    const raw = report.performance.raw;
    const phases = report.ackObserver ? ackPhases(raw, raw.earlyAcks) : undefined;
    const host = traceTiming(report);
    pair.set(report[axis], {
      ackRttMs: acks.ackRttMs,
      sendToEarlyAckMs: statsOnly(phases?.earlyRttMs),
      earlyToLateAckMs: statsOnly(phases?.dispatchMs),
      hostReceiveToAcceptMs: statsOnly(host?.receiveToAcceptMs),
      hostAcceptToDryOutputMs: statsOnly(host?.acceptToDryOutputMs),
      endpointIceRttMs: statsOnly(summarize(endpointRtts)),
    });
  }
  return pairs.map((pair, index) => {
    const on = pair.get(true), off = pair.get(false);
    assert(on && off, '比較相手の試行がない');
    const ackRttOnMinusOffMs = Object.fromEntries(percentiles.map(key => [key, on.ackRttMs[key] - off.ackRttMs[key]]));
    return {trial:index + 1, on, off, ackRttOnMinusOffMs};
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [planFile, ...files] = process.argv.slice(2);
  const read = file => JSON.parse(readFileSync(file, 'utf8'));
  try {
    const records = files.map(file => ({report:read(file), privateProof:read(join(dirname(file), 'network.private.json'))}));
    console.log(JSON.stringify(compareOverhead(records, read(planFile)), null, 2));
  } catch {
    // Assertionの差分やファイル名に、LANアドレスやローカル情報が含まれ得る。
    console.error('試行記録を照合できません。ローカルの入力ファイルと比較条件を確認してください。');
    process.exitCode = 1;
  }
}
