import {createLifetime} from './lifetime.ts';
export type RemoteGesture = {kind:'release';rseq:number} | {kind:'move';dx:number;dy:number;rseq:number} | {kind:'scroll';dy:number;rseq:number};
export interface TouchpadOptions {enabled():boolean; send(message:RemoteGesture):void; tap(at:number):void; rightTap?(at:number):void}
// ホスト用。協力視点の30Hz累積値とは独立した、上限付きのメニュー操作。
// 1本指: カーソル移動・タップで左クリック。2本指: スクロール・タップで右クリック (ノートPCのタッチパッドと同じ、#122)。
// スクロールの向きは Windows・スマホの既定と同じ「ナチュラル」(指を上へ動かすと下へスクロール)。
export function bindTouchpad(element: HTMLElement, { enabled, send, tap, rightTap = () => {} }: TouchpadOptions) {
  // 指ごとの最後の位置。2本目までだけ追う
  const lifetime = createLifetime();
  const pointers = new Map<number,{x:number;y:number}>();
  let mode: 'move' | 'scroll' | null = null;
  let dx = 0, dy = 0, sy = 0, distance = 0, startedAt = 0, rseq = 0;
  const reset = () => {
    pointers.clear(); mode = null; dx = dy = sy = distance = 0;
    element.classList.remove('down');
  };
  const release = () => { reset(); send({kind:'release',rseq:++rseq}); };
  lifetime.listen(element, 'pointerdown', e => {
    e.preventDefault();
    if (!enabled() || pointers.size >= 2 || pointers.has(e.pointerId)) return;
    const newGesture = pointers.size === 0;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    element.setPointerCapture(e.pointerId); element.classList.add('down');
    if (newGesture) { mode = 'move'; distance = 0; startedAt = e.timeStamp; }
    // 2本目が触れたらスクロールに切り替え、送っていないカーソル移動は捨てる
    else if (mode === 'move') { mode = 'scroll'; dx = dy = sy = 0; distance = 0; startedAt = e.timeStamp; }
    // スクロール中に片指を置き直しても同じ操作を継続する。距離と開始時刻を消すと、最後の解放が右クリックになってしまう。
  });
  lifetime.listen(element, 'pointermove', e => {
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
  lifetime.listen(element, 'pointerup', e => {
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
  for (const name of ['pointercancel', 'lostpointercapture'] as const) lifetime.listen(element, name, e => {
    if (pointers.has(e.pointerId)) release();
  });
  // 入力毎のDOM描画を増やさず、未送信量だけを最大30Hzで送る。
  lifetime.interval(() => {
    if (!enabled()) { reset(); return; }
    if (mode === 'move' && (dx || dy)) { send({kind:'move',dx,dy,rseq:++rseq}); dx = dy = 0; }
    const n = Math.round(sy); // 端数は次へ持ち越す
    if (mode === 'scroll' && n) { send({kind:'scroll',dy:n,rseq:++rseq}); sy -= n; }
  }, 1000 / 30);
  return { reset, release, dispose() { release(); lifetime.dispose(); } };
}
