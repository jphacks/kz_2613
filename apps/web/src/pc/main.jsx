import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PcIslands } from './PcIslands.jsx';
import { createStore } from '../../../web-static/scripts/phone-model.js';

// 画面の定義は app.html だけにある。Reactは変わる部分だけを既存の要素の中へ描く (#235)。
// desktop.js は描いた直後に演出 (#160) のクラスを付けるので、更新を同期させてから戻る。
const synced = () => { const store = createStore([]); const set = store.set; store.set = (next) => flushSync(() => set(next)); return store; };
const players = synced(), roles = synced();
globalThis.__recooplayPcPlayers = players;
globalThis.__recooplayPcRoles = roles;

for (const id of ['players', 'roles']) document.getElementById(id).textContent = '';
flushSync(() => createRoot(document.createElement('div')).render(<PcIslands players={players} roles={roles} />));
await import('../../../web-static/scripts/desktop.js');
