// 表示変更がReadyの権限・Pause・診断を開く際の解放を壊さないことを確認する。
// OS入力・ブラウザ描画・実端末の検証には使わない。
import assert from 'node:assert/strict';
import {createPhoneView} from '../../apps/web-static/scripts/phone-view.js';
class Element {
  constructor(id='') { this.id=id; this.dataset={}; this.style={}; this.handlers={}; this.textContent=''; this.hidden=false; this.classList={toggle:(name,on)=>{this[name]=on;}}; }
  addEventListener(name,fn) { this.handlers[name]=fn; }
  replaceChildren(...nodes) { this.children=nodes; }
  append(...nodes) { for(const node of nodes)node.parentElement=this; }
  showModal() { this.open=true; }
  close() { this.open=false; }
}
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const views=['v-remote','v-wait','v-P1','v-P2','v-P3','v-gen'].map(el);
el('pad').parentElement=el('v-P2');
const sens=new Element('sens');
globalThis.document={getElementById:el,createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:{dataset:{}},querySelector:()=>sens,querySelectorAll:s=>s==='.view'?views:[]};
let released=0,diagnosticsOpened=0;
const render=createPhoneView({releaseAll:()=>released++,onDiagnosticsOpen:()=>diagnosticsOpened++,roleText:{P1:'移動',P2:'視点',P3:'アクション'},bindControl(){}});
const base={phase:'lobby',connected:['P1','P2','P3'],canPrepare:true,canReady:false,canResume:false,readyReasons:[],remoteRoute:'app'};
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
update('P3',{phase:'coop'});
assert.equal(el('v-P3').show,true);
assert.equal(document.body.dataset.view,'v-P3');
for (const role of ['P2','P3']) {
  update('P1',{phase:'coop',participants:['P1','P2','P3'],roleOf:{P1:role,P2:'P1',P3:role==='P2'?'P3':'P2'}});
  assert.equal(document.body.dataset.view,'v-'+role,'P1にも交換後の担当画面を出す');
  assert.equal(el('fixedPause').hidden,false,'ホストは視点・アクション担当でもPAUSEできる');
}
update('P2',{phase:'coop',participants:['P1','P2','P3'],roleOf:{P1:'P2',P2:'P1',P3:'P3'}});
assert.equal(document.body.dataset.view,'v-P1');
assert.equal(el('fixedPause').hidden,true,'移動担当への交換でホスト権を渡さない');
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
assert.match(el('inputWarn').textContent,/Readyできません/);
assert.doesNotMatch(el('waitRole').textContent,/Readyできません/);
console.log('合格: ホスト準備・Ready可否・参加者待機・担当画面・Pause・診断前解放・未検証案内（7観点、OS入力なし）');
