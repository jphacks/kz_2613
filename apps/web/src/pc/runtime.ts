import {createVirtualCursor} from '../shared/input/virtual-cursor.ts';
import {createLifetime} from '../shared/input/lifetime.ts';
import {REMOTE_FOCUSABLE,usableControls,moveRemoteFocus,stepRemoteSelect,isRemoteSelect} from '../shared/input/remote-focus.ts';
import {byId} from '../shared/dom.ts';
import {GAMES,SCREENS,gameList,navigate,desktopView,rolesAction,gameAction,isRegistered,shownSlots,screenOnGameUpdate,pcEffects,joinGuideView} from '../shared/model/presentation.ts';
import {decodePcMessage,decodeHotspotResult} from '../shared/transport/pc-messages.ts';
import {decodePcInfo} from '../shared/transport/pc-info.ts';
import type {Slot,PhoneGame} from '../shared/contracts.ts';
import type {Navigation,HostState,InjectionState,UiAction,EffectState} from '../shared/model/domain.ts';
import {joinStatus, type PcSnapshot, type PcInfo} from './model';
declare global {interface Window {showHostNotice?:(text:string)=>void}}
const isSlot=(slot:string|undefined):slot is Slot=>!!slot&&['P1','P2','P3','P4'].includes(slot);
export function startDesktopController({renderView,renderInfo}:{renderView(snapshot:PcSnapshot):void;renderInfo(info:PcInfo|null|undefined,message:string,busy:boolean):void}) {
const $=byId,lifetime=createLifetime(),abort=new AbortController();
let disposed=false,infoRequest=0;
// swap: 一時停止中に担当を入れ替える画面を開いているか (#47)
let ui:Navigation={screen:'join',game:GAMES[0].id,swap:false},swapPick:Slot|null=null;
// 起動したら必ず参加画面 (QR) から始める。前回の画面は覚えない (#126)。以前の版が保存した値は消す
try{localStorage.removeItem('recooplay.app');}catch{}
let state:HostState|null=null,game:PhoneGame|null=null,inject:InjectionState|null=null,ws:WebSocket|null=null,online=false,shownGame:string|null='';
// PCアプリがホストを再起動したときの案内 (#222)。状態の更新で消さず、一定時間だけ出す
let hostNotice='';
window.showHostNotice=(text:string)=>{hostNotice=text;render();lifetime.timeout(()=>{if(hostNotice===text){hostNotice='';render();}},30000);};
let infoPort:number|null=null;
// 選択画面の一覧。インストール済みのゲームはPC画面にだけ届く (state.games)
const games=()=>gameList(state?.games,state?.minecraft);
const send=(m:object)=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
function setUi(next:Navigation){
  if(ui.screen==='join'&&next.screen!=='join'&&!joinStatus(state).canAdvance)return;
  if(next.game!==ui.game)send({type:'select_game',title:next.game});
  // 分担の画面から戻ったら決定を取り消す (戻った後の古い決定で起動・準備しない、#109)
  if(ui.screen==='roles'&&next.screen!=='roles'&&game?.phase==='lobby'&&(game.lineupOk||game.lineupDisconnected?.length))send({type:'unconfirm_lineup'});
  ui={...next,game:game?.title||next.game};
  render();
}
// WebViewのフォーカス通知、epoch照合、OS入力との排他は従来どおりサーバーが判定する。
function sendFocus(){send({type:'focus',focused:document.hasFocus()});}
lifetime.listenWindow('focus',sendFocus);lifetime.listenWindow('blur',sendFocus);
function fit(){document.body.style.setProperty('--pc-scale',String(Math.min(innerWidth/1920,innerHeight/1080)));}
lifetime.listenWindow('resize',fit);fit();
function openDialog(dialog:HTMLDialogElement){document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());dialog.showModal();}
function openSettings(showKeys: boolean) {
  const keys = $<HTMLDetailsElement>('keyDetails');
  if (showKeys) keys.open = true;
  openDialog($<HTMLDialogElement>('settings'));
  if (showKeys) keys.querySelector('summary')?.focus();
  else $('settingsTitle').focus();
}
lifetime.listen($('settingsBtn'), 'click',()=>openSettings(false));
lifetime.listen($('keyBindingsBtn'), 'click',()=>openSettings(true));
// 分担の作り方 (#432)。規則とモデルの分担を切り替え、モデルの分担を作り直す。可否はホストが判定する (ロビーで決める前だけ)
lifetime.listen($('remakePresetBtn'), 'click',()=>send({type:'remake_preset'}));
lifetime.listenDocument('click',e=>{
  const source=(e.target instanceof Element?e.target:null)?.closest<HTMLElement>('[data-preset]')?.dataset.preset;
  if(source==='rule'||source==='model')send({type:'preset_source',source});
});
lifetime.listen($('closeSettings'), 'click',()=>$<HTMLDialogElement>('settings').close());
lifetime.listen($('connectionHelpBtn'), 'click',()=>openDialog($<HTMLDialogElement>('connectionHelp')));
lifetime.listen($('settingsConnectionBtn'), 'click',()=>openDialog($<HTMLDialogElement>('connectionHelp')));
lifetime.listen($('closeConnectionHelp'), 'click',()=>$<HTMLDialogElement>('connectionHelp').close());
// 全員の接続のリセット (#412)。確認してから送る。ホストは全員を切断し、枠とホストを最初から決め直す (#213)
lifetime.listen($('resetAllBtn'), 'click',()=>openDialog($<HTMLDialogElement>('resetConfirm')));
lifetime.listen($('resetCancel'), 'click',()=>$<HTMLDialogElement>('resetConfirm').close());
lifetime.listen($('resetConfirmBtn'), 'click',()=>{send({type:'reset'});$<HTMLDialogElement>('resetConfirm').close();});
lifetime.listen($('reloadInfo'), 'click',loadInfo);
// ホットスポットを ON にする (#133)。押したときだけ。PC 本体の画面からだけ受け付ける
// 結果は QR の下の案内に出す (失敗したときは、次に成功するまで出し続ける)
let hotspotMessage='';
lifetime.listen($('hotspotBtn'), 'click',async()=>{
  renderInfo(undefined,'ホットスポットをONにしています…',true);
  try{
    const response=await fetch('/api/hotspot',{method:'POST',signal:abort.signal});
    if(!response.ok)throw new Error('ホットスポット操作の応答がありません');
    const r=decodeHotspotResult(await response.json());
    if(!r)throw new Error('ホットスポット操作の応答形式が違います');
    hotspotMessage=r.ok?'':r.error||'ホットスポットをONにできませんでした';
  }catch{hotspotMessage='ホットスポットをONにできませんでした';}
  if(!disposed)loadInfo();
});
lifetime.listen($('openGameBtn'), 'click',()=>send({type:'open_game'}));
lifetime.listen($('refreshGamesBtn'), 'click',()=>send({type:'refresh_games'}));
// 手動で登録するゲーム (#49・#56)。実行ファイルは PC の前の人が Windows のファイル選択の画面で選ぶ
let manualMessage='';
lifetime.listen($('addGameBtn'), 'click',()=>{manualMessage='ファイルを選ぶ画面を開きました（PCの画面で選んでください）';send({type:'add_game'});renderGames();});
lifetime.listen($('renameGameBtn'), 'click',()=>{
  const g=games().find(x=>x.id===ui.game);if(!g)return;
  $<HTMLInputElement>('renameInput').value=g.name;openDialog($<HTMLDialogElement>('renameGame'));$<HTMLInputElement>('renameInput').select();
});
lifetime.listen($('renameCancel'), 'click',()=>$<HTMLDialogElement>('renameGame').close());
lifetime.listen($('renameForm'), 'submit',()=>{
  const name=$<HTMLInputElement>('renameInput').value.trim();
  if(name&&isRegistered(ui.game))send({type:'rename_game',id:ui.game,name});
});
lifetime.listen($('removeGameBtn'), 'click',()=>{
  const g=games().find(x=>x.id===ui.game);if(!g)return;
  if(!confirm(`「${g.name}」の登録を解除しますか？（ゲーム本体は削除しません）`))return;
  send({type:'remove_game',id:g.id});ui={...ui,game:null};manualMessage='';
});
// 選択画面の主ボタン・Enter。選ぶだけで起動せず、メンバー・分担の画面へ進む (#109)
function gameMain(){
  if(gameAction(ui,game,games()).kind==='next')setUi({...ui,screen:'roles'});
}
// 分担の画面の主ボタン・補助ボタン・Enter。決定は画面が見ているゲーム・メンバーを添えて送り、ホストが今と照合する。
// 起動は選んだ項目のIDだけを送る (起動方法はホストが決める)
function rolesRun(action:UiAction|undefined){
  if(!action||action.disabled)return;
  if(action.kind==='confirm'&&game)send({type:'confirm_lineup',title:game.title,members:game.connected,epoch:game.epoch});
  else if(action.kind==='launch')send({type:'launch_game',id:action.id});
  else if(action.kind==='prepare')send({type:'prepare'});
  else if(action.kind==='swap')setUi({...ui,swap:true});
  else if(action.kind==='back'){swapPick=null;setUi({...ui,swap:false});}
}
// リモコンで選んだ位置を、PCのマウス操作の後でも枠で見えるようにする (#294)。実際のマウスを押したら消す
function markRemoteFocus(){document.body.dataset.remoteNav='1';}
lifetime.listenDocument('pointerdown',e=>{if(e.isTrusted)delete document.body.dataset.remoteNav;});
// 分担の画面で選べるもの：主ボタン・補助ボタン・入れ替える列・キー設定の確認 (#294)
const roleControls=()=>usableControls(document.querySelectorAll<HTMLElement>('#nextBtn,#subBtn,#changePlayersBtn,#roleStage [data-swap],#keyBindingsBtn,#presetChoice button'));
function rolesRemote(c:string){
  const controls=roleControls(),active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(moveRemoteFocus(controls,active,c)){markRemoteFocus();return;}
  // 選んだものがあればそれを押す。何も選んでいないときは従来どおり主ボタンと同じ動作
  if(c==='ENTER'){if(active&&controls.includes(active))active.click();else rolesRun(rolesAction(game,games()));return;}
  if(c==='ESC'){if(game?.phase==='paused')rolesRun({kind:'back',label:''});else setUi(navigate(ui,c,games()));}
}
// ホストのリモコンとPCのキーボードで同じ動作にする
function remoteControl(c:string){
  const view=desktopView(ui,game);
  if(c==='ENTER'&&view==='game')gameMain();
  else if(view==='roles')rolesRemote(c);
  else setUi(navigate(ui,c,games()));
}
lifetime.listen($('changePlayersBtn'), 'click',()=>send({type:'change_players',epoch:game?.epoch}));
lifetime.listen($('subBtn'), 'click',()=>rolesRun(desktopView(ui,game)==='paused'?{kind:'swap',label:''}:rolesAction(game,games()).alt));
// 緊急停止などで入力が止まっているときの「入力を再開する」(#114)。PC の前で確かめてから再開させる鍵
const inputStopped=(view:string)=>['preparing','ready','paused'].includes(view)&&inject?.mode==='off';
lifetime.listen($('nextBtn'), 'click',e=>{
  const view=desktopView(ui,game);
  if(inputStopped(view)) {
    if(e.isTrusted)send({type:'inject_mode',mode:'on'});
  }
  else if(view==='join')setUi({...ui,screen:'game'});
  else if(view==='game')gameMain();
  else if(view==='roles')rolesRun(rolesAction(game,games()));
});
lifetime.listenDocument('click',e=>{
  // 分担の画面で 2 人の列を順に押すと担当を入れ替える (#47)。可否はホストが判定する
  const seat=(e.target instanceof Element ? e.target : null)?.closest<HTMLElement>('[data-swap]');
  if(seat&&game?.canSwap){
    const slot=seat.dataset.swap;
    if(!isSlot(slot))return;
    if(!swapPick||swapPick===slot)swapPick=swapPick===slot?null:slot;
    else{send({type:'swap_roles',a:swapPick,b:slot});swapPick=null;}
    render();return;
  }
  const el=(e.target instanceof Element ? e.target : null)?.closest<HTMLElement>('[data-go],[data-game],[data-mode]');if(!el)return;
  const go=SCREENS.find(id=>id===el.dataset.go);
  if(go){
    setUi({...ui,screen:go});
    if (ui.screen === go) $<HTMLDialogElement>('settings').close();
  }
  if(el.dataset.game)setUi({...ui,game:el.dataset.game});
  // スマホの仮想カーソルが生成したクリックには入力再開を許可しない。
  if(el.dataset.mode&&(el.dataset.mode==='off'||e.isTrusted))send({type:'inject_mode',mode:el.dataset.mode});
});
function dialogRemote(control:string){
  const d=document.querySelector<HTMLDialogElement>('dialog[open]');if(!d)return false;
  if(control==='ESC'){d.close();return true;}
  const controls=usableControls(d.querySelectorAll<HTMLElement>(REMOTE_FOCUSABLE));
  const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  // プルダウンは一覧を開けないので、◀▶で選択肢を切り替え、▲▼で次の項目へ移る (#294)
  if(stepRemoteSelect(active,control))return true;
  if(control==='ENTER'){if(!isRemoteSelect(active))active?.click();return true;}
  if(moveRemoteFocus(controls,active,control)){markRemoteFocus();return true;}
  return false;
}
lifetime.listenDocument('keydown',e=>{
  if(document.querySelector<HTMLDialogElement>('dialog[open]'))return;
  const seat=(e.target instanceof Element?e.target:null)?.closest<HTMLElement>('[data-swap]');
  if((e.key==='Enter'||e.key===' ')&&seat){e.preventDefault();seat.click();return;}
  const controls:Record<string,string>={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN',Enter:'ENTER',Escape:'ESC'};const control=controls[e.key];
  // 矢印は補助ナビにフォーカスがあっても移動する。Enterはボタン本来の実行を優先する。
  if(control&&(control!=='ENTER'||!(e.target instanceof Element ? e.target : null)?.closest<HTMLElement>('button,a,summary'))){e.preventDefault();remoteControl(control);}
});
function render(){
  if(game?.phase!=='paused'&&ui.swap)ui={...ui,swap:false};
  if(swapPick&&!shownSlots(game).includes(swapPick))swapPick=null;
  renderView({ui,state,game,inject,online,swapPick,hostNotice,infoPort,manualMessage,keyMessage});
  const view=desktopView(ui,game);document.body.dataset.view=view;document.body.dataset.phase=game?.phase||'lobby';
  const selected=document.querySelector<HTMLElement>('.game-choice.selected');
  if(shownGame!==ui.game){const first=shownGame==='';shownGame=ui.game;if(!first)fx(selected);selected?.scrollIntoView({block:'nearest'});}
  playEffects(view);
}
let effectState:EffectState|null=null;
function fx(el:HTMLElement|null){if(!el)return;el.classList.remove('fx-pop');void el.offsetWidth;el.classList.add('fx-pop');el.addEventListener('animationend',()=>el.classList.remove('fx-pop'),{once:true});}
function playEffects(view:string){
  const next={view,connected:(state?.slots||[]).filter(s=>s.connected).map(s=>s.name),lineupOk:!!game?.lineupOk};
  const e=pcEffects(effectState,next);effectState=next;
  for(const slot of e.joined)fx(document.querySelector<HTMLElement>(`.player[data-slot="${slot}"] .character-art`));
  if(e.lineup)document.querySelectorAll<HTMLElement>('.role-column').forEach(fx);
  if(e.screen)fx(document.querySelector<HTMLElement>('.state-banner'));
}
let keyMessage='';
function renderGames(){render();}
async function loadInfo(){
  const request=++infoRequest;
  try{
    const response=await fetch('/api/info',{signal:abort.signal});if(!response.ok)throw Error('Info request failed');
    const info=decodePcInfo(await response.json());if(!info)throw Error('Invalid host info');
    if(disposed||request!==infoRequest)return;
    infoPort=info.port;renderInfo(info,hotspotMessage,false);document.body.toggleAttribute('data-two-qr',joinGuideView(info).two);render();
  }catch{if(!disposed&&request===infoRequest)renderInfo(null,'',false);}
}
const cursor=createVirtualCursor({canLeave:()=>game?.remoteLeave===true,leave:at=>send({type:'remote_leave',...at})});
function connect(){
  if(disposed)return;
  const socket=new WebSocket(`ws://${location.host}/ws`);ws=socket;
  socket.onopen=()=>{if(disposed||ws!==socket)return;online=true;send({type:'monitor',page:'app'});sendFocus();};
  socket.onclose=()=>{if(disposed||ws!==socket)return;online=false;game=null;inject=null;state=null;render();lifetime.timeout(connect,1000);};
  socket.onerror=()=>{};
  socket.onmessage=ev=>{
    if(disposed||ws!==socket)return;
    try{
    const m=decodePcMessage(ev.data),previousPhase=game?.phase;
    if(!m){ws?.close();return;}
    if(m.type==='state'){state=m;game=m.game;inject=m.inject;}
    else if(m.type==='game')game=m.game;
    else if(m.type==='key_result'){keyMessage=m.ok?'':'（保存できませんでした。この実行の間だけ使います）';render();}
    else if(m.type==='manual_result'){manualMessage=m.message||'';renderGames();lifetime.timeout(()=>{if(manualMessage===m.message){manualMessage='';renderGames();}},6000);}
    if(m.type==='state'||m.type==='game'){ui=screenOnGameUpdate(ui,previousPhase,game);render();}
    else if(m.type==='remote'&&m.route==='app'&&m.epoch===game?.epoch){
      if('state' in m&&m.state==='down'&&dialogRemote(m.control))return;
      if(!cursor.handle(m)&&'state' in m&&m.state==='down')remoteControl(m.control);
    }
    }catch{socket.close();}
  };
}
render();loadInfo();lifetime.interval(loadInfo,5000);connect();
return {
  dispose(){disposed=true;abort.abort();lifetime.dispose();cursor.dispose();ws?.close();delete window.showHostNotice;},
  setAutoResume: (on:boolean) => send({type:'auto_resume',on}),
  setRotation: (seconds:number) => send({type:'rotation',seconds}),
  setKey: (action:string,output:string|null) => send({type:'set_key',action,output}),
  resetKeys: () => send({type:'reset_keys'}),
};

}
