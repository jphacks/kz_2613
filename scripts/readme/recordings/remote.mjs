// P1スマホのタッチパッドをadbの実タッチで操作し、PCのカーソルを目標へ運ぶ
import { execFileSync, spawn } from 'node:child_process';
import readline from 'node:readline';
const ADB = process.env.ADB || 'adb';
export const K = 2.8125, OY = 101.7;                 // CSS→端末px
export const dev = (x, y) => [Math.round(x * K), Math.round((y + OY) * K)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const cp = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', process.cwd() + '/curd.ps1']);
const rl = readline.createInterface({ input: cp.stdout });
const waiters = [];
rl.on('line', l => { const m = l.match(/cursor (-?\d+) (-?\d+)/); if (m && waiters.length) waiters.shift()([+m[1], +m[2]]); });
export function cursor() { return new Promise(r => { waiters.push(r); cp.stdin.write('x\n'); }); }
export function closeCursor() { cp.stdin.end(); pcWs?.close(); }

// PCアプリの中の仮想カーソル（リモコンの丸）の画面座標
const pcList = await (await fetch('http://127.0.0.1:9333/json')).json();
const pcWs = new WebSocket(pcList.find(p => p.type === 'page' && p.url.includes('8080')).webSocketDebuggerUrl);
await new Promise(r => pcWs.onopen = r);
let pcId = 0; const pcWait = new Map();
pcWs.onmessage = m => { const d = JSON.parse(m.data); if (pcWait.has(d.id)) { pcWait.get(d.id)(d.result?.result?.value); pcWait.delete(d.id); } };
export function pcEval(expression) { return new Promise(r => { const id = ++pcId; pcWait.set(id, r); pcWs.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); }); }
export async function vcursor() { return await pcEval("(()=>{const p=document.getElementById('virtualCursor').style.transform.slice(10).split('px');return [screenX+parseFloat(p[0])+9, screenY+parseFloat(p[1].replace(',',''))+9]})()"); }
export function shell(cmds) { execFileSync(ADB, ['shell', cmds.join(';')]); }
const PAD = { l: 30, r: 354, t: 182, b: 284 };   // タッチパッドの中（CSS）
export function stroke(dx, dy, steps = 8) {
  const sx = dx >= 0 ? PAD.l + 20 : PAD.r - 20, sy = dy >= 0 ? PAD.t + 10 : PAD.b - 10;
  const c = [];
  let [x, y] = dev(sx, sy); c.push(`input motionevent DOWN ${x} ${y}`);
  for (let i = 1; i <= steps; i++) { const e = i / steps; const k = e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2; [x, y] = dev(sx + dx * k, sy + dy * k); c.push(`input motionevent MOVE ${x} ${y}`); }
  c.push(`input motionevent UP ${x} ${y}`);
  shell(c);
}
export async function moveTo(tx, ty, gain = 0.92, os = false) {
  const get = os ? cursor : vcursor;
  for (let n = 0; n < 6; n++) {
    const [cx, cy] = await get(); const ex = tx - cx, ey = ty - cy;
    if (Math.hypot(ex, ey) < 9) return [cx, cy];
    let dx = ex / gain, dy = ey / gain;
    const s = Math.min(1, (PAD.r - PAD.l - 40) / Math.abs(dx || 1), (PAD.b - PAD.t - 20) / Math.abs(dy || 1));
    dx *= s; dy *= s;
    const big = Math.hypot(dx, dy);
    stroke(dx, dy, big > 120 ? 9 : big > 40 ? 6 : 3);
    await sleep(60);
  }
  return await get();
}
export function tap(x, y) { const [a, b] = dev(x, y); shell([`input tap ${a} ${b}`]); }
export const LEFT = [104, 322];
