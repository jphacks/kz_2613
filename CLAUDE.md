# Re:Cooplay — Claude Code向けの案内

このリポジトリは**CodexとClaude Code**で共同利用する。最初に `AGENTS.md` の共通設計・安全性・使用言語のルールを読み、次の文書を参照する。ここに独立した別仕様を作らない。

1. `docs/requirements/requirements-v0.2.md`：MVP要件と状態区分 [D]/[M]/[H]/[P]/[V]。
2. `docs/decisions/2026-10-24-user-decisions.md`：ユーザー確定の挙動と新しいUI判断。
3. `docs/decisions/tech-stack-provisional.md`：仮の技術構成と代替案。
4. `docs/architecture/system-design.md`：モジュール境界、権限、安全性。
5. `docs/architecture/validation-gates.md`：実機による採用可否の判定。
6. `docs/handoff/FIRST_CODEX_TASK.md`：両エージェントで利用できる初期構築用の依頼文。
7. `docs/handoff/DEVELOPMENT_WORKFLOW.md`：Issue・ブランチ・PRの共通運用。

**動作準備が整ったと誤報しない。** Minecraft入力と実機3台のセッションは未検証。ひな形のヘルスチェックはゲーム互換性の証拠ではない。

レビューしやすい小さなコミットと明確な検証結果を残し、引き継ぎは `docs/handoff/BUILD_LOG.md` に記録する。秘密情報・個人トークン・実環境固有のIPをコミットしない。ユーザーの明示的な指示なしに `README.md` と `LICENSE` を上書きしない。
