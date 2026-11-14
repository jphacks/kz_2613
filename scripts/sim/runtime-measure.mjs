// 本番イベントループと実WebSocketの非注入計測。リポジトリのルートで実行する。
import {PHONE_PROTOCOL_VERSION} from '../../apps/web/src/shared/transport/version.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const root = process.cwd();
const binArg = arg('--bin');
assert(binArg, '--bin で計測対象のrelease exeを指定してください');
const bin = path.resolve(binArg);
const duration = Number(arg('--duration-ms', '5000'));
const out = path.resolve(arg('--out', 'data/local/runtime-probe-results.json'));
const cases = arg('--cases', 'normal,burst,slow-monitor,disconnect,many-log').split(',');
const counts = arg('--players', '2,4').split(',').map(Number);
assert(Number.isInteger(duration) && duration >= 1000 && duration <= 60000,
  '--duration-ms は1000〜60000の整数を指定してください');
assert(counts.every(n => n === 2 || n === 4));
assert(cases.every(s => ['normal', 'burst', 'slow-monitor', 'disconnect', 'many-log'].includes(s)));
fs.mkdirSync(path.join(root, 'data/local'), { recursive: true });
const results = [];
const percentile = (values, q) => { const v = [...values].sort((a, b) => a - b); return v.length ? v[Math.ceil(q * v.length) - 1] : null; };

class Client {
  constructor(url) { this.ws = new WebSocket(url); this.messages = []; this.discarded = 0; this.epoch = 0; this.seq = 0; this.pending = new Map(); this.rtts = []; }
  async open() { await new Promise((ok, fail) => { this.ws.onopen = ok; this.ws.onerror = fail; });
    this.ws.addEventListener('close', event => { this.closeCode = event.code; });
    this.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'game') this.game = m.game;
      if (m.type === 'game') this.epoch = m.game.epoch;
      if (m.type === 'pong' && this.pending.has(m.t)) { this.rtts.push(performance.now() - this.pending.get(m.t)); this.pending.delete(m.t); }
      this.messages.push(m); if (this.messages.length > 100000) { this.messages.splice(0, 50000); this.discarded += 50000; }
    };
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  ping() { const t = performance.now(); this.pending.set(t, t); this.send({ type: 'ping', t }); }
  input(button, state, burst = false, epoch = this.epoch) { this.seq++; this.send({ type: 'input', iseq: this.seq, seq: this.seq, epoch, button, state, burst, t: performance.now() }); }
  mark() { return this.discarded + this.messages.length; }
  since(mark) { return this.messages.slice(Math.max(0, mark - this.discarded)); }
  async wait(predicate, from = 0, timeout = 8000) { const until = performance.now() + timeout;
    while (performance.now() < until) {
      const hit = this.since(from).find(predicate);
      if (hit) return hit;
      if (this.closeCode !== undefined) throw new Error(`WS切断 (${this.closeCode}) を受信: ${predicate}`);
      await sleep(2);
    }
    throw new Error(`受信待機タイムアウト ${predicate.toString()}`);
  }
  close() { this.ws.close(); }
}

function maskedFrame(value) {
  const body = Buffer.from(JSON.stringify(value)), mask = crypto.randomBytes(4);
  assert(body.length < 126); const data = Buffer.from(body); for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  return Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, data]);
}
async function slowMonitor(port) {
  const socket = await new Promise((ok, fail) => { const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: {
    Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') } });
    req.on('upgrade', (_, socket) => ok(socket));
    req.on('response', response => { response.resume(); fail(new Error(`WS upgrade: ${response.statusCode}`)); });
    req.on('error', fail);
    req.setTimeout(3000, () => req.destroy(new Error('WS upgrade timeout')));
    req.end(); });
  socket.on('error', () => {}); socket.on('data', () => {});
  socket.write(maskedFrame({ type: 'monitor', page: 'host' })); await sleep(50); socket.pause(); return socket;
}

async function run(players, scenario) {
  const dir = fs.mkdtempSync(path.join(root, 'data/local/runtime-'));
  fs.mkdirSync(path.join(dir, 'games'));
  const env = { ...process.env, RECOOPLAY_DRY_RUN: '1', RECOOPLAY_ROOT: root, RECOOPLAY_NO_CONFIG: '1',
    RECOOPLAY_RUNTIME_MEASURE: '1', RECOOPLAY_LOG_DIR: dir, RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_FAKE_GAMES: path.join(dir, 'games'), PORT: '0' };
  const host = spawn(bin, [], { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  let ready;
  const listening = new Promise(resolve => { ready = resolve; });
  host.stdout.on('data', b => {
    output = (output + b).slice(-5000);
    const match = output.match(/server_start \{"port":([1-9]\d{0,4})\}/);
    if (match) ready(Number(match[1]));
  });
  const sendClosures = [];
  const stderr = createInterface({ input: host.stderr });
  stderr.on('line', line => {
    output = (output + '\n' + line).slice(-5000);
    const match = /^ws_send_close (\{.*\})$/.exec(line);
    if (match) sendClosures.push(JSON.parse(match[1]));
  });
  const closed = new Promise(resolve => {
    host.once('exit', resolve);
    host.once('error', e => { output += e.message; resolve('error'); });
  });
  const clients = [];
  let slow, pingTimer;
  try {
    // ポートに応答があるだけでは接続しない。起動した子プロセスのbind成功を確認する。
    const port = await Promise.race([listening, closed.then(() => 0), sleep(5000).then(() => 0)]);
    assert(port > 0 && port <= 65535 && host.exitCode === null, `計測用ホストの起動を確認できません: ${output}`);
    const mon = new Client(`ws://127.0.0.1:${port}/ws`); clients.push(mon); await mon.open(); mon.send({ type: 'monitor', page: 'host' }); await mon.wait(m => m.type === 'state');
    const phones = [];
    for (let i = 0; i < players; i++) { const c = new Client(`ws://127.0.0.1:${port}/ws`); clients.push(c); phones.push(c); await c.open();
      c.send({ type: 'hello', protocolVersion: PHONE_PROTOCOL_VERSION, clientId: `runtime-p${i}`, ua: 'runtime-measure' }); await c.wait(m => m.type === 'welcome'); }
    const p1 = phones[0]; await p1.wait(m => m.type === 'game' && m.game.connected.length === players);
    mon.send({ type: 'inject_mode', mode: 'on' });
    mon.send({ type: 'select_game', title: 'minecraft-java' }); await p1.wait(m => m.type === 'game' && m.game.title === 'minecraft-java');
    mon.send({ type: 'confirm_lineup', title: p1.game.title, members: p1.game.connected, epoch: p1.epoch }); await p1.wait(m => m.type === 'game' && m.game.lineupOk);
    p1.send({ type: 'command', cmd: 'PREPARE', epoch: p1.epoch }); await p1.wait(m => m.type === 'game' && m.game.phase === 'preparing');
    p1.send({ type: 'command', cmd: 'READY', epoch: p1.epoch }); await p1.wait(m => m.type === 'game' && m.game.phase === 'coop');
    await Promise.all(phones.map(c => c.wait(m => m.type === 'game' && m.game.phase === 'coop' && m.game.epoch === p1.epoch)));
    const heldFrom = mon.mark();
    p1.input('act:forward', 'down');
    const held = await mon.wait(m => m.type === 'inject' && m.entry.state === 'down' && m.entry.ok, heldFrom);
    if (scenario === 'slow-monitor') slow = await slowMonitor(port);
    let sent = 0;
    const began = performance.now();
    pingTimer = setInterval(() => phones.forEach(c => c.ws.readyState === 1 && c.ping()), 100);
    let lookSeq = 0, disconnectMark;
    const lookPhone = phones.find((_, i) => p1.game.assigned[`P${i+1}`]?.includes('look'));
    const until = began + duration;
    while (performance.now() < until) {
      const batch = ['burst', 'slow-monitor', 'many-log'].includes(scenario) ? 200 : 1;
      for (const c of phones) if (c.ws.readyState === 1) {
        for (let n = 0; n < batch; n++) { c.input('UNASSIGNED_MEASUREMENT', n % 2 ? 'up' : 'down', scenario !== 'many-log' && scenario !== 'slow-monitor'); sent++; }
      }
      if (lookPhone?.ws.readyState === 1 && lookPhone.game.phase === 'coop') {
        lookSeq++;
        lookPhone.send({ type: 'look', epoch: lookPhone.epoch, lseq: lookSeq, cx: lookSeq * 2, cy: 0 });
      }
      if (scenario === 'disconnect' && phones.at(-1).ws.readyState === 1 && performance.now() - began > duration / 2) {
        disconnectMark = mon.mark();
        phones.at(-1).close();
      }
      await sleep(batch > 1 ? 20 : 33);
    }
    clearInterval(pingTimer);
    if (scenario === 'disconnect') {
      assert.notEqual(disconnectMark, undefined);
      const disconnected = await mon.wait(m => m.type === 'state' && m.game.phase === 'paused' && m.game.reason?.endsWith('disconnected'), disconnectMark);
      assert.deepEqual(disconnected.inject.down, []);
    }
    const actualLoadMs = performance.now() - began;
    const from = mon.mark(), epoch = p1.epoch, stopAt = performance.now(); host.stdin.write('stop\n');
    const stopped = await mon.wait(m => m.type === 'state' && m.inject.mode === 'off' && m.inject.down.length === 0, from);
    const stopRoundTripMs = performance.now() - stopAt;
    assert.equal(stopped.game.phase, 'paused'); assert(stopped.game.epoch > epoch);
    assert(mon.since(disconnectMark ?? from).some(m => m.type === 'inject' && m.entry.out === held.entry.out && m.entry.state === 'up' && m.entry.ok));
    const after = mon.mark();
    p1.input('act:forward', 'down', false, epoch);
    await p1.wait(m => m.type === 'ack' && m.iseq === p1.seq && m.stale === true);
    p1.input('act:forward', 'down');
    await p1.wait(m => m.type === 'ack' && m.iseq === p1.seq && m.stale !== true);
    await sleep(150);
    assert(!mon.since(after).some(m => m.type === 'inject' && m.entry.state === 'down'));
    const rtts = phones.flatMap(c => c.rtts);
    slow?.resume();
    if (slow) await sleep(300);
    host.stdin.end('quit\n');
    assert.equal(await Promise.race([closed, sleep(3000).then(() => 'timeout')]), 0);
    const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'runtime-measure.json'), 'utf8'));
    for (const metric of ['hub_stop_us', 'hub_stop_queue_us', 'hub_stop_enqueue_to_end_us',
      'hub_ws_queue_us', 'hub_ws_enqueue_to_end_us', 'look_tick_interval_us', 'ws_send_us']) {
      assert(runtime[metric]?.count >= 1, `測定値がありません: ${metric}`);
    }
    return { players, scenario, durationMs: actualLoadMs, sent, pingSamples: rtts.length,
      pingMs: { p50: percentile(rtts, .5), p95: percentile(rtts, .95), max: rtts.length ? Math.max(...rtts) : null },
      stopRoundTripMs, safeStop: true, runtime, sendClosures, logBytes: fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0) };
  } catch (error) {
    if (host.exitCode === null && host.stdin.writable) {
      host.stdin.end('quit\n');
      await Promise.race([closed, sleep(3000)]);
    }
    error.sendClosures = sendClosures;
    throw error;
  } finally {
    clearInterval(pingTimer);
    slow?.destroy();
    for (const client of clients) client.close();
    if (host.exitCode === null) host.kill();
  }
}

let failure;
try {
  for (const players of counts) for (const scenario of cases) {
    try {
      const result = await run(players, scenario);
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      failure = { players, scenario, message: error.message, sendClosures: error.sendClosures };
      throw error;
    }
  }
} finally {
  fs.writeFileSync(out, JSON.stringify({ kind: '本番Hubと実loopback WSの内部・外部観測。観測値であり実機遅延や上限の保証ではない',
    executable: { name: path.basename(bin), sha256: crypto.createHash('sha256').update(fs.readFileSync(bin)).digest('hex') }, results, failure }, null, 2) + '\n');
}
