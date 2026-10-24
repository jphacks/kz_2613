// OSカーソルを動かさず、サーバーがPC画面へ認可した操作だけをDOMへ適用する。
export function createVirtualCursor() {
  const marker = document.createElement('div');
  marker.setAttribute('aria-hidden', 'true');
  marker.id = 'virtualCursor';
  marker.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;border:3px solid var(--color-cyan-ink);border-radius:50%;background:var(--color-paper);pointer-events:none;z-index:var(--z-cursor);display:none;box-shadow:0 0 0 3px var(--color-paper)';
  document.body.append(marker);
  let x = innerWidth / 2, y = innerHeight / 2;
  const hit = () => document.elementFromPoint(x, y);
  const click = () => { const el = hit()?.closest('button,a,[data-game]'); if (el && !el.disabled) el.click(); };
  const scroll = dy => {
    let el = hit();
    while (el && el !== document.documentElement && !(el.scrollHeight > el.clientHeight && ['auto','scroll'].includes(getComputedStyle(el).overflowY))) el = el.parentElement;
    (el || document.documentElement).scrollBy({top:dy,behavior:'instant'});
  };
  return {
    handle(m) {
      if (m.kind === 'move') {
        x = Math.max(10,Math.min(innerWidth - 10,x + m.dx)); y = Math.max(10,Math.min(innerHeight - 10,y + m.dy));
        marker.style.display = 'block'; marker.style.transform = `translate(${x - 9}px,${y - 9}px)`; return true;
      }
      if (m.kind === 'scroll') { scroll(m.dy); return true; }
      if (m.state !== 'down') return true;
      if (m.control === 'REMOTE_LEFT') { click(); return true; }
      if (m.control === 'REMOTE_RIGHT' || m.control === 'REMOTE_E') return true;
      if (m.control === 'REMOTE_WHEEL_UP') { scroll(-120); return true; }
      if (m.control === 'REMOTE_WHEEL_DOWN') { scroll(120); return true; }
      return false;
    },
  };
}
