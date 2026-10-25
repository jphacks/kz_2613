import { createPhoneView } from './phone-view.js';
import { bindCooperativeInput } from './cooperative-input.js';
import { createFastChannel } from './transport.js';
import { recordInputMetric, inputMetrics } from './ui-metrics.js';

import { bindTouchpad } from './touchpad.js';
import { myActions } from './generated-controls.js';
(() => {
  const $ = (id) => document.getElementById(id);
  const ROLE_TEXT = {
    P1: '移動（WASD・ジャンプ・スニーク・ダッシュ）とホスト操作',
    P2: '視点（画面をドラッグしてカメラを動かす）',
    P3: 'アクション（攻撃・使う・持ち物の切り替え）',
  };
  const COLORS = { P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)' };
  // 通信契約の版 (docs/architecture/protocol.md)。PC のホストと合わなければ接続できない
  const PROTOCOL_VERSION = 4;

  // 端末ごとの ID。再接続時に同じスロットへ戻るために保存する
  let clientId = null;
  try { clientId = localStorage.getItem('recooplay.clientId'); } catch {}
  if (!clientId) {
    clientId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem('recooplay.clientId', clientId); } catch {}
  }

  // 再接続用トークン。PC のホストが発行し、同じ枠へ戻るときに提示する (clientId だけでは枠を取り戻せない)
  let token = null;
  try { token = localStorage.getItem('recooplay.token'); } catch {}

  let ws = null, seq = 0, retry = 0, stopped = false, pingTimer = null;
  let me = null, isHost = false, game = null;
  let iseq = 0;            // 入力の通し番号 (WebSocket / WebRTC の両方に同じ番号で送り、PC 側で先着 1 回だけ処理)
  let lastServerMsg = 0;   // 最後にサーバーから何か届いた時刻 (無応答検知用)
  const pending = new Map(); // iseq -> 送信時刻
  const rtts = [];
  let sent = 0;

  const isOpen = () => ws?.readyState === 1;
  function setStatus(text, cls) { const el = $('status'); el.textContent = text; el.className = 'pill ' + cls; document.body.dataset.connection=cls; }

  function connect() {
    if (stopped) return;
    setStatus('接続中', 'warn');
    const sock = new WebSocket(`ws://${location.host}/ws`);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      seq = 0;
      pending.clear();
      lastServerMsg = performance.now();
      sock.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, clientId, token, ua: navigator.userAgent, nextIseq: iseq + 1 }));
      clearInterval(pingTimer);
      pingTimer = setInterval(sendPing, 1000);
    };
    sock.onclose = (ev) => { if (ws === sock) onDisconnected(ev.code); };
    sock.onerror = () => {};
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      lastServerMsg = performance.now();
      const msg = JSON.parse(ev.data);
      if (msg.type === 'rtc-answer' || msg.type === 'rtc-cand') { onRtcSignal(msg); return; }
      if (msg.type === 'welcome') {
        if (msg.token && msg.token !== token) {
          token = msg.token;
          try { localStorage.setItem('recooplay.token', token); } catch {}
        }
        roleInput.resetEpoch();
        startRtc();
        me = msg.slot;
        isHost = msg.isHost;
        document.documentElement.style.setProperty('--me', COLORS[me]);
        $('slot').textContent = me;
        $('role').innerHTML = `<b>${msg.role}${isHost ? '（ホスト）' : ''}</b>${ROLE_TEXT[me]}`;
        setStatus(msg.reconnected ? '再接続OK' : '接続OK', 'ok');
        render();
      } else if (msg.type === 'game') {
        const epochChanged = game?.epoch !== msg.game.epoch;
        game = msg.game;
        if (epochChanged) {
          releaseAll();
          roleInput.resetEpoch();

        }
        render();
      } else if (msg.type === 'command_result' && !msg.accepted) {
        $('remoteNote').textContent = (msg.reasons || ['操作を受け付けませんでした']).join('。');
      } else if (msg.type === 'pong') {
        const r = performance.now() - msg.t;
        $('rtt').textContent = Math.round(r) + 'ms';
        rtts.push(r); // 視点担当は ACK 付きの入力が少ないので ping の往復も統計に入れる
        if (rtts.length > 500) rtts.shift();
      } else if (msg.type === 'ack') {
        const t0 = pending.get(msg.iseq);
        if (t0 != null) {
          pending.delete(msg.iseq);
          via[msg.via] = (via[msg.via] || 0) + 1;
          rtts.push(performance.now() - t0);
          if (rtts.length > 500) rtts.shift();
        }
        renderStats();
      } else if (msg.type === 'full') {
        stopped = true;
        $('full').style.display = 'flex';
      } else if (msg.type === 'error' && msg.code === 'protocol_version') {
        showVersionMismatch();
      } else if (msg.type === 'error' && msg.code === 'bad_token') {
        showBadToken();
      }
    };
  }

  // 古い画面がキャッシュされているなど、PC のホストと通信契約の版が違う。再接続しても直らないので止める
  function showVersionMismatch() {
    stopped = true;
    setStatus('版が不一致', 'ng');
    $('fullMessage').textContent = 'PCのアプリと画面の版が合いません。ページを再読み込みしてください。';
    $('full').style.display = 'flex';
  }

  // 同じ clientId の枠があるのにトークンが合わない (保存したトークンが消えた等)。PC でリセットするまで参加できない
  function showBadToken() {
    stopped = true;
    setStatus('参加できません', 'ng');
    $('fullMessage').textContent = 'この端末の参加情報をPCで確認できませんでした。PC側でリセットしてから再読み込みしてください。';
    $('full').style.display = 'flex';
  }

  function onDisconnected(code) {
    clearInterval(pingTimer);
    releaseAll();
    closeRtc();
    if (code === 4000) { stopped = true; setStatus('別タブで接続中', 'ng'); return; }
    if (code === 4005) { showVersionMismatch(); return; }
    if (code === 4006) { showBadToken(); return; }
    setStatus('切断 — 再接続待ち', 'ng');
    setTimeout(connect, Math.min(5000, 250 * 2 ** retry++));
  }

  // サーバーから 3 秒何も届かなければ、OS が切断に気づくのを待たずに張り直す (Wi-Fi が一瞬止まった時の復帰を早める)
  setInterval(() => {
    if (!isOpen() || performance.now() - lastServerMsg < 3000) return;
    const old = ws;
    ws = null;
    try { old.close(); } catch {}
    onDisconnected(1006);
  }, 500);

  // 状態・UIとWebRTCの生成破棄を分離する。速達便の契約は変更しない。
  const rtcRtts = [], via = {ws:0,rtc:0};
  const fast = createFastChannel({
    signal: msg => { if (isOpen()) ws.send(JSON.stringify(msg)); },
    enabled: isOpen, getPhase: () => game?.phase,
    onRtt: value => { rtcRtts.push(value); if (rtcRtts.length > 300) rtcRtts.shift(); },
    onPath: text => { $('path').textContent = text; },
  });
  const rtcOpen = fast.isOpen, startRtc = fast.start, closeRtc = fast.close, onRtcSignal = fast.signal;

  function summarize(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
      max: Math.round(sorted[sorted.length - 1]),
    };
  }
  function stats() {
    const s = summarize(rtts);
    if (!s) return null;
    return { ...s, n: rtts.length, unacked: pending.size, sent, rtc: summarize(rtcRtts), path: rtcOpen() ? 'rtc' : 'ws', via };
  }
  let statsAt = 0;
  function renderStats() {
    if (performance.now() - statsAt < 100) return;
    statsAt = performance.now();
    const s = stats();
    $('sent').textContent = sent;
    $('unacked').textContent = pending.size;
    if (s) $('rttAvg').textContent = `${s.avg}/${s.max}ms`;
  }
  function sendPing() {
    renderStats();
    $('inputMetrics').textContent = JSON.stringify(inputMetrics.summary());
    if (isOpen()) ws.send(JSON.stringify({ type: 'ping', t: performance.now(), stats: stats() }));
  }

  function sendWs(obj) {
    if (!isOpen()) return false;
    ws.send(JSON.stringify({ ...obj, seq: ++seq }));
    return true;
  }
  // 入力 (押下/解放): WebSocket (確実) と WebRTC (速い) の両方に同じ番号で送る
  const portrait = matchMedia('(orientation: portrait)');
  const controlsVisible = () => portrait.matches && !document.hidden && !$('phoneDiagnostics').open;
  function sendInput(obj) {
    if (obj.state === 'down' && !controlsVisible()) return false;
    if (!isOpen()) return false;
    // epoch: 押した時点の進行状態。PC は状態が変わった後に届いた古い入力を処理しない
    const msg = { type: 'input', ...obj, iseq: ++iseq, epoch: game?.epoch, t: performance.now() };
    pending.set(msg.iseq, msg.t);
    sent++;
    fast.send(msg);
    sendWs(msg);
    renderStats();
    return true;
  }

  // ---- 操作の押下 / 解放 ----
  // サーバーに down を送れたものだけ記録し、up はそれに対してだけ送る（再接続中の押下で片割れの up を送らない）
  const sentDown = new Set();
  function ctlDown(ctl, at) {
    if (sentDown.has(ctl)) return;
    if (sendInput({ button: ctl, state: 'down' })) { sentDown.add(ctl); recordInputMetric('pointerdown',at); }
    if (navigator.vibrate) navigator.vibrate(8);
  }
  function ctlUp(ctl) {
    if (!sentDown.delete(ctl)) return;
    sendInput({ button: ctl, state: 'up' });
  }

  const touchpad = bindTouchpad($('remotePad'), {
    enabled: () => me === 'P1' && game?.phase !== 'coop' && game?.remoteRoute !== 'none' && controlsVisible(),
    send: (message) => { if (isOpen()) ws.send(JSON.stringify({...message, type:'remote', epoch:game?.epoch})); },
    tap: at => { ctlDown('REMOTE_LEFT', at); ctlUp('REMOTE_LEFT'); },
  });
  const held = new Map(); // pointerId -> button element
  function releasePointer(pointerId) {
    const el = held.get(pointerId);
    if (!el) return;
    held.delete(pointerId);
    el.classList.remove('down');
    ctlUp(el.dataset.ctl);
  }
  function releaseAll() {
    touchpad.reset(); roleInput.release();
    for (const id of [...held.keys()]) releasePointer(id);

    for (const c of [...sentDown]) ctlUp(c);
    sentDown.clear();
  }

  // 操作ボタンに押下・解放を付ける (操作定義から作ったボタンにも後から付ける、#60)
  function bindControl(el) {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      if (held.has(e.pointerId)) return;
      held.set(e.pointerId, el);
      el.classList.add('down');
      ctlDown(el.dataset.ctl, e.timeStamp);
    });
    el.addEventListener('pointerup', (e) => releasePointer(e.pointerId));
    el.addEventListener('pointercancel', (e) => releasePointer(e.pointerId));
    el.addEventListener('lostpointercapture', (e) => { if (held.has(e.pointerId)) stopRemote(); });
  }
  document.querySelectorAll('[data-ctl]').forEach(bindControl);
  document.querySelectorAll('[data-cmd]').forEach((el) => el.addEventListener('click', () => command(el.dataset.cmd)));
  $('startBtn').addEventListener('click', () => command(game?.phase === 'paused' ? 'RESUME' : game?.phase === 'preparing' ? 'READY' : 'PREPARE'));
  $('endBtn').addEventListener('click', () => { if (confirm('協力プレイを終了してロビーに戻りますか？')) command('END'); });
  function command(cmd) { if (isOpen()) ws.send(JSON.stringify({ type: 'command', cmd, epoch: game?.epoch })); }

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  function stopRemote() { releaseAll(); if (isOpen()) ws.send(JSON.stringify({type:'release_inputs',epoch:game?.epoch})); }
  document.addEventListener('pointercancel', stopRemote);
  portrait.addEventListener('change', stopRemote);
  window.addEventListener('orientationchange', stopRemote);
  window.addEventListener('pagehide', stopRemote);
  window.addEventListener('blur', stopRemote);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRemote();
    else if (!ws || ws.readyState > 1) { retry = 0; connect(); }
  });

  let previousLookSent = null;
  const roleInput = bindCooperativeInput({
    getGame: () => game, getRole: () => me, isOpen: () => isOpen() && controlsVisible(), ctlDown, ctlUp, onCancel: stopRemote,
    // 視点の担当: 操作定義の分担があればそれに従い、なければ P2 (#105)
    canLook: () => { const acts = myActions(game, me); return acts ? acts.some((a) => a.type === 'mouseDelta') : me === 'P2'; },
    sendLook: (msg, at) => {
      if (!fast.send(msg)) sendWs(msg);
      sent++;
      recordInputMetric('pointermove', at);
      const now = performance.now();
      if (previousLookSent !== null && now - previousLookSent < 1000) inputMetrics.add('lookInterval', now - previousLookSent);
      previousLookSent = now;
    },
  });

  // ---- 画面の切り替え ----
  const phoneView = createPhoneView({releaseAll,roleText:ROLE_TEXT,bindControl});
  function render() { phoneView({me,isHost,game}); }

  // ---- 通信テスト: 20Hz で 10 秒送る (注入はされない) ----
  $('burst').addEventListener('click', () => {
    const btn = $('burst');
    btn.disabled = true;
    const startSent = sent;
    let i = 0;
    const timer = setInterval(() => {
      sendInput({ button: 'BURST', state: i % 2 ? 'up' : 'down', burst: true });
      if (++i >= 200) {
        clearInterval(timer);
        setTimeout(() => {
          const s = stats();
          alert(`通信テスト: ${sent - startSent}件 / 未ACK ${pending.size}\nRTT 平均${s?.avg}ms p95 ${s?.p95}ms 最大${s?.max}ms\n先着: WebRTC ${via.rtc} / WS ${via.ws}`);
          btn.disabled = false;
        }, 1000);
      }
    }, 50);
  });

  connect();
})();
