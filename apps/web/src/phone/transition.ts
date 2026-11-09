// スマホの画面切り替えの演出 (ワイプ＋流れ星の群れ)。見た目だけを扱い、入力・通信には触れない。
// 流れ星と真ん中の星は、背景 (assets/phone-stars.svg) と同じ平たい5つ角の星＋3本線の尾。光らせない。
// 帯の色は本人のキャラクターの色 (P1青・P2緑・P3紫・P4赤) に合わせる。
// 帯が画面を覆った時点で apply() を呼んで画面を入れ替える。それまで古い画面は inert にして新しい押下を受けない。
// 押しっぱなしの解放は呼び出し側 (phone-view.js) が切り替えの開始時に済ませる。

export const WIPE_MS = 620;   // 帯が横切る長さ
export const SWAP_MS = 310;   // 帯が画面を覆い、画面を入れ替える時刻
// 流れ星4本: [帯に対する縦のずれ (画面の対角線の半分に対する割合), 出発の遅れ ms, 大きさ (幅244pxの画面での値)]
const STARS = [[-0.45, 40, 22], [-0.15, 0, 26], [0.2, 90, 20], [0.5, 30, 24]];
const DESIGN_WIDTH = 244; // 大きさを決めた比較ページの画面の幅

/** 5つ角の星の多角形。角は丸める (stroke-linejoin) */
export function star5(cx: number, cy: number, r: number, rot = -10) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (-90 + rot + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" stroke-width="${(r * 0.22).toFixed(1)}" stroke-linejoin="round"/>`;
}

/** 流れ星1本の SVG。右端に星、左へ3本線の尾 (真ん中が一番長い)。進む向きは lane の回転で決める */
function shootingStar(len: number, r: number) {
  const h = r * 2, tail = len - r * 2, x2 = len - r * 1.9;
  const lines = [[-0.42, 0.75], [0, 1], [0.42, 0.6]].map(([o, l]) =>
    `<line x1="${(x2 - tail * l).toFixed(1)}" y1="${(r + o * r).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(r + o * r).toFixed(1)}" stroke-width="${(r * 0.28).toFixed(1)}" stroke-linecap="round"/>`).join('');
  return `<svg viewBox="0 0 ${len.toFixed(1)} ${h.toFixed(1)}">${lines}${star5(len - r, r, r, 80)}</svg>`;
}

/** 動きを減らす設定やブラウザ以外 (試験) では演出せずにすぐ切り替える */
export function motionAllowed(win: Pick<typeof globalThis,'matchMedia'> = globalThis) {
  return typeof win.matchMedia === 'function' && !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 画面の切り替えの向き。操作画面から戻るときだけ逆向きに流す */
export function transitionDirection(from: string | null, to: string) {
  return from === 'v-gen' && to !== 'v-gen' ? 'back' : 'forward';
}

/** @param {{layer?: HTMLElement, win?: typeof globalThis}} [options] */
export function createViewTransition({ layer, win = globalThis }: {layer?:HTMLElement;win?:typeof globalThis} = {}) {
  let pending: {apply():void;timer:ReturnType<typeof setTimeout>;inertEl?:HTMLElement} | null = null; // { apply, timer, inertEl }
  let cleanup: ReturnType<typeof setTimeout> | undefined;

  /** 待っている画面の入れ替えをすぐ行う */
  function finish() {
    if (!pending) return;
    const p = pending;
    pending = null;
    win.clearTimeout(p.timer);
    if (p.inertEl) p.inertEl.inert = false;
    p.apply();
  }

  function clearLayer() {
    if (!layer) return;
    layer.classList?.remove?.('run');
    layer.replaceChildren?.();
  }

  /**
   * 画面を切り替える。演出できなければ apply() をすぐ呼ぶ。
   * 演出中に次の切り替えが来たら、前の切り替えを即座に終えてから始める。
   */
  function run({ slot, from, to, oldEl, apply }: {slot:string;from:string|null;to:string;oldEl?:HTMLElement;apply():void}) {
    finish();
    win.clearTimeout?.(cleanup);
    if (!layer || !motionAllowed(win)) { clearLayer(); apply(); return; }
    const rect = layer.getBoundingClientRect?.() ?? { width: 400, height: 800 };
    const half = Math.hypot(rect.width, rect.height) / 2;
    layer.dataset.slot = slot || 'P1';
    layer.dataset.dir = transitionDirection(from, to);
    const scale = Math.max(1, rect.width / DESIGN_WIDTH);
    const stars = STARS.map(([y, delay, size]) => {
      const len = size * 5 * scale, r = size / 2.4 * scale;
      return `<div class="view-fx-star" style="--y:${Math.round(y * half)}px;--dl:${delay}ms;--len:${Math.round(len)}px;--r:${r.toFixed(1)}px;--from:${-Math.round(half + len + 40)}px;--to:${Math.round(half + 40)}px">${shootingStar(len, r)}</div>`;
    }).join('');
    const mark = `<span class="view-fx-mark"><svg viewBox="0 0 40 40">${star5(20, 21, 17)}</svg></span>`;
    layer.classList.remove('run');
    layer.innerHTML = `<div class="view-fx-band">${mark}</div><div class="view-fx-lane">${stars}</div>`;
    void layer.offsetWidth; // 連続で切り替えたときも演出を最初から流す
    layer.classList.add('run');
    if (oldEl) oldEl.inert = true;
    pending = { apply, inertEl: oldEl, timer: win.setTimeout(finish, SWAP_MS) };
    cleanup = win.setTimeout(clearLayer, WIPE_MS + 120);
  }

  return {run,finish,dispose(){if(pending){win.clearTimeout(pending.timer);if(pending.inertEl)pending.inertEl.inert=false;pending=null;}win.clearTimeout(cleanup);clearLayer();}};
}
