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
  console.log(`${passed}/${passed} 合格（スマホ入力ライフサイクル、複数保持元の回帰を含む、OS入力なし）`);
}
