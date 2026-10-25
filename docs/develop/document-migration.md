# 資料移動一覧

2026-10-26。現行仕様と利用案内をdocs直下へ、開発記録をdevelop配下へ整理した。

| 旧パス | 新パス |
|:--|:--|
| `docs/architecture/` | `docs/develop/architecture/` |
| `docs/requirements/` | `docs/develop/requirements/` |
| `docs/decisions/` | `docs/develop/decisions/` |
| `docs/design/` | `docs/develop/design/` |
| `docs/handoff/` | `docs/develop/handoff/` |
| `docs/data/` | `docs/develop/data/` |
| `docs/architecture/protocol.md` | [通信仕様](../protocol-specification.md) |
| `docs/architecture/game-profiles.md` | [操作定義仕様](../game-profile-specification.md) |

通信・操作定義は移動後の仕様書を現行契約の参照先とし、旧本文のコピーは残さない。過去コミット・ブランチを指すGitHubの証拠URLは変更しない。画像・JSONの内容は保持する。

生成・検証コード、AGENTS・CLAUDE、READMEと資料内のリンクも新パスへ更新した。カタログ生成先は`docs/develop/data/`、比較画像の入出力先は`docs/develop/design/evidence/`となる。

## 引き継いだ未コミット記録

- 外向け資料の調査メモとBUILD_LOGの調査記録を移動後も保持した。
- 製品の機能・通信版・操作定義形式は変更していない。
