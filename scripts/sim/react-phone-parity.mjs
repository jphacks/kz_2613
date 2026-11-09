// 既存のスマホ画面とReact版を同じ手順で動かして比べる (#235)。dry-run・疑似入力先で、OS入力なし。
// headless Chrome の模擬タッチなので、実端末の代替にはしない。
//   node scripts/sim/react-phone-parity.mjs --bin <ホスト> [--chrome <chrome.exe>] [--samples 40]
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
const SAMPLES = Number(arg('--samples', '40'));
const TOLERANCE_MS = Number(arg('--tolerance-ms', '10')); // ループバックでも p95 は1回の揺れで変わる。共有のCIはさらに広げて使う
const sleep = ms => new Promise(r => setTimeout(r, ms));
const percentile = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const round = n => Math.round(n * 10) / 10;
assert(fs.existsSync(path.join(ROOT, 'apps/web-static/react/phone.js')), 'apps/web で npm run build を実行してください');

class Monitor {
  constructor(port) { this.port = port; this.injects = []; this.game = null; this.state = null; }
  async open() {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'state') { this.state = m; this.game = m.game; }
      if (m.type === 'game') this.game = m.game;
      if (m.type === 'inject') this.injects.push({ ...m.entry, at: performance.now() });
      if (m.type === 'look') this.looks = (this.looks || 0) + 1;
    };
    this.send({ type: 'monitor', page: 'host' });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async until(fn, what, ms = 5000) { const t = Date.now(); while (Date.now() - t < ms) { const r = fn(this); if (r) return r; await sleep(10); } throw Error(`待機: ${what}`); }
}

async function session(url, port, cdpPort) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-parity-'));
  const logDir = path.join(tmp, 'logs'); fs.mkdirSync(logDir);
  const host = spawn(BIN, [], { env: { ...process.env, PORT: String(port), RECOOPLAY_ROOT: ROOT, RECOOPLAY_DRY_RUN: '1', RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_LOG_DIR: logDir }, stdio: ['pipe', 'ignore', 'ignore'] });
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
  let active = null;
  async function page() {
    const { browserContextId } = await call('Target.createBrowserContext');
    const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId: s } = await call('Target.attachToTarget', { targetId, flatten: true });
    for (const m of ['Page.enable', 'Runtime.enable']) await call(m, {}, s);
    await call('Emulation.setDeviceMetricsOverride', { width: 402, height: 874, deviceScaleFactor: 2, mobile: true }, s);
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
    await call('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
    const ev = async x => { const r = await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }, s); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (x, what, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return Date.now() - t; await sleep(20); } throw Error(`画面の待機: ${what}`); };
    const touch = async (type, points) => { if (active !== s) { active = s; await call('Page.bringToFront', {}, s); } return call('Input.dispatchTouchEvent', { type, touchPoints: points }, s); };
    const center = sel => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    return { s, ev, waitFor, touch, center, targetId };
  }
  const result = { url, errors };
  const mon = new Monitor(port); await mon.open();
  try {
    const p1 = await page(), p2 = await page();
    const t0 = Date.now();
    await call('Page.navigate', { url: `http://127.0.0.1:${port}${url}` }, p1.s);
    await p1.waitFor(`document.getElementById('status')?.textContent.includes('接続OK')`, 'P1接続');
    result.loadMs = Date.now() - t0;
    await call('Page.navigate', { url: `http://127.0.0.1:${port}${url}` }, p2.s);
    await p2.waitFor(`document.getElementById('status')?.textContent.includes('接続OK')`, 'P2接続');

    // DOM: 接続直後の構造。動的な値は比べない。P2の参加がP1の画面へ届いてから取る
    await p1.waitFor(`document.querySelectorAll('#players1 .on').length===2`, 'P1の参加者表示');
    await p1.waitFor(`document.body.dataset.view==='v-remote'&&!document.getElementById('viewFx').classList.contains('run')`, 'P1ロビーの演出完了');
    result.productEntry=(await(await fetch(`http://127.0.0.1:${port}${url}`)).text()).includes('/react/phone.js');
    result.dom = await p1.ev(`(()=>{const out=[];const walk=(e,d)=>{for(const c of e.children){if(['SCRIPT','LINK'].includes(c.tagName)||c.id==='root'||c.id==='lookHome'){if(c.id==='root')walk(c,d);continue}
      out.push([d,c.tagName,c.id,c.className,c.getAttribute('data-ctl')||'',c.getAttribute('data-cmd')||'',c.getAttribute('aria-label')||'',c.getAttribute('role')||'',c.hasAttribute('hidden'),c.disabled===true].join('|'));walk(c,d+1)}};walk(document.body,0);return out})()`);
    // タグの間の改行と img の属性の順序 (Reactは src を最後に設定する) だけは比べない。要素・属性の値・文字は完全に比べる
    const tidyHtml = async (page, id) => (await page.ev(`document.getElementById('${id}').innerHTML`)).replace(/ data-bound="1"/g,'').replace(/>\s+</g, '><').replace(/style="display: ?(\w+);?"/g, 'style="display:$1"').replace(/<img ([^>]*)>/g, (_, attrs) => `<img ${attrs.split(/ (?=[\w-]+=)/).sort().join(' ')}>`).trim();
    const waitHtml = () => tidyHtml(p2, 'v-wait'), remoteHtml = () => tidyHtml(p1, 'v-remote');
    result.waitLobby = await waitHtml();
    result.remoteLobby = await remoteHtml();
    result.layout = await p1.ev(`JSON.stringify(['header','main','#v-remote','#remotePad','#startBtn'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return [q,Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}))`);

    // 通信: WebRTC の成立
    await p1.waitFor(`document.getElementById('path').textContent==='WebRTC+WS'`, 'P1 WebRTC', 12000);
    await p2.waitFor(`document.getElementById('path').textContent==='WebRTC+WS'`, 'P2 WebRTC', 12000);
    result.rtc = await mon.until(m => { const s = m.state?.slots?.filter(x => x.connected); return s?.length === 2 && s.every(x => x.rtcState === 'open') && s.map(x => x.rtcState).join(); }, 'RTC open', 12000);

    // 協力プレイへ
    const g = mon.game;
    mon.send({ type: 'confirm_lineup', title: g.title, members: g.connected, epoch: g.epoch });
    await mon.until(m => m.game.lineupOk, 'lineup');
    await sleep(300);
    await p1.ev(`document.getElementById('startBtn').click();1`);
    await mon.until(m => m.game.phase === 'preparing', 'preparing');
    await p1.waitFor(`!document.getElementById('startBtn').disabled&&document.body.dataset.phase==='preparing'`, '準備');
    result.remotePreparing = await remoteHtml();
    // サーバーが拒否した理由の表示。入力OFFでReadyを押す
    mon.send({ type: 'inject_mode', mode: 'off' });
    await p1.waitFor(`document.getElementById('startBtn').disabled`, '入力OFFの反映');
    await p1.ev(`(()=>{const b=document.getElementById('startBtn');b.disabled=false;b.click();b.disabled=true;return 1})()`);
    // 通常の準備中の案内にも「入力を再開する」が含まれるので、拒否の案内だけにない形で見分ける
    await p1.waitFor(`(t=>t.includes('入力を再開する')&&!t.includes('準備ができたら'))(document.getElementById('remoteNote').textContent)`, '拒否の案内');
    result.rejectNote = await p1.ev(`document.getElementById('remoteNote').textContent`);
    mon.send({ type: 'inject_mode', mode: 'on' });
    await p1.waitFor(`!document.getElementById('startBtn').disabled`, '入力ONの反映');
    await p1.ev(`document.getElementById('startBtn').click();1`);
    await mon.until(m => m.game.phase === 'coop', 'coop');
    await p1.waitFor(`document.body.dataset.view==='v-gen'`, 'P1操作画面');
    await p2.waitFor(`document.body.dataset.view==='v-gen'`, 'P2操作画面');
    await sleep(500);
    result.controls = await p1.ev(`[...document.querySelectorAll('#v-gen [data-ctl]')].map(e=>e.dataset.ctl).join()`);

    // 入力: タップから注入までの遅延と順序
    const key = await p1.center('#v-gen button.key[data-ctl]');
    const latency = [], order = [];
    for (let i = 0; i < SAMPLES; i++) {
      const from = mon.injects.length, t = performance.now();
      await p1.touch('touchStart', [key]);
      const down = await mon.until(m => m.injects.slice(from).find(x => x.state === 'down'), `down ${i}`);
      latency.push(down.at - t);
      await sleep(70);
      await p1.touch('touchEnd', []);
      await mon.until(m => m.injects.slice(from).find(x => x.state === 'up'), `up ${i}`);
      order.push(mon.injects.slice(from).map(x => `${x.out}:${x.state}`).join());
      await sleep(70);
    }
    assert.equal(new Set(order).size, 1, `押下と解放の順序が変わった: ${[...new Set(order)]}`);
    result.order = order[0];
    result.tap = { n: latency.length, p50: round(percentile(latency, .5)), p95: round(percentile(latency, .95)), max: round(Math.max(...latency)) };

    // スティック: 右へ倒して離す
    const stick = await p1.center('#v-gen .stick');
    let from = mon.injects.length;
    await p1.touch('touchStart', [stick]);
    await p1.touch('touchMove', [{ x: stick.x + 70, y: stick.y }]);
    await mon.until(m => m.injects.slice(from).find(x => x.state === 'down'), 'stick down');
    await sleep(100); await p1.touch('touchEnd', []);
    await mon.until(m => m.injects.slice(from).find(x => x.state === 'up'), 'stick up');
    result.stick = mon.injects.slice(from).map(x => `${x.out}:${x.state}`).join();

    // 視点: 2秒ドラッグしたときの送信周期
    const pad = await p2.center('#v-gen #pad');
    await p2.ev(`window.__sent=0;const o=WebSocket.prototype.send;WebSocket.prototype.send=function(d){if(String(d).includes('"look"'))window.__sent++;return o.call(this,d)};const c=RTCDataChannel.prototype.send;RTCDataChannel.prototype.send=function(d){if(String(d).includes('"look"'))window.__sent++;return c.call(this,d)};1`);
    await p2.touch('touchStart', [pad]);
    const lookStart = Date.now(); let i = 0;
    while (Date.now() - lookStart < 2000) { await p2.touch('touchMove', [{ x: pad.x + (i++ % 80) - 40, y: pad.y }]); await sleep(8); }
    await p2.touch('touchEnd', []);
    result.lookPerSec = round(await p2.ev('window.__sent') / 2);

    // 安全: 保持中のPauseで全解放し、再開で旧押下が戻らない
    await p1.touch('touchStart', [key]);
    await mon.until(m => m.state?.down?.length || m.injects.at(-1)?.state === 'down', '保持');
    from = mon.injects.length;
    mon.send({ type: 'phase', phase: 'paused' });
    await mon.until(m => m.game.phase === 'paused', 'paused');
    result.pauseRelease = await mon.until(m => m.injects.slice(from).find(x => x.state === 'up')?.out, 'Pause解放');
    await p2.waitFor(`document.getElementById('waitHeading').textContent==='一時停止中'`, 'P2の一時停止表示');
    result.waitPaused = await waitHtml();
    await p1.waitFor(`document.body.dataset.view==='v-remote'&&document.getElementById('startBtn').textContent==='再開する'`, 'P1の一時停止表示');
    result.remotePaused = await remoteHtml();
    // リモコンの入力: 再描画の後も、最初に結び付けた要素のままタッチが届く
    await p1.touch('touchEnd', []);
    await sleep(300);
    const enter = await p1.center('#v-remote [data-ctl="ENTER"]');
    from = mon.injects.length;
    await p1.touch('touchStart', [enter]); await sleep(90); await p1.touch('touchEnd', []);
    await sleep(300);
    result.remoteKey = mon.injects.slice(from).map(x => `${x.out}:${x.state}`).join();
    result.remoteSame = await p1.ev(`document.querySelector('#v-remote [data-ctl="ENTER"]').isConnected&&document.getElementById('remotePad').isConnected`);

    // 視点パッドを既存ノードのまま戻し、複数回の再マウントで解放・参照を保つ。
    for (let cycle = 0; cycle < 2; cycle++) {
      await p1.ev(`document.getElementById('startBtn').click();1`);
      await mon.until(m => m.game.phase === 'coop', '再開');
      await p2.waitFor(`document.body.dataset.view==='v-gen'&&!!document.querySelector('#v-gen #pad')`, '視点再マウント');
      await sleep(400);
      const nextPad = await p2.center('#v-gen #pad');
      await p2.touch('touchStart', [nextPad]);
      await p2.touch('touchMove', [{x:nextPad.x+25,y:nextPad.y}]);await sleep(80);
      await p2.touch('touchEnd', []);
      mon.send({type:'phase',phase:'paused'});
      await mon.until(m=>m.game.phase==='paused','再停止');
      await p1.waitFor(`document.body.dataset.view==='v-remote'&&!document.getElementById('viewFx').classList.contains('run')`,'再停止表示');
      // 各スマホへのgame通知は独立して届く。P1の描画完了をP2の反映済みとは扱わない。
      await p2.waitFor(`document.body.dataset.phase==='paused'&&(!document.getElementById('pad')||document.getElementById('pad').parentElement.id==='lookHome')`,'P2の再停止反映');
    }
    result.remount = await p2.ev(`document.querySelectorAll('#pad').length<=1&&document.querySelectorAll('#sens').length<=1&&(!document.getElementById('pad')||document.getElementById('pad').parentElement.id==='lookHome')`);
    assert(result.remount, '再マウント後も視点パッド・感度は一つだけ');

    // 再接続: 再読み込みで同じ枠へ戻り、停止のまま
    await call('Page.reload', {}, p2.s);
    await p2.waitFor(`document.getElementById('slot')?.textContent==='P2'&&document.getElementById('status').textContent.includes('接続')`, '再読み込み');
    await sleep(500);
    result.reload = await p2.ev(`document.getElementById('slot').textContent+'/'+document.body.dataset.phase`);
    result.finalPhase = mon.game.phase;
    result.viewports=[];
    for(const [width,height]of [[320,568],[360,640],[393,873],[430,932],[600,900]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true},p1.s);await sleep(100);
      const observed=await p1.ev(`({overflow:document.documentElement.scrollWidth>innerWidth,areas:[...document.querySelectorAll('#v-remote button,#phoneSettingsBtn')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})})`);
      assert.equal(observed.overflow,false,'スマホで横にはみ出さない');
      assert(observed.areas.every(([w,h])=>w>=44&&h>=44),'小さい画面でも44pxの操作領域');
      result.viewports.push([width,height]);
    }
  } finally {
    try { mon.ws.close(); host.stdin.write('quit\n'); } catch {}
    await sleep(300); host.kill(); chrome.kill(); await sleep(300);
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
  return result;
}

const before = await session('/index.html', 18631, 9361);
console.log('既存画面の計測を完了');
const after = await session('/', 18632, 9362);
console.log('React版の計測を完了');
const fails = [];
const limit = (name, ok) => { if (!ok) fails.push(name); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const same = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fails.push(name); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) { const x = [a].flat(), y = [b].flat(); const i = x.findIndex((v, n) => v !== y[n]); const l = String(x[i]), r = String(y[i]); let c = 0; while (c < l.length && l[c] === r[c]) c++; console.log(`       既存: …${l.slice(Math.max(0, c - 40), c + 60)}\n       React: …${r.slice(Math.max(0, c - 40), c + 60)}`); } };
same('DOMの構造', before.dom, after.dom);
same('主な要素の位置と大きさ', before.layout, after.layout);
same('待機画面の内容（ロビー）', before.waitLobby, after.waitLobby);
same('リモコン画面の内容（ロビー）', before.remoteLobby, after.remoteLobby);
same('リモコン画面の内容（準備中）', before.remotePreparing, after.remotePreparing);
same('リモコン画面の内容（一時停止中）', before.remotePaused, after.remotePaused);
same('サーバーの拒否の案内', before.rejectNote, after.rejectNote);
same('再描画の後のリモコン入力', before.remoteKey, after.remoteKey);
limit(`リモコン入力が届く (${after.remoteKey})`, Boolean(after.remoteKey) && after.remoteSame === true);
same('待機画面の内容（一時停止中）', before.waitPaused, after.waitPaused);
same('WebRTCの成立', before.rtc, after.rtc);
same('生成された操作', before.controls, after.controls);
same('押下と解放の順序', before.order, after.order);
same('スティックの入力', before.stick, after.stick);
same('保持中のPauseの解放', before.pauseRelease, after.pauseRelease);
same('再読み込み後の枠と進行', before.reload, after.reload);
same('操作面の再マウント', before.remount, after.remount);
same('実行時のエラー', before.errors, after.errors);
limit(`タップの遅延 p95 が${TOLERANCE_MS}ms以上悪化しない (${before.tap.p95}→${after.tap.p95}ms)`, after.tap.p95 <= before.tap.p95 + TOLERANCE_MS);
// 悪化だけを不合格にする (React版が速い場合は問題ない)
limit(`視点の送信周期が落ちない (${before.lookPerSec}→${after.lookPerSec}/秒)`, after.lookPerSec >= before.lookPerSec - 5);
same('スマホの5種類の画面寸法と44px操作領域',before.viewports,after.viewports);
limit('標準URLのReact entry',after.productEntry===true);
console.log(JSON.stringify({ tap: { before: before.tap, after: after.tap }, lookPerSec: [before.lookPerSec, after.lookPerSec], loadMs: [before.loadMs, after.loadMs], dom: before.dom.length }));
console.log(fails.length ? `不合格: ${fails.join('、')}` : '合格: 既存画面とReact版が一致');
process.exit(fails.length ? 1 : 0);
