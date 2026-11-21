// エンジンの開始と破棄を対にする。再マウント後に旧リスナー・タイマーを残さない。
export function createLifetime() {
  const cleanup = new Set<() => void>();
  let disposed = false;
  function own(dispose: () => void) {
    let active = true;
    const stop = () => {
      if (!active) return;
      active = false;
      cleanup.delete(stop);
      dispose();
    };
    if (disposed) stop(); else cleanup.add(stop);
    return stop;
  }
  function listen<K extends keyof HTMLElementEventMap>(element: HTMLElement, name: K, listener: (event: HTMLElementEventMap[K]) => void) {
    element.addEventListener(name, listener);
    return own(() => element.removeEventListener(name, listener));
  }
  function interval(callback: () => void, ms: number) {
    const timer = setInterval(callback, ms);
    return own(() => clearInterval(timer));
  }
  function listenEvent(target: EventTarget, name: string, listener: EventListener) {
    target.addEventListener(name, listener);
    return own(() => target.removeEventListener(name, listener));
  }
  function listenDocument<K extends keyof DocumentEventMap>(name:K, listener:(event:DocumentEventMap[K])=>void) {
    document.addEventListener(name,listener);
    return own(()=>document.removeEventListener(name,listener));
  }
  function listenWindow<K extends keyof WindowEventMap>(name:K, listener:(event:WindowEventMap[K])=>void,options?:AddEventListenerOptions) {
    window.addEventListener(name,listener,options);
    return own(()=>window.removeEventListener(name,listener,options));
  }
  function timeout(callback: () => void, ms: number) {
    const timer = setTimeout(() => {stop();callback();}, ms);
    const stop = own(() => clearTimeout(timer));
    return stop;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const stop of cleanup) stop();
    cleanup.clear();
  }
  return {own, listen, listenEvent, listenDocument, listenWindow, interval, timeout, dispose};
}
