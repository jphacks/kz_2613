// 移動スティックと30Hzの協力視点。画面の再描画・通信の再生成から独立させる。
export function bindCooperativeInput({getGame,getRole,isOpen,ctlDown,ctlUp,sendLook,onCancel=()=>{}}) {
  const $ = id => document.getElementById(id);
  // ---- P1: 移動スティック (8 方向 → W/A/S/D の組み合わせ) ----
  const stick = $('stick');
  const knob = stick.querySelector('.knob');
  let stickId = null;
  const stickOn = new Set();
  function stickUpdate(e) {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width * 2 - 1;
    let y = (e.clientY - r.top) / r.height * 2 - 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    knob.style.transform = `translate(${x * 62}%, ${y * 62}%)`;
    const want = new Set();
    if (Math.hypot(x, y) > 0.3) {
      const a = Math.atan2(y, x) * 180 / Math.PI; // 右 0°, 下 90°
      if (a > -157.5 && a < -22.5) want.add('FWD');
      if (a > 22.5 && a < 157.5) want.add('BACK');
      if (a > 112.5 || a < -112.5) want.add('LEFT');
      if (a > -67.5 && a < 67.5) want.add('RIGHT');
    }
    for (const d of [...stickOn]) if (!want.has(d)) { stickOn.delete(d); ctlUp(d); }
    for (const d of want) if (!stickOn.has(d)) { stickOn.add(d); ctlDown(d, e.timeStamp); }
    stick.querySelectorAll('.dir').forEach((el) => el.classList.toggle('on', stickOn.has(el.dataset.d)));
  }
  function stickRelease() {
    stickId = null;
    stick.classList.remove('active');
    knob.style.transform = '';
    for (const d of [...stickOn]) { stickOn.delete(d); ctlUp(d); }
    stick.querySelectorAll('.dir').forEach((el) => el.classList.remove('on'));
  }
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!isOpen()) return;
    if (stickId != null) return;
    stickId = e.pointerId;
    stick.setPointerCapture?.(e.pointerId);
    stick.classList.add('active');
    stickUpdate(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickUpdate(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(t, (e) => {
    if (e.pointerId !== stickId) return;
    if (t !== 'pointerup') onCancel();
    stickRelease();
  });

  // ---- P2: 視点パッド (ドラッグ量をマウス相対移動として送る) ----
  const pad = $('pad');
  const dot = pad.querySelector('.dot');
  let moveAt = null;
  let padId = null, lastX = 0, lastY = 0, accX = 0, accY = 0;
  const sens = () => Number($('sens').value);
  $('sens').addEventListener('input', () => {
    $('sensVal').textContent = sens().toFixed(1);
    try { localStorage.setItem('recooplay.sens', $('sens').value); } catch {}
  });
  try { const v = localStorage.getItem('recooplay.sens'); if (v) { $('sens').value = v; $('sensVal').textContent = Number(v).toFixed(1); } } catch {}
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!isOpen()) return;
    if (padId != null) return;
    padId = e.pointerId;
    pad.setPointerCapture?.(e.pointerId);
    lastX = e.clientX; lastY = e.clientY;
    pad.classList.add('active');
    moveDot(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padId) return;
    moveAt ??= e.timeStamp;
    accX += (e.clientX - lastX) * sens();
    accY += (e.clientY - lastY) * sens();
    lastX = e.clientX; lastY = e.clientY;
    moveDot(e);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(t, (e) => {
    if (e.pointerId !== padId) return;
    if (e.type !== 'pointerup') { onCancel(); accX = accY = 0; moveAt = null; }
    padId = null;
    pad.classList.remove('active');
    dot.style.display = 'none';
  });
  function moveDot(e) {
    const r = pad.getBoundingClientRect();
    dot.style.display = 'block';
    dot.style.left = (e.clientX - r.left) + 'px';
    dot.style.top = (e.clientY - r.top) + 'px';
  }
  // 溜まった移動量を 30Hz で送る。ACK は返さない。滑らかさは PC 側で補間する。
  // 累積値はepochごとに0へ戻す。同じepoch内の欠落だけを次のパケットで取り戻す。
  const look = { seq: 0, cx: 0, cy: 0 };
  setInterval(() => {
    if ((accX || accY) && getGame()?.phase === 'coop' && getRole() === 'P2' && isOpen()) {
      look.cx += accX;
      look.cy += accY;
      const msg = { type: 'look', lseq: ++look.seq, epoch: getGame().epoch, cx: Math.round(look.cx * 100) / 100, cy: Math.round(look.cy * 100) / 100 };
      sendLook(msg, moveAt);
      moveAt = null;
    }
    accX = accY = 0;
  }, 33);


  function release() { stickRelease(); padId = null; accX = accY = 0; moveAt = null; pad.classList.remove('active'); dot.style.display = 'none'; }
  function resetEpoch() { release(); look.seq = look.cx = look.cy = 0; }
  return {release, resetEpoch};
}
