// ホスト用。協力視点の30Hz累積値とは独立した、上限付きのメニュー操作。
// 1本指: カーソル移動・タップで左クリック。2本指: スクロール・タップで右クリック (ノートPCのタッチパッドと同じ、#122)。
// スクロールの向きは Windows・スマホの既定と同じ「ナチュラル」(指を上へ動かすと下へスクロール)。
export function bindTouchpad(element, { enabled, send, tap, rightTap = () => {} }) {
  // 指ごとの最後の位置。2本目までだけ追う
  const pointers = new Map();
  let mode = null, dx = 0, dy = 0, sy = 0, distance = 0, startedAt = 0, rseq = 0;
  const reset = () => {
    pointers.clear(); mode = null; dx = dy = sy = distance = 0;
    element.classList.remove('down');
  };
  const release = () => { reset(); send({kind:'release',rseq:++rseq}); };
  element.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!enabled() || pointers.size >= 2 || pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    element.setPointerCapture(e.pointerId); element.classList.add('down');
    if (pointers.size === 1) { mode = 'move'; distance = 0; startedAt = e.timeStamp; }
    // 2本目が触れたらスクロールに切り替え、送っていないカーソル移動は捨てる
    else { mode = 'scroll'; dx = dy = sy = 0; distance = 0; startedAt = e.timeStamp; }
  });
  element.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || !enabled()) return;
    const mx = e.clientX - p.x, my = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    distance += Math.abs(mx) + Math.abs(my);
    if (mode === 'move') {
      dx = Math.max(-120, Math.min(120, dx + mx)); dy = Math.max(-120, Math.min(120, dy + my));
    } else if (mode === 'scroll') {
      // 2本の指の平均の動き。ナチュラルなので向きを逆にする
      sy = Math.max(-120, Math.min(120, sy - my / 2));
    }
  });
  element.addEventListener('pointerup', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return; // 2本指の途中で1本離しても、両方離すまでスクロールのまま
    const quick = e.timeStamp - startedAt < 300;
    if (enabled() && distance < 8) {
      if (mode === 'move') tap(e.timeStamp);
      else if (mode === 'scroll' && quick) rightTap(e.timeStamp);
    }
    mode = null; dx = dy = sy = distance = 0;
    element.classList.remove('down');
  });
  for (const name of ['pointercancel', 'lostpointercapture']) element.addEventListener(name, e => {
    if (pointers.has(e.pointerId)) release();
  });
  // 入力毎のDOM描画を増やさず、未送信量だけを最大30Hzで送る。
  setInterval(() => {
    if (!enabled()) { reset(); return; }
    if (mode === 'move' && (dx || dy)) { send({kind:'move',dx,dy,rseq:++rseq}); dx = dy = 0; }
    const n = Math.round(sy); // 端数は次へ持ち越す
    if (mode === 'scroll' && n) { send({kind:'scroll',dy:n,rseq:++rseq}); sy -= n; }
  }, 1000 / 30);
  return { reset, release };
}
