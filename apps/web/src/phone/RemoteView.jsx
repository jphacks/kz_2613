import { memo, useSyncExternalStore } from 'react';

// 入力の要素。controller.js が読み込み時に処理を結び付けるので、同じ要素のまま再描画しない。
const RemoteControls = memo(function RemoteControls() {
  return (
    <>
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
            <button className="key" data-ctl="REMOTE_LEFT">左クリック</button><button className="key" data-ctl="REMOTE_RIGHT">右クリック</button><button className="key" data-ctl="REMOTE_E">Eキー</button>
            <button className="key" data-ctl="REMOTE_WHEEL_UP">ホイール↑</button><button className="key" data-ctl="REMOTE_WHEEL_DOWN">ホイール↓</button>
          </div>
    </>
  );
});

// ホストのリモコン画面。内容は phone-model.js の remoteModel が計算する。
// 開始などのボタンは要素を保ったまま文字と状態だけを変える (controller.js がクリックを結び付けている)。
export function RemoteView({ store }) {
  const remote = useSyncExternalStore(store.subscribe, store.get);
  return (
    <>
      <div className="host-card"><h1>あなたがホストです！</h1><p>タッチパッドでPCを操作。準備の後にReady！</p></div>
      <div className="players" id="players1">
        {remote.players.map((p) => <span key={p.name} className={p.on ? 'on' : ''}>{p.label}</span>)}
      </div>
      <RemoteControls />
      <div id="remoteRoute" className="note">{remote.route}</div>
      <button className="cmd" id="startBtn" disabled={remote.startDisabled}>{remote.startLabel}</button>
      <button className="cmd sub" id="openGameBtn" data-cmd="OPEN_GAME" hidden={remote.openGameHidden}>{remote.openGameLabel}</button>
      <button className="cmd sub" id="endBtn" style={{ display: remote.endVisible ? 'block' : 'none' }}>ロビーに戻る（協力プレイ終了）</button>
      <div id="hostTransfer" className="host-transfer" hidden={!remote.transferTo.length}>
        {remote.transferTo.length ? 'ホストを譲る：' : null}
        {remote.transferTo.map((p) => <button key={p} className="key" onClick={() => store.transfer?.(p)}>{p}</button>)}
      </div>
      <div className="note" id="remoteNote">{remote.note}</div>
    </>
  );
}
