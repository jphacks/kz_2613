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

function run(extra = []) {
  const child = spawn(exe, ['--mock', ...extra], { stdio: ['pipe', 'pipe', 'pipe'] });
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
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  return {
    child, lines, exited,
    write: (s) => child.stdin.write(s + '\n'),
    waitLine(pred, ms = 5000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('待機タイムアウト: ' + pred)), ms);
        const check = () => {
          const l = lines.find((x) => (typeof pred === 'string' ? x.startsWith(pred) : pred.test(x)));
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
    if (!m) continue;
    if (m[3] === 'down') held.add(m[2]); else held.delete(m[2]);
  }
  return held;
}

const results = [];
async function check(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); results.push(true); }
  catch (e) { console.log(`  FAIL ${name}: ${e.message}`); results.push(false); }
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
  await p.waitLine((() => { let n = 0; return { test: (l) => l.startsWith('SEND key 0x11 down') && ++n === 2 }; })());
  p.write('target off');
  await p.waitLine('RELEASE all (target lost)');
  const from = p.lines.length;
  await new Promise((r) => setTimeout(r, 500));
  assert(!p.lines.slice(from).some((l) => l.startsWith('SEND')), '外れている間に送った');
  const release = p.lines.findIndex((l) => l.startsWith('RELEASE key 0x11 up'));
  assert(release >= 0, 'W を離していない');
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
  await p.waitLine((() => { let n = 0; return { test: (l) => l.startsWith('SEND mouse left down') && ++n === 2 }; })());
  p.write('stop');
  const code = await p.exited;
  assert(code === 2, `exit ${code}`);
  const stopAt = p.lines.findIndex((l) => l.startsWith('STOP emergency stop'));
  assert(stopAt >= 0, '停止を表示しない');
  assert(!p.lines.slice(stopAt).some((l) => l.startsWith('SEND')), '停止後に送った');
  assert(balanced(p.lines).size === 0, '押しっぱなし');
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 合格 (input-probe --mock)`);
process.exit(failed ? 1 : 0);
