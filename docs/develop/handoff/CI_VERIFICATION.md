# CIの検証範囲

統合前に `gh pr checks <PR番号>` で最新のPRに対する `structure`、`host-rs`、`web`、`desktop`、`protocol`、`package`、`npm-audit`、`cargo-audit (host-rs)`、`cargo-audit (desktop)` がすべて成功していることを確認する。未実行・実行中・失敗は統合待ちとする。GitHubのブランチ保護の設定は使わない。PR更新時は古いPR実行を取り消し、mainへのpushでも全ジョブを実行する。

| 確かめること | 現行CIの根拠 |
| --- | --- |
| 担当外入力と管理操作の拒否、通信版不一致、旧epoch、切断・Pause時の全解放、停止後の旧入力拒否 | `protocol-sim.mjs`、Rustのホスト試験、`product-web-test.mjs` |
| 対象喪失・緊急停止・終了時の入力停止 | `protocol-sim.mjs`、`shutdown-sim.mjs`、`input-probe-sim.mjs` のdry-run・模擬経路 |
| PCとスマホの表示、通信・保持元の境界 | Webの型検査、`product-web-test.mjs`、`check-static-pages.mjs`、`auxiliary-pages-smoke.mjs` |
| 配布物、サイレント導入・更新・アンインストール | `package-smoke.mjs`、`installer-smoke.mjs`、Rustのデスクトップ試験 |
| Tauriの起動と実WebView2ウィンドウ、最小サイズの参加画面、設定と終了 | `package` ジョブの `desktop-webview2-smoke.mjs` |
| Rustの整形・Clippy、RustとWebの依存関係 | `host-rs`・`desktop` 内の `cargo fmt --check` と `cargo clippy -D warnings`、`cargo-audit` と `npm-audit` |
| 実機試験補助の経路・測定データ判定 | `scripts/device/` の単体試験 |

押してから実入力までの遅延の計測用ビルド（ホストの feature `latency-measure`、スマホの `npm run build:latency`）は、通常の配布物に入れない。必須の `host-rs` は、配布物を保存した後に、featureを付けたClippyと試験で壊れていないことだけを確かめる。計測用の配布zip（`-latency-measure` 付き）は、手動で起動する `latency-measure.yml` で作る。

Rustの版はリポジトリ直下の `rust-toolchain.toml` で固定する（#379）。新しいRustでClippyの検査項目が増えた日に、変更と無関係なPRが失敗しないようにするため。`host-rs`・`desktop`・`cargo-audit` のジョブは最初にその版を入れ、`rustc --version` をログに出す。版を上げるときは、`channel` の行だけを変える専用のPRで、整形・Clippy・試験が通ることを確かめる。

| 安全条件 | CIで確認する範囲 | 実機で確認する範囲 |
| --- | --- | --- |
| 開始・管理操作の認可と旧入力の拒否 | 担当外・ホスト以外・旧epochの操作を拒否する。版不一致では参加枠を割り当てない | Android Chrome・iPhone Safariの旧タブに版不一致の案内を出し、再読み込み後に参加する |
| 停止時の全解放と再開 | Pause・切断・緊急停止・終了で保持と待ち行列を解放する。再開時は旧入力を使わない | 実Wi-Fi断や端末ロック中の保持を解放し、再接続後は新しい押下で操作する |
| 入力先の制限と緊急停止 | 前面喪失と緊急停止の模擬イベントで出力を止める | MinecraftでAlt+Tab・対象の終了・物理ホットキーを試し、意図しないウィンドウに入力が届かないことを確認する |
| 操作と導入 | 指の保持元・生成画面・配布物の起動とサイレント導入を自動検証する | スマホの実タッチ、実ゲーム、クリーンPCでの対話導入と表示倍率を確認する |

環境と結果の記録方法は[実機受入手順](../acceptance/README.md)を参照する。

失敗時はActionsのジョブログを開き、失敗した手順、対象コミット、runとattemptを記録する。同じコミットの再実行で結果が変わった場合は両方を記録する。通信と補助画面の失敗時は、それぞれの診断成果物を確認する。

手動の「通信・補助画面・PCアプリの反復試験」（`ci-repeat.yml`）は、同じコミットで成功したRust CIのrun ID（`build_run`）を指定する。`suite=core`（既定）は通信と補助画面を各20回、`suite=desktop` は配布PCアプリのWebView2試験を20回、`suite=all` は両方を実行する。4ジョブで5回ずつ実行し、coreとdesktopは独立したランナーを使う。ZIPのSHA-256とマニフェストのコミット・未変更状態を照合し、同じ配布物で試す。

配布WebView2では、参加画面・最小ウィンドウ・ダイアログ・オーバーレイを表示したままのアプリとホストの終了を、既存の `desktop-webview2-smoke.mjs` で確認する。1回失敗しても残りの試行を続け、失敗が1件でもあればジョブを失敗にする。各回の終了コード・所要時間は `desktop-results.json`、出力は `desktop-<試行番号>.txt`、取得できた失敗画面とホストログは `desktop-<試行番号>/` に保存する。成果物名はcoreが従来どおり `repeat-diagnostics-<1〜4>`、desktopが `repeat-desktop-diagnostics-<1〜4>`。後続の成功で先の失敗を消さない。検査を追加した後の反復結果は #379 で追跡する。CIのdry-runはスマホ・実ゲーム・実無線での受入の代わりにはしない。

画面寸法の検査は通信ジョブで行う。PCは800×560と900×1000、スマホは390×844と402×874のビューポートを使う。操作表示の横はみ出しと小さすぎる文字を検査し、画像と寸法・検査結果を `viewport-layout` 成果物へ保存する。スマホは縦スクロールを許可する。失敗時は `shots.json` の対象画面と検査結果を画像と照合する。実端末の表示倍率やブラウザーUIを含む見え方は実機受入で確認する。
