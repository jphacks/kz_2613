import assert from 'node:assert/strict';
import {PHONE_PROTOCOL_VERSION} from '../../apps/web/src/shared/transport/version.ts';
const { decodeServerMessage } = await import('../../apps/web/src/shared/transport/protocol.ts');
import { controllerHarness } from './fixtures/phone-harness.mjs';
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`合格: ${name}`); }
const decode = value => decodeServerMessage(JSON.stringify(value));

await test('構文・envelope: 壊れたJSONとnull/配列/型なしを例外なく拒否する', () => {
  for (const text of ['{', '', '[', '{"t":NaN}']) assert.equal(decodeServerMessage(text), null);
  for (const value of [null, [], {}, { type: 1 }]) assert.equal(decode(value), null);
  const future = { type: 'future', extra: 'x'.repeat(100000) }; assert.deepEqual(decode(future), {type:'unknown',originalType:'future'});
});
await test('参加・RTT・ACK・RTC信号: 副作用前に識別子と値の型を確認する', () => {
  for (const value of [
    { type: 'welcome', slot: 'P5', isHost: true, role: 'ホスト' },
    { type: 'welcome', slot: 'P1', isHost: 'true', role: 'ホスト' },
    { type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: {} },
    { type: 'pong', t: 'NaN' }, { type: 'kpong', t: null }, { type: 'ack', iseq: 1, via: 'other' },
    { type: 'command_result', cmd: 'READY', accepted: false, reasons: {} },
    { type: 'command_result', accepted: false }, { type: 'command_result', cmd: 1, accepted: true },
    { type: 'rtc-answer', sdp: {} },
    { type: 'rtc-cand', cand: 'candidate', mid: [] },
    { type: 'full', retryMs: -1 }, { type: 'full', retryMs: '5000' },
  ]) assert.equal(decode(value), null);
  for (const value of [{ type: 'ack', iseq: 1, via: 'ws', stale: true }, { type: 'pong', t: 12.5 },
    { type: 'command_result', cmd: 'READY', accepted: true },
    { type: 'command_result', cmd: 'READY', accepted: false, reasons: ['準備中'] },
    { type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test', protocolVersion: PHONE_PROTOCOL_VERSION },
    { type: 'full' }, { type: 'full', retryMs: null }, { type: 'full', retryMs: 1200 }, { type: 'error', code: 'bad_token' }]) assert.deepEqual(decode(value), value);
});
await test('welcome: Webが送る通信版と異なる版・文字列を拒否する', () => {
  const welcome = {type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト'};
  for (const protocolVersion of [PHONE_PROTOCOL_VERSION - 1, PHONE_PROTOCOL_VERSION + 1, String(PHONE_PROTOCOL_VERSION)]) {
    assert.equal(decode({...welcome, protocolVersion}), null);
  }
  assert.deepEqual(decode(welcome), welcome);
});
await test('game: 有効な状態を保持し、不正な配列・担当・巨大な不正配列を拒否する', () => {
  const base = controllerHarness().game();
  for (const phase of ['lobby', 'preparing', 'coop', 'paused']) {
    const value = { type: 'game', game: { ...base, phase } }; assert.deepEqual(decode(value), value);
  }
  for (const patch of [{ epoch: '7' }, { epoch: null }, { phase: 'future' }, { connected: {} },
    { participants: ['P1', null] }, { assigned: { P1: [2] } }, { roleOf: { P1: 'P5' } },
    { profile: { actions: [null] } }, { profile: { groups: Array(10000).fill('bad') } },
    { readyReasons: {} }, { keys: [] }]) assert.equal(decode({ type: 'game', game: { ...base, ...patch } }), null);
});
await test('実controller: 壊れたgameで保持を解放し、新規入力と旧Socket通知を遮断する', async () => {
  const h = controllerHarness(); await h.ready(); const old = h.sockets[0];
  h.control('act:attack').fire('pointerdown'); old.receive({ type: 'game', game: null });
  assert.equal(old.readyState, 3); assert.deepEqual(h.inputs().map(m => m.state), ['down', 'up']);
  const before = h.inputs().length;
  h.control('act:attack').fire('pointerdown', { pointerId: 2 });
  assert.equal(h.inputs().length, before);
  h.advance(250); const current = h.sockets.at(-1); current.open();
  current.receive({ type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test-token' });
  current.receive({ type: 'game', game: h.game({ epoch: 8 }) });
  old.receive({ type: 'game', game: h.game({ epoch: 999 }) });
  h.control('act:attack').fire('pointerdown', { pointerId: 3 });
  assert.equal(h.inputs().at(-1).epoch, 8);
});
await test('実controller: 未知typeを無視し、次のepochと操作を処理する', async () => {
  const h = controllerHarness(); await h.ready(); const sock = h.sockets[0];
  sock.receive({ type: 'future', extra: [1, 2, 3] }); assert.equal(sock.readyState, 1);
  sock.receive({ type: 'game', game: h.game({ epoch: 8 }) }); h.control('act:attack').fire('pointerdown');
  assert.equal(h.inputs().at(-1).epoch, 8);
});
await test('同epochで保持中: 描画が参照する必須構造の破損も例外なく解放して切断する', async () => {
  const corrupt = [
    game => { delete game.connected; }, game => { game.profile = null; },
    game => { delete game.profile.actions; }, game => { game.profile.actions = [null]; },
    game => { game.phase = 'lobby'; game.profile.assignment = { P1: 1 }; },
    game => { game.keys.actions.attack.label = {}; },
    game => { game.keys.controls = { INV: { label: {} } }; },
    game => { game.phase = 'paused'; game.reason = {}; },
    game => { game.titleName = { toString: null }; },
    game => { game.remoteRoute = { toString: null }; },
    game => { game.profile.status = { toString: null }; },
    game => { game.profile.controllerSupported = {}; },
  ];
  for (const mutate of corrupt) {
    const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
    const game = h.game(); mutate(game);
    assert.equal(decode({ type: 'game', game }), null);
    assert.doesNotThrow(() => h.sockets[0].receive({ type: 'game', game }));
    assert.equal(h.sockets[0].readyState, 3);
    assert.deepEqual(h.inputs().map(m => m.state), ['down', 'up']);
  }
  const lobby = controllerHarness().game({ phase: 'lobby', profile: null });
  assert.deepEqual(decode({ type: 'game', game: lobby }), { type: 'game', game: lobby });
});
await test('適用中の例外: 検証後の描画失敗でも保持を解放して切断する', async () => {
  const h = controllerHarness(); await h.ready(); h.control('act:attack').fire('pointerdown');
  const unsubscribe=h.display.subscribe(() => {unsubscribe();throw new Error('描画失敗の注入');});
  assert.doesNotThrow(() => h.sockets[0].receive({ type: 'game', game: h.game() }));
  assert.equal(h.sockets[0].readyState, 3);
  assert.deepEqual(h.inputs().map(m => m.state), ['down', 'up']);
});
console.log(`${passed}/${passed} 合格（型付き受信境界、OS入力なし）`);
