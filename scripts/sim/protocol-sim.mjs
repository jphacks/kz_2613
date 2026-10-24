// 通信契約 (docs/architecture/protocol.md) のシミュレーション。
// ホストを RECOOPLAY_DRY_RUN=1 (OS へ入力を送らない) で起動し、スマホ 3 台と PC 画面を模した WebSocket で
// 役割・認可・進行・入力の先着 1 回処理・切断時の全解放・復帰設定を照合する。
// 入力注入は行わないので、ゲームや実機の合格の代わりにはならない。
//
//   node scripts/sim/protocol-sim.mjs            # Rust 版 (apps/host-rs/target/release/recooplay-host.exe)
//   node scripts/sim/protocol-sim.mjs --target node
//   node scripts/sim/protocol-sim.mjs --bin <path-to-exe>

import { spawn } from 'node:child_process';
import http from 'node:http';
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
const PROTOCOL_VERSION = 3;

// ブラウザと同じOrigin付きのハンドシェイクを送り、アップグレード前の拒否も確認する。
function handshake(origin, host = `127.0.0.1:${PORT}`) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}/ws`, { headers: {
      Host: host, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'cmVjb29wbGF5LXRlc3QxMg==',
      ...(origin === undefined ? {} : { Origin: origin }),
    }});
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('response', res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('handshake timeout')));
    req.end();
  });
}

// ---------- ホストの起動 (必ず注入なし) ----------
function startHost() {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-sim-'));
  // config.json の影響を受けないよう、画面だけを持つ一時ルートを使う
  const env = { ...process.env, RECOOPLAY_DRY_RUN: '1', PORT: String(PORT), RECOOPLAY_LOG_DIR: logDir, RECOOPLAY_ROOT: ROOT, RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_FAKE_TARGET: '1' };
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
  // 標準入力: Rust 版は "stop" で緊急停止 (ホットキーと同じ処理) を受け付ける
  const child = spawn(cmd, cmdArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
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
        if (m.type === 'game') this.epoch = m.game.epoch; // スマホ同様、最新の進行状態の番号を入力に付ける
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
    this.send({ type: 'input', iseq: this.iseq, seq: this.seq, epoch: this.epoch, button, state, t: Date.now(), ...extra });
    return this.iseq;
  }
  close() {
    clearInterval(this.pinger);
    this.ws.close();
  }
}

// ---------- 試験 ----------
const results = [];
// rustOnly: 試作品の後に Rust 版へ追加した契約 (Node 参照実装は試作品のまま比較の基準として残す)
async function check(name, fn, { rustOnly = false } = {}) {
  if (rustOnly && target === 'node') {
    console.log(`  skip ${name} (Rust 版で追加した契約)`);
    return;
  }
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

// 押下の注入がないこと (状態変更に伴う全解放の up は許す)
async function noPress(mon, from, ms = 300) {
  await sleep(ms);
  const hit = mon.msgs.slice(from).find((m) => m.type === 'inject' && m.entry.state === 'down');
  assert(!hit, `押下を注入してはいけない: ${hit && JSON.stringify(hit.entry)}`);
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

    await check('版: protocolVersion がない・違う hello は理由を返して 4005 で閉じ、枠を割り当てない', async () => {
      for (const extra of [{ protocolVersion: undefined }, { protocolVersion: PROTOCOL_VERSION + 1 }, { protocolVersion: '1' }, { protocolVersion: 1 }, { protocolVersion: 2 }]) {
        const c = new Client('V');
        await c.open();
        c.send({ type: 'hello', clientId: 'sim-old-page', ...extra });
        const e = await c.waitFor((m) => m.type === 'error' || m.type === 'welcome', { what: 'error' });
        assert(e.type === 'error' && e.code === 'protocol_version' && e.protocolVersion === PROTOCOL_VERSION, JSON.stringify(e));
        assert((await c.waitClose()) === 4005, '終了コードが 4005 でない');
      }
      const g = await mon.waitFor((m) => m.type === 'state', { from: mon.mark() - 1, what: 'state' });
      assert(g.slots.every((x) => !x.assigned), '版不一致の端末に枠を割り当てた');
    }, { rustOnly: true });

    await check('認可: 同じOriginとPC内の検証接続だけを受け付け、別Origin・null・不正Hostを拒否する', async () => {
      assert(await handshake(BASE) === 101, '同じOriginを拒否した');
      assert(await handshake(undefined) === 101, 'PC内の非ブラウザ接続を拒否した');
      for (const origin of ['http://localhost:19232', 'http://example.invalid', 'null']) {
        assert(await handshake(origin) === 403, `別Originを許可した: ${origin}`);
      }
      assert(await handshake(`http://example.invalid:${PORT}`, `example.invalid:${PORT}`) === 403, '不正Hostを許可した');
    });

    await check('認可: 1接続のhello再送・管理接続への変更では別の枠を割り当てない', async () => {
      for (const next of [{ type: 'hello', clientId: 'sim-duplicate-second', protocolVersion: PROTOCOL_VERSION }, { type: 'monitor', page: 'host' }]) {
        const x = await join('duplicate', { clientId: 'sim-duplicate-first' });
        await welcome(x);
        x.send(next);
        assert(await x.waitClose() === 4007, '識別済み接続の変更を拒否しない');
        assert(x.msgs.filter(m => m.type === 'welcome').length === 1, '同一接続へ複数枠を割り当てた');
        const from = mon.mark();
        mon.send({ type: 'reset' });
        await mon.waitFor(m => m.type === 'state' && m.slots.every(s => !s.assigned), { from, what: 'reset' });
      }
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
      if (target !== 'node') assert(w1.protocolVersion === PROTOCOL_VERSION, `welcome の protocolVersion=${w1.protocolVersion}`);
    });

    await check('トークン: welcome で枠ごとに 128bit 以上の推測困難な値を発行する', async () => {
      const t = [tokens.P1, tokens.P2, tokens.P3];
      assert(t.every((x) => /^[0-9a-f]{32,}$/.test(x || '')), `トークンの形式: ${t.join(',')}`);
      assert(new Set(t).size === 3, '枠どうしでトークンが重複した');
    }, { rustOnly: true });

    await check('トークン: clientId が同じでもトークンなし・不一致の再接続は 4006 で拒否し、元の接続を奪わない', async () => {
      for (const token of [undefined, '0'.repeat(32), tokens.P3]) {
        const x = new Client('hijack');
        await x.open();
        x.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, clientId: ids.P2, token });
        const e = await x.waitFor((m) => m.type === 'error' || m.type === 'welcome', { what: 'bad_token' });
        assert(e.type === 'error' && e.code === 'bad_token', `乗っ取りを許した: ${JSON.stringify(e)}`);
        assert((await x.waitClose()) === 4006, '終了コードが 4006 でない');
      }
      await sleep(100);
      assert(p2.closed === null, '元の P2 の接続が切られた');
    }, { rustOnly: true });

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

    await check('PC画面: ロビーでは P1 のリモコン操作だけを PC 画面へ remote で知らせる', async () => {
      const from = mon.mark();
      p1.input('RIGHT', 'down');
      const r = await mon.waitFor((m) => m.type === 'remote', { from, what: 'remote' });
      assert(r.control === 'RIGHT' && r.state === 'down', JSON.stringify(r));
      p1.input('RIGHT', 'up');
      await mon.waitFor((m) => m.type === 'remote' && m.state === 'up', { from, what: 'remote up' });
      const from2 = mon.mark();
      p2.input('UP', 'down'); // P2 はリモコンを持たない
      p3.input('ENTER', 'down');
      p1.input('JUMP', 'down'); // リモコンの操作名ではない
      await sleep(300);
      assert(!mon.msgs.slice(from2).some((m) => m.type === 'remote'), 'P1 のリモコン以外を知らせた');
      p2.input('UP', 'up');
      p3.input('ENTER', 'up');
      p1.input('JUMP', 'up');
    }, { rustOnly: true });

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
      p3.send({ type: 'input', iseq: n + 1, epoch: p3.epoch, button: 'USE', state: 'up', t: 0 });
      await sleep(100);
      assert(!p3.msgs.slice(from).some((m) => m.type === 'ack' && m.iseq === n + 1), '欠番を待たずに処理した');
      const mfrom = mon.mark();
      p3.send({ type: 'input', iseq: n, epoch: p3.epoch, button: 'USE', state: 'down', t: 0 });
      p3.send({ type: 'input', iseq: n, epoch: p3.epoch, button: 'USE', state: 'down', t: 0 });
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
      p3.send({ type: 'look', lseq: 1, epoch: p3.epoch, cx: 500, cy: 0 }); // P3 は無視
      await sleep(300);
      assert(!mon.msgs.slice(from).some((m) => m.type === 'look'), 'P3 の look を反映した');
      p2.send({ type: 'look', lseq: 1, epoch: p2.epoch, cx: 40, cy: -20 });
      const l = await mon.waitFor((m) => m.type === 'look', { from, what: 'look' });
      assert(l.entry.slot === 'P2', 'P2 以外');
    });

    await check('epoch: 進行が変わるたびに増え、PAUSE・RESUME の直前に送られた入力と視点を新しい状態で処理しない', async () => {
      // coop で押した LEFT (= A キー) が PAUSE の後に届いても、paused のリモコン (← キー) として扱わない
      const e0 = p1.epoch;
      assert(Number.isInteger(e0), `game に epoch がない: ${e0}`);
      let from = mon.mark();
      let pfrom = p1.mark();
      p1.send({ type: 'command', cmd: 'PAUSE' });
      p1.input('LEFT', 'down', { epoch: e0 });
      const g1 = await phaseIs(p1, 'paused', pfrom);
      assert(g1.game.epoch > e0, `PAUSE で epoch が増えない: ${e0} → ${g1.game.epoch}`);
      const ack = await p1.waitFor((m) => m.type === 'ack' && m.iseq === p1.iseq, { from: pfrom, what: 'ack' });
      assert(ack.stale === true, '古い入力に stale が付かない');
      await noPress(mon, from);
      p1.input('LEFT', 'up', { epoch: e0 });
      // paused で押した LEFT (= ← キー) が RESUME の後に届いても、coop の A キーとして扱わない
      const e1 = p1.epoch;
      from = mon.mark();
      pfrom = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      p1.input('LEFT', 'down', { epoch: e1 });
      const g2 = await phaseIs(p1, 'coop', pfrom);
      assert(g2.game.epoch > e1, 'RESUME で epoch が増えない');
      p2.send({ type: 'look', lseq: 2, epoch: e1, cx: 900, cy: 0 }); // paused のときの視点が coop で届いた
      await noPress(mon, from);
      assert(!mon.msgs.slice(from).some((m) => m.type === 'look'), 'RESUME 後に古い epoch の視点を反映した');
      p1.input('LEFT', 'up', { epoch: e1 });
      // epoch のない入力も処理しない
      from = mon.mark();
      p1.input('JUMP', 'down', { epoch: undefined });
      await noPress(mon, from);
      p1.input('JUMP', 'up', { epoch: undefined });
      // 現在の epoch なら処理する
      from = mon.mark();
      p1.input('JUMP', 'down');
      await injected(mon, 'SPACE', 'down', from);
      p1.input('JUMP', 'up');
      await injected(mon, 'SPACE', 'up', from);
    }, { rustOnly: true });

    await check('epoch: 旧視点の欠落・遅延が新epochの累積値と順序番号へ混ざらない', async () => {
      const old = p2.epoch;
      // 古いepochでcx=1000まで動いた最終パケットは失われ、ホストへ届かない。
      let from = p1.mark();
      p1.send({ type: 'command', cmd: 'PAUSE' });
      await phaseIs(p1, 'paused', from);
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      const resumed = await phaseIs(p1, 'coop', from);
      await p2.waitFor(m => m.type === 'game' && m.game.epoch === resumed.game.epoch);
      await sleep(300); // 以前の視点レポートが出終わるまで待つ
      from = mon.mark();
      // 旧パケットが届かないまま、新epochではseq=1、累積値10から始める。
      p2.send({ type: 'look', lseq: 1, epoch: p2.epoch, cx: 10, cy: 0 });
      await sleep(1000);
      let dx = mon.msgs.slice(from).filter(m => m.type === 'look').reduce((sum, m) => sum + m.entry.dx, 0);
      assert(Math.abs(dx - 10) <= 1, `新epochの10以外が混入した: dx=${dx}`);
      from = mon.mark();
      p2.send({ type: 'look', lseq: 101, epoch: old, cx: 2000, cy: 0 });
      p2.send({ type: 'look', lseq: 2, epoch: p2.epoch, cx: 15, cy: 0 });
      await sleep(1000);
      dx = mon.msgs.slice(from).filter(m => m.type === 'look').reduce((sum, m) => sum + m.entry.dx, 0);
      assert(Math.abs(dx - 5) <= 1, `遅延パケットが基準を変更した: dx=${dx}`);
    }, { rustOnly: true });

    await check('入力先: 常時 ON でも前面が入力先でなくなったら全解放し、押下を注入しない。PC 画面とスマホに知らせる', async () => {
      p1.input('FWD', 'up');
      await sleep(150);
      let mfrom = mon.mark();
      p1.input('FWD', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      mfrom = mon.mark();
      const from = p1.mark();
      host.child.stdin.write('target off\n'); // 例: Alt+Tab で別のウィンドウへ切り替えた
      await injected(mon, 'KEY_W', 'up', mfrom);
      const st = await mon.waitFor((m) => m.type === 'state' && m.inject.target && !m.inject.target.ok, { from: mfrom, what: 'target off' });
      assert(st.inject.mode === 'on' && !st.inject.active, '入力先でないのに注入が有効');
      const g = await p1.waitFor((m) => m.type === 'game' && m.game.inputTarget === true, { from, what: 'inputTarget' });
      assert(g.game.inputActive === false && g.game.phase === 'coop', JSON.stringify(g.game));
      let notifyFrom = p1.mark();
      mon.send({ type: 'inject_mode', mode: 'off' });
      await p1.waitFor(m => m.type === 'game' && !m.game.inputActive && !m.game.inputTarget, { from: notifyFrom });
      notifyFrom = p1.mark();
      mon.send({ type: 'inject_mode', mode: 'on' });
      await p1.waitFor(m => m.type === 'game' && !m.game.inputActive && m.game.inputTarget, { from: notifyFrom });
      p1.input('FWD', 'up');
      mfrom = mon.mark();
      p1.input('JUMP', 'down');
      await noPress(mon, mfrom);
      p1.input('JUMP', 'up');
      // 入力先へ戻ったら、新しい押下から注入する (旧押下は戻さない)
      mfrom = mon.mark();
      host.child.stdin.write('target on\n');
      await mon.waitFor((m) => m.type === 'state' && m.inject.active, { from: mfrom, what: 'target on' });
      await noPress(mon, mfrom, 200);
      p1.input('JUMP', 'down');
      await injected(mon, 'SPACE', 'down', mfrom);
      p1.input('JUMP', 'up');
      await injected(mon, 'SPACE', 'up', mfrom);
    }, { rustOnly: true });

    await check('入力先: フォーカス喪失前と対象外の間に届いた欠番待ち入力を、復帰後へ持ち越さない', async () => {
      const old = p1.epoch;
      const n = p1.iseq + 1;
      p1.send({ type: 'input', iseq: n + 1, epoch: old, button: 'JUMP', state: 'down' });
      let from = p1.mark();
      host.child.stdin.write('target off\n');
      const off = await p1.waitFor(m => m.type === 'game' && m.game.inputTarget === true, { from });
      assert(off.game.epoch > old, '入力先から外れてもepochが変わらない');
      p1.send({ type: 'input', iseq: n + 2, epoch: off.game.epoch, button: 'FWD', state: 'down' });
      from = p1.mark();
      host.child.stdin.write('target on\n');
      const on = await p1.waitFor(m => m.type === 'game' && m.game.inputActive, { from });
      assert(on.game.epoch > off.game.epoch, '入力先へ戻ってもepochが変わらない');
      const mfrom = mon.mark();
      p1.send({ type: 'input', iseq: n, epoch: old, button: 'JUMP', state: 'up' });
      p1.iseq = n + 2;
      const ack = await p1.waitFor(m => m.type === 'ack' && m.iseq === n + 2);
      assert(ack.stale, '対象外の入力を復帰後に処理した');
      await noPress(mon, mfrom);
      p1.input('JUMP', 'down');
      await injected(mon, 'SPACE', 'down', mfrom);
      p1.input('JUMP', 'up');
      await injected(mon, 'SPACE', 'up', mfrom);
    }, { rustOnly: true });

    await check('切断: coop 中の切断で paused、切断者以外の押下も全解放する', async () => {
      p1.input('FWD', 'up'); // 前の試験の押下が残っていれば離す (既に離れていれば何もしない)
      await sleep(150);
      let from = mon.mark();
      p1.input('FWD', 'down'); // P1 が押したまま
      p3.input('USE', 'down'); // P3 も押したまま
      await injected(mon, 'KEY_W', 'down', from);
      await injected(mon, 'MOUSE_R', 'down', from);
      p2.send({ type: 'look', lseq: 3, epoch: p2.epoch, cx: 4000, cy: 0 }); // 未処理の視点を残す
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

    await check('再接続: 正しいトークンで接続を置換すると全解放し、旧押下を持ち越さない', async () => {
      let from = mon.mark();
      mon.send({ type: 'auto_resume', on: false });
      await mon.waitFor(m => m.type === 'game' && m.game.autoResume === false, { from });
      p1.input('FWD', 'down');
      p3.input('USE', 'down');
      await injected(mon, 'KEY_W', 'down', from);
      await injected(mon, 'MOUSE_R', 'down', from);
      const old = p1;
      from = mon.mark();
      p1 = await join('P1');
      const w = await welcome(p1);
      assert(w.reconnected && w.slot === 'P1', '同じ枠へ戻らない');
      assert(await old.waitClose() === 4000, '古い接続を閉じない');
      await phaseIs(p1, 'paused', 0);
      await injected(mon, 'KEY_W', 'up', from);
      await injected(mon, 'MOUSE_R', 'up', from);
      await sleep(200);
      assert(!mon.msgs.slice(from).some(m => m.type === 'inject' && m.entry.state === 'down'), '置換後に旧押下を復元した');
      p3.input('USE', 'up');
      const pfrom = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', pfrom);
      mon.send({ type: 'auto_resume', on: true });
    }, { rustOnly: true });

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

    await check('緊急停止: 全員の押下を即座に解放し、注入を OFF にして一時停止する (自動復帰しない)', async () => {
      let from = p1.mark();
      const from3 = p3.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      await phaseIs(p3, 'coop', from3); // P3 も新しい epoch を受け取ってから押す
      let mfrom = mon.mark();
      p1.input('FWD', 'down');
      p3.input('ATTACK', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      await injected(mon, 'MOUSE_L', 'down', mfrom);
      mfrom = mon.mark();
      from = p1.mark();
      host.child.stdin.write('stop\n');
      await injected(mon, 'KEY_W', 'up', mfrom);
      await injected(mon, 'MOUSE_L', 'up', mfrom);
      const g = await phaseIs(p1, 'paused', from);
      assert(g.game.reason === 'emergency stop', `reason=${g.game.reason}`);
      const st = await mon.waitFor((m) => m.type === 'state' && m.inject.mode === 'off', { from: mfrom, what: 'inject off' });
      assert(!st.inject.active, '注入が有効のまま');
      assert(st.inject.emergencyHotkey, 'ホットキーの表示がない');
      p1.input('FWD', 'up');
      p3.input('ATTACK', 'up');
      // 押し直しても注入しない (OFF のまま)
      mfrom = mon.mark();
      p1.input('UP', 'down');
      await noInject(mon, mfrom);
      p1.input('UP', 'up');
      mon.send({ type: 'inject_mode', mode: 'on' });
      await mon.waitFor((m) => m.type === 'state' && m.inject.mode === 'on', { what: 'inject on' });
    }, { rustOnly: true });

    await check('緊急停止: 切断待ちのpaused中でも自動復帰を解除し、全員戻っても再開しない', async () => {
      let from = p1.mark();
      mon.send({ type: 'auto_resume', on: true });
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      from = p1.mark();
      p2.close();
      await p1.waitFor(m => m.type === 'game' && m.game.phase === 'paused' && /disconnected$/.test(m.game.reason || ''), { from });
      from = p1.mark();
      host.child.stdin.write('stop\n');
      const stopped = await p1.waitFor(m => m.type === 'game' && m.game.reason === 'emergency stop', { from });
      assert(stopped.game.autoResumeUntil === 0, '自動復帰の期限が残っている');
      from = p1.mark();
      p2 = await join('P2');
      await welcome(p2);
      await sleep(350);
      assert(!p1.msgs.slice(from).some(m => m.type === 'game' && m.game.phase === 'coop'), '緊急停止後に自動復帰した');
    }, { rustOnly: true });

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

    await check('トークン: PC 画面へのメッセージとログファイルにトークンを含めない', async () => {
      const all = JSON.stringify(mon.msgs);
      for (const k of ['P1', 'P2', 'P3']) assert(!all.includes(tokens[k]), `${k} のトークンが PC 画面に出た`);
      await sleep(1200); // ログは 1 秒ごとに書き出される
      const files = fs.readdirSync(host.logDir).filter((f) => f.endsWith('.jsonl'));
      assert(files.length > 0, 'ログファイルがない');
      const log = files.map((f) => fs.readFileSync(path.join(host.logDir, f), 'utf8')).join('');
      for (const k of ['P1', 'P2', 'P3']) assert(!log.includes(tokens[k]), `${k} のトークンがログに出た`);
    }, { rustOnly: true });

    await check('ログ: IP・User-Agent・clientId を記録せず、枠名と端末の種類だけを残す', async () => {
      await sleep(1200); // ログは 1 秒ごとに書き出される
      const log = fs
        .readdirSync(host.logDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => fs.readFileSync(path.join(host.logDir, f), 'utf8'))
        .join('');
      for (const bad of ['sim-client-', 'sim-intruder', 'sim-old-page', '127.0.0.1', '::1', 'protocol-sim', '"clientId"', '"ip"', '"ua"']) {
        assert(!log.includes(bad), `ログに ${bad} が含まれる`);
      }
      const joins = log.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'join');
      assert(joins.length >= 3 && joins.every((e) => e.slot && e.device), `join の記録: ${JSON.stringify(joins[0])}`);
    }, { rustOnly: true });

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
