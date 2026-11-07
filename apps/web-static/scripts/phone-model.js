// スマホ画面の表示内容の計算。既存の画面とReact版で共用する (#235)。DOMと入力には触れない。
import { SLOT_NAMES } from '../app-view.js';

const CHARACTERS = { P1: 'blue', P2: 'green', P3: 'purple', P4: 'red' };

export function reasonText(r) {
  return r === 'host pause' ? 'ホストが停止' : r === 'app focus' ? 'PCアプリの画面に戻った' : r === 'emergency stop' ? 'PCの緊急停止' : r.endsWith('disconnected') ? r.split(' ')[0] + ' が切断' : r;
}

/** 参加者の枠の一覧 */
export function playerChips(game, me) {
  return SLOT_NAMES.map((name) => ({ name, on: game.connected.includes(name), label: `${name}${name === me ? '（自分）' : ''}` }));
}

/** 待機画面の内容 */
export function waitModel({ me, game, roleTitle, joined, autoWait }) {
  const phase = game.phase;
  return {
    character: `/assets/characters/${CHARACTERS[me]}.png`,
    heading: phase === 'paused' ? '一時停止中' : '接続完了!!',
    role: roleTitle,
    title: !joined ? '次の開始から参加します' : phase === 'paused' ? (autoWait ? `${reasonText(game.reason)}。戻ると自動で再開します` : '一時停止中') : 'ホストの開始を待っています',
    players: playerChips(game, me),
  };
}

/** React版へ表示内容を渡す入れ物。既存の画面では使わない */
export function createStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) { value = next; for (const fn of listeners) fn(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
