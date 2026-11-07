import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PhoneShell } from './PhoneShell.jsx';

// controller.js は読み込み時に id で要素を探すので、外枠を同期的に描いてから読み込む。
flushSync(() => createRoot(document.getElementById('root')).render(<PhoneShell />));
await import('../../../web-static/scripts/controller.js');
