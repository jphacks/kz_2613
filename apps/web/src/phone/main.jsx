import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PhoneShell } from './PhoneShell.jsx';
import { createStore } from '../../../web-static/scripts/phone-model.js';

// controller.js は読み込み時に id で要素を探すので、外枠を同期的に描いてから読み込む。
const store = createStore({ character: '/assets/characters/blue.png', heading: '接続完了!!', role: '', title: 'ホストの準備を待っています', players: [] });
globalThis.__recooplayPhoneStore = store;
flushSync(() => createRoot(document.getElementById('root')).render(<PhoneShell store={store} />));
await import('../../../web-static/scripts/controller.js');
