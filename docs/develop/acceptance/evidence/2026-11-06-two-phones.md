# Android・iOSの2台受入記録（2026-11-06）

- 開始は初回13:36:13、追試13:38:22 JST。製品ソースは `83c700907f0f382d08b5df9cc8ce1c2c2d274ca7`、ホストexeのSHA-256は `e50840be3c75f16adb346d326558b7ebbe329cfc4c9c495d3f53cb1597b1abea`。配布zipは使用していない。
- Windows PCの既存ホットスポットでAndroid 16 / Chrome 156.0.8078.79とiOS端末を接続。iOSのOSとブラウザの詳細版は未採取。ホストはiOSとして判別した。Androidの操作にはUSBのCDP転送、iOSの操作には手動タップを使用。HTTP・WS参加は両端末ともLAN経由。模擬参加者0。
- [受入手順](../README.md)のLAN用dry-runでホストを起動。疑似入力先と初期 `down=[]` を確認。自動復帰OFF。AndroidをP1、iOSをP2として参加させ、PC側の監視接続で分担を確定した。P1からPREPARE→READY→担当入力→Pause→再読み込み。試験ごとに終了と後片付けを行った。

| 試験 | 期待 | 観測・判定 |
|---|---|---|
| 2台の参加・分担と二段階Ready | P1は移動、P2は視点・攻撃等を担当し、準備と開始が分かれる | 両試行で2台参加と `preparing`（epoch 3）→`coop`（epoch 4）。Androidの協力画面を保存。PASS |
| 初回のiOS再接続 | 切断で停止し、復帰時に元の枠へ戻る | close 1001で `paused`（epoch 6）、同一P2に再接続。自動復帰OFFのまま。切断の発生操作は未特定。PASS |
| 初回のiOS担当ボタン | 協力状態で入力を観測 | 切断で停止した後、再開せず30秒待機してタイムアウト。初回の入力は未確認。製品の入力不具合はこの結果から判定できない |
| 追試の両担当入力 | down/upが各担当の論理出力に対応 | Androidのジャンプ、iOSの攻撃を受理。攻撃downはRTC、upはWS。ホスト時刻でP1のSPACEとP2のMOUSE_Lの論理保持が約7ms重複。PASS（短時間の観測1回） |
| 追試のPauseとP1復帰 | 保持中のPauseで解放し、再読み込み後も停止 | SPACEをシステムが解放して `paused`（epoch 5）、`down=[]`。再接続後はP1・停止状態。PASS |
| 通信経路と終了 | WS参加、RTCの成立、ホスト終了 | 両枠ともRTC `open`。両試行のホスト終了コード0、解放確認あり。PASS |

同一ホットスポット構成での短時間の観測。ルーターとの遅延・ジッター比較、連続30秒の同時操作、役割交換・本人確認、担当外操作の拒否、意図的なWi-Fi遮断と明示Resume、3実端末、実Windows入力、Minecraftは未実施。次回は同じ版と構成でAT-D02/03の残りを実施し、AT-D07の比較では経路・時間・試行数を揃える。

ホストの生ログ、要約JSON、Android画面、試験時に使ったローカル補助スクリプトは専用worktreeのGit対象外 `data/local/device-acceptance/` に保管。初回 `run-cfz4nz/`、追試 `run-uiGkoQ/`。iOSの画面画像は未採取。公開用の記録は端末ID、アドレス、トークンを除いた。
