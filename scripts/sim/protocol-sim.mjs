// 通信契約 (docs/architecture/protocol.md) のシミュレーション。
// ホストを RECOOPLAY_DRY_RUN=1 (OS へ入力を送らない) で起動し、スマホ 3 台と PC 画面を模した WebSocket で
// 役割・認可・進行・入力の先着 1 回処理・切断時の全解放・復帰設定を照合する。
// 入力注入は行わないので、ゲームや実機の合格の代わりにはならない。
//
//   node scripts/sim/protocol-sim.mjs            # Rust 版 (apps/host-rs/target/release/recooplay-host.exe)
//   node scripts/sim/protocol-sim.mjs --target node
//   node scripts/sim/protocol-sim.mjs --bin <path-to-exe>

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const target = opt('--target', 'rust');
const PORT = Number(opt('--port', 18000 + Math.floor(Math.random() * 1000)));
const BASE = `http://127.0.0.1:${PORT}`;
const PROTOCOL_VERSION = 1;

// ---------- ホストの起動 (必ず注入なし) ----------
function startHost() {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-sim-'));
  // config.json の影響を受けないよう、画面だけを持つ一時ルートを使う
  const env = { ...process.env, RECOOPLAY_DRY_RUN: '1', PORT: String(PORT), RECOOPLAY_LOG_DIR: logDir, RECOOPLAY_ROOT: ROOT, RECOOPLAY_NO_CONFIG: '1' };
  let cmd;
  let cmdArgs;
  if (target === 'node') {
    cmd = process.execPath;
    cmdArgs = [path.join(ROOT, 'apps', 'node-ref', 'server.js')];
  } else {
    const exe = process.platform === 'win32' ? 'recooplay-host.exe' : 'recooplay-host';
    cmd = opt('--bin', path.join(ROOT, 'apps', 'host-rs', 'target', 'release', exe));
    cmdArgs = [];
  }
  const child = spawn(cmd, cmdArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  return { child, output: () => out, logDir };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/info`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('ホストが起動しない');
}

// ---------- WebSocket クライアント ----------
class Client {
  constructor(name) {
    this.name = name;
    this.msgs = [];
    this.closed = null;
    this.iseq = 0;
    this.seq = 0;
    this.waiters = [];
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = () => reject(new Error(`${this.name}: 接続できない`));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        this.msgs.push(m);
        this.wake();
      };
      this.ws.onclose = (ev) => {
        this.closed = ev.code;
        clearInterval(this.pinger);
        this.wake();
      };
    });
  }
  wake() {
    for (const w of [...this.waiters]) w();
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  // スマホ同様 1 秒ごとに ping (4 秒の切断判定に掛からないように)
  startPing() {
    this.pinger = setInterval(() => this.ws.readyState === 1 && this.send({ type: 'ping', t: Date.now() }), 1000);
  }
  // 条件を満たすメッセージを待つ (from 以降に届いたもの)
  waitFor(pred, { timeout = 2000, from = 0, what = '' } = {}) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const hit = this.msgs.slice(from).find(pred);
        if (hit) {
          done();
          resolve(hit);
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`${this.name}: 待機タイムアウト ${what}`));
      }, timeout);
      const done = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== check);
      };
      this.waiters.push(check);
      check();
    });
  }
  waitClose(timeout = 2000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.closed !== null) {
          done();
          resolve(this.closed);
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`${this.name}: 切断されない`));
      }, timeout);
      const done = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== check);
      };
      this.waiters.push(check);
      check();
    });
  }
  mark() {
    return this.msgs.length;
  }
  input(button, state, extra = {}) {
    this.iseq++;
    this.seq++;
    this.send({ type: 'input', iseq: this.iseq, seq: this.seq, button, state, t: Date.now(), ...extra });
    return this.iseq;
  }
  close() {
    clearInterval(this.pinger);
    this.ws.close();
  }
}

// ---------- 試験 ----------
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ids = { P1: 'sim-client-p1', P2: 'sim-client-p2', P3: 'sim-client-p3', P4: 'sim-client-p4' };
const tokens = {};

async function join(key, extra = {}) {
  const c = new Client(key);
  await c.open();
  c.send({ type: 'hello', clientId: ids[key], ua: 'protocol-sim', protocolVersion: PROTOCOL_VERSION, ...(tokens[key] ? { token: tokens[key] } : {}), ...extra });
  return c;
}

async function welcome(c) {
  const w = await c.waitFor((m) => m.type === 'welcome' || m.type === 'full', { what: 'welcome' });
  if (w.type === 'welcome') {
    if (w.token) tokens[c.name] = w.token;
    c.startPing();
  }
  return w;
}

// モニターに届いた注入 (out, state) を待つ
const injected = (mon, out, state, from, timeout = 1500) =>
  mon.waitFor((m) => m.type === 'inject' && m.entry.out === out && m.entry.state === state, { from, timeout, what: `inject ${out} ${state}` });

async function noInject(mon, from, ms = 300) {
  await sleep(ms);
  const hit = mon.msgs.slice(from).find((m) => m.type === 'inject');
  assert(!hit, `注入されてはいけない: ${hit && JSON.stringify(hit.entry)}`);
}

const phaseIs = (c, phase, from, timeout = 2000) =>
  c.waitFor((m) => m.type === 'game' && m.game.phase === phase, { from, timeout, what: `phase ${phase}` });

async function main() {
  console.log(`protocol-sim: target=${target} port=${PORT} (RECOOPLAY_DRY_RUN=1)`);
  const host = startHost();
  let exitCode = 1;
  try {
    await waitReady();
    const mon = new Client('monitor');
    await mon.open();
    mon.send({ type: 'monitor', page: 'host' });
    await mon.waitFor((m) => m.type === 'state', { what: 'state' });

    let p1, p2, p3;

    await check('HTTP: スマホ画面とPC画面 (ループバック) を配信する', async () => {
      for (const p of ['/', '/host', '/game']) {
        const r = await fetch(BASE + p);
        assert(r.status === 200, `${p} → ${r.status}`);
      }
      const r = await fetch(BASE + '/../config.json');
      assert(r.status !== 200, 'ルート外のファイルを返した');
    });

    await check('役割: 接続順で P1 (ホスト) / P2 / P3 を割り当てる', async () => {
      p1 = await join('P1');
      const w1 = await welcome(p1);
      p2 = await join('P2');
      const w2 = await welcome(p2);
      p3 = await join('P3');
      const w3 = await welcome(p3);
      assert(w1.slot === 'P1' && w1.isHost === true, `P1: ${JSON.stringify(w1)}`);
      assert(w2.slot === 'P2' && w2.isHost === false, `P2: ${JSON.stringify(w2)}`);
      assert(w3.slot === 'P3' && w3.isHost === false, `P3: ${JSON.stringify(w3)}`);
      assert(!w1.reconnected, '初回なのに reconnected');
    });

    await check('役割: 4 台目は full で拒否し 4004 で閉じる', async () => {
      const p4 = await join('P4');
      const w = await p4.waitFor((m) => m.type === 'full', { what: 'full' });
      assert(w, 'full が来ない');
      assert((await p4.waitClose()) === 4004, '終了コードが 4004 でない');
    });

    await check('認可: スマホが hello で枠・ホスト権を指定しても無視する', async () => {
      const x = new Client('X');
      await x.open();
      x.send({ type: 'hello', clientId: 'sim-intruder', protocolVersion: PROTOCOL_VERSION, slot: 'P1', isHost: true });
      const w = await x.waitFor((m) => m.type === 'full' || m.type === 'welcome', { what: 'full' });
      assert(w.type === 'full', `満員なのに受け付けた: ${JSON.stringify(w)}`);
    });

    await check('進行: P1 以外の START は無視、P1 の START で coop', async () => {
      const g = await mon.waitFor((m) => m.type === 'game' && m.game.canStart, { what: 'canStart' });
      assert(g.game.phase === 'lobby', 'lobby でない');
      let from = p1.mark();
      p2.send({ type: 'command', cmd: 'START' });
      p3.send({ type: 'command', cmd: 'START' });
      await sleep(300);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'coop'), 'P2/P3 の START で開始した');
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'START' });
      const c = await phaseIs(p1, 'coop', from);
      assert(c.game.reason === 'host start', `reason=${c.game.reason}`);
    });

    // 以降の注入はモニターで観測する (DRY_RUN なので OS には送られない)
    mon.send({ type: 'inject_mode', mode: 'on' });
    await mon.waitFor((m) => m.type === 'state' && m.inject.mode === 'on' && m.inject.active, { what: 'inject on' });

    await check('入力: 役割の操作だけを注入し、担当外の操作名は無視する', async () => {
      let from = mon.mark();
      p1.input('FWD', 'down');
      await injected(mon, 'KEY_W', 'down', from);
      from = mon.mark();
      p3.input('FWD', 'down'); // P3 に移動の権限はない
      p2.input('ATTACK', 'down'); // P2 は視点のみ
      p1.input('UP', 'down'); // coop 中はリモコン操作なし
      await noInject(mon, from);
      p3.input('FWD', 'up');
      p2.input('ATTACK', 'up');
      p1.input('UP', 'up');
      from = mon.mark();
      p3.input('ATTACK', 'down');
      await injected(mon, 'MOUSE_L', 'down', from);
      from = mon.mark();
      p3.input('ATTACK', 'up');
      await injected(mon, 'MOUSE_L', 'up', from);
    });

    await check('入力: 同じ iseq の重複は 1 回だけ処理し、欠番は届くまで待つ', async () => {
      const from = p3.mark();
      const n = p3.iseq + 1;
      // n+1 (解放) が先、n (押下) が後に届いても押下→解放の順で処理する
      p3.send({ type: 'input', iseq: n + 1, button: 'USE', state: 'up', t: 0 });
      await sleep(100);
      assert(!p3.msgs.slice(from).some((m) => m.type === 'ack' && m.iseq === n + 1), '欠番を待たずに処理した');
      const mfrom = mon.mark();
      p3.send({ type: 'input', iseq: n, button: 'USE', state: 'down', t: 0 });
      p3.send({ type: 'input', iseq: n, button: 'USE', state: 'down', t: 0 });
      p3.iseq = n + 1;
      await p3.waitFor((m) => m.type === 'ack' && m.iseq === n + 1, { from, what: 'ack' });
      await sleep(200);
      const acks = p3.msgs.slice(from).filter((m) => m.type === 'ack' && m.iseq === n);
      assert(acks.length === 1, `ack ${acks.length} 回`);
      const seq = mon.msgs.slice(mfrom).filter((m) => m.type === 'inject' && m.entry.out === 'MOUSE_R').map((m) => m.entry.state);
      assert(seq.join(',') === 'down,up', `MOUSE_R の順序 ${seq.join(',')}`);
    });

    await check('入力: 押下は最低 60ms 保ってから解放する', async () => {
      const from = mon.mark();
      p1.input('JUMP', 'down');
      p1.input('JUMP', 'up');
      const d = await injected(mon, 'SPACE', 'down', from);
      const u = await injected(mon, 'SPACE', 'up', from);
      const held = u.entry.t - d.entry.t;
      assert(held >= 55, `押下時間 ${held}ms`);
    });

    await check('視点: P2 の look だけを相対移動にする', async () => {
      const from = mon.mark();
      p3.send({ type: 'look', lseq: 1, cx: 500, cy: 0 }); // P3 は無視
      await sleep(300);
      assert(!mon.msgs.slice(from).some((m) => m.type === 'look'), 'P3 の look を反映した');
      p2.send({ type: 'look', lseq: 1, cx: 40, cy: -20 });
      const l = await mon.waitFor((m) => m.type === 'look', { from, what: 'look' });
      assert(l.entry.slot === 'P2', 'P2 以外');
    });

    await check('切断: coop 中の切断で paused、切断者以外の押下も全解放する', async () => {
      let from = mon.mark();
      p1.input('FWD', 'up');
      await injected(mon, 'KEY_W', 'up', from);
      from = mon.mark();
      p1.input('FWD', 'down'); // P1 が押したまま
      p3.input('USE', 'down'); // P3 も押したまま
      await injected(mon, 'KEY_W', 'down', from);
      await injected(mon, 'MOUSE_R', 'down', from);
      p2.send({ type: 'look', lseq: 2, cx: 4000, cy: 0 }); // 未処理の視点を残す
      from = mon.mark();
      const pfrom = p1.mark();
      p2.close();
      const g = await phaseIs(p1, 'paused', pfrom);
      assert(g.game.reason === 'P2 disconnected', `reason=${g.game.reason}`);
      await injected(mon, 'KEY_W', 'up', from);
      await injected(mon, 'MOUSE_R', 'up', from);
      // 押しっぱなしの P1 の FWD は paused 中に注入されない (旧押下を復元しない)
      const after = mon.mark();
      await sleep(300);
      assert(!mon.msgs.slice(after).some((m) => m.type === 'inject' && m.entry.state === 'down'), '一時停止中に押下を注入した');
      p1.input('FWD', 'up');
      p3.input('USE', 'up');
    });

    await check('復帰: 自動復帰 ON・期限内に全員が戻ると coop、旧押下は戻らない', async () => {
      mon.send({ type: 'auto_resume', on: true });
      await mon.waitFor((m) => m.type === 'game' && m.game.autoResume === true, { what: 'autoResume on' });
      const from = p1.mark();
      const mfrom = mon.mark();
      p2 = await join('P2');
      const w = await welcome(p2);
      assert(w.slot === 'P2' && w.reconnected === true, `再接続で元の枠に戻らない: ${JSON.stringify(w)}`);
      const g = await phaseIs(p1, 'coop', from);
      assert(g.game.reason === 'auto resume', `reason=${g.game.reason}`);
      await sleep(200);
      assert(!mon.msgs.slice(mfrom).some((m) => m.type === 'inject' && m.entry.state === 'down'), '復帰時に旧押下を復元した');
    });

    await check('復帰: ホストの PAUSE は自動復帰の対象外', async () => {
      let from = p1.mark();
      p1.send({ type: 'command', cmd: 'PAUSE' });
      const g = await phaseIs(p1, 'paused', from);
      assert(g.game.reason === 'host pause', `reason=${g.game.reason}`);
      from = p1.mark();
      p2.close();
      await p1.waitFor((m) => m.type === 'game' && !m.game.connected.includes('P2'), { from, what: 'P2 切断' });
      p2 = await join('P2');
      await welcome(p2);
      await sleep(500);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'coop'), 'ホスト PAUSE から自動復帰した');
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
    });

    await check('復帰: 自動復帰 OFF なら全員戻っても paused のまま', async () => {
      mon.send({ type: 'auto_resume', on: false });
      await mon.waitFor((m) => m.type === 'game' && m.game.autoResume === false, { what: 'autoResume off' });
      let from = p1.mark();
      p3.close();
      await phaseIs(p1, 'paused', from);
      from = p1.mark(); // 設定変更の通知 (coop のまま) を自動復帰と取り違えない
      p3 = await join('P3');
      await welcome(p3);
      await sleep(500);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'coop'), 'OFF なのに自動復帰した');
    });

    await check('リモコン: paused では P1 の矢印・Enter・Esc のみ注入する', async () => {
      let from = mon.mark();
      p1.input('FWD', 'down');
      p3.input('ATTACK', 'down');
      await noInject(mon, from);
      p1.input('FWD', 'up');
      p3.input('ATTACK', 'up');
      from = mon.mark();
      p1.input('UP', 'down');
      await injected(mon, 'ARROW_UP', 'down', from);
      p1.input('UP', 'up');
      await injected(mon, 'ARROW_UP', 'up', from);
    });

    await check('安全: 注入モードを off にすると押下中の出力を解放する', async () => {
      let from = mon.mark();
      p1.input('ENTER', 'down');
      await injected(mon, 'ENTER', 'down', from);
      from = mon.mark();
      mon.send({ type: 'inject_mode', mode: 'off' });
      await injected(mon, 'ENTER', 'up', from);
      from = mon.mark();
      p1.input('ENTER', 'up');
      p1.input('ESC', 'down');
      await noInject(mon, from);
      p1.input('ESC', 'up');
      mon.send({ type: 'inject_mode', mode: 'on' });
    });

    await check('進行: P1 の END で lobby', async () => {
      const from = p1.mark();
      p1.send({ type: 'command', cmd: 'END' });
      const g = await phaseIs(p1, 'lobby', from);
      assert(g.game.reason === 'host end', `reason=${g.game.reason}`);
    });

    await check('切断: 4 秒受信がなければ切断扱いにする', async () => {
      clearInterval(p3.pinger);
      const from = p1.mark();
      const g = await p1.waitFor((m) => m.type === 'game' && !m.game.connected.includes('P3'), { from, timeout: 6500, what: 'heartbeat timeout' });
      assert(g, '切断扱いにならない');
    });

    for (const c of [p1, p2, p3, mon]) c?.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} 合格 (target=${target})`);
    exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.error('シミュレーションを実行できません:', e.message);
    console.error(host.output());
  } finally {
    host.child.kill();
  }
  process.exit(exitCode);
}

main();
