// スマホ画面の外枠。#235 の最初の段階で index.html から機械変換した。
// 入力と接続は既存の controller.js が id で扱うので、id を変えない。再描画もしない。
// 表示の処理は段階を追ってコンポーネントへ移す。
export function PhoneShell() {
  return (
    <>
      <header>
        <span className="brand"><img className="brand-image" src="/assets/logo.png" width="3200" height="2400" alt="Re:Cooplay" /></span>
        <div id="slot">--</div>
        <div id="role"><b>接続中…</b></div>
        <div className="right">
          <span className="pill warn" id="status">接続中</span>
          <span className="pill" id="phase">-</span>
        </div>
        <button className="phone-settings" id="phoneSettingsBtn" aria-label="接続・診断を確認">⋯</button>
      </header>
      {/* PC の入力先 (選んだゲーム) が前面にないとき: 押しても PC に届かない */}
      <div id="inputWarn">PCの画面が選んだゲームになっていません。ホストがゲームを前面に戻すまで操作は届きません。</div>
      {/* ホストが担当を入れ替えたとき (#47): 本人が確認するまで Ready・再開できない */}
      <div id="roleNotice" className="role-notice" role="alert" hidden><p id="roleNoticeText"></p><button id="roleOkBtn">新しい担当を確認しました</button></div>

      <main>
        <div className="connecting" id="connecting"><span className="mascot" aria-hidden="true">✦</span>PCホストへ接続しています…</div>
        {/* ロビー / 一時停止: ホストのリモコン */}
        <section className="view" id="v-remote">
          <div className="host-card"><h1>あなたがホストです！</h1><p>タッチパッドでPCを操作。準備の後にReady！</p></div>
          <div className="players" id="players1"></div>
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
          <div id="remoteRoute" className="note"></div>
          <button className="cmd" id="startBtn">START</button>
          <button className="cmd sub" id="openGameBtn" data-cmd="OPEN_GAME" hidden>ゲームを前面にする</button>
          <button className="cmd sub" id="endBtn" style={{ display: 'none' }}>ロビーに戻る（協力プレイ終了）</button>
          <div className="note" id="remoteNote">ゲームをプレイ中の画面まで進めた後、ホストだけがReadyを押します。</div>
        </section>

        {/* ロビー / 一時停止: ホスト以外 */}
        <section className="view" id="v-wait">
          <div className="players" id="players2"></div>
          <div className="wait-scene">
            <div className="phone-character" aria-hidden="true"><img id="waitCharacter" src="/assets/characters/blue.png" alt="" /></div>
            <div className="card wait-card"><h1 className="dotted" id="waitHeading">接続完了!!</h1><div className="role-label">あなたの担当</div><div id="waitRole"></div><button className="wait-continue" disabled>操作画面へ進む →</button><div id="waitTitle">ホストの準備を待っています</div></div>
          </div>
        </section>

        {/* 視点のパッドと感度の置き場所。視点を担当する人の操作画面へ移す */}
        <div id="lookHome" hidden>
          <div id="pad">ドラッグでマウス移動<div className="dot"></div></div>
          <label className="sens">感度 <input type="range" id="sens" min="0.5" max="6" step="0.1" defaultValue="2" /> <span id="sensVal">2.0</span></label>
        </div>

        {/* 操作の画面。どのゲームも操作定義と分担から作る (#60・#141) */}
        <section className="view" id="v-gen">
          <div className="gen-title" id="genTitle"></div>
          <div id="genControls"></div>
          <button className="cmd pause" data-cmd="PAUSE" id="genPause" hidden>一時停止・ホスト操作へ</button>
        </section>

      </main>

      <dialog id="phoneDiagnostics" aria-labelledby="phoneDiagnosticsTitle"><h2 id="phoneDiagnosticsTitle">接続・診断</h2><p id="phoneConnection"></p><footer>
        <span>RTT <b id="rtt">-</b></span>
        <span>平均/最大 <b id="rttAvg">-</b></span>
        <span>送信 <b id="sent">0</b></span>
        <span>未ACK <b id="unacked">0</b></span>
        <span>経路 <b id="path">-</b></span>
        <button id="burst">通信テスト</button>
        <p id="phoneNetAdvice" role="status"></p>
        <output id="inputMetrics" hidden aria-hidden="true"></output>
      </footer><button id="closePhoneDiagnostics">閉じる</button></dialog>

      <div id="rotatePrompt" role="status"><b>スマホを縦にしてください</b><p>操作を停止し、押していたキーを離しました。<br />縦向きに戻して、新しい押下から再開します。</p></div>
      <div id="full" role="alert"><div className="phone-message" id="fullMessage">部屋が満員です（4人まで）。<br />PC側でリセットしてから再読み込みしてください。</div></div>
    </>
  );
}
