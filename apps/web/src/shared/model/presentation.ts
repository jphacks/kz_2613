import type {Action,ControllerGame,PhoneGame,Profile,Slot,LaunchState} from '../contracts.ts';
import type {ClientStats,SlotState,InjectionState,DetectedGame,GameEntry,HostState,Navigation,EffectState,UiAction,ScreenId} from './domain.ts';
import type {PcInfo} from './domain.ts';
// PC アプリ画面 (app.html) の表示内容を、ホストの状態 (state / game / inject) から作る。
// 画面の部品に依存しない純粋な関数だけを置き、Node の試験 (scripts/sim/app-view-test.mjs) で表示とサーバー状態の一致を確かめる。
// 開始・準備・再開できるかはサーバーの canReady・canPrepare・canResume をそのまま使い、画面側で判定し直さない。

export const SCREENS: readonly ScreenId[] = ['join', 'game', 'roles'];

// 参加人数 (#57)。2〜4人で遊び、Ready の時点で接続している人数で分担を決める (ホストが判定する)
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const SLOT_NAMES: Slot[] = ['P1', 'P2', 'P3', 'P4'];

/** 担当を表示する枠: 協力プレイの参加者、なければ接続中の枠。誰もいなければ空 (3人分の固定の表示は出さない、#126) */
export function shownSlots(game: PhoneGame | null | undefined) {
  if (game?.participants?.length) return game.participants;
  if (game?.connected?.length) return SLOT_NAMES.filter((s) => game.connected.includes(s));
  return [];
}

export const SCREEN_TITLES = { join: '① 参加', game: '② ゲーム選択', roles: '③ 操作分担の確認' };

export function profileNotice(profile: Profile | null | undefined) {
  if (!profile || (profile.id === 'minecraft-java' && profile.status === 'device' && profile.controllerSupported)) return '';
  const name = profile.name || '選択中のゲーム';
  if (!profile.controllerSupported) return `${name}：マウス操作が中心のため、スマホで分担できる操作がありません。`;
  // 定義のないゲームには汎用の 3D アクションの操作を当てる (#123)
  if (profile.id === 'generic') return `${name}：操作定義がないため、一般的な操作（WASD・マウス）で試します。操作が届くか確かめながら遊んでください。`;
  const status = {template:'仮の定義（未検証）',extracted:'自動抽出（実機未検証）',unverified:'未検証',reviewed:'人による確認（実機未検証）',device:'過去の実機記録'}[profile.status ?? 'unverified'] || '未検証';
  return `${name}：${status}。操作が届くか確かめながら遊んでください。`;
}

// 移動可能な3ページと、サーバーで切り替わる準備・協力・停止の視覚状態を分ける。
// canReady以外のローカル条件からReady可を推測しない。
export function desktopView(ui: Navigation, game: PhoneGame | null | undefined) {
  // 準備中に参加者が変わったら、分担の画面で決定し直す (#109)
  if (game?.phase === 'preparing') return game.lineupOk === false ? 'roles' : game.canReady ? 'ready' : 'preparing';
  // 一時停止中の「担当を入れ替える」(#47) では分担の画面を開く
  if (game?.phase === 'paused' && ui.swap) return 'roles';
  if (game?.phase === 'coop' || game?.phase === 'paused') return game.phase;
  return SCREENS.includes(ui.screen) ? ui.screen : 'join';
}

// 生のプロセス名や診断値ではなく、利用者に必要な復旧操作だけを示す。
/**
 * 通信の注意 (#131)。Bluetooth で PC の音を出しているとき、直近 10 秒に受信の途切れ (止まってからまとめて届く) が
 * 3 回以上あったスマホがあるときに出す。network = state.network、slots = state.slots
 */
export function networkNotice(network: HostState["network"] | null | undefined, slots: SlotState[] | undefined) {
  const notes = [];
  if (network?.bluetoothAudio) notes.push('BluetoothでPCの音を出していると、スマホとの通信が途切れやすくなります。有線のイヤホンかPCのスピーカーを使ってください。');
  const unstable = (slots || []).filter((s) => s.connected && (s.net?.stalls || 0) >= 3).map((s) => s.name);
  if (unstable.length) notes.push(`${unstable.join('・')}の通信が途切れがちです。「操作設定」の「通信の診断」で対処を確認してください。`);
  return notes.join(' ');
}

// 通信の診断 (#70) の対処の案内。設定は変えず、利用者が自分で確かめる手順だけを示す
const HINTS = {
  stalls: '通信が周期的に止まっています。PC・スマホのBluetoothイヤホンなどを外すか、スマホをPCのホットスポット（5GHz）につないでください',
  slow: '応答が遅れています。スマホとPC（またはWi-Fiルーター）を近づけ、間に壁や金属がないようにしてください',
  path: '速い経路（WebRTC）が使えていません。スマホでページを読み込み直してください',
  reconnect: '何度もつなぎ直しています。スマホの省電力（Androidのバッテリーセーバー、iPhoneの低電力モード）を切り、画面を消さないでください',
  stuck: '送った入力の返事が溜まっています。スマホのBluetooth機器を外し、Wi-Fiの電波の強い場所で使ってください',
};

/**
 * スマホ 1 台の通信の診断 (#70)。slot = state.slots の 1 件。経路・往復時間・受信の途切れ (#131)・再接続の回数から、
 * 状態 (ok / warn / bad) と対処の案内を作る。往復時間はスマホが送る統計 (最近の ping・入力の往復) を使う
 */
export function slotDiagnosis(slot: SlotState) {
  const st = slot?.clientStats || {};
  const stalls = slot?.net?.stalls || 0, reconnects = slot?.reconnects || 0;
  const rtt = Number.isFinite(st.avg) ? st.avg : null, p95 = Number.isFinite(st.p95) ? st.p95 : null;
  const fast = slot?.rtcState === 'open';
  let level = 'ok';
  const hints: string[] = [];
  const note = (l: string, key: keyof typeof HINTS) => { hints.push(HINTS[key]); if (l === 'bad' || level === 'ok') level = l; };
  if (stalls >= 3) note('bad', 'stalls');
  if ((rtt ?? 0) > 100 || (p95 ?? 0) > 300) note('warn', 'slow');
  if (!fast) note('warn', 'path');
  if (reconnects >= 3) note('warn', 'reconnect');
  return { name: slot?.name, level, path: fast ? 'WebRTC' : 'WebSocket', rtt, p95, stalls, reconnects, hints };
}

/** スマホ自身の接続・診断の画面に出す案内 (#70)。stats = スマホの往復時間の統計 (avg・p95・unacked・path) */
export function phoneAdvice(stats: ClientStats | null) {
  if (!stats) return '';
  const hints: string[] = [];
  if ((stats.avg ?? 0) > 100 || (stats.p95 ?? 0) > 300) hints.push(HINTS.slow);
  if ((stats.unacked ?? 0) > 5) hints.push(HINTS.stuck);
  if (stats.path !== 'rtc') hints.push(HINTS.path);
  return hints.join(' ');
}

/** 案内に出す、選んだゲームの名前 (#140)。ホストの game.titleName。分からなければ「ゲーム」 */
export const gameLabel = (game: PhoneGame | null | undefined) => game?.titleName || 'ゲーム';

/**
 * 通信の設定の表示 (#220)。協力プレイ中は変えない。ポートの変更には再起動が要るので config.json の案内にする。
 * 自動復帰は初期OFF。利用者が明示的に切り替えた値は保存し、次回の起動でも保持する (#225)
 */
export function commSettingsView(game: PhoneGame | null, port: number | null) {
  const seconds = Math.round((game?.autoResumeMs ?? 15000) / 1000);
  const locked = !game || game.phase === 'coop';
  const lines = [`自動で再開できる時間：切断から${seconds}秒以内`, 'ホストの一時停止・緊急停止の後は自動で再開しません', '初期値はOFFです。切り替えた設定は保存され、次回の起動でも保持されます'];
  if (port) lines.push(`ポート：${port}（変更は config.json で行い、アプリを起動し直してください）`);
  if (game?.phase === 'coop') lines.unshift('協力プレイ中は変更できません。一時停止すると変更できます');
  return { checked: !!game?.autoResume, locked, text: lines.join('。') };
}

/**
 * 分けやすい人数の参考 (#166)。操作定義の重みから、全員に操作があり偏りの最も小さい人数を返す。
 * 試遊の結果ではないので「推奨」と断定しない。同じ偏りなら少ない人数にする。
 * 実機の記録があるゲームは、計算の参考と食い違って見えないよう出さない
 */
export function playerHint(profile: Profile | null | undefined) {
  if (!profile?.assignments || !profile.controllerSupported || profile.status === 'device') return null;
  const weight = Object.fromEntries((profile.actions || []).map((a) => [a.id, a.weight ?? 1]));
  let best: {players:number;spread:number} | null = null;
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const people = Object.values(profile.assignments[n] || {}).filter((ids) => ids.length);
    if (people.length !== n) continue;
    const loads = people.map((ids) => ids.reduce((sum, id) => sum + (weight[id] ?? 1), 0));
    const mean = loads.reduce((a, b) => a + b, 0) / n;
    const spread = mean ? (Math.max(...loads) - Math.min(...loads)) / mean : Infinity;
    if (!best || spread < best.spread - 1e-9) best = { players: n, spread };
  }
  return best && { players: best.players, text: `参考：${best.players}人だと操作を分けやすい定義です（試遊の結果ではありません）` };
}

/** 観客向け表示の内容 (#163)。参加者の色・担当・押している入力・進行だけを出す */
export function overlayModel(state: HostState | null) {
  const game = state?.game;
  if (!game) return { status: '', players: [] };
  const slots = game.participants?.length ? game.participants : game.connected || [];
  const label = (code: string) => {
    const id = String(code).replace(/^act:/, '').split(':')[0];
    const action = game.profile?.actions?.find((a) => a.id === id);
    return action ? inputKeyLabel(game, action) : String(code);
  };
  return {
    status: { lobby: '参加受付中', preparing: '準備中', paused: '一時停止中' }[game.phase as 'lobby'|'preparing'|'paused'] || '',
    players: slots.map((slot) => {
      const s = state.slots?.find((x) => x.name === slot);
      return { slot, connected: !!s?.connected, role: roleView(game, slot).title, pressed: (s?.pressed || []).map(label) };
    }),
  };
}

/**
 * PC画面の演出 (#160)。状態が変わった瞬間だけ返す。画面は状態の更新のたびに描き直すので、
 * CSSだけで演出すると毎回再生される。協力プレイ中・一時停止中は何も返さない (F07-11)
 */
export function pcEffects(prev: EffectState | null, next: EffectState) {
  if (!prev || ['coop', 'paused'].includes(next.view)) return { joined: [], lineup: false, screen: false };
  return {
    joined: next.connected.filter((slot) => !prev.connected.includes(slot)),
    lineup: next.lineupOk && !prev.lineupOk,
    screen: next.view !== prev.view,
  };
}

export function desktopWarning(game: PhoneGame | null, inject: InjectionState | null, connected = true) {
  if (!connected) return 'PCホストとの接続が切れました。再接続を待っています。';
  if (inject?.emergencyHotkeyError) return '緊急停止キーを登録できません。操作設定で入力をOFFにしてください。';
  if (game?.reason === 'emergency stop') return '緊急停止しました。入力は止まっています。安全を確かめてから「入力を再開する」を押してください。';
  if (['preparing','coop','paused'].includes(game?.phase ?? '')) {
    if (inject?.mode === 'off') return '入力が止まっています。「入力を再開する」を押すと再開できます。';
    if (inject?.mode === 'test') return '確認用の入力先です。実ゲームで遊ぶ前に操作設定を確認してください。';
    const missing = (game?.participants || []).filter((p) => !game?.connected?.includes(p));
    if (missing.length) return `${missing.join('・')}の再接続を待っています。`;
    if ((game?.connected?.length || 0) < (game?.required || MIN_PLAYERS)) return `${MIN_PLAYERS}人以上の接続を待っています。`;
    if (game?.phase === 'preparing' && !inject?.active) return `${gameLabel(game)}を前面にして、プレイ中の画面まで進めてください。`;
    if (game?.phase === 'coop' && !inject?.active) return `操作を停止しています。${gameLabel(game)}を前面にしてください。`;
  }
  return '';
}

// 定期スナップショットでは手動ナビゲーションを戻さない。進行の切替時だけ分担・準備へ案内する。
export function screenOnGameUpdate(ui: Navigation, previousPhase: PhoneGame["phase"] | undefined, game: PhoneGame | null) {
  return {...ui, game:game?.title || ui.game,
    screen:game?.phase && game.phase !== previousPhase && game.phase !== 'lobby' ? 'roles' : ui.screen};
}

/** 実際に送る入力の表示。ゲーム内の操作名から用途を推測しない (#150)。 */
export function inputKeyLabel(game: Pick<ControllerGame,"keys"> | null | undefined, action: Action) {
  if (action.type === 'mouseDelta') return 'マウス移動';
  if (action.type === 'wheel') return 'ホイール';
  return outputKeyLabel(game?.keys?.actions?.[action.id]);
}

export function outputKeyLabel(output: {label:string} | null | undefined) {
  if (!output?.label) return '送らない';
  const label = output.label;
  return /^[A-Za-z0-9↑↓←→]+$/.test(label) ? `${label}キー` : label;
}

/** 見出しもゲーム内の意味ではなく、割り当てた入力の種類から作る。 */
export function inputGroupLabel(game: Pick<ControllerGame,"keys"> | null | undefined, actions: Action[]) {
  return [...new Set(actions.map(action => action.type === 'mouseDelta' ? 'マウス移動'
    : action.type === 'wheel' || inputKeyLabel(game, action).startsWith('ホイール') ? 'ホイール'
    : /クリック/.test(inputKeyLabel(game, action)) ? 'クリック' : 'キー'))].join('・');
}

/**
 * 分担の確認画面に出す担当の内容。どのゲームも操作定義と分担 (#105・#141) から作る。
 * 協力プレイ中は決まった分担 (game.assigned)、それ以外は今の参加人数での案 (game.profile.assignment)
 */
export function roleView(game: PhoneGame | null, slot: Slot) {
  const p = game?.profile;
  if (!p) return { title: '', lines: [] };
  const assigned = ['coop','paused'].includes(game.phase) && game.assigned && Object.keys(game.assigned).length ? game.assigned : p.assignment || {};
  const ids = assigned[slot] || [];
  const byGroup = new Map<string,{label:string;items:string[]}>();
  for (const id of ids) {
    const a = p.actions.find((x) => x.id === id);
    if (!a) continue;
    const label = inputGroupLabel(game, [a]);
    if (!byGroup.has(label)) byGroup.set(label, { label, items: [] });
    byGroup.get(label)!.items.push(inputKeyLabel(game, a));
  }
  const groups = [...byGroup.values()];
  return {
    title: groups.map((g) => g.label).join('・') || (ids.length ? '' : '担当なし'),
    lines: groups.map((g) => `${g.label}：${g.items.join('、')}`),
  };
}

// 枠の呼び名。操作の分担はゲームの操作定義から決める (#141)
export const ROLES: {slot:Slot;title:string;host?:boolean}[] = [
  { slot: 'P1', title: 'ホスト', host: true },
  { slot: 'P2', title: '参加者' },
  { slot: 'P3', title: '参加者' },
  { slot: 'P4', title: '参加者' },
];

// Minecraft は公式ランチャーを開き、ランチャーで「プレイ」を押す (#55)。Steam・Epic の検出・起動はホストの state.games (#54・#93)
export const GAMES = [
  {
    id: 'minecraft-java',
    name: 'Minecraft Java Edition',
    // 操作設定の「手順」(#109・#114 の後の開始手順)
    steps: [
      'PCの画面でゲームを選び、メンバーと分担を決定する',
      '「ゲームを起動する」で公式ランチャーを開き、「プレイ」を押してワールドに入る（ランチャーが見つからないときは手動で起動する）',
      'ホットバーに使うアイテムを並べておく（インベントリ操作はホストのリモコンでは限られます）',
      '「ゲームを準備する」の後、Minecraftを前面にしてホストがスマホでReadyを押す',
    ],
  },
];

const SOURCE_LABELS: Record<string,string> = { steam: 'Steam', epic: 'Epic Games', manual: '手動で起動', registered: '手動登録', minecraft: '公式ランチャー',
  // Steam・Epic 以外のランチャー (#265)
  'steam-shortcut': 'Steam（追加したゲーム）', gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', battlenet: 'Battle.net', xbox: 'Xbox' };

/** 手動で登録したゲーム (#49・#56)。名前の変更・登録の解除ができる */
export const isRegistered = (id: string | null) => typeof id === 'string' && id.startsWith('manual:');

/** 一覧の見出しの件数 (ランチャーで見つけたものと手動登録を分けて数える。固定の Minecraft の項目は数えない) */
export function gamesCountText(list: GameEntry[], scanning: boolean) {
  if (scanning) return 'インストール済みのゲームを探しています…';
  const found = list.filter((g) => SOURCE_LABELS[g.source] && !['registered', 'manual', 'minecraft'].includes(g.source)).length;
  const registered = list.filter((g) => g.source === 'registered').length;
  if (!found) return registered ? `手動登録 ${registered} 件（Steam・Epic などのランチャーでは見つかりませんでした）` : 'Steam・Epic などのランチャーでゲームは見つかりませんでした';
  return registered ? `Steam・Epic など ${found} 件・手動登録 ${registered} 件` : `Steam・Epic などで ${found} 件見つかりました`;
}
const LAUNCH_TITLES: Record<string,string> = { launching: '起動中…', started: '起動しました', failed: '起動できませんでした', timeout: '起動を確認できませんでした' };

/**
 * 選択画面の一覧: 固定の Minecraft (手動起動) と、ホストが検出したゲーム (state.games)。
 * 検出は入力が届くことを意味しないので、verified でない項目には「未検証」を出す (要件11章5項)
 */
export function gameList(games: DetectedGame[] | undefined, minecraft: HostState["minecraft"]) {
  // Minecraft は常に先頭に出す。ランチャーを見つけたら、その画像を付け、起動 (ランチャーを開く) できるようにする (#128・#55)
  const launcher = minecraft?.launchable === true;
  const fixed = { id: GAMES[0].id, name: GAMES[0].name, source: launcher ? 'minecraft' : 'manual', verified: true, launchable: launcher, image: minecraft?.image === true };
  const detected = (games || []).filter((g) => g?.id && g.id !== fixed.id)
    .map((g) => ({ id: g.id, name: g.name || g.id, source: g.source, verified: g.verified === true, launchable: !!g.launchable, image: g.image === true }));
  return [fixed, ...detected];
}

/** 起動要求の表示 (game.launch)。選んだ項目への要求でなければ出さない */
export function launchView(launch: LaunchState | null | undefined, id: string) {
  if (!launch || launch.id !== id || !LAUNCH_TITLES[launch.state]) return null;
  return { state: launch.state, title: LAUNCH_TITLES[launch.state], message: launch.message || '' };
}

/** 一覧の1項目の表示 */
export function gameCard(entry: GameEntry, selectedId: string | null, launch: LaunchState | null | undefined) {
  const badges = [SOURCE_LABELS[entry.source] || entry.source];
  if (!entry.verified) badges.push('未検証');
  // 画像はホストが項目 ID で返す (PC 画面だけ、#121)。ない項目は頭文字で代わりに表示する
  const image = entry.image ? `/api/game-image?id=${encodeURIComponent(entry.id)}` : null;
  const initial = [...String(entry.name || '?').replace(/^[^\p{L}\p{N}]+/u, '')][0]?.toUpperCase() || '?';
  return { id: entry.id, name: entry.name, badges, unverified: !entry.verified, selected: entry.id === selectedId, launch: launchView(launch, entry.id), image, initial };
}

/** ゲーム一覧の列の数 (横 3 列のタイル、#121) */
export const GAME_COLUMNS = 3;

/**
 * 選択画面の主ボタン (クリック・Enter) の動作。選ぶだけで起動せず、メンバー・分担の画面へ進む (#109)
 */
export function gameAction(ui: Navigation, _game: PhoneGame | null, list: GameEntry[]) {
  const entry = list.find((g) => g.id === ui.game);
  if (!entry) return { kind: 'none', label: 'ゲームを選んでください' };
  return { kind: 'next', label: 'このゲームで遊ぶ' };
}

/**
 * 分担の画面の主ボタンと補助ボタン (#109)。メンバーと分担を決定 → (一覧のゲームは) 起動 → 準備 の順。
 * 決定・起動・準備の可否はホストが判定する (lineupOk・canPrepare)。画面は順番を案内するだけ
 */
export function rolesAction(game: PhoneGame | null, list: GameEntry[]): UiAction {
  if (!game) return { kind: 'none', label: 'PCホストに接続中…', disabled: true };
  const pending = game.roleAck || [];
  // 一時停止中の入れ替え (#47)。再開はホストのスマホで、入れ替えた人の確認の後
  if (game.phase === 'paused') return { kind: 'back', label: '入れ替えを終える',
    note: pending.length ? `${pending.join('・')}のスマホで新しい担当を確認してください` : '終えたら、ホストのスマホで再開してください' };
  const connected = game.connected || [];
  if (!game.lineupOk) {
    const ready = connected.includes('P1') && connected.length >= MIN_PLAYERS;
    return { kind: 'confirm', label: 'この分担で決定', disabled: !ready,
      note: ready ? '' : `ホスト（P1）を含む${MIN_PLAYERS}人以上の参加が必要です` };
  }
  if (game.phase !== 'lobby') return { kind: 'none', label: '準備中', disabled: true };
  const entry = list.find((g) => g.id === game.title);
  const prepare: UiAction = { kind: 'prepare', label: 'ゲームを準備する', disabled: !game.canPrepare };
  if (!entry?.launchable) return { ...prepare, note: `${entry?.name || 'ゲーム'}は自動で起動できません。手動で起動してから準備してください` };
  const launch = launchView(game.launch, entry.id);
  if (!launch) return { kind: 'launch', label: 'ゲームを起動する', id: entry.id, disabled: !game.canLaunch };
  if (launch.state === 'launching') return { kind: 'wait', label: '起動中…', disabled: true, note: launch.message };
  if (launch.state === 'failed' || launch.state === 'timeout') {
    return { kind: 'launch', label: 'もう一度起動する', id: entry.id, disabled: !game.canLaunch, note: `${launch.title}。${launch.message}`,
      alt: { ...prepare, label: '手動で起動して準備へ' } };
  }
  return { ...prepare, note: launch.message };
}

export function device(ua: string | undefined) {
  if (!ua) return '';
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'その他';
}

/**
 * 参加の案内の形 (#133)。info = /api/info。
 * two: ① Wi-Fi・② 参加 の 2 つを並べるか。wifiQr: ① の QR (ホットスポットが OFF なら null で、ON にするボタンを出す)
 */
export function joinGuideView(info: PcInfo | null) {
  const hotspot = info?.hotspot, wifi = info?.wifi;
  if (hotspot && !hotspot.on) {
    return { two: true, wifiQr: null, button: true, bubble: '①→②の順に<br>進めよう！', note: 'PCと同じWi-Fiにつながっていれば、②だけで参加できます' };
  }
  if (wifi) return { two: true, wifiQr: wifi.qr, button: false, bubble: '①→②の順に<br>読み取ろう！', note: `Wi-Fi：${wifi.ssid}` };
  return { two: false, wifiQr: null, button: false, bubble: 'みんなのスマホで<br>読み取ろう！', note: '' };
}

/** 参加用 URL: ホットスポット (192.168.137.x) を優先する */
export function joinUrl(info: PcInfo | null) {
  const urls = info?.urls || [];
  return urls.find((u) => u.hotspot) || urls[0] || null;
}

/** P1〜P4 の枠の表示 */
/** PC画面の分担の表示 (#235)。入れ替え (#47) の選択状態を含む */
export function roleColumns(game: PhoneGame | null, roleSlots: Slot[], swapPick: Slot | null) {
  const pending = game?.roleAck || [];
  return roleSlots.map((slot) => {
    const index = SLOT_NAMES.indexOf(slot), role = roleView(game, slot);
    return { slot, index, picked: swapPick === slot, swap: !!game?.canSwap, title: role.title, line: role.lines[0] || '担当する操作なし', ack: pending.includes(slot) };
  });
}

/** PC画面の参加者の表示 (#235)。既存の画面とReact版で共用する */
export function playerCards(slots: ReturnType<typeof slotViews>, view: string, game: PhoneGame | null) {
  return slots.map((s, i) => ({
    slot: s.slot, index: i,
    className: `player ${s.state}${view === 'preparing' && s.host && s.state === 'connected' ? ' pending' : ''}`,
    badge: s.state === 'empty' ? '参加待ち' : s.state === 'lost' ? '切断中' : view === 'ready' ? '接続完了！' : view === 'preparing' ? (s.host ? '準備中！' : '接続完了！') : '接続完了！',
    name: `プレイヤー${i + 1}`, role: roleView(game, s.slot).title, device: `機種：${s.device || '未接続'}`,
  }));
}

export function slotViews(slots: SlotState[] | undefined) {
  return ROLES.map((r) => {
    const s = (slots || []).find((x) => x.name === r.slot);
    const state = !s?.assigned ? 'empty' : s?.connected ? 'connected' : 'lost';
    const label = { empty: '空き', connected: '接続中', lost: '切断中（再接続を待っています）' }[state];
    return { slot: r.slot, title: r.title, host: !!r.host, state, label, device: s?.connected ? device(s.ua) : '' };
  });
}

/** ホストのリモコン (矢印・Enter・Esc) による画面の移動。ui = { screen, game }。
 *  選んだゲーム (game) はホストが保持する。変わったら画面から select_game で知らせる。
 *  list は選択画面の一覧 (gameList)。選択画面では横 3 列のタイルの中を、左右で隣、上下で 1 行動く (#121)。
 *  選択画面の行き来は Enter (次へ)・Esc (戻る) で行う */
export function navigate(ui: Navigation, control: string, list: {id:string}[] = GAMES) {
  const i = SCREENS.indexOf(ui.screen);
  if (ui.screen === 'game' && ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(control) && list.length) {
    const j = list.findIndex((g) => g.id === ui.game);
    if (j < 0) return { ...ui, game: list[0].id };
    const step = { LEFT: -1, RIGHT: 1, UP: -GAME_COLUMNS, DOWN: GAME_COLUMNS }[control] ?? 0;
    // 端では止まる。下の行が短いときは最後の項目へ
    const k = control === 'DOWN' && j + step >= list.length && Math.floor(j / GAME_COLUMNS) < Math.floor((list.length - 1) / GAME_COLUMNS)
      ? list.length - 1 : j + step;
    return k < 0 || k >= list.length ? ui : { ...ui, game: list[k].id };
  }
  if (control === 'RIGHT' || control === 'ENTER') return { ...ui, screen: SCREENS[Math.min(i + 1, SCREENS.length - 1)], game: ui.game || list[0].id };
  if (control === 'LEFT' || control === 'ESC') return { ...ui, screen: SCREENS[Math.max(i - 1, 0)] };
  return ui;
}
