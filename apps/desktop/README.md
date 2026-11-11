# Re:Cooplay PC アプリ（Tauri / WebView2）

PC ホスト（`apps/host-rs` の `recooplay-host.exe`）を子プロセスとして起動し、参加・ゲーム選択・分担確認の画面（`/app`）を表示する。診断画面は `/host` に残す。通信・入力の注入はすべてホストが行う（Issue #36）。

**検証状況：** このPCでのビルドと起動・終了の確認のみ（BUILD_LOG 参照）。スマホ実機・Minecraft・配布パッケージ（#41）は未検証。

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.rs` | ホストの起動・待ち受けの確認・終了処理。ウィンドウに `http://127.0.0.1:<port>/app` を表示する |
| `ui/index.html` | ホストの起動を待つ間の画面と、起動できなかったときの案内 |
| `tauri.conf.json`、`capabilities/` | Tauri の設定。ホストの画面には Tauri の API を開放しない |
| `icons/` | 採用アイコンの原PNG・SVG・Windows用PNG/ICO（[生成手順](../../docs/develop/design/brand-assets.md)） |

## ビルドと起動

先にホストをビルドしておく（`apps/host-rs/README.md`）。

```powershell
cd apps\desktop
cargo build --release
.\target\release\recooplay-desktop.exe
```

- リポジトリのルート（`apps/web/dist/` のある場所）は、アプリの場所から自動で探す。`RECOOPLAY_ROOT` で指定も可。
- ホストは `RECOOPLAY_HOST_EXE` → アプリと同じフォルダ → `apps/host-rs/target/release/` の順に探す。
- ポートはホストと同じ規則（環境変数 `PORT` → `config.json` の `port` → 8080）。
- WebView2 ランタイムが必要（Windows 11 には標準で入っている）。
- ホストには Microsoft Visual C++ v14 Redistributable（x64）も必要（#148）。[Microsoft公式の案内](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)から、ビルドに使ったMSVCと同じか新しい版を用意する。オフラインのPCへは公式の導入用ファイルを事前に持ち込む。アプリは自動ダウンロード・自動導入しない（インストーラー版は同意後に公式から導入する。下の「インストーラー」）。
- `MSVCP140.dll`・`VCRUNTIME140.dll`等の不足やホストの終了コード`0xC0000135`では、ランタイムと配布ファイルの不足を確認する。PCアプリにもDLL不足の案内を表示する。開発PCのDLLを手作業でコピーせず、公式の導入用ファイルを使う。未導入の別PCでの受入は #148 に残す。

## 配布パッケージ（#41）

両方を release ビルドしてから、zip を作る（`dist/` に出力。Git には含めない）。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\package.ps1
```

- 中身：`recooplay-desktop.exe`・`recooplay-host.exe`・`apps/web/dist/`・`config.example.json`・`allow-firewall.ps1`・`LICENSE`・`README.txt`（起動・ファイアウォール・緊急停止・免責表示）。インストーラーは使わず、展開したフォルダから起動する。
- `CARGO_TARGET_DIR` を設定してビルドした場合は、同じ環境変数を設定したまま実行する。両exeがWindows x64用か確認してから梱包する。既存の配布物は上書きせず停止するため、作り直す場合は `-Out dist/review-2` など新しい出力先を指定する。出力先はリポジトリ内の専用フォルダを使い、ディレクトリリンクは使用しない。
- アプリは自分のフォルダから画面とホストを探すので、開発環境やリポジトリは不要。ログは展開先の `logs/` に書くため、書き込みできる場所に展開する。
- WebView2 ランタイムが必要（Windows 11 は標準）。Minecraft のファイル・素材は含めない。
- **検証状況：** このPCで、リポジトリの外に展開して起動・終了できることを確認した。開発環境のないPC・スマホ3台の参加は未検証。

### 配布物の照合と自動検証（#145）

同じチェックアウトから両exeをビルドしてから梱包する。`package-manifest.json` に版・commit・未コミット変更の有無と全同梱物のSHA-256を記録し、zipの隣にも `.zip.sha256` を出力する。commitは梱包時のソースを示すため、古いexeを再利用しないこと。署名の代わりにはならない。

```powershell
node scripts/sim/package-smoke.mjs dist/ReCooplay-0.1.0-windows-x64.zip
```

この試験はzipをリポジトリ外の一時フォルダへ展開し、全画面・操作定義・ハッシュを照合する。欠落・改変の検出後、展開先のホストをdry-runで起動し、静的画面の配信と正常終了・ログ保存を確認する。OS入力やファイアウォール・Wi-Fi設定の変更は行わない。Node.js 22以上が必要で、利用者向けzipにはNode.jsを同梱しない。

Windows CIでも同じチェックアウトから両exeをビルドし、梱包・検証が成功したzipと照合値を `ReCooplay-windows-x64` 成果物として保存する。PCアプリの実画面、WebView2が不足したPC、開発環境のないPC・スマホ3台の受入は #41 に残る。通信設定を変更・復元するインストーラーは #132 で扱う。

## インストーラー（#219）

zipに加えて、推奨の配布形式としてインストーラー（`ReCooplay-<版>-windows-x64-setup.exe`）を作る。zipも続けて配る。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\package.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1
node scripts/sim/installer-smoke.mjs
```

- **形式：** NSIS 3 の自作スクリプト（`scripts/windows/installer.nsi`）を使う。`package.ps1` が作った配布フォルダをそのまま入れるので、zipと同梱物・版・commitが一致する（`package-manifest.json` も入る）。Tauri のバンドラーは使わない。理由は2つで、今のアプリはホストと画面を自分のフォルダから探す構成であることと、Tauri の WebView2 自動導入は同意を取らずに入れることである。
- **権限と場所：** 一般ユーザー権限で `%LOCALAPPDATA%\Programs\ReCooplay` に入れる。書き込める場所なので `logs\` もそのまま使える。スタートメニューにショートカットを作る。デスクトップのショートカットは、完了画面で選んだときだけ作る。
- **OS/CPUの確認：** 正式サポートは Windows 11（build 22000以上）のクライアント版 x64。次の2つは「保証外」と示し、続けるか選べる：x64 の Windows 10 1809 以上と Server、Windows 11 の ARM64（x64 エミュレーション）。32bit の Windows、Windows 10 の ARM64、それより古い Windows では導入を止める。
- **ランタイム：** WebView2（レジストリの `pv`）と VC++ v14 x64（レジストリ、なければ System32 のDLLの版。14.40 以上）を調べる。
  - 不足しているときは取得元を示して同意を求める。同意したときだけ Microsoft 公式（`aka.ms/vs/17/release/vc_redist.x64.exe`、WebView2 の Evergreen Bootstrapper）から取得する。
  - 取得したファイルを実行するのは、埋め込みの Authenticode 署名が有効で、署名者が Microsoft Corporation のときだけ（`fetch-runtime.ps1`）。
  - 同梱して再頒布せず公式から取得するので、再頒布の条件は生じない。
  - 拒否・失敗したときはアプリのファイルだけを入れ、起動できない理由と公式の案内を示す。完了画面の「起動する」も外す。
- **ファイアウォール：** 初期OFF。同意したときだけ、管理者の確認を経て `allow-firewall.ps1` で許可を足す（ローカルサブネットだけ）。アンインストール時に削除するか尋ねる。#132 の Wi-Fi 設定は入れない。
- **サイレント（`/S`）：** 同意を得られないので、ランタイムの取得・ファイアウォールの変更は一切しない。保証外のOSでも、技術的に動く条件を満たせば続けて記録に残す。
- **アンインストール：** 自分が入れたファイルだけを消す。設定（`config.json`）・ログ（`logs\`）・手動登録したゲームとキーの設定（`%LOCALAPPDATA%\Re-Cooplay`。zip版と共通）は、尋ねて同意したときだけ消す。
- **記録：** 導入先の `install-report.txt` に、OS・CPU・ランタイムの検出結果と、同意・拒否・失敗の経過を書く。`setup.exe /REPORT=<ファイル>` は事前チェックの結果だけを書いて終了する（導入しない）。
- **自動試験（`installer-smoke.mjs`、CI）：** 次を確かめる。導入済みのPCでは実行しない。
  - 事前チェックと、アプリの起動中に導入を中止すること
  - サイレント導入（全同梱物のSHA-256、アンインストール情報、ショートカット）
  - 上書き更新（設定・ログを残し、古い画面を消す）と、サイレントのアンインストール
  - 同意なしでは取得・ファイアウォールの変更が起きないこと（不足の流れは `/SIMULATE_MISSING_WEBVIEW2`・`/SIMULATE_MISSING_VCREDIST` で模擬する）
- **未確認：**
  - 対話の画面（同意の確認、保証外の警告、ファイアウォールの許可と削除）
  - 実際にランタイムが不足したPCでの取得と導入
  - 開発環境のない別の Windows 11 x64 での導入・起動・スマホ参加・アンインストール
  - インストーラーは未署名なので、SmartScreen の警告が出る

## 終了と安全停止

- ウィンドウを閉じると、ホストに `quit` を送り、押しっぱなしのキー・マウスボタンを離してから終了させる。3 秒以内に終わらなければ強制終了する。
- アプリが異常終了した場合も、ホストは標準入力が閉じたことを検知して同じ安全停止をする（`RECOOPLAY_STDIN_CONTROL=1` で起動したとき）。
- ポートが使用中（コンソール版のホストが起動済みなど）の場合は、ウィンドウに案内を表示する。
