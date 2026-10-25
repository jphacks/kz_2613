import { myActions, generatedKey, buildGenerated } from './generated-controls.js';

// 低頻度の状態描画。ポインター送信から独立させ、役割変更時だけ操作面を切り替える。
import {profileNotice,roleView,gameLabel,SLOT_NAMES,MIN_PLAYERS,MAX_PLAYERS} from '../app-view.js';
export function createPhoneView({releaseAll,onDiagnosticsOpen=releaseAll,bindControl,bindStick=()=>{},onRoleOk=()=>{}}) {
  const $ = id => document.getElementById(id);
  let lastView = null, lastGen = '';
  // 視点のパッドと感度は、操作定義の画面で視点を担当するときだけそちらへ移す
  const lookParts = [$('pad'), document.querySelector('#lookHome .sens')].filter(Boolean);
  const lookHome = $('lookHome');
  $('phoneSettingsBtn').addEventListener('click',()=>{
    onDiagnosticsOpen();
    $('phoneConnection').textContent=[$('status').textContent,$('phase').textContent,$('slot').textContent].join('・');
    $('phoneDiagnostics').showModal();
  });
  $('closePhoneDiagnostics').addEventListener('click',()=>$('phoneDiagnostics').close());
  $('roleOkBtn')?.addEventListener('click',()=>onRoleOk());
  function render({me,isHost,game}) {
    if (!me || !game) return;
    const role=roleView(game,me), heading=document.createElement('b');
    heading.textContent=role.title+(isHost?'（ホスト）':'');
    $('role').replaceChildren(heading,document.createTextNode(game.phase==='coop'?'確定した分担の操作だけを送信します':game.phase==='paused'?'確定した分担（再開時に確認）':'分担案（Readyで確定）'));
    const ackPending=(game.roleAck||[]).includes(me);
    if($('roleNotice')){$('roleNotice').hidden=!ackPending;$('roleNoticeText').textContent=ackPending?`ホストが担当を入れ替えました。あなたの担当は「${role.title}」です。`:'';}
    const phase = game.phase;
    const label = { lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中' }[phase];
    $('phase').textContent = label;
    $('connecting').hidden = true;
    $('phase').className = 'pill ' + phase;
    const notice=profileNotice(game.profile);
    $('inputWarn').style.display = game.inputTarget || notice ? 'block' : 'none';
    // Ready の後に来た人は今回の協力プレイに参加しない (次の Ready から参加する、#57)
    const joined = !game.participants?.length || game.participants.includes(me);
    // 協力プレイ中はどのゲームも操作定義から作った画面 (#141)
    const generated = phase === 'coop' && joined;
    const view = generated ? 'v-gen' : isHost ? 'v-remote' : 'v-wait';
    document.body.dataset.view=view;
    const characterName={P1:'blue',P2:'green',P3:'purple',P4:'red'}[me];
    $('waitCharacter').src=`/assets/characters/${characterName}.png`;
    $('waitHeading').textContent=phase==='paused'?'一時停止中':'接続完了!!';
    const genKey = generated ? generatedKey(game, me) : '';
    if (view !== lastView || genKey !== lastGen) {
      releaseAll(); // 画面が変わる時は押しっぱなしを解除
      if (generated) {
        $('genTitle').textContent = `${game.profile.name}（${me}${isHost ? '・ホスト' : ''}）`;
        $('genPause').hidden = !isHost;
        buildGenerated($('genControls'), game, me, { bindControl, bindStick, lookParts });
      } else if (lookParts[0] && lookParts[0].parentElement !== lookHome) {
        lookHome.append(...lookParts);
      }
      document.querySelectorAll('.view').forEach((el) => el.classList.toggle('show', el.id === view));
      lastView = view;
      lastGen = genKey;
    }
    const players = SLOT_NAMES.map((p) => `<span class="${game.connected.includes(p) ? 'on' : ''}">${p}${p === me ? '（自分）' : ''}</span>`).join('');
    $('players1').innerHTML = players;
    $('players2').innerHTML = players;
    // 案内は選んだゲームの名前で出す (#140)
    const name=gameLabel(game);
    $('remoteRoute').textContent = {app:'PCアプリを操作中',game:`${name}のメニューを操作中`,none:`PCアプリまたは${name}を前面にしてください`}[game.remoteRoute] || '';
    $('openGameBtn').textContent=`${name}を前面にする`;
    $('inputWarn').textContent=`PCの画面が${name}になっていません。ホストが${name}を前面に戻すまで操作は届きません。`;
    $('inputWarn').textContent=[game.inputTarget?$('inputWarn').textContent:'',notice].filter(Boolean).join(' ');
    const startBtn = $('startBtn');
    $('openGameBtn').hidden = !['preparing','paused'].includes(phase);
    startBtn.textContent = phase === 'paused' ? '再開する' : phase === 'preparing' ? `Ready・${game.connected.length}人で操作を始める` : 'ゲームを開く・準備する';
    startBtn.disabled = !(phase === 'paused' ? game.canResume : phase === 'preparing' ? game.canReady : game.canPrepare);
    $('endBtn').style.display = phase === 'paused' ? 'block' : 'none';
    $('remoteNote').textContent = game.canReady
      ? (phase === 'paused' ? `一時停止中${game.reason ? '（' + reasonText(game.reason) + '）' : ''}。リモコンで操作でき、RESUME で協力プレイに戻ります。` : `${name}をプレイ中の画面まで進めた後、ホストだけがReadyを押します。`)
      : phase === 'lobby' ? (game.lineupOk
        ? `メンバーと分担を決定しました（${game.connected.length}人）。PCの画面でゲームを起動してから準備へ進めます。`
        : `PCの画面でゲームを選び、メンバーと分担を決定してください（${game.connected.length}人接続、${MIN_PLAYERS}〜${MAX_PLAYERS}人で遊べます）。`)
      : (game.readyReasons || []).join('。') || 'ホストの明示操作を待っています';
    const autoWait = phase === 'paused' && game.autoResume && game.reason?.endsWith('disconnected');
    document.body.dataset.phase = phase;
    document.body.dataset.slot = me;
    $('waitTitle').textContent = !joined ? '次の開始から参加します' : phase === 'paused' ? (autoWait ? `${reasonText(game.reason)}。戻ると自動で再開します` : '一時停止中') : 'ホストの開始を待っています';
    if (phase === 'preparing') $('remoteNote').textContent = [game.prepareStatus, ...(game.readyReasons || []), '準備ができたらホストが明示Ready'].filter(Boolean).join('。');
    if (autoWait && isHost) $('remoteNote').textContent = `${reasonText(game.reason)}。戻ると自動で再開します（RESUME で手動再開も可）。`;
    $('waitRole').textContent = role.title;
    $('burst').style.display = phase === 'coop' ? 'none' : '';
    // ボタンのキー表示を、ゲームのキー設定に合わせた実際のキーにする (#101)
    for (const [control, out] of Object.entries(game.keys?.controls || {})) {
      document.querySelectorAll(`[data-ctl="${control}"] small`).forEach((el) => { el.textContent = out ? out.label : '送らない'; });
    }
  }
  return render;
}
  function reasonText(r) { return r === 'host pause' ? 'ホストが停止' : r === 'app focus' ? 'PCアプリの画面に戻った' : r === 'emergency stop' ? 'PCの緊急停止' : r.endsWith('disconnected') ? r.split(' ')[0] + ' が切断' : r; }

