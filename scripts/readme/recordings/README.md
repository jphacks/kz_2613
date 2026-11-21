# READMEの実画面の録画

`assets/readme/recordings/` のアニメーションWebP（UI編集・P1のリモコン）を作る道具です。実機と PC アプリを使うため CI では動かしません。

## 録画（2026-11-21 の手順）

1. PC アプリを WebView2 のデバッグ接続付きで起動する（`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`）。ホットスポットを ON にし、Android をその Wi-Fi で P1 として参加させる。ほかの参加者はヘッドレス Chrome の模擬スマホでよい。
2. Android の Chrome を `adb forward tcp:9222 localabstract:chrome_devtools_remote` で操作できるようにする。指の操作は `adb shell input motionevent` の実タッチで送る（`ADB` 環境変数で adb の場所を指定できる）。
3. このフォルダを作業場所にして実行する。
   - `node rec_b.mjs`：ゲーム一覧 → Minecraft → 分担の決定 → ゲームを起動する → ランチャーの「プレイ」を、P1 のタッチパッドだけで進めて録画する（スマホ `screenrecord` と PC 主画面の `ffmpeg gdigrab`）。
   - `node rec_a.mjs`：協力プレイ中の移動の担当で、配置の編集（つまみで縦横を変える・重ねて置ける場所の枠・広げる・保存）を録画する。
   - `remote.mjs` のタップ位置の換算（`OY`）は、Chrome のアドレスバーの高さで変わる。オフラインの帯が出ているときは測り直す。
   - `node rec_role.mjs role-p1 <OY> scenarios/role-p1-move.json`：協力プレイ中の担当画面（P1 移動・P2 視点・P3 アクション）を、台本どおりに実タッチで操作して録画する。Android を P2・P3 の枠に入れるときは、ホストの移譲と退出・再参加を使う。担当を変えたら、端末に保存した配置（`recooplay.layout.*`）を消してから録る（#601 で、別の担当に当てはめられて配置が崩れる）。
4. `python sync.py rec-b` でスマホと PC の録画の時刻をそろえる。

## 組み立て

`python compose.py a|b wide|narrow` で `out-<a|b>-<wide|narrow>.webp` を書く（幅 838px・324px の2倍で描く）。資料（画面一覧・使い方・画面仕様・ギャラリー）で使う。

`python screens.py <録画のフォルダ>` は、README の図（`showcase.py` の 02 分担・07 注力したこと）のスマホ画面に埋め込む画面だけの録画（`role-p1-move.webp`・`role-p2-look.webp`・`role-p3-action.webp`・`remote-screen.webp`）を書く。

`python compose.py a screen` は、README の「注力したこと」の図（`scripts/readme/showcase.py` → `focus-*.svg`）の中のスマホ画面に埋め込む、画面だけの録画（`layout-edit-screen.webp`）を書く。枠と文字はなく、最初のコマは以前の静止画と同じ見た目にしてある。背景は透明で、文字は色付きの札に載せる。

- 指の位置の円：スマホのページで記録した pointer イベントから重ねる（端末の「タップを表示」は録画に写らなかった）。
- PC のカーソルの輪：`cdet.py` が録画からカーソルの形を型合わせして位置を求める。
- 映像の加工はこの2つと、ランチャーの読み込み中の4倍速だけ。ランチャーのアカウント名は切り出しの範囲の外にある。
