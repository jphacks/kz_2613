// 端末の持ち方 (#514)。OS の回転ロックで画面を縦のまま、端末を横に持って遊ぶときに、
// スティック・視点パッドの指の動きを「指から見た上下左右」に読み替える。
// 画面の配置・送る入力の種類・認可・送信経路は変えない。変えるのはスマホの中での座標の解釈だけ。

/** 0 = 縦持ち (回さない)、90 = 左に90度 (端末の上端が左)、270 = 右に90度 (端末の上端が右)。screen.orientation.angle と同じ向きの数え方 */
export type Hold = 0 | 90 | 270;
export const HOLDS: { id: Hold; label: string }[] = [
  { id: 0, label: '縦持ち' },
  { id: 90, label: '横持ち（左に90度）' },
  { id: 270, label: '横持ち（右に90度）' },
];
const KEY = 'recooplay.hold';

export function parseHold(raw: unknown): Hold {
  const value = Number(raw);
  return value === 90 || value === 270 ? value : 0;
}

/**
 * 画面座標 (右が +x、下が +y) の指の動きを、持ち方から見た向きへ回す。
 * 左に90度持つと、指から見た「上」は画面の右 (+x)、指から見た「右」は画面の下 (+y) になる
 */
export function rotateForHold(x: number, y: number, hold: Hold): [number, number] {
  if (hold === 90) return [y, 0 - x]; // 0 - x: -0 を作らない
  if (hold === 270) return [0 - y, x];
  return [x, y];
}

/** スティックの見た目を指から見て正立させる CSS の回転 (度、時計回りが正) */
export function holdRotation(hold: Hold): number {
  return hold === 90 ? 90 : hold === 270 ? -90 : 0;
}

interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** 端末ごとに保存する持ち方。読めない・書けないときは縦持ち */
export function createHoldStore(storage?: Storage) {
  let hold: Hold = 0;
  try { hold = parseHold(storage?.getItem(KEY)); } catch {}
  const listeners = new Set<(hold: Hold) => void>();
  return {
    get: () => hold,
    set(next: Hold) {
      const value = parseHold(next);
      if (value === hold) return;
      hold = value;
      try { storage?.setItem(KEY, String(value)); } catch {}
      for (const listener of [...listeners]) listener(value);
    },
    subscribe(listener: (hold: Hold) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const browserStorage: Storage | undefined = (() => {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
})();
/** スマホの画面全体で共有する持ち方 */
export const hold = createHoldStore(browserStorage);
