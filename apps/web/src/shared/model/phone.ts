// スマホ画面の表示内容の計算。既存の画面とReact版で共用する (#235)。DOMと入力には触れない。
import {SLOT_NAMES,MIN_PLAYERS,MAX_PLAYERS,START_COOP_LABEL} from './presentation.ts';
import type {PhoneGame, Slot} from '../contracts.ts';

const CHARACTERS = { P1: 'blue', P2: 'green', P3: 'purple', P4: 'red' };
export const LEAVE_WIFI_HINT = '遊び終えたら、スマホのWi-Fi設定で普段使うネットワークに戻してください。';

export function reasonText(r: string | null | undefined, me: Slot) {
  if (r === `${me} disconnected`) return 'あなたの接続が切れました';
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
  // 「未検証」の注意は準備の段階で伝える。協力プレイ中は操作画面の上部を占めないよう出さない (#308)
  return [target, isHost && game.phase !== 'coop' ? notice : ''].filter(Boolean).join(' ');
}

/** リモコンの操作先。前面にあるのに「前面にしてください」と出さず、届かない理由を段階に合わせて示す (#291) */
function routeText(game: PhoneGame, name: string) {
  if (game.remoteRoute === 'app') return 'PCアプリを操作中';
  if (game.remoteRoute === 'game') return `${name}のメニューを操作中`;
  // PC アプリ以外の前面のウィンドウ (ランチャー・ダイアログ等、#287・#405)。PC のマウスを使わずに先へ進める
  if (game.remoteRoute === 'desktop') return 'PCの画面を操作中（実際のマウスとして動きます）';
  if (game.remoteRoute !== 'none') return '';
  if (!sendsToGame(game)) return 'PCアプリを前面にすると、リモコンを使えます';
  if (game.inputTarget) return `${name}が前面にないため、リモコンは届きません`;
  return `リモコンは今は届きません${game.readyReasons?.length ? `（${game.readyReasons[0]}）` : ''}`;
}

/**
 * 時間制の役割交代の短い案内 (#161)。協力プレイ中の参加者だけ。予告では次の担当、交代の直後は新しい担当を示す。
 * 画面を覆わず、操作を止めない
 */
export function rotationText({ game, joined, rotated, title }: {game:PhoneGame;joined:boolean;rotated:boolean;title:(game:PhoneGame)=>string}) {
  if (game.phase !== 'coop' || !joined) return '';
  if (game.rotationSoon && game.rotationNext) return `まもなく担当を交代：次は「${title({ ...game, assigned: game.rotationNext })}」`;
  return rotated ? `担当が交代しました。あなたは「${title(game)}」` : '';
}

/** 待機画面の内容 */
export function waitModel({ me, game, roleTitle, joined, autoWait }: {me:Slot;game:PhoneGame;roleTitle:string;joined:boolean;autoWait?:boolean}) {
  const phase = game.phase;
  return {
    character: `/assets/characters/${CHARACTERS[me]}.png`,
    heading: phase === 'paused' ? '一時停止中' : '接続完了!!',
    role: roleTitle,
    title: phase === 'lobby' && game.reason === 'host end' ? LEAVE_WIFI_HINT
      : !joined ? '次の開始から参加します。'
      : phase === 'paused' ? (autoWait
        ? `${reasonText(game.reason, me)}。制限時間内に全員が戻ると自動で再開します。再開できない場合はホストの操作をお待ちください。`
        : 'ホストが「再開する」を押すと操作画面に戻ります。')
      : phase === 'preparing' ? `ホストが「${START_COOP_LABEL}」を押すと操作画面に変わります。`
      : game.lineupOk ? 'ホストがゲームを起動するまでお待ちください。'
      : 'ホストがゲームと分担を決めるまでお待ちください。',
    players: playerChips(game, me),
  };
}

/** 準備中に分担の画面へ戻るボタンの表記 (#427) */
export const END_PREPARING_LABEL = '準備をやめて分担に戻る';

/** ホストのリモコン画面の内容。入力の要素 (タッチパッド・キー) は含まない */
export function remoteModel({ me, isHost, game, name, autoWait }: {me:Slot;isHost:boolean;game:PhoneGame;name:string;autoWait?:boolean}) {
  const phase = game.phase;
  const reasons = game.readyReasons ?? [];
  const appInFront = game.remoteRoute === 'app';
  const openAppHidden = !isHost || !game.canOpenApp || appInFront;
  const returnInstructions = [];
  if (isHost && (phase === 'preparing' || phase === 'paused')) {
    if (!appInFront) returnInstructions.push(openAppHidden
      ? 'PCアプリへは、PCでAlt+Tabを押して戻れます。'
      : 'ボタンで戻れないときは、PCでAlt+Tabを押してください。');
    if (phase === 'paused' && game.canSwap) {
      returnInstructions.push('担当を変えるには、PCアプリで「担当を入れ替える」を選んでください。');
    }
  }
  let instructions: (string | null | undefined)[];
  if (phase === 'preparing') {
    instructions = [game.prepareStatus, ...reasons, game.canReady
      ? `プレイ画面まで進んだら「${START_COOP_LABEL}」を押してください`
      : `準備が整うと「${START_COOP_LABEL}」を押せます`,
    // Readyを押せないとき (ゲームを閉じてしまったときなど) は、スマホだけで分担の画面へ戻れることを示す (#427)
    game.canReady ? null : `やり直すときは「${END_PREPARING_LABEL}」を押してください`];
  } else if (phase === 'paused') {
    instructions = [reasonText(game.reason, me), game.inputTarget ? game.prepareStatus : '', ...(game.canResume ? [] : reasons)];
    if (autoWait && isHost) instructions.push('制限時間内に全員が戻ると自動で再開します');
    if (game.canResume) instructions.push('続けるには「再開する」を押してください');
    instructions.push('遊び終えたら「協力プレイを終了（分担に戻る）」を押してください');
  } else if (game.lineupOk) {
    instructions = [`プレイ画面まで進んだら「${START_COOP_LABEL}」を押してください`, ...reasons];
  } else {
    instructions = [`PCアプリの画面でゲームを選び、分担を決めてください（${MIN_PLAYERS}〜${MAX_PLAYERS}人）`,
      'このリモコンでPCの画面を操作できます（PCアプリ以外のウィンドウでは実際のマウスとして動きます）', ...reasons];
  }
  if (phase === 'lobby' && game.reason === 'host end') instructions.unshift(LEAVE_WIFI_HINT);
  const note = [...new Set(instructions.flatMap(text => text?.trim() ? [text.trim().replace(/[。！？]$/, '')] : []))]
    .map(text => `${text}。`).join('');
  return {
    players: playerChips(game, me),
    route: routeText(game, name), routeBlocked: game.remoteRoute === 'none', notice: '',
    // ゲームが前面に残っても、スマホだけでPCアプリへ戻れるようにする (#292)
    openAppHidden, appReturnHint: returnInstructions.join(''),
    startLabel: phase === 'paused' ? '再開する' : START_COOP_LABEL,
    startDisabled: !(phase === 'paused' ? game.canResume : game.canReady),
    openGameLabel: `${name}を前面にする`,
    // 前面にするボタンは、ゲームが前面でないときだけ (協力プレイに入るときはホストが自動で前面にする、#138)
    openGameHidden: !['preparing', 'paused'].includes(phase) || !game.inputTarget,
    // 準備中も分担の画面へ戻れる (#427)。協力プレイはまだ始まっていないので、表記を分ける
    endVisible: phase === 'paused' || phase === 'preparing',
    endLabel: phase === 'preparing' ? END_PREPARING_LABEL : '協力プレイを終了（分担に戻る）',
    // ホストを譲る (#233)。ロビーのホストにだけ出す。認可はホストが判定する
    transferTo: isHost && phase === 'lobby' ? game.connected.filter((p) => p !== me) : [],
    note,
  };
}

/**
 * 満員で参加できないときの案内 (#297)。切断した人の枠をロビーで保持しているだけなら、満員ではなく空く見込みを示す。
 * 保持中の枠がなければ undefined (画面の既定の「満員」の案内を使う)
 */
export function fullText(retryMs: number | null | undefined) {
  if (retryMs == null) return undefined;
  const sec = Math.max(1, Math.ceil(retryMs / 1000));
  return `切断した人の再接続を待っているため、今は参加できません。${sec}秒ほど待ってから再読み込みしてください。`;
}
