// 端末やホストexeを使わず、起動前の拒否と起動失敗の記録を検証する。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(root, 'scripts/device/android-dry-run.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-device-test-'));
const fixture = path.join(dir, 'invalid-host.exe');
const bytes = Buffer.from('not an executable\n');
fs.writeFileSync(fixture, bytes);
const hash = createHash('sha256').update(bytes).digest('hex');

function failure(args, expected, recorded = false) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: 'utf8', timeout: 18000, windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, expected);
  const summary = result.stdout.match(/記録: (.+summary\.json)/)?.[1];
  assert.equal(Boolean(summary), recorded);
  if (summary) {
    const report = JSON.parse(fs.readFileSync(path.join(root, summary), 'utf8'));
    assert.match(report.error, expected);
    assert.deepEqual(report.tests, []);
    return report;
  }
}

try {
  failure(['--host-only'], /64桁/);
  failure(['--bin', '--host-only'], /引数の値/);
  failure(['--host-only', '--host-only'], /重複/);
  failure(['--unsafe'], /不明な引数/);
  failure(['--players','5'], /players must/);
  failure(['--legacy'], /不明な引数/);
  failure(['--react'], /不明な引数/);
  failure(['--bin', fixture, '--sha256', '0'.repeat(64)], /ハッシュと異なります/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--host-only'],/実Android/);
  failure(['--bin',fixture,'--sha256',hash,'--ack-observer'],/先行ACK/);
  failure(['--bin',fixture,'--sha256',hash,'--no-periodic-ice'],/RTCありのWi-Fi性能試行/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--no-periodic-ice'],/RTCありのWi-Fi性能試行/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--benchmark-ms','60000','--ws-only','--no-periodic-ice'],/RTCありのWi-Fi性能試行/);
  failure(['--bin',fixture,'--sha256',hash,'--ws-fault-observe'],/実Wi-FiとRTCあり/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--ws-fault-observe','--ws-only'],/実Wi-FiとRTCあり/);
  failure(['--bin',fixture,'--sha256',hash,'--rtc-fault-observe'],/実Wi-Fi、RTCあり/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--rtc-fault-observe','--ws-fault-observe'],/WS切断と併用しない/);
  failure(['--bin',fixture,'--sha256',hash,'--wifi-network','unused','--rtc-fault-observe','--ws-only'],/実Wi-Fi、RTCあり/);
  const noAdb = failure(['--bin', fixture, '--sha256', hash, '--adb', path.join(dir, 'missing-adb.exe')], /ADBコマンド失敗: devices/, true);
  assert.equal(noAdb.hostExit, undefined);
  const noHost = failure(['--bin', fixture, '--sha256', hash, '--host-only'], /dry-runホスト起動失敗/, true);
  assert.notEqual(noHost.hostExit?.code, 0);
  console.log('20/20 合格（Android補助CLIの入力拒否・Wi-Fiの端末必須・計測条件・ADBなし・ホスト起動失敗）');
} finally {
  fs.unlinkSync(fixture);
  fs.rmdirSync(dir);
}
