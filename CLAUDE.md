# Re:Cooplay — Claude Code向けの案内

このリポジトリは**CodexとClaude Code**で共同利用する。最初に `AGENTS.md` の共通設計・安全性・使用言語のルールを読み、次の文書を参照する。ここに独立した別仕様を作らない。

1. `docs/requirements/requirements-v0.3.md`：MVP要件と状態区分 [E]/[D]/[M]/[H]/[P]/[V]。[E]（試作品で実機検証済み）が最優先。
2. `docs/decisions/2026-10-24-user-decisions.md`：ユーザー確定の挙動と新しいUI判断。
3. `docs/decisions/tech-stack.md`：技術構成（Rust・WebSocket＋WebRTC）と不採用の理由。
3a. `docs/decisions/2026-10-24-prototype-validated.md`：試作品の検証結果を正とする判断と変更点。
3b. `docs/architecture/protocol.md`：スマホ・PC画面とホストの通信契約。
4. `docs/architecture/system-design.md`：モジュール境界、権限、安全性。
5. `docs/architecture/validation-gates.md`：実機による採用可否の判定。
6. `docs/handoff/FIRST_CODEX_TASK.md`：両エージェントで利用できる初期構築用の依頼文。
7. `docs/handoff/DEVELOPMENT_WORKFLOW.md`：Issue・ブランチ・PRの共通運用。

**動作準備が整ったと誤報しない。** 通信・役割・入力注入は試作品（リポジトリ外のNode.js参照実装）で実機確認したが、**Minecraftでの入力とRust版ホストは未検証**。ひな形のヘルスチェックはゲーム互換性の証拠ではない。

レビューしやすい小さなコミットと明確な検証結果を残し、引き継ぎは `docs/handoff/BUILD_LOG.md` に記録する。秘密情報・個人トークン・実環境固有のIPをコミットしない。ユーザーの明示的な指示なしに `README.md` と `LICENSE` を上書きしない。
