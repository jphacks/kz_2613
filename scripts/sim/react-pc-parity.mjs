// 既存のPC画面とReact版を同じ手順で動かして比べる (#235)。dry-run・疑似入力先で、OS入力なし。
//   node scripts/sim/react-pc-parity.mjs --bin <ホスト> [--chrome <chrome.exe>]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {stripTypeScriptTypes} from 'node:module';

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
  console.log(`PC比較: ${url === '/app' ? '標準React版' : '従来版'}を開始`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-pc-parity-'));
  const logDir = path.join(tmp, 'logs'); fs.mkdirSync(logDir);
  const host = spawn(BIN, [], { env: { ...process.env, PORT: String(port), RECOOPLAY_ROOT: ROOT, RECOOPLAY_DRY_RUN: '1', RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_FAKE_TARGET: '1', RECOOPLAY_STDIN_CONTROL: '1', RECOOPLAY_DESKTOP: '1', RECOOPLAY_LOG_DIR: logDir, RECOOPLAY_KEY_OVERRIDES: path.join(tmp,'key-overrides.json') }, stdio: ['pipe', 'ignore', 'ignore'] });
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
  const result = { errors, players: {}, screens: {} };
  const phones = [];
  try {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await call('Target.attachToTarget', { targetId, flatten: true });
    for (const m of ['Page.enable', 'Runtime.enable']) await call(m, {}, s);
    await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, s);
    const ev = async x => { const r = await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }, s); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (x, what) => { const t = Date.now(); while (Date.now() - t < 8000) { if (await ev(x).catch(() => false)) return; await sleep(30); } throw Error(`画面の待機: ${what}`); };
    const targetUrl = `http://127.0.0.1:${port}${url}`;
    try {
      await call('Page.navigate', { url: targetUrl }, s);
    } catch (error) {
      if (error.message !== 'CDPの応答なし: Page.navigate') throw error;
      // 応答期限だけでは遷移失敗と決めない。同じtargetを読み直し、遷移操作を重複させない。
      await waitFor(`location.href===${JSON.stringify(targetUrl)}`, '遷移先URLの確認');
      console.log('Page.navigateの応答期限後、同じtargetの遷移先を確認');
    }
    await waitFor(`document.body.dataset.view==='join'&&document.querySelectorAll('#players .player').length===4`, 'PC画面');
    await ev(`window.__fx=0;new MutationObserver(l=>{for(const m of l)if(m.target.classList?.contains('fx-pop')&&!String(m.oldValue).includes('fx-pop'))window.__fx++}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});1`);
    // 演出のクラスは比べない (再生回数は別に比べる)。既存の画面は描き直しで演出が途中で消えることがある
    const tidy = async () => (await ev(`document.getElementById('players').innerHTML`)).replace(/ fx-pop/g, '').replace(/>\s+</g, '><').replace(/<img ([^>]*)>/g, (_, a) => `<img ${a.split(/ (?=[\w-]+=)/).sort().join(' ')}>`).trim();
    const screenSnapshot = () => ev(`['screenTitle','explanation','secondary','nextBtn','subBtn','changePlayersBtn','blockedStart','readyInstruction','stateTitle','stateSubtitle','roleHeading','actionNote','warning','openGameBtn','inputSafety','inputState','keyWarnings','gameStatus','rotationSetting','autoResumeSetting'].map(id=>{const e=document.getElementById(id);return [id,e.textContent,e.hidden,e.disabled??null,e.value??null,e.checked??null]})`);
    const snap = async (name, cond) => { await waitFor(cond, name); await sleep(150); result.players[name] = await tidy(); result.screens[name] = await screenSnapshot(); };
    const shot = async name => {
      if(url!=='/app-react.html')return;
      const out=path.join(ROOT,'data/local/react-migration');fs.mkdirSync(out,{recursive:true});
      const {data}=await call('Page.captureScreenshot',{format:'png'},s);
      fs.writeFileSync(path.join(out,`pc-${name}.png`),Buffer.from(data,'base64'));
    };
    const rolesHtml = async () => (await ev(`document.getElementById('roles').innerHTML`)).replace(/ fx-pop/g, '').replace(/>\s+</g, '><').replace(/<img ([^>]*)>/g, (_, a) => `<img ${a.split(/ (?=[\w-]+=)/).sort().join(' ')}>`).trim();
    result.roles = {};
    await waitFor(`!!document.querySelector('#qr svg')`, '参加用QR');
    result.productEntry=(await(await fetch(targetUrl)).text()).includes('/react/pc.js');
    const boundarySource=stripTypeScriptTypes(fs.readFileSync(path.join(ROOT,'apps/web/src/transport/pc-info.ts'),'utf8'),{mode:'strip'}).replace(/^export /gm,'');
    result.qrBoundary=await ev(`(async()=>{${boundarySource}
      const real=await(await fetch('/api/info')).json();
      const invalid=['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="x"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(x)"/></svg>','<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>'];
      return {real:decodePcInfo(real)!==null,rejected:invalid.map(value=>!validQr(value))};
    })()`);
    assert.equal(result.qrBoundary.real,true);assert(result.qrBoundary.rejected.every(Boolean),'危険なSVGを拒否する');
    // ゲームの検出と画像の読込が終わってから構造を比べる
    await waitFor(`!document.getElementById('refreshGamesBtn').disabled&&document.querySelectorAll('#gameList .game-choice').length>0`, 'ゲーム一覧');
    await sleep(500);
    result.dom = await ev(`(()=>{const out=[];const walk=(e,d)=>{for(const c of e.children){if(['SCRIPT','LINK'].includes(c.tagName))continue;if(c.id==='root'){walk(c,d);continue;}if(c.id==='players'){out.push([d,c.tagName,c.id].join('|'));continue}
      out.push([d,c.tagName,c.id,c.className.baseVal??c.className,c.getAttribute('data-go')||'',c.hasAttribute('hidden')].join('|'));walk(c,d+1)}};walk(document.body,0);return out})()`);
    await snap('参加待ち', `document.querySelectorAll('#players .player.empty').length===4`);
    await shot('join');
    const join = async n => { const p = await new Ws(port).open({ type: 'hello', clientId: `pc-parity-${n}`, ua: 'Mozilla/5.0 (Linux; Android 15) Chrome/140', protocolVersion: 4 }); phones.push(p); await p.until(x => x.welcome, 'welcome'); return p; };
    const p1 = await join(1);
    await snap('1人', `document.querySelectorAll('#players .player.connected').length===1`);
    const p2 = await join(2);
    await snap('2人', `document.querySelectorAll('#players .player.connected').length===2`);
    await ev(`document.getElementById('nextBtn').click();1`);
    await waitFor(`document.body.dataset.view==='game'`, 'ゲーム選択');
    result.screens['ゲーム選択']=await screenSnapshot();await shot('games');
    await ev(`document.getElementById('nextBtn').click();1`);
    await waitFor(`document.body.dataset.view==='roles'`, '分担');
    await sleep(200); result.roles['決定前'] = await rolesHtml();
    result.screens['分担']=await screenSnapshot();await shot('roles');
    // Reactのcontrolled入力も、入力値を取り戻す前に型付きAPIで送信する。
    const originalAuto=Boolean(p1.game.autoResume);
    await ev(`document.getElementById('autoResumeSetting').click();1`);
    await p1.until(x=>Boolean(x.game.autoResume)!==originalAuto,'自動復帰設定の変更');
    await ev(`document.getElementById('autoResumeSetting').click();1`);
    await p1.until(x=>Boolean(x.game.autoResume)===originalAuto,'自動復帰設定の復元');
    await ev(`(()=>{const e=document.getElementById('rotationSetting');e.value='60';e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await p1.until(x=>x.game.rotationSeconds===60,'時間交代の設定');
    await ev(`(()=>{const e=document.getElementById('rotationSetting');e.value='0';e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await p1.until(x=>x.game.rotationSeconds===0,'時間交代の復元');
    const keyEdit=await ev(`(()=>{const e=document.querySelector('[data-key-action]');return {action:e.dataset.keyAction,old:e.value,next:[...e.options].find(o=>o.value&&o.value!==e.value).value}})()`);
    const bindingsBefore = await ev(`document.getElementById('keyBindings').textContent`);
    const setKey=async value=>ev(`(()=>{const e=document.querySelector('[data-key-action]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
    await setKey(keyEdit.next);
    await p1.until(x=>x.game.keys?.actions?.[keyEdit.action]?.out===keyEdit.next,'キー設定の変更');
    await waitFor(`document.getElementById('keyBindings').textContent!==${JSON.stringify(bindingsBefore)}`, 'PC画面のキー変更反映');
    await setKey(keyEdit.old);
    await p1.until(x=>x.game.keys?.actions?.[keyEdit.action]?.out===keyEdit.old,'キー設定の復元');
    // P1への通知とPCの通知は独立。PCが旧epochのまま決定すると正しく拒否される。
    await waitFor(`document.getElementById('keyBindings').textContent===${JSON.stringify(bindingsBefore)}`, 'PC画面のキー復元反映');
    result.settings=true;
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
    await ev(`document.getElementById('settingsBtn').focus();document.getElementById('settingsBtn').click();true`);
    await waitFor(`document.getElementById('settings').open`,'設定ダイアログ');
    for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9},s);
    assert(await ev(`document.activeElement?.closest('dialog')?.id==='settings'`),'Tabのフォーカスをダイアログ内に保つ');
    for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27},s);
    await waitFor(`!document.getElementById('settings').open`,'Escapeで閉じる');
    assert(await ev(`document.activeElement?.id==='settingsBtn'`),'閉じた後のフォーカス復元');
    result.dialogKeyboard=true;
    result.viewports=[];
    for(const [width,height]of [[1280,720],[1024,768],[1280,1024],[900,1200]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},s);await sleep(100);
      const bounds=await ev(`(()=>{const r=document.querySelector('.desktop-shell').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`);
      assert(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=width+1&&bounds.bottom<=height+1,'PC画面の縦横比で領域外へはみ出さない');
      result.viewports.push([width,height]);
    }
  } finally {
    for (const p of phones) try { p.close(); } catch {}
    try { host.stdin.write('quit\n'); } catch {}
    await sleep(300); host.kill(); chrome.kill(); await sleep(300);
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
  return result;
}

const before = await session('/app.html', 18651, 9371);
const after = await session('/app', 18652, 9372);
const fails = [];
const same = (name, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fails.push(name); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) { const x = [a].flat(), y = [b].flat(); const i = x.findIndex((v, n) => v !== y[n]); const l = String(x[i]), r = String(y[i]); let c = 0; while (c < l.length && l[c] === r[c]) c++; console.log(`       既存: …${l.slice(Math.max(0, c - 40), c + 60)}\n       React: …${r.slice(Math.max(0, c - 40), c + 60)}`); }
};
same('DOMの構造', before.dom, after.dom);
for (const k of Object.keys(before.players)) same(`参加者の表示（${k}）`, before.players[k], after.players[k]);
for (const k of Object.keys(before.roles)) same(`分担の表示（${k}）`, before.roles[k], after.roles[k]);
for (const k of Object.keys(before.screens)) same(`主要画面の文言・状態（${k}）`, before.screens[k], after.screens[k]);
same('設定値の変更と復元', before.settings, after.settings);
same('演出の再生回数', before.fx, after.fx);
same('実行時のエラー', before.errors, after.errors);
same('実際のホストQRと危険SVGの境界',before.qrBoundary,after.qrBoundary);
same('ダイアログのTab・Escape・フォーカス復元',before.dialogKeyboard,after.dialogKeyboard);
same('PCの4種類の縦横比',before.viewports,after.viewports);
if(!after.productEntry)fails.push('標準URLのReact entry');
console.log(fails.length ? `不合格: ${fails.join('、')}` : `合格: 既存のPC画面とReact版が一致（演出 ${after.fx} 回）`);
process.exit(fails.length ? 1 : 0);
