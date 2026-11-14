// ブラウザー側の実モジュールを実行する。DOM描画・実機・OS入力の受入ではない。
import assert from 'node:assert/strict';
import { controllerHarness } from './fixtures/phone-harness.mjs';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`合格: ${name}`); }
const states = (h, button) => h.inputs().filter(message => message.button === button).map(message => message.state);

export async function reproduceSharedPointerRelease() {
  const h = controllerHarness(); await h.ready();
  const button = h.control('act:attack');
  button.fire('pointerdown', { pointerId: 1 }); button.fire('pointerdown', { pointerId: 2 });
  button.fire('pointerup', { pointerId: 1 });
  assert.deepEqual(states(h, 'act:attack'), ['down'], '別の指が同じ操作を保持中にupを送ってはいけない');
  assert(button.classList.contains('down'), '同じボタンの別の指が保持中は押下表示を維持する');
  button.fire('pointerup', { pointerId: 2 });
  assert.deepEqual(states(h, 'act:attack'), ['down', 'up']);
  assert(!button.classList.contains('down'));
}

if (process.argv.includes('--repro-shared-pointer')) {
  await reproduceSharedPointerRelease();
} else {
  await test('分担操作開始: ロビーから現在のepochでREADYを1回送る (#440)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'lobby', epoch: 7, canReady: true });
    const socket = h.sockets[0];
    h.el('startBtn').fire('click');
    assert.deepEqual(socket.sent.filter(message => message.type === 'command'),
      [{ type: 'command', cmd: 'READY', epoch: 7 }]);
  });
  await test('通常ボタン: 同じ指の重複イベントと複数操作はdown/upを各1組だけ送る', async () => {
    const h = controllerHarness(); await h.ready();
    const attack = h.control('act:attack'), jump = h.control('act:jump');
    attack.fire('pointerdown', { pointerId: 1 }); attack.fire('pointerdown', { pointerId: 1 });
    jump.fire('pointerdown', { pointerId: 2 }); attack.fire('pointerup', { pointerId: 1 });
    attack.fire('pointerup', { pointerId: 1 }); jump.fire('pointerup', { pointerId: 2 });
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up']); assert.deepEqual(states(h, 'act:jump'), ['down', 'up']);
    assert.deepEqual(h.inputs().map(message => message.iseq), [1, 2, 3, 4]);
  });
  await test('同一操作2指保持: 最後の保持元が離れるまでupせず、最後に1組だけ解放する', reproduceSharedPointerRelease);
  await test('リモコン: ボタン保持中の同じクリックのタップは保持を早期解放しない', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' });
    const button = h.control('REMOTE_LEFT'), pad = h.el('remotePad');
    button.fire('pointerdown', { pointerId: 1 });
    pad.fire('pointerdown', { pointerId: 2 }); pad.fire('pointerup', { pointerId: 2, timeStamp: 1100 });
    assert.deepEqual(states(h, 'REMOTE_LEFT'), ['down']);
    button.fire('pointerup', { pointerId: 1 }); assert.deepEqual(states(h, 'REMOTE_LEFT'), ['down', 'up']);
  });
  await test('キャンセル: pointercancel/lostpointercaptureは全操作を解放し重複upを送らない', async () => {
    for (const event of ['pointercancel', 'lostpointercapture']) {
      const h = controllerHarness(); await h.ready();
      const attack = h.control('act:attack'), jump = h.control('act:jump');
      attack.fire('pointerdown', { pointerId: 1 }); jump.fire('pointerdown', { pointerId: 2 });
      attack.fire(event, { pointerId: 1 }); jump.fire('pointerup', { pointerId: 2 });
      assert.deepEqual(states(h, 'act:attack'), ['down', 'up']); assert.deepEqual(states(h, 'act:jump'), ['down', 'up']);
      assert.equal(h.messages().filter(message => message.type === 'release_inputs').length, 1);
    }
  });
  await test('本人の解放: 送り終えた視点の番号と累積値を載せ、未送信の移動は捨てる (#262 レビュー)', async () => {
    const h = controllerHarness(); await h.ready(); const pad = h.el('pad');
    pad.fire('pointerdown'); pad.fire('pointermove', { clientX: 110, clientY: 95 }); h.advance(33);
    pad.fire('pointermove', { clientX: 140, clientY: 95 }); // 送る前に blur する移動
    h.window.fire('blur');
    const looks = h.messages().filter(m => m.type === 'look'), release = h.messages().find(m => m.type === 'release_inputs');
    assert.deepEqual({ lseq: release.lseq, cx: release.cx, cy: release.cy }, { lseq: looks.at(-1).lseq, cx: looks.at(-1).cx, cy: looks.at(-1).cy });
    h.advance(100); assert.equal(h.messages().filter(m => m.type === 'look').length, looks.length, '未送信の移動を解放後に送らない');
  });
  await test('停止境界: 非表示・回転・pagehide・blurで全解放し、非表示/横向きでは新規押下しない', async () => {
    for (const reason of ['hidden', 'portrait', 'orientationchange', 'pagehide', 'blur']) {
      const h = controllerHarness(); await h.ready();
      h.control('act:attack').fire('pointerdown');
      if (reason === 'hidden') { h.document.hidden = true; h.document.fire('visibilitychange'); }
      else if (reason === 'portrait') { h.portrait.matches = false; h.portrait.fire('change'); }
      else h.window.fire(reason);
      assert.deepEqual(states(h, 'act:attack'), ['down', 'up']);
      assert.equal(h.messages().filter(message => message.type === 'release_inputs').length, 1);
      if (reason === 'hidden' || reason === 'portrait') {
        h.control('act:attack').fire('pointerdown', { pointerId: 2 });
        assert.deepEqual(states(h, 'act:attack'), ['down', 'up']);
      }
    }
  });
  await test('診断: ダイアログを開く前に全解放し、診断中はボタンと視点を送信しない', async () => {
    const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
    h.el('phoneSettingsBtn').fire('click');
    assert(h.el('phoneDiagnostics').open); assert.deepEqual(states(h, 'act:attack'), ['down', 'up']);
    const before = h.inputs().length; h.control('act:jump').fire('pointerdown', { pointerId: 2 });
    h.el('pad').fire('pointerdown', { pointerId: 3 }); h.el('pad').fire('pointermove', { pointerId: 3, clientX: 180 }); h.advance(40);
    assert.equal(h.inputs().length, before); assert(!h.messages().some(message => message.type === 'look'));
  });
  await test('epoch変更: 旧押下と未送信視点を破棄し、解放後に新しいepochでのみ押下する', async () => {
    const h = controllerHarness(); await h.ready();
    h.control('act:attack').fire('pointerdown'); h.el('pad').fire('pointerdown', { pointerId: 2 });
    h.el('pad').fire('pointermove', { pointerId: 2, clientX: 180 });
    h.sockets[0].receive({ type: 'game', game: h.game({ epoch: 8 }) }); h.advance(40);
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up']); assert.equal(h.inputs().at(-1).epoch, 8);
    assert(!h.messages().some(message => message.type === 'look'));
    h.control('act:attack').fire('pointerdown', { pointerId: 3 }); assert.equal(h.inputs().at(-1).epoch, 8);
  });
  await test('再描画: ゲーム・担当・実キーの変更で生成前の押下を解放する', async () => {
    for (const change of [{ title: 'other', profile: null }, { assigned: { P1: ['jump'], P2: ['attack'] } }, { keys: { actions: { attack: { label: 'R' } } } }]) {
      const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
      const next = h.game(change); if (!next.profile) next.profile = { ...h.game().profile, id: 'other' };
      h.sockets[0].receive({ type: 'game', game: next });
      assert.deepEqual(states(h, 'act:attack'), ['down', 'up']);
    }
  });
  await test('スティック: 斜めの2操作、他の指の無視、画面切替で残留操作なし', async () => {
    const h = controllerHarness(); await h.ready(); const stick = h.document.querySelectorAll('.gen-stick')[0];
    stick.fire('pointerdown', { pointerId: 1, clientX: 190, clientY: 10 });
    stick.fire('pointermove', { pointerId: 2, clientX: 100, clientY: 100 });
    assert.deepEqual(states(h, 'act:forward'), ['down']); assert.deepEqual(states(h, 'act:right'), ['down']);
    h.sockets[0].receive({ type: 'game', game: h.game({ phase: 'paused' }) });
    assert.deepEqual(states(h, 'act:forward'), ['down', 'up']); assert.deepEqual(states(h, 'act:right'), ['down', 'up']);
  });
  await test('視点: 33ms周期で累積値を送り、キャンセル/epoch変更で旧移動と連番を破棄する', async () => {
    const h = controllerHarness(); await h.ready(); const pad = h.el('pad');
    pad.fire('pointerdown'); pad.fire('pointermove', { clientX: 110, clientY: 95 }); h.advance(33);
    let looks = h.messages().filter(message => message.type === 'look');
    assert.deepEqual(looks.map(({ lseq, epoch, cx, cy }) => ({ lseq, epoch, cx, cy })), [{ lseq: 1, epoch: 7, cx: 20, cy: -10 }]);
    pad.fire('pointermove', { clientX: 120 }); pad.fire('pointercancel'); h.advance(33);
    assert.equal(h.messages().filter(message => message.type === 'look').length, 1);
    h.sockets[0].receive({ type: 'game', game: h.game({ epoch: 8 }) });
    pad.fire('pointerdown', { pointerId: 2 }); pad.fire('pointermove', { pointerId: 2, clientX: 103 }); h.advance(33);
    looks = h.messages().filter(message => message.type === 'look'); assert.equal(looks.at(-1).lseq, 1); assert.equal(looks.at(-1).cx, 6); assert.equal(looks.at(-1).epoch, 8);
  });
  await test('タッチパッド: 上限付き移動・キャンセルで未送信量を捨て、タップをクリック1組にする', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' }); const pad = h.el('remotePad');
    pad.fire('pointerdown'); pad.fire('pointermove', { clientX: 900, clientY: 100 }); h.advance(34);
    assert.equal(h.messages().find(message => message.type === 'remote' && message.kind === 'move').dx, 120);
    pad.fire('pointermove', { clientX: 1000 }); pad.fire('pointercancel'); h.advance(34);
    assert.equal(h.messages().filter(message => message.type === 'remote' && message.kind === 'move').length, 1);
    pad.fire('pointerdown', { pointerId: 2, timeStamp: 1100 }); pad.fire('pointerup', { pointerId: 2, timeStamp: 1200 });
    assert.deepEqual(states(h, 'REMOTE_LEFT'), ['down', 'up']);
  });
  await test('通信: WS/RTCは同じiseq・epochを送り、RTC閉鎖後もWSで継続する', async () => {
    const h = controllerHarness(); await h.ready(); const dc = h.peers[0].channel; dc.readyState = 'open'; dc.onopen();
    h.control('act:attack').fire('pointerdown'); h.control('act:attack').fire('pointerup');
    const rtc = dc.sent.filter(message => message.type === 'input');
    assert.deepEqual(JSON.parse(JSON.stringify(rtc)), h.inputs().map(({ seq, ...message }) => message));
    assert.deepEqual(h.inputs().map(message => message.seq), [1, 2]);
    dc.readyState = 'closed'; dc.onclose(); h.control('act:jump').fire('pointerdown', { pointerId: 2 });
    assert.equal(h.inputs().at(-1).iseq, 3); assert.equal(dc.sent.filter(message => message.type === 'input').length, 2);
  });
  await test('通信断/再接続: 保持を失効しtoken・nextIseqを引き継ぎ、旧Socketのgame/closeを無視する', async () => {
    const h = controllerHarness(); await h.ready(); const old = h.sockets[0];
    h.control('act:attack').fire('pointerdown'); old.close(); h.advance(250);
    const current = h.sockets.at(-1); current.open();
    const hello = current.sent.find(message => message.type === 'hello'); assert.equal(hello.token, 'test-token'); assert.equal(hello.nextIseq, 2);
    current.receive({ type: 'welcome', slot: 'P1', role: 'ホスト', isHost: true, token: 'test-token', reconnected: true });
    current.receive({ type: 'game', game: h.game({ epoch: 8 }) });
    old.receive({ type: 'game', game: h.game({ phase: 'paused', epoch: 99 }) }); old.onclose({ code: 4000 });
    assert.equal(h.document.body.dataset.phase, 'coop'); assert.equal(h.el('status').textContent, '再接続OK');
    h.control('act:attack').fire('pointerup'); assert.equal(current.sent.filter(message => message.type === 'input').length, 0);
    h.control('act:attack').fire('pointerdown', { pointerId: 2 }); assert.equal(current.sent.at(-1).epoch, 8); assert.equal(current.sent.at(-1).iseq, 2);
  });
  await test('無応答: 3秒の監視で旧通信と保持を破棄し、再接続後に旧押下を復元しない', async () => {
    const h = controllerHarness(); await h.ready(); const old = h.sockets[0];
    h.control('act:attack').fire('pointerdown'); h.advance(3000);
    assert.equal(old.readyState, 3); assert(h.peers[0].closed);
    h.advance(250); assert.equal(h.sockets.length, 2);
    const current = h.sockets[1]; current.open();
    current.receive({ type: 'welcome', slot: 'P1', role: 'ホスト', isHost: true, token: 'test-token' });
    current.receive({ type: 'game', game: h.game({ epoch: 8 }) });
    h.control('act:attack').fire('pointerup'); assert.equal(current.sent.filter(message => message.type === 'input').length, 0);
  });
  await test('終了コード: 接続置換・版不一致・token不一致では再試行せず保持を失効する', async () => {
    for (const code of [4000, 4001, 4005, 4006]) {
      const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
      h.sockets[0].close(code); h.advance(6000);
      assert.equal(h.sockets.length, 1); assert(h.peers[0].closed);
      h.control('act:attack').fire('pointerup'); assert.equal(h.inputs().length, 1);
    }
  });
  await test('PCアプリの終了 (4009): 再接続せず、画面全体で終了と再読み込みを案内する (#302)', async () => {
    const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
    h.sockets[0].close(4009); h.advance(10000);
    assert.equal(h.sockets.length, 1, '終了したPCアプリへ再接続しない'); assert(h.peers[0].closed);
    assert.equal(h.el('full').style.display, 'flex'); assert.match(h.el('fullMessage').textContent, /PCのアプリが終了しました.*再読み込み/);
    assert.match(h.el('fullMessage').textContent, /Wi-Fi設定で普段使うネットワークに戻/);
    assert.equal(h.el('status').textContent, 'PCアプリが終了しました'); assert(h.el('offline').hidden, '終了の案内と再接続中の表示を重ねない');
    h.control('act:attack').fire('pointerup'); assert.equal(h.inputs().length, 1);
  });
  await test('通信断: 3秒続いたら操作を覆い、再接続しても welcome までは覆ったまま (#302)', async () => {
    const h = controllerHarness(); await h.ready();
    h.sockets[0].close(1006); h.advance(2400);
    assert(h.el('offline').hidden, '短い切断では覆わない');
    h.advance(1200); assert(!h.el('offline').hidden, '3秒続いたら覆う');
    const next = h.sockets.at(-1); assert.notEqual(next, h.sockets[0], '再接続を続ける');
    next.open(); h.advance(100); assert(!h.el('offline').hidden);
    next.receive({ type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test-token' });
    assert(h.el('offline').hidden, '再接続したら消す');
  });
  await test('満員: 切断した人の枠を保持しているだけなら、空く見込みの秒数を案内する (#297)', async () => {
    const h = controllerHarness(); await h.ready();
    h.sockets[0].receive({ type: 'full', retryMs: 6200 });
    assert.equal(h.el('full').style.display, 'flex');
    assert.match(h.el('fullMessage').textContent, /再接続を待っている.*7秒ほど待って/);
    assert.doesNotMatch(h.el('fullMessage').textContent, /満員/);
    const g = controllerHarness(); await g.ready();
    g.sockets[0].receive({ type: 'full', retryMs: null });
    assert.equal(g.el('fullMessage').textContent, undefined, '保持中の枠がなければ画面既定の「満員」の案内');
  });
  await test('WebRTC: 旧候補と非同期旧Blob通知が現在の接続へ反映されない', async () => {
    const h = controllerHarness(); await h.ready(); const first = h.peers[0]; first.channel.readyState = 'open';
    let finish;
    const blob=new Blob([]);blob.text=()=>new Promise(resolve=>{finish=resolve;});
    const delayed = first.channel.onmessage({data:blob});
    h.sockets[0].close(); h.advance(250); const socket = h.sockets.at(-1); socket.open();
    socket.receive({ type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test-token' });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    first.onicecandidate({ candidate: { candidate: 'old', sdpMid: '0' } });
    finish(JSON.stringify({ type: 'kpong', t: 0 })); await delayed;
    assert(!socket.sent.some(message => message.type === 'rtc-cand' && message.cand === 'old')); assert(first.closed);
    socket.receive({ type: 'pong', t: 900 }); h.advance(1000);
    assert.equal(socket.sent.filter(message => message.type === 'ping').at(-1).stats.rtc, null, '旧BlobのRTTを新接続へ混ぜない');
    assert.deepEqual(JSON.parse(JSON.stringify(h.peers[1].config)), { iceServers: [] });
    assert.deepEqual(JSON.parse(JSON.stringify(h.peers[1].options)), { ordered: false, maxRetransmits: 0 });
  });
  await test('復旧: 押したままの指で通信が切れても、再接続後に旧押下・視点を再開せず、離すまで案内を出す (#285 Q26/Q27)', async () => {
    const h = controllerHarness(); await h.ready(); const old = h.sockets[0];
    const attack = h.control('act:attack'), pad = h.el('pad');
    attack.fire('pointerdown', { pointerId: 1 }); pad.fire('pointerdown', { pointerId: 2 });
    assert.equal(h.liftHint.get(), false, '通常の押下では案内しない');
    old.close(); h.advance(250);
    assert.equal(h.liftHint.get(), true, '切断で止めた指に案内を出す');
    const current = h.sockets.at(-1); current.open();
    current.receive({ type: 'welcome', slot: 'P1', role: 'ホスト', isHost: true, token: 'test-token', reconnected: true });
    current.receive({ type: 'game', game: h.game({ epoch: 8 }) });
    // 同じ指を動かし続けても視点は送らず、押下も復元しない
    pad.fire('pointermove', { pointerId: 2, clientX: 180 }); h.advance(100);
    assert.equal(current.sent.filter(m => m.type === 'look' || m.type === 'input').length, 0, '旧タッチで再開しない');
    assert.equal(h.liftHint.get(), true);
    attack.fire('pointerup', { pointerId: 1 });
    assert.equal(h.liftHint.get(), true, 'まだ視点の指が残っている');
    pad.fire('pointerup', { pointerId: 2 });
    assert.equal(h.liftHint.get(), false, '全て離したら自動で消す');
    assert.equal(current.sent.filter(m => m.type === 'input').length, 0);
    attack.fire('pointerdown', { pointerId: 3 });
    assert.deepEqual(current.sent.filter(m => m.type === 'input').map(m => [m.button, m.state, m.epoch]), [['act:attack', 'down', 8]], '新しいタッチは入力できる');
  });
  await test('遅延の計測: 計測用ビルドだけ、押下のACKで触れてから送信までと往復をホストへ送る。通常のビルドでは送らない', async () => {
    for (const latency of [false, true]) {
      const h = controllerHarness({ latency }); await h.ready(); const socket = h.sockets[0];
      h.control('act:jump').fire('pointerdown', { pointerId: 1, timeStamp: 990 });
      const down = h.inputs().find(m => m.button === 'act:jump' && m.state === 'down');
      h.advance(40); socket.receive({ type: 'ack', iseq: down.iseq, via: 'ws' });
      const sent = socket.sent.filter(m => m.type === 'latency');
      if (!latency) { assert.equal(sent.length, 0, '通常のビルドでは送らない'); continue; }
      assert.equal(sent.length, 1); assert.equal(sent[0].iseq, down.iseq);
      assert.equal(sent[0].touchMs, down.t - 990); assert(sent[0].rttMs >= 40, '往復は ACK までの時間');
      // 遅れて捨てられた押下 (stale) は送らない
      h.control('act:attack').fire('pointerdown', { pointerId: 2, timeStamp: 1000 });
      const late = h.inputs().find(m => m.button === 'act:attack' && m.state === 'down');
      socket.receive({ type: 'ack', iseq: late.iseq, via: 'ws', stale: true });
      assert.equal(socket.sent.filter(m => m.type === 'latency').length, 1);
    }
  });
  await test('押下診断: 計測用ビルドで150msを超えた押下だけを区間別に記録する (#437)', async () => {
    for (const latency of [false, true]) {
      const entries = [];
      const logger = {...console, info: (name, payload) => {
        if (name === 'recooplay:pointer-delay') entries.push(JSON.parse(payload));
      }};
      const h = controllerHarness({latency, logger});
      await h.ready();
      try {
        const jump = h.control('act:jump');
        jump.fire('pointerdown', {pointerId: 1, timeStamp: 850});
        jump.fire('pointerup', {pointerId: 1});
        assert.equal(entries.length, 0);
        jump.fire('pointerdown', {pointerId: 2, timeStamp: 849});
        assert.equal(entries.length, latency ? 1 : 0);
        if (latency) {
          const press = h.inputs().findLast(message => message.state === 'down');
          assert.equal(entries[0].iseq, press.iseq);
          assert.equal(entries[0].eventToHandlerMs, 151);
          assert.equal(entries[0].handlerToSendMs, 0);
        }
      } finally {
        h.dispose();
      }
    }
  });
  await test('遅延破棄: ホストが押下をstaleで返したら押したままの表示を解き、離すまで案内する (#285 Q25/Q27)', async () => {
    const h = controllerHarness(); await h.ready(); const socket = h.sockets[0];
    const attack = h.control('act:attack'), jump = h.control('act:jump');
    attack.fire('pointerdown', { pointerId: 1 }); jump.fire('pointerdown', { pointerId: 2 });
    const down = h.inputs().find(m => m.button === 'act:attack' && m.state === 'down');
    socket.receive({ type: 'ack', iseq: down.iseq, via: 'ws', stale: true });
    assert(!attack.classList.contains('down'), '押下中の表示を解く'); assert(jump.classList.contains('down'), '他の押下は続ける');
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up']); assert.deepEqual(states(h, 'act:jump'), ['down']);
    assert.equal(h.liftHint.get(), true);
    attack.fire('pointerup', { pointerId: 1 }); assert.equal(h.liftHint.get(), false);
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up'], '離したときに重ねてupを送らない');
    // 通常のACK・解放のstaleでは何もしない
    const jumpDown = h.inputs().find(m => m.button === 'act:jump' && m.state === 'down');
    socket.receive({ type: 'ack', iseq: jumpDown.iseq, via: 'ws' }); jump.fire('pointerup', { pointerId: 2 });
    const up = h.inputs().at(-1); socket.receive({ type: 'ack', iseq: up.iseq, via: 'ws', stale: true });
    assert.equal(h.liftHint.get(), false);
  });
  await test('遅延破棄: 古い押下のstaleは、離して押し直した新しい押下を止めない (#285 レビュー)', async () => {
    const h = controllerHarness(); await h.ready(); const socket = h.sockets[0];
    const attack = h.control('act:attack');
    attack.fire('pointerdown', { pointerId: 1 }); attack.fire('pointerup', { pointerId: 1 });
    const first = h.inputs().find(m => m.button === 'act:attack' && m.state === 'down');
    attack.fire('pointerdown', { pointerId: 2 });
    socket.receive({ type: 'ack', iseq: first.iseq, via: 'ws', stale: true });
    assert(attack.classList.contains('down'), '新しい押下の表示を残す');
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up', 'down'], '新しい押下にupを送らない');
    assert.equal(h.liftHint.get(), false, '案内を出さない');
    // 同じ押下が続いている間の stale は止める
    const second = h.inputs().filter(m => m.button === 'act:attack' && m.state === 'down').at(-1);
    socket.receive({ type: 'ack', iseq: second.iseq, via: 'ws', stale: true });
    assert(!attack.classList.contains('down')); assert.deepEqual(states(h, 'act:attack'), ['down', 'up', 'down', 'up']);
    assert.equal(h.liftHint.get(), true);
    attack.fire('pointerup', { pointerId: 2 }); assert.equal(h.liftHint.get(), false);
  });
  await test('遅延破棄: 同じ操作を複数の指で押していれば、最初の押下のstaleで全員を止める (ホスト側に押下がないため)', async () => {
    const h = controllerHarness(); await h.ready(); const socket = h.sockets[0];
    const attack = h.control('act:attack');
    attack.fire('pointerdown', { pointerId: 1 }); attack.fire('pointerdown', { pointerId: 2 }); attack.fire('pointerup', { pointerId: 1 });
    const down = h.inputs().find(m => m.button === 'act:attack' && m.state === 'down');
    assert.deepEqual(states(h, 'act:attack'), ['down'], '2本目の指は同じ押下を続ける');
    socket.receive({ type: 'ack', iseq: down.iseq, via: 'ws', stale: true });
    assert.deepEqual(states(h, 'act:attack'), ['down', 'up']); assert.equal(h.liftHint.get(), true);
    attack.fire('pointerup', { pointerId: 2 }); assert.equal(h.liftHint.get(), false);
  });
  await test('遅延破棄: スティックで戻して倒し直した後の古いstaleは、新しい押下を止めない', async () => {
    const h = controllerHarness(); await h.ready(); const socket = h.sockets[0]; const stick = h.document.querySelectorAll('.gen-stick')[0];
    stick.fire('pointerdown', { pointerId: 1, clientX: 190, clientY: 10 });
    const first = h.inputs().find(m => m.button === 'act:forward' && m.state === 'down');
    stick.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
    stick.fire('pointermove', { pointerId: 1, clientX: 190, clientY: 10 });
    assert.deepEqual(states(h, 'act:forward'), ['down', 'up', 'down']);
    socket.receive({ type: 'ack', iseq: first.iseq, via: 'ws', stale: true });
    assert.deepEqual(states(h, 'act:forward'), ['down', 'up', 'down'], '倒し直した押下を続ける'); assert.equal(h.liftHint.get(), false);
    const again = h.inputs().filter(m => m.button === 'act:forward' && m.state === 'down').at(-1);
    socket.receive({ type: 'ack', iseq: again.iseq, via: 'ws', stale: true });
    assert.equal(states(h, 'act:forward').at(-1), 'up', '続いている押下のstaleでは止める'); assert.equal(h.liftHint.get(), true);
  });
  await test('終了の確認: ページ内で確認し、表示中もpingを送り続け、OKでENDを1回だけ送る (#289)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' }); const socket = h.sockets[0];
    const commands = () => socket.sent.filter(message => message.type === 'command' && message.cmd === 'END');
    h.el('endBtn').fire('click');
    assert(h.el('phoneConfirm').open); assert.match(h.confirmation.get().message, /分担の画面に戻りますか/); assert.equal(commands().length, 0);
    const pings = socket.sent.filter(message => message.type === 'ping').length;
    for (let i = 0; i < 12; i++) { h.advance(1000); socket.receive({ type: 'pong', t: 0 }); }
    assert(socket.sent.filter(message => message.type === 'ping').length >= pings + 10, '確認の表示中もハートビートを止めない');
    assert.equal(socket.readyState, 1);
    h.answerConfirm(true);
    assert.equal(h.el('phoneConfirm').open, false); assert.equal(commands().length, 1); assert.equal(commands()[0].epoch, 7);
    h.answerConfirm(true); assert.equal(commands().length, 1, '閉じた後のOKで再送しない');
  });
  await test('終了の確認: 切断中のOKは送らずに待たせ、再接続後のOKで新しいepochのENDを送る (#289)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' });
    h.el('endBtn').fire('click'); h.sockets[0].close(); h.advance(250);
    assert.notEqual(h.el('status').className, 'pill ok');
    h.answerConfirm(true); assert(h.el('phoneConfirm').open, '切断中のOKで要求を失わない');
    const current = h.sockets.at(-1); current.open();
    current.receive({ type: 'welcome', slot: 'P1', role: 'ホスト', isHost: true, token: 'test-token', reconnected: true });
    current.receive({ type: 'game', game: h.game({ phase: 'paused', epoch: 9 }) });
    assert(h.el('phoneConfirm').open);
    h.answerConfirm(true);
    const end = current.sent.filter(message => message.type === 'command' && message.cmd === 'END');
    assert.equal(end.length, 1); assert.equal(end[0].epoch, 9);
  });
  await test('準備中の「分担に戻る」: 準備中の文言で確認し、OKでENDを1回送る。確認中に協力プレイへ進んだら送らない (#427)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'preparing' }); const socket = h.sockets[0];
    const commands = () => socket.sent.filter(message => message.type === 'command' && message.cmd === 'END');
    assert.notEqual(h.el('endBtn').style.display, 'none', '準備中も戻るボタンを出す');
    h.el('endBtn').fire('click');
    assert(h.el('phoneConfirm').open); assert.match(h.confirmation.get().message, /準備をやめて/);
    h.answerConfirm(true); assert.equal(commands().length, 1);
    const g = controllerHarness(); await g.ready({ phase: 'preparing' });
    g.el('endBtn').fire('click'); assert(g.el('phoneConfirm').open);
    g.sockets[0].receive({ type: 'game', game: g.game({ phase: 'paused', epoch: 8 }) });
    g.answerConfirm(true);
    assert.equal(g.messages().filter(m => m.type === 'command' && m.cmd === 'END').length, 0, '段階が変わった確認では送らない');
  });
  await test('終端の案内: PCアプリの終了・満員などでは確認と診断の画面を閉じ、確認した操作を後から送らない (#302 レビュー)', async () => {
    for (const end of [h => h.sockets[0].close(4009), h => h.sockets[0].receive({ type: 'full', retryMs: null }), h => h.sockets[0].close(4005), h => h.sockets[0].close(4001)]) {
      const h = controllerHarness(); await h.ready({ phase: 'paused' });
      h.el('endBtn').fire('click'); assert(h.el('phoneConfirm').open);
      end(h);
      assert.equal(h.el('full').style.display, 'flex');
      assert(!h.el('phoneConfirm').open, '終了の案内より手前に確認を残さない'); assert.equal(h.confirmation.get(), null, '未実行の要求を捨てる');
      h.answerConfirm(true); h.advance(10000);
      assert.equal(h.messages().filter(m => m.type === 'command' && m.cmd === 'END').length, 0, '確認した操作を後から送らない');
    }
    // 譲渡の確認・診断の画面も同じ
    const h = controllerHarness(); await h.ready({ phase: 'lobby', connected: ['P1', 'P2'] });
    h.transferHost('P2'); assert(h.el('phoneConfirm').open);
    h.el('phoneSettingsBtn').fire('click'); assert(h.el('phoneDiagnostics').open);
    h.sockets[0].close(4009);
    assert(!h.el('phoneConfirm').open && !h.el('phoneDiagnostics').open, '終了の案内を最前面に見せる');
    assert.equal(h.messages().filter(m => m.type === 'transfer_host').length, 0);
  });
  await test('一時的な通信断: 確認の画面は閉じず、案内の覆いだけを出す (#289・#302)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' });
    h.el('endBtn').fire('click'); h.sockets[0].close(1006); h.advance(3600);
    assert(!h.el('offline').hidden); assert(h.el('phoneConfirm').open, '再接続後に実行できるよう確認を保つ');
    assert.notEqual(h.confirmation.get(), null);
  });
  await test('終了の確認: 一時停止でなくなったら閉じて送らない。やめるでも送らない (#289)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'paused' }); const socket = h.sockets[0];
    h.el('endBtn').fire('click'); socket.receive({ type: 'game', game: h.game({ phase: 'coop', epoch: 8 }) });
    assert.equal(h.el('phoneConfirm').open, false); assert.equal(h.confirmation.get(), null);
    h.answerConfirm(true);
    socket.receive({ type: 'game', game: h.game({ phase: 'paused', epoch: 9 }) });
    h.el('endBtn').fire('click'); h.answerConfirm(false);
    assert.equal(h.el('phoneConfirm').open, false);
    assert.equal(socket.sent.filter(message => message.type === 'command').length, 0);
  });
  await test('ホストの譲渡: ページ内で確認し、相手が抜けたら閉じる (#289)', async () => {
    const h = controllerHarness(); await h.ready({ phase: 'lobby', connected: ['P1', 'P2', 'P3'] }); const socket = h.sockets[0];
    const transfers = () => socket.sent.filter(message => message.type === 'transfer_host');
    h.transferHost('P2'); assert(h.el('phoneConfirm').open); assert.equal(transfers().length, 0);
    h.answerConfirm(true); assert.deepEqual(transfers().map(message => message.to), ['P2']);
    h.transferHost('P3'); socket.receive({ type: 'game', game: h.game({ phase: 'lobby', connected: ['P1', 'P2'] }) });
    assert.equal(h.el('phoneConfirm').open, false); h.answerConfirm(true); assert.equal(transfers().length, 1);
  });
  await test('ホストの譲渡: 一時断では確認を保ち、再接続後のOKで新しいepochを送る (#289)', async () => {
    const h = controllerHarness();
    const lobby = { phase: 'lobby', connected: ['P1', 'P2'] };
    await h.ready(lobby);
    h.transferHost('P2');
    assert(h.el('phoneConfirm').open);
    h.sockets[0].close(1006);
    h.advance(3600);
    h.answerConfirm(true);
    assert(h.el('phoneConfirm').open);
    const transfers = () => h.messages().filter(message => message.type === 'transfer_host');
    assert.equal(transfers().length, 0);

    const current = h.sockets.at(-1);
    current.open();
    current.receive({ type: 'welcome', slot: 'P1', role: 'ホスト', isHost: true, token: 'test-token', reconnected: true });
    current.receive({ type: 'game', game: h.game({ ...lobby, epoch: 19 }) });
    assert.equal(transfers().length, 0, '接続が戻っても自動送信しない');
    h.answerConfirm(true);
    assert(!h.el('phoneConfirm').open);
    assert.deepEqual(transfers().map(({ to, epoch }) => ({ to, epoch })), [{ to: 'P2', epoch: 19 }]);
  });
  console.log(`${passed}/${passed} 合格（スマホ入力ライフサイクル、複数保持元の回帰を含む、OS入力なし）`);
}
