import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { byId } from '../dom';
import { PhoneApp } from './PhoneApp';
import { createReactPhoneView } from './view';

flushSync(() => createRoot(byId('root')).render(<PhoneApp />));
const { startPhoneController } = await import('../../../web-static/scripts/phone-runtime.js');
startPhoneController({ createView: createReactPhoneView });
