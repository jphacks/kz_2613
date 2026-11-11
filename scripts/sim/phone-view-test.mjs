// 表示変更がReadyの権限・Pause・診断を開く際の解放を壊さないことを確認する。
// OS入力・ブラウザ描画・実端末の検証には使わない。
import assert from 'node:assert/strict';
import {controllerHarness} from './fixtures/phone-harness.mjs';
const h=controllerHarness({viewOnly:true});
const render=h.render;
const view=()=>h.display.get();
// Minecraft の3人も操作定義の分担で操作画面を作る (#141)
const profile={id:'minecraft-java',name:'Minecraft',status:'device',controllerSupported:true,groups:[{id:'movement',label:'移動'},{id:'look',label:'視点'},{id:'gameplay',label:'アクション'}],
  actions:[{id:'forward',label:'前進',group:'movement',type:'button'},{id:'look',label:'視点',group:'look',type:'mouseDelta'},{id:'attack',label:'攻撃',group:'gameplay',type:'button'}],
  assignment:{P1:['forward'],P2:['look'],P3:['attack']}};
const assigned={P1:['forward'],P2:['look'],P3:['attack']};
const base={phase:'lobby',connected:['P1','P2','P3'],canPrepare:true,canReady:false,canResume:false,readyReasons:[],remoteRoute:'app',profile};
function update(slot,game){render({me:slot,isHost:slot==='P1',game:{...base,...game}});}
update('P1',{});
assert.equal((view().view==='v-remote'),true);
assert.equal(view().remote.startLabel,'ゲームを開く・準備する');
assert.equal(view().remote.startDisabled,false);
assert.match(view().remote.note,/このリモコンでも操作/);
assert.equal(view().inventory,null);
update('P1',{lineupOk:true,title:'minecraft-java',launch:{id:'minecraft-java',state:'started'}});
assert.match(view().remote.note,/準備する.*プレイ画面まで/);
update('P1',{phase:'preparing',canReady:false,readyReasons:['対象ゲームを前面にしてください']});
assert.equal(view().remote.startDisabled,true);
assert.match(view().remote.note,/対象ゲームを前面/);
update('P1',{phase:'preparing',canReady:true});
assert.equal(view().remote.startDisabled,false);
assert.match(view().remote.startLabel,/Ready/);
assert.match(view().remote.note,/「Ready」を押してください。$/);
assert.doesNotMatch(view().remote.note,/明示Ready|ホスト/);
update('P1',{phase:'preparing',title:'minecraft-java',remoteRoute:'game',canReady:true});
assert.equal(view().inventory,'Eキー');
update('P1',{phase:'preparing',title:'steam:945360',remoteRoute:'game',canReady:true});
assert.equal(view().inventory,null);
assert.equal(view().remote.openGameHidden,true,'前面なら予備ボタンを隠す');
update('P1',{phase:'paused',canResume:true,inputTarget:true,prepareStatus:'Windowsが前面化を許可しませんでした。ゲームを手動で前面にしてください'});
assert.equal(view().remote.openGameHidden,false,'前面でないときは予備ボタンを出す');
assert.equal(view().remote.startDisabled,false,'再開で前面化を要求できる');
assert.match(view().remote.note,/手動で前面/,'前面化失敗の案内を出す');
assert.match(view().remote.note,/「再開する」.*「協力プレイを終了（分担に戻る）」/);
update('P1',{phase:'paused',canResume:false,readyReasons:['参加者の再接続を待っています']});
assert.match(view().remote.note,/再接続.*協力プレイを終了/);
assert.doesNotMatch(view().remote.note,/「再開する」|RESUME/);
update('P1',{phase:'preparing',canReady:true,connected:['P1','P2']});
assert.equal(view().remote.startLabel,'Ready・2人で操作を始める');
update('P1',{phase:'preparing',canReady:true,connected:['P1','P2','P3','P4']});
assert.equal(view().remote.startLabel,'Ready・4人で操作を始める');
update('P4',{phase:'coop',participants:['P1','P2','P3'],connected:['P1','P2','P3','P4']});
assert.equal((view().view==='v-wait'),true,'Ready後の参加者へ操作画面を出さない');
assert.equal(view().wait.title,'次の開始から参加します。');
assert.equal(view().wait.character,'/assets/characters/red.png');
assert.match(view().remote.players.map(p=>p.label).join(' '),/P4（自分）/);
update('P2',{});
assert.match(view().wait.title,/ゲームと分担/);
assert.doesNotMatch(view().wait.title,/Ready/);
update('P2',{phase:'preparing',canReady:true});
assert.equal((view().view==='v-wait'),true);
assert.equal((view().view==='v-remote'),false);
assert.equal(view().wait.character,'/assets/characters/green.png');
assert.equal(view().wait.role,'マウス移動');
assert.equal(view().wait.heading,'接続完了!!');
assert.match(view().wait.title,/Ready/);
update('P3',{phase:'coop',participants:['P1','P2','P3'],assigned});
assert.equal((view().view==='v-gen'),true,'Minecraftの3人も操作定義から作った画面');
assert.equal(h.document.body.dataset.view,'v-gen');
// 担当を入れ替えても、ホスト (P1) はどの担当でも一時停止でき、ホスト以外には出さない
update('P1',{phase:'coop',participants:['P1','P2','P3'],assigned:{P1:['look'],P2:['forward'],P3:['attack']}});
assert.equal(!view().controllerHost,false,'ホストは視点担当でもPAUSEできる');
update('P2',{phase:'coop',participants:['P1','P2','P3'],assigned:{P1:['look'],P2:['forward'],P3:['attack']}});
assert.equal(!view().controllerHost,true,'移動担当への交換でホスト権を渡さない');
update('P3',{phase:'paused',reason:'host pause'});
assert.equal((view().view==='v-wait'),true);
assert.equal(view().wait.heading,'一時停止中');
assert.match(view().wait.title,/再開する/);
assert.doesNotMatch(view().wait.title,/Ready|一時停止中/);
update('P3',{phase:'paused',reason:'P2 disconnected',autoResume:true});
assert.match(view().wait.title,/制限時間内に全員が戻ると自動で再開/);
assert.match(view().wait.title,/P2 が切断/,'自動復帰を待つ理由（誰が切断したか）を参加者にも示す');
// 分担の決定後は「決めるまで」と案内しない (#301)
update('P3',{lineupOk:true});
assert.doesNotMatch(view().wait.title,/決めるまで/);
assert.match(view().wait.title,/ゲームを起動/);
render.connection('接続OK','ok');
const before=h.calls.release;
h.el('phoneSettingsBtn').fire('click');
assert.equal(h.calls.diagnostics,1);
assert.equal(h.calls.release,before,'診断開始専用の停止処理を使う');
assert.equal(h.el('phoneDiagnostics').open,true);
assert.match(h.el('status').textContent,/接続OK/);
h.el('closePhoneDiagnostics').fire('click');
assert.equal(h.el('phoneDiagnostics').open,false);
// ホストのリモコンでは上部に警告を出さず、下の状態欄にまとめてボタンの位置を固定する (#291)
update('P1',{profile:{id:'reference',name:'参考用',status:'unverified',controllerSupported:false}});
assert.equal(view().warning,'');
// 分担できないゲーム (マウス操作だけ) の案内は状態欄に出し、担当の欄には混ぜない (#123)
assert.match(view().remote.notice,/分担できる操作がありません/);
assert.doesNotMatch(view().wait.role,/分担できる操作がありません/);
update('P1',{profile:{id:'reference',name:'参考用',status:'unverified',controllerSupported:true}});
assert.match(view().remote.notice,/未検証.*確かめながら/);
// 前面の案内はゲームへ入力する段階だけ。ロビーでは出さない (#291)
const other={...profile,id:'other',status:'template',name:'別のゲーム'};
update('P1',{inputTarget:true,remoteRoute:'none',titleName:'別のゲーム',profile:other});
assert.doesNotMatch([view().warning,view().remote.route].join(' '),/別のゲームを前面|別のゲームになっていません/);
assert.match(view().remote.route,/PCアプリが前面にない/);
update('P2',{inputTarget:true,titleName:'別のゲーム',profile:other});
assert.equal(view().warning,'','ロビーの参加者に前面の警告を出さない');
// P2以降には、行えない操作を求める案内やホスト向けの情報を出さない (#238)
update('P1',{phase:'preparing',inputTarget:true,remoteRoute:'none',titleName:'別のゲーム',profile:other});
assert.equal(view().warning,'');assert.equal(view().remote.route,'別のゲームが前面にないため、リモコンは届きません');assert.equal(view().remote.routeBlocked,true);
assert.match(view().remote.notice,/確かめながら/);assert.equal(h.document.body.dataset.host,'true');
update('P1',{phase:'preparing',inputTarget:false,remoteRoute:'game',titleName:'別のゲーム',profile:other});
assert.doesNotMatch(view().remote.route,/前面/,'前面にあるのに前面にしてくださいと出さない');assert.equal(view().remote.routeBlocked,false);
update('P1',{phase:'preparing',inputTarget:false,remoteRoute:'none',readyReasons:['入力を再開するとReadyできます'],titleName:'別のゲーム',profile:other});
assert.equal(view().remote.route,'リモコンは今は届きません（入力を再開するとReadyできます）');
update('P1',{phase:'coop',participants:['P1','P2','P3'],assigned,inputTarget:true,titleName:'別のゲーム',profile:other});
assert.match(view().warning,/前面に戻すまで/,'協力プレイ中のホストには操作画面の上部に出す');
update('P2',{phase:'preparing',inputTarget:true,titleName:'別のゲーム',profile:other});
assert.match(view().warning,/ホストが戻すまでお待ちください/);assert.doesNotMatch(view().warning,/確かめながら/);assert.equal(h.document.body.dataset.host,'false');
update('P2',{phase:'preparing',inputTarget:null,profile:other});
assert.equal(view().warning,'');
update('P1',{inputTarget:null,profile:other});
assert.match(view().remote.notice,/確かめながら/);
// 案内は選んだゲームの名前で出し、Minecraft・ワールドの文言を残さない (#140)
update('P1',{phase:'preparing',canReady:true,titleName:'Outlast',remoteRoute:'game',inputTarget:true,profile:{id:'steam:238320',name:'Outlast',status:'unverified',controllerSupported:true}});
const shown=[view().remote.route,view().remote.openGameLabel,view().warning,view().remote.note].join(' ');
assert.match(shown,/Outlastのメニューを操作中/);
assert.match(shown,/Outlastを前面にする/);
assert.doesNotMatch(shown,/Minecraft|ワールド/);
// 時間制の役割交代: 予告で次の担当、交代の直後に新しい担当を短く示す。止まっている間・参加していない人には出さない (#161)
update('P2',{phase:'coop',participants:['P1','P2','P3'],assigned,rotationCount:0});
assert.equal(h.rotationNotice.get(),'');
update('P2',{phase:'coop',participants:['P1','P2','P3'],assigned,rotationCount:0,rotationSoon:true,rotationNext:{P1:['look'],P2:['attack'],P3:['forward']}});
assert.match(h.rotationNotice.get(),/まもなく担当を交代：次は「.+」/);
const rotated={P1:['look'],P2:['attack'],P3:['forward']};
update('P2',{phase:'coop',participants:['P1','P2','P3'],assigned:rotated,rotationCount:1});
assert.match(h.rotationNotice.get(),/担当が交代しました。あなたは「.+」/);
update('P2',{phase:'paused',participants:['P1','P2','P3'],assigned:rotated,rotationCount:1});
assert.equal(h.rotationNotice.get(),'','一時停止中は出さない');
update('P4',{phase:'coop',participants:['P1','P2','P3'],connected:['P1','P2','P3','P4'],assigned:rotated,rotationCount:1,rotationSoon:true,rotationNext:assigned});
assert.equal(h.rotationNotice.get(),'','参加していない人には出さない');
// Minecraftのランチャーもリモコンで操作できる (#287)
update('P1',{phase:'lobby',remoteRoute:'launcher'});
assert.match(view().remote.route,/ランチャーを操作中/);assert.equal(view().remote.routeBlocked,false);
// ゲームが前面に残っても、ホストのスマホだけでPCアプリへ戻れる (#292)
update('P1',{phase:'lobby',remoteRoute:'none',canOpenApp:true});
assert.equal(view().remote.openAppHidden,false);
update('P1',{phase:'lobby',remoteRoute:'app',canOpenApp:true});
assert.equal(view().remote.openAppHidden,true,'PCアプリが前面なら出さない');
update('P1',{phase:'paused',remoteRoute:'game',canOpenApp:true});
assert.equal(view().remote.openAppHidden,false);
update('P1',{phase:'lobby',remoteRoute:'none',canOpenApp:false});
assert.equal(view().remote.openAppHidden,true,'PCアプリから起動していなければ出さない');
update('P2',{phase:'lobby',remoteRoute:'none',canOpenApp:true});
assert.equal(view().remote.openAppHidden,true,'ホスト以外には出さない');
update('P1',{phase:'preparing',title:'minecraft-java',remoteRoute:'game',keys:{controls:{INV:{out:'KEY_R',label:'R'}}}});
assert.equal(view().inventory,'Rキー','リモコンもゲーム内設定の実際のキーを出す');
update('P1',{phase:'preparing',title:'minecraft-java',remoteRoute:'game',keys:{controls:{INV:null}}});
assert.equal(view().inventory,'送らない','未割り当てをEキーと偽らない');
update('P1',{phase:'preparing',title:'minecraft-java',remoteRoute:'game',keys:{controls:{}}});
assert.equal(view().inventory,'Eキー','Minecraftの未変更の割当はEを送る');
console.log('合格: ホスト準備・Ready可否・参加者待機・担当画面・Pause・診断前解放・未検証案内・ゲーム名の案内（8観点、OS入力なし）');
