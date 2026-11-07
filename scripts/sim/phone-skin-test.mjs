// スマホのカラースキンの保存・復元と不正値の扱い (#159)。DOM・通信・OS入力なし。
import assert from 'node:assert/strict';
import { SKINS, applySkin, createSkinStore } from '../../apps/web-static/scripts/phone-skin.js';

function memory(initial) {
  const map = new Map(initial ? [['recooplay.skins', initial]] : []);
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
}

const store = createSkinStore(memory());
assert.equal(store.get('minecraft-java'), 'standard', '未設定は標準');
assert(store.set('minecraft-java', 'dark') && store.set('steam-238320', 'pop'));
assert.equal(store.get('minecraft-java'), 'dark', 'ゲームごとに復元する');
assert.equal(store.get('steam-238320'), 'pop');
assert.equal(store.get('other'), 'standard');
assert(!store.set('minecraft-java', 'unknown') && !store.set('', 'dark'), '不明なスキンとゲームは保存しない');
assert.equal(store.get('minecraft-java'), 'dark');
assert.equal(store.get('__proto__'), 'standard', '継承された項目を読まない');

for (const broken of ['{', '[]', 'null', '"dark"', '{"a":"unknown"}', '{"a":1}']) {
  assert.equal(createSkinStore(memory(broken)).get('a'), 'standard', `保存値が不正: ${broken}`);
}
const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
assert.equal(createSkinStore(denied).get('a'), 'standard', '保存先を読めなくても標準で表示する');
assert.equal(createSkinStore(denied).set('a', 'dark'), false);

const root = { dataset: {} };
applySkin(root, 'dark'); assert.equal(root.dataset.skin, 'dark');
applySkin(root, 'standard'); assert(!('skin' in root.dataset), '標準は属性を外して従来の配色へ戻す');
applySkin(root, 'pop'); applySkin(root, 'unknown'); assert(!('skin' in root.dataset));
assert.deepEqual(SKINS.map(s => s.id), ['standard', 'dark', 'pop']);
console.log('合格: スキンの保存・復元・不正値・標準への復帰');
