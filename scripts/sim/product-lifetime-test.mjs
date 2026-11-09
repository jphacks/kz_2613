// 製品TSランタイムを停止した後、旧イベント・タイマーが送信を再開しないことを確認する。
import assert from 'node:assert/strict';
process.env.RECOOPLAY_TEST_TS='1';
const {controllerHarness}=await import('./fixtures/phone-harness.mjs');
const h=controllerHarness();await h.ready();
const button=h.control('act:jump');button.fire('pointerdown');
assert(h.activeTimers()>0);
h.dispose();
assert.equal(h.activeTimers(),0,'破棄時にすべてのエンジンタイマーを停止する');
assert.deepEqual(h.inputs().map(m=>m.state),['down','up']);
const before=h.messages().length,sockets=h.sockets.length;
h.dispose();button.fire('pointerdown');button.fire('pointerup');
h.window.fire('blur');h.document.fire('visibilitychange');h.advance(30000);
assert.equal(h.messages().length,before,'旧イベントが入力・心拍を送らない');
assert.equal(h.sockets.length,sockets,'破棄後に再接続しない');
console.log('合格: 製品TSランタイムの全解放・冪等破棄・タイマーと購読解除・再接続停止');
