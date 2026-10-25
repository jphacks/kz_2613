# 初期環境の構築判断（2026-10-24）

対象はPhase 0のみ。入力ドライバー・セッション・スマホ操作機能は未実装のまま保持する。

- 提供パッケージの37件をMANIFEST.sha256と照合してから中身だけを統合した。
  最新mainへfast-forwardし、README.mdとLICENSEの内容を保持した。
- 提供されたPython/React依存を使用し、新しいproduction依存は追加しない。
  Python 3.12.14のvenvで実際に解決した依存を `apps/host/constraints-core.txt` へ記録する。
  Windowsで解決されないLinux専用依存は各環境で解決される。完全な全OS共通lockではない。
- フロントエンドは `package-lock.json` をコミットし、clone後とCIでは `npm ci` を使う。
- Python CIをWindowsとUbuntuで実行し、web CIではbuild後のFastAPI静的配信も検証する。
  実機入力やホットスポット試験はCIの成功とは別に管理する。
- 共通運用は `docs/develop/handoff/DEVELOPMENT_WORKFLOW.md`、要件別のIssue/依存関係は
  `docs/develop/handoff/ISSUE_PLAN.md` に集約する。AGENTS/CLAUDEへ仕様を重複して記載しない。
- フロントエンドの算術sanityテストを、PC/スマホ表示と未実装の明示を確認するテストへ置き換える。
  Reactの既存SSR APIを使用するため追加のテスト依存は不要。
- 今回のmain直接push許可は初期構築に限定。次の入力プローブは別Issue/ブランチで行い、
  実行時も操作者の明示開始までOS入力を送信しない。
