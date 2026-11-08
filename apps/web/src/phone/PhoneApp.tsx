import { useSyncExternalStore } from 'react';
import { display, skin, chooseSkin, transferHost } from './view';
import { SKINS } from '../../../web-static/scripts/phone-skin.js';

// 製品スマホ画面の構造と低頻度表示はReactだけが描く。
// パッド・押下クラス・診断統計・通信状態は独立した入力エンジンへ委譲する。
export function PhoneApp() {
  const state = useSyncExternalStore(display.subscribe, display.get);
  const selectedSkin = useSyncExternalStore(skin.subscribe, skin.get);
  const game = state.snapshot.game;
  return <>

<div className="phone-bg" aria-hidden="true"><i className="phone-bg-stars"></i></div>
<header>
  <span className="brand"><img className="brand-image" src="/assets/logo.png" width="960" height="720" alt="Re:Cooplay" /></span>
  <div id="slot">--</div>
  <div id="role"><b>{state.role}</b>{state.roleCopy}</div>
  <div className="right">
    <span className="pill warn" id="status">接続中</span>
    <span className={`pill${game ? ` ${game.phase}` : ''}`} id="phase">{game ? {lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中'}[game.phase] : '-'}</span>
  </div>
  <button className="phone-settings" id="phoneSettingsBtn" aria-label="接続・診断を確認">⋯</button>
</header>

<div id="inputWarn" style={{display: state.warning ? 'block' : 'none'}}>{state.warning}</div>

<div id="roleNotice" className="role-notice" role="alert" hidden={!state.roleNotice}><p id="roleNoticeText">{state.roleNotice}</p><button id="roleOkBtn">新しい担当を確認しました</button></div>

<main>
  <div className="connecting" id="connecting" hidden={!!state.view}><span className="mascot" aria-hidden="true">✦</span>PCホストへ接続しています…</div>

  <section className={`view${state.view === 'v-remote' ? ' show' : ''}`} id="v-remote">
    <div className="host-card"><h1>あなたがホストです！</h1><p>タッチパッドでPCを操作。準備の後にReady！</p></div>
    <div className="players" id="players1">{state.remote.players.map(p => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>)}</div>
    <div className="remote">
      <div className="dpad">
        <button className="key u" data-ctl="UP">▲</button>
        <button className="key l" data-ctl="LEFT">◀</button>
        <button className="key r" data-ctl="RIGHT">▶</button>
        <button className="key d" data-ctl="DOWN">▼</button>
      </div>
      <div className="col">
        <button className="key" data-ctl="ENTER">Enterキー</button>
        <button className="key" data-ctl="ESC">Escキー</button>
      </div>
    </div>
    <div id="remotePad" role="application" aria-label="ホストのタッチパッド">指でPCのカーソルを動かす</div>
    <div className="remoteButtons">
      <button className="key" data-ctl="REMOTE_LEFT">左クリック</button><button className="key" data-ctl="REMOTE_RIGHT">右クリック</button><button className="key" data-ctl="REMOTE_E">{state.inventory}</button>
      <button className="key" data-ctl="REMOTE_WHEEL_UP">ホイール↑</button><button className="key" data-ctl="REMOTE_WHEEL_DOWN">ホイール↓</button>
    </div>
    <div id="remoteRoute" className="note">{state.remote.route}</div>
    <button className="cmd" id="startBtn" disabled={state.remote.startDisabled}>{state.remote.startLabel}</button>
    <button className="cmd sub" id="openGameBtn" data-cmd="OPEN_GAME" hidden={state.remote.openGameHidden}>{state.remote.openGameLabel}</button>
    <button className="cmd sub" id="endBtn" style={{display: state.remote.endVisible ? 'block' : 'none'}}>ロビーに戻る（協力プレイ終了）</button>
    <div id="hostTransfer" className="host-transfer" hidden={!state.remote.transferTo.length}>{state.remote.transferTo.length ? 'ホストを譲る：' : null}{state.remote.transferTo.map(p => <button className="key" key={p} onClick={() => transferHost(p)}>{p}</button>)}</div>
    <div className="note" id="remoteNote">{state.remote.note}</div>
  </section>


  <section className={`view${state.view === 'v-wait' ? ' show' : ''}`} id="v-wait">
    <div className="players" id="players2">{state.wait.players.map(p => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>)}</div>
    <div className="wait-scene">
      <div className="phone-character" aria-hidden="true"><img id="waitCharacter" src={state.wait.character} alt="" /></div>
      <div className="card wait-card"><h1 className="dotted" id="waitHeading">{state.wait.heading}</h1><div className="role-label">あなたの担当</div><div id="waitRole">{state.wait.role}</div><div className="wait-continue" role="note">Readyで<br />操作画面に変わります</div><div id="waitTitle">{state.wait.title}</div></div>
    </div>
  </section>


  <div id="lookHome" hidden>
    <div id="pad">ドラッグでマウス移動<div className="dot"></div></div>
    <label className="sens">感度 <input type="range" id="sens" min="0.5" max="6" step="0.1" defaultValue="2" /> <span id="sensVal">2.0</span></label>
  </div>


  <section className={`view${state.view === 'v-gen' ? ' show' : ''}`} id="v-gen">
    <div className="gen-title" id="genTitle">{state.controllerTitle}</div>
    <div id="genControls"></div>
    <button className="cmd pause" data-cmd="PAUSE" id="genPause" hidden={!state.controllerHost}>一時停止・ホスト操作へ</button>
  </section>


  <div className="view-fx" id="viewFx" aria-hidden="true"></div>
</main>

<dialog id="phoneDiagnostics" aria-labelledby="phoneDiagnosticsTitle"><h2 id="phoneDiagnosticsTitle">接続・診断</h2><p id="phoneConnection"></p><div id="skinPicker" className="skin-picker" role="group" aria-label="画面の色">{SKINS.map(s => <button key={s.id} data-skin={s.id} aria-pressed={selectedSkin === s.id} onClick={() => chooseSkin(s.id)}>{s.label}</button>)}</div><footer>
  <span>RTT <b id="rtt">-</b></span>
  <span>平均/最大 <b id="rttAvg">-</b></span>
  <span>送信 <b id="sent">0</b></span>
  <span>未ACK <b id="unacked">0</b></span>
  <span>経路 <b id="path">-</b></span>
  <button id="burst" style={{display: game?.phase === 'coop' ? 'none' : ''}}>通信テスト</button>
  <p id="phoneNetAdvice" role="status"></p>
  <output id="inputMetrics" hidden aria-hidden="true"></output>
</footer><button id="closePhoneDiagnostics">閉じる</button></dialog>

<div id="rotatePrompt" role="status"><b>スマホを縦にしてください</b><p>操作を停止し、押していたキーを離しました。<br />縦向きに戻して、新しい押下から再開します。</p></div>
<div id="full" role="alert"><div className="phone-message" id="fullMessage">部屋が満員です（4人まで）。<br />空きが出たら再読み込みしてください。</div></div>


</>;
}
