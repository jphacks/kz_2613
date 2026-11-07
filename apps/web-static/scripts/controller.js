import { createPhoneView } from './phone-view.js';
import { bindCooperativeInput } from './cooperative-input.js';
import { createFastChannel } from './transport.js';
import { createInputOwners } from './input-owners.js';
import { createPhoneSession } from './phone-session.js';
import { decodeServerMessage } from './protocol.js';
import { recordInputMetric, inputMetrics } from './ui-metrics.js';

import { bindTouchpad } from './touchpad.js';
import { myActions } from './generated-controls.js';
import { phoneAdvice } from '../app-view.js';
(() => {
  const $ = (id) => document.getElementById(id);
  const COLORS = { P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)' };
  const session = createPhoneSession({
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    createClientId: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36),
    now: () => performance.now(),
  });
  let pingTimer = null;
  const pending = new Map(); // iseq -> 送信時刻
  const rtts = [];
  let sent = 0;

  const isOpen = session.isOpen;
  function setStatus(text, cls) { const el = $('status'); el.textContent = text; el.className = 'pill ' + cls; document.body.dataset.connection=cls; }

  function connect() {
    if (session.stopped) return;
    session.connecting();
    setStatus(...session.status());
    const sock = new WebSocket(`ws://${location.host}/ws`);
    session.attach(sock);
    sock.onopen = () => {
      if (!session.current(sock)) return;
      pending.clear();
      sock.send(JSON.stringify(session.open(navigator.userAgent)));
      clearInterval(pingTimer);
      pingTimer = setInterval(sendPing, 1000);
    };
    sock.onclose = (ev) => { if (session.current(sock)) onDisconnected(ev.code); };
    sock.onerror = () => {};
    sock.onmessage = (ev) => {
      if (!session.current(sock)) return;
      try {
      session.received();
      const msg = decodeServerMessage(ev.data);
      // 壊れた状態で操作を続けず、通常の切断経路で保持を失効させて再接続する。
      if (!msg) { releaseAll(); sock.close(); return; }
      if (msg.type === 'rtc-answer' || msg.type === 'rtc-cand') { onRtcSignal(msg); return; }
      if (msg.type === 'welcome') {
        session.authenticate(msg);
        roleInput.resetEpoch();
        startRtc();
        session.welcome(msg);
        document.documentElement.style.setProperty('--me', COLORS[session.me]);
        $('slot').textContent = session.me;
        $('role').innerHTML = `<b>${msg.role}${session.isHost ? '（ホスト）' : ''}</b>分担はPCの画面で決めます`;
        setStatus(...session.status());
        render();
      } else if (msg.type === 'game') {
        const epochChanged = session.updateGame(msg.game);
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
        session.stop();
        $('full').style.display = 'flex';
      } else if (msg.type === 'error' && msg.code === 'protocol_version') {
        showVersionMismatch();
      } else if (msg.type === 'error' && msg.code === 'bad_token') {
        showBadToken();
      }
      } catch {
        // 検証を通った通知でも適用・描画に失敗したら、保持を残して操作を続けない。
        try { releaseAll(); } finally { sock.close(); }
      }
    };
  }

  // 古い画面がキャッシュされているなど、PC のホストと通信契約の版が違う。再接続しても直らないので止める
  function showVersionMismatch() {
    session.stop('version');
    setStatus(...session.status());
    $('fullMessage').textContent = 'PCのアプリと画面の版が合いません。ページを再読み込みしてください。';
    $('full').style.display = 'flex';
  }

  // 同じ clientId の枠があるのにトークンが合わない (保存したトークンが消えた等)。PC でリセットするまで参加できない
  function showBadToken() {
    session.stop('token');
    setStatus(...session.status());
    $('fullMessage').textContent = 'この端末の参加情報をPCで確認できませんでした。PC側でリセットしてから再読み込みしてください。';
    $('full').style.display = 'flex';
  }

  // PC でリセットすると全員が切断される。自動で再接続せず、参加し直す人だけが再読み込みする (#213)
  function showReset() {
    setStatus(...session.status());
    $('fullMessage').textContent = 'PCでリセットされました。参加するときはページを再読み込みしてください。';
    $('full').style.display = 'flex';
  }

  function onDisconnected(code) {
    clearInterval(pingTimer);
    releaseAll();
    closeRtc();
    const delay = session.disconnected(code);
    if (code === 4000) { setStatus(...session.status()); return; }
    if (code === 4001) { showReset(); return; }
    if (code === 4005) { showVersionMismatch(); return; }
    if (code === 4006) { showBadToken(); return; }
    setStatus(...session.status());
    setTimeout(connect, delay);
  }

  // サーバーから 3 秒何も届かなければ、OS が切断に気づくのを待たずに張り直す (Wi-Fi が一瞬止まった時の復帰を早める)
  setInterval(() => {
    if (!session.silent()) return;
    const old = session.detach();
    try { old.close(); } catch {}
    onDisconnected(1006);
  }, 500);

  // 状態・UIとWebRTCの生成破棄を分離する。速達便の契約は変更しない。
  const rtcRtts = [], via = {ws:0,rtc:0};
  const fast = createFastChannel({
    signal: msg => { if (isOpen()) session.socket.send(JSON.stringify(msg)); },
    enabled: isOpen, getPhase: () => session.game?.phase,
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
    // 自分の通信が悪いときの対処の案内 (#70)。接続・診断の画面に出す
    $('phoneNetAdvice').textContent = phoneAdvice(s);
    $('sent').textContent = sent;
    $('unacked').textContent = pending.size;
    if (s) $('rttAvg').textContent = `${s.avg}/${s.max}ms`;
  }
  function sendPing() {
    renderStats();
    $('inputMetrics').textContent = JSON.stringify(inputMetrics.summary());
    if (isOpen()) session.socket.send(JSON.stringify({ type: 'ping', t: performance.now(), stats: stats() }));
  }

  function sendWs(obj) {
    if (!isOpen()) return false;
    session.socket.send(JSON.stringify(session.sequenced(obj)));
    return true;
  }
  // 入力 (押下/解放): WebSocket (確実) と WebRTC (速い) の両方に同じ番号で送る
  const portrait = matchMedia('(orientation: portrait)');
  const controlsVisible = () => portrait.matches && !document.hidden && !$('phoneDiagnostics').open;
  function sendInput(obj) {
    // 非注入の通信テストは診断内でも送る。非表示・横向きでの押下抑止は維持する。
    const visible = obj.burst ? portrait.matches && !document.hidden : controlsVisible();
    if (obj.state === 'down' && !visible) return false;
    if (!isOpen()) return false;
    // epoch: 押した時点の進行状態。PC は状態が変わった後に届いた古い入力を処理しない
    const msg = session.input(obj);
    pending.set(msg.iseq, msg.t);
    sent++;
    fast.send(msg);
    sendWs(msg);
    renderStats();
    return true;
  }

  // ---- 操作の押下 / 解放 ----
  const owners = createInputOwners({
    down: (ctl, at) => {
      const sent = sendInput({ button: ctl, state: 'down' });
      if (sent) recordInputMetric('pointerdown', at);
      if (navigator.vibrate) navigator.vibrate(8);
      return sent;
    },
    up: ctl => sendInput({ button: ctl, state: 'up' }),
  });
  function ctlDown(ctl, at, owner = ctl) { owners.press(owner, ctl, at); }
  function ctlUp(ctl, owner = ctl) { owners.release(owner, ctl); }
  const tapOwner = Symbol('remote tap');

  const touchpad = bindTouchpad($('remotePad'), {
    enabled: () => session.me === 'P1' && session.game?.phase !== 'coop' && session.game?.remoteRoute !== 'none' && controlsVisible(),
    send: (message) => { if (isOpen()) session.socket.send(JSON.stringify({...message, type:'remote', epoch:session.game?.epoch})); },
    tap: at => { ctlDown('REMOTE_LEFT', at, tapOwner); ctlUp('REMOTE_LEFT', tapOwner); },
    // 2本指のタップは右クリック (#122)
    rightTap: at => { ctlDown('REMOTE_RIGHT', at, tapOwner); ctlUp('REMOTE_RIGHT', tapOwner); },
  });
  const held = new Map(); // pointerId -> button element
  function releasePointer(pointerId) {
    const el = held.get(pointerId);
    if (!el) return;
    held.delete(pointerId);
    if (![...held.values()].includes(el)) el.classList.remove('down');
    ctlUp(el.dataset.ctl, pointerId);
  }
  function releaseAll() {
    touchpad.reset(); roleInput.release();
    for (const id of [...held.keys()]) releasePointer(id);

    owners.releaseAll();
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
      ctlDown(el.dataset.ctl, e.timeStamp, e.pointerId);
    });
    el.addEventListener('pointerup', (e) => releasePointer(e.pointerId));
    el.addEventListener('pointercancel', (e) => releasePointer(e.pointerId));
    el.addEventListener('lostpointercapture', (e) => { if (held.has(e.pointerId)) stopRemote(); });
  }
  document.querySelectorAll('[data-ctl]').forEach(bindControl);
  document.querySelectorAll('[data-cmd]').forEach((el) => el.addEventListener('click', () => command(el.dataset.cmd)));
  $('startBtn').addEventListener('click', () => command(session.game?.phase === 'paused' ? 'RESUME' : session.game?.phase === 'preparing' ? 'READY' : 'PREPARE'));
  $('endBtn').addEventListener('click', () => { if (confirm('協力プレイを終了してロビーに戻りますか？')) command('END'); });
  function command(cmd) { if (isOpen()) session.socket.send(JSON.stringify({ type: 'command', cmd, epoch: session.game?.epoch })); }

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  function stopRemote() { releaseAll(); if (isOpen()) session.socket.send(JSON.stringify({type:'release_inputs',epoch:session.game?.epoch})); }
  document.addEventListener('pointercancel', stopRemote);
  portrait.addEventListener('change', stopRemote);
  window.addEventListener('orientationchange', stopRemote);
  window.addEventListener('pagehide', stopRemote);
  window.addEventListener('blur', stopRemote);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRemote();
    else if (!session.socket || session.socket.readyState > 1) { session.resetRetry(); connect(); }
  });

  let previousLookSent = null;
  const roleInput = bindCooperativeInput({
    getGame: () => session.game, getRole: () => session.me, isOpen: () => isOpen() && controlsVisible(), ctlDown, ctlUp, onCancel: stopRemote,
    // 視点の担当: 操作定義の分担があればそれに従い、なければ P2 (#105)
    // 固定の画面では、担当 (入れ替え後の席、#47) が視点 (P2 の表) の人
    canLook: () => { const acts = myActions(session.game, session.me); return acts ? acts.some((a) => a.type === 'mouseDelta') : (session.game?.roleOf?.[session.me] || session.me) === 'P2'; },
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
  const phoneView = createPhoneView({releaseAll,onDiagnosticsOpen:stopRemote,bindControl,bindStick:roleInput.setGeneratedStick,onRoleOk:()=>sendWs({type:'role_ok',epoch:session.game?.epoch})});
  function render() { phoneView(session.view()); }

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
