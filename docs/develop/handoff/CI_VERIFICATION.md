# CIの検証範囲

統合前に `gh pr checks <PR番号>` で最新のPRに対する `structure`、`host-rs`、`web`、`desktop`、`protocol`、`package`、`npm-audit`、`cargo-audit (host-rs)`、`cargo-audit (desktop)` がすべて成功していることを確認する。未実行・実行中・失敗は統合待ちとする。GitHubのブランチ保護の設定は使わない。PR更新時は古いPR実行を取り消し、mainへのpushでも全ジョブを実行する。

| 確かめること | 現行CIの根拠 |
| --- | --- |
| 担当外入力と管理操作の拒否、通信版不一致、旧epoch、切断・Pause時の全解放、停止後の旧入力拒否 | `protocol-sim.mjs`、Rustのホスト試験、`product-web-test.mjs` |
| 対象喪失・緊急停止・終了時の入力停止 | `protocol-sim.mjs`、`shutdown-sim.mjs`、`input-probe-sim.mjs` のdry-run・模擬経路 |
| PCとスマホの表示、通信・保持元の境界 | Webの型検査、`product-web-test.mjs`、`check-static-pages.mjs`、`auxiliary-pages-smoke.mjs` |
| 配布物、サイレント導入・更新・アンインストール | `package-smoke.mjs`、`installer-smoke.mjs`、Rustのデスクトップ試験 |
| Rustの整形・Clippy、RustとWebの依存関係 | `host-rs`・`desktop` 内の `cargo fmt --check` と `cargo clippy -D warnings`、`cargo-audit` と `npm-audit` |
| 実機試験補助の経路・測定データ判定 | `scripts/device/` の単体試験 |

Rustの版はリポジトリ直下の `rust-toolchain.toml` で固定する（#379）。新しいRustでClippyの検査項目が増えた日に、変更と無関係なPRが失敗しないようにするため。`host-rs`・`desktop`・`cargo-audit` のジョブは最初にその版を入れ、`rustc --version` をログに出す。版を上げるときは、`channel` の行だけを変える専用のPRで、整形・Clippy・試験が通ることを確かめる。

Windowsの物理ホットキー・前面切替・実入力、スマホ実機の指操作、実Wi-Fi断、Minecraft、クリーンPCでの対話導入と表示倍率は、[実機受入手順](../acceptance/README.md)で確認する。

失敗時はActionsのジョブログを開き、失敗した手順、対象コミット、runとattemptを記録する。同じコミットの再実行で結果が変わった場合は両方を記録する。通信と補助画面の失敗時は、それぞれの診断成果物を確認する。

手動の「通信と補助画面の反復試験」は、同じコミットで成功したRust CIのrun IDを指定する。通信と補助画面を各20回実行し、各回のログと結果を保存する。実ウィンドウ・画面寸法の自動検査、静的検査、反復結果は #379 で追跡する。

画面寸法の検査は通信ジョブで行う。PCは800×560と900×1000、スマホは390×844と402×874のビューポートを使う。操作表示の横はみ出しと小さすぎる文字を検査し、画像と寸法・検査結果を `viewport-layout` 成果物へ保存する。スマホは縦スクロールを許可する。失敗時は `shots.json` の対象画面と検査結果を画像と照合する。実端末の表示倍率やブラウザーUIを含む見え方は実機受入で確認する。
