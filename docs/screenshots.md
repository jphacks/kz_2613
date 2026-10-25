# Re:Cooplay 画面一覧（PC・スマホ）

参加からゲーム選択、操作分担、協力プレイ、一時停止・緊急停止まで、最新のPC画面とスマホ画面を流れに沿って並べています。画像を押すと原寸で開きます。

[製品紹介](../README.md) ／ [ギャラリー](gallery.md) ／ [使い方](usage.md) ／ [フロントエンド仕様書](frontend-specification.md)

> **撮影について**
> - 2026年10月26日に、最新のRustホストと画面（`apps/web-static`）を使って撮影しました。PCは1920×1080、スマホは402×874（2倍の解像度）です。
> - ホストを試験用の設定（dry-run）で動かして撮影しました。PCへのキー入力やゲームの操作は行っていません。そのため、ゲームのウィンドウは疑似のもので、ゲーム一覧（Minecraft・Gamma・Stardew Valley）も試験用のデータです。
> - QRコード・URLのIPアドレスは説明用のアドレス（192.0.2.10）に、Wi-Fiの名前は「ReCooplay-Demo」に差し替えています。このQRを読み取っても接続できません。
> - 3人で遊ぶ例です（P1がiPhone、P2がAndroid、P3がiPhone）。2〜4人で遊べるので、4人目の枠は「参加待ち」と表示されています。

## 目次

1. [参加する](#1-参加する)
2. [ゲームを選ぶ](#2-ゲームを選ぶ)
3. [操作を分担する](#3-操作を分担する)
4. [準備してReady](#4-準備してready)
5. [協力プレイ](#5-協力プレイ)
6. [一時停止](#6-一時停止)
7. [設定・接続・診断](#7-設定接続診断)
8. [緊急停止](#8-緊急停止)

## 1. 参加する

PCアプリを起動すると、参加用のQRコードが表示されます。①でPCのホットスポット（Wi-Fi）につなぎ、②で参加します。最初に参加した人（P1）がホストになります。

<a href="screenshots/pc-01-join-waiting.jpg"><img src="screenshots/pc-01-join-waiting.jpg" width="960" alt="PCの参加画面。まだ誰も参加していない"></a>

<sub>PC：参加を待っている画面</sub>

<a href="screenshots/pc-02-join-ready.jpg"><img src="screenshots/pc-02-join-ready.jpg" width="960" alt="PCの参加画面。3人が接続し、機種と担当が表示されている"></a>

<sub>PC：3人が参加した画面。プレイヤーごとの色・担当・機種が並びます</sub>

| P1（ホスト） | P2 | P3 |
|:--:|:--:|:--:|
| <a href="screenshots/phone-p1-01-host-lobby.jpg"><img src="screenshots/phone-p1-01-host-lobby.jpg" width="240" alt="P1のスマホ。PCを操作するリモコンとタッチパッド"></a> | <a href="screenshots/phone-p2-01-waiting.jpg"><img src="screenshots/phone-p2-01-waiting.jpg" width="240" alt="P2のスマホ。接続完了と担当の表示"></a> | <a href="screenshots/phone-p3-01-waiting.jpg"><img src="screenshots/phone-p3-01-waiting.jpg" width="240" alt="P3のスマホ。接続完了と担当の表示"></a> |
| ホストのスマホはPC画面のリモコンになります（矢印・Enter・タッチパッド） | 自分の担当を確認して、ホストの開始を待ちます | 同じく担当を確認して待ちます |

## 2. ゲームを選ぶ

ホストがスマホのリモコンで、PCに入っているゲームの一覧から遊ぶゲームを選びます。Steam・Epic Gamesのゲームを自動で見つけ、Minecraftは公式ランチャーから起動できます。操作が届くかまだ確かめていないゲームには「未検証」と表示します。

<a href="screenshots/pc-03-game-select.jpg"><img src="screenshots/pc-03-game-select.jpg" width="960" alt="PCのゲーム選択画面。Minecraft・Gamma・Stardew Valleyのタイル"></a>

<sub>PC：ゲーム選択（一覧は試験用のデータです）</sub>

## 3. 操作を分担する

選んだゲームの操作を、参加している人数に合わせて分担します。各担当には、実際にPCへ送るキーの名前を表示します。一時停止中は、2人の列を順に押して担当を入れ替えることもできます。

<a href="screenshots/pc-04-roles.jpg"><img src="screenshots/pc-04-roles.jpg" width="960" alt="PCの分担画面。プレイヤー1がキー、2がマウス移動、3がクリック・キー・ホイール"></a>

<sub>PC：分担の確認</sub>

<a href="screenshots/pc-05-roles-confirmed.jpg"><img src="screenshots/pc-05-roles-confirmed.jpg" width="960" alt="PCの分担画面。3人で決定し、ゲームを起動するボタンが出ている"></a>

<sub>PC：分担を決定した後。「ゲームを起動する」で起動できます</sub>

## 4. 準備してReady

ゲームを起動し、プレイしたい画面まで進めたら、ホストがスマホで「Ready」を押します。Readyを押せるのはホストだけです。

<a href="screenshots/pc-06-ready.jpg"><img src="screenshots/pc-06-ready.jpg" width="960" alt="PCの準備完了画面。ホストのスマホでReadyを押すよう案内している"></a>

<sub>PC：全員が接続し、準備ができた画面</sub>

| P1（ホスト） | P2 |
|:--:|:--:|
| <a href="screenshots/phone-p1-02-host-ready.jpg"><img src="screenshots/phone-p1-02-host-ready.jpg" width="240" alt="P1のスマホ。Readyのボタン"></a> | <a href="screenshots/phone-p2-02-preparing.jpg"><img src="screenshots/phone-p2-02-preparing.jpg" width="240" alt="P2のスマホ。ホストの開始を待っている"></a> |
| 「Ready・3人で操作を始める」を押すと協力プレイが始まります | ホストのReadyを待ちます |

## 5. 協力プレイ

Readyの後は、各自のスマホが担当の操作画面に切り替わり、3人で1つのキャラクターを動かします。操作画面は、ゲームごとの操作定義と分担から自動で作ります。

<a href="screenshots/pc-07-coop.jpg"><img src="screenshots/pc-07-coop.jpg" width="960" alt="PCの協力プレイ中の画面"></a>

<sub>PC：協力プレイ中。実際に遊ぶときは、この上にゲームの画面が前面に出ます</sub>

| P1：移動 | P2：視点 | P3：アクション |
|:--:|:--:|:--:|
| <a href="screenshots/phone-p1-03-coop-move.jpg"><img src="screenshots/phone-p1-03-coop-move.jpg" width="240" alt="P1のスマホ。WASDのスティックとSpace・Shift・Qのボタン"></a> | <a href="screenshots/phone-p2-03-coop-look.jpg"><img src="screenshots/phone-p2-03-coop-look.jpg" width="240" alt="P2のスマホ。ドラッグでマウスを動かすパッドと感度"></a> | <a href="screenshots/phone-p3-02-coop-action.jpg"><img src="screenshots/phone-p3-02-coop-action.jpg" width="240" alt="P3のスマホ。左右クリック・E・R・ホイールのボタン"></a> |
| スティックでWASD、ボタンでジャンプ・しゃがみなど | 画面をドラッグして視点（マウス）を動かします | クリックで攻撃・アイテムの使用、ホイールで持ち替え |

## 6. 一時停止

ホストのスマホで一時停止すると、全員の操作が止まり、押していたキーもすべて離します。ホストのスマホはPCを操作するリモコンに戻ります。

<a href="screenshots/pc-08-paused.jpg"><img src="screenshots/pc-08-paused.jpg" width="960" alt="PCの一時停止中の画面"></a>

<sub>PC：一時停止中</sub>

| P1（ホスト） | P2 |
|:--:|:--:|
| <a href="screenshots/phone-p1-04-host-paused.jpg"><img src="screenshots/phone-p1-04-host-paused.jpg" width="240" alt="P1のスマホ。再開とロビーに戻るボタン"></a> | <a href="screenshots/phone-p2-04-paused.jpg"><img src="screenshots/phone-p2-04-paused.jpg" width="240" alt="P2のスマホ。一時停止中の表示"></a> |
| 「再開する」で協力プレイに戻ります | 再開を待ちます |

## 7. 設定・接続・診断

<a href="screenshots/pc-09-settings.jpg"><img src="screenshots/pc-09-settings.jpg" width="960" alt="PCの操作設定。担当と実際に送るキーの一覧"></a>

<sub>PC：操作設定。担当ごとに実際に送るキーを確認できます</sub>

<a href="screenshots/pc-10-connection-help.jpg"><img src="screenshots/pc-10-connection-help.jpg" width="960" alt="PCの接続方法の画面。QRコードとURL"></a>

<sub>PC：接続方法・URLの確認（IPアドレスは説明用のものです）</sub>

| スマホの接続・診断 |
|:--:|
| <a href="screenshots/phone-p2-05-diagnostics.jpg"><img src="screenshots/phone-p2-05-diagnostics.jpg" width="240" alt="スマホの接続・診断。往復時間・経路・通信テスト"></a> |
| 右上の「…」から、通信の往復時間や経路（WebRTC＋WebSocket）を確認できます |

## 8. 緊急停止

PCのキーボードで Ctrl+Alt+F12 を押すと、すぐに入力を止めて一時停止します。PCの前の人が安全を確かめて「入力を再開する」を押すまで、再開できません。

<a href="screenshots/pc-11-emergency-stop.jpg"><img src="screenshots/pc-11-emergency-stop.jpg" width="960" alt="PCの緊急停止後の画面。入力を再開するボタンと注意の表示"></a>

<sub>PC：緊急停止の後</sub>

| P1（ホスト） |
|:--:|
| <a href="screenshots/phone-p1-05-emergency-stop.jpg"><img src="screenshots/phone-p1-05-emergency-stop.jpg" width="240" alt="P1のスマホ。入力が止まっているという案内"></a> |
| PCで入力を再開するまで「再開する」は押せません |

---

<sub>撮影し直すときは、ホストをビルドしてから `node scripts/sim/capture-screens.mjs --bin apps/host-rs/target/release/recooplay-host.exe` を実行します（Chrome または Edge を使います）。画像は `docs/screenshots/` に保存されます。この撮影はPC上のシミュレーションで、実機での動作確認やゲームとの互換性を示すものではありません。</sub>
