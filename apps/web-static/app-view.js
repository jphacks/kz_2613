// PC アプリ画面 (app.html) の表示内容を、ホストの状態 (state / game / inject) から作る。
// 画面の部品に依存しない純粋な関数だけを置き、Node の試験 (scripts/sim/app-view-test.mjs) で表示とサーバー状態の一致を確かめる。
// 開始できるかどうかはサーバーの canStart をそのまま使い、画面側で判定し直さない (理由の説明だけを作る)。

export const SCREENS = ['join', 'game', 'roles'];

export const SCREEN_TITLES = { join: '① 参加', game: '② ゲーム選択', roles: '③ 操作分担の確認' };

// 定期スナップショットでは手動ナビゲーションを戻さない。進行の切替時だけ分担・準備へ案内する。
export function screenOnGameUpdate(ui, previousPhase, game) {
  return {...ui, game:game?.title || ui.game,
    screen:game?.phase && game.phase !== previousPhase && game.phase !== 'lobby' ? 'roles' : ui.screen};
}

// Minecraft v0.1 の固定分担 (docs/requirements/requirements-v0.3.md 3.2)。役割の編集・交換は P0 の対象外
export const ROLES = [
  { slot: 'P1', title: '移動・ホスト', controls: ['移動スティック（W/A/S/D）', 'ジャンプ（Space）', 'スニーク（Shift）', 'ダッシュ（Ctrl）'], host: true },
  { slot: 'P2', title: '視点', controls: ['ドラッグで視点を回す（マウス移動）', '感度はスマホで調整'] },
  { slot: 'P3', title: 'アクション', controls: ['攻撃・採掘（左クリック）', '使う・置く（右クリック）', '持ち物 ◀▶（ホイール）', 'インベントリ（E）', '捨てる（Q）'] },
];

// P0 はゲームの手動起動を前提にする。自動検出・自動起動は P2
export const GAMES = [
  {
    id: 'minecraft-java',
    name: 'Minecraft Java Edition',
    status: '新しい準備・Ready手順は実機受入前',
    steps: [
      'Minecraft のランチャーから手動で起動し、ワールドに入っておく',
      'ホットバーに使うアイテムを並べておく（インベントリ操作はホストのリモコンでは限られます）',
      '③ の画面で「ゲームへの入力」を「常時ON」にする',
      'Minecraftを開いてワールドを準備し、前面にした後にホストがReadyを押す',
    ],
  },
];

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
 *  選んだゲーム (game) はホストが保持する。変わったら画面から select_game で知らせる */
export function navigate(ui, control) {
  const i = SCREENS.indexOf(ui.screen);
  if (control === 'RIGHT' || control === 'ENTER') return { ...ui, screen: SCREENS[Math.min(i + 1, SCREENS.length - 1)], game: ui.game || GAMES[0].id };
  if (control === 'LEFT' || control === 'ESC') return { ...ui, screen: SCREENS[Math.max(i - 1, 0)] };
  if ((control === 'UP' || control === 'DOWN') && ui.screen === 'game') {
    const j = GAMES.findIndex((g) => g.id === ui.game);
    const k = (j + (control === 'DOWN' ? 1 : GAMES.length - 1)) % GAMES.length;
    return { ...ui, game: GAMES[k].id };
  }
  return ui;
}
