// PC アプリ画面 (app.html) の表示内容を、ホストの状態 (state / game / inject) から作る。
// 画面の部品に依存しない純粋な関数だけを置き、Node の試験 (scripts/sim/app-view-test.mjs) で表示とサーバー状態の一致を確かめる。
// 開始できるかどうかはサーバーの canStart をそのまま使い、画面側で判定し直さない (理由の説明だけを作る)。

export const SCREENS = ['join', 'game', 'roles'];

export const SCREEN_TITLES = { join: '① 参加', game: '② ゲーム選択', roles: '③ 操作分担の確認' };

export function profileNotice(profile) {
  if (!profile || (profile.id === 'minecraft-java' && profile.status === 'device' && profile.controllerSupported)) return '';
  const status = {template:'仮の定義（未検証）',extracted:'自動抽出（実機未検証）',unverified:'未検証',reviewed:'人による確認（実機未検証）',device:'過去の実機記録'}[profile.status] || '未検証';
  return `${profile.name || '選択中のゲーム'}：${status}。` + (profile.controllerSupported ? '今回の端末での動作は別途確認してください。' : '分担案の参照用です。対応画面と検証が揃うまでReadyできません。');
}

// 移動可能な3ページと、サーバーで切り替わる準備・協力・停止の視覚状態を分ける。
// canReady以外のローカル条件からReady可を推測しない。
export function desktopView(ui, game) {
  if (game?.phase === 'preparing') return game.canReady ? 'ready' : 'preparing';
  if (game?.phase === 'coop' || game?.phase === 'paused') return game.phase;
  return SCREENS.includes(ui.screen) ? ui.screen : 'join';
}

// 生のプロセス名や診断値ではなく、利用者に必要な復旧操作だけを示す。
export function desktopWarning(game, inject, connected = true) {
  if (!connected) return 'PCホストとの接続が切れました。再接続を待っています。';
  if (inject?.emergencyHotkeyError) return '緊急停止キーを登録できません。操作設定で入力をOFFにしてください。';
  if (game?.reason === 'emergency stop') return '緊急停止しました。入力はOFFです。再開前に操作設定を確認してください。';
  if (['preparing','coop','paused'].includes(game?.phase)) {
    if (inject?.mode === 'off') return '入力がOFFです。操作設定で入力をONにしてください。';
    if (inject?.mode === 'test') return '確認用の入力先です。実ゲームで遊ぶ前に操作設定を確認してください。';
    if (game?.connected?.length < 3) return '3人全員の接続を待っています。';
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
  if (!p || p.id === 'minecraft-java') {
    const r = ROLES.find((x) => x.slot === slot);
    return { title: r?.title || '', lines: roleControls(slot, game?.keys) };
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
];

// Minecraft は公式ランチャーで「プレイ」を押す必要があるため手動起動 (#55)。Steam・Epic の検出・起動はホストの state.games (#54・#93)
export const GAMES = [
  {
    id: 'minecraft-java',
    name: 'Minecraft Java Edition',
    status: '新しい準備・Ready手順は実機受入前',
    steps: [
      'Minecraft のランチャーから手動で起動し、ワールドに入っておく',
      'ホットバーに使うアイテムを並べておく（インベントリ操作はホストのリモコンでは限られます）',
      'PCの「操作設定」でゲームへの入力をONにする',
      'Minecraftを開いてワールドを準備し、前面にした後にホストがReadyを押す',
    ],
  },
];

const SOURCE_LABELS = { steam: 'Steam', epic: 'Epic Games', manual: '手動で起動' };
const LAUNCH_TITLES = { launching: '起動中…', started: '起動しました', failed: '起動できませんでした', timeout: '起動を確認できませんでした' };

/**
 * 選択画面の一覧: 固定の Minecraft (手動起動) と、ホストが検出したゲーム (state.games)。
 * 検出は入力が届くことを意味しないので、verified でない項目には「未検証」を出す (要件11章5項)
 */
export function gameList(games) {
  const fixed = { id: GAMES[0].id, name: GAMES[0].name, source: 'manual', verified: true, launchable: false };
  const detected = (games || []).filter((g) => g?.id && g.id !== fixed.id)
    .map((g) => ({ id: g.id, name: g.name || g.id, source: g.source, verified: g.verified === true, launchable: !!g.launchable }));
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
  return { id: entry.id, name: entry.name, badges, unverified: !entry.verified, selected: entry.id === selectedId, launch: launchView(launch, entry.id) };
}

/**
 * 選択画面の主ボタン (クリック・Enter) の動作。検出したゲームは項目 ID で起動を要求し、
 * 要求後は (起動中・失敗でも) 次へ進める。自動起動できない Minecraft は手動起動の前提で次へ進む
 */
export function gameAction(ui, game, list) {
  const entry = list.find((g) => g.id === ui.game);
  if (!entry) return { kind: 'none', label: 'ゲームを選んでください' };
  if (!entry.launchable) return { kind: 'next', label: 'このゲームで遊ぶ' };
  const launch = launchView(game?.launch, entry.id);
  if (!launch) return { kind: 'launch', label: 'このゲームを起動する', id: entry.id };
  if (launch.state === 'failed' || launch.state === 'timeout') return { kind: 'next', label: '手動で起動して次へ', retry: true, id: entry.id };
  return { kind: 'next', label: '次へ進む' };
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

/** P1〜P3 の枠の表示 */
export function slotViews(slots) {
  return ROLES.map((r) => {
    const s = (slots || []).find((x) => x.name === r.slot) || {};
    const state = !s.assigned ? 'empty' : s.connected ? 'connected' : 'lost';
    const label = { empty: '空き', connected: '接続中', lost: '切断中（再接続を待っています）' }[state];
    return { slot: r.slot, title: r.title, host: !!r.host, state, label, device: s.connected ? device(s.ua) : '' };
  });
}

/** 開始の可否 (サーバーの canStart) と、開始できない理由・注意 */
export function startView(game, inject) {
  if (!game) return { canStart: false, reasons: ['PC ホストに接続していません'], notes: [] };
  const connected = game.connected || [];
  const reasons = [...(game.readyReasons || [])];
  if (!connected.includes('P1')) reasons.push('ホスト（P1）が接続していません');
  const lack = (game.required || 3) - connected.length;
  if (lack > 0) reasons.push(`あと ${lack} 人の参加が必要です（${connected.length}/${game.required}人）`);
  const notes = [];
  if (inject && inject.mode !== 'on') notes.push('ゲームへの入力が「常時ON」ではありません。このままでは操作が Minecraft に届きません');
  return { canStart: !!game.canStart, reasons: game.canStart ? [] : reasons, notes };
}

/** 進行の表示 (協力プレイ中・一時停止中の案内) */
export function phaseView(game, inject) {
  if (!game) return { phase: 'unknown', title: '接続中…', detail: '' };
  if (game.phase === 'coop') {
    const delivering = !!inject?.active;
    return {
      phase: 'coop',
      title: '協力プレイ中',
      detail: inject?.mode === 'test'
        ? '診断用のテストモードです。操作の送信先は疑似ゲーム画面です。Minecraft で遊ぶには③で「常時ON」に切り替えてください'
        : delivering
        ? 'Minecraft に操作を送っています。止めるときはホストのスマホで PAUSE'
        : inject?.mode === 'on'
          ? 'Minecraft のウィンドウをクリックして前面にしてください。前面のときだけ操作が届きます'
          : 'ゲームへの入力が OFF です（③ で「常時ON」にしてください）',
    };
  }
  if (game.phase === 'preparing') return {phase:'preparing',title:'ゲームを準備中',detail: [game.prepareStatus, ...(game.readyReasons || []), 'ホストだけがReadyを押して開始します'].filter(Boolean).join('。')};
  if (game.phase === 'paused') {
    const reason = game.reason === 'host pause' ? 'ホストが一時停止しました' : game.reason === 'emergency stop' ? 'PC の緊急停止' : game.reason === 'app focus' ? 'PC アプリの画面に戻ったため、すべてのキーを離しました' : /disconnected$/.test(game.reason || '') ? `${game.reason.split(' ')[0]} の通信が切れました` : game.reason || '';
    return { phase: 'paused', title: '一時停止中', detail: `${reason}。ホストのスマホで RESUME すると再開します` };
  }
  if (game.reason === 'game change') return { phase: 'lobby', title: '準備中', detail: 'ゲームを変えたため、協力プレイを終えて準備中に戻りました。参加者と分担はそのままです' };
  return { phase: 'lobby', title: '準備中', detail: 'ホストのスマホの矢印・Enter・Esc でもこの画面を操作できます' };
}

/** ホストのリモコン (矢印・Enter・Esc) による画面の移動。ui = { screen, game }。
 *  選んだゲーム (game) はホストが保持する。変わったら画面から select_game で知らせる。
 *  list は選択画面の一覧 (gameList)。上下で一覧を巡回する */
export function navigate(ui, control, list = GAMES) {
  const i = SCREENS.indexOf(ui.screen);
  if (control === 'RIGHT' || control === 'ENTER') return { ...ui, screen: SCREENS[Math.min(i + 1, SCREENS.length - 1)], game: ui.game || list[0].id };
  if (control === 'LEFT' || control === 'ESC') return { ...ui, screen: SCREENS[Math.max(i - 1, 0)] };
  if ((control === 'UP' || control === 'DOWN') && ui.screen === 'game' && list.length) {
    const j = list.findIndex((g) => g.id === ui.game);
    const k = j < 0 ? (control === 'DOWN' ? 0 : list.length - 1) : (j + (control === 'DOWN' ? 1 : list.length - 1)) % list.length;
    return { ...ui, game: list[k].id };
  }
  return ui;
}
