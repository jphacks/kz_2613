# Re:Cooplay 画面一覧（PC・スマホ）

PCアプリの起動から、参加、ゲーム選択、操作の分担、協力プレイ、一時停止・緊急停止、終了まで、PCとスマホの画面を流れに沿って並べています。画像を押すと原寸で開きます。

[製品紹介](../README.md) ／ [ギャラリー](gallery.md) ／ [使い方](usage.md) ／ [フロントエンド仕様書](frontend-specification.md)

> **撮影について**
> - 2026年11月20日に、main（`37484a2`）の配布物のPCアプリを、開発PC（Windows 11）で通常どおり起動して撮影しました。試験用の設定（dry-run）は使っていません。PCの画面はPCアプリの最初の大きさ（1280×820）のウィンドウの中身です。
> - スマホは Android の実機（Android 16・Chrome、画面 384×701）です。PCアプリの「ホットスポットをONにする」で起動した Wi-Fi に接続して参加しました。USB は、画面の操作と撮影にだけ使っています。
> - 実機は1台なので、ほかの参加者は PC の Chrome で動かした模擬のスマホです。模擬のスマホの画面には「模擬」と書いています。PCの参加者カードの「機種：Android」も、P1 以外は模擬のスマホです。移動・視点・アクションの各担当は、担当を入れ替えて Android 実機で撮りました。
> - ゲームの一覧はこの PC で実際に見つかったゲームです。協力プレイは、PCアプリから起動した Minecraft Java Edition で行いました（撮影中、スマホからゲームへの操作は送っていません）。緊急停止は、実際のキー入力の Ctrl+Alt+F12 で行いました。
> - QRコード・URLの IP アドレスは説明用のアドレス（192.0.2.10）に、Wi-Fi の名前は「ReCooplay-Demo」に差し替えています。このQRを読み取っても接続できません。診断画面に出るスマホの IP アドレスも差し替えています。
> - iPhone の実機では撮影していません。

## 目次

1. [起動して参加する](#1-起動して参加する)
2. [ゲームを選ぶ](#2-ゲームを選ぶ)
3. [操作を分担する](#3-操作を分担する)
4. [ゲームを起動して始める](#4-ゲームを起動して始める)
5. [協力プレイ](#5-協力プレイ)
6. [一時停止・担当の入れ替え](#6-一時停止担当の入れ替え)
7. [緊急停止](#7-緊急停止)
8. [協力プレイ・ゲームの終了](#8-協力プレイゲームの終了)
9. [操作設定](#9-操作設定)
10. [接続が切れたとき・リセット・PCアプリの終了](#10-接続が切れたときリセットpcアプリの終了)
11. [補助の画面](#11-補助の画面)
12. [この資料に載せていない状態](#12-この資料に載せていない状態)

## 1. 起動して参加する

PCアプリを起動すると、PCホストを起動してから参加の画面を開きます。

<a href="screenshots/device/pc-00-startup.jpg"><img src="screenshots/device/pc-00-startup.jpg" width="640" alt="PCアプリの起動画面。ロゴと、PCホストを起動していますという表示"></a>

<sub>PC：起動中（PCアプリのウィンドウ全体）</sub>

ホットスポットが OFF のときは、①の場所に「ホットスポットをONにする」が出ます。押すと PC のモバイルホットスポットが ON になり、Wi-Fi 用のQR（①）と参加用のQR（②）が並びます。

| ホットスポットが OFF | ON にした後（0人） |
|:--:|:--:|
| <a href="screenshots/device/pc-01-join-hotspot-off.jpg"><img src="screenshots/device/pc-01-join-hotspot-off.jpg" width="440" alt="PCの参加画面。Wi-FiのQRの場所にホットスポットをONにするボタン"></a> | <a href="screenshots/device/pc-02-join-0.jpg"><img src="screenshots/device/pc-02-join-0.jpg" width="440" alt="PCの参加画面。Wi-Fiと参加のQRが2つ並ぶ"></a> |

最初に参加した人（P1）がホストになります。2〜4人で遊べるので、1人のうちは「OK」を押せません。

| PC：1人が参加 | PC：3人が参加 |
|:--:|:--:|
| <a href="screenshots/device/pc-03-join-1.jpg"><img src="screenshots/device/pc-03-join-1.jpg" width="440" alt="PCの参加画面。1人参加中で、あと1人待っている"></a> | <a href="screenshots/device/pc-04-join-3.jpg"><img src="screenshots/device/pc-04-join-3.jpg" width="440" alt="PCの参加画面。3人参加中で、OKを押せる"></a> |

ホストのスマホはPCを操作するリモコンになります。タッチパッドでPCのカーソルを動かし、左右のクリック・Esc・ホイールのボタンで操作します。ロビーでは「ホストを移譲」で、ほかの参加者にホストを譲れます。譲ると枠も入れ替わり、新しいホストが P1 になります。

| ホスト（1人） | ホスト（3人） | ホストを移譲 | 移譲の確認 |
|:--:|:--:|:--:|:--:|
| <a href="screenshots/device/phone-01-host-lobby-1.jpg"><img src="screenshots/device/phone-01-host-lobby-1.jpg" width="190" alt="ホストのスマホ。リモコンとタッチパッド"></a> | <a href="screenshots/device/phone-02-host-lobby-3.jpg"><img src="screenshots/device/phone-02-host-lobby-3.jpg" width="190" alt="ホストのスマホ。3人が接続し、ホストを移譲のボタンが出ている"></a> | <a href="screenshots/device/phone-03-transfer-menu.jpg"><img src="screenshots/device/phone-03-transfer-menu.jpg" width="190" alt="譲る相手を選ぶメニュー"></a> | <a href="screenshots/device/phone-04-transfer-confirm.jpg"><img src="screenshots/device/phone-04-transfer-confirm.jpg" width="190" alt="P2にホストを譲りますかという確認"></a> |

ホスト以外の参加者は、自分の担当を確認しながら待ちます。右上の「…」から、画面の色・持ち方の切り替えと「退出する（次の人に交代）」ができます。

| 参加者の待機 | 接続・診断（参加者） | 退出の確認 |
|:--:|:--:|:--:|
| <a href="screenshots/device/phone-05-wait.jpg"><img src="screenshots/device/phone-05-wait.jpg" width="190" alt="参加者のスマホ。接続完了と、ホストを待つ案内"></a> | <a href="screenshots/device/phone-06-menu-participant.jpg"><img src="screenshots/device/phone-06-menu-participant.jpg" width="190" alt="接続・診断のメニュー。画面の色、持ち方、退出する"></a> | <a href="screenshots/device/phone-07-leave-confirm.jpg"><img src="screenshots/device/phone-07-leave-confirm.jpg" width="190" alt="退出して次の人に交代しますかという確認"></a> |
| Android 実機が P2 のとき | | |

PCの「接続方法・URLを確認」「開けないとき」から、QR・URLと、つながらないときの手順を確認できます。

| 接続方法・URL | 参加ページが開けないとき |
|:--:|:--:|
| <a href="screenshots/device/pc-05-connection-help.jpg"><img src="screenshots/device/pc-05-connection-help.jpg" width="440" alt="スマホを接続するダイアログ。QR2つとURL"></a> | <a href="screenshots/device/pc-06-join-troubleshooting.jpg"><img src="screenshots/device/pc-06-join-troubleshooting.jpg" width="440" alt="参加ページが開けないときの手順"></a> |

## 2. ゲームを選ぶ

PCに入っているゲームを自動で見つけて並べます。この PC では、Minecraft（公式ランチャー）、Steam のゲーム、Xbox アプリの Minecraft、手動で登録したゲームの7件が見つかりました。操作が届くかまだ確かめていないゲームには「未検証」と出ます。選んだタイルの「▶」で分担へ進みます。

| ゲーム一覧 | Minecraft を選んだところ |
|:--:|:--:|
| <a href="screenshots/device/pc-07-game-list.jpg"><img src="screenshots/device/pc-07-game-list.jpg" width="440" alt="PCのゲーム一覧。Minecraft、Among Usなどのタイル"></a> | <a href="screenshots/device/pc-08-game-selected.jpg"><img src="screenshots/device/pc-08-game-selected.jpg" width="440" alt="Minecraftのタイルが選ばれ、右上に▶が出ている"></a> |

手動で登録したゲームを選ぶと、「名前を変更」「登録を解除」が出ます。

<a href="screenshots/device/pc-09-rename.jpg"><img src="screenshots/device/pc-09-rename.jpg" width="440" alt="手動登録したゲームの名前を変更するダイアログ"></a>

<sub>PC：手動登録のゲームの名前を変更</sub>

## 3. 操作を分担する

参加している人数に合わせて、ゲームの操作を分担します。各担当には実際にPCへ送るキーの名前を表示します。2人の列を順に押すと、担当を入れ替えられます。

| 分担の確認 | 入れ替える1人目を選んだところ |
|:--:|:--:|
| <a href="screenshots/device/pc-10-roles.jpg"><img src="screenshots/device/pc-10-roles.jpg" width="440" alt="PCの分担画面。プレイヤー1がキー、2がマウス移動、3がクリック・キー・ホイール"></a> | <a href="screenshots/device/pc-11-swap-pick.jpg"><img src="screenshots/device/pc-11-swap-pick.jpg" width="440" alt="プレイヤー1が選ばれ、入れ替える相手を選ぶ案内が出ている"></a> |

「この分担で決定」を押すと、「ゲームを起動する」に変わります。4人のときは、担当がさらに細かく分かれます。

| 分担を決定した後 | 4人のとき |
|:--:|:--:|
| <a href="screenshots/device/pc-12-roles-confirmed.jpg"><img src="screenshots/device/pc-12-roles-confirmed.jpg" width="440" alt="分担決定の画面。ゲームを起動するボタン"></a> | <a href="screenshots/device/pc-13-roles-four.jpg"><img src="screenshots/device/pc-13-roles-four.jpg" width="440" alt="4人で操作を分担する画面"></a> |

「未検証」のゲーム（例：Among Us）を選ぶと、見出しの右に注意のマークが出ます。Re:Cooplay 独自の AI の分担があるゲームでは、「定型ルール」「独自AI」から分担の作り方を選べます。

| 未検証のゲームの分担 | 注意のマークを押したところ |
|:--:|:--:|
| <a href="screenshots/device/pc-14-roles-unverified.jpg"><img src="screenshots/device/pc-14-roles-unverified.jpg" width="440" alt="Among Usの分担画面。注意のマークと、分担の作り方の切り替え"></a> | <a href="screenshots/device/pc-15-profile-notice.jpg"><img src="screenshots/device/pc-15-profile-notice.jpg" width="440" alt="ゲームの操作定義についてのダイアログ。未検証の注意"></a> |

## 4. ゲームを起動して始める

「ゲームを起動する」を押すと、PCアプリがゲームを起動します。Minecraft の場合は公式ランチャーが開くので、ホストのスマホのリモコンでランチャーの「プレイ」を押します。

| PC：起動中 | ホスト：起動中 |
|:--:|:--:|
| <a href="screenshots/device/pc-16-launching.jpg"><img src="screenshots/device/pc-16-launching.jpg" width="440" alt="PCの分担画面。起動中のボタンと、ランチャーでプレイを押す案内"></a> | <a href="screenshots/device/phone-08-host-launching.jpg"><img src="screenshots/device/phone-08-host-launching.jpg" width="190" alt="ホストのスマホ。分担操作開始はまだ押せない"></a> |

ゲームのウィンドウが開くと、ホストのスマホの「分担操作開始」を押せるようになります。押せるのはホストだけです。押すと、ゲームが背面にあっても前面に切り替えてから始めます。

| PC：起動した後 | ホスト：開始できる | 参加者（模擬） |
|:--:|:--:|:--:|
| <a href="screenshots/device/pc-17-launched.jpg"><img src="screenshots/device/pc-17-launched.jpg" width="440" alt="PCの分担画面。ホストのスマホで開始という表示"></a> | <a href="screenshots/device/phone-09-host-start-ready.jpg"><img src="screenshots/device/phone-09-host-start-ready.jpg" width="190" alt="ホストのスマホ。分担操作開始を押せる"></a> | <a href="screenshots/device/phone-10-wait-launched-sim.jpg"><img src="screenshots/device/phone-10-wait-launched-sim.jpg" width="190" alt="参加者のスマホ。ホストの開始を待つ案内"></a> |

## 5. 協力プレイ

「分担操作開始」を押すと、各自のスマホが担当の操作画面に変わり、みんなで1つのキャラクターを動かします。操作画面はゲームごとの操作の定義と分担から作ります。ゲームが前面にあるあいだだけ、担当の操作をPCへ送ります。

| PC：協力プレイ中 | ゲームの画面（Minecraft） |
|:--:|:--:|
| <a href="screenshots/device/pc-18-coop.jpg"><img src="screenshots/device/pc-18-coop.jpg" width="440" alt="PCの協力プレイ中の画面。みんなでプレイ中"></a> | <a href="screenshots/device/game-01-coop-minecraft.jpg"><img src="screenshots/device/game-01-coop-minecraft.jpg" width="400" alt="協力プレイ中のMinecraftのウィンドウ"></a> |

スマホの操作画面（いずれも Android 実機、初期配置）です。上の帯の一時停止のボタンはホストだけに出ます。鉛筆のボタンは配置の編集、「…」は接続・診断です。

| 移動 | 視点 | アクション |
|:--:|:--:|:--:|
| <a href="screenshots/device/phone-11-coop-move.jpg"><img src="screenshots/device/phone-11-coop-move.jpg" width="220" alt="移動の担当。Space・Shift・Ctrlのボタンと、WASDのスティック"></a> | <a href="screenshots/device/phone-12-coop-look.jpg"><img src="screenshots/device/phone-12-coop-look.jpg" width="220" alt="視点の担当。ドラッグでマウスを動かすパッドと感度"></a> | <a href="screenshots/device/phone-13-coop-action.jpg"><img src="screenshots/device/phone-13-coop-action.jpg" width="220" alt="アクションの担当。左右クリック・E・Q・ホイールのボタン"></a> |
| スティックで WASD、ボタンでジャンプ・スニーク・ダッシュ | 画面をドラッグして視点（マウス）を動かします | クリックで攻撃・使う、ホイールで持ち物の切り替え |

画面の色は枠ごとに決まり、P1 は青、P2 は緑、P3 は紫、P4 は赤です。上の3枚は P1 の色です。P2〜P4 の色の待機画面と操作画面も、Android 実機をその枠に入れて撮りました（ホストの移譲と、退出して入り直すことで枠を変え、担当は入れ替えで回しています）。P4 は、P3 が退出した3人（P1・P2・P4）で遊んだときの画面です。

| 枠 | 待機 | 移動 | 視点 | アクション |
|:--:|:--:|:--:|:--:|:--:|
| P2 | <a href="screenshots/device/phone-30-p2-wait.jpg"><img src="screenshots/device/phone-30-p2-wait.jpg" width="150" alt="P2の待機画面。緑の色"></a> | <a href="screenshots/device/phone-31-p2-move.jpg"><img src="screenshots/device/phone-31-p2-move.jpg" width="150" alt="P2の色の移動の担当"></a> | <a href="screenshots/device/phone-32-p2-look.jpg"><img src="screenshots/device/phone-32-p2-look.jpg" width="150" alt="P2の色の視点の担当"></a> | <a href="screenshots/device/phone-33-p2-action.jpg"><img src="screenshots/device/phone-33-p2-action.jpg" width="150" alt="P2の色のアクションの担当"></a> |
| P3 | <a href="screenshots/device/phone-34-p3-wait.jpg"><img src="screenshots/device/phone-34-p3-wait.jpg" width="150" alt="P3の待機画面。紫の色"></a> | <a href="screenshots/device/phone-35-p3-move.jpg"><img src="screenshots/device/phone-35-p3-move.jpg" width="150" alt="P3の色の移動の担当"></a> | <a href="screenshots/device/phone-36-p3-look.jpg"><img src="screenshots/device/phone-36-p3-look.jpg" width="150" alt="P3の色の視点の担当"></a> | <a href="screenshots/device/phone-37-p3-action.jpg"><img src="screenshots/device/phone-37-p3-action.jpg" width="150" alt="P3の色のアクションの担当"></a> |
| P4 | <a href="screenshots/device/phone-38-p4-wait.jpg"><img src="screenshots/device/phone-38-p4-wait.jpg" width="150" alt="P4の待機画面。赤の色"></a> | <a href="screenshots/device/phone-39-p4-move.jpg"><img src="screenshots/device/phone-39-p4-move.jpg" width="150" alt="P4の色の移動の担当"></a> | <a href="screenshots/device/phone-40-p4-look.jpg"><img src="screenshots/device/phone-40-p4-look.jpg" width="150" alt="P4の色の視点の担当"></a> | <a href="screenshots/device/phone-41-p4-action.jpg"><img src="screenshots/device/phone-41-p4-action.jpg" width="150" alt="P4の色のアクションの担当"></a> |

<sub>待機画面の下の文は、そのときの状況で変わります。P2 は分担を決めた後、P3・P4 は協力プレイを一度終えた後（Wi-Fi を戻す案内）の表示です。</sub>

鉛筆のボタンを押すと、ボタンの位置と大きさを自分用に変えられます。編集中の操作はゲームに送りません。部品を押すと選ばれ、長押しで操作の付け替え・複製・外すを選べます。「…」から初期配置に戻せます。

| 編集（初期配置に戻した直後） | 部品を選んだところ | 長押しのメニュー |
|:--:|:--:|:--:|
| <a href="screenshots/device/phone-14-layout-editor.jpg"><img src="screenshots/device/phone-14-layout-editor.jpg" width="190" alt="配置の編集。上に破棄・元に戻す・保存の帯"></a> | <a href="screenshots/device/phone-15-layout-selected.jpg"><img src="screenshots/device/phone-15-layout-selected.jpg" width="190" alt="Spaceキーの部品が選ばれ、8つのつまみが出ている"></a> | <a href="screenshots/device/phone-16-layout-menu.jpg"><img src="screenshots/device/phone-16-layout-menu.jpg" width="190" alt="操作の付け替え・複製・画面から外す・閉じるのメニュー"></a> |

編集の操作を通して録画したものです（Android 実機。指の位置の円は録画後に重ねています）。つまみで縦横を変え、ほかのボタンに重ねると置ける場所を点線の枠で示し、指を離すとそこに収まります。

<div align="center">
<picture>
  <source media="(max-width: 700px)" srcset="../assets/readme/recordings/layout-edit-narrow.webp" width="324">
  <img src="../assets/readme/recordings/layout-edit-wide.webp" width="640" alt="実画面の録画。配置の編集で、Spaceキーのつまみを引いて縦と横を縮め、Ctrlキーを重ねると置ける場所が点線の枠で示され、指を離すとそこに収まる。空いた所へShiftキーを広げて保存する">
</picture>
</div>

操作設定で「ゲーム画面の右上に、担当と操作中のキーを重ねて表示する」を ON にすると、PCアプリが透明なウィンドウで担当を重ねて表示します（初期は OFF）。

<a href="screenshots/device/pc-34-desktop-overlay.png"><img src="screenshots/device/pc-34-desktop-overlay.png" width="200" alt="プレイヤーごとの担当を縦に並べた、重ねる表示"></a>

<sub>PC：重ねる表示のウィンドウの中身</sub>

## 6. 一時停止・担当の入れ替え

ホストのスマホの一時停止のボタンを押すと、全員の操作が止まり、押していたキーもすべて離します。ホストのスマホはリモコンに戻り、「再開する」で協力プレイに戻ります。

| PC：一時停止中 | ホスト | 参加者（模擬） |
|:--:|:--:|:--:|
| <a href="screenshots/device/pc-19-paused.jpg"><img src="screenshots/device/pc-19-paused.jpg" width="440" alt="PCの一時停止中の画面"></a> | <a href="screenshots/device/phone-17-host-paused.jpg"><img src="screenshots/device/phone-17-host-paused.jpg" width="190" alt="ホストのスマホ。再開する・協力プレイを終了のボタン"></a> | <a href="screenshots/device/phone-18-wait-paused-sim.jpg"><img src="screenshots/device/phone-18-wait-paused-sim.jpg" width="190" alt="参加者のスマホ。一時停止中の表示"></a> |

一時停止中はPCの「担当を入れ替える」で担当を入れ替えられます。入れ替えた人のスマホには新しい担当が表示され、全員が確認するまで再開できません。

| PC：入れ替えの画面 | PC：スマホの確認待ち | スマホ：新しい担当の通知 |
|:--:|:--:|:--:|
| <a href="screenshots/device/pc-20-swap-mode.jpg"><img src="screenshots/device/pc-20-swap-mode.jpg" width="400" alt="一時停止中の分担画面。入れ替えを終えるボタン"></a> | <a href="screenshots/device/pc-21-swap-ack.jpg"><img src="screenshots/device/pc-21-swap-ack.jpg" width="400" alt="入れ替えた2人の列にスマホで確認待ちの表示"></a> | <a href="screenshots/device/phone-20-role-notice.jpg"><img src="screenshots/device/phone-20-role-notice.jpg" width="190" alt="ホストが担当を入れ替えましたという通知と、確認のボタン"></a> |

右上の「…」の接続・診断では、通信の往復時間や経路を確認できます。協力プレイ中でなければ「通信テスト」も行えます。

<a href="screenshots/device/phone-19-menu-host.jpg"><img src="screenshots/device/phone-19-menu-host.jpg" width="220" alt="ホストの接続・診断。RTT、送信数、経路WebRTC＋WS、通信テスト"></a>

<sub>スマホ：接続・診断（一時停止中のホスト）</sub>

## 7. 緊急停止

PCのキーボードで Ctrl+Alt+F12 を押すと、すぐに入力を止めて一時停止します。PCの前の人が安全を確かめて「入力を再開する」を押すまで、スマホからは再開できません。

| PC：緊急停止の後 | ホスト | 参加者（模擬） |
|:--:|:--:|:--:|
| <a href="screenshots/device/pc-22-emergency.jpg"><img src="screenshots/device/pc-22-emergency.jpg" width="440" alt="PCの一時停止画面。入力を再開するボタンと緊急停止の注意"></a> | <a href="screenshots/device/phone-21-host-emergency.jpg"><img src="screenshots/device/phone-21-host-emergency.jpg" width="190" alt="ホストのスマホ。再開するが押せない"></a> | <a href="screenshots/device/phone-22-wait-emergency-sim.jpg"><img src="screenshots/device/phone-22-wait-emergency-sim.jpg" width="190" alt="参加者のスマホ。一時停止中の表示"></a> |

## 8. 協力プレイ・ゲームの終了

一時停止中にホストのスマホで「協力プレイを終了（分担に戻る）」を押すと、分担の画面に戻ります。参加者のスマホには、遊び終えたら Wi-Fi を普段のネットワークに戻す案内が出ます。

| 終了の確認 | PC：終了した後 | 参加者（模擬） |
|:--:|:--:|:--:|
| <a href="screenshots/device/phone-23-end-confirm.jpg"><img src="screenshots/device/phone-23-end-confirm.jpg" width="190" alt="協力プレイを終了して分担の画面に戻りますかという確認"></a> | <a href="screenshots/device/pc-23-after-end.jpg"><img src="screenshots/device/pc-23-after-end.jpg" width="440" alt="PCの分担画面に戻ったところ"></a> | <a href="screenshots/device/phone-24-after-end-sim.jpg"><img src="screenshots/device/phone-24-after-end-sim.jpg" width="190" alt="参加者のスマホ。Wi-Fiを戻す案内"></a> |

PCの「ゲームを終了する」では、ゲームに閉じる操作を送ります（強制終了はしません）。終了するとゲーム選択の画面に戻ります。

| ゲーム終了の確認 | 終了した後 |
|:--:|:--:|
| <a href="screenshots/device/pc-24-quit-confirm.jpg"><img src="screenshots/device/pc-24-quit-confirm.jpg" width="440" alt="Minecraftを終了しますかという確認"></a> | <a href="screenshots/device/pc-25-after-quit.jpg"><img src="screenshots/device/pc-25-after-quit.jpg" width="440" alt="ゲーム選択の画面に戻り、Minecraftを終了しましたと表示"></a> |

## 9. 操作設定

PC画面の右下の「操作設定」から、担当と実際に送るキーの確認・変更、通信の設定、時間による担当の交代、観客向け表示、通信の診断などを開けます。

| 操作設定 | 担当と送るキー |
|:--:|:--:|
| <a href="screenshots/device/pc-26-settings.jpg"><img src="screenshots/device/pc-26-settings.jpg" width="440" alt="操作設定のダイアログ。項目の一覧"></a> | <a href="screenshots/device/pc-27-settings-keys.jpg"><img src="screenshots/device/pc-27-settings-keys.jpg" width="440" alt="担当ごとの送るキーと、キー割当を変える欄"></a> |

| 通信の設定・遊び方・観客向け表示 | 重ねる表示を ON にしたところ（一時停止中） |
|:--:|:--:|
| <a href="screenshots/device/pc-28-settings-more.jpg"><img src="screenshots/device/pc-28-settings-more.jpg" width="440" alt="自動再開、時間で担当を交代、観客向け表示の設定"></a> | <a href="screenshots/device/pc-29-settings-overlay.jpg"><img src="screenshots/device/pc-29-settings-overlay.jpg" width="440" alt="重ねて表示する設定がONになった操作設定"></a> |

## 10. 接続が切れたとき・リセット・PCアプリの終了

スマホとPCの通信が3秒以上切れると、スマホに案内が出ます。通信が戻ると自動で消えます。ロビーでホストの通信が切れると、PCには分担の確認を求める注意が出ます。スマホを横向きにすると、操作を止めて縦に戻すよう案内します。

| スマホ：通信が切れたとき | PC：ホストの通信が切れたとき | スマホ：横向き |
|:--:|:--:|:--:|
| <a href="screenshots/device/phone-25-offline.jpg"><img src="screenshots/device/phone-25-offline.jpg" width="190" alt="PCのアプリとつながっていませんという案内"></a> | <a href="screenshots/device/pc-30-host-lost.jpg"><img src="screenshots/device/pc-30-host-lost.jpg" width="440" alt="P1が切断したため分担を確認してくださいという注意"></a> | <a href="screenshots/device/phone-26-landscape.jpg"><img src="screenshots/device/phone-26-landscape.jpg" width="300" alt="スマホを縦にしてくださいという案内"></a> |

4人がそろっているときに5人目が開くと、満員の案内が出ます。

<a href="screenshots/device/phone-27-full-sim.jpg"><img src="screenshots/device/phone-27-full-sim.jpg" width="190" alt="部屋が満員ですという案内"></a>

<sub>スマホ（模擬）：満員</sub>

操作設定の「接続中のスマホをすべてリセット」では、全員の接続を切り、Wi-Fi の名前とパスワードを新しくします。スマホは新しい Wi-Fi につないでページを再読み込みすると参加し直せます。リセットの後は分担の画面の「新たな参加者を受け付ける」から参加用のQRを出せます。

| リセットの確認 | スマホ：リセットの後 | PC：リセットの後 | 新たな参加者を受け付ける |
|:--:|:--:|:--:|:--:|
| <a href="screenshots/device/pc-31-reset-confirm.jpg"><img src="screenshots/device/pc-31-reset-confirm.jpg" width="300" alt="接続中のスマホをすべてリセットしますかという確認"></a> | <a href="screenshots/device/phone-28-reset.jpg"><img src="screenshots/device/phone-28-reset.jpg" width="150" alt="PCでリセットされましたという案内"></a> | <a href="screenshots/device/pc-32-after-reset.jpg"><img src="screenshots/device/pc-32-after-reset.jpg" width="300" alt="リセット後の分担画面。参加者を待っています"></a> | <a href="screenshots/device/pc-33-recruit.jpg"><img src="screenshots/device/pc-33-recruit.jpg" width="300" alt="スマホを接続するダイアログ。新しいQR"></a> |

ロビーでホスト以外の人が「退出する（次の人に交代）」を選ぶと、枠が空き、スマホには退出の案内が出ます。

<a href="screenshots/device/phone-42-left.jpg"><img src="screenshots/device/phone-42-left.jpg" width="190" alt="退出しましたという案内"></a>

<sub>スマホ：退出した後</sub>

PCアプリを閉じると、スマホには終了の案内が出ます。PCアプリが ON にしたホットスポットは OFF に戻ります。

<a href="screenshots/device/phone-29-app-closed.jpg"><img src="screenshots/device/phone-29-app-closed.jpg" width="190" alt="PCのアプリが終了しましたという案内"></a>

<sub>スマホ：PCアプリの終了</sub>

## 11. 補助の画面

PCだけで開ける画面です。観客向け表示は OBS などのブラウザソースに追加して、担当と操作を配信・録画に重ねます。診断画面と疑似ゲーム画面は、通信と入力の確認に使います。

| 観客向け表示（`/overlay`） | 診断画面（`/host`） | 疑似ゲーム画面（`/game`） |
|:--:|:--:|:--:|
| <a href="screenshots/device/aux-01-overlay-obs.jpg"><img src="screenshots/device/aux-01-overlay-obs.jpg" width="300" alt="観客向け表示。下に担当のカードが3枚並ぶ"></a> | <a href="screenshots/device/aux-02-diagnostics.jpg"><img src="screenshots/device/aux-02-diagnostics.jpg" width="300" alt="通信テストの画面。QR、進行、端末ごとの統計、ログ"></a> | <a href="screenshots/device/aux-03-pseudo-game.jpg"><img src="screenshots/device/aux-03-pseudo-game.jpg" width="300" alt="疑似ゲーム画面。キーとマウスの受信の表示"></a> |

## 12. この資料に載せていない状態

画面のコード（`apps/web/src/` と `apps/desktop/ui/`）から洗い出した状態のうち、次は今回撮っていません。

- 実機・環境が必要なもの：iPhone の実機、ホットスポットの準備中の表示（ON にしてから数秒で消えたため）、Windows のファイル選択（ゲームの手動登録）。
- 設定や条件が必要なもの：切断から自動で再開する設定が ON のときの待機、時間による担当の交代の予告と案内、協力プレイ中にゲームが前面から外れたときの警告、ゲームの起動の失敗、通信の版の不一致・参加情報の確認の失敗の案内、「指を離して操作を再開」の案内、キー割当の保存の失敗、緊急停止キーを登録できないとき。
- 途中の段階や見た目の切り替え：画面の色（ダーク・ポップ）、横持ちの操作画面、画面が切り替わるときの演出、仮想カーソルでPCアプリを操作しているところ。

---

<sub>この資料の画像はPCアプリ（WebView2）・Android の Chrome・模擬スマホの画面をデバッグ接続で撮影したものです。PC上のシミュレーション（dry-run）で撮り直すときは、`node scripts/sim/capture-screens.mjs --bin apps/host-rs/target/release/recooplay-host.exe` を使います（画像は `docs/screenshots/` に保存され、この資料の画像は置き換わりません）。どちらの撮影も実機・ゲームでの動作確認や互換性を示すものではありません。</sub>
