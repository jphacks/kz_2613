// PC アプリ画面の表示ロジック (apps/web-static/app-view.js) の試験。
// 参加状態・開始可否の表示が、ホストから届く状態 (state.slots / game.canReady など) と一致することを確かめる。
//   node scripts/sim/app-view-test.mjs

import assert from 'node:assert/strict';
import { SCREENS, slotViews, navigate, joinUrl, device, screenOnGameUpdate, keyLabel, roleControls, desktopView, desktopWarning, profileNotice, roleView, networkNotice, joinGuideView, slotDiagnosis, phoneAdvice, usesFixedRoles, shownSlots, gameList, gameCard, gameAction, launchView, rolesAction } from '../../apps/web-static/app-view.js';

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
const game = (connected, extra = {}) => ({ phase: 'lobby', required: 3, connected, canReady: connected.includes('P1') && connected.length >= 2, ...extra });

test('操作定義: 未検証でも開始できることと、確かめながら遊ぶ案内・分担できないゲームを区別する (#123)',()=>{
  for(const status of ['template','extracted','unverified']){
    const note=profileNotice({name:'試験ゲーム',status,controllerSupported:true});
    assert.match(note,/未検証/); assert.match(note,/確かめながら/); assert.doesNotMatch(note,/Readyできません/);
  }
  assert.equal(profileNotice({id:'minecraft-java',status:'device',controllerSupported:true}), '');
  assert.match(profileNotice({status:'device',controllerSupported:true}),/過去の実機記録/);
  assert.match(profileNotice({id:'generic',name:'Gamma',status:'template',controllerSupported:true}),/操作定義がないため.*WASD/);
  assert.match(profileNotice({name:'カードゲーム',status:'template',controllerSupported:false}),/マウス操作が中心/);
});

test('PC画面: 定期更新で手動移動を戻さず、準備・停止への遷移時だけ分担へ案内する',()=>{
  const ui={screen:'join',game:'minecraft-java'};
  assert.equal(screenOnGameUpdate(ui,'paused',{phase:'paused',title:'minecraft-java'}).screen,'join');
  assert.equal(screenOnGameUpdate(ui,'lobby',{phase:'preparing',title:'minecraft-java'}).screen,'roles');
  assert.equal(screenOnGameUpdate({...ui,screen:'game'},'coop',{phase:'paused',title:'minecraft-java'}).screen,'roles');
  assert.equal(screenOnGameUpdate(ui,'lobby',{phase:'lobby',title:'minecraft-java'}).screen,'join');
});

test('枠: 空き・接続中・切断中をサーバーの slots どおりに表示する', () => {
  const v = slotViews([slot('P1', true, 'iPhone'), slot('P2', false), { name: 'P3', assigned: false }, slot('P4', true)]);
  assert.deepEqual(v.map((s) => s.state), ['connected', 'lost', 'empty', 'connected']);
  assert.equal(v[0].host, true);
  assert.equal(v[0].device, 'iPhone');
  assert.equal(v[1].device, '', '切断中の端末の種類は出さない');
});

test('枠: 状態が届く前は全員空き', () => {
  assert.deepEqual(slotViews(undefined).map((s) => s.state), ['empty', 'empty', 'empty', 'empty']);
});

const mc = { id: 'minecraft-java', status: 'device', controllerSupported: true, groups: [{ id: 'movement', label: '移動' }, { id: 'look', label: '視点' }, { id: 'gameplay', label: '攻撃・使う' }, { id: 'inventory', label: '持ち物' }],
  actions: [{ id: 'forward', label: '前進', group: 'movement', type: 'button' }, { id: 'look', label: '視点', group: 'look', type: 'mouseDelta' }, { id: 'attack', label: '攻撃', group: 'gameplay', type: 'button' }, { id: 'drop', label: '捨てる', group: 'inventory', type: 'button' }] };

test('通信の注意: BluetoothでPCの音を出しているとき・途切れがちなスマホがあるときだけ出す (#131)', () => {
  assert.equal(networkNotice(null, null), '');
  assert.equal(networkNotice({ bluetoothAudio: false }, [{ name: 'P1', connected: true, net: { stalls: 2 } }]), '');
  assert.match(networkNotice({ bluetoothAudio: true }, []), /Bluetooth.*有線のイヤホン/);
  const n = networkNotice({ bluetoothAudio: false }, [
    { name: 'P1', connected: true, net: { stalls: 3 } }, { name: 'P2', connected: false, net: { stalls: 9 } }, { name: 'P3', connected: true, net: { stalls: 5 } }]);
  assert.match(n, /^P1・P3の通信が途切れがちです/);
});

test('通信の診断: 経路・往復時間・途切れ・再接続から状態と対処を示す (#70)', () => {
  const good = slotDiagnosis({ name: 'P1', rtcState: 'open', clientStats: { avg: 25, p95: 60 }, net: { stalls: 0 }, reconnects: 0 });
  assert.deepEqual([good.level, good.path, good.hints.length], ['ok', 'WebRTC', 0]);
  const bad = slotDiagnosis({ name: 'P2', rtcState: 'open', clientStats: { avg: 40, p95: 350 }, net: { stalls: 4 }, reconnects: 0 });
  assert.equal(bad.level, 'bad'); assert.match(bad.hints.join(), /Bluetooth.*ホットスポット/); assert.match(bad.hints.join(), /近づけ/);
  const ws = slotDiagnosis({ name: 'P3', rtcState: 'failed', clientStats: {}, net: { stalls: 0 }, reconnects: 5 });
  assert.equal(ws.level, 'warn'); assert.equal(ws.path, 'WebSocket'); assert.equal(ws.rtt, null);
  assert.match(ws.hints.join(), /読み込み直して/); assert.match(ws.hints.join(), /省電力/);
  assert.equal(phoneAdvice(null), '');
  assert.equal(phoneAdvice({ avg: 20, p95: 40, unacked: 0, path: 'rtc' }), '');
  assert.match(phoneAdvice({ avg: 150, p95: 500, unacked: 8, path: 'ws' }), /近づけ.*溜まって.*読み込み直して/);
});

test('参加の案内: ホットスポット・Wi-Fiの情報があれば ①Wi-Fi・②参加 の2つを並べる (#133)', () => {
  assert.deepEqual([joinGuideView({ urls: [] }).two, joinGuideView(null).two], [false, false], 'Wi-Fiの情報がなければ従来の1つ');
  const on = joinGuideView({ hotspot: { on: true }, wifi: { ssid: 'PC-1', qr: '<svg/>' } });
  assert.deepEqual([on.two, on.wifiQr, on.button], [true, '<svg/>', false]); assert.match(on.note, /PC-1/);
  const off = joinGuideView({ hotspot: { on: false }, wifi: { ssid: 'PC-1', qr: '<svg/>' } });
  assert.deepEqual([off.two, off.wifiQr, off.button], [true, null, true], 'OFFならONにするボタン'); assert.match(off.note, /②だけで/);
  assert.equal(joinGuideView({ hotspot: null, wifi: { ssid: 'X', qr: '<svg/>' } }).wifiQr, '<svg/>', 'config.json のWi-Fi');
});

test('人数: Minecraftは3人（P1〜P3）だけ固定の分担、2人・4人は操作定義の分担を表示する', () => {
  assert.equal(usesFixedRoles(null), true, '状態が届く前');
  assert.equal(usesFixedRoles({ profile: mc, fixedControls: true }), true);
  assert.equal(usesFixedRoles({ profile: mc, fixedControls: false, connected: ['P1', 'P2'] }), false);
  assert.equal(usesFixedRoles({ profile: mc, fixedControls: false, connected: [] }), true, '誰もいなければ基本の3人');
  assert.equal(usesFixedRoles({ profile: { ...mc, id: 'other' }, fixedControls: false }), false);
  const two = { phase: 'lobby', profile: { ...mc, assignment: { P1: ['forward'], P2: ['look', 'attack', 'drop'] } }, fixedControls: false, connected: ['P1', 'P2'], keys: { actions: { attack: { label: '左クリック' } } } };
  assert.equal(roleView(two, 'P2').title, '視点・攻撃・使う・持ち物');
  assert.match(roleView(two, 'P2').lines.join(), /攻撃（左クリック）/);
  assert.equal(roleView({ ...two, fixedControls: true }, 'P2').title, '視点', '3人では固定の分担');
  assert.equal(roleView(two, 'P3').title, '担当なし');
});

test('人数: 担当を表示する枠は参加者、なければ接続中の枠', () => {
  assert.deepEqual(shownSlots(null), [], '誰もいなければ 3 人分の固定の表示を出さない (#126)');
  assert.deepEqual(shownSlots({ connected: ['P4', 'P1'] }), ['P1', 'P4']);
  assert.deepEqual(shownSlots({ connected: ['P1', 'P2', 'P3', 'P4'], participants: ['P1', 'P2'] }), ['P1', 'P2'], 'Readyの後に来た人は含めない');
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

test('分担の確認: 操作定義があれば分担の案 (協力プレイ中は決まった分担) を、グループと実際のキーで出す', () => {
  const profile = { id: 'test-pseudo', groups: [{ id: 'movement', label: '移動' }, { id: 'gameplay', label: 'アクション' }],
    actions: [{ id: 'left', label: '左', group: 'movement', type: 'button' }, { id: 'aim', label: '狙い', group: 'gameplay', type: 'mouseDelta' }, { id: 'zoom', label: 'ズーム', group: 'gameplay', type: 'wheel' }],
    assignment: { P1: ['left'], P2: ['aim', 'zoom'], P3: [] } };
  const keys = { actions: { left: { label: 'A' } } };
  const v = roleView({ profile, keys }, 'P1');
  assert.equal(v.title, '移動');
  assert.deepEqual(v.lines, ['移動：左（A）']);
  assert.deepEqual(roleView({ profile, keys }, 'P2').lines, ['アクション：狙い（マウス移動）、ズーム（ホイール）']);
  assert.equal(roleView({ profile, keys }, 'P3').title, '担当なし');
  assert.deepEqual(roleView({ phase:'coop', profile, keys, assigned: { P1: ['aim'] } }, 'P1').lines, ['アクション：狙い（マウス移動）']);
  assert.deepEqual(roleView({phase:'lobby',profile,keys,assigned:{P1:['aim']}},'P1').lines,['移動：左（A）']);
  assert.ok(roleView({ profile: { id: 'minecraft-java' }, keys: null }, 'P1').lines.includes('ダッシュ（Ctrl）'));
});

test('リモコン: 右・Enter で次、左・Esc で前の画面へ。端で止まる', () => {
  let ui = { screen: 'join', game: null };
  ui = navigate(ui, 'RIGHT');
  assert.equal(ui.screen, 'game');
  assert.ok(ui.game, '次へ進むとゲームが選ばれる');
  ui = navigate(ui, 'ENTER');
  assert.equal(ui.screen, 'roles');
  assert.equal(navigate(ui, 'ENTER').screen, 'roles');
  // 選択画面では左右がタイルの移動になるので、戻るのは Esc (#121)
  assert.equal(navigate(navigate(ui, 'ESC'), 'ESC').screen, 'join');
  assert.equal(navigate(navigate(ui, 'LEFT'), 'LEFT', gameList([])).screen, 'game', '選択画面の左は画面を戻らない');
  assert.equal(navigate({ screen: 'join' }, 'ESC').screen, 'join');
  assert.deepEqual(SCREENS, ['join', 'game', 'roles']);
});

const detected = [
  { id: 'steam:413150', name: 'Stardew Valley', source: 'steam', verified: false, launchable: true },
  { id: 'epic:Gamma', name: 'Gamma', source: 'epic', verified: false, launchable: true },
];

test('ゲーム一覧: 固定のMinecraftの後に検出したゲームを並べ、検出しただけの項目は未検証にする', () => {
  const list = gameList(detected);
  assert.deepEqual(list.map((g) => g.id), ['minecraft-java', 'steam:413150', 'epic:Gamma']);
  assert.equal(list[0].launchable, false, 'Minecraftは手動起動');
  // ランチャーを見つけたら Minecraft にも画像を付ける。見つからなくても項目は残す (#128)
  assert.equal(gameList([], { detected: true, image: true })[0].image, true);
  assert.equal(gameList([], { detected: false, image: false })[0].image, false);
  assert.equal(gameCard(gameList([], { detected: true, image: true })[0], null, null).image, '/api/game-image?id=minecraft-java');
  assert.deepEqual(gameList(undefined).map((g) => g.id), ['minecraft-java'], '一覧が届く前・スマホ向けでない状態でもMinecraftは選べる');
  assert.equal(gameList([{ id: 'x', name: 'X', source: 'steam', verified: 'yes', launchable: true }])[1].verified, false, 'true以外は未検証');
  const card = gameCard(list[1], 'steam:413150', null);
  assert.deepEqual(card.badges, ['Steam', '未検証']);
  assert.equal(card.selected, true);
  assert.equal(gameCard(list[0], 'steam:413150', null).badges.includes('未検証'), false);
  // タイルの画像はホストが項目 ID で返す。ない項目は頭文字 (#121)
  const withImage = gameCard(gameList([{ id: 'steam:1', name: 'Terraria', source: 'steam', launchable: true, image: true }])[1], null, null);
  assert.equal(withImage.image, '/api/game-image?id=steam%3A1');
  assert.equal(card.image, null); assert.equal(card.initial, 'S');
  assert.equal(gameCard({ id: 'x', name: '「ゼルダ」', source: 'steam' }, null, null).initial, 'ゼ', '記号は飛ばす');
});

test('ゲーム一覧: 起動の状態は選んだ項目への要求だけを表示する', () => {
  const launch = { id: 'steam:413150', state: 'launching', message: 'Stardew Valleyを起動しています' };
  assert.equal(launchView(launch, 'steam:413150').title, '起動中…');
  assert.equal(launchView(launch, 'epic:Gamma'), null);
  assert.equal(launchView({ ...launch, state: 'failed' }, 'steam:413150').title, '起動できませんでした');
  assert.equal(launchView({ ...launch, state: 'timeout' }, 'steam:413150').title, '起動を確認できませんでした');
  assert.equal(launchView({ ...launch, state: 'unknown' }, 'steam:413150'), null);
  assert.equal(launchView(null, 'steam:413150'), null);
});

test('ゲーム一覧: 主ボタンは選ぶだけで起動せず、メンバー・分担の画面へ進む (#109)', () => {
  const list = gameList(detected), ui = { screen: 'game', game: 'steam:413150' };
  assert.deepEqual(gameAction(ui, { launch: null }, list), { kind: 'next', label: 'このゲームで遊ぶ' });
  assert.equal(gameAction({ ...ui, game: 'minecraft-java' }, null, list).kind, 'next');
  assert.equal(gameAction({ ...ui, game: 'pseudo-game' }, null, list).kind, 'none', '一覧にない選択では前進しない');
});

test('分担の画面: 決定 → 起動 → 準備の順に案内し、失敗時は再起動と手動準備を出す (#109)', () => {
  const list = gameList(detected);
  const base = { phase: 'lobby', title: 'steam:413150', connected: ['P1', 'P2'], lineupOk: false, canLaunch: false, canPrepare: false, launch: null };
  assert.equal(rolesAction(null, list).disabled, true);
  assert.deepEqual([rolesAction(base, list).kind, rolesAction(base, list).disabled], ['confirm', false]);
  const alone = rolesAction({ ...base, connected: ['P1'] }, list);
  assert.equal(alone.disabled, true); assert.match(alone.note, /2人以上/);
  assert.equal(rolesAction({ ...base, connected: ['P2', 'P3'] }, list).disabled, true, 'P1 がいなければ決定できない');
  const ok = { ...base, lineupOk: true, canLaunch: true };
  assert.deepEqual(rolesAction(ok, list), { kind: 'launch', label: 'ゲームを起動する', id: 'steam:413150', disabled: false });
  assert.equal(rolesAction({ ...ok, launch: { id: 'epic:Gamma', state: 'started' } }, list).kind, 'launch', '別の項目の起動結果を流用しない');
  const launching = rolesAction({ ...ok, canLaunch: false, launch: { id: 'steam:413150', state: 'launching', message: '起動しています' } }, list);
  assert.equal(launching.kind, 'wait'); assert.equal(launching.disabled, true, '起動中は押せない');
  const failed = rolesAction({ ...ok, launch: { id: 'steam:413150', state: 'timeout', message: '手動で起動してください' } }, list);
  assert.equal(failed.kind, 'launch'); assert.match(failed.label, /もう一度/); assert.equal(failed.alt.kind, 'prepare'); assert.match(failed.note, /確認できません/);
  const started = rolesAction({ ...ok, canPrepare: true, launch: { id: 'steam:413150', state: 'started', message: '前面にしました' } }, list);
  assert.deepEqual([started.kind, started.disabled, started.note], ['prepare', false, '前面にしました']);
  const mc = rolesAction({ ...ok, title: 'minecraft-java', canPrepare: true }, list);
  assert.equal(mc.kind, 'prepare'); assert.match(mc.note, /手動で起動/);
  assert.equal(rolesAction({ ...ok, phase: 'preparing' }, list).kind, 'none', '準備中は起動・準備ボタンを出さない');
});

test('分担の画面: 準備中に参加者が変わったら、分担の画面で決定し直す (#109)', () => {
  assert.equal(desktopView({ screen: 'join' }, { phase: 'preparing', lineupOk: false }), 'roles');
  assert.equal(desktopView({ screen: 'join' }, { phase: 'preparing', lineupOk: true, canReady: true }), 'ready');
  assert.equal(desktopView({ screen: 'join' }, { phase: 'preparing', lineupOk: true, canReady: false }), 'preparing');
});

test('役割の入れ替え: 固定の分担は担当 (roleOf) で表示し、一時停止中は入れ替えの画面を開ける (#47)', () => {
  const g = { phase: 'lobby', profile: mc, fixedControls: true, connected: ['P1', 'P2', 'P3'], roleOf: { P1: 'P1', P2: 'P3', P3: 'P2' } };
  assert.equal(roleView(g, 'P2').title, 'アクション', 'P2 が P3 の担当になる');
  assert.equal(roleView(g, 'P3').title, '視点');
  assert.equal(roleView({ ...g, roleOf: undefined }, 'P2').title, '視点', '入れ替えなし');
  const paused = { phase: 'paused', roleAck: ['P2', 'P3'] };
  assert.equal(desktopView({ screen: 'join', swap: true }, paused), 'roles');
  assert.equal(desktopView({ screen: 'join', swap: false }, paused), 'paused');
  assert.equal(desktopView({ screen: 'join', swap: true }, { phase: 'coop' }), 'coop', '協力プレイ中は開かない');
  const back = rolesAction(paused, gameList([]));
  assert.equal(back.kind, 'back'); assert.match(back.note, /P2・P3のスマホで/);
  assert.match(rolesAction({ phase: 'paused', roleAck: [] }, gameList([])).note, /再開/);
});

test('リモコン: 選択画面は横3列のタイルを、左右で隣・上下で1行動き、端で止まる (#121)', () => {
  const games = Array.from({ length: 7 }, (_, i) => ({ id: `steam:${i + 1}`, name: `G${i + 1}`, source: 'steam', launchable: true }));
  const list = gameList(games); // Minecraft + 7 本 = 8 件 (3・3・2 の 3 行)
  const at = (id, c) => navigate({ screen: 'game', game: id }, c, list).game;
  assert.equal(at('minecraft-java', 'RIGHT'), 'steam:1');
  assert.equal(at('minecraft-java', 'LEFT'), 'minecraft-java', '左端で止まる');
  assert.equal(at('minecraft-java', 'DOWN'), 'steam:3', '1 行下 (3 つ先)');
  assert.equal(at('steam:3', 'UP'), 'minecraft-java');
  assert.equal(at('minecraft-java', 'UP'), 'minecraft-java', '上端で止まる');
  assert.equal(at('steam:5', 'DOWN'), 'steam:7', '下の行が短いときは最後の項目へ');
  assert.equal(at('steam:7', 'DOWN'), 'steam:7', '最後の行で止まる');
  assert.equal(at('steam:7', 'RIGHT'), 'steam:7', '最後で止まる');
  assert.equal(navigate({ screen: 'game', game: 'gone' }, 'DOWN', list).game, 'minecraft-java', '選択が一覧にないときは先頭へ');
  assert.equal(navigate({ screen: 'join', game: 'minecraft-java' }, 'DOWN', list).game, 'minecraft-java', '選択画面以外では変えない');
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
  assert.equal(desktopView({screen:'roles'},{phase:'preparing',canReady:false}),'preparing');
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
  assert.match(desktopWarning(g,{mode:'off'}),/入力が止まっています.*入力を再開する/);
  assert.match(desktopWarning(g,{mode:'test'}),/確認用/);
  assert.match(desktopWarning(g,{mode:'on'},false),/接続が切れ/);
  assert.match(desktopWarning({...g,reason:'emergency stop'},{mode:'off'}),/緊急停止/);
  assert.match(desktopWarning({...g,phase:'paused',connected:['P1','P2'],participants:['P1','P2','P3']},{mode:'on'}),/P3の再接続/);
  assert.equal(desktopWarning({...g,phase:'paused',connected:['P1','P2'],participants:['P1','P2']},{mode:'on',active:true}),'','2人で始めたら3人目を待たない');
  assert.match(desktopWarning({...g,phase:'preparing',connected:['P1']},{mode:'on'}),/2人以上/);
  assert.match(desktopWarning(g,{emergencyHotkeyError:'失敗'}),/登録できません/);
  assert.equal(desktopWarning(g,{mode:'on',active:true}),'');
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 合格 (app-view)`);
process.exit(failed ? 1 : 0);
