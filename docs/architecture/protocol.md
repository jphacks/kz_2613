# 通信契約 v4（スマホ・PC画面 ⇔ PCホスト）

**版：** `protocolVersion = 4`（Rust版ホスト `apps/host-rs`・スマホ画面 `apps/web-static/index.html` に実装）。v2の再接続トークンに続き、v3ではepoch必須と視点のepoch単位の累積値を導入する。古い画面は版不一致で拒否する。

**変更の規則：** 契約（メッセージの型・項目・終了コード・順序の規則）を変えるときは、同じPRで①この文書、②`scripts/sim/protocol-sim.mjs`（契約のテスト）、③必要なら `protocolVersion` を更新する。互換性のない変更では版を上げる。シミュレーションは `node scripts/sim/protocol-sim.mjs` で実行し、結果をBUILD_LOGへ記録する。Node参照実装（`apps/node-ref`）は試作品のまま比較の基準として残し、Rust版で追加した契約は対象外とする。

**状況：** Node.js試作品は疑似ゲーム画面とスマホ実機で確認済み。Rust版はPC上のシミュレーションとブラウザ接続を確認し、Tauriはビルド・終了制御を確認している。Minecraft、Rust版の実入力・スマホ3台・Tauriとの実機連携は未検証。以下はNode.js参照実装を基準に整えた通信形式と安全要件。旧Python/Reactひな形は #68 で削除した。

## v4の開始契約

2026-10-25の最新判断は [二段階開始](../decisions/2026-10-25-two-stage-ready.md) に記載する。以下の旧START説明より優先する。PREPARE/旧STARTはlobbyからpreparingへ移るだけ。P1のREADYのみcoopへ移す。開始・再開の要求には現在のepochが必要。canPrepare/canReady/canResumeを区別し、拒否時はcommand_result（accepted:false、reasons）を返す。監視接続によるcoop強制は禁止。Node参照実装はv3を維持する。

## 1. エンドポイント

| パス | 用途 | 制限 |
|---|---|---|
| `GET /` | スマホのコントローラー（`index.html`） | なし |
| `GET /host` | PCのダッシュボード（`host.html`） | **ループバックからのみ**（それ以外は403） |
| `GET /game` | PCの疑似ゲーム画面（`game.html`） | **ループバックからのみ** |
| `GET /app` | PCアプリの画面（`app.html`：参加・ゲーム選択・分担確認。デスクトップアプリが表示する） | **ループバックからのみ** |
| `GET /api/info` | 参加URLの一覧とQR（SVG）、Wi-Fi接続用QR | なし |
| `GET /ws` | WebSocket | モニター（`monitor`）はループバックからのみ |
| WebRTC | DataChannel `fast`（`ordered:false`、`maxRetransmits:0`） | シグナリングはWebSocket経由。STUN/TURNなし |

待ち受けは `0.0.0.0:8080`（`PORT` で変更可）。ホットスポットのアドレスは `192.168.137.x` を優先して表示する。

## 2. スマホ → PC

| type | 経路 | 主な項目 | 意味 |
|---|---|---|---|
| `hello` | WS | `protocolVersion`（必須、現在は `4`）、`clientId`（端末のlocalStorageに保存、最大64文字）、`token`（再接続時。`welcome` で受け取った値）、`ua`、`nextIseq` | 参加・再接続する。同じ `clientId` は、`token` が一致した場合だけ元の枠へ戻る（なし・不一致は `error`（`bad_token`）を返して4006で閉じ、元の接続には影響しない）。版がない・違う場合は `error` を返して4005で閉じ、枠を割り当てない |
| `ping` | WS | `t`、`stats`（RTTの平均・95%値・最大、`rtc`側の統計、`via`） | 1秒ごとに送る。サーバーは `pong` を返す |
| `command` | WS | `cmd`: `PREPARE` / `READY` / `START` / `PAUSE` / `RESUME` / `END`、`epoch` | **P1のみ有効** |
| `input` | **WSとWebRTCの両方** | `iseq`（通し番号）、`epoch`（押した時点の `game.epoch`）、`button`（操作名。操作定義から作った画面では `act:<操作ID>`、ホイールは `act:<操作ID>:up|down`、#60）、`state`（`down`/`up`）、`t`、`burst`（通信テスト） | サーバーは番号順に、先に届いたほうで1回だけ処理する。`epoch` が現在と違う（なしを含む）入力は番号だけ消費し、押下・解放とも処理しない。WS版には `seq` も付く |
| `look` | WebRTC（つながらなければWS） | `lseq`、`epoch`、`cx`、`cy`（同じepoch内の累積移動量） | 30Hz、ACKなし。同じepoch内の欠落だけを次の値で取り戻す。P2・協力プレイ中、かつ `epoch` が現在と同じときだけ有効。別epochは順序番号・累積値の基準にも反映しない。スマホとホストはepoch変更時に `lseq`・`cx`・`cy` を0に戻し、スマホの未送信移動量も破棄する |
| `ka` | WebRTC | `t` | 協力プレイ中に50msごとに送る。サーバーは `kpong` を返す |
| `rtc-offer` / `rtc-cand` | WS | `sdp` / `cand`、`mid` | WebRTCのシグナリング。offerはスマホ側から送る |

**操作名（`button`）**

| 状況 | 送れる人 | 操作名 → PCへの出力 |
|---|---|---|
| ロビー・一時停止中 | P1のみ | `UP`/`DOWN`/`LEFT`/`RIGHT` → 矢印キー、`ENTER` → Enter、`ESC` → Esc |
| 協力プレイ中 | P1 | `FWD`/`BACK`/`LEFT`/`RIGHT` → W/S/A/D、`JUMP` → Space、`SNEAK` → 左Shift、`SPRINT` → 左Ctrl |
| 協力プレイ中 | P3 | `ATTACK` → 左クリック、`USE` → 右クリック、`SLOT_PREV`/`SLOT_NEXT` → ホイール±1、`INV` → E、`DROP` → Q |

P2は `look` だけを送る。役割・状態と合わない操作名はサーバーが無視する（**認可はサーバー側で行う**）。

## 3. PC → スマホ

| type | 主な項目 | 意味 |
|---|---|---|
| `welcome` | `protocolVersion`、`token`（再接続用。サーバーが枠ごとに発行するOS乱数128bitの16進32文字。スマホはlocalStorageに保存する。ログ・PC画面には出さない）、`slot`、`role`、`isHost`、`reconnected` | 割り当てた枠 |
| `error` | `code`（`protocol_version` / `bad_token`）、`protocolVersion`（`protocol_version` の場合、ホストの版） | 接続を受け付けない理由。続いて接続を閉じる |
| `full` | — | 満員。続いて接続を閉じる（4004） |
| `game` | `game`（下記） | 進行の状態が変わるたびに全員へ送る |
| `pong` | `t` | |
| `ack` | `iseq`、`t`、`via`（`ws`/`rtc`）、`stale`（古い `epoch` で処理しなかった場合 `true`） | 入力を受け取った。`via` は先に届いた経路 |
| `kpong` | `t` | WebRTC経由で返す |
| `rtc-answer` / `rtc-cand` | `sdp`、`sdpType` / `cand`、`mid` | |

**`game` の内容：** `phase`（`lobby`/`coop`/`paused`）、`reason`、`required`、`connected`（接続中の枠）、`canStart`、`autoResume`、`autoResumeMs`、`autoResumeUntil`、`inputActive`（入力がPCに届く状態か）、`inputTarget`（常時ONだが前面が入力先でない。スマホは「届かない」と表示する）、`epoch`（進行が変わるたび・リセットで1増える。初期値1）、`title`（PCアプリで選んだゲーム。Rust版）、`assigned`（Rust版、#105：協力プレイの分担。枠名→操作IDの一覧）、`profile`（選んだゲームの操作定義の要約。`assignment`＝今の参加人数での案、`assignments`＝1〜4人の案）、`keys`（Rust版、#101：`source`＝`options`（Minecraftの `options.txt` を読んだ）/`default`/`unreadable`、`controls`＝操作名→実際に送るキー `{out, label}`、`actions`＝定義の操作ID→実際に送るキー。`null` は送らない（送れないキー・未設定）、`warnings`＝ずれ・重複・読めない場合の説明）

**WebSocketの終了コード：** 4000 = 同じ端末の別タブに置き換えられた、4001 = PCでリセットした、4002 = `clientId` なし、4003 = モニターはPCのみ、4004 = 満員、4005 = 通信契約の版が違う（スマホは再接続をやめ、再読み込みを案内する）、4006 = 再接続のトークンがない・一致しない（スマホは再接続をやめ、PCでのリセットを案内する）

## 4. PC画面（モニター）⇔ PCホスト

| 方向 | type | 内容 |
|---|---|---|
| 画面 → ホスト | `monitor` | `page`: `host`/`game`/`app`（PCアプリの画面） |
| 画面 → ホスト | `inject_mode` | `mode`: `off`/`test`/`on` |
| 画面 → ホスト | `focus` | `focused`。疑似ゲーム画面（`game`）では選択状態（`test` モードの条件になる）。ブラウザで開いたPCアプリ（`app`）では前面になったこと：協力プレイ中に前面へ戻ると、ホストは全解放して `paused`（`reason: app focus`、自動復帰しない）へ移し、P1をリモコンに戻す（Rust版）。**デスクトップアプリから起動したホスト（`RECOOPLAY_DESKTOP=1`）はこの知らせを使わず、前面のプロセス名（`recooplay-desktop.exe`）で判定する**（WebView2の画面は背面になっても `blur` を受け取らないため） |
| 画面 → ホスト | `select_game` | `title`（`minecraft-java`、診断用の `pseudo-game`）。選んだゲームはホストが保持し `game.title` で配る。ロビー以外で別のゲームに変えると、全解放して `lobby`（`reason: game change`）へ戻す。参加者・役割は保つ。同じ・未知の値は無視する（Rust版） |
| 画面 → ホスト | `required` / `auto_resume` / `phase` / `reset` | 必要人数（1〜3）、自動復帰のON/OFF、進行の強制変更、全枠の解放 |
| 画面 → ホスト | `observe` | 疑似ゲーム画面の照合結果。ログに記録する |
| ホスト → 画面 | `state` | 全枠の状態、`game`、`inject`（モード・有効かどうか・出力一覧・押下中の出力・緊急停止キー `emergencyHotkey` とその登録エラー `emergencyHotkeyError`、入力先 `target`（`ok`・`expect`・前面の `process`・`title`））。1秒ごとと変化時に送る |
| ホスト → 画面 | `inject` / `look` / `log` | 注入1件ごと、視点の100msごとの集計、イベントログ |
| ホスト → 画面 | `remote` | `control`（`UP`/`DOWN`/`LEFT`/`RIGHT`/`ENTER`/`ESC`）、`state`。ロビー・一時停止中のP1のリモコン操作。PCアプリの画面は自分が前面（`document.hasFocus()`）のときだけ反応する。OSへの注入は前面がMinecraftのときだけなので、画面とゲームが同時に反応しない |

## 5. 順序・欠落・安全の規則

1. **入力の先着1回処理：** スロットごとに `nextIseq` を持つ。番号が飛んだら、欠けた番号（WebSocketで必ず届く）を待ってから順に処理する。押下と解放が入れ替わらない。
2. **出力キュー：** 同じキーを複数人が押していれば、全員が離すまで押したままにする。押下は最低60ms、解放は最低50ms保ってから次へ進む。キューは最大8件で、超えた分は古いものから組で捨てる。
3. **押下の受付条件：** 押下は「注入可能」なときだけ受け付ける。解放は常に受け付ける。
4. **全解放する契機：** 協力プレイから一時停止へ移るときは、切断者だけでなく全参加者の合成キー・マウスボタンを直ちに解放する。最低押下時間・連打キューより安全停止を優先し、待機中の入力キュー・視点の未処理分を破棄する。再開時は旧押下を復元せず、新しい押下から始める。 注入モードの変更、疑似ゲーム画面の選択解除（test）、リセット、終了、**PCの緊急停止（Rust版：`Ctrl+Alt+F12`、またはデスクトップアプリからの `stop`）**でも全解放する。緊急停止は注入をOFFにし、協力プレイ中なら `paused`（`reason: emergency stop`、自動復帰しない）へ移す。PCアプリへの手動復帰（`app focus`）・ゲームの変更（`game change`）でも全解放する。停止に伴わない接続整理では所有者単位で解放してよいが、`coop`から`paused`では必ず全員を対象にする。
5. **切断：** サーバーは4秒受信がなければ切断扱いにし、協力プレイ中は`paused`へ移って前項の全解放を行う。試作品では自動復帰ONで、通信切断後15秒以内に全員が戻ると復帰する挙動を3回確認した。これは観測事実であり、Minecraft実運用での採用判断ではない。実運用の自動復帰の初期値・許可条件は未決定で、安全確認後にユーザーが判断する。ホストの明示PAUSEは設定のON/OFFによらず自動復帰しない。 試験では設定ON/OFF、停止理由、15秒の期限内/外、P1を含む全員の接続・WebRTC準備、古い入力の破棄を照合する。
6. **スマホ側：** 3秒応答がなければ自分から接続し直す。画面が非表示になったら全ボタンを解放する。送信できなかった押下に対しては解放を送らない。

**自動復帰期限の更新：** 協力プレイから通信切断で停止した時点で期限を開始する。停止中は期限内の別参加者の切断だけが期限を延長し、接続の置き換えでは延長しない。期限後は新たな切断・再接続・置き換えで期限を復活させず、ホストの明示RESUMEを待つ（Rust版・Node参照実装）。Minecraft実運用の初期値・許可条件が未決定である点は変わらない。

**PC画面への手動復帰（Rust版）：** 通信切断待ちの`paused`中でも、PC画面へ戻ったら全解放・旧入力破棄の上で`reason: app focus`、`autoResumeUntil: 0`へ更新する。全員が再接続しても明示RESUMEまで再開しない。ブラウザのfocusは接続ごとの変化を使用し、閉じた画面のfocusを新しい接続へ持ち越さない。

## v4のホスト操作・キャンセル

ホスト操作の追加項目・認可は [ホストのタッチパッド](host-remote.md) に記載する。remoteはP1・非coop・現在epochだけを認可し、サーバーがPC画面か対象ゲームかを排他的に判定する。release_inputsは認証済み参加者の現在epochだけを受け付け、合成入力と保留分を即時破棄する。

v4ではOPEN_GAME（現在epoch必須）とPC画面のopen_gameを追加する。進行を変えず、許可された既存ゲームの前面化だけを試みる。必要人数は固定3人とし、requiredによる人数削減は受け付けない。
