// スマホの画面切り替えの演出 (ワイプ＋流れ星) が、画面の入れ替え・押下の受け付けを壊さないことを確認する。
// 見た目 (色・動き) はブラウザで確認する。OS入力・実端末の検証には使わない。
//   node scripts/sim/view-transition-test.mjs
import assert from 'node:assert/strict';
import { createViewTransition, motionAllowed, transitionDirection, SWAP_MS } from '../../apps/web-static/scripts/view-transition.js';

function fakeWin({ reduce = false } = {}) {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    matchMedia: (q) => ({ matches: reduce && q.includes('reduce') }),
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
    },
  };
}
function fakeLayer() {
  const classes = new Set();
  return {
    dataset: {}, innerHTML: '', offsetWidth: 0,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    replaceChildren() { this.innerHTML = ''; },
    getBoundingClientRect: () => ({ width: 402, height: 820 }),
  };
}

// 向き: 操作画面から戻るときだけ逆向き
assert.equal(transitionDirection(null, 'v-wait'), 'forward');
assert.equal(transitionDirection('v-wait', 'v-gen'), 'forward');
assert.equal(transitionDirection('v-gen', 'v-wait'), 'back');
assert.equal(transitionDirection('v-gen', 'v-remote'), 'back');

// ブラウザ以外・動きを減らす設定では演出せず、すぐ入れ替える
assert.equal(motionAllowed({}), false);
assert.equal(motionAllowed(fakeWin({ reduce: true })), false);
for (const win of [{}, fakeWin({ reduce: true })]) {
  let applied = 0;
  const layer = fakeLayer();
  createViewTransition({ layer, win }).run({ slot: 'P2', from: 'v-wait', to: 'v-gen', oldEl: {}, apply: () => applied++ });
  assert.equal(applied, 1, '演出しないときは即座に入れ替える');
  assert.equal(layer.innerHTML, '', '演出の要素を残さない');
}

// 演出あり: 帯が覆うまで古い画面は押下を受けず、覆った時点で入れ替える
{
  const win = fakeWin(), layer = fakeLayer(), oldEl = { inert: false };
  let applied = 0;
  const t = createViewTransition({ layer, win });
  t.run({ slot: 'P3', from: 'v-gen', to: 'v-wait', oldEl, apply: () => applied++ });
  assert.equal(layer.dataset.slot, 'P3', '帯は本人のキャラクターの色');
  assert.equal(layer.dataset.dir, 'back');
  assert.equal(layer.classList.has('run'), true);
  assert.equal((layer.innerHTML.match(/view-fx-star/g) || []).length, 4, '流れ星は4本');
  assert.equal(oldEl.inert, true, '切り替え中の古い画面は新しい押下を受けない');
  assert.equal(applied, 0);
  win.advance(SWAP_MS - 1);
  assert.equal(applied, 0);
  win.advance(1);
  assert.equal(applied, 1, '帯が覆った時点で入れ替える');
  assert.equal(oldEl.inert, false, '入れ替え後は inert を戻す');
  win.advance(1000);
  assert.equal(layer.classList.has('run'), false, '演出が終われば片付ける');
  assert.equal(layer.innerHTML, '');
}

// 演出中に次の切り替えが来たら、前の切り替えをすぐ終えてから次を始める
{
  const win = fakeWin(), layer = fakeLayer(), order = [];
  const t = createViewTransition({ layer, win });
  t.run({ slot: 'P1', from: null, to: 'v-wait', oldEl: {}, apply: () => order.push('wait') });
  win.advance(100);
  t.run({ slot: 'P1', from: 'v-wait', to: 'v-gen', oldEl: {}, apply: () => order.push('gen') });
  assert.deepEqual(order, ['wait'], '前の入れ替えを先に済ませる');
  win.advance(SWAP_MS);
  assert.deepEqual(order, ['wait', 'gen']);
  t.finish();
  assert.deepEqual(order, ['wait', 'gen'], '同じ入れ替えを二度行わない');
}

// 枠が未定でも色は P1 (青) にする
{
  const layer = fakeLayer();
  createViewTransition({ layer, win: fakeWin() }).run({ slot: null, from: null, to: 'v-wait', apply() {} });
  assert.equal(layer.dataset.slot, 'P1');
}

console.log('view-transition-test: OK');
