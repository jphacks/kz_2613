import {byId as $} from '../shared/dom.ts';
import {createLifetime} from '../shared/input/lifetime.ts';
import {createMonitor} from '../shared/transport/monitor.ts';
import type {PhoneGame} from '../shared/contracts.ts';
import type {InjectionState,SlotState,InjectionNotice} from '../shared/model/domain.ts';
type PendingInjection={out:string;state:string;slot:string;at:number;focused:boolean};
type PendingObservation={out:string;state:string;at:number;onMatch?:((slot:string)=>void)};
type Report={out:string;state:string;slot:string;result:'ok'|'miss';delay?:number};
type MenuScreen='title'|'pause'|'settings';
export function startPseudoGame(){
  const lifetime=createLifetime();
  let frame=0;

  // P1〜P4 はキャラクターの色 (colors.css の --color-character-*) と同じ値にする
  const COLORS:Record<string,string> = { P1: '#24C2FA', P2: '#5EFF5D', P3: '#CB00EA', P4: '#FF1D00', system: '#a371f7' };
  const PHYS = '#ffffff55';
  const MATCH_MS = 500;
  const escapeHtml = (s:unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string,string>)[c]);

  // ================= キーボード / マウス表示 =================
  const ROWS = [
    [['Escape', 'Esc'], ['gap'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'], ['Digit9', '9']],
    [['Tab', 'Tab', 'w15 dim'], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R', 'dim'], ['KeyT', 'T', 'dim']],
    [['CapsLock', 'Caps', 'w15 dim'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F', 'dim'], ['KeyG', 'G', 'dim']],
    [['ShiftLeft', 'Shift', 'w2'], ['KeyZ', 'Z', 'dim'], ['KeyX', 'X', 'dim'], ['KeyC', 'C', 'dim'], ['KeyV', 'V', 'dim']],
    [['ControlLeft', 'Ctrl', 'w15'], ['AltLeft', 'Alt', 'dim'], ['Space', 'Space', 'space']],
  ];
  $('kb').innerHTML = ROWS.map((r) => `<div class="row">${r.map(([code, label, cls = '']) =>
    code === 'gap' ? '<div class="k gap"></div>' : `<div class="k ${cls}" data-code="${code}">${label}<span class="tag"></span></div>`).join('')}</div>`).join('');
  $('arrows').innerHTML = [['gap'], ['ArrowUp', '↑'], ['gap'], ['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']]
    .map(([c, l]) => c === 'gap' ? '<div class="k gap"></div>' : `<div class="k" data-code="${c}">${l}<span class="tag"></span></div>`).join('');

  function lightKey(code:string,on:boolean,who?:string|null) {
    const el = document.querySelector<HTMLElement>(`.k[data-code="${code}"]`);
    if (!el) return;
    el.classList.toggle('on', on);
    el.style.setProperty('--who', who ? (COLORS[who] || PHYS) : PHYS);
    const tag=el.querySelector('.tag');if(tag)tag.textContent=who||'手元';
  }
  function lightMouse(btn:number,on:boolean,who?:string|null) {
    const el = $(btn === 0 ? 'mL' : 'mR');
    el.classList.toggle('on', on);
    el.style.setProperty('--who', who ? COLORS[who] : PHYS);
  }
  let wheelTimer:(()=>void)|undefined;
  function lightWheel(dir:'up'|'down',who:string|null) {
    const el = $('mW');
    el.className = 'wh ' + dir;
    el.style.setProperty('--who', who ? COLORS[who] : PHYS);
    wheelTimer?.();
    wheelTimer = lifetime.timeout(() => { el.className = 'wh'; }, 150);
  }

  // マウス移動の軌跡 (直近 0.5 秒)
  const moveContext=$<HTMLCanvasElement>('moveBox').getContext('2d');if(!moveContext)throw Error('軌跡canvasを初期化できません');
  const moveCtx:CanvasRenderingContext2D=moveContext;
  const trail:{dx:number;dy:number;t:number;who:string|null}[]=[];
  function drawMove() {
    const c = moveCtx, W = 240, now = performance.now();
    while (trail.length && now - trail[0].t > 500) trail.shift();
    c.clearRect(0, 0, W, W);
    c.strokeStyle = '#2b323c'; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, W); c.moveTo(0, W / 2); c.lineTo(W, W / 2); c.stroke();
    let x = W / 2, y = W / 2;
    c.lineWidth = 4; c.lineCap = 'round';
    for (const p of trail) {
      const nx = Math.max(4, Math.min(W - 4, x + p.dx * 0.6)), ny = Math.max(4, Math.min(W - 4, y + p.dy * 0.6));
      c.strokeStyle = p.who ? COLORS[p.who] : '#fff8';
      c.globalAlpha = 1 - (now - p.t) / 500;
      c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      x = nx; y = ny;
    }
    c.globalAlpha = 1;
  }

  // ================= サーバー連携 (誰が押したかの照合用) =================
  let inject:InjectionState|null=null,game:PhoneGame|null=null,slots:SlotState[]=[];
  const pendingInj:PendingInjection[]=[];  // サーバーから通知された注入 { out, state, slot, at, focused }
  const pendingObs:PendingObservation[]=[];  // 通知より先に受け取った入力 { out, state, at, onMatch }
  const st = { inj: 0, ok: 0, miss: 0, delays: [] as number[], minHold: null as number|null };
  const lookSum = { ix: 0, iy: 0, rx: 0, ry: 0 };
  let lookWho:string|null=null,lookWhoAt=0;
  const reports:Report[]=[];
  const codeToOut:Record<string,string>={};

  function addLog(text:string, cls = '') {
    const el = document.createElement('div');
    el.className = cls;
    const d = new Date();
    el.textContent = d.toLocaleTimeString('ja-JP', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' ' + text;
    const box = $('log');
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 10;
    box.appendChild(el);
    while (box.childElementCount > 400) box.firstChild?.remove();
    if (stick) box.scrollTop = box.scrollHeight;
  }

  function renderStats() {
    const d = st.delays;
    $('sInj').textContent = String(st.inj);
    $('sOk').textContent = String(st.ok);
    $('sMiss').textContent = String(st.miss);
    $('sAvg').textContent = d.length ? (d.reduce((a, b) => a + b, 0) / d.length).toFixed(1) + 'ms' : '-';
    $('sMax').textContent = d.length ? Math.max(...d).toFixed(1) + 'ms' : '-';
    $('sHold').textContent = st.minHold == null ? '-' : Math.round(st.minHold) + 'ms';
    $('lookInj').textContent = `${lookSum.ix} / ${lookSum.iy}`;
    $('lookRecv').textContent = `${lookSum.rx} / ${lookSum.ry}`;
    $('lookRatio').textContent = lookSum.ix || lookSum.iy ? (Math.hypot(lookSum.rx, lookSum.ry) / Math.hypot(lookSum.ix, lookSum.iy)).toFixed(2) : '-';
  }

  const outLabel=(out:string)=>inject?.outputs?.[out]?.label||out;

  // 注入通知と実際の受信を突き合わせる。どちらが先に届いても照合できるようにする
  function matched(p:PendingInjection,obsAt:number,onMatch?:((slot:string)=>void)) {
    const delay = obsAt - p.at;
    st.ok++;
    st.delays.push(Math.abs(delay));
    if (st.delays.length > 2000) st.delays.shift();
    addLog(`${p.slot.padEnd(6)} ${outLabel(p.out)} ${p.state.padEnd(4)} → 受信OK (${delay >= 0 ? '+' : ''}${delay.toFixed(1)}ms)`);
    reports.push({ out: p.out, state: p.state, slot: p.slot, result: 'ok', delay: Math.round(delay * 10) / 10 });
    onMatch?.(p.slot);
    renderStats();
  }

  function onInjectNotice(e:InjectionNotice) {
    if (!e.ok) { addLog(`${e.slot} ${e.label} ${e.state} → SendInput 失敗`, 'miss'); return; }
    st.inj++;
    const p = { out: e.out, state: e.state, slot: e.slot, at: performance.now(), focused: pageFocused() };
    const i = pendingObs.findIndex((o) => o.out === p.out && o.state === p.state);
    if (i >= 0) { const o = pendingObs.splice(i, 1)[0]; matched(p, o.at, o.onMatch); }
    else pendingInj.push(p);
    renderStats();
  }

  // 受信した入力 → 誰の注入か (戻り値: slot or null)。onMatch は後から照合できた時に色を付け直す
  function observe(out:string,state:string,onMatch?:((slot:string)=>void)) {
    const at = performance.now();
    const i = pendingInj.findIndex((p) => p.out === out && p.state === state);
    if (i >= 0) { const p = pendingInj.splice(i, 1)[0]; matched(p, at); return p.slot; }
    pendingObs.push({ out, state, at, onMatch });
    return null;
  }

  lifetime.interval(() => {
    const now = performance.now();
    while (pendingInj.length && now - pendingInj[0].at > MATCH_MS) {
      const p = pendingInj.shift()!;
      if (p.focused) {
        st.miss++;
        addLog(`${p.slot.padEnd(6)} ${outLabel(p.out)} ${p.state.padEnd(4)} → 未反映（この画面で受信できず）`, 'miss');
        reports.push({ out: p.out, state: p.state, slot: p.slot, result: 'miss' });
      } else {
        addLog(`${p.slot.padEnd(6)} ${outLabel(p.out)} ${p.state.padEnd(4)} → 注入（この画面は非選択のため照合対象外）`, 'phys');
      }
      renderStats();
    }
    while (pendingObs.length && now - pendingObs[0].at > MATCH_MS) {
      const o = pendingObs.shift()!;
      addLog(`手元     ${outLabel(o.out)} ${o.state}（PC の物理キーボード / マウス）`, 'phys');
    }
  }, 100);

  lifetime.interval(() => {
    if(reports.length&&monitor?.isOpen())monitor.send({type:'observe',events:reports.splice(0)});
  }, 500);

  // 押下時間 (この画面で観測した down→up)
  const downAt:Record<string,number>={};
  function holdStart(out:string) { downAt[out] = performance.now(); }
  function holdEnd(out:string) {
    if (downAt[out] == null) return;
    const h = performance.now() - downAt[out];
    delete downAt[out];
    st.minHold = st.minHold == null ? h : Math.min(st.minHold, h);
  }

  // ================= 実際の入力を受け取る (ゲームと同じ立場) =================
  const keys = new Set<string>();
  let mouseL = false, mouseR = false;

  lifetime.listenWindow('keydown', (e) => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code) || e.ctrlKey) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    const out = codeToOut[e.code];
    const who = out ? observe(out, 'down', (s) => lightKey(e.code, keys.has(e.code), s)) : null;
    if (out) holdStart(out);
    lightKey(e.code, true, who);
    gameKeyDown(e.code);
  });
  lifetime.listenWindow('keyup', (e) => {
    keys.delete(e.code);
    const out = codeToOut[e.code];
    if (out) { observe(out, 'up'); holdEnd(out); }
    lightKey(e.code, false);
  });
  lifetime.listenWindow('blur', () => {
    for (const c of keys) lightKey(c, false);
    keys.clear();
    mouseL = mouseR = false;
    lightMouse(0, false); lightMouse(2, false);
  });
  lifetime.listenWindow('contextmenu', (e) => e.preventDefault());
  lifetime.listenWindow('mousedown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const out = e.button === 0 ? 'MOUSE_L' : 'MOUSE_R';
    const who = observe(out, 'down', (s) => lightMouse(e.button, e.button === 0 ? mouseL : mouseR, s));
    holdStart(out);
    if (e.button === 0) mouseL = true; else mouseR = true;
    lightMouse(e.button, true, who);
    if (e.button === 2) usePressed();
    if (e.target === cv && screen === 'world' && document.pointerLockElement !== cv) cv.requestPointerLock?.();
  });
  lifetime.listenWindow('mouseup', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const out = e.button === 0 ? 'MOUSE_L' : 'MOUSE_R';
    observe(out, 'up');
    holdEnd(out);
    if (e.button === 0) mouseL = false; else mouseR = false;
    lightMouse(e.button, false);
  });
  lifetime.listenWindow('wheel', (e) => {
    e.preventDefault();
    if (!e.deltaY) return;
    const out = e.deltaY < 0 ? 'WHEEL_UP' : 'WHEEL_DOWN';
    const who = observe(out, 'down');
    lightWheel(e.deltaY < 0 ? 'up' : 'down', who);
    selectSlot((sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
  }, { passive: false });
  lifetime.listenWindow('mousemove', (e) => {
    if (!e.movementX && !e.movementY) return;
    const who = performance.now() - lookWhoAt < 300 ? lookWho : null;
    if (who) { lookSum.rx += e.movementX; lookSum.ry += e.movementY; }
    trail.push({ dx: e.movementX, dy: e.movementY, t: performance.now(), who });
    if (screen === 'world' && (document.pointerLockElement === cv || who)) {
      player.yaw += e.movementX * 0.004;
      player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.004));
    }
  });

  // ================= 疑似ゲーム =================
  const cv=$<HTMLCanvasElement>('cv');
  const context=cv.getContext('2d');if(!context)throw Error('ゲームcanvasを初期化できません');
  const ctx:CanvasRenderingContext2D=context;
  const N = 28;
  const BLOCKS = ['#7a5230', '#8e8e8e', '#3c7a2e', '#c2b280', '#5a7fb5', '#b03a2e', '#e0c341', '#ffffff', '#222222'];
  const NAMES = ['木', '石', '葉', '砂', '水', 'レンガ', '金', '雪', '黒曜石'];
  const world = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) =>
    x === 0 || y === 0 || x === N - 1 || y === N - 1 ? 1 : ((x * 7 + y * 13) % 17 === 0 ? (x + y) % 3 : -1)));
  const player = { x: N / 2 + 0.5, y: N / 2 + 0.5, yaw: -Math.PI / 2, pitch: 0, z: 0, vz: 0 };
  let sel = 0, invOpen = false, mining = 0, swing = 0;
  const drops:{x:number;y:number;c:string;t:number}[]=[];
  let screen:MenuScreen|'world'='title',menuIdx=0;
  const MENUS = {
    title: { title: 'Re:Cooplay テストワールド', items: ['ワールドに入る', '設定', '終了'] },
    pause: { title: 'ゲームメニュー', items: ['ゲームに戻る', 'タイトルへ戻る'] },
    settings: { title: '設定', items: ['感度: 標準', '視野: 70', '戻る'] },
  };

  $('hotbar').innerHTML = BLOCKS.map((c, i) => `<div style="background:${c}">${i + 1}</div>`).join('');
  function selectSlot(i:number) { sel = i; [...$('hotbar').children].forEach((el, j) => el.classList.toggle('sel', j === sel)); }
  selectSlot(0);

  function enterWorld() { screen = 'world'; cv.requestPointerLock?.(); }
  function openMenu(name:MenuScreen) { screen = name; menuIdx = 0; if (document.pointerLockElement) document.exitPointerLock(); }

  function gameKeyDown(code:string) {
    if (/^Digit[1-9]$/.test(code)) selectSlot(Number(code.slice(5)) - 1);
    if (screen !== 'world') {
      const m = MENUS[screen];
      if (code === 'ArrowUp') menuIdx = (menuIdx + m.items.length - 1) % m.items.length;
      else if (code === 'ArrowDown') menuIdx = (menuIdx + 1) % m.items.length;
      else if (code === 'Enter') {
        const item = m.items[menuIdx];
        if (item === 'ワールドに入る' || item === 'ゲームに戻る') enterWorld();
        else if (item === '設定') openMenu('settings');
        else if (item === '戻る' || item === 'タイトルへ戻る') openMenu('title');
      } else if (code === 'Escape') {
        if (screen === 'pause') enterWorld();
        else if (screen === 'settings') openMenu('title');
      }
      return;
    }
    if (code === 'Escape') { invOpen ? (invOpen = false) : openMenu('pause'); }
    else if (code === 'KeyE') invOpen = !invOpen;
    else if (code === 'Space' && player.z === 0) player.vz = 5.5;
    else if (code === 'KeyQ') drops.push({ x: player.x + Math.cos(player.yaw) * 0.8, y: player.y + Math.sin(player.yaw) * 0.8, c: BLOCKS[sel], t: performance.now() });
  }
  // Esc でブラウザがマウス固定を外した = ゲームでは Esc でメニューを開いた扱い
  lifetime.listenDocument('pointerlockchange', () => {
    if (!document.pointerLockElement && screen === 'world') {
      openMenu('pause');
      const i = pendingInj.findIndex((p) => p.out === 'ESC' && p.state === 'down');
      if (i >= 0) matched(pendingInj.splice(i, 1)[0], performance.now());
    }
  });

  const front = () => {
    const fx = Math.floor(player.x + Math.cos(player.yaw) * 1.1), fy = Math.floor(player.y + Math.sin(player.yaw) * 1.1);
    return fx > 0 && fy > 0 && fx < N - 1 && fy < N - 1 ? [fx, fy] : null;
  };
  function usePressed() {
    if (screen !== 'world' || invOpen) return;
    const f = front();
    if (f && world[f[1]][f[0]] < 0 && !(Math.floor(player.x) === f[0] && Math.floor(player.y) === f[1])) world[f[1]][f[0]] = sel;
    swing = 1;
  }
  const solid = (x:number,y:number) => world[Math.floor(y)]?.[Math.floor(x)] >= 0;

  let last = performance.now();
  function tick(now:number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (screen === 'world' && !invOpen) {
      let f = 0, s = 0;
      if (keys.has('KeyW')) f++; if (keys.has('KeyS')) f--; if (keys.has('KeyD')) s++; if (keys.has('KeyA')) s--;
      const speed = keys.has('ShiftLeft') ? 1.3 : keys.has('ControlLeft') && f > 0 ? 5.6 : 4.3;
      const len = Math.hypot(f, s) || 1;
      const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
      const vx = (cos * f - sin * s) / len * speed * dt, vy = (sin * f + cos * s) / len * speed * dt;
      const r = 0.3;
      if (!solid(player.x + vx + Math.sign(vx) * r, player.y)) player.x += vx;
      if (!solid(player.x, player.y + vy + Math.sign(vy) * r)) player.y += vy;
      // 攻撃は押し続けると採掘 (押下時間が反映されるかの確認)
      const fr = front();
      if (mouseL && fr && world[fr[1]][fr[0]] >= 0) {
        mining += dt;
        if (mining > 0.35) { world[fr[1]][fr[0]] = -1; mining = 0; }
      } else mining = 0;
      if (mouseL) swing = 1;
    }
    player.vz -= 18 * dt; player.z = Math.max(0, player.z + player.vz * dt); if (player.z === 0) player.vz = 0;
    swing = Math.max(0, swing - dt * 4);
    draw(now);
    drawMove();
    renderTop();
    frame=requestAnimationFrame(tick);
  }

  function draw(now:number) {
    const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
    const T = Math.min(W, H) / 13;
    ctx.fillStyle = '#25381f'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.yaw - Math.PI / 2); // 向いている方向を常に画面の上にする
    ctx.translate(-player.x * T, -player.y * T);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#2e4426' : '#2a3f23';
      ctx.fillRect(x * T, y * T, T + 1, T + 1);
      const b = world[y][x];
      if (b >= 0) { ctx.fillStyle = BLOCKS[b]; ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); ctx.fillStyle = '#0003'; ctx.fillRect(x * T + 1, y * T + T * 0.7, T - 2, T * 0.3 - 1); }
    }
    const fr = front();
    if (fr && screen === 'world') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(fr[0] * T + 2, fr[1] * T + 2, T - 4, T - 4);
      if (mining > 0) { ctx.fillStyle = '#000a'; ctx.fillRect(fr[0] * T + 2, fr[1] * T + 2, (T - 4) * mining / 0.35, 6); }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (now - d.t > 3000) { drops.splice(i, 1); continue; }
      ctx.fillStyle = d.c; ctx.fillRect(d.x * T - T * 0.15, d.y * T - T * 0.15, T * 0.3, T * 0.3);
    }
    ctx.restore();
    // プレイヤー (常に中央・上向き)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const sc = 1 + player.z * 0.12 - (keys.has('ShiftLeft') ? 0.15 : 0);
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(0, T * 0.15, T * 0.35, T * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(sc, sc);
    ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(0, 0, T * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a6ea5'; ctx.beginPath(); ctx.moveTo(0, -T * 0.55); ctx.lineTo(T * 0.18, -T * 0.25); ctx.lineTo(-T * 0.18, -T * 0.25); ctx.fill();
    if (swing > 0) { ctx.strokeStyle = BLOCKS[sel]; ctx.lineWidth = T * 0.14; ctx.beginPath(); ctx.arc(0, 0, T * 0.6, -Math.PI / 2 - swing, -Math.PI / 2 + swing * 0.3); ctx.stroke(); }
    ctx.restore();
    // ピッチ (上下の視点) ゲージ
    const gx = W - 30 * devicePixelRatio, gh = H * 0.4, gy = H / 2 - gh / 2;
    ctx.fillStyle = '#0008'; ctx.fillRect(gx - 6, gy, 12, gh);
    ctx.fillStyle = '#fff'; ctx.fillRect(gx - 10, gy + gh / 2 - player.pitch / 1.5 * gh / 2 - 2, 20, 4);
    ctx.font = `${12 * devicePixelRatio}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('上下', gx, gy - 8);
    // 方位
    ctx.fillText(`向き ${Number(((player.yaw * 180 / Math.PI) % 360 + 360).toFixed(0)) % 360}°`, W / 2, 30 * devicePixelRatio + 20);

    if (invOpen && screen === 'world') overlay('インベントリ（E で閉じる）', NAMES.map((n, i) => (i === sel ? '▶ ' : '　') + n), -1);
    if (screen !== 'world') overlay(MENUS[screen].title, MENUS[screen].items, menuIdx, '↑↓ で選択 / Enter で決定 / Esc で戻る');
  }
  function overlay(title:string,items:string[],idx:number,hint='') {
    const W = cv.width, H = cv.height, d = devicePixelRatio;
    ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = `bold ${26 * d}px system-ui`; ctx.fillText(title, W / 2, H * 0.28);
    items.forEach((it, i) => {
      const y = H * 0.38 + i * 52 * d;
      ctx.fillStyle = i === idx ? '#4c8dff' : '#ffffff18';
      ctx.fillRect(W / 2 - 160 * d, y - 20 * d, 320 * d, 40 * d);
      ctx.fillStyle = '#fff'; ctx.font = `${17 * d}px system-ui`; ctx.fillText(it, W / 2, y + 6 * d);
    });
    if (hint) { ctx.fillStyle = '#aaa'; ctx.font = `${13 * d}px system-ui`; ctx.fillText(hint, W / 2, H * 0.38 + items.length * 52 * d + 20 * d); }
  }

  // ================= 上部ステータス / プレイヤー =================
  function pageFocused() { return document.hasFocus() && !document.hidden; }
  function renderTop() {
    const ph = game?.phase;
    $('phase').textContent = { lobby: 'ロビー（ホストのリモコン操作）', coop: '協力プレイ中（分担操作）', paused: '一時停止中（ホストのリモコン操作）' }[ph as 'lobby'|'coop'|'paused'] || '-';
    $('phase').className = 'pill ' + (ph === 'coop' ? 'ok' : ph === 'paused' ? 'warn' : '');
    $('inj').textContent = !inject ? '-' : !inject.available ? `注入不可: ${inject.error}` : inject.active ? `注入: 有効（${inject.mode === 'on' ? '常時ON' : 'テスト'}）` : inject.mode === 'off' ? '注入: OFF' : '注入: 停止中（この画面を選択してください）';
    $('inj').className = 'pill ' + (inject?.active ? 'ok' : inject?.mode === 'off' ? 'ng' : 'warn');
    const f = pageFocused();
    $('focus').textContent = f ? 'この画面: 選択中' : 'この画面: 非選択（クリックで選択）';
    $('focus').className = 'pill ' + (f ? 'ok' : 'warn');
    const locked = document.pointerLockElement === cv;
    $('lock').textContent = locked ? 'マウス: 固定中' : 'マウス: 未固定';
    $('lock').className = 'pill ' + (locked ? 'ok' : '');
    $('lockHint').style.display = screen === 'world' && !locked ? 'block' : 'none';
  }
  function renderPlayers() {
    $('players').innerHTML = ['P1', 'P2', 'P3', 'P4'].map((n) => {
      const s=slots.find(x=>x.name===n);
      const role = n === 'P1' ? 'ホスト' : '参加者'; // 分担は操作定義から決まる (#141)
      const held = (s?.pressed || []).join(' ');
      const rtt = s?.clientStats ? `${s.clientStats.avg}ms` : '';
      return `<div class="pl ${s?.connected ? 'on' : ''}" style="color:${COLORS[n]}"><b>${n}</b> <span style="color:var(--muted)">${role}</span>
        <div class="h">${s?.assigned ? (s?.connected ? '接続中 ' + rtt : '切断') : '未参加'}</div><div class="h" style="color:var(--text)">${escapeHtml(held)}</div></div>`;
    }).join('');
  }

  // ================= WebSocket =================
  let monitor:ReturnType<typeof createMonitor>|null=null;
  function reportFocus(){monitor?.send({type:'focus',focused:pageFocused()});}
  lifetime.listenWindow('focus', reportFocus);
  lifetime.listenWindow('blur', reportFocus);
  lifetime.listenDocument('visibilitychange', reportFocus);
  lifetime.interval(reportFocus, 1000);

  function connect(){
    monitor=createMonitor({page:'game',onOpen(){reportFocus();addLog('サーバーに接続','sys');},onConnection:open=>{if(!open)addLog('サーバー切断 — 再接続中','miss');},onMessage:msg=>{
      if (msg.type === 'state') {
        slots=msg.slots??[];
        game = msg.game;
        inject = msg.inject;
        for (const [id, o] of Object.entries(inject.outputs??{})) if (o.code) codeToOut[o.code] = id;
        document.querySelectorAll<HTMLButtonElement>('#modeSeg button').forEach((el) => el.classList.toggle('sel', el.dataset.mode === msg.inject.mode));
        renderPlayers();
      } else if (msg.type === 'game') {
        if (game && game.phase !== msg.game.phase) addLog(`進行: ${msg.game.phase}${msg.game.reason ? '（' + msg.game.reason + '）' : ''}`, 'sys');
        game = msg.game;
      } else if (msg.type === 'inject') {
        onInjectNotice(msg.entry);
      } else if (msg.type === 'look') {
        lookSum.ix += msg.entry.dx;
        lookSum.iy += msg.entry.dy;
        lookWho = msg.entry.slot;
        lookWhoAt = performance.now();
        renderStats();
      } else if (msg.type === 'log' && ['join', 'reconnect', 'disconnect', 'command', 'inject_mode'].includes(msg.entry.kind)) {
        const e = msg.entry;
        addLog(`${e.kind} ${e.slot || ''} ${e.cmd || e.reason || e.mode || ''}`, e.kind === 'disconnect' ? 'miss' : 'sys');
      }
    }});
  }
  // ボタンにフォーカスが残ると Space / Enter でボタンが押されてしまうので外す
  lifetime.listenDocument('click', (e) => { if(e.target instanceof Element)e.target.closest('button')?.blur(); });
  document.querySelectorAll<HTMLButtonElement>('#modeSeg button').forEach((el) => lifetime.listen(el,'click',(e)=>{
    e.stopPropagation();
    if (el.dataset.mode === 'on' && !confirm('常時ONにすると、スマホの入力が「今選択されているウィンドウ」に送られます。よろしいですか？')) return;
    const mode=el.dataset.mode;if(mode==='off'||mode==='test'||mode==='on')monitor?.send({type:'inject_mode',mode});
  }));
  lifetime.listen($('resetStats'),'click',()=>{
    Object.assign(st, { inj: 0, ok: 0, miss: 0, delays: [] as number[], minHold: null as number|null });
    Object.assign(lookSum, { ix: 0, iy: 0, rx: 0, ry: 0 });
    pendingInj.length = pendingObs.length = 0;
    $('log').innerHTML = '';
    renderStats();
  });

  connect();
  frame=requestAnimationFrame(tick);

  lifetime.own(()=>cancelAnimationFrame(frame));
  return ()=>{monitor?.send({type:'focus',focused:false});monitor?.dispose();lifetime.dispose();wheelTimer?.();keys.clear();mouseL=mouseR=false;pendingInj.length=pendingObs.length=reports.length=0;if(document.pointerLockElement===cv)document.exitPointerLock();};
}
