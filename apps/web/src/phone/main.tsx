import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { byId } from '../dom';
import { PhoneApp } from './PhoneApp';
import { createReactPhoneView } from './view';

const root=createRoot(byId('root'));
flushSync(() => root.render(<PhoneApp />));
const { startPhoneController } = await import('./runtime.ts');
const controller=startPhoneController({ createView: createReactPhoneView });
import.meta.hot?.dispose(()=>{controller.dispose();root.unmount();});
