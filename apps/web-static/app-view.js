// PC アプリ画面 (app.html) の表示内容を、ホストの状態 (state / game / inject) から作る。
// 画面の部品に依存しない純粋な関数だけを置き、Node の試験 (scripts/sim/app-view-test.mjs) で表示とサーバー状態の一致を確かめる。
// 開始・準備・再開できるかはサーバーの canReady・canPrepare・canResume をそのまま使い、画面側で判定し直さない。

export const SCREENS = ['join', 'game', 'roles'];

// 参加人数 (#57)。2〜4人で遊び、Ready の時点で接続している人数で分担を決める (ホストが判定する)
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const SLOT_NAMES = ['P1', 'P2', 'P3', 'P4'];

/**
 * Minecraft の固定の分担 (P1 移動・P2 視点・P3 アクション) を使うか。実機で確かめた 3人のときだけで、
 * 2人・4人は操作定義から作った分担を使う。判定はホストの game.fixedControls に従う
 */
export function usesFixedRoles(game) {
  const p = game?.profile;
  if (!p) return true;
  // 誰も接続していないときは、基本の3人の分担を見せる (shownSlots と同じ)
  const nobody = !game.connected?.length && !game.participants?.length;
  return p.id === 'minecraft-java' && (game.fixedControls !== false || nobody);
}

/** 担当を表示する枠: 協力プレイの参加者、なければ接続中の枠。誰もいなければ空 (3人分の固定の表示は出さない、#126) */
export function shownSlots(game) {
  if (game?.participants?.length) return game.participants;
  if (game?.connected?.length) return SLOT_NAMES.filter((s) => game.connected.includes(s));
  return [];
}

export const SCREEN_TITLES = { join: '① 参加', game: '② ゲーム選択', roles: '③ 操作分担の確認' };

export function profileNotice(profile) {
  if (!profile || (profile.id === 'minecraft-java' && profile.status === 'device' && profile.controllerSupported)) return '';
  const name = profile.name || '選択中のゲーム';
  if (!profile.controllerSupported) return `${name}：マウス操作が中心のため、スマホで分担できる操作がありません。`;
  // 定義のないゲームには汎用の 3D アクションの操作を当てる (#123)
  if (profile.id === 'generic') return `${name}：操作定義がないため、一般的な操作（WASD・マウス）で試します。操作が届くか確かめながら遊んでください。`;
  const status = {template:'仮の定義（未検証）',extracted:'自動抽出（実機未検証）',unverified:'未検証',reviewed:'人による確認（実機未検証）',device:'過去の実機記録'}[profile.status] || '未検証';
  return `${name}：${status}。操作が届くか確かめながら遊んでください。`;
}

// 移動可能な3ページと、サーバーで切り替わる準備・協力・停止の視覚状態を分ける。
// canReady以外のローカル条件からReady可を推測しない。
export function desktopView(ui, game) {
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
export function networkNotice(network, slots) {
  const notes = [];
  if (network?.bluetoothAudio) notes.push('BluetoothでPCの音を出していると、スマホとの通信が途切れやすくなります。有線のイヤホンかPCのスピーカーを使ってください。');
  const unstable = (slots || []).filter((s) => s.connected && (s.net?.stalls || 0) >= 3).map((s) => s.name);
  if (unstable.length) notes.push(`${unstable.join('・')}の通信が途切れがちです。Wi-Fiの電波やBluetoothを確認してください。`);
  return notes.join(' ');
}

export function desktopWarning(game, inject, connected = true) {
  if (!connected) return 'PCホストとの接続が切れました。再接続を待っています。';
  if (inject?.emergencyHotkeyError) return '緊急停止キーを登録できません。操作設定で入力をOFFにしてください。';
  if (game?.reason === 'emergency stop') return '緊急停止しました。入力は止まっています。安全を確かめてから「入力を再開する」を押してください。';
  if (['preparing','coop','paused'].includes(game?.phase)) {
    if (inject?.mode === 'off') return '入力が止まっています。「入力を再開する」を押すと再開できます。';
    if (inject?.mode === 'test') return '確認用の入力先です。実ゲームで遊ぶ前に操作設定を確認してください。';
    const missing = (game?.participants || []).filter((p) => !game.connected?.includes(p));
    if (missing.length) return `${missing.join('・')}の再接続を待っています。`;
    if ((game?.connected?.length || 0) < (game?.required || MIN_PLAYERS)) return `${MIN_PLAYERS}人以上の接続を待っています。`;
    if (game?.phase === 'preparing' && !inject?.active) return 'Minecraftを前面にして、ワールドの準備を確認してください。';
    if (game?.phase === 'coop' && !inject?.active) return '操作を停止しています。Minecraftを前面にしてください。';
  }
  return '';
}

// 定期スナップショットでは手動ナビゲーションを戻さない。進行の切替時だけ分担・準備へ案内する。
export function screenOnGameUpdate(ui, previousPhase, game) {
  return {...ui, game:game?.title || ui.game,
    screen:game?.phase && game.phase !== previousPhase && game.phase !== 'lobby' ? 'roles' : ui.screen};
}

// 操作ごとの初期のキー表示。ホストの game.keys (ゲームのキー設定に合わせた実際のキー) が来るまで使う (#101)
const KEY_DEFAULTS = { FWD: 'W', LEFT: 'A', BACK: 'S', RIGHT: 'D', JUMP: 'Space', SNEAK: 'Shift', SPRINT: 'Ctrl', ATTACK: '左クリック', USE: '右クリック', INV: 'E', DROP: 'Q' };

/** 操作に実際に割り当たっているキーの表示。送れないキー・未設定は「送らない」 */
export function keyLabel(keys, control) {
  if (!keys?.controls || !(control in keys.controls)) return KEY_DEFAULTS[control] || '';
  return keys.controls[control]?.label ?? '送らない';
}

// Minecraft v0.1 の固定分担 (docs/requirements/requirements-v0.3.md 3.2)。役割の編集・交換は P0 の対象外。
// キーの表示はゲームのキー設定に合わせる (items: [表示名, 操作名の一覧 | null])
const ROLE_ITEMS = {
  P1: [['移動スティック', ['FWD', 'LEFT', 'BACK', 'RIGHT']], ['ジャンプ', ['JUMP']], ['スニーク', ['SNEAK']], ['ダッシュ', ['SPRINT']]],
  P2: [['ドラッグで視点を回す（マウス移動）', null], ['感度はスマホで調整', null]],
  P3: [['攻撃・採掘', ['ATTACK']], ['使う・置く', ['USE']], ['持ち物 ◀▶（ホイール）', null], ['インベントリ', ['INV']], ['捨てる', ['DROP']]],
};

/** 担当の操作の一覧 (実際のキー付き) */
export function roleControls(slot, keys) {
  return (ROLE_ITEMS[slot] || []).map(([text, ids]) => ids ? `${text}（${ids.map((c) => keyLabel(keys, c)).join('/')}）` : text);
}

/**
 * 分担の確認画面に出す担当の内容。Minecraft 以外で操作定義があれば、定義と分担 (#105) から作る。
 * 協力プレイ中は決まった分担 (game.assigned)、それ以外は今の参加人数での案 (game.profile.assignment)
 */
export function roleView(game, slot) {
  const p = game?.profile;
  if (usesFixedRoles(game)) {
    // 固定の分担は担当 (入れ替え後の席、#47) で引く
    const key = game?.roleOf?.[slot] || slot;
    const r = ROLES.find((x) => x.slot === key);
    return { title: r?.title || '', lines: roleControls(key, game?.keys) };
  }
  const assigned = ['coop','paused'].includes(game.phase) && game.assigned && Object.keys(game.assigned).length ? game.assigned : p.assignment || {};
  const ids = assigned[slot] || [];
  const byGroup = new Map();
  for (const id of ids) {
    const a = p.actions.find((x) => x.id === id);
    if (!a) continue;
    const g = p.groups.find((x) => x.id === a.group);
    if (!byGroup.has(a.group)) byGroup.set(a.group, { label: g?.label || a.group, items: [] });
    const key = a.type === 'mouseDelta' ? 'マウス移動' : a.type === 'wheel' ? 'ホイール' : (game.keys?.actions?.[id]?.label ?? '送らない');
    byGroup.get(a.group).items.push(`${a.label}（${key}）`);
  }
  const groups = [...byGroup.values()];
  return {
    title: groups.map((g) => g.label).join('・') || (ids.length ? '' : '担当なし'),
    lines: groups.map((g) => `${g.label}：${g.items.join('、')}`),
  };
}

export const ROLES = [
  { slot: 'P1', title: '移動・ホスト', controls: roleControls('P1'), host: true },
  { slot: 'P2', title: '視点', controls: roleControls('P2') },
  { slot: 'P3', title: 'アクション', controls: roleControls('P3') },
  // 4人目は固定の分担を持たない (操作定義の分担で担当が決まる)
  { slot: 'P4', title: '参加者', controls: [] },
];

// Minecraft は公式ランチャーで「プレイ」を押す必要があるため手動起動 (#55)。Steam・Epic の検出・起動はホストの state.games (#54・#93)
export const GAMES = [
  {
    id: 'minecraft-java',
    name: 'Minecraft Java Edition',
    // 操作設定の「手順」(#109・#114 の後の開始手順)
    steps: [
      'PCの画面でゲームを選び、メンバーと分担を決定する',
      'Minecraft のランチャーから手動で起動し、ワールドに入っておく',
      'ホットバーに使うアイテムを並べておく（インベントリ操作はホストのリモコンでは限られます）',
      '「ゲームを準備する」の後、Minecraftを前面にしてホストがスマホでReadyを押す',
    ],
  },
];

const SOURCE_LABELS = { steam: 'Steam', epic: 'Epic Games', manual: '手動で起動' };
const LAUNCH_TITLES = { launching: '起動中…', started: '起動しました', failed: '起動できませんでした', timeout: '起動を確認できませんでした' };

/**
 * 選択画面の一覧: 固定の Minecraft (手動起動) と、ホストが検出したゲーム (state.games)。
 * 検出は入力が届くことを意味しないので、verified でない項目には「未検証」を出す (要件11章5項)
 */
export function gameList(games, minecraft) {
  // Minecraft は常に先頭に出す (起動は手動)。ランチャーを見つけたら、その画像を付ける (#128)
  const fixed = { id: GAMES[0].id, name: GAMES[0].name, source: 'manual', verified: true, launchable: false, image: minecraft?.image === true };
  const detected = (games || []).filter((g) => g?.id && g.id !== fixed.id)
    .map((g) => ({ id: g.id, name: g.name || g.id, source: g.source, verified: g.verified === true, launchable: !!g.launchable, image: g.image === true }));
  return [fixed, ...detected];
}

/** 起動要求の表示 (game.launch)。選んだ項目への要求でなければ出さない */
export function launchView(launch, id) {
  if (!launch || launch.id !== id || !LAUNCH_TITLES[launch.state]) return null;
  return { state: launch.state, title: LAUNCH_TITLES[launch.state], message: launch.message || '' };
}

/** 一覧の1項目の表示 */
export function gameCard(entry, selectedId, launch) {
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
export function gameAction(ui, game, list) {
  const entry = list.find((g) => g.id === ui.game);
  if (!entry) return { kind: 'none', label: 'ゲームを選んでください' };
  return { kind: 'next', label: 'このゲームで遊ぶ' };
}

/**
 * 分担の画面の主ボタンと補助ボタン (#109)。メンバーと分担を決定 → (一覧のゲームは) 起動 → 準備 の順。
 * 決定・起動・準備の可否はホストが判定する (lineupOk・canPrepare)。画面は順番を案内するだけ
 */
export function rolesAction(game, list) {
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
  const prepare = { kind: 'prepare', label: 'ゲームを準備する', disabled: !game.canPrepare };
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

export function device(ua) {
  if (!ua) return '';
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'その他';
}

/** 参加用 URL: ホットスポット (192.168.137.x) を優先する */
export function joinUrl(info) {
  const urls = info?.urls || [];
  return urls.find((u) => u.hotspot) || urls[0] || null;
}

/** P1〜P4 の枠の表示 */
export function slotViews(slots) {
  return ROLES.map((r) => {
    const s = (slots || []).find((x) => x.name === r.slot) || {};
    const state = !s.assigned ? 'empty' : s.connected ? 'connected' : 'lost';
    const label = { empty: '空き', connected: '接続中', lost: '切断中（再接続を待っています）' }[state];
    return { slot: r.slot, title: r.title, host: !!r.host, state, label, device: s.connected ? device(s.ua) : '' };
  });
}

/** ホストのリモコン (矢印・Enter・Esc) による画面の移動。ui = { screen, game }。
 *  選んだゲーム (game) はホストが保持する。変わったら画面から select_game で知らせる。
 *  list は選択画面の一覧 (gameList)。選択画面では横 3 列のタイルの中を、左右で隣、上下で 1 行動く (#121)。
 *  選択画面の行き来は Enter (次へ)・Esc (戻る) で行う */
export function navigate(ui, control, list = GAMES) {
  const i = SCREENS.indexOf(ui.screen);
  if (ui.screen === 'game' && ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(control) && list.length) {
    const j = list.findIndex((g) => g.id === ui.game);
    if (j < 0) return { ...ui, game: list[0].id };
    const step = { LEFT: -1, RIGHT: 1, UP: -GAME_COLUMNS, DOWN: GAME_COLUMNS }[control];
    // 端では止まる。下の行が短いときは最後の項目へ
    const k = control === 'DOWN' && j + step >= list.length && Math.floor(j / GAME_COLUMNS) < Math.floor((list.length - 1) / GAME_COLUMNS)
      ? list.length - 1 : j + step;
    return k < 0 || k >= list.length ? ui : { ...ui, game: list[k].id };
  }
  if (control === 'RIGHT' || control === 'ENTER') return { ...ui, screen: SCREENS[Math.min(i + 1, SCREENS.length - 1)], game: ui.game || list[0].id };
  if (control === 'LEFT' || control === 'ESC') return { ...ui, screen: SCREENS[Math.max(i - 1, 0)] };
  return ui;
}
