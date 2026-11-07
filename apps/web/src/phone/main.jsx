import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Islands, clearIslands } from './Islands.jsx';
import { createStore } from '../../../web-static/scripts/phone-model.js';

const waitStore = createStore({ character: '/assets/characters/blue.png', heading: '接続完了!!', role: '', title: 'ホストの準備を待っています', players: [] });
const remoteStore = createStore({ players: [], route: '', startLabel: 'START', startDisabled: false, openGameLabel: 'ゲームを前面にする', openGameHidden: true, endVisible: false, transferTo: [], note: 'ゲームをプレイ中の画面まで進めた後、ホストだけがReadyを押します。' });
globalThis.__recooplayPhoneStore = waitStore;
globalThis.__recooplayRemoteStore = remoteStore;

// phone-view.js が読み込み時に入れ物を見るので、先に描いてから controller.js を読み込む。
clearIslands();
flushSync(() => createRoot(document.createElement('div')).render(<Islands waitStore={waitStore} remoteStore={remoteStore} />));
await import('../../../web-static/scripts/controller.js');
