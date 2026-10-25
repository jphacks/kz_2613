# Re:Cooplay ホスト（Rust 版）

Node 参照実装（`apps/node-ref/server.js`）と同じ仕様・同じメッセージ形式の PC 側サーバー。スマホ / PC の画面は `apps/web-static/` を配信する。通信契約は `docs/architecture/protocol.md`。

**検証状況：** PC 上のシミュレーション（注入なし）のみ。Rust 版の実入力・スマホ実機・Minecraft・Tauri は未検証。

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.rs` | 起動、HTTP 配信（axum）、WebSocket の受け渡し、Ctrl+C 時の安全停止 |
| `src/hub.rs` | セッションの中枢。役割・進行・入力の順序制御（先着 1 回）・出力キュー（最低押下 60ms / 解放 50ms）・視点の補間（4ms 刻み）・心拍。**専用スレッド 1 本**で動き、状態はこのスレッドだけが触る |
| `src/rtc.rs` | WebRTC データチャネル（`datachannel` = libdatachannel。Node 版と同じエンジン） |
| `src/input.rs` | SendInput（スキャンコードのキー、相対マウス移動、左右クリック、ホイール）。`timeBeginPeriod(1)` |
| `src/controls.rs` | スマホの操作 → PC のキー / マウスの対応表 |
| `src/netinfo.rs` | ネットワーク一覧と参加用 / Wi-Fi 用 QR |
| `src/config.rs` | `config.json`（Node 版と共通）と `PORT` |

## ビルド

必要なもの: Rust（MSVC）、Visual Studio の C++ ツールと CMake、Perl（OpenSSL のビルド用。Strawberry Perl のポータブル版で可）。

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\ReCooplay\StrawberryPerl\perl\bin;C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$env:PATH"
$env:LIBCLANG_PATH = "$env:LOCALAPPDATA\ReCooplay\tools-venv\Lib\site-packages\clang\native"  # libclang.dll の場所 (LLVM なら C:\Program Files\LLVM\bin)
cd apps\host-rs
cargo build --release --locked
```

## 起動

リポジトリのルートで実行する（`apps/web-static/` のある場所を自動で探す。`RECOOPLAY_ROOT` で指定も可）。`config.json` はルートに置く（任意。`config.example.json` を参照）。

```powershell
.\apps\host-rs\target\release\recooplay-host.exe
```

- `PORT=18081` などでポート変更、`RECOOPLAY_DRY_RUN=1` で実際には注入しない（自動テスト用）
- Minecraftのキー設定：ゲームの準備・Ready・再開のたびに `%APPDATA%\.minecraft\options.txt` を読み、ユーザーが変えたキーに合わせて送る（#101、読むだけで書き換えない）。ランチャー（CurseForge・Prism等）で別のフォルダを使う場合は `config.json` の `minecraftOptions` に `options.txt` の場所を書く（`RECOOPLAY_MINECRAFT_OPTIONS` でも指定可）。送れないキー（マウスの中ボタン等）・未設定の操作は送らず、PC画面とスマホに表示する
- `RECOOPLAY_LOG_DIR` でログの出力先を変更、`RECOOPLAY_NO_CONFIG=1` で `config.json` を読まない（シミュレーション用）
- Ctrl+C で終了すると、押下中のキー / マウスボタンをすべて離してから終了する

## シミュレーション（通信契約のテスト）

```powershell
node scripts\sim\protocol-sim.mjs                 # Rust 版（release ビルドを使う）
node scripts\sim\protocol-sim.mjs --target node   # Node 参照実装（apps\node-ref で npm ci が必要）
```

ホストを `RECOOPLAY_DRY_RUN=1` で起動し、スマホ 3 台と PC 画面を模した WebSocket で役割・認可・進行・入力の先着 1 回処理・切断時の全解放・復帰設定を照合する。OS へ入力を送らないため、ゲームや実機の合格の代わりにはならない。

## 入力プローブ（Minecraft 実機での入力確認、#5〜#8）

`cargo build --release` で `target\release\recooplay-input-probe.exe` もできる。ホスト・スマホを使わずに、SendInput のキー（W・Space・Shift・Ctrl+W）、クリック・長押し・ホイール、相対マウス（視点）を順に送り、Minecraft が受け付けるかを目で確かめる。

```powershell
apps\host-rs\target\release\recooplay-input-probe.exe                 # 全手順（keys, mouse, look）
apps\host-rs\target\release\recooplay-input-probe.exe --steps keys    # キーだけ (#6)。mouse (#7)、look (#8)
apps\host-rs\target\release\recooplay-input-probe.exe --mock          # OS に送らず、送る内容だけ表示する
node scripts\sim\input-probe-sim.mjs                                    # --mock で安全経路を試験する
```

安全のための約束：

- 起動しただけでは何も送らない。`ARM` と入力して Enter を押すと、5 秒後から送り始める。その間に Minecraft のウィンドウをクリックして前面にする。
- 送る直前に毎回、前面が Minecraft（`javaw.exe`/`java.exe`、タイトルに「Minecraft」）かを確かめる。外れたら押しているキー・ボタンをすべて離し、戻るまで待つ。30 秒戻らなければ中止する（終了コード 3）。
- 緊急停止：`Ctrl+Alt+F12`（10ms ごとにキーの状態を見る。ホストのホットキー登録とは独立）、`Ctrl+C`、コンソールのウィンドウを閉じる。終了コードは 2。
- どの終わり方でも、押しているキー・ボタンをすべて離してから終わる（完走・中止・停止・panic）。
- 停止ハンドラーの登録失敗やOS入力の失敗は成功扱いせず中止する（終了コード4）。解放に失敗した押下は記録を残して再試行し、解放を確認できなければその旨を表示する。強制終了・OS停止まで解放を保証するものではない。
- ARM後も標準入力が閉じたら停止する。`--mock`の綴り間違いなど不明な引数は開始前に拒否する。送信・押下記録・全解放は同じmutexで直列化し、停止後に遅れた押下を残さない。

実機での手順（#6〜#8）：Minecraft Java Edition でテスト用のワールドに入り、ゲーム内の一時停止メニューを閉じておく。コンソールでプローブを起動して `ARM` を入力し、5 秒以内に Minecraft をクリックする。各 `STEP` の表示どおりにキャラクターが動くか（前進・ジャンプ・スニーク・ダッシュ、採掘・設置・持ち物の切り替え、視点の左右）を記録する。出力（`SEND`/`RELEASE`/`WAIT`/`STOP`/`DONE` の行）を BUILD_LOG に残す。

## 接続の認可

WebSocketのHostはlocalhost・ループバックIP・PCのIPv4アドレスと待受ポートに限定する。ブラウザのOriginは接続先のHTTP Originと完全に一致する必要があり、別ポート・別サイト・`null`は403で拒否する。Originなしはループバックからの非ブラウザ検証クライアントだけ許可する。PC管理権限には引き続きループバック接続が必要で、スマホへは渡さない。

1本の接続の識別は1回だけ行う。割当済みの接続でhelloを再送したり、管理接続へ切り替えたりすると4007で閉じる。再接続には新しいWebSocketを使う。Node参照実装にもこの認可修正だけを適用し、通信・入力の比較対象として保持する。
