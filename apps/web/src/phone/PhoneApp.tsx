import {Controller} from './Controller';
import {LayoutController,LayoutEditor} from './LayoutController';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createLayoutStore } from '../shared/model/layout.ts';
import { display, skin, chooseSkin, transferHost,connection,telemetry,blocked,liftHint,rotationNotice,confirmation,answerConfirm,offline } from './view';
import { SKINS } from '../shared/model/skin.ts';

type PhoneDisplay = ReturnType<typeof display.get>;
type Status = ReturnType<typeof connection.get>;
const PHASE_LABELS = {lobby: '参加受付', preparing: 'ゲーム準備', coop: '協力プレイ中', paused: '一時停止中'};

// 製品スマホ画面の構造と低頻度表示はReactだけが描く。
// パッド・押下クラス・診断統計・通信状態は独立した入力エンジンへ委譲する。
// 画面ごとの部品に分け、各部品は自分の表示に必要な状態だけを受け取る。
export function PhoneApp() {
  const state = useSyncExternalStore(display.subscribe, display.get);
  const selectedSkin = useSyncExternalStore(skin.subscribe, skin.get);
  const status=useSyncExternalStore(connection.subscribe,connection.get);
  // 満員・PCアプリの終了などで参加できないときは、押しても届かない操作を透けて見せない (#302)
  const stopped=useSyncExternalStore(blocked.subscribe,blocked.get);
  return <>
<div className="phone-bg" aria-hidden="true"><i className="phone-bg-stars"></i></div>
<Header state={state} status={status}/>

<div id="inputWarn" style={{display: state.warning ? 'block' : 'none'}}>{state.warning}</div>

<div id="roleNotice" className="role-notice" role="alert" hidden={!state.roleNotice}><p id="roleNoticeText">{state.roleNotice}</p><button id="roleOkBtn">新しい担当を確認しました</button></div>

<main style={stopped?{visibility:'hidden'}:undefined}>
  <div className="connecting" id="connecting" hidden={!!state.view}><span className="mascot" aria-hidden="true">✦</span>PCホストへ接続しています…</div>
  <HostRemoteScreen state={state}/>
  <WaitingScreen state={state}/>
  <GameplayScreen state={state}/>
  <div className="view-fx" id="viewFx" aria-hidden="true"></div>
</main>

<DiagnosticsDialog state={state} status={status} selectedSkin={selectedSkin}/>
<ConfirmDialog status={status}/>

<div id="rotatePrompt" role="status"><b>スマホを縦にしてください</b><p>操作を停止し、押していたキーを離しました。<br />縦向きに戻して、新しい押下から再開します。</p></div>
<OfflineMessage/>
<FullMessage/>
{state.view !== 'v-remote' && <LiftHint/>}
<RotationNotice/>
</>;
}

function Header({state,status}:{state:PhoneDisplay;status:Status}) {
  const game = state.snapshot.game;
  return <header>
  <span className="brand"><img className="brand-image" src="/assets/logo.png" width="960" height="720" alt="Re:Cooplay" /></span>
  <div id="slot">{state.snapshot.me ?? '--'}</div>
  <div id="role"><b>{state.role}</b>{state.roleCopy}</div>
  <div className="right">
    <span className={`pill ${status.kind}`} id="status">{status.text}</span>
    <span className={`pill${game ? ` ${game.phase}` : ''}`} id="phase">{game ? PHASE_LABELS[game.phase] : '-'}</span>
  </div>
  <button className="phone-settings" id="phoneSettingsBtn" aria-label="接続・診断を確認">⋯</button>
</header>;
}

function HostRemoteScreen({state}:{state:PhoneDisplay}) {
  return <section className={`view${state.view === 'v-remote' ? ' show' : ''}`} id="v-remote">
    <div className="host-card"><h1>あなたがホストです！</h1>{state.view === 'v-remote' && <HostPadHint/>}</div>
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
    <label className="sens">カーソル感度 <input id="remotePadSensitivity" type="range" min="0.5" max="6" step="0.1" defaultValue="1" aria-label="カーソル感度" /> <span id="remotePadSensitivityValue">1.0倍</span></label>
    <div className="remoteButtons">
      <button className="key" data-ctl="REMOTE_LEFT">左クリック</button><button className="key" data-ctl="REMOTE_RIGHT">右クリック</button><button className="key" data-ctl="REMOTE_E" hidden={state.inventory === null}>{state.inventory}</button>
      <button className="key" data-ctl="REMOTE_WHEEL_UP">ホイール↑</button><button className="key" data-ctl="REMOTE_WHEEL_DOWN">ホイール↓</button>
    </div>
    <div id="remoteRoute" className={`note${state.remote.routeBlocked ? ' route-blocked' : ''}`} role="status">{state.remote.route}</div>
    <button className="cmd" id="startBtn" disabled={state.remote.startDisabled}>{state.remote.startLabel}</button>
    <button className="cmd sub" id="openGameBtn" data-cmd="OPEN_GAME" hidden={state.remote.openGameHidden}>{state.remote.openGameLabel}</button>
    <button className="cmd sub" id="openAppBtn" data-cmd="OPEN_APP" hidden={state.remote.openAppHidden} aria-describedby={state.remote.appReturnHint ? 'appReturnHint' : undefined}>PCアプリを前面にする</button>
    <p className="note" id="appReturnHint" hidden={!state.remote.appReturnHint}>{state.remote.appReturnHint}</p>
    <button className="cmd sub" id="endBtn" style={{display: state.remote.endVisible ? 'block' : 'none'}}>{state.remote.endLabel}</button>
    <div id="hostTransfer" className="host-transfer" hidden={!state.remote.transferTo.length}>{state.remote.transferTo.length ? 'ホストを譲る：' : null}{state.remote.transferTo.map(p => <button className="key" key={p} onClick={() => transferHost(p)}>{p}</button>)}</div>
    <div className="note" id="remoteNote">{state.remote.note}</div>
    <div className="note" id="remoteNotice" hidden={!state.remote.notice}>{state.remote.notice}</div>
  </section>;
}

function WaitingScreen({state}:{state:PhoneDisplay}) {
  return <section className={`view${state.view === 'v-wait' ? ' show' : ''}`} id="v-wait">
    <div className="players" id="players2">{state.wait.players.map(p => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>)}</div>
    <div className="wait-scene">
      <div className="phone-character" aria-hidden="true"><img id="waitCharacter" src={state.wait.character} alt="" /></div>
      <div className="card wait-card"><h1 className="dotted" id="waitHeading">{state.wait.heading}</h1><div className="role-label">あなたの担当（{state.snapshot.me}）</div><div id="waitRole">{state.wait.role}</div><p id="waitTitle" role="status">{state.wait.title}</p></div>
    </div>
  </section>;
}

// 個人レイアウト (#271/#50) はゲームごとにこのブラウザーへ保存する。読めない環境では標準の配置で遊べる
const layouts = createLayoutStore({
  getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key),
});

function GameplayScreen({state}:{state:PhoneDisplay}) {
  const c = state.controller;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(0);
  // 担当・定義が変わると key が変わり、保存済みのレイアウトを今の定義と合わせ直す
  const loaded = useMemo(() => c ? layouts.load(c.game) : null, [c?.key, saved]);
  // 協力プレイの画面を離れたら編集をやめる (未保存の変更は捨てる。下書きの復旧はP3)
  useEffect(() => { if (!c) setEditing(false); }, [c]);
  // 編集を始めるときは、本人の押下をすべて離す。編集中はゲームへ何も送らない (Q12)。他の参加者には影響しない
  const startEdit = () => { c?.bindings.releaseAll(); setEditing(true); };
  const finish = () => { setSaved(n => n + 1); setEditing(false); };
  // 保存したレイアウトがあるゲームだけ新しい配置で描く。未編集のゲームは従来の配置のまま
  const custom = loaded?.source === 'saved';
  return <section className={`view${state.view === 'v-gen' ? ' show' : ''}`} id="v-gen">
    <div className="gen-title" id="genTitle">{state.controllerTitle}
      {c && !editing && <button className="gen-edit" id="genEditLayout" onClick={startEdit}>配置を編集</button>}</div>
    <div id="genControls" className={!c || editing || custom ? undefined : c.layout || undefined}>{c && (editing && loaded
      ? <LayoutEditor key={c.key} initial={loaded.layout} game={c.game} slot={c.slot}
          onSave={layout => { const ok = layouts.save(layout); if (ok) finish(); return ok; }} onCancel={() => setEditing(false)}
          onReset={() => { layouts.reset(c.game.profile.id); finish(); }} />
      : custom && loaded
        ? <LayoutController key={c.key} layout={loaded.layout} game={c.game} slot={c.slot} bindings={c.bindings} />
        : <Controller key={c.key} groups={c.groups} bindings={c.bindings}/>)}</div>
    <button className="cmd pause" data-cmd="PAUSE" id="genPause" hidden={!state.controllerHost}>一時停止・ホスト操作へ</button>
  </section>;
}

function DiagnosticsDialog({state,status,selectedSkin}:{state:PhoneDisplay;status:Status;selectedSkin:string}) {
  const game = state.snapshot.game;
  return <dialog id="phoneDiagnostics" aria-labelledby="phoneDiagnosticsTitle"><h2 id="phoneDiagnosticsTitle">接続・診断</h2><p id="phoneConnection">{[status.text,game?PHASE_LABELS[game.phase]:'-',state.snapshot.me??'--'].join('・')}</p><div id="skinPicker" className="skin-picker" role="group" aria-label="画面の色">{SKINS.map(s => <button key={s.id} data-skin={s.id} aria-pressed={selectedSkin === s.id} onClick={() => chooseSkin(s.id)}>{s.label}</button>)}</div><PhoneDiagnostics phase={game?.phase}/><button id="closePhoneDiagnostics">閉じる</button></dialog>;
}

function PhoneDiagnostics({phase}:{phase:string|undefined}) {
  const data=useSyncExternalStore(telemetry.subscribe,telemetry.get);
  return <footer>
  <span>RTT <b id="rtt">{data.rtt}</b></span>
  <span>平均/最大 <b id="rttAvg">{data.rttAvg}</b></span>
  <span>送信 <b id="sent">{data.sent}</b></span>
  <span>未ACK <b id="unacked">{data.unacked}</b></span>
  <span>経路 <b id="path">{data.path}</b></span>
  <button id="burst" disabled={data.burstBusy} style={{display: phase === 'coop' ? 'none' : ''}}>通信テスト</button>
  <p id="phoneNetAdvice" role="status">{data.advice}</p>
  <output id="inputMetrics" hidden aria-hidden="true">{data.inputMetrics}</output>
</footer>;
}

// 通信の復旧・遅れた押下の破棄の後、押したままの指では操作を再開しない。離せば自動で消える (#285 Q27)
function HostPadHint() {
  const visible = useSyncExternalStore(liftHint.subscribe, liftHint.get);
  return <div className="host-pad-hint">
    <span className="host-pad-help" hidden={visible}>タッチパッドでPCのカーソルを動かせます。</span>
    <span id="liftHint" role="status" hidden={!visible}>指を離して操作を再開</span>
  </div>;
}

function LiftHint(){
  const visible=useSyncExternalStore(liftHint.subscribe,liftHint.get);
  return <div id="liftHint" className="lift-hint" role="status" hidden={!visible}>指を離して操作を再開</div>;
}

// PC のアプリと3秒以上つながらないあいだ、押しても届かない操作を覆う (#302)。再接続すると消える
function OfflineMessage(){
  const visible=useSyncExternalStore(offline.subscribe,offline.get);
  return <div id="offline" role="alert" hidden={!visible}><div className="phone-message"><b>PCのアプリとつながっていません</b><br />再接続しています…<br /><small>PCでRe:Cooplayが起動しているか、スマホが同じWi-Fiにつながっているか確認してください。</small></div></div>;
}

// ブラウザ標準の confirm() はJSを止めて切断扱いになるため、ページ内で確認する (#289)
function ConfirmDialog({status}:{status:Status}){
  const request=useSyncExternalStore(confirmation.subscribe,confirmation.get);
  const online=status.kind==='ok';
  return <dialog id="phoneConfirm" className="phone-confirm" aria-labelledby="phoneConfirmText" onCancel={e=>{e.preventDefault();answerConfirm(false);}}>
    <p id="phoneConfirmText">{request?.message}</p>
    <p id="phoneConfirmWait" role="status" hidden={online}>PCとの通信が戻るまでお待ちください。</p>
    <div className="phone-confirm-buttons"><button id="phoneConfirmCancel" onClick={()=>answerConfirm(false)}>やめる</button><button id="phoneConfirmOk" className="cmd" disabled={!online} onClick={()=>answerConfirm(true)}>{request?.ok}</button></div>
  </dialog>;
}

// 役割交代の予告・交代後の案内 (#161)。非モーダルで、タッチを受け取らない
function RotationNotice(){
  const text=useSyncExternalStore(rotationNotice.subscribe,rotationNotice.get);
  return <div id="rotationNotice" className="rotation-notice" role="status" hidden={!text}>{text}</div>;
}

function FullMessage(){
  const state=useSyncExternalStore(blocked.subscribe,blocked.get);
  return <div id="full" role="alert" style={{display:state?'flex':undefined}}><div className="phone-message" id="fullMessage">{state?.message ?? <>部屋が満員です（4人まで）。<br />空きが出たら再読み込みしてください。</>}</div></div>;
}
