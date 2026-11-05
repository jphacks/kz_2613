// #174: ネットワーク・OS入力を使わないHub内部負荷計測。製品exeではなくRustのテストexeを指定する。
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const names = new Set(['--test-bin','--duration-ms','--repeats','--burst','--out']);
for (let i=0;i<args.length;i+=2) if (!names.has(args[i])) throw new Error(`不明な引数: ${args[i]}`);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${name}の値が必要です`);
  return args[i+1];
};
const number = (name, fallback, min, max) => {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}は${min}〜${max}の整数です`);
  return value;
};
const bin = option('--test-bin', null);
if (!bin) throw new Error('--test-bin に cargo test --no-run で構築したrecooplay-hostのテストexeを指定してください');
const duration = number('--duration-ms', 1000, 40, 60000);
const repetitions = number('--repeats', 3, 1, 10);
const burst = number('--burst', 2000, 16, 20000);
const output = path.resolve(root, option('--out', 'data/local/host-load-measurement.json'));
const sourceCommit = execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim();
const sourceDirty = execFileSync('git', ['status','--porcelain','--untracked-files=normal'], {cwd:root,encoding:'utf8'}).trim().length > 0;
const sourceFiles = Object.fromEntries(['apps/host-rs/src/hub.rs','apps/host-rs/src/hub_measurement.rs','apps/host-rs/src/input.rs','scripts/sim/host-load-measure.mjs']
  .map(file => [file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const result = spawnSync(path.resolve(bin), ['hub::tests::measurement::measure_host_load', '--exact', '--ignored', '--nocapture', '--test-threads=1'], {
  cwd:root, encoding:'utf8', maxBuffer:32*1024*1024,
  timeout:repetitions*5*duration+120000,
  env:{...process.env, RECOOPLAY_DRY_RUN:'1', RECOOPLAY_MEASURE_MS:String(duration),
    RECOOPLAY_MEASURE_REPEATS:String(repetitions), RECOOPLAY_MEASURE_BURST:String(burst)},
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Rust計測試験が失敗しました (${result.status}):\n${result.stdout}\n${result.stderr}`);
const marker = result.stdout.split(/\r?\n/).find(line => line.includes('RECOOPLAY_MEASUREMENTS='));
if (!marker) throw new Error('計測結果がありません。製品exeや別のテストexeを指定していないか確認してください');
const measurement = JSON.parse(marker.slice(marker.indexOf('RECOOPLAY_MEASUREMENTS=')+'RECOOPLAY_MEASUREMENTS='.length));
if (measurement.schemaVersion !== 1 || measurement.results.length !== repetitions*5
    || measurement.results.some(r => !r.safeStopVerified || r.pendingEventsAtEnd !== 0)) throw new Error('結果形式または安全停止の検証が不正です');
Object.assign(measurement,{sourceCommit,sourceDirty,sourceFiles});
// 追跡する結果にはテストexeの場所・端末名・IP・clientId・token等を含めない。
measurement.limits = [
  'Hub::runそのもの・HTTP/WS/RTCソケット・実ゲームの遅延を計測していない',
  'ログはnull device。実ディスク/標準出力の停滞・slow writerは未測定',
  'fixtureはtimeBeginPeriodを呼ばない。製品起動時のWindowsタイマー分解能やSendInput費用を含まない',
  '監視キューは受信を止めたtokio unbounded channel。OSソケットバッファの停滞ではない',
  'キューbytesはJSONペイロードのみ。allocator/Enum/チャネルの総メモリ使用量ではない',
  '有限負荷の観測値は最悪時上限や性能保証ではない。実機検証#157とは区別する',
];
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, JSON.stringify(measurement,null,2)+'\n');
for (const r of measurement.results) console.log(`${r.scenario} #${r.repetition}: events=${r.events} queuePeak=${r.eventQueuePeak} stop=${r.stopTotalUs.max}us monitorPeak=${r.monitorQueuePeak}`);
console.log(`合格: ${measurement.results.length}条件で停止・全解放とキュー消化を検証。結果: ${output}`);
