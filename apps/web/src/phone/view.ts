import {createLifetime} from '../shared/input/lifetime.ts';
import { flushSync } from 'react-dom';
import type { PhoneSnapshot, PhoneView, PhoneViewBindings, WaitModel, RemoteModel,PhoneTelemetry } from '../shared/contracts';
import { createStore } from '../shared/store';
import { byId } from '../shared/dom';
import { generatedKey } from '../shared/model/actions.ts';
import { inputWarnText, waitModel, remoteModel } from '../shared/model/phone.ts';
import { profileNotice, roleView, gameLabel, outputKeyLabel } from '../shared/model/presentation.ts';
import { createViewTransition } from './transition.ts';
import { createSkinStore, applySkin } from '../shared/model/skin.ts';
import {controllerLayout,type ControlGroup} from '../shared/controller-layout';
import {createTelemetryPublisher} from './telemetry.ts';

export interface PhoneDisplay {
  controller: {key:string;groups:ControlGroup[];bindings:PhoneViewBindings} | null;
  snapshot: PhoneSnapshot; wait: WaitModel; remote: RemoteModel; view: string | null;
  controllerHost: boolean; controllerTitle: string; role: string; roleCopy: string; roleNotice: string; warning: string; inventory: string;
}
export const display = createStore<PhoneDisplay>({
  controller:null, snapshot: { me: null, isHost: false, game: null }, view: null, controllerHost: false, controllerTitle: '', role: '接続中…', roleCopy: '', roleNotice: '', warning: '', inventory: 'Eキー',
  wait: { character: '/assets/characters/blue.png', heading: '接続完了!!', role: '', title: 'ホストの準備を待っています', players: [] },
  remote: { players: [], route: '', startLabel: 'START', startDisabled: false, openGameLabel: 'ゲームを前面にする', openGameHidden: true, endVisible: false, transferTo: [], note: 'ゲームをプレイ中の画面まで進めた後、ホストだけがReadyを押します。' },
});
let bindings: PhoneViewBindings | undefined;
const skins = createSkinStore({ getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) });
export const skin = createStore('standard');
export const connection=createStore({text:'接続中',kind:'warn'});
export const telemetry=createStore<PhoneTelemetry>({rtt:'-',rttAvg:'-',sent:0,unacked:0,path:'-',advice:'',inputMetrics:'',burstBusy:false});
export const blocked=createStore<{message?:string}|null>(null);
export const offline=createStore(false);
export function chooseSkin(id: string) {
  skins.set(display.get().snapshot.game?.title, id); applySkin(document.documentElement, id); skin.set(id);
}
export function transferHost(slot: import('../shared/contracts').Slot) {
  if (confirm(`${slot}にホストを譲りますか？`)) bindings?.onTransferHost(slot);
}

// React描画は低頻度の受信状態だけを購読する。Pointer Eventsと30Hz送信はエンジン側。
export function createReactPhoneView(input: PhoneViewBindings): PhoneView {
  bindings = input;
  const lifetime=createLifetime();
  const telemetryUpdates=createTelemetryPublisher(telemetry.get(),telemetry.set);
  let lastView: string | null = null, lastKey = '', skinGame: string | undefined;
  const transition = createViewTransition({ layer: byId('viewFx') });
  lifetime.listen(byId('phoneSettingsBtn'), 'click', () => {
    input.onDiagnosticsOpen();
    byId<HTMLDialogElement>('phoneDiagnostics').showModal();
  });
  lifetime.listen(byId('closePhoneDiagnostics'), 'click', () => byId<HTMLDialogElement>('phoneDiagnostics').close());
  lifetime.listen(byId('roleOkBtn'), 'click', input.onRoleOk);
  const render = ((snapshot: PhoneSnapshot) => {
    const { me, isHost, game } = snapshot;
    if (!me || !game) {flushSync(()=>display.set({...display.get(),snapshot}));return;}
    if (skinGame !== game.title) {
      skinGame = game.title;
      const id = skins.get(skinGame); applySkin(document.documentElement, id); skin.set(id);
    }
    const role = roleView(game, me);
    const joined = !game.participants?.length || game.participants.includes(me);
    const view = game.phase === 'coop' && joined ? 'v-gen' : isHost ? 'v-remote' : 'v-wait';
    const key = view === 'v-gen' ? generatedKey(game, me) : '';
    const changed = view !== lastView || key !== lastKey;
    if (changed) {
      input.releaseAll();
      if (view === 'v-gen'&&!game.profile) throw new Error('協力操作の定義がありません');
    }
    const autoWait = game.phase === 'paused' && game.autoResume && game.reason?.endsWith('disconnected');
    const name = gameLabel(game);
    const next: PhoneDisplay = {
      snapshot, view: display.get().view,
      controller: view==='v-gen'&&game.profile ? changed ? {key,groups:controllerLayout({...game,profile:game.profile},me),bindings:input} : display.get().controller : null,
      controllerHost: view === 'v-gen' ? isHost : display.get().controllerHost,
      controllerTitle: view === 'v-gen' ? `${game.profile?.name}（${me}${isHost ? '・ホスト' : ''}）` : display.get().controllerTitle,
      wait: waitModel({ me, game, roleTitle: role.title, joined, autoWait }),
      remote: remoteModel({ me, isHost, game, name, autoWait }),
      role: role.title + (isHost ? '（ホスト）' : ''),
      roleCopy: game.phase === 'coop' ? '確定した分担の操作だけを送信します' : game.phase === 'paused' ? '確定した分担（再開時に確認）' : '分担案（Readyで確定）',
      roleNotice: game.roleAck?.includes(me) ? `${game.reason === 'role rotation' ? '時間で担当が交代しました' : 'ホストが担当を入れ替えました'}。あなたの担当は「${role.title}」です。` : '',
      warning: inputWarnText({ isHost, game, name, notice: profileNotice(game.profile) }),
      inventory: game.keys && 'controls' in game.keys && game.keys.controls && Object.hasOwn(game.keys.controls, 'INV') ? outputKeyLabel(game.keys.controls.INV) : 'Eキー',
    };
    document.body.dataset.phase = game.phase; document.body.dataset.slot = me; document.body.dataset.host = String(isHost);
    flushSync(() => display.set(next));
    const apply = () => {
      document.body.dataset.view = view;
      flushSync(() => display.set({ ...display.get(), view }));
    };
    if (view !== lastView) transition.run({ slot: me, from: lastView, to: view, oldEl: lastView ? byId(lastView) : byId('connecting'), apply });
    else if (changed) { transition.finish(); apply(); }
    lastView = view; lastKey = key;
  }) as PhoneView;
  render.note = note => flushSync(() => display.set({ ...display.get(), remote: { ...display.get().remote, note } }));
  render.connection=(text,kind)=>{document.body.dataset.connection=kind;flushSync(()=>connection.set({text,kind}));};
  // external storeの通知による同期更新も、入力/ACKのdispatch区間へ入れない。
  render.telemetry=telemetryUpdates.patch;
  render.blocked=message=>flushSync(()=>blocked.set({message}));
  render.offline=visible=>{if(offline.get()!==visible)flushSync(()=>offline.set(visible));};
  render.dispose=()=>{input.releaseAll();telemetryUpdates.dispose();lifetime.dispose();transition.dispose();bindings=undefined;};
  return render;
}
