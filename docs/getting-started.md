# Re:Cooplayの導入・接続

Windows PCでアプリを起動し、同じネットワークにつないだスマートフォンから参加します。

[使い方](usage.md) ／ [困ったとき](troubleshooting.md) ／ [動作確認](verification.md)

## 必要なもの

| 項目 | 条件 |
|:--|:--|
| PC | Windows 11 x64 |
| ランタイム | WebView2、Microsoft Visual C++ v14 Redistributable（x64） |
| スマートフォン | 2〜4台。Android Chrome・iPhone Safariでの実プレイ記録あり |
| ネットワーク | 同じローカルWi-Fi、またはWindowsのモバイルホットスポット |
| ゲーム | PCにインストールしたキーボード・マウス操作のゲーム |

ゲーム映像はPCに表示します。スマホへの専用アプリのインストールは不要です。ゲームごとの条件は[確認範囲](verification.md)を参照してください。

## 入手

2026-10-26時点で、[GitHub Releases](https://github.com/jphacks/kz_2613/releases)に一般向けの配布版は公開されていません。ソースからビルドする場合は[Windows構築手順](develop/handoff/SETUP_WINDOWS.md)、zipを作る場合は[配布手順](../apps/desktop/README.md)を利用できます。CI成果物は開発・検証用で、一般向けReleaseとは別です。

## 展開・起動

1. 配布zipを用意した場合は、Documentsなど書き込みできる場所へすべて展開します。
2. `recooplay-desktop.exe`を起動します。ホスト、静的画面、操作定義は同梱の配置を保ちます。
3. PCに参加画面が表示されることを確認します。

DLL不足の案内が出た場合は、[Microsoft公式のVisual C++ランタイム案内](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)でx64版を確認します。ビルドに使ったMSVCと同じか新しい版が必要です。アプリはランタイムを自動インストールしません。

## ネットワークとQR参加

1. PCとスマホを同じWi-Fiに接続します。モバイルホットスポットを使う場合はPCで有効にしてスマホを接続します。
2. Wi-Fi参加QRとアプリ参加QRを区別し、先にネットワークへ接続します。
3. 各スマホのカメラでアプリ参加QRを読み取ります。開けない場合は、表示された参加URLをブラウザで開きます。

接続できない場合は信頼するローカルネットワークへのファイアウォール許可を確認します。同梱の`allow-firewall.ps1`は配布物のREADMEに従って使用します。ファイアウォール全体を無効化する必要はありません。

## 接続を確認

最初のスマホがP1・ホストになり、後の端末へ参加枠が割り当てられます。PCとスマホの表示を確認して[ゲーム選択と開始](usage.md)へ進みます。プレイ中はスマホをロックせず、操作画面を開いたままにします。
