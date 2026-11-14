// スマホコントローラーの個人レイアウト (#271): 標準生成・検証・定義変更との合成・担当による表示・
// 本体座標の縦横変換・表示だけの一時補正・ゲーム別の保存。DOM・通信・OS入力なし。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const L = await import('../../apps/web/src/shared/model/layout.ts');
const {loadComponent,createElement,renderToStaticMarkup}=await import('./fixtures/react-render.mjs');
const {LayoutController,LayoutEditor}=await loadComponent(new URL('../../apps/web/src/phone/LayoutController.tsx',import.meta.url));

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`合格: ${name}`); }
function memory(entries = []) {
  const map = new Map(entries);
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
const profile = {
  id: 'test-game', name: 'テスト',
  actions: [
    { id: 'forward', type: 'button', group: 'move' }, { id: 'back', type: 'button', group: 'move' },
    { id: 'left', type: 'button', group: 'move' }, { id: 'right', type: 'button', group: 'move' },
    { id: 'jump', type: 'button', group: 'move' },
    { id: 'look', type: 'mouseDelta', group: 'view' },
    { id: 'attack', type: 'button', group: 'act' }, { id: 'use', type: 'button', group: 'act' },
    { id: 'hotbar', type: 'wheel', group: 'items' },
  ],
};
const game = (assigned = {}, p = profile) => ({ profile: p, assigned });
const ids = layout => layout.parts.map(p => p.id);
const byId = (layout, id) => layout.parts.find(p => p.id === id);
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

await test('標準生成: 全操作を部品にし、操作は担当と同じ act:/look: の名前で持つ', () => {
  const s = L.standardLayout(game());
  assert.equal(s.schema, L.LAYOUT_SCHEMA); assert.equal(s.version, 2); assert.equal(s.game, 'test-game');
  assert.deepEqual(ids(s), ['move:stick', 'jump', 'view:look', 'attack', 'use', 'hotbar:up', 'hotbar:down']);
  assert.deepEqual(byId(s, 'move:stick').controls, ['act:forward', 'act:left', 'act:right', 'act:back']);
  assert.deepEqual(byId(s, 'view:look').controls, ['look:look']);
  assert.deepEqual(byId(s, 'hotbar:up').controls, ['act:hotbar:up']);
  for (const p of s.parts) {
    assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `本体の範囲内: ${p.id}`);
    assert(p.w >= L.LIMITS.minW && p.w <= L.LIMITS.maxW && p.h >= L.LIMITS.minH && p.h <= L.LIMITS.maxH, `幅・高さの範囲: ${p.id}`);
    assert.equal(p.hidden, false);
  }
  assert(byId(s, 'move:stick').y > 0.5, 'スティックは縦持ちの下 (親指)');
  assert(byId(s, 'view:look').y < byId(s, 'jump').y, '視点パッドは上、ボタンはその下');
  assert.equal(L.parseLayout(JSON.parse(JSON.stringify(s)), 'test-game').parts.length, s.parts.length, '標準は検証を通る');
});

await test('標準生成: 実際の操作定義 (全ゲーム) でも検証を通り、部品IDが重複しない', () => {
  const dir = new URL('../../apps/game-profiles/', import.meta.url);
  let count = 0;
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(new URL(name, dir), 'utf8'));
    if (!Array.isArray(p.actions)) continue;
    const s = L.standardLayout(game({}, p));
    assert.equal(new Set(ids(s)).size, s.parts.length, `部品IDの重複: ${name}`);
    const parsed = L.parseLayout(JSON.parse(JSON.stringify(s)), p.id);
    assert(parsed, `検証を通らない: ${name}`);
    assert.equal(parsed.parts.length, Math.min(s.parts.length, L.LIMITS.parts), `検証で部品が落ちる: ${name}`);
    count++;
  }
  assert(count > 10);
});

await test('検証: 構造・版・ゲームが違えば標準に戻し、不正な部品だけを捨て、数値は範囲に収める', () => {
  const s = L.standardLayout(game());
  for (const bad of [null, [], 'x', { ...s, schema: 'other' }, { ...s, version: 1 }, { ...s, game: 'other' }, { ...s, parts: {} }]) {
    assert.equal(L.parseLayout(bad, 'test-game'), null);
  }
  const parts = [
    { id: 'jump', kind: 'button', controls: ['act:jump'], x: 5, y: -1, w: 99, h: -3, hidden: 'yes' },
    { id: 'jump', kind: 'button', controls: ['act:jump'], x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, // 重複ID
    { id: 'bad id!', kind: 'button', controls: ['act:jump'], x: 0, y: 0, w: 0.2, h: 0.1 },
    { id: 'k', kind: 'dpad', controls: ['act:jump'], x: 0, y: 0, w: 0.2, h: 0.1 },
    { id: 'c', kind: 'button', controls: ['act:jump', 'act:use'], x: 0, y: 0, w: 0.2, h: 0.1 }, // ボタンは1操作
    { id: 'd', kind: 'button', controls: ['look:look'], x: 0, y: 0, w: 0.2, h: 0.1 },           // 種類と操作の不一致
    { id: 'e', kind: 'button', controls: ['javascript:alert(1)'], x: 0, y: 0, w: 0.2, h: 0.1 },
    { id: 'f', kind: 'button', controls: ['act:jump'], x: NaN, y: 0, w: 0.2, h: 0.1 },
    { id: 'g', kind: 'stick', controls: [], x: 0, y: 0, w: 0.2, h: 0.1 },
    { id: '__proto__', kind: 'button', controls: ['act:use'], x: 0.3, y: 0.3, w: 0.2, h: 0.1 },
  ];
  const parsed = L.parseLayout({ ...s, parts }, 'test-game');
  assert.deepEqual(parsed.parts.map(p => p.id), ['jump', '__proto__']);
  assert.deepEqual(parsed.parts[0], { id: 'jump', kind: 'button', controls: ['act:jump'], x: 1, y: 0, w: L.LIMITS.maxW, h: L.LIMITS.minH, hidden: false });
  // 版1 (正方形の size だけ) は読まずに初期配置へ戻す。保存値は消さない (旧データの移行はP3)
  assert.equal(L.parseLayout({ ...s, version: 1, parts: [{ id: 'jump', kind: 'button', controls: ['act:jump'], x: 0.5, y: 0.5, size: 0.2 }] }, 'test-game'), null);
  const many = Array.from({ length: 200 }, (_, i) => ({ id: `b${i}`, kind: 'button', controls: ['act:jump'], x: 0, y: 0, w: 0.2, h: 0.1 }));
  assert.equal(L.parseLayout({ ...s, parts: many }, 'test-game').parts.length, L.LIMITS.parts, '部品数に上限');
});

await test('定義変更との合成: 編集した位置・非表示・重複割当を保ち、消えた操作は復活させず、新しい操作だけ足す (Q04/Q05)', () => {
  const saved = L.standardLayout(game());
  Object.assign(byId(saved, 'jump'), { x: 0.1, y: 0.2, w: 0.3, h: 0.12 });
  byId(saved, 'attack').hidden = true;                       // 画面上で削除
  saved.parts.push({ id: 'jump-copy', kind: 'button', controls: ['act:jump'], x: 0.9, y: 0.1, w: 0.15, h: 0.08, hidden: false });
  Object.assign(byId(saved, 'move:stick'), { x: 0.2, y: 0.6 });
  // ホストの定義: back と use が消え、dash が増えた
  const next = { ...profile, actions: [...profile.actions.filter(a => !['back', 'use'].includes(a.id)), { id: 'dash', type: 'button', group: 'act' }] };
  const merged = L.reconcile(saved, L.standardLayout(game({}, next)));
  assert.deepEqual({ ...byId(merged, 'jump') }, { id: 'jump', kind: 'button', controls: ['act:jump'], x: 0.1, y: 0.2, w: 0.3, h: 0.12, hidden: false });
  assert.equal(byId(merged, 'attack').hidden, true, '削除した部品を新しい操作として戻さない');
  assert(byId(merged, 'jump-copy'), '同じ操作を複数の部品に割り当てられる');
  assert.equal(byId(merged, 'use'), undefined, '定義から消えた操作の部品は捨てる');
  assert.deepEqual(byId(merged, 'move:stick').controls, ['act:forward', 'act:left', 'act:right'], 'スティックは残った方向だけ');
  assert.deepEqual([byId(merged, 'move:stick').x, byId(merged, 'move:stick').y], [0.2, 0.6], '方向が減っても位置を保つ');
  assert(byId(merged, 'dash') && !byId(merged, 'dash').hidden, '新しい操作は初期位置で足す');
  assert.equal(L.reconcile(null, L.standardLayout(game())).parts.length, 7);
  // 保存値に、定義にない操作や種類の違う操作が混ざっていても通さない
  const forged = L.standardLayout(game());
  forged.parts.push({ id: 'x', kind: 'button', controls: ['act:not-defined'], x: 0, y: 0, w: 0.2, h: 0.1, hidden: false });
  forged.parts.push({ id: 'y', kind: 'look', controls: ['look:jump'], x: 0, y: 0, w: 0.2, h: 0.1, hidden: false });
  const cleaned = L.reconcile(forged, L.standardLayout(game()));
  assert.equal(byId(cleaned, 'x'), undefined); assert.equal(byId(cleaned, 'y'), undefined);
});

await test('担当による表示: 担当外は隠し、位置は保存のまま。元の担当に戻れば同じ場所に出る (Q03)', () => {
  const layout = L.standardLayout(game());
  byId(layout, 'jump').x = 0.11;
  const g = game({ P1: ['forward', 'left', 'jump'], P2: ['look', 'attack', 'hotbar', 'back', 'right'] });
  const p1 = L.visibleParts(layout, L.allowedControls(g, 'P1'));
  assert.deepEqual(p1.map(p => p.id), ['move:stick', 'jump']);
  assert.deepEqual(p1[0].controls, ['act:forward', 'act:left'], 'スティックは担当の方向だけ');
  const p2 = L.visibleParts(layout, L.allowedControls(g, 'P2'));
  assert.deepEqual(p2.map(p => p.id), ['move:stick', 'view:look', 'attack', 'hotbar:up', 'hotbar:down']);
  assert.deepEqual(L.visibleParts(layout, L.allowedControls(g, 'P3')), [], '担当なしは何も出さない');
  assert.equal(byId(layout, 'jump').x, 0.11, '表示の絞り込みで保存データを変えない');
  assert.equal(L.visibleParts(layout, L.allowedControls(g, 'P1')).find(p => p.id === 'jump').x, 0.11);
  byId(layout, 'jump').hidden = true;
  assert(!L.visibleParts(layout, L.allowedControls(g, 'P1')).some(p => p.id === 'jump'));
  assert.equal(L.allowedControls(game({ P1: ['unknown'] }), 'P1').size, 0, '定義にない担当IDは使えない');
});

await test('縦横の変換: 端末を回しても同じ本体の場所に留まり、4方向で往復が一致する (Q08)', () => {
  // 本体の左下 (縦持ちの左手の親指あたり)
  assert.deepEqual(L.bodyToScreen(0.2, 0.8, 0), [0.2, 0.8]);
  const [ax, ay] = L.bodyToScreen(0.2, 0.8, 90);  // 反時計回りに90度: 本体の下端は画面の右、左端は画面の下
  close(ax, 0.8); close(ay, 0.8);
  const [bx, by] = L.bodyToScreen(0.2, 0.8, 270); // 時計回り: 本体の下端は画面の左、左端は画面の上
  close(bx, 0.2); close(by, 0.2);
  const [cx, cy] = L.bodyToScreen(0.2, 0.8, 180);
  close(cx, 0.8); close(cy, 0.2);
  // 本体の4隅が、回した後も対応する隅に出る (左上 → 90度では左下)
  assert.deepEqual(L.bodyToScreen(0, 0, 90), [0, 1]);
  assert.deepEqual(L.bodyToScreen(0, 0, 270), [1, 0]);
  for (const angle of [-90, 450, 359, 1]) assert([0, 90, 180, 270].includes(L.normalizeAngle(angle)));
  assert.equal(L.normalizeAngle(-90), 270, 'iOS の window.orientation=-90 は時計回り');
});

await test('表示位置: 幅は短辺・高さは長辺の比。スティックは正方形。safe area と重なりはプレイの表示だけ最小限ずらし、保存データは変えない (Q11/Q38)', () => {
  const parts = [
    { id: 'a', kind: 'button', controls: ['act:jump'], x: 0.5, y: 0.5, w: 0.2, h: 0.1, hidden: false },
    { id: 'b', kind: 'button', controls: ['act:use'], x: 0.52, y: 0.5, w: 0.2, h: 0.1, hidden: false },
    { id: 'c', kind: 'button', controls: ['act:attack'], x: 0.98, y: 0.02, w: 0.2, h: 0.1, hidden: false },
    { id: 's', kind: 'stick', controls: ['act:forward'], x: 0.5, y: 0.85, w: 0.9, h: 0.2, hidden: false },
  ];
  const before = JSON.stringify(parts);
  const portrait = L.placeParts(parts, { width: 400, height: 800, angle: 0, safe: { top: 40, right: 0, bottom: 20, left: 0 } });
  const landscape = L.placeParts(parts, { width: 800, height: 400, angle: 90 });
  assert.deepEqual([portrait[0].width, portrait[0].height], [80, 80], '幅は短辺、高さは長辺に対する比');
  assert.deepEqual([landscape[0].width, landscape[0].height], [80, 80], '縦横で指に対する大きさが同じ');
  assert.deepEqual([portrait[3].width, portrait[3].height], [160, 160], 'スティックは短い方にそろえた正方形');
  assert.equal(JSON.stringify(parts), before, '補正は保存データに書き戻さない');
  const [a, b, c] = portrait;
  assert(!a.adjusted && b.adjusted, '重なった部品だけを動かす');
  assert(b.left >= a.left + a.width - 0.5 || b.top >= a.top + a.height - 0.5, '重ならない位置へ押し出す');
  assert(c.adjusted && c.top >= 40 && c.left + c.width <= 400, 'safe area と画面の外へ出さない');
  assert(!portrait.some(p => p.conflict));
  const again = L.placeParts(parts, { width: 400, height: 800, angle: 0, safe: { top: 40, right: 0, bottom: 20, left: 0 } });
  assert.deepEqual(again, portrait, '回して戻せば元の位置 (補正が残らない)');
  const raw = L.placeParts(parts, { width: 400, height: 800, angle: 0 }, false);
  assert(!raw[0].adjusted && !raw[1].adjusted && raw[1].conflict, '編集画面は保存した場所のまま描き、重なりは知らせるだけ (ほかの部品を動かさない)');
  const crowded = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, kind: 'button', controls: ['act:jump'], x: 0.5, y: 0.5, w: 0.6, h: 0.6, hidden: false }));
  assert(L.placeParts(crowded, { width: 300, height: 300, angle: 0 }).some(p => p.conflict), '置き場所が足りなければ衝突として知らせる');
});

await test('初期配置: 担当の部品だけで操作領域を埋め、重ならず、領域の外へ出ない (全ゲーム・全担当)', () => {
  const dir = new URL('../../apps/game-profiles/', import.meta.url);
  const views = [{ width: 374, height: 690, angle: 0 }, { width: 320, height: 480, angle: 0 }, { width: 430, height: 820, angle: 0 }];
  let checked = 0;
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(new URL(name, dir), 'utf8'));
    if (!Array.isArray(p.actions) || !Array.isArray(p.groups)) continue;
    const assigned = {};
    for (const g of p.groups) if (/^P[1-4]$/.test(g.role)) assigned[g.role] = [...(assigned[g.role] ?? []), ...p.actions.filter(a => a.group === g.id).map(a => a.id)];
    const g = game(assigned, p);
    for (const slot of Object.keys(assigned)) {
      const allowed = L.allowedControls(g, slot);
      const visible = L.visibleParts(L.standardLayout(g, allowed), allowed);
      for (const view of views) {
        const placed = L.placeParts(visible, view, false);
        for (const r of placed) assert(r.left >= -0.5 && r.top >= -0.5 && r.left + r.width <= view.width + 0.5 && r.top + r.height <= view.height + 0.5, `領域の外: ${name} ${slot} ${r.id}`);
        for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert(!L.rectsOverlap(placed[i], placed[j]), `重なり: ${name} ${slot} ${placed[i].id}/${placed[j].id}`);
      }
      checked++;
    }
  }
  assert(checked > 100, `担当の数: ${checked}`);
  // Minecraft の P3 (ボタン6つ) は 2列×3段で、最初の段が大きい。領域の高さの9割以上を使う
  const mc = JSON.parse(fs.readFileSync(new URL('minecraft-java.json', dir), 'utf8'));
  const g = game({ P3: ['attack', 'use', 'inventory', 'drop', 'hotbar'] }, mc);
  const allowed = L.allowedControls(g, 'P3');
  const placed = L.placeParts(L.visibleParts(L.standardLayout(g, allowed), allowed), { width: 374, height: 690, angle: 0 }, false);
  assert.equal(new Set(placed.map(r => Math.round(r.left))).size, 2, '2列');
  assert(placed[0].height > placed[2].height, '最初の段が大きい');
  const used = Math.max(...placed.map(r => r.top + r.height)) - Math.min(...placed.map(r => r.top));
  assert(used > 690 * 0.9, `領域の高さを使い切る: ${used}`);
});

await test('編集の幾何: ほかの部品を固定したまま、いちばん近い空きへ収め、ぶつかる直前で拡大を止める (仕様 1-4)', () => {
  const bounds = { left: 0, top: 0, width: 300, height: 300 };
  const stone = { left: 100, top: 100, width: 100, height: 100 };
  const free = { left: 10, top: 10, width: 50, height: 50 };
  assert.deepEqual(L.findFreeSpot(free, [stone], bounds, 4), free, '空いていればそのまま');
  const onTop = { left: 120, top: 110, width: 50, height: 50 };
  const spot = L.findFreeSpot(onTop, [stone], bounds, 4);
  assert(spot && !L.rectsOverlap(spot, stone, 4), '重ならない場所へ');
  assert.deepEqual(spot, { left: 120, top: 46, width: 50, height: 50 }, 'いちばん近いのは石の上');
  assert.equal(L.findFreeSpot({ left: 0, top: 0, width: 290, height: 290 }, [stone], bounds, 4), null, '置ける場所がなければ null (元の位置に戻す)');
  // 右へ広げると石の手前で止まる。縦は止まらずに変えられる
  const from = { left: 10, top: 120, width: 50, height: 40 };
  const r = L.limitResize(from, { left: 10, top: 110, width: 250, height: 60 }, [stone], bounds, 4);
  assert(Math.abs(r.left + r.width - 96) < 0.5, `石の手前で止まる: ${r.left + r.width}`);
  assert.deepEqual([r.top, r.height], [110, 60], '片方が限界でも、もう片方は変えられる');
  const out = L.limitResize(from, { left: -50, top: 120, width: 110, height: 40 }, [], bounds, 4);
  assert.deepEqual([out.left, out.width], [0, 60], '領域の端で止まる');
  // 画面の長方形と本体座標の往復 (4方向)
  const part = { id: 'a', kind: 'button', controls: ['act:jump'], x: 0.3, y: 0.7, w: 0.2, h: 0.1, hidden: false };
  for (const angle of [0, 90, 180, 270]) {
    const view = angle % 180 ? { width: 800, height: 400, angle } : { width: 400, height: 800, angle };
    const [placed] = L.placeParts([part], view, false);
    const back = L.rectToPart(part, placed, view);
    close(back.x, 0.3); close(back.y, 0.7); close(back.w, 0.2); close(back.h, 0.1);
    const [sx, sy] = L.bodyToScreen(0.3, 0.7, angle), [bx, by] = L.screenToBody(sx, sy, angle);
    close(bx, 0.3); close(by, 0.7);
  }
});

await test('保存: ゲームごとに1件、明示保存だけを書き、破損・読めない保存先では標準に戻す (Q03/Q13/Q33)', () => {
  const storage = memory();
  const store = L.createLayoutStore(storage);
  assert.equal(store.load(game()).source, 'standard');
  const layout = store.load(game()).layout;
  byId(layout, 'jump').x = 0.05;
  assert.equal(storage.map.size, 0, '読み込み・編集だけでは保存しない');
  assert(store.save(layout));
  const loaded = store.load(game());
  assert.equal(loaded.source, 'saved'); assert.equal(byId(loaded.layout, 'jump').x, 0.05);
  const other = { ...profile, id: 'other-game' };
  assert.equal(store.load(game({}, other)).source, 'standard', '別のゲームの保存と混ぜない');
  assert.deepEqual([...storage.map.keys()], ['recooplay.layout.test-game']);
  assert(store.reset('test-game')); assert.equal(store.load(game()).source, 'standard', '初期配置に戻せる');
  for (const broken of ['{', 'null', '[]', '{"schema":"recooplay.phone-layout","version":99}']) {
    storage.map.set('recooplay.layout.test-game', broken);
    const r = store.load(game());
    assert.equal(r.source, 'invalid'); assert.deepEqual(r.layout, L.standardLayout(game()), `破損: ${broken}`);
  }
  assert(!store.save({ ...layout, schema: 'x' }), '不正な値は保存しない');
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const blocked = L.createLayoutStore(denied);
  assert.equal(blocked.load(game()).source, 'standard', '保存先を読めなくても標準で表示する');
  assert.equal(blocked.save(layout), false);
});

await test('編集の操作: 画面上のドラッグを本体座標へ戻して動かし、大きさ・非表示・複製・ボタンの操作を変える。元は書き換えない (#50)', () => {
  const base = L.standardLayout(game());
  const before = JSON.stringify(base);
  // どの向きでも、画面で右へ動かすと画面で右へ動く (本体座標を経由した往復)
  for (const angle of [0, 90, 180, 270]) {
    const jump = byId(base, 'jump');
    const moved = byId(L.movePart(base, 'jump', 0.05, 0, angle), 'jump');
    const [ax] = L.bodyToScreen(jump.x, jump.y, angle), [bx, by] = L.bodyToScreen(moved.x, moved.y, angle), [, ay] = L.bodyToScreen(jump.x, jump.y, angle);
    close(bx - ax, 0.05); close(by - ay, 0);
  }
  const far = byId(L.movePart(base, 'jump', 5, 5, 0), 'jump');
  assert.deepEqual([far.x, far.y], [1, 1], '本体の外へは出さない');
  assert.deepEqual(byId(L.replacePart(base, { ...byId(base, 'jump'), w: 0.5, h: 0.3 }), 'jump'), { ...byId(base, 'jump'), w: 0.5, h: 0.3 });
  assert.equal(byId(L.setPartHidden(base, 'jump', true), 'jump').hidden, true);
  const twice = L.duplicatePart(L.duplicatePart(base, 'jump'), 'jump');
  assert.deepEqual(ids(twice).slice(-2), ['jump~2', 'jump~3']);
  assert.deepEqual(byId(twice, 'jump~3').controls, ['act:jump']);
  assert(L.parseLayout(JSON.parse(JSON.stringify(twice)), 'test-game').parts.some(p => p.id === 'jump~3'), '複製は検証を通る');
  const s = L.standardLayout(game());
  assert.deepEqual(byId(L.assignButton(base, 'jump', 'act:attack', s), 'jump').controls, ['act:attack']);
  assert.deepEqual(byId(L.assignButton(base, 'jump', 'act:nope', s), 'jump').controls, ['act:jump'], '定義にない操作は割り当てない');
  assert.deepEqual(byId(L.assignButton(base, 'jump', 'look:look', s), 'jump').controls, ['act:jump'], '視点はボタンに割り当てない');
  assert.equal(JSON.stringify(base), before, '編集の操作は元のレイアウトを書き換えない');
});

await test('描画: プレイは担当の部品だけを本体基準の位置で実入力へつなぎ、編集画面は実入力へつながない (#50)', () => {
  const layout = L.standardLayout(game());
  const g = game({ P1: ['forward', 'left', 'right', 'back', 'jump', 'look'] });
  const viewport = { width: 400, height: 600, angle: 0 };
  const bindings = { bindControl() {}, bindStick() {}, bindLook() { return () => {}; }, releaseAll() {} };
  const play = renderToStaticMarkup(createElement(LayoutController, { layout, game: g, slot: 'P1', bindings, viewport }));
  assert.match(play, /data-ctl="act:jump"/, '担当のボタンは実入力へつなぐ');
  assert(!play.includes('act:attack'), '担当外の部品は描かない');
  assert(!/inert/.test(play.split('>')[0]), 'プレイ画面は操作できる');
  const jump = byId(layout, 'jump'), width = jump.w * 400, height = jump.h * 600;
  assert(play.includes(`left:${jump.x * 400 - width / 2}px`) && play.includes(`top:${jump.y * 600 - height / 2}px`), '本体基準の位置に置く');
  assert(play.includes(`width:${width}px`) && play.includes(`height:${height}px`), '幅と高さを別々に持つ');
  const turned = renderToStaticMarkup(createElement(LayoutController, { layout, game: g, slot: 'P1', bindings, viewport: { width: 600, height: 400, angle: 90 } }));
  assert(turned.includes(`width:${width}px`), '縦横で同じ大きさ');
  const preview = renderToStaticMarkup(createElement(LayoutController, { layout, game: g, slot: 'P1', viewport }));
  assert(!preview.includes('data-ctl') && /inert/.test(preview.split('>')[0]), 'bindingsなしのプレビューは実入力へつながない');
  const editor = renderToStaticMarkup(createElement(LayoutEditor, { initial: layout, game: g, slot: 'P1', viewport, onSave: () => true, onCancel() {} }));
  assert(!editor.includes('data-ctl'), '編集画面は実入力へつながない');
  assert(editor.includes('data-part="jump"') && !editor.includes('data-part="attack"'), '編集できるのは担当の部品だけ');
  for (const text of ['保存', '破棄', '元に戻す', 'ゲームには送りません']) assert(editor.includes(text), text);
  // 編集画面は、プレイ画面と同じ場所・大きさで部品を描く (保存の前後で一致させる。仕様 1-1)
  const style = html => [...html.matchAll(/data-part="([^"]+)"[^>]*style="([^"]+)"/g)].map(m => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(style(editor), style(play.replace(/ data-part/g, ' data-part')), '編集とプレイで部品の位置・幅・高さが同じ');
  const empty = renderToStaticMarkup(createElement(LayoutController, { layout, game: game({}), slot: 'P1', bindings, viewport }));
  assert.match(empty, /担当する操作がありません/);
});

await test('複製: ボタンだけを複製し、スティック・視点パッドは複製しない (入力エンジンは1つずつしか持てない)', () => {
  const base = L.standardLayout(game());
  assert.equal(L.duplicatePart(base, 'move:stick'), base);
  assert.equal(L.duplicatePart(base, 'view:look'), base);
  assert.equal(L.duplicatePart(base, 'jump').parts.length, base.parts.length + 1);
});

// ここからは react-dom/client を最小限のDOMで動かし、つなぎ直しと解放の回数を数える
const {installDom} = await import('./fixtures/react-dom-lite.mjs');
const document = installDom();
const {createRoot} = await import(requireWebUrl('react-dom/client'));
const {act} = await import(requireWebUrl('react'));
function requireWebUrl(spec) {
  return new URL(`file:///${createRequire(new URL('../../apps/web/package.json', import.meta.url)).resolve(spec).replace(/\\/g, '/')}`).href;
}
function mount() {
  const container = document.createElement('div'); document.body.appendChild(container);
  return createRoot(container);
}

await test('プレイ: 同じ配置のまま描き直しても、スティック・視点パッドをつなぎ直さない (押している方向が離れない)', async () => {
  const g = game({ P1: ['forward', 'left', 'right', 'back', 'jump', 'look'] });
  const layout = L.standardLayout(g);
  const log = [];
  const bindings = { bindControl() { return () => {}; }, bindStick(el) { log.push(el ? 'stick' : 'stick-off'); }, bindLook() { log.push('look'); return () => log.push('look-off'); }, releaseAll() { log.push('release'); } };
  const props = { layout, game: g, slot: 'P1', bindings, viewport: { width: 400, height: 600, angle: 0 } };
  const root = mount();
  await act(() => root.render(createElement(LayoutController, props)));
  assert.deepEqual(log.sort(), ['look', 'stick']);
  log.length = 0;
  // ホストから状態が届くたびに、親は同じ値で描き直す
  for (let i = 0; i < 3; i++) await act(() => root.render(createElement(LayoutController, { ...props })));
  assert.deepEqual(log, [], '描き直しで解放・つなぎ直しをしない');
  await act(() => root.unmount());
  assert(log.includes('stick-off') && log.includes('look-off') && log.includes('release'), '外すときは解放する');
});

await test('プレイ: 保存値にスティック・視点パッドが複数あっても、実入力へつなぐのは1つずつ', async () => {
  const g = game({ P1: ['forward', 'left', 'right', 'back', 'look'] });
  const layout = L.standardLayout(g);
  layout.parts.push({ ...byId(layout, 'move:stick'), id: 'move:stick~2' }, { ...byId(layout, 'view:look'), id: 'view:look~2' });
  let sticks = 0, looks = 0;
  const bindings = { bindControl() { return () => {}; }, bindStick(el) { if (el) sticks++; }, bindLook() { looks++; return () => {}; }, releaseAll() {} };
  const root = mount();
  await act(() => root.render(createElement(LayoutController, { layout, game: g, slot: 'P1', bindings, viewport: { width: 400, height: 600, angle: 0 } })));
  assert.deepEqual([sticks, looks], [1, 1]);
  await act(() => root.unmount());
});

console.log(`${passed}/15 合格（スマホのレイアウトモデルと編集画面、OS入力なし）`);
