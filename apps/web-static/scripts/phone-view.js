import { myActions, generatedKey, buildGenerated } from './generated-controls.js';

// 低頻度の状態描画。ポインター送信から独立させ、役割変更時だけ操作面を切り替える。
import {profileNotice,roleView} from '../app-view.js';
export function createPhoneView({releaseAll,onDiagnosticsOpen=releaseAll,roleText,bindControl}) {
  const $ = id => document.getElementById(id);
  let lastView = null, lastGen = '';
  // 視点のパッドと感度は、操作定義の画面で視点を担当するときだけそちらへ移す
  const lookParts = [$('pad'), document.querySelector('#v-P2 .sens')].filter(Boolean);
  const lookHome = $('v-P2');
  $('phoneSettingsBtn').addEventListener('click',()=>{
    onDiagnosticsOpen();
    $('phoneConnection').textContent=[$('status').textContent,$('phase').textContent,$('slot').textContent].join('・');
    $('phoneDiagnostics').showModal();
  });
  $('closePhoneDiagnostics').addEventListener('click',()=>$('phoneDiagnostics').close());
  function render({me,isHost,game}) {
    if (!me || !game) return;
    const role=roleView(game,me), heading=document.createElement('b');
    heading.textContent=role.title+(isHost?'（ホスト）':'');
    const generic=game.profile && game.profile.id!=='minecraft-java';
    $('role').replaceChildren(heading,document.createTextNode(generic?(game.phase==='coop'?'確定した分担の操作だけを送信します':game.phase==='paused'?'確定した分担（再開時に確認）':'分担案（Readyで確定）'):roleText[me]));
    const phase = game.phase;
    const label = { lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中' }[phase];
    $('phase').textContent = label;
    $('connecting').hidden = true;
    $('phase').className = 'pill ' + phase;
    const notice=profileNotice(game.profile);
    $('inputWarn').style.display = game.inputTarget || notice ? 'block' : 'none';
    const generated = phase === 'coop' && myActions(game, me);
    const view = phase === 'coop' ? (generated ? 'v-gen' : 'v-' + me) : isHost ? 'v-remote' : 'v-wait';
    document.body.dataset.view=view;
    const characterName={P1:'blue',P2:'green',P3:'purple'}[me];
    $('waitCharacter').src=`/assets/characters/${characterName}.png`;
    $('waitHeading').textContent=phase==='paused'?'一時停止中':'接続完了!!';
    const genKey = generated ? generatedKey(game, me) : '';
    if (view !== lastView || genKey !== lastGen) {
      releaseAll(); // 画面が変わる時は押しっぱなしを解除
      if (generated) {
        $('genTitle').textContent = `${game.profile.name}（${me}${isHost ? '・ホスト' : ''}）`;
        $('genPause').hidden = !isHost;
        buildGenerated($('genControls'), game, me, { bindControl, lookParts });
      } else if (lookParts[0] && lookParts[0].parentElement !== lookHome) {
        lookHome.append(...lookParts);
      }
      document.querySelectorAll('.view').forEach((el) => el.classList.toggle('show', el.id === view));
      lastView = view;
      lastGen = genKey;
    }
    const players = ['P1', 'P2', 'P3'].map((p) => `<span class="${game.connected.includes(p) ? 'on' : ''}">${p}${p === me ? '（自分）' : ''}</span>`).join('');
    $('players1').innerHTML = players;
    $('players2').innerHTML = players;
    $('remoteRoute').textContent = {app:'PCアプリを操作中',game:generic?'選んだゲームのメニューを操作中':'Minecraftのメニューを操作中',none:'PCアプリまたは対象ゲームを前面にしてください'}[game.remoteRoute] || '';
    $('openGameBtn').textContent=generic?'選んだゲームを前面にする':'Minecraftを前面にする';
    $('inputWarn').textContent=generic?'対象ゲームが前面ではありません。ホストが対象ゲームを前面に戻すまで操作は届きません。':'PCの画面がMinecraftになっていません。ホストがMinecraftを前面に戻すまで操作は届きません。';
    $('inputWarn').textContent=[game.inputTarget?$('inputWarn').textContent:'',notice].filter(Boolean).join(' ');
    const startBtn = $('startBtn');
    $('openGameBtn').hidden = !['preparing','paused'].includes(phase);
    startBtn.textContent = phase === 'paused' ? '再開する' : phase === 'preparing' ? 'Ready・3人で操作を始める' : 'ゲームを開く・準備する';
    startBtn.disabled = !(phase === 'paused' ? game.canResume : phase === 'preparing' ? game.canReady : game.canPrepare);
    $('endBtn').style.display = phase === 'paused' ? 'block' : 'none';
    $('remoteNote').textContent = game.canReady
      ? (phase === 'paused' ? `一時停止中${game.reason ? '（' + reasonText(game.reason) + '）' : ''}。リモコンで操作でき、RESUME で協力プレイに戻ります。` : 'ゲームを開いてワールドを準備した後、ホストだけがReadyを押します。')
      : phase === 'lobby' ? `ゲームを開いて準備へ進めます（${game.connected.length}/3人接続）。Readyでの開始には3人全員が必要です。`
      : (game.readyReasons || []).join('。') || 'ホストの明示操作を待っています';
    const autoWait = phase === 'paused' && game.autoResume && game.reason?.endsWith('disconnected');
    document.body.dataset.phase = phase;
    document.body.dataset.slot = me;
    $('waitTitle').textContent = phase === 'paused' ? (autoWait ? `${reasonText(game.reason)}。戻ると自動で再開します` : '一時停止中') : 'ホストの開始を待っています';
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

