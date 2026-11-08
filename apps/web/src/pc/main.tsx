import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { byId } from '../dom';
import { PcApp } from './PcApp';
import { pcState, connectionState, setPcActions, type PcSnapshot } from './model';

flushSync(() => createRoot(byId('root')).render(<PcApp />));
const { startDesktopController } = await import('../../../web-static/scripts/desktop-runtime.js');
const actions = startDesktopController({
  renderView: (snapshot: PcSnapshot) => flushSync(() => pcState.set(snapshot)),
  renderInfo: (info, message, busy) => flushSync(() => connectionState.set({info: info === undefined ? connectionState.get().info : info, message, busy, loaded: true})),
});

setPcActions(actions);
