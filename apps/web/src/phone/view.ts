import {createLifetime} from '../shared/input/lifetime.ts';
import { flushSync } from 'react-dom';
import type { PhoneSnapshot, PhoneView, PhoneViewBindings, WaitModel, RemoteModel,PhoneTelemetry,ConfirmRequest } from '../shared/contracts';
import { createStore } from '../shared/store';
import { byId } from '../shared/dom';
import { generatedKey } from '../shared/model/actions.ts';
import { inputWarnText, waitModel, remoteModel, rotationText } from '../shared/model/phone.ts';
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
  remote: { players: [], route: '', routeBlocked: false, notice: '', openAppHidden: true, startLabel: 'START', startDisabled: false, openGameLabel: 'ゲームを前面にする', openGameHidden: true, endVisible: false, transferTo: [], note: 'ゲームをプレイ中の画面まで進めた後、ホストだけがReadyを押します。' },
});
let bindings: PhoneViewBindings | undefined;
const skins = createSkinStore({ getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) });
export const skin = createStore('standard');
export const connection=createStore({text:'接続中',kind:'warn'});
export const telemetry=createStore<PhoneTelemetry>({rtt:'-',rttAvg:'-',sent:0,unacked:0,path:'-',advice:'',inputMetrics:'',burstBusy:false});
export const blocked=createStore<{message?:string}|null>(null);
// 「指を離して操作を再開」(#285 Q27)。非モーダルで、指を離せば消える
export const liftHint=createStore(false);
// 役割交代の予告・交代後の案内 (#161)
export const rotationNotice=createStore('');
export const offline=createStore(false);
export function chooseSkin(id: string) {
  skins.set(display.get().snapshot.game?.title, id); applySkin(document.documentElement, id); skin.set(id);
}
export function transferHost(slot: import('../shared/contracts').Slot) {
  askConfirm({message:`${slot}にホストを譲りますか？`,ok:'譲る',valid:remote=>remote.transferTo.includes(slot),run:()=>bindings?.onTransferHost(slot)});
}

// 確認はページ内のダイアログで行う。表示中もハートビートと受信を止めない (#289)
export const confirmation=createStore<ConfirmRequest|null>(null);
function askConfirm(request:ConfirmRequest){
  if(!request.valid(display.get().remote))return;
  flushSync(()=>confirmation.set(request));
  const dialog=byId<HTMLDialogElement>('phoneConfirm');if(!dialog.open)dialog.showModal();
}
function closeConfirm(){
  if(!confirmation.get())return;
  flushSync(()=>confirmation.set(null));
  const dialog=byId<HTMLDialogElement>('phoneConfirm');if(dialog.open)dialog.close();
}
// OKは通信中かつ要求がまだ有効なときだけ送る。切断中は閉じずに待たせ、要求を黙って失わない
export function answerConfirm(ok:boolean){
  const request=confirmation.get();if(!request)return;
  if(ok&&(connection.get().kind!=='ok'||!request.valid(display.get().remote)))return;
  closeConfirm();if(ok)request.run();
}

// React描画は低頻度の受信状態だけを購読する。Pointer Eventsと30Hz送信はエンジン側。
export function createReactPhoneView(input: PhoneViewBindings): PhoneView {
  bindings = input;
  const lifetime=createLifetime();
  const telemetryUpdates=createTelemetryPublisher(telemetry.get(),telemetry.set);
  let lastView: string | null = null, lastKey = '', skinGame: string | undefined;
  // 交代の回数。途中から開いた画面では「交代しました」を出さない
  let rotationCount: number | undefined, rotatedUntil = 0, clearRotated = () => {};
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
    if (rotationCount !== undefined && (game.rotationCount ?? 0) > rotationCount) {
      // 交代の直後の案内は4秒で消す
      rotatedUntil = performance.now() + 4000; clearRotated();
      clearRotated = lifetime.timeout(() => { rotatedUntil = 0; rotationNotice.set(''); }, 4000);
    }
    rotationCount = game.rotationCount ?? 0;
    const rotation = rotationText({ game, joined, rotated: performance.now() < rotatedUntil, title: g => roleView(g, me).title });
    if (rotation !== rotationNotice.get()) flushSync(() => rotationNotice.set(rotation));
    const name = gameLabel(game);
    const next: PhoneDisplay = {
      snapshot, view: display.get().view,
      controller: view==='v-gen'&&game.profile ? changed ? {key,groups:controllerLayout({...game,profile:game.profile},me),bindings:input} : display.get().controller : null,
      controllerHost: view === 'v-gen' ? isHost : display.get().controllerHost,
      controllerTitle: view === 'v-gen' ? `${game.profile?.name}（${me}${isHost ? '・ホスト' : ''}）` : display.get().controllerTitle,
      wait: waitModel({ me, game, roleTitle: role.title, joined, autoWait }),
      // リモコン画面では上部に警告を出さず、ゲームの検証状況だけを下の状態欄に出す (#291)
      remote: { ...remoteModel({ me, isHost, game, name, autoWait }), notice: view === 'v-remote' ? profileNotice(game.profile) : '' },
      role: role.title + (isHost ? '（ホスト）' : ''),
      roleCopy: game.phase === 'coop' ? '確定した分担の操作だけを送信します' : game.phase === 'paused' ? '確定した分担（再開時に確認）' : '分担案（Readyで確定）',
      roleNotice: game.roleAck?.includes(me) ? `${game.reason === 'role rotation' ? '時間で担当が交代しました' : 'ホストが担当を入れ替えました'}。あなたの担当は「${role.title}」です。` : '',
      warning: view === 'v-remote' ? '' : inputWarnText({ isHost, game, name, notice: profileNotice(game.profile) }),
      inventory: game.keys && 'controls' in game.keys && game.keys.controls && Object.hasOwn(game.keys.controls, 'INV') ? outputKeyLabel(game.keys.controls.INV) : 'Eキー',
    };
    document.body.dataset.phase = game.phase; document.body.dataset.slot = me; document.body.dataset.host = String(isHost);
    flushSync(() => display.set(next));
    const pending=confirmation.get();if(pending&&!pending.valid(next.remote))closeConfirm(); // 段階や参加者が変わり、確認した操作が成り立たなくなった
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
  // 満員・版不一致・リセット・PCアプリの終了など、再接続しない終端の案内。モーダルの確認・診断はトップレイヤーで
  // 案内より手前に残るため閉じ、確認した操作も捨てる (#302)。一時的な通信断 (offline) では閉じない
  render.blocked=message=>{
    closeConfirm();
    const diagnostics=byId<HTMLDialogElement>('phoneDiagnostics');if(diagnostics.open)diagnostics.close();
    flushSync(()=>blocked.set({message}));
  };
  render.liftHint=visible=>{if(liftHint.get()!==visible)flushSync(()=>liftHint.set(visible));};
  render.offline=visible=>{if(offline.get()!==visible)flushSync(()=>offline.set(visible));};
  render.confirm=askConfirm;
  render.dispose=()=>{closeConfirm();input.releaseAll();telemetryUpdates.dispose();lifetime.dispose();transition.dispose();bindings=undefined;};
  return render;
}
