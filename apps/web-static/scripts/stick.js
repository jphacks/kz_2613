// 移動スティック (#139)。8 方向に倒すと、方向ごとの操作 (W/A/S/D など) を組み合わせて押す。
// Minecraft の専用画面と、操作定義から作る画面の両方で使う。

/** スティックの位置 (中心 0、端 ±1) から押す方向。中心付近 (30% 以内) は何も押さない */
export function stickDirections(x, y) {
  const want = new Set();
  if (Math.hypot(x, y) <= 0.3) return want;
  const a = Math.atan2(y, x) * 180 / Math.PI; // 右 0°, 下 90°
  if (a > -157.5 && a < -22.5) want.add('up');
  if (a > 22.5 && a < 157.5) want.add('down');
  if (a > 112.5 || a < -112.5) want.add('left');
  if (a > -67.5 && a < 67.5) want.add('right');
  return want;
}

/**
 * stick の要素 (.knob と data-d="up|down|left|right" の .dir を持つ) にスティックの操作を付ける。
 * codes: 方向 → 送る操作。ない方向 (前進・後退だけのゲームの左右など) には反応しない
 */
export function attachStick(stick, { codes, isOpen, ctlDown, ctlUp, onCancel = () => {} }) {
  const knob = stick.querySelector('.knob');
  let stickId = null;
  const on = new Set(); // 押している操作
  function update(e) {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width * 2 - 1;
    let y = (e.clientY - r.top) / r.height * 2 - 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    knob.style.transform = `translate(${x * 62}%, ${y * 62}%)`;
    const want = new Set([...stickDirections(x, y)].map((d) => codes[d]).filter(Boolean));
    for (const c of [...on]) if (!want.has(c)) { on.delete(c); ctlUp(c); }
    for (const c of want) if (!on.has(c)) { on.add(c); ctlDown(c, e.timeStamp); }
    stick.querySelectorAll('.dir').forEach((el) => el.classList.toggle('on', on.has(codes[el.dataset.d])));
  }
  function release() {
    stickId = null;
    stick.classList.remove('active');
    knob.style.transform = '';
    for (const c of [...on]) { on.delete(c); ctlUp(c); }
    stick.querySelectorAll('.dir').forEach((el) => el.classList.remove('on'));
  }
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!isOpen()) return;
    if (stickId != null) return;
    stickId = e.pointerId;
    stick.setPointerCapture?.(e.pointerId);
    stick.classList.add('active');
    update(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) update(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(t, (e) => {
    if (e.pointerId !== stickId) return;
    if (t !== 'pointerup') onCancel();
    release();
  });
  return { release };
}
