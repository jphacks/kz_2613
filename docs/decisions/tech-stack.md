# 技術構成 — 試作品の実機検証に基づく選定

**位置づけ：** Node.js試作品での観測を根拠に技術構成を整理する（[記録](2026-10-24-prototype-validated.md)）。[E]は観測の区分で、今後の明示的なユーザー判断が優先する。旧仮案のPython/FastAPI/Reactひな形は現行リポジトリに残り、Rust・静的画面への取り込みは後続作業。

各項目の検証状況は次のとおり区別する。

- **検証済み**：試作品で実機確認した。証拠は `docs/handoff/BUILD_LOG.md` と検証ゲートに記録している。
- **採用（未検証）**：ユーザー判断で採用したが、実機ではまだ確認していない。
- **未検証**：まだ確認していない。

## 1. 採用する構成

| 領域 | 採用 | 状況 | 根拠・補足 |
|---|---|---|---|
| Windows入力 | Win32 `SendInput`（キーは**スキャンコード**、矢印は拡張キー、マウスは**相対移動** `MOUSEEVENTF_MOVE`、左右ボタン、ホイール ±120） | **検証済み**（疑似ゲーム画面）／Minecraftは未検証 | 疑似ゲーム画面（ブラウザ）が信頼済み入力として受け取り、照合した858件中858件が届いた。遅延は中央値2.5ms |
| タイマー分解能 | `timeBeginPeriod(1)` | **検証済み** | 既定の15.6ms刻みでは視点の補間が粗くなる。1ms刻みに変更し、4ms周期で処理できることを確認した |
| PCホスト言語 | **Rust** | 採用（PC上のシミュレーションで参照実装と一致、実機は未検証） | パフォーマンスを優先するユーザー判断。Minecraftと同時に動かしたときの負荷が小さく、タイミングが安定する。WebRTCの選択肢が多く、Windows APIを直接呼べる。**同じ仕様のNode.js参照実装は検証済み** |
| HTTP・WebSocket | tokio＋axum | 採用（未検証） | Node参照実装（`node:http`＋`ws`）と同じエンドポイント・メッセージ形式にする |
| 状態管理 | セッションの中枢を**専用スレッド1本**で動かし、メモリー内で保持する | 採用（未検証） | すべての状態変更とタイマー（4ms・60ms・1秒）を同じスレッドで扱う。ロックが不要で、非同期ランタイムの影響を受けない |
| 通信（本体） | ローカルHTTP＋**WebSocket（JSON）** | **検証済み** | 参加・役割・命令・確実に届ける必要のある入力を担当する。3台同時の欠落は0件 |
| 通信（速達便） | **WebRTC DataChannel**（`ordered:false`、`maxRetransmits:0`）。シグナリングはWebSocket、STUN/TURNなし | **検証済み**（Android Chrome・iPhone Safari） | WebSocket（TCP）は欠けたパケットの再送待ちで後続が詰まる。不調端末では視点の途切れが42%から1.7%に減り、往復遅延の最大は2015msから221msになった |
| WebRTCライブラリ | **libdatachannel**（Rustでは `datachannel` crate、Nodeでは `node-datachannel`） | 検証済み（Node）／Rust版は未検証 | iPhone Safariとの接続を確認済みのエンジンを維持する。Rust版はOpenSSLを同梱した静的リンク（`vendored`） |
| ネットワーク | Windowsモバイルホットスポット（`192.168.137.1`） | **検証済み**（上流回線あり）／上流なしは未検証 | Android 2台＋iPhone 1台が同時に接続できた |
| スマホ・PC画面 | **ビルド不要の静的HTML/CSS/JavaScript**（`index.html` スマホ、`host.html` ダッシュボード、`game.html` 疑似ゲーム画面）、Pointer Events | **検証済み** | 外部CDNは使わない。React化は任意で、行う場合も同じメッセージ契約を守る |
| PCアプリの枠 | Tauri（WebView2）。代替は通常のブラウザ | 採用（未検証） | 同じHTMLをそのまま表示する |
| QR | 参加URLのQRとWi-Fi接続用のQR（`WIFI:T:WPA;S:..;P:..;;`）をSVGで生成する | **検証済み**（URL QR） | オフラインで生成する。Wi-Fi接続用QRは `config.json` に記載した場合だけ表示する |
| 設定 | `config.json`（port、wifi、requiredPlayers、injectMode、autoResume、lookSmoothMin/MaxMs） | **検証済み** | Node・Rustで共通の項目 |
| ログ | セッションごとのJSONL（`logs/session-*.jsonl`） | **検証済み** | 入力・注入・照合結果・接続を記録し、事後分析に使う。**IP・端末情報・clientIdを記録している点はNFR-13に反するため、修正が必要** |
| 検証方法 | ①プロトコル単位のシミュレーション（注入なしの `RECOOPLAY_DRY_RUN=1` で動作）②疑似ゲーム画面による実入力の照合 ③実機3台 | **検証済み** | シミュレーションは言語に依存しないため、Rust版の合格判定にもそのまま使う |
| 配布 | Tauriのバンドル、または単一exe | 未検証 | |
| Rustのビルド環境 | Rust（MSVC）、Visual StudioのC++ツールとCMake、Perl（OpenSSLのビルド用）、libclang（bindgen用） | **構築済み**（このPCでビルドに成功、初回のビルドは約12分） | 手順は `docs/handoff/SETUP_WINDOWS.md` に記載する |

## 2. 実測で確定した入力処理の定数

| 項目 | 値 | 理由 |
|---|---|---|
| 最低押下時間 | 60ms | 通信でまとめて届くと押下が1〜5msになり、ゲームの入力読み取り（50ms周期）で取りこぼす |
| 最低解放時間 | 50ms | 連打を1回ずつ認識させる |
| 連打キュー | 最大8件（4回分）。超えた分は古いものから押下・解放の組で捨てる | 遅延が積み上がるのを防ぐ |
| 視点の送信 | スマホは30Hzで累積値を送り、ACKは返さない | 毎フレーム送ると通信が詰まりやすい |
| 視点の補間 | 4ms周期。時定数は30〜120msで、直近2秒の最長の途切れ×0.5で自動調整 | 安定した端末は遅延を小さく、途切れがちな端末は滑らかさを優先する |
| 生存確認 | WebSocketのpingは1秒ごと。協力プレイ中はWebRTCで50msごとの `ka` | 遅延の計測と、スマホの無線が省電力で眠るのを防ぐため |
| 切断判定 | サーバーは4秒受信がなければ切断扱い。スマホは3秒応答がなければ自分から接続し直す | 復帰は1秒以内（実測） |
| 自動復帰 | Node試作品ではON設定・通信切断後15秒以内の復帰を3回観測 | Minecraft実運用の初期値・使用条件は未決定。ホストPAUSEは常に非自動、OFF・期限外は明示RESUME |

## 3. 採用しない候補と理由

| 候補 | 理由 |
|---|---|
| Python＋FastAPI（旧・仮案） | WebRTCを使うには `aiortc` しかなく、PyAVまで同梱が必要で、iPhoneとの接続実績もない。処理タイミングも揺れやすい。パフォーマンス優先の判断により置き換える |
| WebSocketのみ | **実測で不十分**。iPhoneで最大1756ms、不調端末で最大2015msの遅延が出て、視点が止まってからまとめて届いた |
| Electron | 動作はするが、Chromiumを同梱するためMinecraftと同時に動かすと負荷が最も大きい |
| Web Bluetooth・HOGP（スマホをBLEマウス化） | **不可能**。ブラウザは接続しに行く側（central）にしかなれず、HIDサービス `0x1812` はWeb Bluetoothのブロックリストで禁止されている。安全な通信環境が必須で、iOS Safariは非対応 |
| WebTransport | HTTPSが必須。オフラインでは証明書を用意できない |
| `str0m`・`webrtc-rs` | Rustのみで書かれ組み込みやすいが、iPhone Safariとの接続を検証し直す必要がある。libdatachannelのビルドが不可能な場合の代替とする |
| PyDirectInput・PyAutoGUI・仮想ゲームパッド・仮想HIDドライバー | 旧版と同じ理由（同じSendInput系、Minecraftがゲームパッドを前提にしない、ドライバー導入のリスク） |
| Next.js・Redis・SQLite・クラウド | 単一セッション・ローカル完結には不要 |

## 4. スレッド・フォーカス・安全性

- セッションの状態はhubスレッドだけが変更する。WebSocket・WebRTCのコールバックは、イベントとしてhubへ渡す。
- `SendInput` の送信先は前面のウィンドウ。注入モードで制御する。
  - `off`：注入しない。初期値。
  - `test`：疑似ゲーム画面を選択している間だけ注入する。
  - `on`：前面のウィンドウへ注入する（実ゲーム用）。
  - `on` で動かすとき、前面がMinecraftであることの確認は**未実装**（FR-034）。
- 押下は注入できる状態のときだけ受け付け、解放は常に受け付ける。押しっぱなしを残さないため。
- 全解放する契機：協力プレイから一時停止へ移るときは、切断者だけでなく全参加者の合成キー・マウスボタンを直ちに解放する。最低押下時間・連打キューより安全停止を優先し、待機中の入力キュー・視点の未処理分を破棄する。再開時は旧押下を復元せず、新しい押下から始める。 注入モード変更・疑似ゲーム画面の選択解除・リセット・終了でも全解放する。

## 5. 参考資料

- [MicrosoftのSendInput資料](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput)
- [libdatachannel](https://github.com/paullouisageneau/libdatachannel)、[datachannel-rs](https://github.com/lerouxrgd/datachannel-rs)
- [Web BluetoothのGATTブロックリスト](https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt)
- [MDN：Web Bluetooth API](https://developer.mozilla.org/ja/docs/Web/API/Web_Bluetooth_API)
