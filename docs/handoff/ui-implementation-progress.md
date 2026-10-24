# UI実装の進捗と受入条件

実行指示は `2026-10-25-ui-implementation-execution.md`。起点はmainの `0b35dd1`。mainの未コミット実機記録を保持し、専用作業ツリーで実装する。マージ・auto-merge・mainへのpushは行わない。

| 工程 | 達成条件 | 状態 |
| --- | --- | --- |
| 0 | GitHub・要件・既存コード・素材17枚・基準試験を確認 | 完了 |
| 1 | preparing、P1の明示Ready、旧STARTの迂回防止、サーバー認可、検証、機能PR | 完了：PR #90・CI成功 |
| 2 | P1タッチパッド、PCとゲームの排他的操作、安全停止、検証、機能PR | 完了：PR #91 |
| 3 | 素材採色、共通パレット・トークン、ローカル素材配信 | 完了 |
| 4 | PC・スマホ同時刷新、縦画面の可変幅・高さ、表示・性能確認、UI PR | 完了：PR #92 |

## 最新の採用判断

- 接続人数とゲームのReadyを分離する。ReadyはP1だけ。P2/P3の接続を個別Readyと見なさない。
- Rust通信契約はv4。旧STARTは準備へ移るだけで協力プレイへ直接移らない。
- 既存Minecraftウィンドウをプロセス名とタイトルで照合して前面化する。検出・前面化失敗時は手動起動・切替へ案内する。任意の実行パスをスマホから受け取らない。
- 既存の押下・解放・視点処理の定数は変更しない。dry-runの対象差替えは実機証拠ではない。
- Figmaは取得できなかったため、提供PNG17枚を参照する。灰色のキャラクター・配置の仮枠は製品素材として取り込まない。
- スマホは縦画面で可変幅・可変高さに対応する。横画面は入力を解放して縦向き案内を表示する。自由配置編集・React移行は含めない。
- 最後に、実装で生じたUI管理上の問題を根拠としてReact移行検証の価値を評価する。

## 残る実機受入

工程5は今回実施しない。Android・iPhone計3台、Minecraft Java Edition、Tauriについて、Ready前のメニュー操作、開始後の3人操作、押下中のAlt+Tab、切断・再接続、実ホットキー停止、端末回転・画面非表示、Raw Inputと感度を記録して受入する。以前の基本操作試験は、新UIの実機検証に読み替えない。

## 提出したPR

- https://github.com/jphacks/kz_2613/pull/90 ：base main。準備と明示Ready。
- https://github.com/jphacks/kz_2613/pull/91 ：base codex/88-two-stage-ready。ホスト操作。
- https://github.com/jphacks/kz_2613/pull/92 ：base codex/46-host-touchpad。PC・スマホ同時UI。

工程0〜4のコード・機械試験・PR作成を完了。レビュー順序は #90 → #91 → #92。マージ・auto-merge・mainへのpush・Issueクローズは行っていない。詳細は docs/design/ui-validation.md と BUILD_LOG.md を参照する。
