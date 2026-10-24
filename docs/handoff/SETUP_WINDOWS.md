# Windows 11の構築手順

## 前提条件

- Windows 11と `jphacks/kz_2613` のクローン、Git。
- Rust（MSVC）・Visual StudioのC++ツールとCMake・Perl・libclang（下の「Rust版ホストのビルド環境」）。
- Node.js **22以上**（シミュレーション・PC画面の試験に使う。組み込みの `WebSocket` を使うため）。Node参照実装と比較する場合は `apps/node-ref` で `npm ci`。
- Python 3.10以上（`scripts/verify_overlay.py` の構造確認だけに使う）。
- Minecraft Java Editionは**手動検証用**。このリポジトリのコマンドでインストール・起動は行わない。
- スマホ試験で必要なファイアウォール変更の権限。全プロファイルを一括で無効化しない。

## 構成と確認コマンド

| 場所 | 内容 | 確認 |
|---|---|---|
| `apps/host-rs/` | Rust版PCホスト（HTTP・WebSocket・WebRTC・SendInput） | `cargo build --release --locked`、`cargo test --release --locked` |
| `apps/desktop/` | PCアプリ（Tauri / WebView2）。ホストを起動して画面を表示する | `cargo build --release --locked` |
| `apps/web-static/` | スマホ・PC画面（ビルド不要の静的HTML/JS） | `node scripts/sim/check-static-pages.mjs`、`node scripts/sim/app-view-test.mjs` |
| `apps/node-ref/` | Node.js参照実装（比較用） | `node scripts/sim/protocol-sim.mjs --target node` |
| `scripts/sim/` | 通信契約のシミュレーション（注入なし） | `node scripts/sim/protocol-sim.mjs` |

構造確認は `py -3 scripts/verify_overlay.py`。GitHub Actionsでは `checks.yml`（構造確認）と `rust.yml`（上表のビルド・試験）を実行する。どれもOSへの入力を送らず、Minecraft・スマホ実機の合格の代わりにはならない。

旧Python（FastAPI）・Reactのひな形は #68 で削除した。

共通運用と全バックログは、同じディレクトリの `DEVELOPMENT_WORKFLOW.md` と `ISSUE_PLAN.md` を参照する。

## Rust版ホストのビルド環境（PCホスト）

技術構成の変更（`docs/decisions/tech-stack.md`）に伴い、PCホストはRustでビルドする。WebRTC（libdatachannel）とOpenSSLをソースからビルドするため、次が必要になる。

1. Rust（MSVC）：`rustup-init.exe -y --profile minimal --default-toolchain stable`
2. Visual StudioのC++ツールとCMake（「C++によるデスクトップ開発」に含まれる）
3. Perl（OpenSSLのビルド用）：Strawberry Perlのポータブル版を展開し、`perlin` をPATHに追加する
4. libclang（bindgen用）：LLVMを導入するか、`libclang.dll` の場所を `LIBCLANG_PATH` に設定する
5. `cd apps\host-rs; cargo build --release`。初回はOpenSSLとlibdatachannelのビルドに時間がかかる（このPCで約10分）
6. 起動はリポジトリのルートで `.\apps\host-rs\target\release\recooplay-host.exe`。注入なしの通信契約テストは `node scripts\sim\protocol-sim.mjs`（詳細は `apps/host-rs/README.md`）

**注意：** `target/` を別の場所からコピーして流用しない。libdatachannelのCMakeキャッシュが元の絶対パスを保持しているため、再ビルドが失敗する。

### このPCでのRust環境

Rustは公式rustupでユーザー領域に導入する。Visual Studio 2022のC++ツールを使用し、Strawberry Perlのポータブル版は `%LOCALAPPDATA%\ReCooplay\StrawberryPerl` に展開する。libclangは開発用のPython仮想環境（例：`%LOCALAPPDATA%\ReCooplay\tools-venv`）へ `python -m pip install libclang` で導入でき、製品の依存関係には含めない。LLVMを導入済みなら `C:\Program Files\LLVM\bin` を指定してもよい（GitHub Actionsはこちら）。

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\ReCooplay\StrawberryPerl\perl\bin;C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$env:PATH"
$env:LIBCLANG_PATH = "$env:LOCALAPPDATA\ReCooplay\tools-venv\Lib\site-packages\clang\native"
# Documents配下へのビルド出力が拒否される場合の開発用キャッシュ
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\ReCooplay\cargo-target"
cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml
cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml
node scripts/sim/protocol-sim.mjs --bin "$env:CARGO_TARGET_DIR\release\recooplay-host.exe"
```

環境変数の設定はそのPowerShellだけに有効。rustup導入直後にcargoが見つからない場合は、新しいターミナルを開くか上記PATHを設定する。シミュレーションはホストを必ず `RECOOPLAY_DRY_RUN=1` で起動し、OS入力を送らない。

ファイアウォールでは、ローカルサブネットからのTCP 8080と、ホストの実行ファイルのUDP（WebRTC）を許可する。管理者PowerShellで `powershell -ExecutionPolicy Bypass -File scripts\windows\allow-firewall.ps1 -Program apps\host-rs\target\release\recooplay-host.exe` を実行する（`-Program` を省略するとNode参照実装の `node.exe` を許可する）。

## 最初の実機通信ゲート

- LANに制御エンドポイントを公開する前に、認可付き参加・セッション・入力解放を実装する。
- 可能なら選択したWi-Fiインターフェースに限定してUvicornを公開する。`0.0.0.0` を使う場合も、信頼したネットワークへのファイアウォール制限とトークン検証を行う。
- WindowsホットスポットへiPhone Safariを含むスマホ3台を接続する。
- クラウドなしで動くことを `docs/architecture/validation-gates.md` に沿って確認する。

## 最初の実機ゲーム入力ゲート

- Minecraftを前面にする明示手順を備えた、独立したWindows専用プローブでキーと相対マウスの挙動を確認する。
- プロセス起動時に合成キーを送らない。PCからの明確な緊急停止・全解放を用意する。
- 実PCで試験し記録するまで、プローブを検証済みと報告しない。
