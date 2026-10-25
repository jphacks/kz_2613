// デスクトップの終了通知・異常終了時のEOFで全解放して終了することを、必ずdry-runで確認する。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const binArg = process.argv.indexOf('--bin');
const bin = binArg >= 0 ? process.argv[binArg + 1] : path.join(root, 'apps/host-rs/target/release/recooplay-host.exe');
const version = Number(fs.readFileSync(path.join(root, 'apps/host-rs/src/hub.rs'), 'utf8').match(/const PROTOCOL_VERSION: u64 = (\d+)/)[1]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, why) => { if (!ok) throw new Error(why); };

async function check(mode) {
  const port = 20000 + Math.floor(Math.random() * 2000);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-exit-'));
  const child = spawn(bin, [], { env: { ...process.env, PORT: String(port), RECOOPLAY_ROOT: root,
    RECOOPLAY_DRY_RUN: '1', RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_LOG_DIR: logDir },
    stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', d => stderr += d);
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', e => resolve(e)); });
  const clients = [];
  async function until(fn, why) {
    for (let i = 0; i < 80; i++) { const value = await fn(); if (value) return value; await sleep(50); }
    throw new Error(`${why}: ${stderr}`);
  }
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.messages = [];
    ws.addEventListener('message', ev => ws.messages.push(JSON.parse(ev.data)));
    clients.push(ws);
    await until(() => ws.readyState === 1, '接続できない');
    ws.sendJson = m => ws.send(JSON.stringify(m));
    return ws;
  }
  try {
    await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/info`)).ok; } catch { return false; } }, '起動しない');
    const mon = await client();
    mon.sendJson({ type: 'monitor', page: 'host' });
    mon.sendJson({ type: 'required', required: 1 });
    mon.sendJson({ type: 'inject_mode', mode: 'on' });
    const p1 = await client();
    p1.sendJson({ type: 'hello', protocolVersion: version, clientId: '終了試験用の端末' });
    await until(() => p1.messages.find(m => m.type === 'welcome'), '枠を取得できない');
    for (const name of ['P2', 'P3']) {
      const player = await client(); player.sendJson({type:'hello',protocolVersion:version,clientId:name});
      await until(()=>player.messages.find(m=>m.type==='welcome'), '追加端末を取得できない');
    }
    const current = () => p1.messages.filter(m=>m.type==='game').at(-1)?.game;
    await until(()=>current()?.connected.length===3, '3人接続を待機');
    // PC画面でメンバーと分担を決定してから準備する (#109)
    mon.sendJson({type:'confirm_lineup',title:current().title,members:current().connected});
    await until(()=>current()?.lineupOk, '分担を決定できない');
    p1.sendJson({type:'command',cmd:'PREPARE',epoch:current().epoch});
    await until(()=>current()?.phase==='preparing', '準備へ移れない');
    p1.sendJson({type:'command',cmd:'READY',epoch:current().epoch});
    const game = await until(() => p1.messages.find(m => m.type === 'game' && m.game.phase === 'coop'), '開始できない');
    p1.sendJson({ type: 'input', iseq: 1, epoch: game.game.epoch, button: 'FWD', state: 'down' });
    await until(() => mon.messages.some(m => m.type === 'inject' && m.entry.out === 'KEY_W' && m.entry.state === 'down'), 'dry-runの押下がない');
    if (mode === 'quit') child.stdin.write('quit\n'); else child.stdin.end();
    const code = await Promise.race([exited, sleep(4000).then(() => 'timeout')]);
    assert(code === 0, `${mode}: 正常終了しない: ${code}`);
    const events = fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl')).flatMap(f => fs.readFileSync(path.join(logDir, f), 'utf8').trim().split(/\r?\n/).map(JSON.parse));
    const up = events.findIndex(e => e.kind === 'inject' && e.out === 'KEY_W' && e.state === 'up');
    const shutdown = events.findIndex(e => e.kind === 'shutdown');
    assert(up >= 0 && shutdown > up, `${mode}: 全解放後のshutdownがない`);
    console.log(`合格: ${mode}で全解放して正常終了`);
  } finally { for (const ws of clients) ws.close(); child.kill(); }
}
await check('quit');
await check('EOF');
