// スマホ画面の表示内容の計算。既存の画面とReact版で共用する (#235)。DOMと入力には触れない。
import {SLOT_NAMES,MIN_PLAYERS,MAX_PLAYERS} from './presentation.ts';
import type {PhoneGame, Slot} from '../contracts.ts';

const CHARACTERS = { P1: 'blue', P2: 'green', P3: 'purple', P4: 'red' };

export function reasonText(r: string | null | undefined) {
  return r === 'host pause' ? 'ホストが停止' : r === 'app focus' ? 'PCアプリの画面に戻った' : r === 'emergency stop' ? 'PCの緊急停止' : r === 'role rotation' ? '時間で担当を交代' : r?.endsWith('disconnected') ? r.split(' ')[0] + ' が切断' : r;
}

/** 参加者の枠の一覧 */
export function playerChips(game: PhoneGame, me: Slot) {
  return SLOT_NAMES.map((name) => ({ name, on: game.connected.includes(name), label: `${name}${name === me ? '（自分）' : ''}` }));
}

/** ゲームへ入力を送る段階か。ロビーでは前面の案内を出さない (#291) */
export const sendsToGame = (game: PhoneGame) => game.phase !== 'lobby';

/**
 * 画面上部の注意 (#238)。見ている人が行えることに合わせる。参加者は待つだけでよい。
 * ゲームの検証状況はホストが判断する情報なので、参加者には出さない。安全の表示ではない。
 * ホストのリモコン画面では上部に出さず、remoteModel の alert として下の状態欄に出す。
 * 警告の有無でリモコンのボタン位置を動かさないため (#291)
 */
export function inputWarnText({ isHost, game, name, notice }: {isHost:boolean;game:PhoneGame;name:string;notice:string}) {
  const target = !game.inputTarget || !sendsToGame(game) ? '' : isHost
    ? `PCの画面が${name}になっていません。${name}を前面に戻すまで操作は届きません。`
    : `PCの画面が${name}になっていません。ホストが戻すまでお待ちください。`;
  return [target, isHost ? notice : ''].filter(Boolean).join(' ');
}

/** リモコンの操作先。前面にあるのに「前面にしてください」と出さず、届かない理由を段階に合わせて示す (#291) */
function routeText(game: PhoneGame, name: string) {
  if (game.remoteRoute === 'app') return 'PCアプリを操作中';
  if (game.remoteRoute === 'game') return `${name}のメニューを操作中`;
  // Minecraft の公式ランチャー (#287)。PC のマウスを使わずに「プレイ」を押せる
  if (game.remoteRoute === 'launcher') return 'Minecraftのランチャーを操作中（「プレイ」を押してください）';
  if (game.remoteRoute !== 'none') return '';
  if (!sendsToGame(game)) return `PCアプリが前面にないため、リモコンは届きません（ロビーでは${game.title === 'minecraft-java' ? 'PCアプリとMinecraftのランチャー' : 'PCアプリ'}だけを操作します）`;
  if (game.inputTarget) return `${name}が前面にないため、リモコンは届きません`;
  return `リモコンは今は届きません${game.readyReasons?.length ? `（${game.readyReasons[0]}）` : ''}`;
}

/** 待機画面の内容 */
export function waitModel({ me, game, roleTitle, joined, autoWait }: {me:Slot;game:PhoneGame;roleTitle:string;joined:boolean;autoWait?:boolean}) {
  const phase = game.phase;
  return {
    character: `/assets/characters/${CHARACTERS[me]}.png`,
    heading: phase === 'paused' ? '一時停止中' : '接続完了!!',
    role: roleTitle,
    title: !joined ? '次の開始から参加します' : phase === 'paused' ? (autoWait ? `${reasonText(game.reason)}。戻ると自動で再開します` : '一時停止中') : 'ホストの開始を待っています',
    players: playerChips(game, me),
  };
}

/** ホストのリモコン画面の内容。入力の要素 (タッチパッド・キー) は含まない */
export function remoteModel({ me, isHost, game, name, autoWait }: {me:Slot;isHost:boolean;game:PhoneGame;name:string;autoWait?:boolean}) {
  const phase = game.phase;
  let note = game.canReady
    ? (phase === 'paused' ? `一時停止中${game.reason ? '（' + reasonText(game.reason) + '）' : ''}。リモコンで操作でき、RESUME で協力プレイに戻ります。` : `${name}をプレイ中の画面まで進めた後、ホストだけがReadyを押します。`)
    : phase === 'lobby' ? (game.lineupOk
      ? `メンバーと分担を決定しました（${game.connected.length}人）。PCの画面でゲームを起動してから準備へ進めます。`
      : `PCの画面でゲームを選び、メンバーと分担を決定してください（${game.connected.length}人接続、${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊べます）。`)
    : (game.readyReasons || []).join('。') || 'ホストの明示操作を待っています';
  if (phase === 'preparing') note = [game.prepareStatus, ...(game.readyReasons || []), '準備ができたらホストが明示Ready'].filter(Boolean).join('。');
  if (autoWait && isHost) note = `${reasonText(game.reason)}。戻ると自動で再開します（RESUME で手動再開も可）。`;
  if (phase === 'paused' && game.inputTarget && game.prepareStatus) note += `。${game.prepareStatus}`;
  return {
    players: playerChips(game, me),
    route: routeText(game, name), routeBlocked: game.remoteRoute === 'none', notice: '',
    // ゲームが前面に残っても、スマホだけでPCアプリへ戻れるようにする (#292)
    openAppHidden: !isHost || !game.canOpenApp || game.remoteRoute === 'app',
    startLabel: phase === 'paused' ? '再開する' : phase === 'preparing' ? `Ready・${game.connected.length}人で操作を始める` : 'ゲームを開く・準備する',
    startDisabled: !(phase === 'paused' ? game.canResume : phase === 'preparing' ? game.canReady : game.canPrepare),
    openGameLabel: `${name}を前面にする`,
    // 前面にするボタンは、ゲームが前面でないときだけ (協力プレイに入るときはホストが自動で前面にする、#138)
    openGameHidden: !['preparing', 'paused'].includes(phase) || !game.inputTarget,
    endVisible: phase === 'paused',
    // ホストを譲る (#233)。ロビーのホストにだけ出す。認可はホストが判定する
    transferTo: isHost && phase === 'lobby' ? game.connected.filter((p) => p !== me) : [],
    note,
  };
}
