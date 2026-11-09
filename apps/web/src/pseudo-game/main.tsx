import './pseudo-game.css';
import {createRoot} from 'react-dom/client';
import {PseudoGame} from './PseudoGame';
import {byId} from '../shared/dom.ts';
const root=createRoot(byId('root'));root.render(<PseudoGame/>);
const dispose=()=>root.unmount();window.addEventListener('pagehide',dispose,{once:true});
import.meta.hot?.dispose(()=>{window.removeEventListener('pagehide',dispose);dispose();});
