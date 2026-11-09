import '../styles/colors.css';
import './overlay.css';
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import type {HostState} from '../shared/model/domain.ts';
import {overlayModel} from '../shared/model/presentation.ts';
import {createMonitor} from '../shared/transport/monitor.ts';
import {byId} from '../shared/dom.ts';

export function Overlay(){
  const [state,setState]=useState<HostState|null>(null);
  useEffect(()=>{const monitor=createMonitor({page:'overlay',onMessage:m=>{if(m.type==='state')setState(m);},onConnection:open=>{if(!open)setState(null);}});return monitor.dispose;},[]);
  const view=overlayModel(state);
  return <><div id="status">{view.status}</div><div id="overlay">{view.players.map(p=><article key={p.slot} className={`card${p.connected?'':' off'}`} data-slot={p.slot}>
    <div className="name">プレイヤー{p.slot.slice(1)}</div><div className="role">{p.role}</div>
    <div className="keys">{p.pressed.map((key,i)=><span key={i}>{key}</span>)}</div>
  </article>)}</div></>;
}
if(new URLSearchParams(location.search).get('position')==='top')document.body.dataset.position='top';
const root=createRoot(byId('root'));root.render(<Overlay/>);
const dispose=()=>root.unmount();
window.addEventListener('pagehide',dispose,{once:true});
import.meta.hot?.dispose(()=>{window.removeEventListener('pagehide',dispose);dispose();});
