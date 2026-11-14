import { Fragment, useSyncExternalStore, type CSSProperties } from 'react';
import type { PlayerCardModel, RoleColumnModel } from '../shared/contracts';
import { PlayerCard, RoleColumn } from './PlayerCards';
import { pcState, pcModel, connectionState, connectionModel, settingsActions } from './model';
import { GameTile, KeyEditor, NetworkDiagnostics, Lines, DesktopOverlaySetting } from './parts';
import { SCREENS, SCREEN_TITLES } from '../shared/model/presentation.ts';

type PcState = ReturnType<typeof pcState.get>;
type PcModel = ReturnType<typeof pcModel>;
type ConnectionModel = ReturnType<typeof connectionModel>;

// PC画面を領域ごとの部品に分ける。表示モデルはpcModelが作り、ここは描画だけを持つ。
export function PcApp() {
  const state = useSyncExternalStore(pcState.subscribe, pcState.get);
  useSyncExternalStore(connectionState.subscribe, connectionState.get);
  const connection = connectionModel();
  const model = pcModel(state);
  return <>
<div className="desktop-shell">
  <Sidebar state={state} model={model} connection={connection}/>
  <Workspace model={model}/>
  <footer className="utility-bar"><span id="hotkey">{model.hotkey}</span><button id="settingsBtn">操作設定</button></footer>
</div>
<SettingsDialog state={state} model={model} connection={connection}/>
<RenameDialog/>
<ConnectionHelpDialog connection={connection}/>
<JoinTroubleshootingDialog/>
<ResetDialog/>
</>;
}

function Sidebar({state,model,connection}:{state:PcState;model:PcModel;connection:ConnectionModel}) {
  const game = state.game;
  const primaryDetails = ['game', 'roles'].includes(model.view);
  return <aside className="sidebar">
  <div className="brand-band"><a className="brand" href="/app" aria-label="Re:Cooplay 参加画面へ"><img className="brand-image" src="/assets/logo.png" width="960" height="720" alt="Re:Cooplay" /></a><p className="brand-message"><strong>ひとり</strong>のゲームを<br />笑い、失敗し、協力し、<br /><b>みんなの<br />冒険に。</b></p></div>
  <h1 id="screenTitle" className="page-title" hidden={model.view === 'join'}><Lines text={model.title} />{model.view === 'preparing' && <span className="ellipsis">...</span>}</h1>
  <hr className="left-rule" id="leftRule" hidden={!primaryDetails} />
  <p className="explanation" id="explanation"><Lines text={model.explanation} /></p><p className="secondary" id="secondary"><Lines text={model.secondary} /></p>
  <button className={`main-cta${model.next.stopped ? ' resume-input' : ''}`} id="nextBtn" hidden={model.next.hidden} disabled={model.next.disabled}>{model.next.label}</button>
  <button className="sub-cta" id="subBtn" hidden={model.sub.hidden} disabled={model.sub.disabled}>{model.sub.label}</button>
  <button className="sub-cta" id="changePlayersBtn" hidden={!(model.view === 'paused' && game?.canChangePlayers)}>今の{game?.connected.length || 0}人で分担し直す</button>
  <button className="main-cta disabled-start" id="blockedStart" disabled hidden={model.blockedStart}>START</button>
  <div className="main-cta start-instruction" id="readyInstruction" role="note" hidden={model.readyInstruction}>START<span>ホストのスマホでReady</span></div>
  <div className="join-guide" id="joinGuide" hidden={model.view !== 'join'}>
    <p className="qr-bubble" id="qrBubble"><Lines text={connection.guide.bubble.replace(/<br>/g, '\n')} /></p>
    <svg className="qr-arrow" viewBox="0 0 36 30" aria-hidden="true"><path d="M2 2H34L18 27Z"/></svg>

    <p className="qr-step-label wifi-label" id="wifiLabel" hidden={!connection.guide.two}>① Wi-Fiにつなぐ</p>
    <div className="qr wifi-qr" id="wifiQr" hidden={!connection.guide.wifiQr} dangerouslySetInnerHTML={{__html: connection.guide.wifiQr || ''}} />
    <button className="hotspot-btn" id="hotspotBtn" hidden={!connection.guide.button} disabled={connection.busy}>ホットスポットを<br />ONにする</button>
    <p className="qr-step-label join-label" id="joinLabel" hidden={!connection.guide.two}>② 参加する</p>
    <div className="qr" id="qr" dangerouslySetInnerHTML={{__html: connection.qr}} />
    <p className="qr-note" id="qrNote" hidden={!connection.note}>{connection.note}</p>
    <div className="connection-help">
      <button id="connectionHelpBtn">接続方法・URLを確認</button>
      <button id="joinTroubleshootingBtn" aria-haspopup="dialog">開けないとき</button>
    </div>
  </div>
  <button className="open-game" id="openGameBtn" hidden={model.openGameHidden}>{model.name}を前面にする</button>
  <p className="action-note" id="actionNote" role="status">{model.actionNote}</p>
</aside>;
}

function Workspace({model}:{model:PcModel}) {
  const primaryDetails = ['game', 'roles'].includes(model.view);
  return <main className="workspace">
    <div className="state-banner" id="stateBanner" hidden={primaryDetails || model.view === 'paused'}><h2 id="stateTitle">{model.stateTitle}</h2><p id="stateSubtitle">{model.stateSubtitle}</p></div>
    <section id="playerStage" className="player-stage" aria-label={model.view === 'join' ? '参加者' : '参加者と担当'} hidden={primaryDetails}><div id="players" className="players" style={{'--player-count': Math.max(1, model.cards.length)} as CSSProperties}>{model.cards.map((card: PlayerCardModel) => <PlayerCard key={card.slot} card={card} />)}</div></section>
    <section id="gameStage" className="game-stage" aria-label="ゲーム選択" hidden={model.view !== 'game'}><div id="games" className="game-frame">
      <div className="game-list-head"><h2>ゲーム一覧</h2><p id="gamesCount" role="status">{model.gamesCount}</p><button id="renameGameBtn" hidden={!model.registered}>名前を変更</button><button id="removeGameBtn" hidden={!model.registered}>登録を解除</button><button id="addGameBtn">＋ 追加</button><button id="refreshGamesBtn" disabled={model.scanning}>探し直す</button></div>
      <div id="gameList" className="game-list">{model.gameCards.map(card => <GameTile key={card.id} card={card} />)}</div>
    </div></section>
    <section id="roleStage" className="role-stage" aria-label="操作の分担" hidden={model.view !== 'roles'}>
      <div className="role-band"><h2 id="roleHeading">{model.roleHeading}</h2></div>
      <div id="roles" className="role-columns" style={{'--role-count': model.roleSlots.length} as CSSProperties}>{model.columns.map((c: RoleColumnModel) => <RoleColumn key={c.slot} c={c} />)}</div>
      <button id="keyBindingsBtn" className="role-keys">このPCのキー設定を確認</button>
      <div id="presetChoice" className="preset-choice" role="group" aria-label="分担の作り方" hidden={model.preset.hidden}>
        <span>分担の作り方</span>
        <button data-preset="rule" aria-pressed={model.preset.source === 'rule'} disabled={model.preset.disabled}>規則</button>
        <button data-preset="model" aria-pressed={model.preset.source === 'model'} disabled={model.preset.disabled}>モデル（未検証）</button>
        <button id="remakePresetBtn" disabled={model.preset.disabled}>割り当てを作り直す</button>
      </div>
    </section>
    <div id="warning" className="safety-warning" role="alert" hidden={!model.notices.length}>{model.notices.map(notice => <p key={notice}>{notice}</p>)}</div>
  </main>;
}

function SettingsDialog({state,model,connection}:{state:PcState;model:PcModel;connection:ConnectionModel}) {
  const game = state.game;
  const primaryNavigation = ['join','game','roles'].includes(model.view);
  return <dialog id="settings" aria-labelledby="settingsTitle">
  <h2 id="settingsTitle" tabIndex={-1}>操作設定</h2><p id="inputState" role="status">{model.inputState}</p>
  <details id="settingsNavigation" hidden={!primaryNavigation}><summary>参加・選択・分担へ移動</summary>
  <nav id="steps" aria-label="画面の移動" hidden={!['join','game','roles'].includes(model.view)}>{SCREENS.map(screen => <button key={screen} data-go={screen} disabled={model.view === 'join' && screen !== 'join' && !model.canAdvance} aria-label={SCREEN_TITLES[screen as keyof typeof SCREEN_TITLES]} aria-current={screen === state.ui.screen ? 'page' : 'false'}>{{join: '参加',game: '選択',roles: '分担'}[screen as 'join'|'game'|'roles']}</button>)}</nav>
  </details>
  <details id="keyDetails"><summary>担当と実際に送るキー</summary><p id="keyWarnings" role="status">{model.warnings}</p><div id="keyBindings">{model.bindings.map(b => <Fragment key={b.slot}><h3>{b.slot}：{b.title}</h3><ul>{b.lines.map((line: string, i: number) => <li key={i}>{line}</li>)}</ul></Fragment>)}</div><div id="keyEditor"><KeyEditor model={model} state={state} /></div></details>
  <p id="inputSafety">協力プレイ中は、{model.name}が前面のときだけ担当の操作を送ります。協力プレイの前・一時停止中は、ホストのスマホのリモコンでPCの画面全体（ランチャーなどほかのウィンドウを含む）を操作できます。入力を止めたときや緊急停止のときは、すべてのキーとボタンを離します。</p>

  <details id="commDetails"><summary>通信の設定</summary>
    <label className="comm-setting"><input type="checkbox" id="autoResumeSetting" checked={model.comm.checked} disabled={model.comm.locked} onChange={event => settingsActions.setAutoResume(event.currentTarget.checked)} /> 切断から戻ったら自動で再開する</label>
    <div id="commInfo" role="status">{model.comm.lines.map(line => <p key={line}>{line}。</p>)}</div>
  </details>
  <details id="ruleDetails"><summary>遊び方</summary>
    <label className="comm-setting">時間で担当を交代する <select id="rotationSetting" value={String(game?.rotationSeconds ?? 0)} disabled={model.locked} onChange={event => settingsActions.setRotation(Number(event.currentTarget.value))}><option value="0">しない</option><option value="60">60秒ごと</option></select></label>
    <p>時間になると一時停止して、全員が新しい担当を確認した後、ホストが再開します。協力プレイ中は変更できません。</p>
  </details>
  <details id="overlayDetails"><summary>観客向け表示（配信・録画）</summary><DesktopOverlaySetting locked={game?.phase === 'coop'} />{model.overlayUrl ? <p>OBSなどのブラウザソースに <code id="overlayUrl">{model.overlayUrl}</code> を追加すると、担当と操作を透過で重ねられます。上に出すときは末尾に <code>?position=top</code> を付けます。</p> : <p>PCホストにつながるとURLが表示されます。</p>}</details>
  <details id="netDetails"><summary>通信の診断</summary><div id="netDiag" role="status"><NetworkDiagnostics model={model} bluetooth={!!state.state?.network?.bluetoothAudio} /></div></details>
  <details id="inputDetails"><summary>入力の一時停止（診断・緊急用）</summary><div className="seg" id="modeSeg"><button data-mode="off" aria-pressed={state.inject?.mode === 'off'}>入力を止める</button><button data-mode="on" aria-pressed={state.inject?.mode === 'on'}>入力を再開する</button></div></details>
  <details><summary>手順・詳しい確認</summary><ol id="gameSteps">{model.gameSteps.map(step => <li key={step}>{step}</li>)}</ol><p id="gameStatus">{game?.prepareStatus || ''}</p><p><a href="/host">診断画面を開く</a></p></details>
  <button id="settingsConnectionBtn">参加用QR・接続方法</button>
  <button id="resetAllBtn" className="danger-action">接続中のスマホをすべてリセット</button>
  <details id="requirements"><summary>動作環境・制限事項</summary>
    <ul className="legal">
      <li>PC：Windows 11 x64。WebView2ランタイムとMicrosoft Visual C++ v14 Redistributable（x64）が必要です。</li>
      <li>スマホ：2〜4台。PCと同じWi-Fi、またはPCのモバイルホットスポットに接続します。アプリは不要です。</li>
      <li>入力：協力プレイ中は、入力が有効で、選択したゲームが前面のときだけ担当の操作を送ります。協力プレイの前・一時停止中は、ホストのスマホのリモコンでPCの画面全体を操作できます。緊急停止はCtrl+Alt+F12です。</li>
      <li>マウス：左ボタンを押したまま右クリックが届かない場合は、Orchisなどのマウスジェスチャーやボタンの割り当てを行う常駐アプリを終了するか、該当機能を無効にしてください。</li>
      <li>ゲーム：一覧に出ても動作を保証しません。「未検証」のゲームは、操作が届くか確かめながら遊んでください。</li>
      <li>未確認：開発環境のないPCでの起動は検証中です。インターネット経由の参加には対応していません。</li>
      <li>Minecraft：NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.<br />Re:CooplayはMinecraftの公式製品ではなく、Mojang・Microsoftの承認・提携はありません。</li>
    </ul>
  </details>
  <p id="buildInfo" className="legal">{connection.build}</p>
  <form method="dialog"><button id="closeSettings">閉じる</button></form>
</dialog>;
}

function RenameDialog() {
  return <dialog id="renameGame" aria-labelledby="renameTitle">
  <h2 id="renameTitle">名前を変更</h2>
  <form id="renameForm" method="dialog"><input id="renameInput" maxLength={60} aria-label="ゲームの名前" required />
  <p><button id="renameSave" value="save">保存</button><button id="renameCancel" type="button">キャンセル</button></p></form>
</dialog>;
}

// 全員の接続のリセット (#412)。仮想カーソル・リモコンでも押せるよう、confirm() ではなく画面内の確認にする
function ResetDialog() {
  return <dialog id="resetConfirm" aria-labelledby="resetTitle">
  <h2 id="resetTitle">接続中のスマホをすべてリセットしますか？</h2>
  <ul>
    <li>接続中のスマホは、すべて切断されます。</li>
    <li>P1〜P4の枠とホストを最初から決め直します。最初に参加し直した人がホスト（P1）になります。</li>
    <li>協力プレイ中なら止まり、分担も消えます。押していたキーはすべて離します。</li>
    <li>スマホは、ページを再読み込みして参加し直してください。</li>
  </ul>
  <p><button id="resetCancel" autoFocus>やめる</button><button id="resetConfirmBtn" className="danger-action">リセットする</button></p>
</dialog>;
}

function ConnectionHelpDialog({connection}:{connection:ConnectionModel}) {
  return <dialog id="connectionHelp" aria-labelledby="connectionTitle">
  <h2 id="connectionTitle">スマホを接続する</h2><p>PCと同じWi-Fiへ接続してから、QRを読み取ってください。最初に読み取った人がホスト（P1）になります。2〜4人で遊べます。</p>
  <div id="helpQr" className="help-qr" dangerouslySetInnerHTML={{__html: connection.qr}} />
  <p className="url" id="url">{connection.url}</p><p id="urlNote">{connection.urlNote}</p><p id="wifi">{connection.wifi}</p>
  <button id="reloadInfo">QRを取得し直す</button><form method="dialog"><button id="closeConnectionHelp">閉じる</button></form>
</dialog>;
}

function JoinTroubleshootingDialog() {
  return <dialog id="joinTroubleshooting" aria-labelledby="joinTroubleshootingTitle">
    <h2 id="joinTroubleshootingTitle">参加ページが開けないとき</h2>
    <ol>
      <li>スマホがPCと同じWi-Fi（モバイルホットスポット）につながっているか確認します。</li>
      <li><strong>Android</strong>　設定 → アプリ → お使いのブラウザ → 権限を開き、「付近のデバイス」があれば許可します。</li>
      <li><strong>iPhone</strong>　設定 → プライバシーとセキュリティ → ローカルネットワークで、お使いのブラウザが表示されていればオンにします。</li>
      <li>QRを読み直します。手入力する場合は、参加URLを <code>http://</code> から入力します。</li>
      <li>VPNやセキュリティアプリでローカル通信を制限している場合は、設定でローカル通信を許可します。</li>
    </ol>
    <form method="dialog"><button id="closeJoinTroubleshooting" autoFocus>閉じる</button></form>
  </dialog>;
}
