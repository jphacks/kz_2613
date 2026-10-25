import {createVirtualCursor} from './virtual-cursor.js';
import {SCREENS,SCREEN_TITLES,ROLES,GAMES,slotViews,navigate,joinUrl,screenOnGameUpdate,desktopView,desktopWarning,roleControls,profileNotice,roleView} from '../app-view.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ui={screen:'join',game:GAMES[0].id};
try{const saved=JSON.parse(localStorage.getItem('recooplay.app')||'{}');if(SCREENS.includes(saved.screen))ui.screen=saved.screen;}catch{}
let state=null,game=null,inject=null,ws=null,online=false;
const send=m=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
function setUi(next){
  if(next.game!==ui.game)send({type:'select_game',title:next.game});
  ui={...next,game:game?.title||next.game};
  try{localStorage.setItem('recooplay.app',JSON.stringify({screen:ui.screen}));}catch{}
  render();
}
// WebViewのフォーカス通知、epoch照合、OS入力との排他は従来どおりサーバーが判定する。
function sendFocus(){send({type:'focus',focused:document.hasFocus()});}
window.addEventListener('focus',sendFocus);window.addEventListener('blur',sendFocus);
function fit(){document.body.style.setProperty('--pc-scale',String(Math.min(innerWidth/1920,innerHeight/1080)));}
window.addEventListener('resize',fit);fit();
$('steps').innerHTML=SCREENS.map(s=>`<button data-go="${s}" aria-label="${SCREEN_TITLES[s]}">${{join:'参加',game:'選択',roles:'分担'}[s]}</button>`).join('');
$('games').innerHTML=`<button class="game-choice" data-game="minecraft-java" aria-label="Minecraft Java Editionを選択"><h2>Minecraft<br>Java Edition</h2><p>3人で、ひとつの冒険へ。</p><span class="selection">選択中</span></button>`;
$('gameSteps').innerHTML=GAMES[0].steps.map(s=>`<li>${esc(s)}</li>`).join('');
const shortRoles=['移動・ホスト','視点','アクション'];
function openDialog(dialog){document.querySelectorAll('dialog[open]').forEach(d=>d.close());dialog.showModal();}
$('settingsBtn').addEventListener('click',()=>openDialog($('settings')));
$('keyBindingsBtn').addEventListener('click',()=>{$('keyDetails').open=true;openDialog($('settings'));});
$('closeSettings').addEventListener('click',()=>$('settings').close());
$('connectionHelpBtn').addEventListener('click',()=>openDialog($('connectionHelp')));
$('settingsConnectionBtn').addEventListener('click',()=>openDialog($('connectionHelp')));
$('closeConnectionHelp').addEventListener('click',()=>$('connectionHelp').close());
$('reloadInfo').addEventListener('click',loadInfo);
$('openGameBtn').addEventListener('click',()=>send({type:'open_game'}));
$('nextBtn').addEventListener('click',()=>{
  const view=desktopView(ui,game);
  if(view==='join')setUi({...ui,screen:'game'});
  else if(view==='game')setUi({...ui,screen:'roles'});
  else if(view==='roles'&&game?.canPrepare)send({type:'prepare'});
});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-go],[data-game],[data-mode]');if(!el)return;
  if(el.dataset.go)setUi({...ui,screen:el.dataset.go});
  if(el.dataset.game)setUi({...ui,game:el.dataset.game});
  if(el.dataset.mode)send({type:'inject_mode',mode:el.dataset.mode});
});
function dialogRemote(control){
  const d=document.querySelector('dialog[open]');if(!d)return false;
  if(control==='ESC'){d.close();return true;}
  const controls=[...d.querySelectorAll('button,a,summary')].filter(e=>e.getClientRects().length&&!e.disabled);
  const i=controls.indexOf(document.activeElement);
  if(control==='ENTER'){document.activeElement?.click();return true;}
  if(['LEFT','RIGHT','UP','DOWN'].includes(control)&&controls.length){const step=['LEFT','UP'].includes(control)?-1:1;controls[(i+step+controls.length)%controls.length].focus();return true;}
  return false;
}
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  const control={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN',Enter:'ENTER',Escape:'ESC'}[e.key];
  // 矢印は補助ナビにフォーカスがあっても移動する。Enterはボタン本来の実行を優先する。
  if(control&&(control!=='ENTER'||!e.target.closest('button,a,summary'))){e.preventDefault();setUi(navigate(ui,control));}
});
function render(){
  const view=desktopView(ui,game),slots=slotViews(state?.slots),count=slots.filter(s=>s.state==='connected').length;
  document.body.dataset.view=view;document.body.dataset.phase=game?.phase||'lobby';
  const generated=game?.profile && game.profile.id!=='minecraft-java';
  document.querySelector('.key-samples').hidden=!!generated;
  $('roles').innerHTML=ROLES.map((r,i)=>{
    const role=roleView(game,r.slot);
    return `<article class="role-column"><b>${r.slot}</b><h3>${esc(generated?role.title:shortRoles[i])}</h3><p>${generated?esc(role.lines[0]||'担当する操作なし'):esc(['歩く・跳ぶ','カメラを動かす','攻撃・使う'][i])}</p></article>`;
  }).join('');
  const titles={join:`${count}人<br>参加中！`,game:'ゲーム選択を<br>しよう！',roles:'分担しよう！',preparing:'準備中<span class="ellipsis">...</span>',ready:'準備完了！',coop:'協力プレイ中',paused:'一時停止中'};
  $('screenTitle').innerHTML=titles[view];
  $('leftRule').hidden=!['game','roles'].includes(view);
  $('explanation').innerHTML=view==='game'?'右側にあるゲーム一覧から<br>遊びたいゲームを<br>選択してください！':view==='roles'?'操作をそれぞれの<br>スマホに分けよう！':'';
  $('secondary').innerHTML=view==='game'?'今回遊べるのは<br>Minecraft Java Editionです。<br>選んだら次へ進もう！':view==='roles'?'ゲームを準備してから<br>スマホでスタート！':'';
  $('nextBtn').hidden=!['join','game','roles'].includes(view);
  $('nextBtn').textContent={join:'OK',game:'このゲームで遊ぶ',roles:'ゲームを開く・準備する'}[view]||'';
  $('nextBtn').disabled=view==='roles'&&!game?.canPrepare;
  $('blockedStart').hidden=view!=='preparing';$('readyInstruction').hidden=view!=='ready';
  $('joinGuide').hidden=view!=='join';$('gameStage').hidden=view!=='game';$('roleStage').hidden=view!=='roles';
  $('playerStage').hidden=['game','roles'].includes(view);
  $('openGameBtn').hidden=!['preparing','ready','paused'].includes(view);
  const notes={preparing:'Minecraftでワールドを準備してください。',coop:'止めるときはホストのスマホでPAUSE。',paused:'ホストのスマホで再開できます。'};
  $('actionNote').textContent=view==='preparing'&&generated?'選んだゲームで準備してください。':notes[view]||'';
  $('openGameBtn').textContent=generated?'選んだゲームを前面にする':'Minecraftを前面にする';
  $('inputSafety').textContent=(generated?'選択したゲーム':'Minecraft')+'が前面のときだけ操作を送ります。停止時はすべてのキーとボタンを離します。';
  const keyWarnings=game?.keys?.warnings||[];
  const warning=desktopWarning(game,inject,online||!state)||(keyWarnings.length?'キー設定に注意が必要です。「操作設定」で実際に送るキーを確認してください。':'');
  const notices=[warning,profileNotice(game?.profile)].filter(Boolean).join(' ');
  $('warning').hidden=!notices;$('warning').textContent=notices;
  $('steps').hidden=!['join','game','roles'].includes(view);
  document.querySelectorAll('#steps button').forEach(b=>b.setAttribute('aria-current',b.dataset.go===ui.screen?'page':'false'));
  $('players').innerHTML=slots.map((s,i)=>`<article class="player ${s.state}${view==='preparing'&&s.host&&s.state==='connected'?' pending':''}" data-slot="${s.slot}"><div class="player-badge">${s.state==='empty'?'参加待ち':s.state==='lost'?'切断中':view==='ready'?'条件OK':view==='preparing'?(s.host?'準備中！':'接続済み'):'接続完了！'}</div><div class="player-info"><p>プレイヤー${i+1}</p><p>${esc(generated?roleView(game,s.slot).title:s.title)}</p><p class="player-device">機種：${esc(s.device||'未接続')}</p></div><svg class="player-arrow" viewBox="0 0 36 30" aria-hidden="true"><path d="M2 2H34L18 27Z"/></svg><div class="character"><b>${esc(generated?roleView(game,s.slot).title:shortRoles[i])}</b><span>${s.slot}</span></div></article>`).join('');
  $('inputState').textContent=inject?.mode==='off'?'ゲームへの入力はOFFです':inject?.mode==='test'?'診断用の入力先です':inject?.active?'ゲームへの入力はONです（'+(generated?'選択したゲーム':'Minecraft')+'が前面のときだけ）':'ゲームへの入力を停止しています';
  $('keyWarnings').textContent=keyWarnings.join('。');
  $('keyBindings').innerHTML=ROLES.map(r=>`<h3>${esc(r.slot)}：${esc(roleView(game,r.slot).title)}</h3><ul>${roleView(game,r.slot).lines.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`).join('');
  $('gameStatus').textContent=game?.prepareStatus||'';
  document.querySelectorAll('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===inject?.mode)));
  $('hotkey').textContent=inject?.emergencyHotkeyError?'緊急停止キーを登録できません':`緊急停止：${inject?.emergencyHotkey||'Ctrl+Alt+F12'}`;
}
async function loadInfo(){
  try{
    const response=await fetch('/api/info');if(!response.ok)throw Error('QR取得失敗');
    const info=await response.json(),u=joinUrl(info);
    $('qr').innerHTML=u?u.qr:'<span>接続先が見つかりません</span>';
    $('helpQr').innerHTML=$('qr').innerHTML;
    $('url').textContent=u?.url||'';
    $('urlNote').textContent=!u?'PCのWi-Fiとモバイルホットスポットを確認してください。':u.hotspot?'PCのモバイルホットスポットへ接続してください。':'PCと同じWi-Fiへ接続してください。';
    $('wifi').textContent=info.wifi?`Wi-Fi：${info.wifi.ssid}`:'';
  }catch{$('qr').innerHTML='<span>QRを取得できません<br>接続方法をご確認ください</span>';$('helpQr').innerHTML=$('qr').innerHTML;$('url').textContent='';$('urlNote').textContent='PCホストとネットワークを確認し、QRを取得し直してください。';}
}
const cursor=createVirtualCursor();
function connect(){
  ws=new WebSocket(`ws://${location.host}/ws`);
  ws.onopen=()=>{online=true;send({type:'monitor',page:'app'});sendFocus();};
  ws.onclose=()=>{online=false;game=null;inject=null;state=null;render();$('warning').hidden=false;$('warning').textContent=desktopWarning(game,inject,false);setTimeout(connect,1000);};
  ws.onmessage=ev=>{
    const m=JSON.parse(ev.data),previousPhase=game?.phase;
    if(m.type==='state'){state=m;game=m.game;inject=m.inject;}
    else if(m.type==='game')game=m.game;
    if(m.type==='state'||m.type==='game'){ui=screenOnGameUpdate(ui,previousPhase,game);render();}
    else if(m.type==='remote'&&m.route==='app'&&m.epoch===game?.epoch){
      if(m.state==='down'&&dialogRemote(m.control))return;
      if(!cursor.handle(m)&&m.state==='down')setUi(navigate(ui,m.control));
    }
  };
}
render();loadInfo();setInterval(loadInfo,5000);connect();
