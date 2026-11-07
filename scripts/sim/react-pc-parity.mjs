// 既存のPC画面とReact版を同じ手順で動かして比べる (#235)。dry-run・疑似入力先で、OS入力なし。
//   node scripts/sim/react-pc-parity.mjs --bin <ホスト> [--chrome <chrome.exe>]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const BIN = arg('--bin', path.join(ROOT, 'apps/host-rs/target/release/recooplay-host.exe'));
const CHROME = arg('--chrome', ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
assert(fs.existsSync(path.join(ROOT, 'apps/web-static/app-react.html')), 'apps/web で npm run build を実行してください');

class Ws {
  constructor(port) { this.port = port; this.msgs = []; this.game = null; }
  async open(hello) {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'game' || m.type === 'state') this.game = m.game ?? this.game; if (m.type === 'welcome') this.welcome = m; this.msgs.push(m); };
    this.send(hello);
    this.ping = setInterval(() => this.ws.readyState === 1 && this.send({ type: 'ping', t: Date.now() }), 1000);
    return this;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  command(cmd) { this.send({ type: 'command', cmd, epoch: this.game?.epoch }); }
  async until(fn, what, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn(this)) return; await sleep(20); } throw Error(`待機: ${what}`); }
  close() { clearInterval(this.ping); this.ws.close(); }
}

async function session(url, port, cdpPort) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-pc-parity-'));
  const logDir = path.join(tmp, 'logs'); fs.mkdirSync(logDir);
  const host = spawn(BIN, [], { env: { ...process.env, PORT: String(port), RECOOPLAY_ROOT: ROOT, RECOOPLAY_DRY_RUN: '1', RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_DESKTOP: '1', RECOOPLAY_LOG_DIR: logDir }, stdio: ['pipe', 'ignore', 'ignore'] });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(tmp, 'chrome')}`, '--no-first-run', '--hide-scrollbars', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let cdp, id = 1; const pending = new Map(), errors = [];
  const call = (method, params = {}, sessionId) => { const i = id++; cdp.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); return new Promise((res, rej) => { pending.set(i, { res, rej, method }); setTimeout(() => { if (pending.delete(i)) rej(Error(`CDPの応答なし: ${method}`)); }, 10000); }); };
  for (let i = 0; i < 100 && !cdp; i++) { try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); if (r.ok) cdp = new WebSocket((await r.json()).webSocketDebuggerUrl); } catch {} await sleep(200); }
  if (cdp.readyState !== 1) await new Promise((res, rej) => { cdp.onopen = res; cdp.onerror = rej; });
  cdp.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(Error(`${p.method}: ${m.error.message}`)) : p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/info`)).ok) break; } catch {} await sleep(100); }
  const result = { errors, players: {} };
  const phones = [];
  try {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await call('Target.attachToTarget', { targetId, flatten: true });
    for (const m of ['Page.enable', 'Runtime.enable']) await call(m, {}, s);
    await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, s);
    const ev = async x => { const r = await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }, s); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (x, what) => { const t = Date.now(); while (Date.now() - t < 8000) { if (await ev(x).catch(() => false)) return; await sleep(30); } throw Error(`画面の待機: ${what}`); };
    await call('Page.navigate', { url: `http://127.0.0.1:${port}${url}` }, s);
    await waitFor(`document.body.dataset.view==='join'&&document.querySelectorAll('#players .player').length===4`, 'PC画面');
    await ev(`window.__fx=0;new MutationObserver(l=>{for(const m of l)if(m.target.classList?.contains('fx-pop')&&!String(m.oldValue).includes('fx-pop'))window.__fx++}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});1`);
    // 演出のクラスは比べない (再生回数は別に比べる)。既存の画面は描き直しで演出が途中で消えることがある
    const tidy = async () => (await ev(`document.getElementById('players').innerHTML`)).replace(/ fx-pop/g, '').replace(/>\s+</g, '><').replace(/<img ([^>]*)>/g, (_, a) => `<img ${a.split(/ (?=[\w-]+=)/).sort().join(' ')}>`).trim();
    const snap = async (name, cond) => { await waitFor(cond, name); await sleep(150); result.players[name] = await tidy(); };
    const rolesHtml = async () => (await ev(`document.getElementById('roles').innerHTML`)).replace(/ fx-pop/g, '').replace(/>\s+</g, '><').replace(/<img ([^>]*)>/g, (_, a) => `<img ${a.split(/ (?=[\w-]+=)/).sort().join(' ')}>`).trim();
    result.roles = {};
    await waitFor(`!!document.querySelector('#qr svg')`, '参加用QR');
    // ゲームの検出と画像の読込が終わってから構造を比べる
    await waitFor(`!document.getElementById('refreshGamesBtn').disabled&&document.querySelectorAll('#gameList .game-choice').length>0`, 'ゲーム一覧');
    await sleep(500);
    result.dom = await ev(`(()=>{const out=[];const walk=(e,d)=>{for(const c of e.children){if(['SCRIPT','LINK'].includes(c.tagName))continue;if(c.id==='players'){out.push([d,c.tagName,c.id].join('|'));continue}
      out.push([d,c.tagName,c.id,c.className.baseVal??c.className,c.getAttribute('data-go')||'',c.hasAttribute('hidden')].join('|'));walk(c,d+1)}};walk(document.body,0);return out})()`);
    await snap('参加待ち', `document.querySelectorAll('#players .player.empty').length===4`);
    const join = async n => { const p = await new Ws(port).open({ type: 'hello', clientId: `pc-parity-${n}`, ua: 'Mozilla/5.0 (Linux; Android 15) Chrome/140', protocolVersion: 4 }); phones.push(p); await p.until(x => x.welcome, 'welcome'); return p; };
    const p1 = await join(1);
    await snap('1人', `document.querySelectorAll('#players .player.connected').length===1`);
    const p2 = await join(2);
    await snap('2人', `document.querySelectorAll('#players .player.connected').length===2`);
    await ev(`document.getElementById('nextBtn').click();1`);
    await waitFor(`document.body.dataset.view==='game'`, 'ゲーム選択');
    await ev(`document.getElementById('nextBtn').click();1`);
    await waitFor(`document.body.dataset.view==='roles'`, '分担');
    await sleep(200); result.roles['決定前'] = await rolesHtml();
    await ev(`document.getElementById('nextBtn').click();1`);
    await p1.until(x => x.game?.lineupOk, '分担の決定');
    await sleep(300);
    result.roles['決定後'] = await rolesHtml();
    p1.command('PREPARE');
    await snap('準備中', `document.body.dataset.view==='ready'||document.body.dataset.view==='preparing'`);
    await p1.until(x => x.game?.canReady, 'canReady');
    p1.command('READY');
    await snap('協力プレイ', `document.body.dataset.view==='coop'`);
    p1.command('PAUSE');
    await snap('一時停止', `document.body.dataset.view==='paused'`);
    // 一時停止中の入れ替え: 画面を開き、1人目を選ぶ (#47)
    await ev(`document.getElementById('subBtn').click();1`);
    await waitFor(`!!document.querySelector('#roles [data-swap]')`, '入れ替えの画面');
    await ev(`document.querySelector('#roles [data-swap="P1"]').click();1`);
    await waitFor(`!!document.querySelector('#roles .picked')`, '1人目の選択');
    result.roles['入れ替えの選択'] = await rolesHtml();
    await ev(`document.querySelector('#roles [data-swap="P2"]').click();1`);
    await p1.until(x => x.game?.roleAck?.length === 2, '入れ替え');
    await waitFor(`document.querySelectorAll('#roles .ack-wait').length===2`, '確認待ちの表示');
    result.roles['入れ替え後'] = await rolesHtml();
    p2.close();
    await snap('切断', `document.querySelectorAll('#players .player.lost').length===1`);
    result.fx = await ev('window.__fx');
  } finally {
    for (const p of phones) try { p.close(); } catch {}
    try { host.stdin.write('quit\n'); } catch {}
    await sleep(300); host.kill(); chrome.kill(); await sleep(300);
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
  return result;
}

const before = await session('/app', 18651, 9371);
const after = await session('/app-react.html', 18652, 9372);
const fails = [];
const same = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fails.push(name); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) { const x = [a].flat(), y = [b].flat(); const i = x.findIndex((v, n) => v !== y[n]); const l = String(x[i]), r = String(y[i]); let c = 0; while (c < l.length && l[c] === r[c]) c++; console.log(`       既存: …${l.slice(Math.max(0, c - 40), c + 60)}\n       React: …${r.slice(Math.max(0, c - 40), c + 60)}`); }
};
same('DOMの構造', before.dom, after.dom);
for (const k of Object.keys(before.players)) same(`参加者の表示（${k}）`, before.players[k], after.players[k]);
for (const k of Object.keys(before.roles)) same(`分担の表示（${k}）`, before.roles[k], after.roles[k]);
same('演出の再生回数', before.fx, after.fx);
same('実行時のエラー', before.errors, after.errors);
console.log(fails.length ? `不合格: ${fails.join('、')}` : `合格: 既存のPC画面とReact版が一致（演出 ${after.fx} 回）`);
process.exit(fails.length ? 1 : 0);
