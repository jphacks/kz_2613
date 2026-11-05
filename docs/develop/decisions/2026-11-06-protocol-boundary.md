# JSON受信の解析と型付き検証境界（#179）

#173の製品実装を統合したmain `4eda26267da73c045ffc6e7644aa94dbbf240604` を基準に、[設計監査](2026-11-05-protocol-boundary-plan.md)の必要な境界を製品へ接続した。新依存・コード生成・ビルド手順・通信方式・protocolVersionの変更はない。

Rustの`protocol.rs`はJSON構文、共通の文字列/数値解釈、Input/Look/Remote/Commandの型付き値を扱う。Inputの保留キューにもデコード済みの型を保存する。ACK/ログ用の元JSONを保持し、有限な数値文字列・小数の整数化、stateがdown以外なら解放、boolでないburstはfalse、Remoteの数値文字列非受理と±120制限を維持する。認証・現在WS/RTC世代・epochの可否・順序/重複・担当の認可はHub/sessionから移さない。monitorやhelloのフィールドも共通解釈を利用し、既存の管理認可を保持する。

安全上の差は、入力連番と視点のNaN/Infinity文字列の拒否に限定する。旧numはこれらをf64へ変換でき、視点基準へ非有限値が入る懸念があった。新しい境界は基準・順序を変更する前に拒否し、後続の有限な累積入力を正常処理する。共通num自体の寛容な解釈を全面的に厳密化せず、有効な既存JSONの意味は保持する。

Webの`protocol.js`は既知メッセージの判別と、描画・状態更新が必要とする構造を検証する。未知typeは無視できる形で保持。壊れたWS通知は保持を解放して通常の切断/再接続経路へ通す。RTCの壊れた通知は無視し、旧Socket/旧非同期channelの判定は解析より先に維持する。受信適用中の予期しない例外にも解放→切断の最後の境界を置いた。

独立レビューで、同epoch保持中の欠落connected、profile/actions/assignment、キーlabel、不正reasonや暗黙変換を起こす表示値で例外・保持残存が再現されたため、入れ子検証と実controller回帰を補強した。最終レビューで12系列と描画失敗注入が解放→切断へ進むこと、有効shapeがRustの生成値と一致することを確認した。lobbyのprofile:nullは有効として保持する。

Rust単体/Hub・通信、Web境界/入力/セッション、実ホスト配信のheadless描画で検証する。実Peerの無線品質、スマホ実機・Windows実入力・Minecraftの受入は別であり、今回の成功で置き換えない。
