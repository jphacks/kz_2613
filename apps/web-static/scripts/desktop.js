
  import { createVirtualCursor } from './virtual-cursor.js';
  import { SCREENS, SCREEN_TITLES, ROLES, GAMES, slotViews, startView, phaseView, navigate, joinUrl, screenOnGameUpdate, roleView } from '../app-view.js';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // 表示中の画面は PC 画面だけの状態。選んだゲーム・セッション・役割はホストが保持する
  let ui = { screen: 'join', game: GAMES[0].id };
  try { ui.screen = JSON.parse(localStorage.getItem('recooplay.app') || '{}').screen || ui.screen; } catch {}
  if (!SCREENS.includes(ui.screen)) ui.screen = 'join';
  let state = null, game = null, inject = null;

  function setUi(next) {
    // ゲームの変更はホストへ送る (協力プレイ中ならホストが全解放して準備中へ戻す)。表示はホストの返事で変わる
    if (next.game !== ui.game && ws?.readyState === 1) ws.send(JSON.stringify({ type: 'select_game', title: next.game }));
    ui = { ...next, game: game?.title || next.game };
    try { localStorage.setItem('recooplay.app', JSON.stringify({ screen: ui.screen })); } catch {}
    render();
  }

  // この画面が前面になったことをホストへ知らせる。協力プレイ中に Minecraft から手動で戻ると、
  // ホストは全キーを離して一時停止し、ホストのスマホをリモコンに戻す
  function sendFocus() { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'focus', focused: document.hasFocus() })); }
  window.addEventListener('focus', sendFocus);
  window.addEventListener('blur', sendFocus);

  $('steps').innerHTML = SCREENS.map((s) => `<button data-go="${s}">${SCREEN_TITLES[s]}</button>`).join('');
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go) setUi({ ...ui, screen: go });
    const g = e.target.closest('[data-game]')?.dataset.game;
    if (g) setUi({ ...ui, game: g });
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (mode && ws?.readyState === 1) ws.send(JSON.stringify({ type: 'inject_mode', mode }));
  });
  $('prepareBtn').addEventListener('click', () => { if (ws?.readyState === 1) ws.send(JSON.stringify({type:'prepare'})); });
  $('openGameBtn').addEventListener('click', () => { if (ws?.readyState === 1) ws.send(JSON.stringify({type:'open_game'})); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-game]')) { e.preventDefault(); e.target.click(); } });
  // PC のキーボードでも同じ操作
  document.addEventListener('keydown', (e) => {
    const c = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', Enter: 'ENTER', Escape: 'ESC' }[e.key];
    if (c && !e.target.closest('button')) setUi(navigate(ui, c));
  });

  function render() {
    for (const s of SCREENS) $('s-' + s).classList.toggle('show', s === ui.screen);
    document.querySelectorAll('#steps button').forEach((b) => b.classList.toggle('sel', b.dataset.go === ui.screen));

    document.body.dataset.phase = game?.phase || 'lobby';
    $('screenTitle').textContent = game?.phase === 'preparing' ? 'ゲームを準備しよう' : game?.phase === 'coop' ? '3人で協力プレイ中！' : game?.phase === 'paused' ? 'ひとやすみ。ホスト操作中' : {join:'みんなで集まろう！',game:'遊ぶゲームを選ぼう',roles:'3人で操作を分けよう'}[ui.screen];
    const pv = phaseView(game, inject);
    $('phase').textContent = pv.title;
    $('phase').className = 'pill ' + (pv.phase === 'coop' ? 'ok' : pv.phase === 'paused' ? 'warn' : '');
    $('phaseBanner').className = ['preparing','coop','paused'].includes(pv.phase) ? pv.phase : '';
    $('phaseTitle').textContent = pv.title;
    $('phaseDetail').textContent = pv.detail;

    // ① 参加
    const slots = slotViews(state?.slots);
    $('count').textContent = `${slots.filter((s) => s.state === 'connected').length}/${game?.required ?? 3}`;
    $('slots').innerHTML = slots.map((s) => `
      <div class="slot ${s.state}" data-slot="${s.slot}">
        <div class="eyebrow">プレイヤー ${s.slot.slice(1)}</div><div class="mascot" aria-hidden="true"><span>${{P1:"↟",P2:"✥",P3:"✦"}[s.slot]}</span></div><div class="name">${s.slot}</div>
        <h3>${esc(s.title)}</h3>
        <div class="state">${esc(s.label)}${s.device ? ' · ' + esc(s.device) : ''}</div>
      </div>`).join('');

    // ② ゲーム
    $('games').innerHTML = GAMES.map((g) => `
      <div class="game ${g.id === ui.game ? 'sel' : ''}" data-game="${g.id}" role="button" tabindex="0" aria-label="${esc(g.name)}を選択"><div class="game-symbol" aria-hidden="true">▧</div>
        <div>
          <h3>${esc(g.name)}<span class="badge">${esc(g.status)}</span></h3>
          <div class="muted">準備の手順</div>
          <ol>${g.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        </div>
      </div>`).join('');

    // ③ 分担
    $('roles').innerHTML = ROLES.map((r) => {
      const s = slots.find((x) => x.slot === r.slot);
      const v = roleView(game, r.slot); // 操作定義があれば参加人数に合わせた分担 (#105)
      return `<div class="card role slot ${s.state}" data-slot="${r.slot}">
        <div class="mascot" aria-hidden="true"><span>${{P1:"↟",P2:"✥",P3:"✦"}[r.slot]}</span></div><div class="name">${r.slot}<span class="role-title">${esc(v.title)}</span>${r.host ? '<span class="host">ホスト管理</span>' : ''}</div>
        <div class="state">${esc(s.label)}</div>
        <ul>${v.lines.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>`;
    }).join('') + ((game?.keys?.warnings || []).length
      ? `<div class="card warn keys-warn">⚠ キー設定：${game.keys.warnings.map(esc).join('<br>')}</div>` : '');
    $('prepareBtn').disabled = !game?.canPrepare;
    $('prepareBtn').hidden = game?.phase !== 'lobby';
    $('openGameBtn').hidden = !['preparing','paused'].includes(game?.phase);
    const sv = startView(game, inject);
    $('startState').innerHTML = (sv.canStart
      ? '<div class="ok ready-message">✓ 条件が揃いました。ホストがワールドの準備を確認してReadyを押してください</div>'
      : `<div class="ready-message">${game?.phase === 'coop' ? '3人の操作を送信中' : game?.phase === 'preparing' ? 'ゲーム内の準備ができたら、ホストがReady' : game?.phase === 'paused' ? 'ホストの明示再開を待っています' : 'ゲームを開いて準備へ進みます'}</div><ul>${sv.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`)
      + (game?.phase === 'preparing' && game.prepareStatus ? `<p>${esc(game.prepareStatus)}</p>` : '')
      + sv.notes.map((n) => `<div class="warn" style="margin-top:8px">⚠ ${esc(n)}</div>`).join('');
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === inject?.mode));
    $('modeNote').textContent = inject?.mode === 'test' ? '診断画面で「テスト」モードになっています' : 'Minecraft 以外のウィンドウが前面のときは、操作を送らずにすべてのキーを離します';

    // フッター: 入力先・緊急停止
    const t = inject?.target;
    $('target').textContent = !inject ? '' : inject.mode === 'test' ? '○ 診断用のテストモード（疑似ゲーム画面）' : inject.active ? (game?.phase === 'coop' ? '● Minecraftへ3人の操作を送信中' : game?.remoteRoute === 'app' ? '● PCアプリを操作中（ゲーム操作停止）' : '● Minecraftへの入力を許可（前面時のみ）') : inject.mode === 'off' ? '○ ゲームへの入力: OFF' : `○ 入力停止中（前面: ${t?.process || '不明'}）`;
    $('target').className = inject?.active ? 'ok' : '';
    $('hotkey').textContent = inject?.emergencyHotkey ? (inject.emergencyHotkeyError ? `⚠ 緊急停止キーを登録できません` : `緊急停止：${inject.emergencyHotkey}`) : '';
  }

  async function loadInfo() {
    try {
      const info = await (await fetch('/api/info')).json();
      const u = joinUrl(info);
      $('qr').innerHTML = u ? u.qr : '<span class="muted">ネットワークが見つかりません</span>';
      $('url').textContent = u ? u.url : '';
      $('urlNote').textContent = !u ? '' : u.hotspot ? 'PC のモバイルホットスポットに接続してから読み取ってください' : '※ ホットスポット（192.168.137.x）ではありません。ホットスポットを ON にすると自動で切り替わります';
      $('wifi').innerHTML = info.wifi ? `<div class="muted" style="font-size:13px">Wi-Fi：<b style="color:var(--text)">${esc(info.wifi.ssid)}</b></div>` : '';
    } catch {}
  }

  // ホストとの接続 (PC 画面 = モニター)。ホストのスマホのリモコンは "remote" で届く
  const cursor = createVirtualCursor();
  let ws = null;
  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { $('conn').textContent = 'ホスト接続OK'; $('conn').className = 'pill ok'; ws.send(JSON.stringify({ type: 'monitor', page: 'app' })); sendFocus(); };
    ws.onclose = () => { $('conn').textContent = 'ホストとの接続が切れました'; $('conn').className = 'pill ng'; setTimeout(connect, 1000); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const previousPhase = game?.phase;
      if (m.type === 'state') { state = m; game = m.game; inject = m.inject; }
      else if (m.type === 'game') game = m.game;
      if (m.type === 'state' || m.type === 'game') { ui = screenOnGameUpdate(ui, previousPhase, game); render(); }
      // この画面が前面のときだけ反応する (Minecraft が前面ならキー入力として Minecraft へ届いている)
      else if (m.type === 'remote' && m.route === 'app' && m.epoch === game?.epoch) {
        if (!cursor.handle(m) && m.state === 'down') setUi(navigate(ui, m.control));
      }
    };
  }

  render();
  loadInfo();
  setInterval(loadInfo, 5000); // ホットスポットを後から ON にした場合に備えて取り直す
  connect();
