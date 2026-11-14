# 開発・検証スクリプト

コマンドはリポジトリのルートで実行する。CIの必須チェックと実機受入の区分は [CIの検証範囲](../docs/develop/handoff/CI_VERIFICATION.md) を参照する。

| 用途 | 扱いと実行方法 |
| --- | --- |
| PC・スマホの画面寸法と撮影 | CI。手動確認はWebをビルドして `node scripts/sim/capture-screens.mjs --bin <ホストexe> --pc-size 800x560 --phone-size 390x844 --assert-layout`。Chromeとdry-runホストで確認する。 |
| PCの画面操作・原案比較 | 手動。画面操作は `node scripts/sim/desktop-browser-harness.mjs --bin <ホストexe>`。原案との比較は `python scripts/sim/audit-pc-fidelity.py --help` と `scripts/sim/measure-pc-reference.py` を参照する。 |
| 終了通知・確認の再接続 | 手動の独立回帰は `node scripts/sim/review-terminal-regression.mjs`。通常CIでは `phone-lifecycle-test.mjs` の対応ケースを実行する。 |
| ホストの負荷比較 | 手動。専用テストexeを使い、[負荷計測の手順](../docs/develop/decisions/2026-11-05-host-load-measurement.md)に従う。短い製品dry-run計測はCIで実施する。 |
| 操作定義の生成・下書き | 手動。候補は `node scripts/profiles/extract.mjs`（エンジンごとの読み取りは `scripts/profiles/engines.mjs`、試験は `scripts/sim/profile-engines-test.mjs`）、カタログは `node scripts/profiles/build-catalog.mjs --cache <キャッシュフォルダ>`。入力や出力の判定はCIのプロファイル試験で確認する。 |
| Android・Wi-Fiの受入補助 | 手動。[実機受入手順](../docs/develop/acceptance/README.md)を参照する。端末や無線状態を変更する試験は担当者の立ち会いで行う。 |
| Wi-Fi測定の準備と集計 | 手動。`wifi-network-discover.mjs`、`summarize-react-review.mjs`、`summarize-wifi-review.mjs` の引数と証拠の扱いは[性能報告](../docs/develop/acceptance/2026-11-09-react-performance.md)を参照する。 |
| ブランド素材の確認 | 手動。`python scripts/sim/verify-brand-assets.py` のプレビュー・実行ファイル検査は[ブランド素材の手順](../docs/develop/design/brand-assets.md)を参照する。 |
| Windows配布 | CIでパッケージとインストーラーを試験する。ファイアウォール許可の補助は配布物に同梱する。実環境での実行と復元は[Windows構築手順](../docs/develop/handoff/SETUP_WINDOWS.md)を参照する。 |

`ui-preview.mjs`、`build-ui-gallery.py`、`report-pc-fidelity.py` は過去の画面記録を参照するときの手動用とする。現行版の撮影には `capture-screens.mjs` を使う。旧プレビューが参照していた `mini-ws.mjs` は履歴に残る。
