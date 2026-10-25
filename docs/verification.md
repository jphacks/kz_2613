# Re:Cooplay 動作確認の範囲

**Hack Day（2026年10月24〜25日）時点の記録を整理したページ**です。新たな実機テストを実施したものではありません。

[製品README](../README.md) ／ [資料一覧](README.md) ／ [開発ログ](handoff/BUILD_LOG.md)

## 確認済み・未確認の区別

| 対象 | 根拠があること | 未確認・注意点 |
|:--|:--|:--|
| **Minecraftの3人プレイ** | 開発メンバーがWindows 11 PCとスマホ3台（Android Chrome 2台・iPhone Safari 1台）で前進・視点・持ち物切替などを共同操作したと報告 | すべての端末・条件での再現性や長時間動作は保証しない |
| **2〜4人への拡張（PR #110）** | 2026年10月25日に実装。人数別の分担・認可・画面・Rust dry-runの試験を実施 | **2人・4人でのMinecraft＋スマホ実機試験は未実施** |
| **通信・入力・安全停止** | Rustホストの自動試験とdry-runで認可・状態管理・停止を確認 | Minecraft本体での全パターン検証とは異なる |
| **PC・スマホUI** | ブラウザ表示と画面サイズを検証。104画面の検証用キャプチャを保存 | 新しい人数構成を含め、最新UIの全てを実端末で検証した証拠ではない |
| **複数ゲームの操作定義** | 定義形式と未検証状態の扱いを自動試験 | 502件の定義登録は、502タイトルの動作確認を意味しない |

## 証拠へのリンク

- **実機・実装の時系列：** [Hack Day開発・検証ログ](handoff/BUILD_LOG.md)
- **3人共同操作の実プレイ写真：** [ギャラリー](gallery.md)
- **人数を2〜4人へ拡張した設計判断：** [決定記録](decisions/2026-10-25-variable-players.md)
- **表示専用キャプチャ：** [UIの検証結果](../artifacts/improved-ui/README.md)
- **実装と試験コード：** [Rustホスト](../apps/host-rs/src/hub.rs)、[通信回帰試験](../scripts/sim/protocol-sim.mjs)
- **Hack Day中の実装差分：** [開始前のコミット](https://github.com/jphacks/kz_2613/tree/5acb0049e6)から[現在の実装](https://github.com/jphacks/kz_2613/compare/5acb0049e6...main)へ

[実機検証ゲート](architecture/validation-gates.md)には**10月24日時点の「未実施」**が残っています。履歴を上書きせず、10月25日の[開発ログ](handoff/BUILD_LOG.md)と組み合わせて読みます。

公開用のデモ動画URLはREADMEで確認できていないため、**現在は写真・ログ・コードを分けて示しています**。独立した実機再現の代わりになると主張するものではありません。
