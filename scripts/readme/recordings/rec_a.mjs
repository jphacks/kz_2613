import { dev, shell, sleep, closeCursor } from './remote.mjs';
import { start } from './rec.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const ev = e => execFileSync('node', ['ev.mjs', '9222', '8080', e]).toString().trim();
const rect = sel => JSON.parse(ev(`JSON.stringify((r=>r&&{x:r.left+r.width/2,y:r.top+r.height/2,l:r.left,t:r.top,w:r.width,h:r.height})(document.querySelector('${sel}')?.getBoundingClientRect()))`));
const tap = (x, y) => { const [a, b] = dev(x, y); shell([`input motionevent DOWN ${a} ${b}`, `input motionevent UP ${a} ${b}`]); };
// 点列をなぞる。hold: [点の番号, 秒] で途中に止まる
function drag(pts, steps = 8, holds = {}) {
  const c = []; let [x, y] = dev(...pts[0]); c.push(`input motionevent DOWN ${x} ${y}`, 'sleep 0.15');
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    for (let s = 1; s <= steps; s++) { const e = s / steps; const k = e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2; [x, y] = dev(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); c.push(`input motionevent MOVE ${x} ${y}`); }
    if (holds[i]) c.push(`sleep ${holds[i]}`);
  }
  c.push('sleep 0.1', `input motionevent UP ${x} ${y}`); shell(c);
}
const mode = process.argv[2] || 'rec';
ev("window.__log=[];for(const t of ['pointerdown','pointermove','pointerup'])addEventListener(t,e=>__log.push([t[7],Math.round(performance.timeOrigin+performance.now()),Math.round(e.clientX),Math.round(e.clientY)]),{capture:true});1");
const r = mode === 'rec' ? start('rec-a', { pc: false }) : { mark() {}, async stop() { return []; } };
await sleep(2000); r.mark('start');
let p = rect('#genEditLayout'); tap(p.x, p.y); r.mark('edit'); await sleep(1500);
p = rect('[data-part="jump"]'); tap(p.x, p.y); r.mark('select-space'); await sleep(1200);
// 高さを縮める（下のつまみを上へ）
p = rect('[data-part="jump"] [data-handle="s"]'); drag([[p.x, p.y], [p.x, p.y - 30], [p.x, p.y - 50]], 6); r.mark('resize-h'); await sleep(900);
// 幅を縮める（右のつまみを左へ）
p = rect('[data-part="jump"] [data-handle="e"]'); drag([[p.x, p.y], [p.x - 100, p.y + 4], [p.x - 175, p.y]], 7); r.mark('resize-w'); await sleep(1200);
// Ctrlを上へ動かして Space に重ねる → 置ける場所の枠が出る → 離すと収まる
p = rect('[data-part="sprint"]'); const sp = rect('[data-part="jump"]');
drag([[p.x, p.y], [p.x - 40, p.y - 90], [sp.l + sp.w - 20, sp.y + 10], [sp.l + sp.w + 30, sp.y - 10]], 8, { 2: 1.4, 3: 0.9 }); r.mark('move-ctrl'); await sleep(1400);
// Shift を選び、右のつまみで幅を広げる（隣にぶつかる所で止まる）
p = rect('[data-part="sneak"]'); tap(p.x, p.y); r.mark('select-shift'); await sleep(900);
p = rect('[data-part="sneak"] [data-handle="ne"]'); drag([[p.x, p.y], [p.x + 90, p.y - 20], [p.x + 185, p.y - 60]], 8, { 2: 0.3 }); r.mark('resize-shift'); await sleep(1500);
p = rect('#layoutSave'); tap(p.x, p.y); r.mark('save'); await sleep(2500);
const marks = await r.stop();
fs.writeFileSync('rec-a-marks.json', JSON.stringify({ marks, log: JSON.parse(ev('JSON.stringify(__log)')) }));
console.log(marks); closeCursor();
