// 表示変更がReadyの権限・Pause・診断を開く際の解放を壊さないことを確認する。
// OS入力・ブラウザ描画・実端末の検証には使わない。
import assert from 'node:assert/strict';
import {createPhoneView} from '../../apps/web-static/scripts/phone-view.js';
class Element {
  constructor(id='') { this.id=id; this.dataset={}; this.style={}; this.handlers={}; this.textContent=''; this.hidden=false; this.children=[]; this.classList={toggle:(name,on)=>{this[name]=on;}}; }
  addEventListener(name,fn) { this.handlers[name]=fn; }
  replaceChildren(...nodes) { this.children=nodes; }
  append(...nodes) { for(const node of nodes)node.parentElement=this; }
  insertAdjacentHTML() {}
  querySelectorAll() { return []; }
  showModal() { this.open=true; }
  close() { this.open=false; }
}
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const views=['v-remote','v-wait','v-gen'].map(el);
el('pad').parentElement=el('lookHome');
const sens=new Element('sens');
globalThis.document={getElementById:el,createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:{dataset:{}},querySelector:()=>sens,querySelectorAll:s=>s==='.view'?views:[]};
let released=0,diagnosticsOpened=0;
const render=createPhoneView({releaseAll:()=>released++,onDiagnosticsOpen:()=>diagnosticsOpened++,bindControl(){}});
// Minecraft の3人も操作定義の分担で操作画面を作る (#141)
const profile={id:'minecraft-java',name:'Minecraft',status:'device',controllerSupported:true,groups:[{id:'movement',label:'移動'},{id:'look',label:'視点'},{id:'gameplay',label:'アクション'}],
  actions:[{id:'forward',label:'前進',group:'movement',type:'button'},{id:'look',label:'視点',group:'look',type:'mouseDelta'},{id:'attack',label:'攻撃',group:'gameplay',type:'button'}],
  assignment:{P1:['forward'],P2:['look'],P3:['attack']}};
const assigned={P1:['forward'],P2:['look'],P3:['attack']};
const base={phase:'lobby',connected:['P1','P2','P3'],canPrepare:true,canReady:false,canResume:false,readyReasons:[],remoteRoute:'app',profile};
function update(slot,game){render({me:slot,isHost:slot==='P1',game:{...base,...game}});}
update('P1',{});
assert.equal(el('v-remote').show,true);
assert.equal(el('startBtn').textContent,'ゲームを開く・準備する');
assert.equal(el('startBtn').disabled,false);
update('P1',{phase:'preparing',canReady:false,readyReasons:['対象ゲームを前面にしてください']});
assert.equal(el('startBtn').disabled,true);
assert.match(el('remoteNote').textContent,/対象ゲームを前面/);
update('P1',{phase:'preparing',canReady:true});
assert.equal(el('startBtn').disabled,false);
assert.match(el('startBtn').textContent,/Ready/);
assert.equal(el('openGameBtn').hidden,true,'前面なら予備ボタンを隠す');
update('P1',{phase:'paused',canResume:true,inputTarget:true,prepareStatus:'Windowsが前面化を許可しませんでした。ゲームを手動で前面にしてください'});
assert.equal(el('openGameBtn').hidden,false,'前面でないときは予備ボタンを出す');
assert.equal(el('startBtn').disabled,false,'再開で前面化を要求できる');
assert.match(el('remoteNote').textContent,/手動で前面/,'前面化失敗の案内を出す');
update('P1',{phase:'preparing',canReady:true,connected:['P1','P2']});
assert.equal(el('startBtn').textContent,'Ready・2人で操作を始める');
update('P1',{phase:'preparing',canReady:true,connected:['P1','P2','P3','P4']});
assert.equal(el('startBtn').textContent,'Ready・4人で操作を始める');
update('P4',{phase:'coop',participants:['P1','P2','P3'],connected:['P1','P2','P3','P4']});
assert.equal(el('v-wait').show,true,'Ready後の参加者へ操作画面を出さない');
assert.equal(el('waitTitle').textContent,'次の開始から参加します');
assert.equal(el('waitCharacter').src,'/assets/characters/red.png');
assert.match(el('players1').innerHTML,/P4（自分）/);
update('P2',{phase:'preparing',canReady:true});
assert.equal(el('v-wait').show,true);
assert.equal(el('v-remote').show,false);
assert.equal(el('waitCharacter').src,'/assets/characters/green.png');
assert.equal(el('waitRole').textContent,'視点');
assert.equal(el('waitHeading').textContent,'接続完了!!');
update('P3',{phase:'coop',participants:['P1','P2','P3'],assigned});
assert.equal(el('v-gen').show,true,'Minecraftの3人も操作定義から作った画面');
assert.equal(document.body.dataset.view,'v-gen');
// 担当を入れ替えても、ホスト (P1) はどの担当でも一時停止でき、ホスト以外には出さない
update('P1',{phase:'coop',participants:['P1','P2','P3'],assigned:{P1:['look'],P2:['forward'],P3:['attack']}});
assert.equal(el('genPause').hidden,false,'ホストは視点担当でもPAUSEできる');
update('P2',{phase:'coop',participants:['P1','P2','P3'],assigned:{P1:['look'],P2:['forward'],P3:['attack']}});
assert.equal(el('genPause').hidden,true,'移動担当への交換でホスト権を渡さない');
update('P3',{phase:'paused',reason:'host pause'});
assert.equal(el('v-wait').show,true);
assert.equal(el('waitHeading').textContent,'一時停止中');
assert.equal(el('waitTitle').textContent,'一時停止中');
el('status').textContent='接続OK';
const before=released;
el('phoneSettingsBtn').handlers.click();
assert.equal(diagnosticsOpened,1);
assert.equal(released,before,'診断開始専用の停止処理を使う');
assert.equal(el('phoneDiagnostics').open,true);
assert.match(el('phoneConnection').textContent,/接続OK/);
el('closePhoneDiagnostics').handlers.click();
assert.equal(el('phoneDiagnostics').open,false);
update('P2',{profile:{id:'reference',name:'参考用',status:'unverified',controllerSupported:false}});
assert.equal(el('inputWarn').style.display,'block');
// 分担できないゲーム (マウス操作だけ) の案内は警告欄に出し、担当の欄には混ぜない (#123)
assert.match(el('inputWarn').textContent,/分担できる操作がありません/);
assert.doesNotMatch(el('waitRole').textContent,/分担できる操作がありません/);
update('P2',{profile:{id:'reference',name:'参考用',status:'unverified',controllerSupported:true}});
assert.match(el('inputWarn').textContent,/未検証.*確かめながら/);
// 案内は選んだゲームの名前で出し、Minecraft・ワールドの文言を残さない (#140)
update('P1',{phase:'preparing',canReady:true,titleName:'Outlast',remoteRoute:'game',inputTarget:true,profile:{id:'steam:238320',name:'Outlast',status:'unverified',controllerSupported:true}});
const shown=['remoteRoute','openGameBtn','inputWarn','remoteNote'].map((id)=>el(id).textContent).join(' ');
assert.match(shown,/Outlastのメニューを操作中/);
assert.match(shown,/Outlastを前面にする/);
assert.doesNotMatch(shown,/Minecraft|ワールド/);
console.log('合格: ホスト準備・Ready可否・参加者待機・担当画面・Pause・診断前解放・未検証案内・ゲーム名の案内（8観点、OS入力なし）');
