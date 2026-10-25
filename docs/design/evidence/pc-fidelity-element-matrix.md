# PC原案と実装の要素対応・最終評価

座標は1920×1080の `[x, y, 幅, 高さ]`。原案は変更しないPNGの指定色の外接矩形、実装はDOM矩形。文字だけは原案と実装とも着色画素で比較する。原案のDOM・正式フォント情報は未取得で、文字の画素矩形をフォントサイズと取り違えない。

[元PNGのファイル名・SHA256・採色領域](pc-fidelity-reference.json) ／ [計測全件](pc-fidelity-final/metrics.json) ／ [主要矩形判定](pc-fidelity-final/geometry-audit.json) ／ [全5比較画像](pc-fidelity-final/index.html)

## 共通の判定・残差分

- 左境界は全5状態 `x=561`、原案561pxに一致。右の各大領域は下表の中心差±24px・寸法差±5%以内。小画面は2/3倍、全10画像でページスクロールとボタンの画面外は0。
- 正式フォント不明。ローカルにある Noto Sans JP を原寸で比較し採用。外部CDN・フォント再配布はない。字間0、白輪郭と白／灰のずらし影を再現。正式書体・ラスタライズの差はP2として減点。
- 原案の2人／4人を固定3人に適応。外接矩形・縦長枠の面積・色の主従は保持。原案が仮置きのロゴ・キャラは製品名と担当の仮枠へ対応。
- 任意パスは未提供なので実動作の「このゲームで遊ぶ」に置換。Ready権限はP1のみ、PCのSTARTはボタンではなく案内。接続済みを個人Ready済みと表示しない。
- 残るP2：正式書体、背景の局所的な装飾位置・影のラスタライズ、3列化した枠内の文字量、必要な安全導線による余白差。P0/P1の残件0。完全な画素一致・実機成功は主張しない。

## 参加 — 96/100

原案：`QRコード、人数表示.png`。 [原寸比較](pc-fidelity-final/join-comparison.jpg) ／ [1920](pc-fidelity-final/join-1920.jpg) ／ [1280](pc-fidelity-final/join-1280.jpg) ／ [無加工差分](pc-fidelity-final/join-difference.png)

| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |
| --- | --- | --- | --- | --- | --- |
| 見出しの着色画素 | [99, 144, 342, 203] | [100, 145, 339, 200] | [-0.5, -0.5] | [-0.88, -1.48] | PASS |
| 情報カード群 | [648, 140, 777, 230] | [646, 140, 781.0, 230] | [0.0, 0.0] | [0.51, 0.0] | PASS |
| キャラクター群 | [646, 436, 781, 644] | [646, 436, 781.0, 644] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 主CTA／案内 | [136, 376, 288, 102] | [136, 376, 288, 102] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| QR枠 | [95, 649, 369, 369] | [95, 649, 369, 369] | [0.0, 0.0] | [0.0, 0.0] | PASS |

| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |
| --- | --- | --- | --- | --- |
| 巨大見出し・改行 `#screenTitle` | 原案は対応比較画像を視認。DOM実測 [40, 126, 495, 226.54] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 96px; 750; 行 113.28px; 字間 normal | rgb(23, 193, 255) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(23, 193, 255) / 角 0px / 影 rgb(255, 255, 255) 3px 3px 0px, rgb(191, 191, 191) 5px 7px 0px | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [669.83, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [939.5, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [1209.17, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| QR吹き出し（短い2行） `.qr-bubble` | 原案は対応比較画像を視認。DOM実測 [126, 531, 316, 97] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 38.4px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 説明の改行・中央揃え `.explanation` | 原案は対応比較画像を視認。DOM実測 [60, 444, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下段説明（仕様に必要な文言差） `.secondary` | 原案は対応比較画像を視認。DOM実測 [60, 637, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 24px; 500; 行 30px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 安全案内・設定・補助遷移（必要操作） `.utility-bar` | 原案は対応比較画像を視認。DOM実測 [1456, 984, 440, 88] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 18px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 仮ロゴ→製品名（仕様適応） `.brand` | 原案は対応比較画像を視認。DOM実測 [60, 52, 438, 44] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 28px; 800; 行 44px; 字間 normal | rgb(89, 89, 89) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(89, 89, 89) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [748.83, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1018.5, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1288.17, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 吹き出し下の三角 `.qr-arrow` | 原案は対応比較画像を視認。DOM実測 [269, 622, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |

上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。

## ゲーム選択 — 97/100

原案：`選択画面.png`。 [原寸比較](pc-fidelity-final/game-comparison.jpg) ／ [1920](pc-fidelity-final/game-1920.jpg) ／ [1280](pc-fidelity-final/game-1280.jpg) ／ [無加工差分](pc-fidelity-final/game-difference.png)

| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |
| --- | --- | --- | --- | --- | --- |
| 見出しの着色画素 | [105, 228, 371, 135] | [105, 229, 371, 135] | [0.0, 1.0] | [0.0, 0.0] | PASS |
| 巨大ゲーム枠 | [611, 41, 1274, 982] | [611, 41, 1274, 982] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 主CTA／案内 | [60, 771, 469, 67] | [60, 771, 469, 67] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 細罫線 | [60, 386, 438, 1] | [60, 386, 438, 1] | [0.0, 0.0] | [0.0, 0.0] | PASS |

| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |
| --- | --- | --- | --- | --- |
| 巨大見出し・改行 `#screenTitle` | 原案は対応比較画像を視認。DOM実測 [45, 217, 495, 153.58] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 64px; 700; 行 76.8px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 rgb(255, 255, 255) 3px 3px 0px, rgb(191, 191, 191) 5px 7px 0px | PASS（必要な仕様差は下記） |
| 説明の改行・中央揃え `.explanation` | 原案は対応比較画像を視認。DOM実測 [72, 444, 438, 120] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下段説明（仕様に必要な文言差） `.secondary` | 原案は対応比較画像を視認。DOM実測 [60, 637, 438, 90] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 24px; 500; 行 30px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 安全案内・設定・補助遷移（必要操作） `.utility-bar` | 原案は対応比較画像を視認。DOM実測 [1456, 984, 440, 88] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 18px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 仮ロゴ→製品名（仕様適応） `.brand` | 原案は対応比較画像を視認。DOM実測 [60, 52, 438, 44] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 28px; 800; 行 44px; 字間 normal | rgb(89, 89, 89) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(89, 89, 89) / 角 0px / 影 none | PASS（必要な仕様差は下記） |

上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。

## 分担 — 96/100

原案：`分担.png`。 [原寸比較](pc-fidelity-final/roles-comparison.jpg) ／ [1920](pc-fidelity-final/roles-1920.jpg) ／ [1280](pc-fidelity-final/roles-1280.jpg) ／ [無加工差分](pc-fidelity-final/roles-difference.png)

| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |
| --- | --- | --- | --- | --- | --- |
| 見出しの着色画素 | [100, 304, 356, 59] | [100, 304, 356, 59] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 横長操作帯 | [616, 52, 1274, 244] | [616, 52, 1274, 244] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| キャラクター群 | [669, 404, 1153, 536] | [669, 404, 1153, 536] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 細罫線 | [59, 396, 438, 1] | [59, 396, 438, 1] | [0.0, 0.0] | [0.0, 0.0] | PASS |

| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |
| --- | --- | --- | --- | --- |
| 巨大見出し・改行 `#screenTitle` | 原案は対応比較画像を視認。DOM実測 [43, 292, 495, 76.79] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 64px; 700; 行 76.8px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 rgb(255, 255, 255) 3px 3px 0px, rgb(191, 191, 191) 5px 7px 0px | PASS（必要な仕様差は下記） |
| 説明の改行・中央揃え `.explanation` | 原案は対応比較画像を視認。DOM実測 [60, 480, 438, 80] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下段説明（仕様に必要な文言差） `.secondary` | 原案は対応比較画像を視認。DOM実測 [60, 657, 438, 80] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 安全案内・設定・補助遷移（必要操作） `.utility-bar` | 原案は対応比較画像を視認。DOM実測 [1456, 984, 440, 88] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 18px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 仮ロゴ→製品名（仕様適応） `.brand` | 原案は対応比較画像を視認。DOM実測 [60, 52, 438, 44] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 28px; 800; 行 44px; 字間 normal | rgb(89, 89, 89) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(89, 89, 89) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| E/W/S見本の角丸行 `.key-samples span` | 原案は対応比較画像を視認。DOM実測 [1418.33, 65.67, 424, 67] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 46px; 900; 行 normal; 字間 normal | rgb(89, 89, 89) / 背景 rgb(229, 227, 221) / 0px none rgb(89, 89, 89) / 角 21px / 影 none | PASS（必要な仕様差は下記） |
| E/W/S見本の角丸行 `.key-samples span` | 原案は対応比較画像を視認。DOM実測 [1394.33, 139.67, 480, 74] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 46px; 900; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgb(248, 248, 246) / 2.66667px solid rgb(255, 0, 221) / 角 21px / 影 none | PASS（必要な仕様差は下記） |
| E/W/S見本の角丸行 `.key-samples span` | 原案は対応比較画像を視認。DOM実測 [1418.33, 220.67, 424, 66] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 46px; 900; 行 normal; 字間 normal | rgb(89, 89, 89) / 背景 rgb(229, 227, 221) / 0px none rgb(89, 89, 89) / 角 21px / 影 none | PASS（必要な仕様差は下記） |
| キー見本の濃灰バッジ `.key-samples kbd` | 原案は対応比較画像を視認。DOM実測 [1764.55, 68.17, 49.78, 62] | Arial, sans-serif; 44px; 900; 行 normal; 字間 normal | rgb(255, 255, 255) / 背景 rgb(102, 102, 102) / 0px none rgb(255, 255, 255) / 角 12px / 影 none | PASS（必要な仕様差は下記） |
| キー見本の濃灰バッジ `.key-samples kbd` | 原案は対応比較画像を視認。DOM実測 [1781.67, 145.67, 62, 62] | Arial, sans-serif; 44px; 900; 行 normal; 字間 normal | rgb(255, 255, 255) / 背景 rgb(102, 102, 102) / 0px none rgb(255, 255, 255) / 角 12px / 影 none | PASS（必要な仕様差は下記） |
| キー見本の濃灰バッジ `.key-samples kbd` | 原案は対応比較画像を視認。DOM実測 [1764.55, 222.67, 49.78, 62] | Arial, sans-serif; 44px; 900; 行 normal; 字間 normal | rgb(255, 255, 255) / 背景 rgb(102, 102, 102) / 0px none rgb(255, 255, 255) / 角 12px / 影 none | PASS（必要な仕様差は下記） |
| 上の黄色三角 `.key-up` | 原案は対応比較画像を視認。DOM実測 [1625.33, 114.67, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下の黄色三角 `.key-down` | 原案は対応比較画像を視認。DOM実測 [1625.33, 211.67, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 固定3人の縦長枠（人数適応） `.role-column` | 原案は対応比較画像を視認。DOM実測 [669, 404, 344.33, 536] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgb(217, 217, 217) / 0px none rgb(0, 0, 0) / 角 22px / 影 none | PASS（必要な仕様差は下記） |
| 固定3人の縦長枠（人数適応） `.role-column` | 原案は対応比較画像を視認。DOM実測 [1073.33, 404, 344.33, 536] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgb(134, 232, 241) / 4.66667px solid rgb(227, 255, 17) / 角 22px / 影 none | PASS（必要な仕様差は下記） |
| 固定3人の縦長枠（人数適応） `.role-column` | 原案は対応比較画像を視認。DOM実測 [1477.67, 404, 344.33, 536] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgb(217, 217, 217) / 0px none rgb(0, 0, 0) / 角 22px / 影 none | PASS（必要な仕様差は下記） |
| 帯の見出し（固定分担） `.role-band h2` | 原案は対応比較画像を視認。DOM実測 [618.67, 133.7, 750, 80.59] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 62px; 700; 行 80.6px; 字間 normal | rgb(255, 255, 255) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(255, 255, 255) / 角 0px / 影 none | PASS（必要な仕様差は下記） |

上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。

## 準備中 — 96/100

原案：`準備.png`。 [原寸比較](pc-fidelity-final/preparing-comparison.jpg) ／ [1920](pc-fidelity-final/preparing-1920.jpg) ／ [1280](pc-fidelity-final/preparing-1280.jpg) ／ [無加工差分](pc-fidelity-final/preparing-difference.png)

| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |
| --- | --- | --- | --- | --- | --- |
| 見出しの着色画素 | [112, 421, 356, 89] | [110, 422, 360, 90] | [0.0, 1.5] | [1.12, 1.12] | PASS |
| 情報カード群 | [648, 140, 777, 230] | [646, 140, 781.0, 230] | [0.0, 0.0] | [0.51, 0.0] | PASS |
| キャラクター群 | [646, 436, 781, 644] | [646, 436, 781.0, 644] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 主CTA／案内 | [139, 578, 288, 102] | [139, 578, 288, 102] | [0.0, 0.0] | [0.0, 0.0] | PASS |

| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |
| --- | --- | --- | --- | --- |
| 巨大見出し・改行 `#screenTitle` | 原案は対応比較画像を視認。DOM実測 [43, 391, 495, 139.2] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 96px; 850; 行 139.2px; 字間 normal | rgb(204, 51, 255) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(204, 51, 255) / 角 0px / 影 rgb(255, 255, 255) 3px 3px 0px, rgb(191, 191, 191) 5px 7px 0px | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [669.83, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(204, 51, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [939.5, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [1209.17, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 説明の改行・中央揃え `.explanation` | 原案は対応比較画像を視認。DOM実測 [60, 444, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下段説明（仕様に必要な文言差） `.secondary` | 原案は対応比較画像を視認。DOM実測 [60, 637, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 24px; 500; 行 30px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 安全案内・設定・補助遷移（必要操作） `.utility-bar` | 原案は対応比較画像を視認。DOM実測 [1456, 1032, 440, 40] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 18px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| Minecraft前面化（必要操作） `#openGameBtn` | 原案は対応比較画像を視認。DOM実測 [85, 744, 390, 54] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 22px; 800; 行 normal; 字間 normal | rgb(7, 92, 134) / 背景 rgb(255, 255, 255) / 2px solid rgb(23, 193, 255) / 角 999px / 影 none | PASS（必要な仕様差は下記） |
| 問題発生時だけの警告（必要安全要件） `#warning` | 原案は対応比較画像を視認。DOM実測 [1466, 902.67, 430, 107.33] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 22px; 400; 行 33px; 字間 normal | rgb(154, 40, 68) / 背景 rgb(255, 255, 255) / 2.66667px solid rgb(154, 40, 68) / 角 18px / 影 none | PASS（必要な仕様差は下記） |
| 仮ロゴ→製品名（仕様適応） `.brand` | 原案は対応比較画像を視認。DOM実測 [60, 52, 438, 44] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 28px; 800; 行 44px; 字間 normal | rgb(89, 89, 89) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(89, 89, 89) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [748.83, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1018.5, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1288.17, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |

上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。

## 準備可能 — 97/100

原案：`準備完了.png`。 [原寸比較](pc-fidelity-final/ready-comparison.jpg) ／ [1920](pc-fidelity-final/ready-1920.jpg) ／ [1280](pc-fidelity-final/ready-1280.jpg) ／ [無加工差分](pc-fidelity-final/ready-difference.png)

| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |
| --- | --- | --- | --- | --- | --- |
| 見出しの着色画素 | [51, 421, 436, 89] | [55, 422, 436, 89] | [4.0, 1.0] | [0.0, 0.0] | PASS |
| 情報カード群 | [648, 140, 777, 230] | [646, 140, 781.0, 230] | [0.0, 0.0] | [0.51, 0.0] | PASS |
| キャラクター群 | [646, 436, 781, 644] | [646, 436, 781.0, 644] | [0.0, 0.0] | [0.0, 0.0] | PASS |
| 主CTA／案内 | [139, 578, 288, 102] | [139, 578, 288, 102] | [0.0, 0.0] | [0.0, 0.0] | PASS |

| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |
| --- | --- | --- | --- | --- |
| 巨大見出し・改行 `#screenTitle` | 原案は対応比較画像を視認。DOM実測 [43, 391, 495, 139.2] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 96px; 850; 行 139.2px; 字間 normal | rgb(23, 193, 255) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(23, 193, 255) / 角 0px / 影 rgb(255, 255, 255) 3px 3px 0px, rgb(191, 191, 191) 5px 7px 0px | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [669.83, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [939.5, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 接続・準備ピル（接続とReadyを区別） `.player-badge` | 原案は対応比較画像を視認。DOM実測 [1209.17, 72, 194, 55] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 700; 行 55px; 字間 normal | rgb(255, 255, 255) / 背景 rgb(23, 193, 255) / 0px none rgb(255, 255, 255) / 角 40px / 影 none | PASS（必要な仕様差は下記） |
| 説明の改行・中央揃え `.explanation` | 原案は対応比較画像を視認。DOM実測 [60, 444, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 32px; 500; 行 40px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 下段説明（仕様に必要な文言差） `.secondary` | 原案は対応比較画像を視認。DOM実測 [60, 637, 438, 0] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 24px; 500; 行 30px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 安全案内・設定・補助遷移（必要操作） `.utility-bar` | 原案は対応比較画像を視認。DOM実測 [1456, 1032, 440, 40] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 18px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| Minecraft前面化（必要操作） `#openGameBtn` | 原案は対応比較画像を視認。DOM実測 [85, 744, 390, 54] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 22px; 800; 行 normal; 字間 normal | rgb(7, 92, 134) / 背景 rgb(255, 255, 255) / 2px solid rgb(23, 193, 255) / 角 999px / 影 none | PASS（必要な仕様差は下記） |
| 仮ロゴ→製品名（仕様適応） `.brand` | 原案は対応比較画像を視認。DOM実測 [60, 52, 438, 44] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 28px; 800; 行 44px; 字間 normal | rgb(89, 89, 89) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(89, 89, 89) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [748.83, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1018.5, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| 情報カード下の三角 `.player-arrow` | 原案は対応比較画像を視認。DOM実測 [1288.17, 384, 36, 30] | "Noto Sans JP", Arial, "Yu Gothic", sans-serif; 16px; 400; 行 normal; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |
| P1スマホだけReady（仕様差） `#readyInstruction span` | 原案は対応比較画像を視認。DOM実測 [73, 696, 420, 30.79] | "Noto Sans JP", sans-serif; 22px; 700; 行 30.8px; 字間 normal | rgb(0, 0, 0) / 背景 rgba(0, 0, 0, 0) / 0px none rgb(0, 0, 0) / 角 0px / 影 none | PASS（必要な仕様差は下記） |

上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。

## 色の採取点

ベタ色は原PNGの実画素（左上原点）。半透明パネルは背景との合成色であり、単独HEXと同一視しない。CSSの共通値は `styles/colors.css`。

| 原案 | 色 | サンプル座標 | 対応 |
| --- | --- | --- | --- |
| QRコード、人数表示.png | `#17C1FF` | (184, 376) | シアン輪郭・ピル |
| 準備.png | `#CC33FF` | (124, 421) | 紫タイトル・準備ピル |
| QRコード、人数表示.png | `#D9D9D9` | (684, 436) | 灰色キャラ枠 |
| 分担.png | `#86E8F1` | (982, 409) | 選択キャラ枠 |
| 分担.png | `#E3FF11` | (982, 404) | 選択枠の黄緑 |
| 分担.png | `#FF00DD` | (1416, 139) | 見本の桃色輪郭 |
| 分担.png | `#FFED62` | (1640, 114) | 黄色三角 |
