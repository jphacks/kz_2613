# Codex・Claude Code共通の初期構築依頼文

これは旧Python/Reactひな形の初期構築時の依頼記録。#68でひな形を削除したため、以下のコマンドを現在の再構築手順として実行しない。現行のRust/Tauri構築は `SETUP_WINDOWS.md`、現在の状態は `BUILD_LOG.md` と `ISSUE_PLAN.md` を確認する。

---

Windows 11でRe:Cooplay（`jphacks/kz_2613`）の初期環境を構築してください。

最初にルートの `AGENTS.md`、`CLAUDE.md`、`docs/develop/requirements/requirements-v0.3.md`、`docs/develop/decisions/2026-10-24-user-decisions.md`、`docs/develop/decisions/tech-stack.md`、`docs/develop/architecture/validation-gates.md` を読んでください。UIの作り込みより、確実に動くMinecraft Java Editionのデモを優先します。

**作業：** 基本の開発環境を整備し、ホストとWebのひな形が利用可能なPCでビルド・テストできることを確認してください。対象は初期構築の段階で、ゲーム操作機能の完成ではありません。既存JPHACKS READMEの構造とLICENSEを保持し、既存ファイルとGitの状態を確認して他の人の変更を上書きしないでください。

1. Python 3.12・Node.js 22を確認し、依存をローカルへ導入してください。既存の `package-lock.json` があれば `npm ci` を使ってください。初回でlockがない場合だけ `npm install` で生成・コミットしてCIを `npm ci` へ切り替え、実際に解決した依存を再現可能にしてください。
2. `python scripts/verify_overlay.py`、ホストのpytest・ruff、Webの型検査・Vitest・Viteビルドを実行してください。問題を修正し、正確なコマンドと成否を記録してください。
3. `http://127.0.0.1:8000/api/health` と同梱した `apps/web/dist` がクラウド・CDNなしで配信されることを確認してください。実機検証前は `game_input_ready:false` を維持してください。
4. 最短の手動入力プローブを独立スクリプトとして設計してください。ただし**操作者の明示操作なしにOS入力を送らないでください**。実MinecraftでSendInputのスキャンコードと相対視点を確認する計画とし、実施前は未検証と報告してください。
5. 次の最小実装を、認証付き3端末の役割・セッション接続、保持キー・タイムアウト・epoch、安全な解放として定義してください。未認証のLAN向けOS操作エンドポイントを公開しないでください。
6. 環境・変更・検証・問題・次の作業を `docs/develop/handoff/BUILD_LOG.md` に記録してください。実際に観測していない実機ゲートを成功扱いしないでください。
7. 大規模な技術移行やゲーム自動検出は行わないでください。pywebview配布や完成UIは後続段階です。P0ではMinecraftの手動起動を許容します。

変更前に短い計画を示し、終了時に変更ファイル・コマンドと検証結果・未解決の実機ゲート・次の具体的な作業をまとめてください。

---

**初期構築成功後の次の作業案：** 明示的な手動開始と安全対策を備えたWindows SendInputプローブを作成し、導入済みMinecraft Javaの版で検証します。この独立ゲートにはブラウザやスマホ3台の通信は不要です。
