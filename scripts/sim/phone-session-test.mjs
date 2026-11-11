import assert from 'node:assert/strict';
const { createPhoneSession, PHONE_PROTOCOL_VERSION } = await import('../../apps/web/src/shared/transport/session.ts');
import { controllerHarness } from './fixtures/phone-harness.mjs';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`合格: ${name}`); }
function fixture(saved = {}) {
  let time = 1000, created = 0;
  const values = new Map(Object.entries(saved));
  const session = createPhoneSession({
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    createClientId: () => { created++; return 'generated-client'; }, now: () => time,
  });
  return { session, values, created: () => created, time: value => { time = value; } };
}

export async function reproduceStaleOpen() {
  const h = controllerHarness(); await h.ready(); h.sockets[0].close();
  // 切断後、可視化イベントと予約再試行が重なり、まだ開いていないSocketが2本できる。
  h.document.fire('visibilitychange'); const obsolete = h.sockets[1];
  h.advance(250); const current = h.sockets[2]; current.open();
  current.receive({ type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test-token' });
  current.receive({ type: 'game', game: h.game({ epoch: 8 }) });
  h.control('act:attack').fire('pointerdown');
  h.advance(100);
  obsolete.open();
  h.control('act:attack').fire('pointerup');
  assert.deepEqual(current.sent.filter(message => message.type === 'input').map(message => message.seq), [1, 2],
    '旧Socketのopenで現在の送信seqを巻き戻してはいけない');
  assert.equal(obsolete.sent.length, 0, '旧Socketへhelloを送ってはいけない');
  current.receive({ type: 'pong', t: 1250 }); h.advance(900);
  const pings = current.sent.filter(message => message.type === 'ping');
  assert.equal(pings.length, 1, '現在のpingタイマーの予定時刻をずらしてはいけない');
  assert.equal(pings[0].stats.unacked, 2, '現在の未ACK入力を旧openで削除してはいけない');
}

if (process.argv.includes('--repro-stale-open')) {
  await reproduceStaleOpen();
} else {
  await test('参加情報: 保存済みidentity/tokenとhelloの版・nextIseqを維持する', () => {
    const f = fixture({ 'recooplay.clientId': 'saved-client', 'recooplay.token': 'saved-token' });
    assert.equal(f.created(), 0); assert.equal(PHONE_PROTOCOL_VERSION, 4);
    assert.deepEqual(f.session.open('test-agent'), { type: 'hello', protocolVersion: 4, clientId: 'saved-client', token: 'saved-token', ua: 'test-agent', nextIseq: 1 });
    f.session.authenticate({ token: 'updated-token' }); assert.equal(f.values.get('recooplay.token'), 'updated-token');
    assert.equal(f.session.open('test-agent').token, 'updated-token');
  });
  await test('保存拒否: storageが読書きとも拒否しても生成したidentityを同じセッションで保つ', () => {
    let created = 0;
    const session = createPhoneSession({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
      createClientId: () => { created++; return 'ephemeral'; }, now: () => 0 });
    session.authenticate({ token: 'server-token' });
    assert.equal(session.open('a').clientId, 'ephemeral'); assert.equal(session.open('b').token, 'server-token'); assert.equal(created, 1);
  });
  await test('連番: seqは接続ごと、iseqは再接続を越えて増加しepochと同時刻を付ける', () => {
    const { session } = fixture(); session.open('agent'); session.updateGame({ epoch: 7 });
    const first = session.input({ button: 'act:attack', state: 'down' });
    assert.deepEqual(first, { type: 'input', button: 'act:attack', state: 'down', iseq: 1, epoch: 7, t: 1000 });
    assert.equal(session.sequenced(first).seq, 1); assert.equal(session.sequenced({ type: 'role_ok' }).seq, 2);
    assert.equal(session.open('agent').nextIseq, 2); session.updateGame({ epoch: 8 });
    const next = session.input({ button: 'act:attack', state: 'up' });
    assert.equal(next.iseq, 2); assert.equal(next.epoch, 8); assert.equal(session.sequenced(next).seq, 1);
  });
  await test('表示状態: serverのslot/host/gameを保持しepoch変更を判定してから新状態を読む', () => {
    const { session } = fixture();
    session.welcome({ slot: 'P2', isHost: false, reconnected: true }); assert.deepEqual(session.status(), ['再接続OK', 'ok']);
    assert(session.updateGame({ phase: 'coop', epoch: 7 })); assert(!session.updateGame({ phase: 'paused', epoch: 7 }));
    assert.deepEqual(session.view(), { me: 'P2', isHost: false, game: { phase: 'paused', epoch: 7 } });
    assert(session.updateGame({ phase: 'coop', epoch: 8 })); assert.equal(session.game.epoch, 8);
  });
  await test('再接続: backoffの上限・open/可視化時リセットと終端コードの非再試行を維持', () => {
    const { session } = fixture();
    assert.deepEqual(Array.from({ length: 7 }, () => session.disconnected(1006)), [250, 500, 1000, 2000, 4000, 5000, 5000]);
    session.resetRetry(); assert.equal(session.disconnected(1006), 250);
    session.open('agent'); assert.equal(session.disconnected(1006), 250);
    for (const [code, text] of [[4000, '別タブで接続中'], [4001, 'リセットされました'], [4005, '版が不一致'], [4006, '参加できません']]) {
      const f = fixture(); assert.equal(f.session.disconnected(code), null); assert(f.session.stopped); assert.deepEqual(f.session.status(), [text, 'ng']);
    }
    // 満員で止めた後の切断で「切断 — 再接続待ち」に戻さず、再接続もしない (#308)
    const full = fixture(); full.session.connecting(); full.session.stop('full');
    assert.equal(full.session.disconnected(1000), null); assert.deepEqual(full.session.status(), ['満員で参加できません', 'ng']);
  });
  await test('無応答/所有接続: 3秒境界・受信時刻更新・detachと旧Socket拒否を独立検証', () => {
    const f = fixture(), old = { readyState: 1 }, current = { readyState: 1 };
    f.session.attach(old); f.session.open('agent'); f.time(3999); assert(!f.session.silent());
    f.time(4000); assert(f.session.silent()); f.session.received(); assert(!f.session.silent());
    f.session.attach(current); assert(!f.session.current(old)); assert(f.session.current(current));
    assert.equal(f.session.detach(), current); assert(!f.session.current(current)); assert(!f.session.isOpen());
  });
  await test('旧open通知: 重なった再接続の遅延openはseq・pending・pingを初期化しない', reproduceStaleOpen);
  console.log(`${passed}/${passed} 合格（接続・参加状態、DOM・OS入力なし）`);
}
