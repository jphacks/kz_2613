import './diagnostics.css';
import {createRoot} from 'react-dom/client';
import {DiagnosticsApp} from './DiagnosticsApp';
import {byId} from '../shared/dom.ts';
const root=createRoot(byId('root'));root.render(<DiagnosticsApp/>);
const dispose=()=>root.unmount();window.addEventListener('pagehide',dispose,{once:true});
import.meta.hot?.dispose(()=>{window.removeEventListener('pagehide',dispose);dispose();});
