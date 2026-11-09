// Reactプレイ・編集プレビューの共通モデル。OS入力・通信なし。
import assert from 'node:assert/strict';
import { controllerLayout } from '../../apps/web/src/controller-layout.ts';

const game = {
  profile: { id: 'test', name: '試験', actions: [
    { id: 'forward', type: 'button', group: 'move' },
    { id: 'right', type: 'button', group: 'move' },
    { id: 'attack', type: 'button', group: 'actions' },
    { id: 'wheel', type: 'wheel', group: 'actions' },
    { id: 'look', type: 'mouseDelta', group: 'look' },
    { id: 'unknown', type: 'future', group: 'actions' },
  ] },
  assigned: { P1: ['forward', 'right', 'wheel', 'look', 'missing', 'unknown'], P2: ['attack'] },
  keys: { actions: { forward: { label: 'W' }, right: { label: 'D' } } },
};
const layout = controllerLayout(game, 'P1');
const parts = layout.flatMap(g => g.parts);
assert.equal(parts.filter(p => p.kind === 'stick').length, 1);
assert.deepEqual(parts.find(p => p.kind === 'stick').directions.map(d => d.control), ['act:forward', 'act:right']);
assert.deepEqual(parts.filter(p => p.kind === 'button').map(p => p.control), ['act:wheel:up', 'act:wheel:down']);
assert.equal(parts.filter(p => p.kind === 'look').length, 1);
assert(!JSON.stringify(layout).includes('attack'), '担当外操作を描かない');
assert.deepEqual(controllerLayout(game, 'P3'), []);
assert.deepEqual(controllerLayout({ ...game, assigned: undefined }, 'P1'), []);
assert.equal(controllerLayout(game, 'P2')[0].parts[0].control, 'act:attack');
assert.equal(parts.find(p => p.kind === 'stick').directions[0].label, 'Wキー');
assert.equal(game.profile.actions.length, 6, '正本の操作定義を変更しない');
const repeatedLook={...game,profile:{...game.profile,actions:[...game.profile.actions,{id:'look2',type:'mouseDelta',group:'other'}]},assigned:{P1:['look','look2']}};
assert.equal(controllerLayout(repeatedLook,'P1').flatMap(g=>g.parts).filter(p=>p.kind==='look').length,1,'複数の視点定義でも実パッドを重複生成しない');
console.log('合格: 担当境界・未知操作・スティック・ホイール・視点・キー表示の共通描画モデル');
