import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PcIslands } from './PcIslands.jsx';
import { createStore } from '../../../web-static/scripts/phone-model.js';

// 画面の定義は app.html だけにある。Reactは変わる部分だけを既存の要素の中へ描く (#235)。
// desktop.js は描いた直後に演出 (#160) のクラスを付けるので、更新を同期させてから戻る。
const players = createStore([]);
const set = players.set;
players.set = (next) => flushSync(() => set(next));
globalThis.__recooplayPcPlayers = players;

document.getElementById('players').textContent = '';
flushSync(() => createRoot(document.createElement('div')).render(<PcIslands players={players} />));
await import('../../../web-static/scripts/desktop.js');
