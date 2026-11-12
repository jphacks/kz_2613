# Issue駆動開発の共通ルール

## ローカルの作業場所

通常の編集・検証は、自分のリポジトリのルートか担当Issue用の専用worktreeで行う。
ユーザーから別作業ツリーの指定がない限り、tmpや`.venv`配下に作業用のチェックアウトを作らない。
過去の未反映ファイルをローカル保管する場合は、Git対象外の `data/local/` を使用する。

## 開発の流れ

統合前の必須チェック、CIの検証範囲と実機受入の違い、失敗時の確認方法は [CIの検証範囲](CI_VERIFICATION.md) を参照する。

CodexとClaude Codeは同じ `docs/develop/requirements/requirements-v0.3.md` と
`docs/develop/decisions/` を参照する。後の明示的なユーザー判断を優先し、提案を確定扱いしない。

使用言語は `AGENTS.md` に従う。Markdown資料、コミットの件名・本文、
PRのタイトル・本文は日本語で記述する。識別子・コマンド・URLは原表記を維持する。
コミット件名の例は「資料と開発ルールを日本語に統一する」。

1. GitHubのOpen Issue・PRと最新のコメントから作業可能なIssueを1件選ぶ。P0とデモの安全性を優先し、前提Issueの完了と他の担当者の着手状況を確認する。
2. 最新のIssue・PR・コメントを確認して作業の重複がないことを確かめ、実際に着手するIssueへ「着手します。〇〇のリファクタリングを進めます。」等の短い日本語コメントを投稿する。Codex・Claude Code双方に適用し、同じ作業の再開では不要な重複投稿を避ける。投稿できなかった場合は投稿済みと報告しない。投稿後に `git status` とリモートを確認し、`codex/<issue番号>-<短い説明>` 等の専用ブランチを作成する。
3. 完了条件に沿う最小変更を行う。同じファイルを両エージェントで同時編集しない。
4. 対象の `cargo build`/`cargo test`、`scripts/sim/` のシミュレーション・画面の試験を実行（コマンドは `AGENTS.md`）。UI変更時は画面も確認する。
5. コマンド、結果、既知の問題を `BUILD_LOG.md` に追記し、判断の理由は `docs/develop/decisions/` に日付付きで残す。
6. PRからIssueを参照し、レビュー・マージ後に完了条件を満たしたIssueを閉じる。

今回だけ許可された初期構築のmain直接pushは、以降の機能開発には適用しない。
実機検証Issueは実施端末・版・観測結果が揃って初めて完了扱いにする。
Issueには優先度、種別、対象を付け、前提が未完了なら `blocked`、実機作業なら
`needs-device-test` を付ける。前提完了時には `blocked` を外す。

`AGENTS.md` が共通の入口、`CLAUDE.md` はその参照のみを持つ。
詳細な運用・仕様を両方へ複製しない。トークンや実環境のIPをログやIssueへ記載しない。

現行の構築手順は [SETUP_WINDOWS.md](SETUP_WINDOWS.md)。[初期構築依頼](FIRST_CODEX_TASK.md) と [初期Issue計画](ISSUE_PLAN.md) は当時の判断や参照を残すための記録として保管する。
