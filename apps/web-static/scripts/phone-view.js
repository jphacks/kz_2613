// 低頻度の状態描画。ポインター送信から独立させ、役割変更時だけ操作面を切り替える。
import {profileNotice} from '../app-view.js';
export function createPhoneView({releaseAll,roleText}) {
  const $ = id => document.getElementById(id);
  let lastView = null;
  function render({me,isHost,game}) {
    if (!me || !game) return;
    const phase = game.phase;
    const label = { lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中' }[phase];
    $('phase').textContent = label;
    $('connecting').hidden = true;
    $('phase').className = 'pill ' + phase;
    $('inputWarn').style.display = game.inputTarget ? 'block' : 'none';
    const view = phase === 'coop' ? 'v-' + me : isHost ? 'v-remote' : 'v-wait';
    if (view !== lastView) {
      releaseAll(); // 画面が変わる時は押しっぱなしを解除
      document.querySelectorAll('.view').forEach((el) => el.classList.toggle('show', el.id === view));
      lastView = view;
    }
    const players = ['P1', 'P2', 'P3'].map((p) => `<span class="${game.connected.includes(p) ? 'on' : ''}">${p}${p === me ? '（自分）' : ''}</span>`).join('');
    $('players1').innerHTML = players;
    $('players2').innerHTML = players;
    $('remoteRoute').textContent = {app:'操作先：PCアプリ（仮想カーソル）',game:'操作先：Minecraftのメニュー',none:'操作停止中：PCアプリまたは対象ゲームを前面にしてください'}[game.remoteRoute] || '';
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
    const notice=profileNotice(game.profile);
    if(notice) $('remoteNote').textContent=notice+' '+$('remoteNote').textContent;
    $('waitRole').textContent = `あなたの担当: ${roleText[me]}` + (notice ? '。'+notice : '');
    $('burst').style.display = phase === 'coop' ? 'none' : '';
    // ボタンのキー表示を、ゲームのキー設定に合わせた実際のキーにする (#101)
    for (const [control, out] of Object.entries(game.keys?.controls || {})) {
      document.querySelectorAll(`[data-ctl="${control}"] small`).forEach((el) => { el.textContent = out ? out.label : '送らない'; });
    }
  }
  return render;
}
  function reasonText(r) { return r === 'host pause' ? 'ホストが停止' : r === 'app focus' ? 'PCアプリの画面に戻った' : r === 'emergency stop' ? 'PCの緊急停止' : r.endsWith('disconnected') ? r.split(' ')[0] + ' が切断' : r; }

