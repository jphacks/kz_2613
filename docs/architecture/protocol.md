# 通信契約 v1（スマホ・PC画面 ⇔ PCホスト）

**状況：** Node.js参照実装で実機確認済み。Rust版ホストは同じ契約で実装する。メッセージはすべてJSONで、`type` で種類を区別する。

## 1. エンドポイント

| パス | 用途 | 制限 |
|---|---|---|
| `GET /` | スマホのコントローラー（`index.html`） | なし |
| `GET /host` | PCのダッシュボード（`host.html`） | **ループバックからのみ**（それ以外は403） |
| `GET /game` | PCの疑似ゲーム画面（`game.html`） | **ループバックからのみ** |
| `GET /api/info` | 参加URLの一覧とQR（SVG）、Wi-Fi接続用QR | なし |
| `GET /ws` | WebSocket | モニター（`monitor`）はループバックからのみ |
| WebRTC | DataChannel `fast`（`ordered:false`、`maxRetransmits:0`） | シグナリングはWebSocket経由。STUN/TURNなし |

待ち受けは `0.0.0.0:8080`（`PORT` で変更可）。ホットスポットのアドレスは `192.168.137.x` を優先して表示する。

## 2. スマホ → PC

| type | 経路 | 主な項目 | 意味 |
|---|---|---|---|
| `hello` | WS | `clientId`（端末のlocalStorageに保存、最大64文字）、`ua`、`nextIseq` | 参加・再接続する。同じ `clientId` は元の枠へ戻る |
| `ping` | WS | `t`、`stats`（RTTの平均・95%値・最大、`rtc`側の統計、`via`） | 1秒ごとに送る。サーバーは `pong` を返す |
| `command` | WS | `cmd`: `START` / `PAUSE` / `RESUME` / `END` | **P1のみ有効** |
| `input` | **WSとWebRTCの両方** | `iseq`（通し番号）、`button`（操作名）、`state`（`down`/`up`）、`t`、`burst`（通信テスト） | サーバーは番号順に、先に届いたほうで1回だけ処理する。WS版には `seq` も付く |
| `look` | WebRTC（つながらなければWS） | `lseq`、`cx`、`cy`（接続してからの累積移動量） | 30Hz、ACKなし。欠けても次の値で取り戻せる。P2・協力プレイ中のみ有効 |
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
| `welcome` | `slot`、`role`、`isHost`、`reconnected` | 割り当てた枠 |
| `full` | — | 満員。続いて接続を閉じる（4004） |
| `game` | `game`（下記） | 進行の状態が変わるたびに全員へ送る |
| `pong` | `t` | |
| `ack` | `iseq`、`t`、`via`（`ws`/`rtc`） | 入力を処理した。`via` は先に届いた経路 |
| `kpong` | `t` | WebRTC経由で返す |
| `rtc-answer` / `rtc-cand` | `sdp`、`sdpType` / `cand`、`mid` | |

**`game` の内容：** `phase`（`lobby`/`coop`/`paused`）、`reason`、`required`、`connected`（接続中の枠）、`canStart`、`autoResume`、`autoResumeMs`、`autoResumeUntil`

**WebSocketの終了コード：** 4000 = 同じ端末の別タブに置き換えられた、4001 = PCでリセットした、4002 = `clientId` なし、4003 = モニターはPCのみ、4004 = 満員

## 4. PC画面（モニター）⇔ PCホスト

| 方向 | type | 内容 |
|---|---|---|
| 画面 → ホスト | `monitor` | `page`: `host`/`game` |
| 画面 → ホスト | `inject_mode` | `mode`: `off`/`test`/`on` |
| 画面 → ホスト | `focus` | 疑似ゲーム画面の選択状態（`test` モードの条件になる） |
| 画面 → ホスト | `required` / `auto_resume` / `phase` / `reset` | 必要人数（1〜3）、自動復帰のON/OFF、進行の強制変更、全枠の解放 |
| 画面 → ホスト | `observe` | 疑似ゲーム画面の照合結果。ログに記録する |
| ホスト → 画面 | `state` | 全枠の状態、`game`、`inject`（モード・有効かどうか・出力一覧・押下中の出力）。1秒ごとと変化時に送る |
| ホスト → 画面 | `inject` / `look` / `log` | 注入1件ごと、視点の100msごとの集計、イベントログ |

## 5. 順序・欠落・安全の規則

1. **入力の先着1回処理：** スロットごとに `nextIseq` を持つ。番号が飛んだら、欠けた番号（WebSocketで必ず届く）を待ってから順に処理する。押下と解放が入れ替わらない。
2. **出力キュー：** 同じキーを複数人が押していれば、全員が離すまで押したままにする。押下は最低60ms、解放は最低50ms保ってから次へ進む。キューは最大8件で、超えた分は古いものから組で捨てる。
3. **押下の受付条件：** 押下は「注入可能」なときだけ受け付ける。解放は常に受け付ける。
4. **全解放する契機：** 進行の変更、切断（その枠の分）、注入モードの変更、疑似ゲーム画面の選択解除（`test` モード）、リセット、終了。
5. **切断：** サーバーは4秒受信がなければ切断扱いにする。協力プレイ中なら `paused`（`Px disconnected`）にする。15秒以内に全員が戻り、WebRTCの接続待ちが終わっていれば `coop` へ自動で戻る。
6. **スマホ側：** 3秒応答がなければ自分から接続し直す。画面が非表示になったら全ボタンを解放する。送信できなかった押下に対しては解放を送らない。
