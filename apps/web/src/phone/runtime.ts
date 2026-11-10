import { bindCooperativeInput } from '../shared/input/cooperative.ts';
import { createFastChannel } from '../shared/transport/fast-channel.ts';
import { createInputOwners } from '../shared/input/owners.ts';
import { createPhoneSession } from '../shared/transport/session.ts';
import { decodeServerMessage } from '../shared/transport/protocol.ts';
import { recordInputMetric, inputMetrics } from '../shared/input/metrics.ts';

import { bindTouchpad } from '../shared/input/touchpad.ts';
import { myActions } from '../shared/model/actions.ts';
import { phoneAdvice } from '../shared/model/presentation.ts';
import { fullText } from '../shared/model/phone.ts';
import {createLifetime} from '../shared/input/lifetime.ts';
import {byId} from '../shared/dom.ts';
import type {PhoneViewBindings,PhoneView} from '../shared/contracts.ts';
import type {InputOwner} from '../shared/input/owners.ts';
import type {ButtonInput} from '../shared/transport/messages.ts';
export function startPhoneController({createView}:{createView(bindings:PhoneViewBindings):PhoneView}) {
  const lifetime=createLifetime();
  const $ = byId;
  const COLORS = { P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)' };
  const session = createPhoneSession({
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    createClientId: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36),
    now: () => performance.now(),
  });
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  const pending = new Map<number,number>(); // iseq -> 送信時刻
  const rtts: number[] = [];
  let sent = 0;

  const isOpen = session.isOpen;
  function setStatus(text: string, cls: string) {phoneView.connection(text,cls);}

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
        document.documentElement.style.setProperty('--me', COLORS[msg.slot]);
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
        phoneView.note((msg.reasons || ['操作を受け付けませんでした']).join('。'));
      } else if (msg.type === 'pong') {
        const r = performance.now() - msg.t;
        phoneView.telemetry({rtt:Math.round(r)+'ms'});
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
        releaseAll();closeRtc();
        session.stop();
        phoneView.blocked(fullText(msg.retryMs));
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
    releaseAll();closeRtc();
    session.stop('version');
    setStatus(...session.status());
    phoneView.blocked('PCのアプリと画面の版が合いません。ページを再読み込みしてください。');
  }

  // 同じ clientId の枠があるのにトークンが合わない (保存したトークンが消えた等)。PC でリセットするまで参加できない
  function showBadToken() {
    releaseAll();closeRtc();
    session.stop('token');
    setStatus(...session.status());
    phoneView.blocked('この端末の参加情報を確認できませんでした。少し待ってから再読み込みしてください。直らないときはホストに伝えてください。');
  }

  // PC でリセットすると全員が切断される。自動で再接続せず、参加し直す人だけが再読み込みする (#213)
  function showReset() {
    setStatus(...session.status());
    phoneView.blocked('PCでリセットされました。参加するときはページを再読み込みしてください。');
  }

  function onDisconnected(code: number) {
    clearInterval(pingTimer);
    releaseAll();
    closeRtc();
    const delay = session.disconnected(code);
    if (code === 4000) { setStatus(...session.status()); return; }
    if (code === 4001) { showReset(); return; }
    if (code === 4005) { showVersionMismatch(); return; }
    if (code === 4006) { showBadToken(); return; }
    setStatus(...session.status());
    if(delay!==null)lifetime.timeout(connect, delay);
  }

  // サーバーから 3 秒何も届かなければ、OS が切断に気づくのを待たずに張り直す (Wi-Fi が一瞬止まった時の復帰を早める)
  lifetime.interval(() => {
    if (!session.silent()) return;
    const old = session.detach();
    try { old?.close(); } catch {}
    onDisconnected(1006);
  }, 500);

  // 状態・UIとWebRTCの生成破棄を分離する。速達便の契約は変更しない。
  const rtcRtts: number[] = [], via = {ws:0,rtc:0};
  const fast = createFastChannel({
    signal: msg => { if (isOpen()) session.send(msg); },
    enabled: isOpen, getPhase: () => session.game?.phase,
    onRtt: value => { rtcRtts.push(value); if (rtcRtts.length > 300) rtcRtts.shift(); },
    onPath: text => { phoneView.telemetry({path:text}); },
  });
  const rtcOpen = fast.isOpen, startRtc = fast.start, closeRtc = fast.close, onRtcSignal = fast.signal;

  function summarize(arr: number[]) {
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
    phoneView.telemetry({advice:phoneAdvice(s),sent,unacked:pending.size,...(s?{rttAvg:`${s.avg}/${s.max}ms`}:{})});
  }
  function sendPing() {
    renderStats();
    phoneView.telemetry({inputMetrics:JSON.stringify(inputMetrics.summary())});
    if (isOpen()) session.send({ type: 'ping', t: performance.now(), stats: stats() });
  }

  function sendWs(obj: object) {
    if (!isOpen()) return false;
    session.send(session.sequenced(obj));
    return true;
  }
  // 入力 (押下/解放): WebSocket (確実) と WebRTC (速い) の両方に同じ番号で送る
  const portrait = matchMedia('(orientation: portrait)');
  const controlsVisible = () => portrait.matches && !document.hidden && !$<HTMLDialogElement>('phoneDiagnostics').open;
  function sendInput(obj: ButtonInput) {
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
  function ctlDown(ctl: string, at: number | undefined, owner: InputOwner = ctl) { owners.press(owner, ctl, at); }
  function ctlUp(ctl: string, owner: InputOwner = ctl) { owners.release(owner, ctl); }
  const tapOwner = Symbol('remote tap');

  const touchpad = bindTouchpad($('remotePad'), {
    enabled: () => session.me === 'P1' && session.game?.phase !== 'coop' && session.game?.remoteRoute !== 'none' && controlsVisible(),
    send: (message) => { if (isOpen()) session.send({...message, type:'remote', epoch:session.game?.epoch}); },
    tap: at => { ctlDown('REMOTE_LEFT', at, tapOwner); ctlUp('REMOTE_LEFT', tapOwner); },
    // 2本指のタップは右クリック (#122)
    rightTap: at => { ctlDown('REMOTE_RIGHT', at, tapOwner); ctlUp('REMOTE_RIGHT', tapOwner); },
  });
  const held = new Map<number,{element:HTMLElement;control:string}>();
  function releasePointer(pointerId: number) {
    const press = held.get(pointerId);
    if (!press) return;
    const el=press.element;
    held.delete(pointerId);
    if (![...held.values()].some(value=>value.element===el)) el.classList.remove('down');
    ctlUp(press.control, pointerId);
  }
  function releaseAll() {
    touchpad.reset(); roleInput.release();
    for (const id of [...held.keys()]) releasePointer(id);

    owners.releaseAll();
  }

  // 操作ボタンに押下・解放を付ける (操作定義から作ったボタンにも後から付ける、#60)
  const bound=new WeakMap<HTMLElement,()=>void>();
  function bindControl(el: HTMLElement) {
    const existing=bound.get(el);if(existing)return existing;
    const control=el.dataset.ctl;
    if(!control)throw new Error('Control ID is missing');
    const binding=createLifetime();
    binding.listen(el, 'pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      if (held.has(e.pointerId)) return;
      held.set(e.pointerId, {element:el,control});
      el.classList.add('down');
      ctlDown(control, e.timeStamp, e.pointerId);
    });
    binding.listen(el, 'pointerup', (e) => releasePointer(e.pointerId));
    binding.listen(el, 'pointercancel', (e) => releasePointer(e.pointerId));
    binding.listen(el, 'lostpointercapture', (e) => { if (held.has(e.pointerId)) stopRemote(); });
    const dispose=lifetime.own(()=>{for(const [id,press] of held)if(press.element===el)releasePointer(id);binding.dispose();bound.delete(el);});
    bound.set(el,dispose);return dispose;
  }
  document.querySelectorAll<HTMLElement>('[data-ctl]').forEach(bindControl);
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach((el) => lifetime.listen(el, 'click', () => command(el.dataset.cmd!)));
  lifetime.listen($('startBtn'), 'click', () => command(session.game?.phase === 'paused' ? 'RESUME' : session.game?.phase === 'preparing' ? 'READY' : 'PREPARE'));
  lifetime.listen($('endBtn'), 'click', () => phoneView.confirm({message:'協力プレイを終了して、分担の画面に戻りますか？',ok:'終了して分担に戻る',valid:remote=>remote.endVisible,run:()=>command('END')}));
  function command(cmd: string) { if (isOpen()) session.send({ type: 'command', cmd, epoch: session.game?.epoch }); }

  lifetime.listenEvent(document, 'contextmenu', (e) => e.preventDefault());
  function stopRemote() { releaseAll(); if (isOpen()) session.send({type:'release_inputs',epoch:session.game?.epoch}); }
  lifetime.listenEvent(document, 'pointercancel', stopRemote);
  lifetime.listenEvent(portrait, 'change', stopRemote);
  lifetime.listenEvent(window, 'orientationchange', stopRemote);
  lifetime.listenEvent(window, 'pagehide', stopRemote);
  lifetime.listenEvent(window, 'blur', stopRemote);
  lifetime.listenEvent(document, 'visibilitychange', () => {
    if (document.hidden) stopRemote();
    else if (!session.socket || session.socket.readyState > 1) { session.resetRetry(); connect(); }
  });

  let previousLookSent: number | null = null;
  const roleInput = bindCooperativeInput({
    getGame: () => session.game, getRole: () => session.me, isOpen: () => isOpen() && controlsVisible(), ctlDown, ctlUp, onCancel: stopRemote,
    // 視点の担当: 操作定義の分担があればそれに従い、なければ P2 (#105)
    // 固定の画面では、担当 (入れ替え後の席、#47) が視点 (P2 の表) の人
    canLook: () => { const acts = myActions(session.game, session.me); return acts ? acts.some((a) => a.type === 'mouseDelta') : ((session.me ? session.game?.roleOf?.[session.me] : undefined) || session.me) === 'P2'; },
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
  const phoneView = createView({releaseAll,onDiagnosticsOpen:stopRemote,bindControl,bindStick:roleInput.setGeneratedStick,bindLook:roleInput.bindLook,onTransferHost:to=>sendWs({type:'transfer_host',to,epoch:session.game?.epoch}),onRoleOk:()=>sendWs({type:'role_ok',epoch:session.game?.epoch})});
  function render() { phoneView(session.view()); }

  // ---- 通信テスト: 20Hz で 10 秒送る (注入はされない) ----
  lifetime.listen($('burst'), 'click', () => {
    phoneView.telemetry({burstBusy:true});
    const startSent = sent;
    let i = 0;
    let stopBurst=()=>{};
    stopBurst=lifetime.interval(() => {
      sendInput({ button: 'BURST', state: i % 2 ? 'up' : 'down', burst: true });
      if (++i >= 200) {
        stopBurst();
        lifetime.timeout(() => {
          const s = stats();
          alert(`通信テスト: ${sent - startSent}件 / 未ACK ${pending.size}\nRTT 平均${s?.avg}ms p95 ${s?.p95}ms 最大${s?.max}ms\n先着: WebRTC ${via.rtc} / WS ${via.ws}`);
          phoneView.telemetry({burstBusy:false});
        }, 1000);
      }
    }, 50);
  });

  connect();
  return {dispose(){stopRemote();session.stop();clearInterval(pingTimer);fast.dispose();touchpad.dispose();roleInput.dispose();lifetime.dispose();phoneView.dispose();const socket=session.detach();socket?.close();pending.clear();}};
}
