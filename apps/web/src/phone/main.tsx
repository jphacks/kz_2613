import '../styles/colors.css';
import '../styles/tokens.css';
import '../styles/shared.css';
import '../styles/mobile.css';
import '../styles/improved-mobile.css';
import '../styles/phone-skins.css';
import '../styles/phone-background.css';
import '../styles/view-transition.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { byId } from '../shared/dom';
import { PhoneApp } from './PhoneApp';
import { createReactPhoneView } from './view';

const root=createRoot(byId('root'));
flushSync(() => root.render(<PhoneApp />));
const { startPhoneController } = await import('./runtime.ts');
const controller=startPhoneController({ createView: createReactPhoneView });
import.meta.hot?.dispose(()=>{controller.dispose();root.unmount();});
