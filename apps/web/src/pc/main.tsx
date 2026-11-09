import '../styles/colors.css';
import '../styles/tokens.css';
import '../styles/shared.css';
import '../styles/desktop.css';
import '../styles/improved-desktop.css';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { byId } from '../shared/dom';
import { PcApp } from './PcApp';
import { pcState, connectionState, setPcActions, type PcSnapshot } from './model';

const root=createRoot(byId('root'));
flushSync(() => root.render(<PcApp />));
const { startDesktopController } = await import('./runtime.ts');
const actions = startDesktopController({
  renderView: (snapshot: PcSnapshot) => flushSync(() => pcState.set(snapshot)),
  renderInfo: (info, message, busy) => flushSync(() => connectionState.set({info: info === undefined ? connectionState.get().info : info, message, busy, loaded: true})),
});

setPcActions(actions);
import.meta.hot?.dispose(()=>{actions.dispose();setPcActions(undefined);root.unmount();});
