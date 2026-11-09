import type { PhoneGame, Slot } from '../contracts';
import { createStore } from '../store';
import { desktopView, slotViews, shownSlots, playerCards, roleColumns, gameList, gameCard, gameAction, rolesAction, gameLabel, desktopWarning, networkNotice, profileNotice, playerHint, commSettingsView, gamesCountText, isRegistered, roleView, slotDiagnosis, joinUrl, joinGuideView, MIN_PLAYERS, MAX_PLAYERS } from '../model/presentation.ts';

import type {InjectionState,HostState,Navigation} from '../model/domain.ts';
export interface PcSnapshot {
  ui: Navigation;
  game: PhoneGame | null; inject: InjectionState | null; online: boolean; swapPick: Slot | null;
  state: HostState | null;
  hostNotice: string; infoPort: number | null; manualMessage: string; keyMessage: string;
}
export const pcState = createStore<PcSnapshot>({ui: {screen: 'join', game: 'minecraft', swap: false}, game: null, inject: null, state: null, online: false, swapPick: null, hostNotice: '', infoPort: null, manualMessage: '', keyMessage: ''});
export interface PcActions {
  setAutoResume(on: boolean): void;
  setRotation(seconds: number): void;
  setKey(action: string, output: string | null): void;
}
let actions: PcActions | undefined;
export function setPcActions(next: PcActions|undefined) { actions = next; }
export const settingsActions: PcActions = {
  setAutoResume: on => actions?.setAutoResume(on),
  setRotation: seconds => actions?.setRotation(seconds),
  setKey: (action, output) => actions?.setKey(action, output),
};
export interface PcInfo {
  port: number; build?: {version: string; commit?: string|null};
  wifi?: {ssid: string; qr: string}|null; hotspot?: {on: boolean}|null;
  urls?: {url: string; qr: string; hotspot?: boolean}[];
}
export const connectionState = createStore<{info: PcInfo | null; message: string; busy: boolean; loaded: boolean}>({info: null, message: '', busy: false, loaded: false});
export function connectionModel() {
  const {info, message, busy, loaded} = connectionState.get();
  const url = joinUrl(info), guide = joinGuideView(info);
  return {
    guide, note: message || guide.note, busy,
    qr: info ? url?.qr || '<span>接続先が見つかりません</span>' : loaded ? '<span>QRを取得できません<br>接続方法をご確認ください</span>' : '<span>QRを読み込み中…</span>',
    url: url?.url || '',
    urlNote: !info ? 'PCホストとネットワークを確認し、QRを取得し直してください。' : !url ? 'PCのWi-Fiとモバイルホットスポットを確認してください。' : url.hotspot ? 'PCのモバイルホットスポットへ接続してください。' : 'PCと同じWi-Fiへ接続してください。',
    wifi: info?.wifi ? `Wi-Fi：${info.wifi.ssid}` : '',
    build: info?.build ? `Re:Cooplay ${info.build.version}${info.build.commit ? `（${info.build.commit}）` : '（開発版）'}` : '',
  };
}

// 旧版と共通の表示判断を利用する。描画と通信・認可の責務を分離する。
export function pcModel(s: PcSnapshot) {
  const {game, inject, ui, state, swapPick} = s;
  const view = desktopView(ui, game) as 'join' | 'game' | 'roles' | 'preparing' | 'ready' | 'coop' | 'paused';
  const slots = slotViews(state?.slots), count = slots.filter(slot => slot.state === 'connected').length;
  const roleSlots: Slot[] = shownSlots(game);
  const list = gameList(state?.games, state?.minecraft);
  const action = gameAction(ui, game, list), roleAction = rolesAction(game, list);
  const stopped = ['preparing', 'ready', 'paused'].includes(view) && inject?.mode === 'off';
  const swapEntry = view === 'paused' && game?.canSwap;
  const name = gameLabel(game);
  const swapHint = game?.canSwap ? swapPick ? `${swapPick}と入れ替える人の列を押してください` : '担当を入れ替えるときは、2人の列を順に押してください' : '';
  const warnings = game?.keys?.warnings ?? [];
  const warning = desktopWarning(game, inject, s.online || !state) || (warnings.length ? 'キー設定に注意が必要です。「操作設定」で実際に送るキーを確認してください。' : '');
  return {
    view, roleSlots, name,
    cards: playerCards(slots, view, game), columns: roleColumns(game, roleSlots, swapPick),
    roleHeading: !roleSlots.length ? '参加者を待っています' : game?.lineupOk ? `${roleSlots.length}人で決定！` : `${roleSlots.length}人で、操作を分担！`,
    title: {join: '', game: 'ゲーム選択を\nしよう！', roles: '分担しよう！', preparing: '準備中', ready: '準備完了！', coop: '協力プレイ中', paused: '一時停止中'}[view],
    stateTitle: {join: `${count}人参加中！`, preparing: 'ゲームを準備中！', ready: '全員接続・準備OK！', coop: 'みんなでプレイ中！', paused: '一時停止中', game: '', roles: ''}[view],
    stateSubtitle: view === 'paused' && !game?.canResume ? inject?.mode === 'off' ? '安全を確かめてから「入力を再開する」を押してください' : '再開前に、接続とゲームの画面を確認してください' : {join: count >= MIN_PLAYERS ? `みんながそろったら、OKボタンを押そう！（${MIN_PLAYERS}〜${MAX_PLAYERS}人）` : `参加者を待っています……（${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊べます）`, preparing: 'ホストがゲームを準備しています……', ready: 'ホストのスマホでReadyを押してください！', coop: '止めるときはホストのスマホでPAUSE', paused: 'ホストのスマホで再開できます', game: '', roles: ''}[view],
    explanation: view === 'join' ? `${MIN_PLAYERS}〜${MAX_PLAYERS}人がそろったら、\nOKボタンを押そう！！` : view === 'game' ? '右側にあるゲーム一覧から\n遊びたいゲームを\n選択してください！' : view === 'roles' ? game?.lineupOk ? 'メンバーと分担を\n決定しました！' : '操作をそれぞれの\nスマホに分けよう！' : '',
    secondary: view === 'game' ? 'Steam・Epic などのランチャーと手動登録のゲームは\n分担を決めた後に起動できます。\n「未検証」は操作が届くか未確認です。' : view === 'roles' ? game?.lineupOk ? 'ゲームを起動・準備して\nスマホでReady！' : 'メンバーと分担を確認して\n決定しよう！' : '',
    next: {hidden: !stopped && !['join','game','roles'].includes(view), stopped, label: stopped ? '入力を再開する' : {join: 'OK', game: action.label, roles: roleAction.label, preparing: '', ready: '', coop: '', paused: ''}[view], disabled: !stopped && ((view === 'roles' && !!roleAction.disabled) || (view === 'game' && action.kind === 'none'))},
    sub: {hidden: !(swapEntry || (view === 'roles' && roleAction.alt)), label: swapEntry ? '担当を入れ替える' : roleAction.alt?.label || '', disabled: !swapEntry && !!roleAction.alt?.disabled},
    blockedStart: view !== 'preparing' || stopped, readyInstruction: view !== 'ready' || stopped,
    openGameHidden: !['preparing','ready','paused'].includes(view) || !game?.inputTarget,
    actionNote: view === 'roles' ? swapPick ? swapHint : [roleAction.note || swapHint, game?.lineupOk ? '' : playerHint(game?.profile)?.text].filter(Boolean).join(' ') : view === 'preparing' ? `${name}をプレイ中の画面まで進めてください。` : '',
    notices: [s.hostNotice, warning, networkNotice(state?.network, state?.slots), profileNotice(game?.profile)].filter(Boolean).join(' '),
    comm: commSettingsView(game, s.infoPort),
    gameCards: list.map(g => gameCard(g, ui.game, game?.launch)),
    gamesCount: s.manualMessage || gamesCountText(list, !!state?.gamesScanning), scanning: !!state?.gamesScanning,
    registered: isRegistered(ui.game) && list.some(g => g.id === ui.game),
    inputState: inject?.mode === 'off' ? 'ゲームへの入力はOFFです' : inject?.mode === 'test' ? '診断用の入力先です' : inject?.active ? `ゲームへの入力はONです（${name}が前面のときだけ）` : 'ゲームへの入力を停止しています',
    warnings: warnings.join('。'), bindings: roleSlots.map(slot => ({slot, ...roleView(game, slot)})),
    diagnostics: (state?.slots ?? []).filter(slot => slot.connected).map(slotDiagnosis),
    keyButtons: game?.profile?.actions.filter(a => a.type === 'button') ?? [],
    outputs: Object.entries(inject?.outputs ?? {}).filter(([, output]) => ['key','mouse'].includes(output.kind)),
    edited: new Set(game?.keys?.edited ?? []), locked: !game || game.phase === 'coop',
    hotkey: inject?.emergencyHotkeyError ? '緊急停止キーを登録できません' : `緊急停止：${inject?.emergencyHotkey || 'Ctrl+Alt+F12'}`,
  };
}
