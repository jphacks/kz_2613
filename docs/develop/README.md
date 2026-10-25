# Re:Cooplay 開発資料

[総合技術仕様](../README.md) ／ [利用手順](../usage.md) ／ [動作確認](../verification.md)

## 開発を始める

| 資料 | 内容 |
|:--|:--|
| [Windows構築](handoff/SETUP_WINDOWS.md) | Rust・Tauriのビルド、環境設定、実行 |
| [開発手順](handoff/DEVELOPMENT_WORKFLOW.md) | 作業場所、Git運用、検証・記録 |
| [BUILD_LOG](handoff/BUILD_LOG.md) | 実機観測、変更、試験結果の時系列 |
| [資料移動一覧](document-migration.md) | 旧パスと新しい参照先 |

## ソース構成

| 場所 | 内容 |
|:--|:--|
| `apps/host-rs/` | Rustホスト・入力・認可・状態管理 |
| `apps/desktop/` | Tauriのプロセス制御・WebView2 |
| `apps/web-static/` | PC・スマホ・診断・疑似ゲームの画面 |
| `apps/game-profiles/` | 製品に同梱する操作定義 |
| `scripts/sim/` | 通信・画面・配布の検証 |
| `scripts/profiles/` | 操作定義と参考カタログの生成・抽出 |

## 確認コマンド

リポジトリルートから実行する。Windowsのビルド環境は構築手順で設定する。

```powershell
cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml
cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml
cargo build --release --locked --manifest-path apps/desktop/Cargo.toml
node scripts/sim/protocol-sim.mjs
node scripts/sim/profile-catalog-test.mjs
node scripts/sim/verify-ui-evidence.mjs
python scripts/check-public-docs.py
python scripts/verify_overlay.py
```

## 設計と履歴

- [要件](requirements/requirements-v0.3.md)
- [技術選定](decisions/tech-stack.md)・[意思決定](decisions/)
- [過去の全体設計](architecture/system-design.md)・[実機検証ゲート](architecture/validation-gates.md)
- [デザイン](design/README.md)・[参考カタログ](data/top500-games.md)
- [開発・引継ぎ資料](handoff/README.md)

現行の契約は[通信仕様](../protocol-specification.md)と[操作定義仕様](../game-profile-specification.md)を参照する。過去の観測・判断は記録を保ち、現在の挙動と異なる場合は日付と適用範囲を併記する。
