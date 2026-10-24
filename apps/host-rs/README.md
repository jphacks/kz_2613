# Re:Cooplay ホスト（Rust 版）

Node 版 `server.js` と同じ仕様・同じメッセージ形式の PC 側サーバー。スマホ / PC の画面は親フォルダの `public/` をそのまま配信する。

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
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\strawberry-perl\perl\bin;C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$env:PATH"
cd host-rs
cargo build --release
```

## 起動

プロジェクトのルート（`public/` がある場所）で実行する。

```powershell
.\host-rs\target\release\recooplay-host.exe
```

- `PORT=18081` などでポート変更、`RECOOPLAY_DRY_RUN=1` で実際には注入しない（自動テスト用）
- Ctrl+C で終了すると、押下中のキー / マウスボタンをすべて離してから終了する
