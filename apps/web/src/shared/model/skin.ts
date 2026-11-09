import type {StoragePort} from '../transport/messages.ts';
// スマホのカラースキン (#159)。見た目だけを切り替え、操作定義・入力・通信には触れない。
// 選んだスキンはゲームごとに端末へ保存する。未設定・不正な値は標準にする。
export const SKINS = [
  { id: 'standard', label: '標準' },
  { id: 'dark', label: 'ダーク' },
  { id: 'pop', label: 'ポップ' },
];
const KEY = 'recooplay.skins';
const known = (id: unknown): id is string => SKINS.some(s => s.id === id);

export function createSkinStore(storage: StoragePort) {
  function read(): Record<string,unknown> {
    try {
      const value: unknown = JSON.parse(storage.getItem(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
    } catch { return {}; }
  }
  function get(gameId: string | undefined) {
    const skins = read();
    const id = gameId && Object.hasOwn(skins, gameId) ? skins[gameId] : 'standard';
    return known(id) ? id : 'standard';
  }
  function set(gameId: string | undefined, id: string) {
    if (!gameId || !known(id)) return false;
    try { storage.setItem(KEY, JSON.stringify({ ...read(), [gameId]: id })); return true; } catch { return false; }
  }
  return { get, set };
}

/** 標準は属性を外し、従来のCSSへそのまま戻す */
export function applySkin(root: HTMLElement, id: string) {
  if (id === 'standard' || !known(id)) delete root.dataset.skin;
  else root.dataset.skin = id;
}
