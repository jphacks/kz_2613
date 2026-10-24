# Windows 11の構築手順 — 初期ひな形

## 前提条件

- Windows 11と既存の `jphacks/kz_2613` のクローン。
- Python **3.12 x64**（`py -3.12 --version`）、Node.js **22 LTS**（`node --version`）、npm、Git。
- Minecraft Java Editionは**後続の手動検証用**。このひな形でインストール・起動は行わない。
- スマホ試験で必要なファイアウォール変更の権限。全プロファイルを一括で無効化しない。

## ZIPを安全に統合する

1. パッケージを展開し、既存の `README.md` と `LICENSE` を保持する。
2. `repo_overlay/` の**中身だけ**を既存リポジトリのルートへコピーする。外側のディレクトリを入れない。
3. コミット前に `git status` を確認し、未コミットの他者変更を上書きしない。
4. `AGENTS.md`、`CLAUDE.md`、`docs/requirements/requirements-v0.3.md`、`docs/decisions/tech-stack.md` を読む。
5. `py -3 scripts/verify_overlay.py` を実行する。この構造確認だけならPython 3.10以上を利用できる。

## バックエンドの構築

PowerShellのターミナル1で実行する。

```powershell
cd apps/host
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -c constraints-core.txt -e ".[dev]"
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn recoop_host.app:app --host 127.0.0.1 --port 8000
```

`http://127.0.0.1:8000/api/health` を開き、`game_input_ready:false` を確認する。ゲーム操作が可能という意味ではない。`localhost` はスマホから到達できない。

## フロントエンドの構築

PowerShellのターミナル2で実行する。

```powershell
cd apps/web
npm ci
npm run check
npm test
npm run build
npm run dev
```

`http://127.0.0.1:5173/?view=desktop` でPC用、`/` でスマホ用のひな形を確認する。Vite開発サーバーはlocalhostだけに公開する。この段階ではスマホの操作入力を受け付けない。

## Web資産をビルドした後の確認

Viteのdist生成後、FastAPIを再起動して `http://127.0.0.1:8000/` を開く。ビルドしたひな形が配信されることを確認する。WebSocketやMinecraft入力の成立とは区別する。

`apps/host` で統合テストを実行する。

```powershell
.\.venv\Scripts\python.exe -m pytest -q --require-web-build
```

このテストは実際の `apps/web/dist` を必須とし、HTML・JavaScript・CSSの応答とヘルスチェックを確認する。静的配信のルートは起動時に登録されるため、初回ビルド後はホストを再起動する。`/` はスマホ用、`/?view=desktop` はPC用。どちらも操作機能が未実装であることを表示する。

### 依存の固定と開発環境

`constraints-core.txt` はWindows初期構築時に解決した間接依存を含むバージョンを固定する。Windows専用パッケージをLinuxへ強制導入するものではない。uvloop等のWindowsにない環境固有依存は対象環境のpipが解決する。更新時は意図的に固定値を変更し、CIを再実行する。

`package-lock.json` はコミット済み。`npm install` は依存を変更する場合だけ使う。開発時の導入にはパッケージレジストリが必要だが、ビルド済み実行資産に外部CDNは不要。デスクトップGUIの配布は後続Issueで扱う。

`py -3.12` がない場合は標準のPython 3.12 x64を導入するか、既存の3.12実行ファイルを明示する。

```powershell
& 'C:\path\to\python.exe' -m venv .venv
```

別のマイナーバージョンで仮想環境を作らない。初期構築の検証環境はPython 3.12.14、Node.js 22.15.0、npm 11.16.0。

共通運用と全バックログは、同じディレクトリの `DEVELOPMENT_WORKFLOW.md` と `ISSUE_PLAN.md` を参照する。

## Rust版ホストのビルド環境（PCホスト）

技術構成の変更（`docs/decisions/tech-stack.md`）に伴い、PCホストはRustでビルドする。WebRTC（libdatachannel）とOpenSSLをソースからビルドするため、次が必要になる。

1. Rust（MSVC）：`rustup-init.exe -y --profile minimal --default-toolchain stable`
2. Visual StudioのC++ツールとCMake（「C++によるデスクトップ開発」に含まれる）
3. Perl（OpenSSLのビルド用）：Strawberry Perlのポータブル版を展開し、`perlin` をPATHに追加する
4. libclang（bindgen用）：LLVMを導入するか、`libclang.dll` の場所を `LIBCLANG_PATH` に設定する
5. `cargo build --release`。初回はOpenSSLとlibdatachannelのビルドに時間がかかる

ファイアウォールでは、ローカルサブネットからのTCP 8080と、ホストの実行ファイルのUDP（WebRTC）を許可する。

## 最初の実機通信ゲート

- LANに制御エンドポイントを公開する前に、認可付き参加・セッション・入力解放を実装する。
- 可能なら選択したWi-Fiインターフェースに限定してUvicornを公開する。`0.0.0.0` を使う場合も、信頼したネットワークへのファイアウォール制限とトークン検証を行う。
- WindowsホットスポットへiPhone Safariを含むスマホ3台を接続する。
- クラウドなしで動くことを `docs/architecture/validation-gates.md` に沿って確認する。

## 最初の実機ゲーム入力ゲート

- Minecraftを前面にする明示手順を備えた、独立したWindows専用プローブでキーと相対マウスの挙動を確認する。
- プロセス起動時に合成キーを送らない。PCからの明確な緊急停止・全解放を用意する。
- 実PCで試験し記録するまで、プローブを検証済みと報告しない。
