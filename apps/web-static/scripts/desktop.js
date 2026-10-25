import {createVirtualCursor} from './virtual-cursor.js';
import {SCREENS,SCREEN_TITLES,GAMES,slotViews,navigate,joinUrl,joinGuideView,screenOnGameUpdate,desktopView,desktopWarning,gameLabel,keyLabel,profileNotice,roleView,networkNotice,slotDiagnosis,usesFixedRoles,shownSlots,SLOT_NAMES,MIN_PLAYERS,MAX_PLAYERS,gameList,gameCard,gameAction,isRegistered,gamesCountText,rolesAction} from '../app-view.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// swap: 一時停止中に担当を入れ替える画面を開いているか (#47)
let ui={screen:'join',game:GAMES[0].id,swap:false},swapPick=null;
// 起動したら必ず参加画面 (QR) から始める。前回の画面は覚えない (#126)。以前の版が保存した値は消す
try{localStorage.removeItem('recooplay.app');}catch{}
let state=null,game=null,inject=null,ws=null,online=false,gamesHtml='',shownGame='';
// 選択画面の一覧。インストール済みのゲームはPC画面にだけ届く (state.games)
const games=()=>gameList(state?.games,state?.minecraft);
const send=m=>{if(ws?.readyState===1)ws.send(JSON.stringify(m));};
function setUi(next){
  if(next.game!==ui.game)send({type:'select_game',title:next.game});
  // 分担の画面から戻ったら決定を取り消す (戻った後の古い決定で起動・準備しない、#109)
  if(ui.screen==='roles'&&next.screen!=='roles'&&game?.lineupOk&&game.phase==='lobby')send({type:'unconfirm_lineup'});
  ui={...next,game:game?.title||next.game};
  render();
}
// WebViewのフォーカス通知、epoch照合、OS入力との排他は従来どおりサーバーが判定する。
function sendFocus(){send({type:'focus',focused:document.hasFocus()});}
window.addEventListener('focus',sendFocus);window.addEventListener('blur',sendFocus);
function fit(){document.body.style.setProperty('--pc-scale',String(Math.min(innerWidth/1920,innerHeight/1080)));}
window.addEventListener('resize',fit);fit();
$('steps').innerHTML=SCREENS.map(s=>`<button data-go="${s}" aria-label="${SCREEN_TITLES[s]}">${{join:'参加',game:'選択',roles:'分担'}[s]}</button>`).join('');
$('gameSteps').innerHTML=GAMES[0].steps.map(s=>`<li>${esc(s)}</li>`).join('');
const shortRoles=['移動・ホスト','視点','アクション'];
const character=(i)=>`<div class="character-art art-${i}" aria-hidden="true"><img src="/assets/characters/${['blue','green','purple','red'][i]}.png" alt=""></div>`;
function openDialog(dialog){document.querySelectorAll('dialog[open]').forEach(d=>d.close());dialog.showModal();}
$('settingsBtn').addEventListener('click',()=>openDialog($('settings')));
$('keyBindingsBtn').addEventListener('click',()=>{$('keyDetails').open=true;openDialog($('settings'));});
$('closeSettings').addEventListener('click',()=>$('settings').close());
$('connectionHelpBtn').addEventListener('click',()=>openDialog($('connectionHelp')));
$('settingsConnectionBtn').addEventListener('click',()=>openDialog($('connectionHelp')));
$('closeConnectionHelp').addEventListener('click',()=>$('connectionHelp').close());
$('reloadInfo').addEventListener('click',loadInfo);
// ホットスポットを ON にする (#133)。押したときだけ。PC 本体の画面からだけ受け付ける
// 結果は QR の下の案内に出す (失敗したときは、次に成功するまで出し続ける)
let hotspotMessage='';
$('hotspotBtn').addEventListener('click',async()=>{
  $('hotspotBtn').disabled=true;$('qrNote').hidden=false;$('qrNote').textContent='ホットスポットをONにしています…';
  try{
    const r=await (await fetch('/api/hotspot',{method:'POST'})).json();
    hotspotMessage=r.ok?'':r.error||'ホットスポットをONにできませんでした';
  }catch{hotspotMessage='ホットスポットをONにできませんでした';}
  $('hotspotBtn').disabled=false;loadInfo();
});
$('openGameBtn').addEventListener('click',()=>send({type:'open_game'}));
$('refreshGamesBtn').addEventListener('click',()=>send({type:'refresh_games'}));
// 手動で登録するゲーム (#49・#56)。実行ファイルは PC の前の人が Windows のファイル選択の画面で選ぶ
let manualMessage='';
$('addGameBtn').addEventListener('click',()=>{manualMessage='ファイルを選ぶ画面を開きました（PCの画面で選んでください）';send({type:'add_game'});renderGames();});
$('renameGameBtn').addEventListener('click',()=>{
  const g=games().find(x=>x.id===ui.game);if(!g)return;
  $('renameInput').value=g.name;openDialog($('renameGame'));$('renameInput').select();
});
$('renameCancel').addEventListener('click',()=>$('renameGame').close());
$('renameForm').addEventListener('submit',()=>{
  const name=$('renameInput').value.trim();
  if(name&&isRegistered(ui.game))send({type:'rename_game',id:ui.game,name});
});
$('removeGameBtn').addEventListener('click',()=>{
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
function rolesRun(action){
  if(!action||action.disabled)return;
  if(action.kind==='confirm')send({type:'confirm_lineup',title:game.title,members:game.connected,epoch:game.epoch});
  else if(action.kind==='launch')send({type:'launch_game',id:action.id});
  else if(action.kind==='prepare')send({type:'prepare'});
  else if(action.kind==='swap')setUi({...ui,swap:true});
  else if(action.kind==='back'){swapPick=null;setUi({...ui,swap:false});}
}
// ホストのリモコンとPCのキーボードで同じ動作にする
function remoteControl(c){
  const view=desktopView(ui,game);
  if(c==='ENTER'&&view==='game')gameMain();
  else if(c==='ENTER'&&view==='roles')rolesRun(rolesAction(game,games()));
  else setUi(navigate(ui,c,games()));
}
$('subBtn').addEventListener('click',()=>rolesRun(desktopView(ui,game)==='paused'?{kind:'swap'}:rolesAction(game,games()).alt));
// 緊急停止などで入力が止まっているときの「入力を再開する」(#114)。PC の前で確かめてから再開させる鍵
const inputStopped=view=>['preparing','ready','paused'].includes(view)&&inject?.mode==='off';
$('nextBtn').addEventListener('click',()=>{
  const view=desktopView(ui,game);
  if(inputStopped(view))send({type:'inject_mode',mode:'on'});
  else if(view==='join')setUi({...ui,screen:'game'});
  else if(view==='game')gameMain();
  else if(view==='roles')rolesRun(rolesAction(game,games()));
});
document.addEventListener('click',e=>{
  // 分担の画面で 2 人の列を順に押すと担当を入れ替える (#47)。可否はホストが判定する
  const seat=e.target.closest('[data-swap]');
  if(seat&&game?.canSwap){
    const slot=seat.dataset.swap;
    if(!swapPick||swapPick===slot)swapPick=swapPick===slot?null:slot;
    else{send({type:'swap_roles',a:swapPick,b:slot});swapPick=null;}
    render();return;
  }
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
  if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-swap]')){e.preventDefault();e.target.closest('[data-swap]').click();return;}
  const control={ArrowLeft:'LEFT',ArrowRight:'RIGHT',ArrowUp:'UP',ArrowDown:'DOWN',Enter:'ENTER',Escape:'ESC'}[e.key];
  // 矢印は補助ナビにフォーカスがあっても移動する。Enterはボタン本来の実行を優先する。
  if(control&&(control!=='ENTER'||!e.target.closest('button,a,summary'))){e.preventDefault();remoteControl(control);}
});
function render(){
  if(game?.phase!=='paused'&&ui.swap)ui={...ui,swap:false};
  const view=desktopView(ui,game),slots=slotViews(state?.slots),count=slots.filter(s=>s.state==='connected').length;
  document.body.dataset.view=view;document.body.dataset.phase=game?.phase||'lobby';
  // generated: 固定の分担ではなく操作定義の分担を表示する (2人・4人のMinecraftを含む)
  const generated=!usesFixedRoles(game);
  document.querySelector('.key-samples').hidden=generated;
  document.querySelectorAll('.key-samples kbd').forEach((el,i)=>{
    const label=keyLabel(game?.keys,['INV','FWD','BACK'][i]);
    el.textContent=label;el.title=label;el.classList.toggle('wide-key',label.length>3);
  });
  const roleSlots=shownSlots(game);
  $('roles').style.setProperty('--role-count',String(roleSlots.length));
  $('roleHeading').textContent=!roleSlots.length?'参加者を待っています':game?.lineupOk?`${roleSlots.length}人で決定！`:`${roleSlots.length}人で、操作を分担！`;
  if(swapPick&&!roleSlots.includes(swapPick))swapPick=null;
  const pendingAck=game?.roleAck||[];
  $('roles').innerHTML=roleSlots.map(slot=>{
    // i: その人の枠 (キャラクターの色)、ri: 担当 (入れ替え後の席。固定の分担の説明に使う)
    const i=SLOT_NAMES.indexOf(slot),ri=SLOT_NAMES.indexOf(game?.roleOf?.[slot]||slot),role=roleView(game,slot);
    const swap=game?.canSwap?` data-swap="${slot}" role="button" tabindex="0" aria-pressed="${swapPick===slot}" aria-label="プレイヤー${i+1}の担当を入れ替える"`:'';
    return `<article class="role-column${swapPick===slot?' picked':''}"${swap}><h3>プレイヤー${i+1}</h3>${character(i)}<div class="role-copy"><b>${esc(generated?role.title:shortRoles[ri])}</b><p>${generated?esc(role.lines[0]||'担当する操作なし'):esc(['歩く・跳ぶ','カメラを動かす','攻撃・使う'][ri]||'')}</p>${pendingAck.includes(slot)?'<span class="ack-wait">スマホで確認待ち</span>':''}</div></article>`;
  }).join('');
  const titles={join:'',game:'ゲーム選択を<br>しよう！',roles:'分担しよう！',preparing:'準備中<span class="ellipsis">...</span>',ready:'準備完了！',coop:'協力プレイ中',paused:'一時停止中'};
  $('screenTitle').innerHTML=titles[view];
  $('screenTitle').hidden=view==='join';
  $('stateBanner').hidden=['game','roles'].includes(view);
  $('stateTitle').textContent={join:`${count}人参加中！`,preparing:'ゲームを準備中！',ready:'全員接続・準備OK！',coop:'みんなでプレイ中！',paused:'一時停止中'}[view]||'';
  $('stateSubtitle').textContent={join:count>=MIN_PLAYERS?`みんながそろったら、OKボタンを押そう！（${MIN_PLAYERS}〜${MAX_PLAYERS}人）`:`参加者を待っています……（${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊べます）`,preparing:'ホストがゲームを準備しています……',ready:'ホストのスマホでReadyを押してください！',coop:'止めるときはホストのスマホでPAUSE',paused:'ホストのスマホで再開できます'}[view]||'';
  if(view==='paused'&&!game?.canResume)$('stateSubtitle').textContent=inject?.mode==='off'?'安全を確かめてから「入力を再開する」を押してください':'再開前に、接続とゲームの画面を確認してください';
  $('leftRule').hidden=!['game','roles'].includes(view);
  $('explanation').innerHTML=view==='join'?`${MIN_PLAYERS}〜${MAX_PLAYERS}人がそろったら、<br>OKボタンを押そう！！`:view==='game'?'右側にあるゲーム一覧から<br>遊びたいゲームを<br>選択してください！':view==='roles'?(game?.lineupOk?'メンバーと分担を<br>決定しました！':'操作をそれぞれの<br>スマホに分けよう！'):'';
  $('secondary').innerHTML=view==='game'?'Steam・Epic・手動登録のゲームは<br>分担を決めた後に起動できます。<br>「未検証」は操作が届くか未確認です。':view==='roles'?(game?.lineupOk?'ゲームを起動・準備して<br>スマホでReady！':'メンバーと分担を確認して<br>決定しよう！'):'';
  const stopped=inputStopped(view);
  $('nextBtn').hidden=!stopped&&!['join','game','roles'].includes(view);
  $('nextBtn').classList.toggle('resume-input',stopped);
  const action=gameAction(ui,game,games()),roleAction=rolesAction(game,games());
  $('nextBtn').textContent=stopped?'入力を再開する':{join:'OK',game:action.label,roles:roleAction.label}[view]||'';
  $('nextBtn').disabled=!stopped&&((view==='roles'&&!!roleAction.disabled)||(view==='game'&&action.kind==='none'));
  // 補助ボタン: 分担の画面では失敗時の手動準備、一時停止中は担当の入れ替え (#47)
  const swapEntry=view==='paused'&&game?.canSwap;
  $('subBtn').hidden=!(swapEntry||(view==='roles'&&roleAction.alt));
  $('subBtn').textContent=swapEntry?'担当を入れ替える':roleAction.alt?.label||'';
  $('subBtn').disabled=!swapEntry&&!!roleAction.alt?.disabled;
  renderGames();
  $('blockedStart').hidden=view!=='preparing'||stopped;$('readyInstruction').hidden=view!=='ready'||stopped;
  $('joinGuide').hidden=view!=='join';$('gameStage').hidden=view!=='game';$('roleStage').hidden=view!=='roles';
  $('playerStage').hidden=['game','roles'].includes(view);
  $('openGameBtn').hidden=!['preparing','ready','paused'].includes(view);
  const name=gameLabel(game);
  const swapHint=game?.canSwap?(swapPick?`${swapPick}と入れ替える人の列を押してください`:'担当を入れ替えるときは、2人の列を順に押してください'):'';
  $('actionNote').textContent=view==='roles'?(swapPick?swapHint:roleAction.note||swapHint):view==='preparing'?`${name}をプレイ中の画面まで進めてください。`:'';
  $('openGameBtn').textContent=`${name}を前面にする`;
  $('inputSafety').textContent=`${name}が前面のときだけ操作を送ります。停止時はすべてのキーとボタンを離します。`;
  const keyWarnings=game?.keys?.warnings||[];
  const warning=desktopWarning(game,inject,online||!state)||(keyWarnings.length?'キー設定に注意が必要です。「操作設定」で実際に送るキーを確認してください。':'');
  const notices=[warning,networkNotice(state?.network,state?.slots),profileNotice(game?.profile)].filter(Boolean).join(' ');
  $('warning').hidden=!notices;$('warning').textContent=notices;
  $('steps').hidden=!['join','game','roles'].includes(view);
  document.querySelectorAll('#steps button').forEach(b=>b.setAttribute('aria-current',b.dataset.go===ui.screen?'page':'false'));
  $('players').innerHTML=slots.map((s,i)=>`<article class="player ${s.state}${view==='preparing'&&s.host&&s.state==='connected'?' pending':''}" data-slot="${s.slot}"><div class="player-badge">${s.state==='empty'?'参加待ち':s.state==='lost'?'切断中':view==='ready'?'接続完了！':view==='preparing'?(s.host?'準備中！':'接続完了！'):'接続完了！'}</div><div class="player-info"><p>プレイヤー${i+1}</p><p>${esc(roleView(game,s.slot).title)}</p><p class="player-device">機種：${esc(s.device||'未接続')}</p></div><svg class="player-arrow" viewBox="0 0 36 30" aria-hidden="true"><path d="M2 2H34L18 27Z"/></svg><div class="character">${character(i)}</div></article>`).join('');
  $('inputState').textContent=inject?.mode==='off'?'ゲームへの入力はOFFです':inject?.mode==='test'?'診断用の入力先です':inject?.active?`ゲームへの入力はONです（${name}が前面のときだけ）`:'ゲームへの入力を停止しています';
  $('keyWarnings').textContent=keyWarnings.join('。');
  $('keyBindings').innerHTML=roleSlots.map(slot=>`<h3>${esc(slot)}：${esc(roleView(game,slot).title)}</h3><ul>${roleView(game,slot).lines.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`).join('');
  $('gameStatus').textContent=game?.prepareStatus||'';
  // 通信の診断 (#70): つながっているスマホごとの経路・往復時間・途切れと、対処の案内
  const diag=(state?.slots||[]).filter(x=>x.connected).map(slotDiagnosis);
  $('netDiag').innerHTML=diag.length?diag.map(d=>`<section class="net-row" data-level="${d.level}"><h3>${esc(d.name)}：${{ok:'良好',warn:'注意',bad:'不安定'}[d.level]}</h3><p>経路 ${esc(d.path)}・往復 ${d.rtt??'-'}ms（95% ${d.p95??'-'}ms）・途切れ ${d.stalls}回/10秒・再接続 ${d.reconnects}回</p>${d.hints.length?`<ul>${d.hints.map(h=>`<li>${esc(h)}</li>`).join('')}</ul>`:''}</section>`).join('')+(state?.network?.bluetoothAudio?'<p class="net-bt">PCの音の出力先がBluetoothです。有線のイヤホンかPCのスピーカーにすると、通信が安定しやすくなります。</p>':''):'<p>つながっているスマホはありません。</p>';
  document.querySelectorAll('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===inject?.mode)));
  $('hotkey').textContent=inject?.emergencyHotkeyError?'緊急停止キーを登録できません':`緊急停止：${inject?.emergencyHotkey||'Ctrl+Alt+F12'}`;
}
function renderGames(){
  const list=games(),scanning=!!state?.gamesScanning;
  const html=list.map(g=>{
    const c=gameCard(g,ui.game,game?.launch);
    // 正方形の画像 (なければ頭文字) と、その下に小さくタイトル・出所・未検証の印 (#121)
    const art=c.image?`<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tile-initial',textContent:this.dataset.initial}))" data-initial="${esc(c.initial)}">`:`<span class="tile-initial">${esc(c.initial)}</span>`;
    return `<button class="game-choice${c.selected?' selected':''}${c.unverified?' unverified':''}" data-game="${esc(c.id)}" aria-pressed="${c.selected}" aria-label="${esc(c.name)}を選択${c.unverified?'（未検証）':''}"><span class="tile-art" aria-hidden="true">${art}</span><span class="tile-name">${esc(c.name)}</span><span class="game-badges">${c.badges.map(b=>`<span class="badge${b==='未検証'?' badge-unverified':''}">${esc(b)}</span>`).join('')}</span>${c.launch?`<span class="game-launch" data-state="${c.launch.state}">${esc(c.launch.title)}</span>`:''}</button>`;
  }).join('');
  // 1秒ごとの状態更新で一覧を作り直すとフォーカスが外れるため、変わったときだけ描き直す
  if(html!==gamesHtml){$('gameList').innerHTML=html;gamesHtml=html;}
  if(shownGame!==ui.game){shownGame=ui.game;document.querySelector('.game-choice.selected')?.scrollIntoView({block:'nearest'});}
  $('gamesCount').textContent=manualMessage||gamesCountText(list,scanning);
  $('refreshGamesBtn').disabled=scanning;
  $('renameGameBtn').hidden=$('removeGameBtn').hidden=!isRegistered(ui.game)||!list.some(g=>g.id===ui.game);
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
    // ① ホットスポット・② 参加 の 2 つの QR を並べる (#133)
    const g=joinGuideView(info);
    document.body.toggleAttribute('data-two-qr',g.two);
    $('qrBubble').innerHTML=g.bubble;
    $('wifiLabel').hidden=$('joinLabel').hidden=!g.two;
    $('wifiQr').hidden=!g.wifiQr;$('wifiQr').innerHTML=g.wifiQr||'';
    $('hotspotBtn').hidden=!g.button;
    const note=hotspotMessage||g.note;
    $('qrNote').hidden=!note;$('qrNote').textContent=note;
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
    else if(m.type==='manual_result'){manualMessage=m.message||'';renderGames();setTimeout(()=>{if(manualMessage===m.message){manualMessage='';renderGames();}},6000);}
    if(m.type==='state'||m.type==='game'){ui=screenOnGameUpdate(ui,previousPhase,game);render();}
    else if(m.type==='remote'&&m.route==='app'&&m.epoch===game?.epoch){
      if(m.state==='down'&&dialogRemote(m.control))return;
      if(!cursor.handle(m)&&m.state==='down')remoteControl(m.control);
    }
  };
}
render();loadInfo();setInterval(loadInfo,5000);connect();
