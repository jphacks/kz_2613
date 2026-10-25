// 通信契約 (docs/architecture/protocol.md) のシミュレーション。
// ホストを RECOOPLAY_DRY_RUN=1 (OS へ入力を送らない) で起動し、スマホ 3 台と PC 画面を模した WebSocket で
// 役割・認可・進行・入力の先着 1 回処理・切断時の全解放・復帰設定を照合する。
// 入力注入は行わないので、ゲームや実機の合格の代わりにはならない。
//
//   node scripts/sim/protocol-sim.mjs            # Rust 版 (apps/host-rs/target/release/recooplay-host.exe)
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
const PORT = Number(opt('--port', 18000 + Math.floor(Math.random() * 1000)));
const BASE = `http://127.0.0.1:${PORT}`;
const PROTOCOL_VERSION = 4;

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

// 手元の PC の Steam・Epic を読まないよう、偽のランチャー情報を作る (Rust 版。dry-run のときだけ読む)
function fakeGames(dir) {
  const root = path.join(dir, 'games');
  const steam = path.join(root, 'steam', 'steamapps');
  fs.mkdirSync(path.join(steam, 'common', 'Stardew Valley'), { recursive: true });
  fs.mkdirSync(path.join(steam, 'common', 'Steamworks Shared'), { recursive: true });
  fs.writeFileSync(path.join(steam, 'appmanifest_413150.acf'), '"AppState" { "appid" "413150" "name" "Stardew Valley" "StateFlags" "4" "installdir" "Stardew Valley" }');
  // Minecraft のランチャー (#128)。中身のない実行ファイルでも、Windows の汎用のアイコンを取り出せる
  fs.mkdirSync(path.join(root, 'minecraft'), { recursive: true });
  fs.writeFileSync(path.join(root, 'minecraft', 'Minecraft.exe'), '');
  // 一覧のタイルの画像 (#121)。Steam のライブラリの画像のキャッシュを模す
  fs.mkdirSync(path.join(root, 'steam', 'appcache', 'librarycache', '413150'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steam', 'appcache', 'librarycache', '413150', 'library_600x900.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(steam, 'appmanifest_228980.acf'), '"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" "StateFlags" "4" "installdir" "Steamworks Shared" }');
  const gamma = path.join(root, 'epic-install', 'Gamma');
  fs.mkdirSync(gamma, { recursive: true });
  fs.mkdirSync(path.join(root, 'epic'), { recursive: true });
  fs.writeFileSync(path.join(root, 'epic', 'gamma.item'), JSON.stringify({ AppName: 'Gamma', DisplayName: 'Gamma', InstallLocation: gamma, AppCategories: ['games'] }));
  return root;
}

// ---------- ホストの起動 (必ず注入なし) ----------
function startHost() {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-sim-'));
  const optionsFile = path.join(logDir, 'options.txt');
  fs.copyFileSync(path.join(ROOT, 'scripts', 'sim', 'fixtures', 'minecraft-options.txt'), optionsFile);
  const profilesDir=path.join(logDir,'profiles');
  fs.cpSync(path.join(ROOT,'apps/game-profiles'),profilesDir,{recursive:true});
  fs.copyFileSync(path.join(ROOT,'scripts/sim/fixtures/profiles/test-pseudo.json'),path.join(profilesDir,'test-pseudo.json'));
  // config.json の影響を受けないよう、画面だけを持つ一時ルートを使う
  const env = { ...process.env, RECOOPLAY_DRY_RUN: '1', PORT: String(PORT), RECOOPLAY_LOG_DIR: logDir, RECOOPLAY_ROOT: ROOT, RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_FAKE_GAMES: fakeGames(logDir),
    // Minecraft のキー設定の試験用 (ダッシュ = Q、捨てる = R に変えた options.txt)。#101
    RECOOPLAY_MINECRAFT_OPTIONS: optionsFile, RECOOPLAY_PROFILES_DIR: profilesDir };
  const exe = process.platform === 'win32' ? 'recooplay-host.exe' : 'recooplay-host';
  const cmd = opt('--bin', path.join(ROOT, 'apps', 'host-rs', 'target', 'release', exe));
  // 標準入力: "stop" で緊急停止 (ホットキーと同じ処理) を受け付ける
  const child = spawn(cmd, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  return { child, output: () => out, logDir, optionsFile };
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
    if ((m.type === 'command' || m.type === 'role_ok') && !('epoch' in m)) m = {...m, epoch: this.epoch};
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

const ids = { P1: 'sim-client-p1', P2: 'sim-client-p2', P3: 'sim-client-p3', P4: 'sim-client-p4', P5: 'sim-client-p5' };
const tokens = {};

async function join(key, extra = {}) {
  const c = new Client(key);
  await c.open();
  c.send({ type: 'hello', clientId: ids[key], ua: 'protocol-sim', protocolVersion: PROTOCOL_VERSION, ...(tokens[key] ? { token: tokens[key] } : {}), ...extra });
  return c;
}

// PC 画面の「この分担で決定」(#109)。P1 に届いた最新のゲーム・接続者で決定する
async function confirmLineup(c, p1) {
  const g = [...p1.msgs].reverse().find((m) => m.type === 'game')?.game;
  const from = p1.mark();
  c.send({ type: 'confirm_lineup', title: g.title, members: g.connected, epoch: g.epoch });
  await p1.waitFor((m) => m.type === 'game' && m.game.lineupOk, { from, what: 'lineupOk' });
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
  console.log(`protocol-sim: port=${PORT} (RECOOPLAY_DRY_RUN=1)`);
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
      for (const extra of [ {protocolVersion:3}, { protocolVersion: undefined }, { protocolVersion: PROTOCOL_VERSION + 1 }, { protocolVersion: '1' }, { protocolVersion: 1 }, { protocolVersion: 2 }]) {
        const c = new Client('V');
        await c.open();
        c.send({ type: 'hello', clientId: 'sim-old-page', ...extra });
        const e = await c.waitFor((m) => m.type === 'error' || m.type === 'welcome', { what: 'error' });
        assert(e.type === 'error' && e.code === 'protocol_version' && e.protocolVersion === PROTOCOL_VERSION, JSON.stringify(e));
        assert((await c.waitClose()) === 4005, '終了コードが 4005 でない');
      }
      const g = await mon.waitFor((m) => m.type === 'state', { from: mon.mark() - 1, what: 'state' });
      assert(g.slots.every((x) => !x.assigned), '版不一致の端末に枠を割り当てた');
    });

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
      assert(w1.protocolVersion === PROTOCOL_VERSION, `welcome の protocolVersion=${w1.protocolVersion}`);
    });

    await check('トークン: welcome で枠ごとに 128bit 以上の推測困難な値を発行する', async () => {
      const t = [tokens.P1, tokens.P2, tokens.P3];
      assert(t.every((x) => /^[0-9a-f]{32,}$/.test(x || '')), `トークンの形式: ${t.join(',')}`);
      assert(new Set(t).size === 3, '枠どうしでトークンが重複した');
    });

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
    });

    await check('役割: 満員 (5 台目、#57) は full で拒否し 4004 で閉じる', async () => {
      // 4 台目は P4 として参加できる (ホスト権はない)。この試験の後は切断したまま枠を保つ
      const p4 = await join('P4');
      const w4 = await welcome(p4);
      assert(w4.type === 'welcome' && w4.slot === 'P4' && !w4.isHost, JSON.stringify(w4));
      const c = await join('P5');
      const w = await c.waitFor((m) => m.type === 'full', { what: 'full' });
      assert(w, 'full が来ない');
      assert((await c.waitClose()) === 4004, '終了コードが 4004 でない');
      const from = mon.mark();
      p4.close();
      await mon.waitFor((m) => m.type === 'state' && m.slots.find((s) => s.name === 'P4')?.connected === false, { from, what: 'P4 切断' });
    });

    await check('認可: スマホが hello で枠・ホスト権を指定しても無視する', async () => {
      const x = new Client('X');
      await x.open();
      x.send({ type: 'hello', clientId: 'sim-intruder', protocolVersion: PROTOCOL_VERSION, slot: 'P1', isHost: true });
      const w = await x.waitFor((m) => m.type === 'full' || m.type === 'welcome', { what: 'full' });
      assert(w.type === 'full', `満員なのに受け付けた: ${JSON.stringify(w)}`);
    });

    await check('PC画面: ロビーでは P1 のリモコン操作だけを PC 画面へ remote で知らせる', async () => {
      const app = new Client('認可されたPC画面'); await app.open(); app.send({type:'monitor',page:'app'});
      await app.waitFor(m=>m.type==='state');
      const efrom = p1.mark(); app.send({type:'focus',focused:true});
      await p1.waitFor(m=>m.type==='game' && m.game.remoteRoute==='app',{from:efrom});
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
      const rfrom = mon.mark();
      p2.send({type:'remote',kind:'move',dx:40,dy:20,rseq:1,epoch:p2.epoch});
      p1.send({type:'remote',kind:'move',dx:30,dy:10,rseq:1,epoch:0});
      await sleep(100);
      assert(!mon.msgs.slice(rfrom).some(m=>m.type==='remote' && m.kind==='move'),'P2または旧epochを認可した');
      p1.send({type:'remote',kind:'move',dx:5000,dy:-5000,rseq:2,epoch:p1.epoch});
      const move = await mon.waitFor(m=>m.type==='remote' && m.kind==='move',{from:rfrom});
      assert(move.dx===120 && move.dy===-120 && move.route==='app',JSON.stringify(move));
      const duplicate = mon.mark();
      p1.send({type:'remote',kind:'move',dx:20,dy:10,rseq:2,epoch:p1.epoch});
      await sleep(100); assert(!mon.msgs.slice(duplicate).some(m=>m.type==='remote'),'重複を処理した');
      app.send({type:'focus',focused:false});
      await p1.waitFor(m=>m.type==='game' && m.game.remoteRoute==='none',{from:efrom});
      app.close();
    });

    await check('進行: P1だけが準備と明示Readyを実行でき、P2・P3・PC画面から迂回できない', async () => {
      let from = p1.mark();
      p2.send({type:'command',cmd:'PREPARE'}); p3.send({type:'command',cmd:'READY'});
      mon.send({type:'phase',phase:'coop'});
      await sleep(100);
      assert(!p1.msgs.slice(from).some(m=>m.type==='game' && m.game.phase==='coop'), '管理画面/P2/P3から開始した');
      p1.send({type:'command',cmd:'READY'});
      await p1.waitFor(m=>m.type==='command_result' && !m.accepted,{from});
      // 入力の初期値は on (#114)。手動で ON にしなくても、準備の後に Ready できる
      const initial=[...mon.msgs].reverse().find(m=>m.type==='state');
      assert(initial.inject.mode==='on', `入力の初期値=${initial.inject.mode}`);
      await confirmLineup(mon, p1); p1.send({type:'command',cmd:'PREPARE'});
      const prepared = await phaseIs(p1,'preparing',from);
      assert(prepared.game.canReady && !prepared.game.hostReady, '入力の初期値でReadyできない');
      // 入力を止めると (緊急停止・診断) Ready できず、PC 画面で再開すると Ready できる
      from = p1.mark();
      mon.send({type:'inject_mode',mode:'off'});
      const off = await p1.waitFor(m=>m.type==='game' && !m.game.canReady,{from});
      assert(off.game.readyReasons.some(r=>r.includes('入力を再開する')), JSON.stringify(off.game.readyReasons));
      p1.send({type:'command',cmd:'READY'});
      await p1.waitFor(m=>m.type==='command_result' && m.cmd==='READY' && !m.accepted,{from});
      mon.send({type:'inject_mode',mode:'on'});
      await p1.waitFor(m=>m.type==='game' && m.game.canReady,{from});
      let gateFrom=p1.mark();
      host.child.stdin.write('target off\n');
      await p1.waitFor(m=>m.type==='game' && m.game.inputTarget,{from:gateFrom});
      p1.send({type:'command',cmd:'READY'});
      await p1.waitFor(m=>m.type==='command_result' && !m.accepted,{from:gateFrom});
      gateFrom=p1.mark();host.child.stdin.write('target on\n');
      await p1.waitFor(m=>m.type==='game' && m.game.canReady,{from:gateFrom});
      // 2人でもReadyできる (#57)。1人ではReadyできず、PC画面から必要人数を減らしても迂回できない
      // 準備中に参加者が変わったら、決定し直すまで Ready できない (#109)
      gateFrom=p1.mark();p3.close();
      const changed=await p1.waitFor(m=>m.type==='game' && m.game.connected.length===2,{from:gateFrom});
      assert(!changed.game.canReady && !changed.game.lineupOk,'参加者が変わったのに古い決定でReadyできる');
      await confirmLineup(mon,p1);
      await p1.waitFor(m=>m.type==='game' && m.game.connected.length===2 && m.game.canReady,{from:gateFrom});
      gateFrom=p1.mark();p2.close();
      await p1.waitFor(m=>m.type==='game' && m.game.connected.length===1,{from:gateFrom});
      mon.send({type:'required',required:1});
      p1.send({type:'command',cmd:'READY'});
      await p1.waitFor(m=>m.type==='command_result' && !m.accepted,{from:gateFrom});
      gateFrom=p1.mark();p2=await join('P2');await welcome(p2);p3=await join('P3');await welcome(p3);
      await p1.waitFor(m=>m.type==='game' && m.game.connected.length===3,{from:gateFrom});
      await confirmLineup(mon,p1);
      await p1.waitFor(m=>m.type==='game' && m.game.canReady && m.game.required===2 && m.game.connected.length===3,{from:gateFrom});
      const rm = mon.mark();
      p2.input('FWD','down'); p3.input('ATTACK','down');
      p2.send({type:'remote',kind:'move',dx:15,dy:5,rseq:1,epoch:p2.epoch});
      await noPress(mon,rm,100);
      assert(!mon.msgs.slice(rm).some(m=>m.type==='remote_input'),'P2のメニュー操作を注入した');
      p1.send({type:'remote',kind:'move',dx:15,dy:5,rseq:3,epoch:p1.epoch});
      await mon.waitFor(m=>m.type==='remote_input' && m.entry.ok,{from:rm});
      // 2本指のスクロール (#122): 量に合わせてホイールを 1〜3 段。下へのスクロールは負の向き
      p1.send({type:'remote',kind:'scroll',dy:100,rseq:4,epoch:p1.epoch});
      const wheel = await mon.waitFor(m=>m.type==='remote_input' && m.entry.kind==='scroll',{from:rm});
      assert(wheel.entry.notches===-3 && wheel.entry.ok, JSON.stringify(wheel.entry));
      p1.send({type:'remote',kind:'scroll',dy:-30,rseq:5,epoch:p1.epoch});
      await mon.waitFor(m=>m.type==='remote_input' && m.entry.kind==='scroll' && m.entry.notches===1,{from:rm});
      p1.input('REMOTE_LEFT','down'); await injected(mon,'MOUSE_L','down',rm);
      p1.send({type:'remote',kind:'release',rseq:6,epoch:p1.epoch});
      await injected(mon,'MOUSE_L','up',rm);
      await p1.waitFor(m=>m.type==='game' && m.game.epoch>prepared.game.epoch,{from});
      from = p1.mark();
      p1.send({type:'command',cmd:'READY',epoch:0});
      await p1.waitFor(m=>m.type==='command_result' && !m.accepted,{from});
      p1.send({type:'command',cmd:'READY'});
      const c = await phaseIs(p1,'coop',from);
      assert(c.game.reason === 'host ready', `reason=${c.game.reason}`);
    });

    await check('通信: 準備〜協力プレイの間だけ低遅延の動作にし、BluetoothでPCの音を出していることを知らせる (#131)', async () => {
      const lobby = mon.msgs.find((m) => m.type === 'state' && m.game.phase === 'lobby' && m.network);
      assert(lobby && lobby.network.lowLatency === false, 'ロビーで低遅延の動作になっている');
      const coop = await mon.waitFor((m) => m.type === 'state' && m.game.phase === 'coop', { from: Math.max(0, mon.mark() - 5), what: 'coop の状態' });
      assert(coop.network.lowLatency === true, JSON.stringify(coop.network));
      let from = mon.mark();
      host.child.stdin.write('bt on\n');
      await mon.waitFor((m) => m.type === 'state' && m.network?.bluetoothAudio === true, { from, what: 'bt on' });
      from = mon.mark();
      host.child.stdin.write('bt off\n');
      await mon.waitFor((m) => m.type === 'state' && m.network?.bluetoothAudio === false, { from, what: 'bt off' });
      assert(coop.slots.filter((x) => x.connected).every((x) => x.net && typeof x.net.stalls === 'number'), '枠ごとの途切れの数がない');
    });

    // 以降の注入はモニターで観測する (DRY_RUN なので OS には送られない)
    { const nextState = p1.mark(); mon.send({ type: 'inject_mode', mode: 'on' }); await p1.waitFor(m=>m.type==='game',{from:nextState}); }
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

    await check('キー設定: Minecraft の options.txt に合わせて送る (ダッシュ = Q、捨てる = R)', async () => {
      const st = await mon.waitFor((m) => m.type === 'state' && m.game?.keys, { what: 'keys' });
      const k = st.game.keys;
      assert(k.source === 'options', `source=${k.source}`);
      assert(k.controls.SPRINT?.out === 'KEY_Q' && k.controls.DROP?.out === 'KEY_R' && k.controls.FWD?.out === 'KEY_W', JSON.stringify(k.controls));
      let from = mon.mark();
      p1.input('SPRINT', 'down');
      await injected(mon, 'KEY_Q', 'down', from);
      p1.input('SPRINT', 'up');
      await injected(mon, 'KEY_Q', 'up', from);
      from = mon.mark();
      p3.input('DROP', 'down');
      await injected(mon, 'KEY_R', 'down', from);
      p3.input('DROP', 'up');
      await injected(mon, 'KEY_R', 'up', from);
      assert(!mon.msgs.slice(from).some((m) => m.type === 'inject' && m.entry.out === 'KEY_Q'), '捨てるでダッシュ (Q) を送った');
    });

    await check('キー再読込: 停止中の設定変更で旧キーを解放しepochを更新する', async () => {
      let from = p1.mark();
      p1.send({type:'command',cmd:'PAUSE'});
      await phaseIs(p1,'paused',from);
      const oldEpoch = p1.epoch;
      const mfrom = mon.mark();
      p1.input('REMOTE_E','down');
      await injected(mon,'KEY_E','down',mfrom);
      const original = fs.readFileSync(host.optionsFile,'utf8');
      from = p1.mark();
      fs.writeFileSync(host.optionsFile,original+'\nkey_key.inventory:key.keyboard.f\n');
      await p1.waitFor(m=>m.type==='game' && m.game.keys?.controls.INV?.out==='KEY_F' && m.game.epoch>oldEpoch,{from,timeout:3000,what:'設定変更の通知'});
      await injected(mon,'KEY_E','up',mfrom);
      p1.input('REMOTE_E','up');
      from = p1.mark();
      fs.writeFileSync(host.optionsFile,original);
      await p1.waitFor(m=>m.type==='game' && m.game.keys?.controls.INV?.out==='KEY_E',{from,timeout:3000});
      from = p1.mark(); const f2=p2.mark(),f3=p3.mark();
      p1.send({type:'command',cmd:'RESUME'});
      await phaseIs(p1,'coop',from); await phaseIs(p2,'coop',f2); await phaseIs(p3,'coop',f3);
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

    await check('キャンセル: 非表示・回転・診断の停止要求で全参加者の押下・保留連打・旧入力を即時破棄する', async () => {
      p1.input('FWD','up'); p3.input('ATTACK','up'); await sleep(150);
      const from = mon.mark(), playerFrom = p1.mark(), old = p1.epoch;
      p1.input('FWD','down'); p3.input('ATTACK','down');
      await injected(mon,'KEY_W','down',from); await injected(mon,'MOUSE_L','down',from);
      p3.input('ATTACK','up');p3.input('ATTACK','down');
      const queuedUp=p3.input('ATTACK','up');
      await p3.waitFor(m=>m.type==='ack'&&m.iseq===queuedUp);
      p2.send({type:'release_inputs',epoch:p2.epoch});
      await injected(mon,'KEY_W','up',from); await injected(mon,'MOUSE_L','up',from);
      await p1.waitFor(m=>m.type==='game' && m.game.epoch>old,{from:playerFrom});
      const staleFrom = mon.mark();
      p1.input('FWD','down',{epoch:old});
      await noPress(mon,staleFrom,500);
      p1.input('FWD','up'); p3.input('ATTACK','up');
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
    });

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
    });

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
      { const nextState = p1.mark(); mon.send({ type: 'inject_mode', mode: 'on' }); await p1.waitFor(m=>m.type==='game',{from:nextState}); }
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
    });

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
    });

    await check('PCアプリ: coop 中に PC アプリへ手動で戻ると全解放して paused、P1 はリモコンに戻り役割は変わらない', async () => {
      const app = new Client('app');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      await app.waitFor((m) => m.type === 'state', { what: 'app state' });
      app.send({ type: 'focus', focused: false }); // 準備の後に Minecraft を前面にした
      await sleep(150);
      let mfrom = mon.mark();
      p1.input('FWD', 'down');
      p3.input('USE', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      await injected(mon, 'MOUSE_R', 'down', mfrom);
      mfrom = mon.mark();
      const from = p1.mark();
      app.send({ type: 'focus', focused: true }); // Alt+Tab などで PC アプリへ戻った
      const g = await phaseIs(p1, 'paused', from);
      assert(g.game.reason === 'app focus' && g.game.autoResumeUntil === 0, JSON.stringify(g.game));
      await injected(mon, 'KEY_W', 'up', mfrom);
      await injected(mon, 'MOUSE_R', 'up', mfrom);
      const st = await mon.waitFor((m) => m.type === 'state' && m.game.phase === 'paused', { from: mfrom, what: 'state paused' });
      assert(st.slots.filter((x) => x.connected).map((x) => x.name).join() === 'P1,P2,P3', '役割が変わった');
      p1.input('FWD', 'up');
      p3.input('USE', 'up');
      // P1 の矢印は PC アプリの画面へ届く
      const afrom = app.mark();
      p1.input('RIGHT', 'down');
      await app.waitFor((m) => m.type === 'remote' && m.control === 'RIGHT', { from: afrom, what: 'remote' });
      p1.input('RIGHT', 'up');
      // 前面のまま focus を送り直しても、一時停止中は何も変えない。RESUME で協力プレイへ戻る
      app.send({ type: 'focus', focused: false });
      await sleep(100);
      const rfrom = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', rfrom);
      app.close();
    });

    await check('PCアプリ: 前面のブラウザ接続を閉じた後も、新しいPC画面への復帰で一時停止する', async () => {
      const app = new Client('app-before-close');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      await app.waitFor(m => m.type === 'state', { what: 'app state' });
      let from = p1.mark();
      app.send({ type: 'focus', focused: true });
      await phaseIs(p1, 'paused', from);
      app.close(); // 閉じた画面からはblurを受け取れないことがある
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      const reopened = new Client('app-reopened');
      await reopened.open();
      reopened.send({ type: 'monitor', page: 'app' });
      await reopened.waitFor(m => m.type === 'state', { what: 'reopened app state' });
      from = p1.mark();
      reopened.send({ type: 'focus', focused: true });
      const paused = await phaseIs(p1, 'paused', from);
      assert(paused.game.reason === 'app focus', '新しいPC画面への復帰で止まらない');
      reopened.close();
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
    });

    await check('PCアプリ: PC アプリから起動したホストは前面のウィンドウ (試験では標準入力で差し替え) で手動復帰を判定し、画面の focus を使わない', async () => {
      host.child.stdin.write('app blur\n'); // Minecraft を前面にした
      await sleep(150);
      let mfrom = mon.mark();
      p1.input('FWD', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      mfrom = mon.mark();
      let from = p1.mark();
      host.child.stdin.write('app focus\n'); // PC アプリのウィンドウへ戻った
      const g = await phaseIs(p1, 'paused', from);
      assert(g.game.reason === 'app focus', JSON.stringify(g.game));
      await injected(mon, 'KEY_W', 'up', mfrom);
      p1.input('FWD', 'up');
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      // ウィンドウの知らせが来た後は、画面 (WebView2 は背面でも focused のまま) の知らせで止めない
      const app = new Client('app');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      await app.waitFor((m) => m.type === 'state', { what: 'app state' });
      host.child.stdin.write('app blur\n');
      await sleep(100);
      from = p1.mark();
      app.send({ type: 'focus', focused: true });
      await sleep(300);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'paused'), '画面の focus で止めた');
      app.close();
    });

    await check('PCアプリ: 通信切断待ちにPC画面へ戻ったら自動復帰を解除し、全員戻っても明示RESUMEまで再開しない', async () => {
      mon.send({ type: 'auto_resume', on: true });
      await mon.waitFor(m => m.type === 'game' && m.game.autoResume, { what: 'autoResume on' });
      let from = p1.mark();
      p3.close();
      const disconnected = await phaseIs(p1, 'paused', from);
      assert(disconnected.game.autoResumeUntil > Date.now(), '自動復帰待機になっていない');
      from = p1.mark();
      host.child.stdin.write('app focus\n');
      await p1.waitFor(m => m.type === 'game' && m.game.reason === 'app focus' && m.game.autoResumeUntil === 0, { from, what: 'manual app return cancels auto resume' });
      from = p1.mark();
      p3 = await join('P3');
      await welcome(p3);
      await sleep(400);
      assert(!p1.msgs.slice(from).some(m => m.type === 'game' && m.game.phase === 'coop'), 'PC画面へ戻ったのに自動復帰した');
      mon.send({ type: 'auto_resume', on: false });
      await mon.waitFor(m => m.type === 'game' && !m.game.autoResume, { what: 'autoResume off' });
      const blurFrom = p1.mark();
      host.child.stdin.write('app blur\n');
      await p1.waitFor(m=>m.type==='game' && m.game.remoteRoute==='game',{from:blurFrom});
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
    });

    await check('PCアプリ: coop 中にゲームを変えると全解放して lobby へ戻り、参加と役割は保つ。同じゲーム・未知のゲームは無視する', async () => {
      const app = new Client('app');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      await app.waitFor((m) => m.type === 'state', { what: 'app state' });
      let from = p1.mark();
      app.send({ type: 'select_game', title: 'minecraft-java' });
      app.send({ type: 'select_game', title: 'unknown-game' });
      await sleep(300);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase !== 'coop'), '同じ・未知のゲームで進行が変わった');
      let mfrom = mon.mark();
      p1.input('FWD', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      mfrom = mon.mark();
      from = p1.mark();
      app.send({ type: 'select_game', title: 'pseudo-game' });
      const g = await phaseIs(p1, 'lobby', from);
      assert(g.game.reason === 'game change' && g.game.title === 'pseudo-game', JSON.stringify(g.game));
      await injected(mon, 'KEY_W', 'up', mfrom);
      p1.input('FWD', 'up');
      assert(g.game.connected.join() === 'P1,P2,P3', '参加者が変わった');
      // 戻して再開
      app.send({ type: 'select_game', title: 'minecraft-java' });
      await p1.waitFor((m) => m.type === 'game' && m.game.title === 'minecraft-java', { from, what: 'title back' });
      from = p1.mark();
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from); p1.send({type:'command',cmd:'READY'});
      await phaseIs(p1, 'coop', from);
      app.close();
    });

    await check('操作定義: 人数に応じた分担 (移動を左・右・ジャンプに分ける) と、生成画面の入力 (割り当てた操作だけ) を通す', async () => {
      const app = new Client('app');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      await app.waitFor((m) => m.type === 'state', { what: 'app state' });
      let from = p1.mark();
      app.send({ type: 'select_game', title: 'pseudo-game' });
      const lobby = await phaseIs(p1, 'lobby', from);
      const pr = lobby.game.profile;
      assert(pr?.id === 'test-pseudo', `profile=${pr?.id}`);
      // 3 人: 単位は「移動・アクション」の 2 つ → 移動を左・右・ジャンプに分け、アクションは最も軽い人 (P1) へ
      const a3 = pr.assignments['3'];
      assert(a3.P1.join() === 'left,action,zoom,aim' && a3.P2.join() === 'right' && a3.P3.join() === 'jump', JSON.stringify(a3));
      assert(pr.assignments['1'].P1.length === 6 && Object.keys(pr.assignments['2']).length === 2 && Object.keys(pr.assignments['4']).length === 4, JSON.stringify(pr.assignments));
      from = p1.mark();
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      p1.send({ type: 'command', cmd: 'READY' });
      const coop = await phaseIs(p1, 'coop', from);
      const st = await mon.waitFor((m) => m.type === 'state' && m.game.phase === 'coop' && m.game.assigned?.P1, { from: mon.mark() - 1, what: 'assigned' });
      assert(st.game.assigned.P2.join() === 'right', JSON.stringify(st.game.assigned));
      // 割り当てた操作は、定義のキーで送る
      let mf = mon.mark();
      p2.input('act:right', 'down'); await injected(mon, 'KEY_D', 'down', mf); p2.input('act:right', 'up'); await injected(mon, 'KEY_D', 'up', mf);
      p3.input('act:jump', 'down'); await injected(mon, 'SPACE', 'down', mf); p3.input('act:jump', 'up'); await injected(mon, 'SPACE', 'up', mf);
      p1.input('act:action', 'down'); await injected(mon, 'KEY_X', 'down', mf); p1.input('act:action', 'up'); await injected(mon, 'KEY_X', 'up', mf);
      p1.input('act:zoom:up', 'down'); await injected(mon, 'WHEEL_UP', 'down', mf); p1.input('act:zoom:up', 'up');
      // 割り当てていない操作・未知の操作・Minecraft 用の固定の操作は送らない
      mf = mon.mark();
      p2.input('act:action', 'down'); p3.input('act:left', 'down'); p1.input('act:nothing', 'down'); p1.input('FWD', 'down'); p1.input('RIGHT', 'down'); p1.input('act:pause', 'down');
      await noPress(mon, mf);
      p2.input('act:action', 'up'); p3.input('act:left', 'up'); p1.input('act:nothing', 'up'); p1.input('FWD', 'up'); p1.input('RIGHT', 'up'); p1.input('act:pause', 'up');
      // 視点は、視点 (aim) を割り当てた P1 だけ
      const lf = mon.mark();
      p2.send({ type: 'look', lseq: 1, epoch: p2.epoch, cx: 300, cy: 0 });
      await sleep(250);
      assert(!mon.msgs.slice(lf).some((m) => m.type === 'look'), 'P2 の look を反映した');
      p1.send({ type: 'look', lseq: 1, epoch: p1.epoch, cx: 40, cy: 0 });
      const l = await mon.waitFor((m) => m.type === 'look', { from: lf, what: 'look' });
      assert(l.entry.slot === 'P1', `slot=${l.entry.slot}`);
      // Minecraft に戻して協力プレイを再開する
      from = p1.mark();
      app.send({ type: 'select_game', title: 'minecraft-java' });
      await phaseIs(p1, 'lobby', from);
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      p1.send({ type: 'command', cmd: 'READY' });
      await phaseIs(p1, 'coop', from);
      assert(coop.game.title === 'pseudo-game', 'title');
      app.close();
    });

    await check('人数: 2人・4人のMinecraftは操作定義の分担で遊び、Ready後に来た人は参加せず、参加者がそろうまで再開しない (#57・#105)', async () => {
      // 前提: Minecraft の協力プレイ中 (P1〜P3)。3人は固定の画面
      let from = p1.mark();
      p1.send({ type: 'command', cmd: 'END' });
      const lobby3 = await phaseIs(p1, 'lobby', from);
      assert(lobby3.game.fixedControls === true, '3人のMinecraftは固定の画面');
      // 2人: P1 移動 / P2 視点＋攻撃・持ち物
      from = p1.mark();
      p3.close();
      const two = await p1.waitFor((m) => m.type === 'game' && m.game.connected.join() === 'P1,P2', { from, what: '2人' });
      assert(two.game.fixedControls === false && two.game.profile.assignment.P2 && !two.game.profile.assignment.P3, JSON.stringify(two.game.profile?.assignment));
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      const f2 = p2.mark();
      p1.send({ type: 'command', cmd: 'READY' });
      const c2 = await phaseIs(p1, 'coop', from);
      await phaseIs(p2, 'coop', f2); // 入力する側にも新しい epoch が届いてから送る
      const a2 = c2.game.assigned;
      assert(c2.game.participants.join() === 'P1,P2' && a2.P1.includes('forward') && a2.P2.includes('look') && a2.P2.includes('attack') && !a2.P3, JSON.stringify(a2));
      let mf = mon.mark();
      p2.input('act:attack', 'down'); await injected(mon, 'MOUSE_L', 'down', mf); p2.input('act:attack', 'up'); await injected(mon, 'MOUSE_L', 'up', mf);
      p1.input('act:forward', 'down'); await injected(mon, 'KEY_W', 'down', mf); p1.input('act:forward', 'up'); await injected(mon, 'KEY_W', 'up', mf);
      // 固定の操作名・割り当てていない操作は送らない
      mf = mon.mark();
      p2.input('ATTACK', 'down'); p1.input('act:attack', 'down'); p1.input('FWD', 'down');
      await noPress(mon, mf);
      p2.input('ATTACK', 'up'); p1.input('act:attack', 'up'); p1.input('FWD', 'up');
      // Ready の後に来た P3 は参加しない (入力を送らず、切断しても止めない)
      from = p1.mark();
      p3 = await join('P3'); await welcome(p3);
      await p1.waitFor((m) => m.type === 'game' && m.game.connected.length === 3, { from, what: 'P3 参加' });
      mf = mon.mark();
      p3.input('act:attack', 'down'); p3.input('ATTACK', 'down');
      await noPress(mon, mf);
      p3.input('act:attack', 'up'); p3.input('ATTACK', 'up');
      from = p1.mark();
      p3.close();
      await sleep(300);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'paused'), '参加していない P3 の切断で止めた');
      // 参加者 (P2) が切れたら止め、戻るまで再開できない
      from = p1.mark();
      p2.close();
      const paused = await phaseIs(p1, 'paused', from);
      assert(!paused.game.canResume && paused.game.readyReasons.some((r) => r.includes('P2')), JSON.stringify(paused.game.readyReasons));
      from = p1.mark();
      p2 = await join('P2'); await welcome(p2);
      await p1.waitFor((m) => m.type === 'game' && (m.game.canResume || m.game.phase === 'coop'), { from, what: 'P2 復帰' });
      // 4人: 終了して組み直す。P1 移動 / P2 視点 / P3 攻撃・使う / P4 持ち物
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'END' });
      await phaseIs(p1, 'lobby', from);
      p3 = await join('P3'); await welcome(p3);
      const p4 = await join('P4'); await welcome(p4);
      await p1.waitFor((m) => m.type === 'game' && m.game.connected.length === 4, { from, what: '4人' });
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      const f4 = p4.mark();
      p1.send({ type: 'command', cmd: 'READY' });
      const c4 = await phaseIs(p1, 'coop', from);
      await phaseIs(p4, 'coop', f4);
      const a4 = c4.game.assigned;
      assert(c4.game.fixedControls === false && a4.P2.join() === 'look' && a4.P3.includes('attack') && a4.P4.includes('drop') && !a4.P3.includes('drop'), JSON.stringify(a4));
      mf = mon.mark();
      // 捨てるは試験用の options.txt で R
      p4.input('act:drop', 'down'); await injected(mon, 'KEY_R', 'down', mf); p4.input('act:drop', 'up'); await injected(mon, 'KEY_R', 'up', mf);
      // 後続の試験のため、3人の Minecraft の協力プレイへ戻す
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'END' });
      await phaseIs(p1, 'lobby', from);
      p4.close();
      await p1.waitFor((m) => m.type === 'game' && m.game.connected.length === 3, { from, what: '3人に戻す' });
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      p1.send({ type: 'command', cmd: 'READY' });
      const back = await phaseIs(p1, 'coop', from);
      assert(back.game.fixedControls === true && back.game.participants.join() === 'P1,P2,P3', '3人の固定の画面に戻らない');
    });

    await check('役割の入れ替え: 開始前・一時停止中だけ 2 人の担当を交換し、本人の確認まで再開しない。再接続・終了後も保つ (#47・#62)', async () => {
      // 前提: Minecraft の協力プレイ中 (P1〜P3、固定の画面)
      const lastGame = () => [...p1.msgs].reverse().find((m) => m.type === 'game').game;
      let from = p1.mark();
      mon.send({ type: 'swap_roles', a: 'P2', b: 'P3' });
      await sleep(200);
      assert(lastGame().roleOf.P2 === 'P2' && !p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.roleOf?.P2 === 'P3'), '協力プレイ中に入れ替えた');
      // 一時停止中に P2 と P3 を入れ替える: 全解放・epoch 更新、2 人の確認まで再開できない
      p1.send({ type: 'command', cmd: 'PAUSE' });
      await phaseIs(p1, 'paused', from);
      const e0 = lastGame().epoch;
      from = p1.mark();
      mon.send({ type: 'swap_roles', a: 'P2', b: 'P3' });
      const sw = await p1.waitFor((m) => m.type === 'game' && m.game.roleOf?.P2 === 'P3', { from, what: 'swap' });
      assert(sw.game.epoch > e0 && sw.game.roleOf.P3 === 'P2' && sw.game.roleOf.P1 === 'P1' && sw.game.roleAck.join() === 'P2,P3', JSON.stringify(sw.game.roleOf) + sw.game.roleAck);
      assert(!sw.game.canResume && sw.game.readyReasons.some((r) => r.includes('確認')), JSON.stringify(sw.game.readyReasons));
      p1.send({ type: 'command', cmd: 'RESUME' });
      await p1.waitFor((m) => m.type === 'command_result' && m.cmd === 'RESUME' && !m.accepted, { from, what: '確認前の再開を拒否' });
      // 担当の変わっていない P1 の確認では進まない。本人 (P2・P3) が確認すると再開できる
      const staleFrom = p1.mark();
      p2.send({ type: 'role_ok', epoch: e0 });
      p3.send({ type: 'role_ok', epoch: null });
      await sleep(150);
      assert(lastGame().roleAck.join() === 'P2,P3' && !p1.msgs.slice(staleFrom).some((m) => m.type === 'game' && m.game.canResume), '古い担当またはepochなしの確認を数えた');
      await p2.waitFor((m) => m.type === 'game' && m.game.epoch === sw.game.epoch, { what: 'P2の新しい担当' });
      await p3.waitFor((m) => m.type === 'game' && m.game.epoch === sw.game.epoch, { what: 'P3の新しい担当' });
      p1.send({ type: 'role_ok' });
      p2.send({ type: 'role_ok' });
      await p1.waitFor((m) => m.type === 'game' && m.game.roleAck.join() === 'P3', { from, what: 'P2 確認' });
      p3.send({ type: 'role_ok' });
      await p1.waitFor((m) => m.type === 'game' && m.game.roleAck.length === 0 && m.game.canResume, { from, what: '全員確認' });
      const f2 = p2.mark(), f3 = p3.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      await phaseIs(p2, 'coop', f2); await phaseIs(p3, 'coop', f3);
      // 再開後: P2 がアクション、P3 が視点。元の担当の操作は送らない
      let mf = mon.mark();
      p2.input('ATTACK', 'down'); await injected(mon, 'MOUSE_L', 'down', mf); p2.input('ATTACK', 'up'); await injected(mon, 'MOUSE_L', 'up', mf);
      mf = mon.mark();
      p3.input('ATTACK', 'down');
      await noPress(mon, mf);
      p3.input('ATTACK', 'up');
      const lf = mon.mark();
      p2.send({ type: 'look', lseq: 1, epoch: p2.epoch, cx: 300, cy: 0 });
      await sleep(250);
      assert(!mon.msgs.slice(lf).some((m) => m.type === 'look'), '入れ替えた後の P2 の look を反映した');
      p3.send({ type: 'look', lseq: 1, epoch: p3.epoch, cx: 40, cy: 0 });
      const l = await mon.waitFor((m) => m.type === 'look', { from: lf, what: 'look' });
      assert(l.entry.slot === 'P3', `slot=${l.entry.slot}`);
      // 再接続しても担当は変わらない
      from = p1.mark();
      p3.close();
      await p1.waitFor((m) => m.type === 'game' && m.game.phase === 'paused', { from, what: 'P3 切断' });
      p3 = await join('P3'); await welcome(p3);
      const back = await p1.waitFor((m) => m.type === 'game' && m.game.connected.length === 3, { from, what: 'P3 復帰' });
      assert(back.game.roleOf.P3 === 'P2' && back.game.roleAck.length === 0, JSON.stringify(back.game.roleOf));
      // 終了してもリセットまで保ち、そのまま再挑戦できる (#62)。ロビーで元に戻すと決定と確認をやり直す
      from = p1.mark();
      p1.send({ type: 'command', cmd: 'END' });
      const lobby = await phaseIs(p1, 'lobby', from);
      assert(lobby.game.roleOf.P2 === 'P3', '終了で入れ替えが消えた');
      await confirmLineup(mon, p1);
      from = p1.mark();
      mon.send({ type: 'swap_roles', a: 'P3', b: 'P2' });
      const undone = await p1.waitFor((m) => m.type === 'game' && m.game.roleOf?.P2 === 'P2', { from, what: '元に戻す' });
      assert(!undone.game.lineupOk && !undone.game.canPrepare && undone.game.roleAck.join() === 'P3,P2', JSON.stringify(undone.game));
      await p2.waitFor((m) => m.type === 'game' && m.game.epoch === undone.game.epoch, { what: 'P2の復元後の担当' });
      await p3.waitFor((m) => m.type === 'game' && m.game.epoch === undone.game.epoch, { what: 'P3の復元後の担当' });
      p2.send({ type: 'role_ok' }); p3.send({ type: 'role_ok' });
      await p1.waitFor((m) => m.type === 'game' && m.game.roleAck.length === 0, { from, what: '確認' });
      await confirmLineup(mon, p1);
      p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      p1.send({ type: 'command', cmd: 'READY' });
      const again = await phaseIs(p1, 'coop', from);
      assert(again.game.roleOf.P2 === 'P2' && again.game.roleOf.P3 === 'P3', JSON.stringify(again.game.roleOf));
    });

    await check('ゲーム一覧: Steam・Epic を検出して PC 画面にだけ送り、選ぶと全解放して起動を見届ける。一覧にない id・協力プレイ中は起動しない', async () => {
      const app = new Client('app');
      await app.open();
      app.send({ type: 'monitor', page: 'app' });
      const st = await app.waitFor((m) => m.type === 'state' && m.games?.length, { what: 'games' });
      assert(st.games.map((g) => g.id).join() === 'epic:Gamma,steam:413150', JSON.stringify(st.games));
      assert(st.games.every((g) => g.verified === false && !('installDir' in g)), '未検証の表示・インストール先の非公開');
      assert(!p1.msgs.some((m) => JSON.stringify(m).includes('Stardew')), 'スマホに一覧が送られた');
      // タイルの画像は項目 ID で返し、場所は受け取らない (#121)
      assert(st.games.find((g) => g.id === 'steam:413150').image === true && st.games.find((g) => g.id === 'epic:Gamma').image === false, JSON.stringify(st.games));
      const img = await fetch(`${BASE}/api/game-image?id=${encodeURIComponent('steam:413150')}`);
      assert(img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && (await img.arrayBuffer()).byteLength === 4, `画像 ${img.status}`);
      // Minecraft のランチャーを見つけ、一覧 (games) には混ぜずに画像だけ付ける (#128)
      assert(st.minecraft?.detected === true && st.minecraft.image === true && !st.games.some((g) => g.id === 'minecraft-java'), JSON.stringify(st.minecraft));
      const mc = await fetch(`${BASE}/api/game-image?id=minecraft-java`);
      assert(mc.status === 200 && mc.headers.get('content-type') === 'image/png' && mc.headers.get('cache-control') === 'no-store', `Minecraft の画像 ${mc.status}`);
      for (const id of ['epic:Gamma', 'steam:999', '..\..\config.json', 'C:\Windows\win.ini']) {
        const r = await fetch(`${BASE}/api/game-image?id=${encodeURIComponent(id)}`);
        assert(r.status === 404, `${id}: ${r.status}`);
      }
      // 協力プレイ中・一覧にない値 (パスや URL を含む) では起動も選択もしない
      let afrom = app.mark();
      app.send({ type: 'launch_game', id: 'steam:413150' });
      let s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.state === 'failed', { from: afrom, what: 'coop reject' });
      assert(s.game.phase === 'coop' && s.game.title === 'minecraft-java', JSON.stringify(s.game));
      for (const id of ['C:\\Windows\\System32\\calc.exe', 'steam://rungameid/1', 'steam:228980', 'minecraft-java']) {
        afrom = app.mark();
        app.send({ type: 'launch_game', id });
        s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.id === id && m.game.launch.state === 'failed', { from: afrom, what: `reject ${id}` });
        assert(s.game.title === 'minecraft-java' && s.game.phase === 'coop', `${id}: ${JSON.stringify(s.game)}`);
      }
      // 一時停止中も起動しない (#109)。選ぶと lobby へ戻り (全解放)、選んだだけでは起動しない
      let from = p1.mark();
      p1.send({ type: 'command', cmd: 'PAUSE' });
      await phaseIs(p1, 'paused', from);
      afrom = app.mark();
      app.send({ type: 'launch_game', id: 'steam:413150' });
      s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.state === 'failed', { from: afrom, what: 'paused reject' });
      assert(s.game.phase === 'paused' && s.game.title === 'minecraft-java', JSON.stringify(s.game));
      host.child.stdin.write('target off\n');
      await mon.waitFor((m) => m.type === 'state' && !m.inject.target.ok, { what: 'target off' });
      from = p1.mark();
      afrom = app.mark();
      app.send({ type: 'select_game', title: 'steam:413150' });
      const g = await phaseIs(p1, 'lobby', from);
      assert(g.game.title === 'steam:413150' && g.game.titleName === 'Stardew Valley' && g.game.reason === 'game change' && !g.game.lineupOk && !g.game.canLaunch && !g.game.canPrepare, JSON.stringify(g.game));
      await sleep(200);
      assert(!app.msgs.slice(afrom).some((m) => m.type === 'state' && m.game.launch?.state === 'launching'), '選んだだけで起動した');
      // メンバー・分担の決定前は、起動・準備の直接の要求でも進めない
      afrom = app.mark();
      app.send({ type: 'launch_game', id: 'steam:413150' });
      p1.send({ type: 'command', cmd: 'PREPARE' });
      s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.state === 'failed', { from: afrom, what: 'unconfirmed reject' });
      assert(s.game.phase === 'lobby', JSON.stringify(s.game));
      // 画面が見ていたメンバーと違う決定は受け付けない
      app.send({ type: 'confirm_lineup', title: 'steam:413150', members: ['P1', 'P2'], epoch: g.game.epoch });
      app.send({ type: 'confirm_lineup', title: 'minecraft-java', members: g.game.connected, epoch: g.game.epoch });
      app.send({ type: 'confirm_lineup', title: g.game.title, members: g.game.connected, epoch: g.game.epoch - 1 });
      app.send({ type: 'confirm_lineup', title: g.game.title, members: g.game.connected });
      await sleep(200);
      assert(!app.msgs.slice(afrom).some((m) => m.type === 'state' && m.game.lineupOk), '古い画面の決定を受け付けた');
      // 決定 → 戻ると取り消し → 決定し直して起動。起動中の連打は 1 回だけ。ウィンドウが現れるまで launching
      await confirmLineup(app, p1);
      from = p1.mark();
      app.send({ type: 'unconfirm_lineup' });
      await p1.waitFor((m) => m.type === 'game' && !m.game.lineupOk, { from, what: '取り消し' });
      await confirmLineup(app, p1);
      // 起動要求は全解放と epoch の更新を伴う。連打しても epoch は 1 つだけ進む
      const lastEpoch = () => [...app.msgs].reverse().find((m) => m.type === 'state').game.epoch;
      const before = lastEpoch();
      afrom = app.mark();
      app.send({ type: 'launch_game', id: 'steam:413150' });
      app.send({ type: 'launch_game', id: 'steam:413150' });
      s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.state === 'launching', { from: afrom, what: 'launching' });
      await sleep(200);
      assert(lastEpoch() - before === 1, `起動要求が ${lastEpoch() - before} 回`);
      assert(s.inject.target.expect.includes('stardew valley'), s.inject.target.expect);
      host.child.stdin.write('target on\n');
      s = await app.waitFor((m) => m.type === 'state' && m.game.launch?.state === 'started', { from: afrom, what: 'started' });
      assert(s.game.phase === 'lobby', '起動しただけで進行が変わった');
      // 検出したゲームを開始し、押下中に再検出で消えても別ゲームへ送らない。
      from = p1.mark();
      const p3from = p3.mark();
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      const hasCatalogProfile=fs.existsSync(path.join(ROOT,'apps/game-profiles/steam-413150.json'));
      if (hasCatalogProfile) {
        // 未検証の定義でも、認識できたゲームなら開始できる (#123)。画面には未検証と表示し続ける
        const current=await p1.waitFor(m=>m.type==='game' && m.game.phase==='preparing' && m.game.profile?.id==='steam-413150',{from,what:'未検証の定義'});
        assert(current.game.profile.status==='unverified' && current.game.profile.controllerSupported===true && current.game.canReady,'未検証の定義でReadyできない');
        // 既存の対象消失試験は、定義のない模擬Epicゲームで続ける
        from=p1.mark(); app.send({type:'select_game',title:'epic:Gamma'});
        await p1.waitFor(m=>m.type==='game' && m.game.title==='epic:Gamma' && m.game.phase==='lobby',{from});
        from=p1.mark(); await confirmLineup(mon, p1); p1.send({type:'command',cmd:'PREPARE'}); await phaseIs(p1,'preparing',from);
      }
      // 定義のないゲームには汎用の定義を当て、Minecraft の固定の表は使わない (#123)
      const generic = await p1.waitFor(m=>m.type==='game' && m.game.phase==='preparing' && m.game.profile,{from,what:'汎用の定義'});
      assert(!hasCatalogProfile || (generic.game.profile.id==='generic' && generic.game.profile.status==='template' && generic.game.fixedControls===false), JSON.stringify(generic.game.profile?.id));
      p1.send({ type: 'command', cmd: 'READY' });
      await phaseIs(p1, 'coop', from);
      await p3.waitFor(m => m.type === 'game' && m.game.phase === 'coop' && m.game.epoch === p1.epoch, { from: p3from, what: 'P3 current game epoch' });
      // Minecraft の操作名 (FWD・USE) は送らない
      let mfrom = mon.mark();
      p1.input('FWD', 'down'); p3.input('USE', 'down');
      await noPress(mon, mfrom, 150);
      p1.input('FWD', 'up'); p3.input('USE', 'up');
      // 汎用の定義の操作 (P1 前進＝W、P3 構える＝右クリック) を押したまま、対象を消す
      mfrom = mon.mark();
      p1.input('act:forward', 'down');
      p3.input('act:aim', 'down');
      await injected(mon, 'KEY_W', 'down', mfrom);
      await injected(mon, 'MOUSE_R', 'down', mfrom);
      const manifest = hasCatalogProfile
        ? path.join(host.logDir,'games','epic','gamma.item')
        : path.join(host.logDir, 'games', 'steam', 'steamapps', 'appmanifest_413150.acf');
      fs.renameSync(manifest, manifest + '.disabled');
      from = p1.mark();
      mfrom = mon.mark();
      app.send({ type: 'refresh_games' });
      const absent = await phaseIs(p1, 'paused', from);
      assert(absent.game.reason === 'game unavailable' && !absent.game.inputActive && !absent.game.canResume, JSON.stringify(absent.game));
      await injected(mon, 'KEY_W', 'up', mfrom);
      await injected(mon, 'MOUSE_R', 'up', mfrom);
      const stopped = mon.mark();
      p1.input('act:forward', 'up'); p3.input('act:aim', 'up');
      p1.input('act:forward', 'down');
      p1.send({ type: 'command', cmd: 'RESUME' });
      await sleep(150);
      assert(!mon.msgs.slice(stopped).some(m => m.type === 'inject' && m.entry.state === 'down'), '消えた対象への入力を別ゲームへ送った');
      p1.input('act:forward', 'up');
      fs.renameSync(manifest + '.disabled', manifest);
      afrom = app.mark();
      app.send({ type: 'refresh_games' });
      const restored = await app.waitFor(m => m.type === 'state' && !m.gamesScanning && m.games?.length === 2, { from: afrom, what: 'catalog restored' });
      assert(restored.game.phase === 'paused', '再検出で自動再開した');
      // Minecraftへ戻して再開する。
      from = p1.mark();
      app.send({ type: 'select_game', title: 'minecraft-java' });
      await p1.waitFor((m) => m.type === 'game' && m.game.title === 'minecraft-java' && m.game.phase === 'lobby' && !m.game.launch, { from, what: 'title back' });
      from = p1.mark();
      await confirmLineup(mon, p1); p1.send({ type: 'command', cmd: 'PREPARE' });
      await phaseIs(p1, 'preparing', from);
      p1.send({ type: 'command', cmd: 'READY' });
      await phaseIs(p1, 'coop', from);
      app.close();
    });

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

    await check('復帰: 期限 (15秒) を過ぎた後の再接続・接続の置き換えで自動復帰の期限を延ばさず、再開しない', async () => {
      mon.send({ type: 'auto_resume', on: true });
      await mon.waitFor((m) => m.type === 'game' && m.game.autoResume === true, { what: 'autoResume on' });
      let from = p1.mark();
      p1.send({ type: 'command', cmd: 'RESUME' });
      await phaseIs(p1, 'coop', from);
      from = p1.mark();
      p3.close();
      const g = await phaseIs(p1, 'paused', from);
      await sleep(Math.max(0, g.game.autoResumeUntil - Date.now()) + 500);
      from = p1.mark();
      p3 = await join('P3'); // 期限後に戻る
      await welcome(p3);
      const p3b = await join('P3'); // 同じ端末の別の接続が置き換える (実機で観測: iPhone の再接続)
      await welcome(p3b);
      p3 = p3b;
      await sleep(500);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'coop'), '期限後に自動復帰した');
      const last = p1.msgs.slice(from).filter((m) => m.type === 'game').pop();
      assert(!last || last.game.autoResumeUntil < Date.now(), `期限が延びた: ${last && last.game.autoResumeUntil}`);
      // 接続の置き換えに加え、別参加者の新しい切断でも期限を復活させないことを確かめる。
      from = p1.mark();
      p2.close();
      await sleep(200);
      p2 = await join('P2');
      await welcome(p2);
      await sleep(300);
      assert(!p1.msgs.slice(from).some((m) => m.type === 'game' && m.game.phase === 'coop'), '期限後の別参加者の切断・復帰で再開した');
      const after = p1.msgs.slice(from).filter((m) => m.type === 'game').pop();
      assert(after && after.game.autoResumeUntil === g.game.autoResumeUntil, '期限後の切断で期限が変わった');
      mon.send({ type: 'auto_resume', on: false });
      await mon.waitFor((m) => m.type === 'game' && m.game.autoResume === false, { what: 'autoResume off' });
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
      { const nextState = p1.mark(); mon.send({ type: 'inject_mode', mode: 'on' }); await p1.waitFor(m=>m.type==='game',{from:nextState}); }
    });

    await check('ゲーム切替: 対象の前面化要求は準備・一時停止中のP1だけで、Readyや入力ONを代行しない',async()=>{
      const before = p1.epoch, from = p1.mark();
      p2.send({type:'command',cmd:'OPEN_GAME'});await sleep(50);
      assert(!p1.msgs.slice(from).some(m=>m.type==='game'),'P2が前面化した');
      p1.send({type:'command',cmd:'OPEN_GAME'});
      const g=await p1.waitFor(m=>m.type==='game' && m.game.prepareStatus.includes('dry-run'),{from});
      assert(g.game.phase==='paused' && g.game.epoch===before,'前面化で開始状態を変更した');
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
      { const nextState = p1.mark(); mon.send({ type: 'inject_mode', mode: 'on' }); await p1.waitFor(m=>m.type==='game',{from:nextState}); }
      await mon.waitFor((m) => m.type === 'state' && m.inject.mode === 'on', { what: 'inject on' });
    });

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

    await check('トークン: PC 画面へのメッセージとログファイルにトークンを含めない', async () => {
      const all = JSON.stringify(mon.msgs);
      for (const k of ['P1', 'P2', 'P3']) assert(!all.includes(tokens[k]), `${k} のトークンが PC 画面に出た`);
      await sleep(1200); // ログは 1 秒ごとに書き出される
      const files = fs.readdirSync(host.logDir).filter((f) => f.endsWith('.jsonl'));
      assert(files.length > 0, 'ログファイルがない');
      const log = files.map((f) => fs.readFileSync(path.join(host.logDir, f), 'utf8')).join('');
      for (const k of ['P1', 'P2', 'P3']) assert(!log.includes(tokens[k]), `${k} のトークンがログに出た`);
    });

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
    });

    for (const c of [p1, p2, p3, mon]) c?.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} 合格 (Rust 版、dry-run)`);
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
