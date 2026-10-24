// 入力プローブ (#5) の安全経路の試験。--mock で起動し、OS には入力を送らない。
// ARM 前は何も送らないこと、入力先から外れたら全解放して待つこと、停止で全解放して終わること、完走時に押下が残らないことを確かめる。
//
//   node scripts/sim/input-probe-sim.mjs [--bin <path-to-exe>]

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const i = args.indexOf('--bin');
const exe = i >= 0 ? args[i + 1] : path.join(ROOT, 'apps', 'host-rs', 'target', 'release', process.platform === 'win32' ? 'recooplay-input-probe.exe' : 'recooplay-input-probe');

const children = new Set();
function run(extra = [], env = {}) {
  const child = spawn(exe, ['--mock', ...extra], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, RECOOPLAY_DRY_RUN: '1', RECOOPLAY_PROBE_MOCK_FAIL: '', ...env } });
  children.add(child);
  const lines = [];
  const waiters = [];
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let n;
    while ((n = buf.indexOf('\n')) >= 0) {
      lines.push(buf.slice(0, n).trimEnd());
      buf = buf.slice(n + 1);
      for (const w of [...waiters]) w();
    }
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => { children.delete(child); resolve(code); });
  });
  exited.catch(() => {});
  child.stderr.on('data', () => {});
  const deadline = setTimeout(() => child.kill(), 25000);
  child.once('exit', () => clearTimeout(deadline));
  child.once('error', () => { clearTimeout(deadline); children.delete(child); });
  return {
    child, lines, exited,
    write: (s) => child.stdin.write(s + '\n'),
    waitLine(pred, ms = 5000, from = 0) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('待機タイムアウト: ' + pred)), ms);
        const check = () => {
          const l = lines.slice(from).find((x) => (typeof pred === 'string' ? x.startsWith(pred) : pred.test(x)));
          if (l) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); resolve(l); }
        };
        waiters.push(check);
        check();
      });
    },
  };
}

/** 押下と解放の対応が取れていて、最後に何も押していないか */
function balanced(lines) {
  const held = new Set();
  for (const l of lines) {
    const m = /^(SEND|RELEASE) (key 0x[0-9A-F]+|mouse \w+) (down|up)/.exec(l);
    if (!m || l.includes('ok=false')) continue;
    if (m[3] === 'down') held.add(m[2]); else held.delete(m[2]);
  }
  return held;
}

const results = [];
async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); results.push(true); }
  catch (e) { console.log(`  FAIL ${name}: ${e.message}`); results.push(false); }
  finally { for (const child of children) child.kill(); children.clear(); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

await check('ARM 以外の入力・入力が閉じたときは何も送らずに終わる', async () => {
  const p = run();
  p.write('arm');
  p.write('yes');
  p.child.stdin.end();
  const code = await p.exited;
  assert(code === 0, `exit ${code}`);
  assert(!p.lines.some((l) => l.startsWith('SEND')), '送った');
  assert(p.lines.some((l) => l.startsWith('STOP 開始前')), '開始前の終了を表示しない');
});

await check('完走すると全手順を送り、押下が残らない', async () => {
  const p = run();
  p.write('ARM');
  await p.waitLine('DONE', 20000);
  const code = await p.exited;
  assert(code === 0, `exit ${code}`);
  for (const k of ['key 0x11', 'key 0x39', 'key 0x2A', 'key 0x1D', 'mouse left', 'mouse right']) assert(p.lines.some((l) => l.startsWith(`SEND ${k} down`)), `${k} を送っていない`);
  assert(p.lines.some((l) => l.startsWith('SEND wheel')), 'ホイールを送っていない');
  assert(p.lines.some((l) => l.startsWith('SEND move')), '視点を送っていない');
  const held = balanced(p.lines);
  assert(held.size === 0, `押しっぱなし: ${[...held]}`);
});

await check('W を押している間に入力先から外れると全解放し、戻るまで送らない', async () => {
  const p = run(['--steps', 'keys']);
  p.write('ARM');
  await p.waitLine('STEP [keys] W を 1 秒');
  await p.waitLine('SEND key 0x11 down', 5000, p.lines.findIndex(l => l.startsWith('STEP [keys] W を 1 秒')) + 1);
  p.write('target off');
  await p.waitLine('RELEASE all (target lost)');
  const from = p.lines.length;
  await new Promise((r) => setTimeout(r, 500));
  assert(!p.lines.slice(from).some((l) => l.startsWith('SEND')), '外れている間に送った');
  assert(balanced(p.lines).size === 0, '入力先を外れた時点で押下が残った');
  p.write('target on');
  await p.waitLine('DONE', 20000);
  assert(balanced(p.lines).size === 0, '押しっぱなし');
  p.child.stdin.end();
  await p.exited;
});

await check('長押し中の stop で全解放して終わり、その後は送らない', async () => {
  const p = run(['--steps', 'mouse']);
  p.write('ARM');
  await p.waitLine('STEP [mouse] 左を 1.5 秒');
  await p.waitLine('SEND mouse left down', 5000, p.lines.findIndex(l => l.startsWith('STEP [mouse] 左を 1.5 秒')) + 1);
  p.write('stop');
  const code = await p.exited;
  assert(code === 2, `exit ${code}`);
  const stopAt = p.lines.findIndex((l) => l.startsWith('STOP emergency stop'));
  assert(stopAt >= 0, '停止を表示しない');
  assert(!p.lines.slice(stopAt).some((l) => l.startsWith('SEND')), '停止後に送った');
  assert(balanced(p.lines).size === 0, '押しっぱなし');
});

await check('入力先待機中の停止は、入力先が戻っても送信を再開しない', async () => {
  const p = run(['--steps', 'keys']);
  p.write('ARM'); p.write('target off');
  await p.waitLine('WAIT target:');
  p.write('stop'); p.write('target on');
  assert(await p.exited === 2, '停止の終了コードではない');
  assert(!p.lines.some(l => l.startsWith('SEND')), '停止後に送信した');
});

await check('ARM後に標準入力が閉じても送信しない', async () => {
  const p = run();
  p.write('ARM');
  await p.waitLine('ARMED');
  p.child.stdin.end();
  assert(await p.exited === 2, '停止しなかった');
  assert(!p.lines.some(l => l.startsWith('SEND')), '入力が閉じた後に送信した');
});

await check('押下中のpanicでもデッドロックせず、全解放して異常終了する', async () => {
  const p = run(['--steps', 'keys'], { RECOOPLAY_PROBE_MOCK_FAIL: 'panic' });
  p.write('ARM');
  assert(await p.exited === 101, 'panicの終了コードではない');
  assert(p.lines.some(l => l.startsWith('SEND key 0x11 down')), '押下前に終了した');
  assert(balanced(p.lines).size === 0, 'panic後に押下が残った');
});

await check('不明な引数はarming前に拒否する', async () => {
  const p = run(['--steps', 'unknown']);
  assert(await p.exited === 1, '不明な引数を拒否しなかった');
  assert(!p.lines.some(l => l.startsWith('SEND') || l === 'ARMED'), '不正な引数で開始した');
});

for (const fault of ['down', 'up', 'wheel', 'move']) {
  await check(`入力失敗(${fault})は成功扱いせず全解放して終了する`, async () => {
    const group = fault === 'move' ? 'look' : fault === 'wheel' ? 'mouse' : 'keys';
    const p = run(['--steps', group], { RECOOPLAY_PROBE_MOCK_FAIL: fault });
    p.write('ARM');
    assert(await p.exited === 4, '失敗の終了コードではない');
    assert(!p.lines.includes('DONE'), '成功を表示した');
    assert(p.lines.some(l => l.includes('ok=false')), '失敗経路を通っていない');
    assert(balanced(p.lines).size === 0, '解放を再試行していない');
  });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 合格 (input-probe --mock)`);
process.exit(failed ? 1 : 0);
