import { bindCooperativeInput } from '../shared/input/cooperative.ts';
import { createFastChannel } from '../shared/transport/fast-channel.ts';
import { createInputOwners } from '../shared/input/owners.ts';
import { createPhoneSession } from '../shared/transport/session.ts';
import { decodeServerMessage } from '../shared/transport/protocol.ts';
import { recordInputMetric, inputMetrics } from '../shared/input/metrics.ts';

import { bindTouchpad, bindTouchpadSensitivity } from '../shared/input/touchpad.ts';
import { myActions } from '../shared/model/actions.ts';
import { phoneAdvice } from '../shared/model/presentation.ts';
import { fullText, END_PREPARING_LABEL, LEAVE_WIFI_HINT } from '../shared/model/phone.ts';
import {createLifetime} from '../shared/input/lifetime.ts';
import {byId} from '../shared/dom.ts';
import {createBurstRecorder,formatBurstResult} from './burst-stats.ts';
import type {BurstRecorder} from './burst-stats.ts';
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
  // 押してから実入力までの遅延の計測。計測用のビルド (RECOOPLAY_LATENCY_MEASURE=1) だけに入り、通常のビルドでは定数 false として取り除かれる。
  // 押下ごとに、触れてから送信までと ACK までの往復をホストへ送る
  const measureLatency = typeof __LATENCY_MEASURE__ !== 'undefined' && __LATENCY_MEASURE__;
  const touchAt = new Map<number,number>(); // iseq -> 指が触れた時刻
  const rtts: number[] = [];
  let sent = 0;
  let lastIseq = 0; // 直近に送った入力の iseq (通信テストが自分の入力だけを集めるため)
  let burst: BurstRecorder | null = null; // 通信テスト中だけ。1回ごとに作り直す (#259)

  const isOpen = session.isOpen;
  const OFFLINE_NOTICE_MS = 3000;
  let lostAt: number | null = null; // PC のアプリとの接続が切れた時刻。再接続 (welcome) で消す
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
        lostAt = null; phoneView.offline(false);
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
        const downControl = downs.get(msg.iseq); downs.delete(msg.iseq);
        // ホストが遅れた押下として実行しなかった (#285 Q25)。押したままの表示を残さず、指を離すよう案内する
        // 破棄された押下が今も続いているときだけ止める。離して押し直した新しい押下は止めない
        if (msg.stale && downControl && pressing.get(downControl) === msg.iseq) dropStaleDown(downControl);
        if (t0 != null) {
          pending.delete(msg.iseq);
          const touch = touchAt.get(msg.iseq); touchAt.delete(msg.iseq);
          if (measureLatency && touch != null && !msg.stale && isOpen()) session.send({type:'latency', iseq:msg.iseq, touchMs:Math.max(0, t0 - touch), rttMs:performance.now() - t0});
          via[msg.via] = (via[msg.via] || 0) + 1;
          burst?.ack(msg.iseq, performance.now() - t0, msg.via);
          rtts.push(performance.now() - t0);
          if (rtts.length > 500) rtts.shift();
        }
        renderStats();
      } else if (msg.type === 'full') {
        releaseAll();closeRtc();
        session.stop('full');
        setStatus(...session.status());
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

  // PC のアプリが終了した (#302)。次に起動したアプリへ勝手につながらないよう、再接続をやめて再読み込みを案内する
  function showHostClosed() {
    lostAt = null; phoneView.offline(false);
    setStatus(...session.status());
    phoneView.blocked(`PCのアプリが終了しました。${LEAVE_WIFI_HINT} また遊ぶときは、PCでRe:Cooplayを起動してから、このページを再読み込みしてください。`);
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
    lostAt ??= performance.now();
    const delay = session.disconnected(code);
    if (code === 4009) { showHostClosed(); return; }
    if (code === 4000) { setStatus(...session.status()); return; }
    if (code === 4001) { showReset(); return; }
    if (code === 4005) { showVersionMismatch(); return; }
    if (code === 4006) { showBadToken(); return; }
    setStatus(...session.status());
    if(delay!==null)lifetime.timeout(connect, delay);
  }

  // サーバーから 3 秒何も届かなければ、OS が切断に気づくのを待たずに張り直す (Wi-Fi が一瞬止まった時の復帰を早める)
  let previousWatchdogTick = performance.now();
  lifetime.interval(() => {
    const now = performance.now();
    const watchdogIntervalMs = now - previousWatchdogTick;
    previousWatchdogTick = now;
    // 切断が3秒続いたら、押しても届かない操作を画面全体で覆う (#302)。再接続は続ける
    if (lostAt !== null) phoneView.offline(!session.stopped && performance.now() - lostAt >= OFFLINE_NOTICE_MS);
    if (!session.silent()) return;
    if (measureLatency) {
      console.info('recooplay:ws-silence', JSON.stringify({
        atMs: Math.round(now),
        silenceMs: Math.round(session.serverSilenceMs()),
        watchdogIntervalMs: Math.round(watchdogIntervalMs),
        phase: session.game?.phase,
        hidden: document.hidden,
        rtcOpen: fast.isOpen(),
      }));
    }
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
    if (obj.state === 'down' && !obj.burst) { downs.set(msg.iseq, obj.button); pressing.set(obj.button, msg.iseq); }
    else if (obj.state === 'up') pressing.delete(obj.button);
    lastIseq = msg.iseq;
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
      if (sent && measureLatency && typeof at === 'number' && Number.isFinite(at)) {
        if (touchAt.size > 256) touchAt.clear();
        touchAt.set(lastIseq, at > 1e12 ? at - performance.timeOrigin : at);
      }
      if (navigator.vibrate) navigator.vibrate(8);
      return sent;
    },
    up: ctl => sendInput({ button: ctl, state: 'up' }),
  });
  function ctlDown(ctl: string, at: number | undefined, owner: InputOwner = ctl) { owners.press(owner, ctl, at); }
  function ctlUp(ctl: string, owner: InputOwner = ctl) { owners.release(owner, ctl); }
  const tapOwner = Symbol('remote tap');

  const touchpad = bindTouchpad($('remotePad'), {
    sensitivity: bindTouchpadSensitivity(lifetime, $<HTMLInputElement>('remotePadSensitivity'), $('remotePadSensitivityValue')),
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
  // 押下の番号 → 操作。ホストが遅れた押下を破棄したと分かるように持つ (ACKで消す)
  const downs = new Map<number,string>();
  // 操作 → 今続いている押下の番号。ホストが破棄した押下と、押し直した新しい押下を区別する
  const pressing = new Map<string,number>();
  // 入力を強制的に止めたときに画面へ触れていた指。離すまで「指を離して操作を再開」を出す (#285 Q27)
  const needLift = new Set<number>();
  function showLiftHint() { phoneView.liftHint(needLift.size > 0); }
  function holdingPointers() { return [...held.keys(), ...roleInput.activePointers()]; }
  function dropStaleDown(control: string) {
    if (!owners.isHeld(control)) return;
    for (const [id, press] of [...held]) if (press.control === control) { needLift.add(id); releasePointer(id); }
    if (owners.isHeld(control)) { for (const id of roleInput.activePointers()) needLift.add(id); roleInput.release(); }
    showLiftHint();
  }
  function releaseAll() {
    for (const id of holdingPointers()) needLift.add(id);
    touchpad.reset(); roleInput.release();
    for (const id of [...held.keys()]) releasePointer(id);

    owners.releaseAll();
    downs.clear(); pressing.clear();
    if (needLift.size) showLiftHint();
  }

  // 操作ボタンに押下・解放を付ける (操作定義から作ったボタンにも後から付ける、#60)
  const bound=new WeakMap<HTMLElement,()=>void>();
  function bindControl(el: HTMLElement) {
    const existing=bound.get(el);if(existing)return existing;
    const control=el.dataset.ctl;
    if(!control)throw new Error('Control ID is missing');
    const binding=createLifetime();
    binding.listen(el, 'pointerdown', (e) => {
      const handlerAt = measureLatency ? performance.now() : 0;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      if (held.has(e.pointerId)) return;
      held.set(e.pointerId, {element:el,control});
      el.classList.add('down');
      const previousIseq = lastIseq;
      ctlDown(control, e.timeStamp, e.pointerId);
      if (measureLatency && previousIseq !== lastIseq) {
        const eventAt = touchAt.get(lastIseq);
        const sendAt = pending.get(lastIseq);
        if (eventAt != null && sendAt != null && sendAt - eventAt > 150) {
          console.info('recooplay:pointer-delay', JSON.stringify({
            iseq: lastIseq,
            atMs: handlerAt,
            eventToHandlerMs: handlerAt - eventAt,
            handlerToSendMs: sendAt - handlerAt,
            trusted: e.isTrusted,
            hidden: document.hidden,
          }));
        }
      }
    });
    binding.listen(el, 'pointerup', (e) => releasePointer(e.pointerId));
    binding.listen(el, 'pointercancel', (e) => releasePointer(e.pointerId));
    binding.listen(el, 'lostpointercapture', (e) => { if (held.has(e.pointerId)) stopRemote(); });
    const dispose=lifetime.own(()=>{for(const [id,press] of held)if(press.element===el)releasePointer(id);binding.dispose();bound.delete(el);});
    bound.set(el,dispose);return dispose;
  }
  document.querySelectorAll<HTMLElement>('[data-ctl]').forEach(bindControl);
  document.querySelectorAll<HTMLElement>('[data-cmd]').forEach((el) => lifetime.listen(el, 'click', () => command(el.dataset.cmd!)));
  lifetime.listen($('startBtn'), 'click', () => command(session.game?.phase === 'paused' ? 'RESUME' : 'READY'));
  lifetime.listen($('endBtn'), 'click', () => {
    // 準備中は協力プレイがまだ始まっていないので、確認の文言を分ける (#427)。確認中に段階が変わったら閉じる
    const preparing = session.game?.phase === 'preparing';
    phoneView.confirm(preparing
      ? {message:'ゲームの準備をやめて、分担の画面に戻りますか？',ok:'分担に戻る',valid:remote=>remote.endVisible&&remote.endLabel===END_PREPARING_LABEL,run:()=>command('END')}
      : {message:'協力プレイを終了して、分担の画面に戻りますか？',ok:'終了して分担に戻る',valid:remote=>remote.endVisible&&remote.endLabel!==END_PREPARING_LABEL,run:()=>command('END')});
  });
  function command(cmd: string) { if (isOpen()) session.send({ type: 'command', cmd, epoch: session.game?.epoch }); }

  lifetime.listenEvent(document, 'contextmenu', (e) => e.preventDefault());
  // iseq: この端末の入力だけを解放し、他の参加者の押下とepochは変えない (#262)。lseq・cx・cy: 解放時点で送り終えた視点。
  // 解放要求より遅れて届く解放前の視点をホストが捨て、新しいタッチをこの累積値から数えるために送る
  function stopRemote() { releaseAll(); if (isOpen()) session.send({type:'release_inputs',epoch:session.game?.epoch,iseq:lastIseq,...roleInput.lookMark()}); }
  lifetime.listenEvent(document, 'pointercancel', stopRemote);
  // 止めた指が離れたら案内を消す。次の新しいタッチから入力を受け付ける (stopRemote より後に登録する)
  for (const type of ['pointerup', 'pointercancel'] as const) lifetime.listenEvent(document, type, (e) => { if (needLift.delete((e as PointerEvent).pointerId)) showLiftHint(); });
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
    const run = createBurstRecorder(); // このテストの200件だけで算出する (前回の値を引き継がない)
    burst = run;
    let i = 0;
    let stopBurst=()=>{};
    stopBurst=lifetime.interval(() => {
      if (sendInput({ button: 'BURST', state: i % 2 ? 'up' : 'down', burst: true })) run.track(lastIseq);
      if (++i >= 200) {
        stopBurst();
        lifetime.timeout(() => {
          if (burst === run) burst = null;
          alert(formatBurstResult(run.summary()));
          phoneView.telemetry({burstBusy:false});
        }, 1000);
      }
    }, 50);
  });

  connect();
  return {dispose(){stopRemote();session.stop();clearInterval(pingTimer);fast.dispose();touchpad.dispose();roleInput.dispose();lifetime.dispose();phoneView.dispose();const socket=session.detach();socket?.close();pending.clear();}};
}
