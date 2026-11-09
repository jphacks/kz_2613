# Web画面のTypeScript一本化と配信構成

利用者が2026-11-09に指定した設計に従い、画面の正本をapps/webへ統一する。旧JSはmainから削除し、復元には既存のlegacy-js-before-react / legacy-js-engine-before-ts / legacy-js-last-with-reactタグだけを使用する。

Viteが5 HTMLエントリとCSSを処理し、apps/web/distをRustホストとTauriと配布zipが共通に使う。標準URLとPC限定配信は維持する。入力エンジンはReact描画と分離し、通信契約・定数・認可は変更しない。

詳細は[Web構成](../architecture/web-structure.md)。移動とパス更新、試験移植、旧版削除、overlay TS化を分け、診断と疑似ゲームは別Draft PR。main採用・マージ・Issue closeは利用者が決める。dry-run自動試験は実機受入を代行しない。
