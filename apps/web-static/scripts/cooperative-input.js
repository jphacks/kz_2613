// 移動スティックと30Hzの協力視点。画面の再描画・通信の再生成から独立させる。
import { attachStick } from './stick.js';
export function bindCooperativeInput({getGame,getRole,canLook=()=>getRole()==='P2',isOpen,ctlDown,ctlUp,sendLook,onCancel=()=>{}}) {
  const $ = id => document.getElementById(id);
  // ---- P1: 移動スティック (8 方向 → W/A/S/D の組み合わせ、#139 で共通の部品に) ----
  const fixedStick = attachStick($('stick'), { codes: { up: 'FWD', down: 'BACK', left: 'LEFT', right: 'RIGHT' }, isOpen, ctlDown, ctlUp, onCancel });
  // 操作定義から作る画面のスティック。画面を作り直すたびに置き換える
  let genStick = null;
  function setGeneratedStick(el, codes) {
    genStick?.release();
    genStick = el ? attachStick(el, { codes, isOpen, ctlDown, ctlUp, onCancel }) : null;
  }
  function stickRelease() { fixedStick.release(); genStick?.release(); }

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
    if ((accX || accY) && getGame()?.phase === 'coop' && canLook() && isOpen()) {
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
  return {release, resetEpoch, setGeneratedStick};
}
