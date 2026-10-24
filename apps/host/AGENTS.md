# ホスト側の実装ルール

> **2026-10-24：** PCホストはRustへ移行する（`docs/decisions/tech-stack.md`）。このディレクトリのPythonはひな形で、Rust版の取り込み時に置き換える。仕様の正は `docs/architecture/protocol.md` と `docs/architecture/system-design.md`。以下の安全規則は言語によらず適用する。

- ルートの `AGENTS.md` と `docs/requirements` を継承する。
- MVPではメモリー内の単一セッションをサーバーが管理する。役割や保持キーの状態がプロセスごとに分かれるため、複数ワーカーにしない。
- `domain/` の状態機械、WebSocketのルーティング、`platform/` のOS入力を分離する。
- モード・epoch・フォーカス・接続・終了の変化では、明示的に全入力を解放する。安全性が不明なら入力を許可しない。何もしないドライバーを準備完了扱いしない。
- 認証のないOS入力やホスト管理のエンドポイントをローカルWi-Fiへ公開しない。
- Minecraftの実機試験は手動の検証ゲートとして扱う。モックのテストでは代替できない。
