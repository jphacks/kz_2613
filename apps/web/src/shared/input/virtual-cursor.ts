import type {RemoteInput} from '../transport/pc-messages.ts';
export const CURSOR_IDLE_MS = 4000;
// OSカーソルを動かさず、サーバーがPC画面へ認可した操作だけをDOMへ適用する。
// 枠の端を越えて動かしたとき、ホストが許せば (canLeave) その位置をホストへ知らせ、OS のカーソルへ引き継ぐ (#405)
export interface VirtualCursorOptions { canLeave?(): boolean; leave?(at: {x:number;y:number;w:number;h:number}): void }
export function createVirtualCursor({ canLeave = () => false, leave = () => {} }: VirtualCursorOptions = {}) {
  const marker = document.createElement('div');
  marker.setAttribute('aria-hidden', 'true');
  marker.id = 'virtualCursor';
  marker.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;border:3px solid var(--color-cyan-ink);border-radius:50%;background:var(--color-paper);pointer-events:none;z-index:var(--z-cursor);display:none;box-shadow:0 0 0 3px var(--color-paper)';
  document.body.append(marker);
  let x = innerWidth / 2, y = innerHeight / 2, idle: ReturnType<typeof setTimeout> | undefined;
  // 引き継ぎを知らせた後、ホストが操作先を変えるまでの間に届いた移動は捨てる (二重に知らせない)。
  // ホストが引き継がなかったとき (実入力を送れない等) に止まったままにならないよう、1 秒で戻す
  const LEAVE_WAIT_MS = 1000;
  let leftAt: number | null = null;
  // 実際のマウスで PC アプリへ戻ってきたら、その位置からリモコンのカーソルを始める (#405)
  const follow = (event: MouseEvent) => { x = Math.max(10, Math.min(innerWidth - 10, event.clientX)); y = Math.max(10, Math.min(innerHeight - 10, event.clientY)); leftAt = null; };
  document.addEventListener?.('mousemove', follow);
  // 使っていないときはPC画面に丸を残さない (#308)。動かす・押すと同じ位置にまた出す
  const show = () => { marker.style.display = 'block'; clearTimeout(idle); idle = setTimeout(() => { marker.style.display = 'none'; }, CURSOR_IDLE_MS); };
  // showModalのトップレイヤーより後ろへカーソルが隠れないよう、開いているダイアログへ移す。
  const syncLayer = () => {
    const layer = document.querySelector?.('dialog[open]') || document.body;
    if (marker.parentElement !== layer) layer.append(marker);
  };
  const hit = () => document.elementFromPoint(x, y);
  // プルダウンはスクリプトから一覧を開けないので、選ぶだけにする。値はリモコンの◀▶で切り替える (#294)
  const click = () => {
    const el = hit()?.closest('button,a,summary,select,input,label,[data-game],[data-swap]');
    if (el instanceof HTMLElement && !('disabled' in el && el.disabled)) { if (el.tagName === 'SELECT') el.focus(); else el.click(); }
    syncLayer();
  };
  const scroll = (dy: number) => {
    let el = hit();
    while (el && el !== document.documentElement && !(el.scrollHeight > el.clientHeight && ['auto','scroll'].includes(getComputedStyle(el).overflowY))) el = el.parentElement;
    (el || document.documentElement).scrollBy({top:dy,behavior:'instant'});
  };
  return {
    handle(m: RemoteInput) {
      syncLayer();
      if (m.kind === 'move') {
        if (leftAt !== null && Date.now() - leftAt < LEAVE_WAIT_MS) return true;
        leftAt = null;
        const nx = x + m.dx, ny = y + m.dy;
        if ((nx < 0 || ny < 0 || nx > innerWidth || ny > innerHeight) && canLeave()) {
          // 枠を越えた。越えた辺の上の位置で、OS のカーソルへ引き継ぐ。丸は消す
          leftAt = Date.now();
          x = Math.max(0, Math.min(innerWidth, nx)); y = Math.max(0, Math.min(innerHeight, ny));
          leave({ x, y, w: innerWidth, h: innerHeight });
          x = Math.max(10, Math.min(innerWidth - 10, x)); y = Math.max(10, Math.min(innerHeight - 10, y));
          clearTimeout(idle); marker.style.display = 'none'; return true;
        }
        x = Math.max(10,Math.min(innerWidth - 10,nx)); y = Math.max(10,Math.min(innerHeight - 10,ny));
        show(); marker.style.transform = `translate(${x - 9}px,${y - 9}px)`; return true;
      }
      if (m.kind === 'scroll') { scroll(m.dy); return true; }
      if (m.kind==='release' || m.state !== 'down') return true;
      if (m.control === 'REMOTE_LEFT') { show(); click(); return true; }
      if (m.control === 'REMOTE_RIGHT' || m.control === 'REMOTE_E') return true;
      if (m.control === 'REMOTE_WHEEL_UP') { scroll(-120); return true; }
      if (m.control === 'REMOTE_WHEEL_DOWN') { scroll(120); return true; }
      return false;
    },
    dispose(){clearTimeout(idle);document.removeEventListener?.('mousemove', follow);marker.remove();},
  };
}
