# Issue駆動開発の共通ルール

## ローカルの作業場所

通常の編集・検証は `C:\Users\kumes\Documents\kz_2613` で行う。
ユーザーから別作業ツリーの指定がない限り、tmpや`.venv`配下に作業用のチェックアウトを作らない。
過去の未反映ファイルをローカル保管する場合は、Git対象外の `data/local/` を使用する。

## 開発の流れ

CodexとClaude Codeは同じ `docs/requirements/requirements-v0.3.md` と
`docs/decisions/` を参照する。後の明示的なユーザー判断を優先し、提案を確定扱いしない。

使用言語は `AGENTS.md` に従う。Markdown資料、コミットの件名・本文、
PRのタイトル・本文は日本語で記述する。識別子・コマンド・URLは原表記を維持する。
コミット件名の例は「資料と開発ルールを日本語に統一する」。

1. `ISSUE_PLAN.md` とGitHubから作業可能なP0 Issueを1件選ぶ。前提Issueの完了を確認する。
2. `git status` とリモートを確認し、`codex/<issue番号>-<短い説明>` 等の専用ブランチを作成する。
3. 完了条件に沿う最小変更を行う。同じファイルを両エージェントで同時編集しない。
4. 対象の `cargo build`/`cargo test`、`scripts/sim/` のシミュレーション・画面の試験を実行（コマンドは `AGENTS.md`）。UI変更時は画面も確認する。
5. コマンド、結果、既知の問題を `BUILD_LOG.md` に追記し、判断の理由は `docs/decisions/` に日付付きで残す。
6. PRからIssueを参照し、レビュー・マージ後に完了条件を満たしたIssueを閉じる。

今回だけ許可された初期構築のmain直接pushは、以降の機能開発には適用しない。
実機検証Issueは実施端末・版・観測結果が揃って初めて完了扱いにする。
Issueには優先度、種別、対象を付け、前提が未完了なら `blocked`、実機作業なら
`needs-device-test` を付ける。前提完了時には `blocked` を外す。

`AGENTS.md` が共通の入口、`CLAUDE.md` はその参照のみを持つ。
詳細な運用・仕様を両方へ複製しない。トークンや実環境のIPをログやIssueへ記載しない。
