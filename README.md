# Re:Cooplay（リコープレイ）— ゲームはそのまま。操作はみんなで。

<div align="center">
  <br>

  <a href="https://youtu.be/a8uhU2ymsuQ">
    <img src="assets/images/recooplay-thumbnail.png" alt="Re:Cooplay 製品紹介動画（クリックしてYouTubeで再生）" width="960">
  </a>

  <p>🎬 <strong>画像をクリックしてプロダクト紹介動画を再生</strong>（Terrariaでの共同操作も紹介）</p>

  <p>
    <a href="https://youtu.be/a8uhU2ymsuQ">
      <img src="https://img.shields.io/badge/▶%20YouTube-紹介動画を見る-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="▶ YouTubeで紹介動画を見る">
    </a>
  </p>

  ---

  <details>
    <summary>🎮 <strong>プレイ風景を見る</strong>（クリックで開く）</summary>

  <p>移動・視点・攻撃を3人で分担し、1つのキャラクターを共同操作したHack Day中の実プレイ風景です。</p>

https://github.com/user-attachments/assets/60d577f4-e287-45bc-bc6a-09455dd017c3

  </details>

  ---

  [![JPHACKS 2026](https://img.shields.io/badge/JPHACKS%202026-Hack%20Day%20Audience%20Award-gold?style=for-the-badge&logo=trophy)](https://github.com/jphacks/kz_2613)

  <p>🏆 <strong>JPHACKS 2026 金沢会場 Hack Day Audience Award 受賞</strong></p>
</div>

---

Re:Cooplayは、**既存のPCゲームに新しい協力プレイを後付けするシステム**です。

友達と集まって、普段は1人で操作するキャラクターを**2〜4人で役割分担して共同操作**。ゲーム本体を改造することなく、各自のスマートフォンから、いつものゲームに新しい遊び方を加えられます。

**ゲームも人数も、固定しない。** ゲームごとの操作と参加人数に合わせて、役割分担とコントローラーを生成します。

---

## 製品概要

### 背景(製品開発のきっかけ、課題等）

1人で遊ぶなら1人で操作する。複数人で遊ぶなら、それぞれが自分のキャラクターを操作するマルチプレイを選ぶ。それが一般的なゲームの楽しみ方です。

でも、**1つのキャラクターを動かすことそのものを、みんなで分担しても面白いのではないか。**

移動する人と視点を動かす人が違えば、思った方向へ進むにも声を掛け合う必要があります。失敗して笑うことも、息が合って成功することも、同じキャラクターを動かす全員の体験になります。

**ゲームの内容を変えずに、操作する人と協力の仕方を変える。**

Re:Cooplayは、既存のゲームにそんな新しい遊び方を加えたい、という発想から生まれました。

### 製品説明（具体的な製品の説明）

> **ゲーム体験 × Tech：1つのキャラクターを、みんなで動かす**

**遊び方は4ステップです。**

1. **スマホで参加：** PCアプリのQRコードを読み取り、ブラウザから参加。最初の参加者はホストとしてスマホからPC画面も操作できます。
2. **ゲームを選択：** Steam・Epic Gamesのインストール済みゲームを自動検出して一覧に表示。検出できないゲームは手動登録し、ホストが選択します。
3. **操作を分担：** 選択したゲームと参加人数に合わせて分担案を自動生成。担当を確認してゲームを起動します。
4. **Readyで開始：** ホストの操作で共同プレイを開始。各スマホが担当のコントローラーに切り替わります。

**3人でMinecraftを遊ぶ場合の分担例**

| プレイヤー | 担当する操作 |
|---|---|
| P1 | 移動・ジャンプ |
| P2 | 視点・カメラ操作 |
| P3 | 攻撃・アイテムの使用 |

<div align="center">
  <a href="assets/images/recooplay-role-controllers.webp"><img src="assets/images/recooplay-role-controllers.webp" width="960" alt="3人プレイの役割分担例。左から移動・視点・アクション"></a>
  <p><sub>3人分の操作を表した説明用画像。担当別の画面はゲームと参加人数に合わせて生成されます。</sub></p>
</div>

[PC・スマホの画面一覧](docs/screenshots.md)では、参加からゲーム選択、共同操作までの画面を確認できます。

### 特長

- **操作の共有ではなく、役割の分担：** 移動・視点・アクションなどを参加人数（現在2〜4人）に合わせて自動で振り分けます。開始前や一時停止中には役割の交換もできます。
- **遊び慣れたPCゲームをそのまま：** ゲームの改造は不要。ゲーム固有の操作定義と汎用の操作定義を使い、さまざまなPCゲームで共同操作を楽しめます。
- **スマホだけで手軽に参加：** 専用のスマホアプリや追加コントローラーは不要。ゲームと担当に合わせた操作画面が自動生成されます。

### 解決出来ること

Re:Cooplayは、ゲームの内容を変えずに、**操作を分担することで生まれる新しい協力の楽しさ**を提供します。

- **Minecraft：** 移動・視点・攻撃を3人で分担し、声を掛け合いながら1体のキャラクターを動かす。思うように動けないハプニングも、息が合った達成感もみんなの体験になります。
- **ホラーゲーム『Outlast（アウトラスト）』：** 移動や視点を友達と分担し、怖い場面でも声を掛け合って進む。思わぬ操作や連携によって、いつものゲームに新しい緊張感と楽しさが生まれます。

🎮 **『Outlast（アウトラスト）』の実プレイ動画：** [2人で操作を分担する様子（約3分18秒）](https://drive.google.com/file/d/1ZdPi9M9zD87YS8cdn4fIGKjNNi-r7Ewt/view) ／ [驚いた場面の切り抜き（約11秒）](https://drive.google.com/file/d/1HzBcDEd4Hm6iXMjvd6CHqWi29Rwi6NfX/view)

その他実演として、**プロダクト紹介動画ではTerrariaでの共同操作**も紹介しています。

### 今後の展望

ゲームごとの操作定義、対応形式のキー設定の読み取り、人数に応じた自動分担は実装済みです。一方、ゲームによっては個別の設定や調整が必要です。

**目指すのは、遊びたいゲームを選ぶだけで、どんなゲームでも共同操作できること。** 今後は対応する設定形式や入力方式を広げ、手動調整を減らします。さらに、操作頻度などを考慮した分担の改善や、操作画面のカスタマイズ、遠隔地からの参加にも取り組みたいと考えています。

### 注力したこと（こだわり等）

- **特定のゲームに依存しないこと：** ゲームやユーザーによってキー設定が異なっても遊べるように、操作設定の読取りと共通化を重視しました。未対応のキーを誤った入力で代用しないことにもこだわっています。
- **人数が変わっても全員が参加できること：** 特定の人数に合わせて操作を固定せず、2〜4人それぞれに操作を振り分けられる仕組みを設計しました。操作の負担が偏りすぎないことも意識しています。
- **実際のゲームで使える操作感：** 操作の遅れや入力の取りこぼしを抑えるため、低遅延な通信と入力処理を追求しました。通信試作品では、WebRTCの導入により、不安定な端末での視点操作の途切れを42%から1.7%に改善しました。スマホの操作感、簡単なQR参加、安全に停止できる仕組みも重視しています。

---

## 技術仕様書

- [総合仕様書](docs/README.md) — システム構成・動作環境と詳細仕様への入口
- [ゲーム操作定義仕様書](docs/game-profile-specification.md) — ゲーム別の操作・キー設定・人数別分担
- [画面一覧](docs/screenshots.md) — PC・スマホの画面と使用の流れ
- 詳細：[フロントエンド](docs/frontend-specification.md) ／ [ホスト](docs/host-specification.md) ／ [通信](docs/protocol-specification.md)

---

## 開発技術

**システム構成**

スマホからの操作をPC上のRustホストで受け取り、参加者ごとの担当を確認して入力を統合。Windows API（SendInput）で既存のPCゲームへ送ります。参加・状態管理にはWebSocket、操作入力にはWebRTC DataChannelも使用します。

<div align="center">
  <a href="assets/images/recooplay-system-architecture.webp"><img src="assets/images/recooplay-system-architecture.webp" width="960" alt="スマートフォンの操作をRustホストで統合し、既存PCゲームへ送るシステム構成図"></a>
  <p><sub>3人で共同操作する場合のシステム構成例</sub></p>
</div>

### 活用した技術

#### API・データ

Windows API（SendInput）、WebSocket、WebRTC DataChannel、JSONによるゲーム操作定義

#### フレームワーク・ライブラリ・モジュール

Rust（Tokio・axum）、Tauri 2／WebView2、HTML・CSS・JavaScript、Node.js（開発・検証）

#### デバイス

Windows PC（ホスト・ゲーム実行）＋ Android／iPhone（ブラウザから参加）。現在は同じネットワーク上で2〜4人の共同操作に対応しています。

### 独自技術

#### ハッカソンで開発した独自機能・技術

**Hack Dayの2日間で、アイデア出し・開発環境の構築から、実際に動くプロダクトの実装まで行いました。**

- **ゲームごとの操作を共通の仕組みで扱う：** ゲーム別の操作定義を読み込み、対応する設定ファイルから変更済みのキーを取得。定義がないゲームには汎用定義を使い、担当に合った画面を生成します。  
  [ゲーム操作定義](docs/game-profile-specification.md) ／ [キー設定の取得](apps/host-rs/src/keybinds.rs) ／ [画面生成](apps/web-static/scripts/generated-controls.js)

- **人数に合わせて操作を分け、入力を統合する：** 操作グループを必要に応じて分割し、重みを考慮して2〜4人に配分。担当外からの入力を受け付けず、各スマホの入力を1つにまとめます。  
  [分担の生成](apps/host-rs/src/profiles.rs) ／ [入力統合・担当確認](apps/host-rs/src/hub.rs) ／ [Windows入力](apps/host-rs/src/input.rs)

- **遅延や誤操作を抑える：** 通信の重複・古い入力を排除し、視点操作を補間。対象ゲーム以外への入力を制限し、一時停止・切断・緊急停止時には押下中の入力を解放します。  
  [通信処理](apps/host-rs/src/rtc.rs) ／ [入力先の制御](apps/host-rs/src/focus.rs) ／ [開始・停止の実装](apps/host-rs/src/hub.rs)

---

<sub>Re:Cooplayは独立した非公式システムであり、Minecraftのゲーム本体・素材を同梱していません。Minecraftの公式製品ではなく、Mojang Studios・Microsoftの承認・提携を受けていません。NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT. [Minecraftの利用条件に関する確認記録](docs/develop/decisions/2026-10-25-minecraft-usage-terms.md)</sub>
