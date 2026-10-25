// ホスト用。協力視点の30Hz累積値とは独立した、上限付きのメニュー操作。
export function bindTouchpad(element, { enabled, send, tap }) {
  let pointer = null, x = 0, y = 0, dx = 0, dy = 0, distance = 0, rseq = 0;
  const reset = () => { pointer = null; dx = dy = distance = 0; element.classList.remove('down'); };
  const release = () => { reset(); send({kind:'release',rseq:++rseq}); };
  element.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!enabled() || pointer !== null) return;
    pointer = e.pointerId; x = e.clientX; y = e.clientY; distance = 0;
    element.setPointerCapture(e.pointerId); element.classList.add('down');
  });
  element.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer || !enabled()) return;
    const mx = e.clientX - x, my = e.clientY - y;
    dx = Math.max(-120, Math.min(120, dx + mx)); dy = Math.max(-120, Math.min(120, dy + my));
    distance += Math.abs(mx) + Math.abs(my); x = e.clientX; y = e.clientY;
  });
  element.addEventListener('pointerup', e => {
    if (e.pointerId !== pointer) return;
    if (enabled() && distance < 8) tap(e.timeStamp);
    reset();
  });
  for (const name of ['pointercancel', 'lostpointercapture']) element.addEventListener(name, e => {
    if (pointer === e.pointerId) release();
  });
  // 入力毎のDOM描画を増やさず、未送信量だけを最大30Hzで送る。
  setInterval(() => {
    if (!enabled()) { reset(); return; }
    if (dx || dy) { send({kind:'move',dx,dy,rseq:++rseq}); dx = dy = 0; }
  }, 1000 / 30);
  return { reset, release };
}
