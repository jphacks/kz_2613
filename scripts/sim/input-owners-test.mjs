import assert from 'node:assert/strict';
const { createInputOwners } = await import(process.env.RECOOPLAY_TEST_TS === '1' ? '../../apps/web/src/input/owners.ts' : '../../apps/web-static/scripts/input-owners.js');

let passed = 0;
function test(name, run) { run(); passed++; console.log(`合格: ${name}`); }
function fixture(available = () => true) {
  const events = [];
  const owners = createInputOwners({
    down: (control, at) => { if (!available()) return false; events.push(['down', control, at]); return true; },
    up: control => events.push(['up', control]),
  });
  return { owners, events };
}
test('保持元: 最初のdownと最後のupだけ送信し、同じ保持元の重複は冪等', () => {
  const { owners, events } = fixture();
  assert(owners.press(0, 'W', 10)); assert(!owners.press(0, 'W', 11));
  owners.press(2, 'W', 12); owners.release(0, 'W'); assert(owners.isHeld('W'));
  assert.deepEqual(events, [['down', 'W', 10]]);
  owners.release(2, 'W'); owners.release(2, 'W');
  assert.deepEqual(events, [['down', 'W', 10], ['up', 'W']]); assert(!owners.isHeld('W'));
});
test('複数操作: 保持元の一括解放は他の保持元の同じ操作を維持する', () => {
  const { owners, events } = fixture(); const stick = Symbol('stick');
  owners.press(stick, 'W', 1); owners.press(stick, 'D', 2); owners.press(3, 'W', 3);
  owners.releaseOwner(stick); owners.releaseOwner(stick);
  assert(owners.isHeld('W')); assert(!owners.isHeld('D'));
  assert.deepEqual(events, [['down', 'W', 1], ['down', 'D', 2], ['up', 'D']]);
  owners.releaseAll(); assert.deepEqual(events.at(-1), ['up', 'W']);
});
test('送信拒否: 送れなかったdownにupを作らず、次の新規押下から始める', () => {
  let available = false; const { owners, events } = fixture(() => available);
  assert(!owners.press(1, 'W', 1)); owners.release(1, 'W'); owners.releaseAll();
  assert.deepEqual(events, []); available = true;
  assert(owners.press(1, 'W', 2)); owners.releaseAll();
  assert.deepEqual(events, [['down', 'W', 2], ['up', 'W']]);
});
test('強制停止: 全解放は冪等で、遅延upは新しい保持元へ影響しない', () => {
  const { owners, events } = fixture();
  owners.press(1, 'W', 1); owners.press(2, 'W', 2); owners.press(2, 'D', 3);
  owners.releaseAll(); owners.releaseAll(); owners.press(3, 'W', 4); owners.release(1, 'W');
  assert(owners.isHeld('W'));
  assert.deepEqual(events, [['down', 'W', 1], ['down', 'D', 3], ['up', 'W'], ['up', 'D'], ['down', 'W', 4]]);
  owners.release(3, 'W'); assert.deepEqual(events.at(-1), ['up', 'W']);
});
console.log(`${passed}/${passed} 合格（保持元管理、通信・DOM・OS入力なし）`);
