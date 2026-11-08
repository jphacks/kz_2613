import { myActions, generatedKey, buildGenerated } from './generated-controls.js';
import { SKINS, applySkin, createSkinStore } from './phone-skin.js';
import { inputWarnText, remoteModel, waitModel } from './phone-model.js';

// 低頻度の状態描画。ポインター送信から独立させ、役割変更時だけ操作面を切り替える。
import {profileNotice,roleView,gameLabel,outputKeyLabel} from '../app-view.js';
import { createViewTransition } from './view-transition.js';
export function createPhoneView({releaseAll,onDiagnosticsOpen=releaseAll,bindControl,bindStick=()=>{},onRoleOk=()=>{},onTransferHost=()=>{}}) {
  const $ = id => document.getElementById(id);
  let lastView = null, lastGen = '', lastTransfer = '', skinGame = null;
  // 画面の色はゲームごとに端末へ保存する (#159)。診断を開くと保持入力は解放済みで、入力の処理には触れない
  const skins = createSkinStore(globalThis.localStorage ?? { getItem: () => null, setItem() {} });
  const skinPicker = $('skinPicker');
  function showSkin(id) {
    if (document.documentElement) applySkin(document.documentElement, id);
    skinPicker?.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === id)));
  }
  if (skinPicker?.append) {
    for (const s of SKINS) {
      const button = document.createElement('button');
      button.dataset.skin = s.id; button.textContent = s.label;
      button.addEventListener('click', () => { skins.set(skinGame, s.id); showSkin(s.id); });
      skinPicker.append(button);
    }
  }
  // 視点のパッドと感度は、操作定義の画面で視点を担当するときだけそちらへ移す
  const lookParts = [$('pad'), document.querySelector('#lookHome .sens')].filter(Boolean);
  const lookHome = $('lookHome');
  const reactStore = globalThis.__recooplayPhoneStore;
  const reactRemote = globalThis.__recooplayRemoteStore;
  // 画面の切り替えの演出 (ワイプ＋流れ星の群れ)。帯は本人のキャラクターの色
  const transition = createViewTransition({ layer: $('viewFx') });
  const transferHost = (p) => { if (confirm(`${p}にホストを譲りますか？`)) onTransferHost(p); };
  if (reactRemote) reactRemote.transfer = transferHost;
  $('phoneSettingsBtn').addEventListener('click',()=>{
    onDiagnosticsOpen();
    $('phoneConnection').textContent=[$('status').textContent,$('phase').textContent,$('slot').textContent].join('・');
    $('phoneDiagnostics').showModal();
  });
  $('closePhoneDiagnostics').addEventListener('click',()=>$('phoneDiagnostics').close());
  $('roleOkBtn')?.addEventListener('click',()=>onRoleOk());
  function render({me,isHost,game}) {
    if (!me || !game) return;
    if (game.title !== skinGame) { skinGame = game.title; showSkin(skins.get(skinGame)); }
    const role=roleView(game,me), heading=document.createElement('b');
    heading.textContent=role.title+(isHost?'（ホスト）':'');
    $('role').replaceChildren(heading,document.createTextNode(game.phase==='coop'?'確定した分担の操作だけを送信します':game.phase==='paused'?'確定した分担（再開時に確認）':'分担案（Readyで確定）'));
    const ackPending=(game.roleAck||[]).includes(me);
    if($('roleNotice')){$('roleNotice').hidden=!ackPending;$('roleNoticeText').textContent=ackPending?`${game.reason==='role rotation'?'時間で担当が交代しました':'ホストが担当を入れ替えました'}。あなたの担当は「${role.title}」です。`:'';}
    const phase = game.phase;
    const label = { lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中' }[phase];
    $('phase').textContent = label;
    $('phase').className = 'pill ' + phase;
    const notice=profileNotice(game.profile);
    // Ready の後に来た人は今回の協力プレイに参加しない (次の Ready から参加する、#57)
    const joined = !game.participants?.length || game.participants.includes(me);
    // 協力プレイ中はどのゲームも操作定義から作った画面 (#141)
    const generated = phase === 'coop' && joined;
    const view = generated ? 'v-gen' : isHost ? 'v-remote' : 'v-wait';
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
      // 帯が画面を覆った時点で入れ替える。それまで古い画面は新しい押下を受けない (view-transition.js)
      // body の data-view で余白が変わるので、画面を入れ替える時に合わせて変える (先に変えると古い画面の大きさが一瞬変わる)
      const showView = () => {
        document.body.dataset.view = view;
        $('connecting').hidden = true;
        document.querySelectorAll('.view').forEach((el) => el.classList.toggle('show', el.id === view));
      };
      if (view !== lastView) transition.run({ slot: me, from: lastView, to: view, oldEl: lastView ? $(lastView) : $('connecting'), apply: showView });
      else { transition.finish(); showView(); }
      lastView = view;
      lastGen = genKey;
    }
    // 案内は選んだゲームの名前で出す (#140)
    const name=gameLabel(game);
    const warn = inputWarnText({ isHost, game, name, notice });
    $('inputWarn').textContent = warn;
    $('inputWarn').style.display = warn ? 'block' : 'none';
    const autoWait = phase === 'paused' && game.autoResume && game.reason?.endsWith('disconnected');
    document.body.dataset.phase = phase;
    document.body.dataset.slot = me;
    document.body.dataset.host = String(!!isHost); // 表示の切替だけに使う。権限はホストが判定する
    const wait = waitModel({ me, game, roleTitle: role.title, joined, autoWait });
    const remote = remoteModel({ me, isHost, game, name, autoWait });
    // React版では待機画面とリモコン画面の表示をReactだけが描く。両方から書くと表示が壊れる (#235)
    if (reactStore) { reactStore.set(wait); reactRemote.set(remote); }
    else {
      const players = remote.players.map((p) => `<span class="${p.on ? 'on' : ''}">${p.label}</span>`).join('');
      $('waitCharacter').src = wait.character;
      $('waitHeading').textContent = wait.heading;
      $('waitRole').textContent = wait.role;
      $('waitTitle').textContent = wait.title;
      $('players1').innerHTML = players;
      $('players2').innerHTML = players;
      $('remoteRoute').textContent = remote.route;
      $('openGameBtn').textContent = remote.openGameLabel;
      $('openGameBtn').hidden = remote.openGameHidden;
      $('startBtn').textContent = remote.startLabel;
      $('startBtn').disabled = remote.startDisabled;
      $('endBtn').style.display = remote.endVisible ? 'block' : 'none';
      $('remoteNote').textContent = remote.note;
      if (remote.transferTo.join() !== lastTransfer) {
        lastTransfer = remote.transferTo.join();
        const box = $('hostTransfer');
        box.hidden = !remote.transferTo.length;
        box.replaceChildren(...(remote.transferTo.length ? [document.createTextNode('ホストを譲る：')] : []), ...remote.transferTo.map((p) => {
          const button = document.createElement('button');
          button.className = 'key'; button.textContent = p;
          button.addEventListener('click', () => transferHost(p));
          return button;
        }));
      }
    }
    $('burst').style.display = phase === 'coop' ? 'none' : '';
    document.querySelectorAll('[data-ctl="REMOTE_E"]').forEach(el => {
      el.textContent = game.keys?.controls && Object.hasOwn(game.keys.controls, 'INV')
        ? outputKeyLabel(game.keys.controls.INV) : 'Eキー';
    });
    // ボタンのキー表示を、ゲームのキー設定に合わせた実際のキーにする (#101)
    for (const [control, out] of Object.entries(game.keys?.controls || {})) {
      document.querySelectorAll(`[data-ctl="${control}"] small`).forEach((el) => { el.textContent = out ? out.label : '送らない'; });
    }
  }
  /** サーバーが拒否した理由を案内へ出す。次の状態の更新で通常の案内へ戻る */
  render.note = (text) => {
    if (reactRemote) reactRemote.set({ ...reactRemote.get(), note: text });
    else $('remoteNote').textContent = text;
  };
  return render;
}

