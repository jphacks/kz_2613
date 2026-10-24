# Re:Cooplay PC アプリ（Tauri / WebView2）

PC ホスト（`apps/host-rs` の `recooplay-host.exe`）を子プロセスとして起動し、参加・ゲーム選択・分担確認の画面（`/app`）を表示する。診断画面は `/host` に残す。通信・入力の注入はすべてホストが行う（Issue #36）。

**検証状況：** このPCでのビルドと起動・終了の確認のみ（BUILD_LOG 参照）。スマホ実機・Minecraft・配布パッケージ（#41）は未検証。

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.rs` | ホストの起動・待ち受けの確認・終了処理。ウィンドウに `http://127.0.0.1:<port>/app` を表示する |
| `ui/index.html` | ホストの起動を待つ間の画面と、起動できなかったときの案内 |
| `tauri.conf.json`、`capabilities/` | Tauri の設定。ホストの画面には Tauri の API を開放しない |
| `icons/` | 仮のアイコン |

## ビルドと起動

先にホストをビルドしておく（`apps/host-rs/README.md`）。

```powershell
cd apps\desktop
cargo build --release
.\target\release\recooplay-desktop.exe
```

- リポジトリのルート（`apps/web-static/` のある場所）は、アプリの場所から自動で探す。`RECOOPLAY_ROOT` で指定も可。
- ホストは `RECOOPLAY_HOST_EXE` → アプリと同じフォルダ → `apps/host-rs/target/release/` の順に探す。
- ポートはホストと同じ規則（環境変数 `PORT` → `config.json` の `port` → 8080）。
- WebView2 ランタイムが必要（Windows 11 には標準で入っている）。

## 終了と安全停止

- ウィンドウを閉じると、ホストに `quit` を送り、押しっぱなしのキー・マウスボタンを離してから終了させる。3 秒以内に終わらなければ強制終了する。
- アプリが異常終了した場合も、ホストは標準入力が閉じたことを検知して同じ安全停止をする（`RECOOPLAY_STDIN_CONTROL=1` で起動したとき）。
- ポートが使用中（コンソール版のホストが起動済みなど）の場合は、ウィンドウに案内を表示する。
