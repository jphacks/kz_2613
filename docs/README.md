# Re:Cooplay 資料一覧

このページは、製品を**知る・試す・技術を確認する**ための入口です。[製品README](../README.md)はJPHACKSの公式テンプレート構成を保っています。

## 最初に読む

| 目的 | 資料 | 内容 |
|:--|:--|:--|
| 製品の概要 | [製品README](../README.md) | コンセプト、機能、受賞、開発技術 |
| 写真・画面 | [ギャラリー](gallery.md) | Hack Dayの実プレイ、PCとスマホの画面 |
| 実際の動作 | [動作・検証状況](verification.md) | 実機、シミュレーション、未検証の区別 |
| 動かしてみる | [Windowsセットアップ](handoff/SETUP_WINDOWS.md) | 必要な環境とビルド・起動 |
| 仕組みを知る | [システム設計](architecture/system-design.md) | 通信、操作統合、Windows入力 |

**動画の公開リンクはREADMEに未掲載です。** 新しいリンクを推測して追加せず、実プレイ写真と検証記録を案内しています。

## 技術・設計・開発資料

| 分類 | 主な資料 |
|:--|:--|
| **システム・通信** | [全体設計](architecture/system-design.md) ／ [通信仕様](architecture/protocol.md) ／ [入力・ホスト操作](architecture/host-remote.md) |
| **ゲーム別操作** | [操作定義](architecture/game-profiles.md) ／ [操作定義の実装](../apps/game-profiles/) |
| **PC・スマホ画面** | [PC画面仕様](architecture/pc-screens.md) ／ [デザイン・UI資料](design/README.md) |
| **要件** | [要件 v0.3](requirements/requirements-v0.3.md) ／ [旧版 v0.2](requirements/requirements-v0.2.md) |
| **開発・検証の履歴** | [開発記録の案内](handoff/README.md) ／ [当日の開発ログ](handoff/BUILD_LOG.md) |
| **意思決定** | [判断記録](decisions/) ／ [2〜4人に拡張した判断](decisions/2026-10-25-variable-players.md) |
| **参考データ** | [ゲーム一覧](data/top500-games.md) ／ [ゲーム操作定義](../apps/game-profiles/) |
| **実装** | [Rustホスト](../apps/host-rs/README.md) ／ [PCアプリ](../apps/desktop/README.md) ／ [スマホ・PC画面](../apps/web-static/) |

## 読むときの注意

- **現行の実装と過去の設計は別です。** 古い仕様書の「未実装」「未検証」は、その文書の作成時点の記述です。日付の新しい[開発ログ](handoff/BUILD_LOG.md)と[検証状況](verification.md)を併せて確認してください。
- **3人でのMinecraftの実プレイ記録**と、2026年10月25日のPR #110で追加された**2〜4人の人数別分担の実装**を区別します。2人・4人の実機受入は未実施です。
- `artifacts/improved-ui/`の**104画面はブラウザの表示検証資料**です。写真や実タッチの証拠ではありません。操作定義502件も動作確認済みのゲーム数ではありません。
- 設計・経緯はGitHubの履歴を壊さないよう保存し、**閲覧の入口と当時の作業記録を分離**します。

[製品READMEに戻る](../README.md)
