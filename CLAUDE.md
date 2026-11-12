# Re:Cooplay — Claude Code向けの案内

mainへ統合する前に、対象PRの最新コミットでGitHub Actionsの必須チェック `structure`、`host-rs`、`web`、`desktop`、`protocol`、`package` の成功を確認する。資料のみの変更にも適用する。[CIの検証範囲](docs/develop/handoff/CI_VERIFICATION.md) を参照する。

このリポジトリは**CodexとClaude Code**で共同利用する。最初に `AGENTS.md` の共通設計・安全性・使用言語のルールを読み、次の文書を参照する。ここに独立した別仕様を作らない。

1. `docs/develop/requirements/requirements-v0.3.md`：MVP要件と状態区分 [E]/[D]/[M]/[H]/[P]/[V]。[E]は観測事実であり、新しい明示的なユーザー判断を優先する。
2. `docs/develop/decisions/2026-10-24-user-decisions.md`：ユーザー確定の挙動と新しいUI判断。
3. `docs/develop/decisions/tech-stack.md`：技術構成（Rust・WebSocket＋WebRTC）と不採用の理由。
3a. `docs/develop/decisions/2026-10-24-prototype-validated.md`：試作品の観測事実・採用判断・未決事項の区別。
3b. `docs/protocol-specification.md`：スマホ・PC画面とホストの通信契約。
4. `docs/README.md`：モジュール境界、権限、安全性。
5. `docs/develop/architecture/validation-gates.md`：実機による採用可否の判定。
6. `docs/develop/handoff/SETUP_WINDOWS.md`：現行のWindows構築と検証手順。Issue・PRの運用は `docs/develop/handoff/DEVELOPMENT_WORKFLOW.md` を参照する。
7. `docs/develop/handoff/DEVELOPMENT_WORKFLOW.md`：Issue・ブランチ・PRの共通運用。

**動作準備が整ったと誤報しない。** 通信・役割・入力注入は試作品（リポジトリ外のNode.js参照実装）で実機確認したが、**Rust版はPC上のシミュレーションのみ実施済みで、Minecraft・Tauri・Rust実機は未検証**。ひな形のヘルスチェックはゲーム互換性の証拠ではない。

レビューしやすい小さなコミットと明確な検証結果を残し、引き継ぎは `docs/develop/handoff/BUILD_LOG.md` に記録する。秘密情報・個人トークン・実環境固有のIPをコミットしない。ユーザーの明示的な指示なしに `README.md` と `LICENSE` を上書きしない。


Web画面・配信物・共有TSの構成は [Web構成](docs/develop/architecture/web-structure.md) を参照する。
