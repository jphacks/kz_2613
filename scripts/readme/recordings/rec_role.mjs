// 協力プレイ中の担当画面を、実タッチで操作しながら録画する。node rec_role.mjs <名前> <OY> <台本.json>
// 台本：[["tap",x,y,押す秒], ["drag",[[x,y],...],1区間のコマ数,{区間:止まる秒}], ["wait",秒]]（座標はCSS px）
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
const ADB = process.env.ADB || 'adb';
const [name, oy, file] = process.argv.slice(2);
const K = 2.8125, OY = +oy;
const dev = (x, y) => [Math.round(x * K), Math.round((y + OY) * K)];
const ev = e => execFileSync('node', ['ev.mjs', '9222', '8080', e]).toString().trim();
const cmds = [];
for (const [kind, ...a] of JSON.parse(fs.readFileSync(file, 'utf8'))) {
  if (kind === 'wait') cmds.push(`sleep ${a[0]}`);
  if (kind === 'tap') { const [x, y] = dev(a[0], a[1]); cmds.push(`input motionevent DOWN ${x} ${y}`, `sleep ${a[2] ?? 0.08}`, `input motionevent UP ${x} ${y}`); }
  if (kind === 'drag') {
    const [pts, steps = 8, holds = {}] = a; let [x, y] = dev(...pts[0]);
    cmds.push(`input motionevent DOWN ${x} ${y}`, 'sleep 0.1');
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      for (let s = 1; s <= steps; s++) { const e = s / steps; const k = e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2; [x, y] = dev(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); cmds.push(`input motionevent MOVE ${x} ${y}`); }
      if (holds[i]) cmds.push(`sleep ${holds[i]}`);
    }
    cmds.push(`input motionevent UP ${x} ${y}`);
  }
}
ev("window.__log=[];for(const t of ['pointerdown','pointermove','pointerup'])addEventListener(t,e=>__log.push([t[7],Math.round(performance.timeOrigin+performance.now()),Math.round(e.clientX),Math.round(e.clientY),e.pointerId]),{capture:true});1");
const rec = spawn(ADB, ['shell', 'screenrecord', '--bit-rate', '12000000', `/sdcard/${name}.mp4`]);
await new Promise(r => setTimeout(r, 1500));
execFileSync(ADB, ['shell', cmds.join(';')]);
await new Promise(r => setTimeout(r, 1200));
execFileSync(ADB, ['shell', 'pkill', '-INT', 'screenrecord']);
await new Promise(r => rec.on('exit', r));
await new Promise(r => setTimeout(r, 1200));
execFileSync(ADB, ['pull', `/sdcard/${name}.mp4`, `${name}.mp4`]);
execFileSync(ADB, ['shell', 'rm', `/sdcard/${name}.mp4`]);
fs.writeFileSync(`${name}.json`, JSON.stringify({ oy: OY, innerHeight: +ev('innerHeight'), log: JSON.parse(ev('JSON.stringify(__log)')) }));
console.log('ok', name);
