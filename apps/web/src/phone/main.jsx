import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PhoneShell } from './PhoneShell.jsx';
import { createStore } from '../../../web-static/scripts/phone-model.js';

// controller.js は読み込み時に id で要素を探すので、外枠を同期的に描いてから読み込む。
const store = createStore({ character: '/assets/characters/blue.png', heading: '接続完了!!', role: '', title: 'ホストの準備を待っています', players: [] });
const remote = createStore({ players: [], route: '', startLabel: 'START', startDisabled: false, openGameLabel: 'ゲームを前面にする', openGameHidden: true, endVisible: false, transferTo: [], note: 'ゲームをプレイ中の画面まで進めた後、ホストだけがReadyを押します。' });
globalThis.__recooplayPhoneStore = store;
globalThis.__recooplayRemoteStore = remote;
flushSync(() => createRoot(document.getElementById('root')).render(<PhoneShell store={store} remote={remote} />));
await import('../../../web-static/scripts/controller.js');
