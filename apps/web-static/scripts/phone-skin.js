// スマホのカラースキン (#159)。見た目だけを切り替え、操作定義・入力・通信には触れない。
// 選んだスキンはゲームごとに端末へ保存する。未設定・不正な値は標準にする。
export const SKINS = [
  { id: 'standard', label: '標準' },
  { id: 'dark', label: 'ダーク' },
  { id: 'pop', label: 'ポップ' },
];
const KEY = 'recooplay.skins';
const known = id => SKINS.some(s => s.id === id);

export function createSkinStore(storage) {
  function read() {
    try {
      const value = JSON.parse(storage.getItem(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function get(gameId) {
    const skins = read();
    const id = Object.hasOwn(skins, gameId) ? skins[gameId] : 'standard';
    return known(id) ? id : 'standard';
  }
  function set(gameId, id) {
    if (!gameId || !known(id)) return false;
    try { storage.setItem(KEY, JSON.stringify({ ...read(), [gameId]: id })); return true; } catch { return false; }
  }
  return { get, set };
}

/** 標準は属性を外し、従来のCSSへそのまま戻す */
export function applySkin(root, id) {
  if (id === 'standard' || !known(id)) delete root.dataset.skin;
  else root.dataset.skin = id;
}
