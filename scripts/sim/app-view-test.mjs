// PC アプリ画面の表示ロジック (apps/web-static/app-view.js) の試験。
// 参加状態・開始可否の表示が、ホストから届く状態 (state.slots / game.canStart) と一致することを確かめる。
//   node scripts/sim/app-view-test.mjs

import assert from 'node:assert/strict';
import { SCREENS, slotViews, startView, phaseView, navigate, joinUrl, device, screenOnGameUpdate, keyLabel, roleControls, desktopView, desktopWarning, profileNotice } from '../../apps/web-static/app-view.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(true);
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

const slot = (name, connected, ua = '') => ({ name, assigned: true, connected, ua });
const game = (connected, extra = {}) => ({ phase: 'lobby', required: 3, connected, canStart: connected.includes('P1') && connected.length >= 3, ...extra });

test('操作定義: 仮・抽出・未検証とReady不可を区別し過去の記録を新規合格にしない',()=>{
  for(const status of ['template','extracted','unverified']){
    const note=profileNotice({name:'試験ゲーム',status,controllerSupported:false});
    assert.match(note,/未検証/); assert.match(note,/Readyできません/);
  }
  assert.equal(profileNotice({id:'minecraft-java',status:'device',controllerSupported:true}), '');
  assert.match(profileNotice({status:'device',controllerSupported:false}),/過去の実機記録/);
});

test('PC画面: 定期更新で手動移動を戻さず、準備・停止への遷移時だけ分担へ案内する',()=>{
  const ui={screen:'join',game:'minecraft-java'};
  assert.equal(screenOnGameUpdate(ui,'paused',{phase:'paused',title:'minecraft-java'}).screen,'join');
  assert.equal(screenOnGameUpdate(ui,'lobby',{phase:'preparing',title:'minecraft-java'}).screen,'roles');
  assert.equal(screenOnGameUpdate({...ui,screen:'game'},'coop',{phase:'paused',title:'minecraft-java'}).screen,'roles');
  assert.equal(screenOnGameUpdate(ui,'lobby',{phase:'lobby',title:'minecraft-java'}).screen,'join');
});

test('枠: 空き・接続中・切断中をサーバーの slots どおりに表示する', () => {
  const v = slotViews([slot('P1', true, 'iPhone'), slot('P2', false), { name: 'P3', assigned: false }]);
  assert.deepEqual(v.map((s) => s.state), ['connected', 'lost', 'empty']);
  assert.equal(v[0].host, true);
  assert.equal(v[0].device, 'iPhone');
  assert.equal(v[1].device, '', '切断中の端末の種類は出さない');
});

test('枠: 状態が届く前は全員空き', () => {
  assert.deepEqual(slotViews(undefined).map((s) => s.state), ['empty', 'empty', 'empty']);
});

test('開始: canStart はサーバーの値をそのまま表示する (画面で判定し直さない)', () => {
  for (const connected of [[], ['P1'], ['P1', 'P2'], ['P2', 'P3'], ['P1', 'P2', 'P3']]) {
    const g = game(connected);
    assert.equal(startView(g, { mode: 'on' }).canStart, g.canStart, connected.join(','));
  }
  // 必要人数を 1 にした試験設定でもサーバーに従う
  assert.equal(startView({ ...game(['P1']), required: 1, canStart: true }, { mode: 'on' }).canStart, true);
  assert.equal(startView({ ...game(['P1', 'P2', 'P3']), canStart: false }, { mode: 'on' }).canStart, false);
});

test('開始: できない理由を示す (ホスト不在・人数不足)', () => {
  assert.match(startView(game(['P2', 'P3']), { mode: 'on' }).reasons.join(), /ホスト（P1）/);
  assert.match(startView(game(['P1']), { mode: 'on' }).reasons.join(), /あと 2 人/);
  assert.deepEqual(startView(game(['P1', 'P2', 'P3']), { mode: 'on' }).reasons, []);
});

test('開始: 入力が常時ONでなければ注意を出す', () => {
  assert.equal(startView(game(['P1', 'P2', 'P3']), { mode: 'off' }).notes.length, 1);
  assert.equal(startView(game(['P1', 'P2', 'P3']), { mode: 'on' }).notes.length, 0);
});

test('進行: 協力プレイ中は入力先の状態に応じて案内する', () => {
  const coop = { ...game(['P1', 'P2', 'P3']), phase: 'coop' };
  assert.match(phaseView(coop, { mode: 'on', active: true }).detail, /送っています/);
  assert.match(phaseView(coop, { mode: 'on', active: false }).detail, /前面/);
  assert.match(phaseView(coop, { mode: 'off', active: false }).detail, /OFF/);
});

test('キー表示: ホストの keys (ゲームのキー設定) に合わせ、来るまでは初期のキーを出す', () => {
  assert.equal(keyLabel(null, 'SPRINT'), 'Ctrl');
  const keys = { source: 'options', warnings: [], controls: { SPRINT: { out: 'KEY_Q', label: 'Q' }, DROP: { out: 'KEY_R', label: 'R' }, USE: null } };
  assert.equal(keyLabel(keys, 'SPRINT'), 'Q');
  assert.equal(keyLabel(keys, 'USE'), '送らない');
  assert.ok(roleControls('P1', keys).includes('ダッシュ（Q）'));
  assert.ok(roleControls('P3', keys).includes('捨てる（R）'));
  assert.ok(roleControls('P1').includes('移動スティック（W/A/S/D）'));
});

test('進行: 一時停止の理由を表示する', () => {
  const p = (reason) => phaseView({ ...game(['P1']), phase: 'paused', reason }, { mode: 'on' }).detail;
  assert.match(p('host pause'), /ホストが一時停止/);
  assert.match(p('P2 disconnected'), /P2 の通信が切れました/);
  assert.match(p('emergency stop'), /緊急停止/);
  assert.match(p('app focus'), /PC アプリの画面に戻った/);
  const lobby = phaseView({ ...game(['P1']), phase: 'lobby', reason: 'game change' }, { mode: 'on' });
  assert.match(lobby.detail, /ゲームを変えた.*分担はそのまま/);
});

test('進行: テストモードをMinecraftへの入力中と誤表示しない', () => {
  const coop = { ...game(['P1', 'P2', 'P3']), phase: 'coop' };
  for (const active of [false, true]) {
    const view = phaseView(coop, { mode: 'test', active });
    assert.match(view.detail, /疑似ゲーム画面/);
    assert.doesNotMatch(view.detail, /Minecraft に操作を送っています/);
  }
});

test('リモコン: 右・Enter で次、左・Esc で前の画面へ。端で止まる', () => {
  let ui = { screen: 'join', game: null };
  ui = navigate(ui, 'RIGHT');
  assert.equal(ui.screen, 'game');
  assert.ok(ui.game, '次へ進むとゲームが選ばれる');
  ui = navigate(ui, 'ENTER');
  assert.equal(ui.screen, 'roles');
  assert.equal(navigate(ui, 'ENTER').screen, 'roles');
  assert.equal(navigate(navigate(ui, 'ESC'), 'LEFT').screen, 'join');
  assert.equal(navigate({ screen: 'join' }, 'ESC').screen, 'join');
  assert.deepEqual(SCREENS, ['join', 'game', 'roles']);
});

test('参加 URL: ホットスポットを優先する', () => {
  const info = { urls: [{ url: 'http://10.0.0.2:8080/', hotspot: false }, { url: 'http://192.168.137.1:8080/', hotspot: true }] };
  assert.equal(joinUrl(info).url, 'http://192.168.137.1:8080/');
  assert.equal(joinUrl({ urls: [] }), null);
});

test('端末の種類', () => {
  assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)'), 'iPhone');
  assert.equal(device('Mozilla/5.0 (Linux; Android 10; K)'), 'Android');
});

test('原案の5視覚状態: 3ページとサーバーの準備2状態を区別する',()=>{
  for(const screen of SCREENS)assert.equal(desktopView({screen},{phase:'lobby'}),screen);
  assert.equal(desktopView({screen:'roles'},{phase:'preparing',canReady:false,canStart:true}),'preparing');
  assert.equal(desktopView({screen:'join'},{phase:'preparing',canReady:true,hostReady:false}),'ready');
  assert.equal(desktopView({screen:'roles'},{phase:'preparing',hostReady:true}),'preparing');
});
test('進行の変化: 準備・Ready・協力・Pause・Endで古い状態を表示しない',()=>{
  const ui={screen:'roles'};
  assert.equal(desktopView(ui,{phase:'coop'}),'coop');
  assert.equal(desktopView(ui,{phase:'paused'}),'paused');
  assert.equal(desktopView(ui,{phase:'lobby'}),'roles');
  for(let count=0;count<=3;count++)assert.equal(slotViews(Array.from({length:count},(_,i)=>slot('P'+(i+1),true))).filter(s=>s.state==='connected').length,count);
});
test('本番の安全案内: 切断・緊急停止・入力OFF・前面喪失とテストを隠さない',()=>{
  const g={phase:'coop',connected:['P1','P2','P3']};
  assert.match(desktopWarning(g,{mode:'on',active:false,target:{process:'secret.exe'}}),/Minecraftを前面/);
  assert.doesNotMatch(desktopWarning(g,{mode:'on',active:false,target:{process:'secret.exe'}}),/secret\.exe/);
  assert.match(desktopWarning(g,{mode:'off'}),/OFF/);
  assert.match(desktopWarning(g,{mode:'test'}),/確認用/);
  assert.match(desktopWarning(g,{mode:'on'},false),/接続が切れ/);
  assert.match(desktopWarning({...g,reason:'emergency stop'},{mode:'off'}),/緊急停止/);
  assert.match(desktopWarning({...g,phase:'paused',connected:['P1','P2']},{mode:'on'}),/3人全員/);
  assert.match(desktopWarning(g,{emergencyHotkeyError:'失敗'}),/登録できません/);
  assert.equal(desktopWarning(g,{mode:'on',active:true}),'');
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 合格 (app-view)`);
process.exit(failed ? 1 : 0);
