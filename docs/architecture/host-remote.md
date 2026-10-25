# ホストのタッチパッドと操作先

P1だけがロビー・preparing・pausedで使用する。coopではメニュー操作を受け付けず、P2の協力視点と送信経路・順序番号を分離する。

| 操作先 | サーバーの条件 | 処理 |
| --- | --- | --- |
| PCアプリ | Tauriでは前面プロセスがrecooplay-desktop.exe。ブラウザ代替は許可ブラウザの前面タイトルとPCページのfocusを併用 | 仮想DOMカーソル、ボタン・ゲーム選択のクリック、スクロール、画面移動 |
| Minecraftメニュー | preparingまたはpaused、PC画面向け経路ではない、入力モードと対象前面判定が有効 | 相対移動、左右ボタン、ホイール、矢印・Enter・Esc・E |
| 対象外 | 上記以外 | 入力しない |

WebView2のdocument.hasFocusだけでは操作先を選ばない。ゲーム経路とPC経路は排他的。PCの右クリック・EはOSへ送らない。仮想カーソルは実OSカーソルを動かさない。

## 通信

- `remote`はWS専用、`epoch`、単調増加の`rseq`、`kind:move/scroll/release`、`dx/dy`を持つ。P1以外・coop・旧epoch・重複を拒否し、移動量を各軸±120へ制限する。
- 左右ボタンなどは既存の`input`のiseq・epoch・解放規則を使う。`REMOTE_LEFT/REMOTE_RIGHT/REMOTE_E/REMOTE_WHEEL_UP/REMOTE_WHEEL_DOWN`を追加する。
- フォーカス経路・入力モードの変更で全解放してepochを更新する。端末のpointercancel・回転・非表示では`release_inputs`を送る。認証済み参加者の現在epochに限り全解放・保留破棄・視点破棄を行う。遅れて届いた解放も新epochへ影響させない。
- タッチパッド移動を最大30Hzで送る。既存の協力視点30Hz、補間4ms、最低押下60ms・解放50msは変更しない。

実際のPCアプリ・MinecraftメニューとAndroid/iPhoneのタッチ操作、Windowsの前面化制限は工程5の実機受入で確認する。dry-runによる経路差替えを実機検証と呼ばない。
