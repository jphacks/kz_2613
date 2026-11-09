# 提供ロゴ・アイコンの反映

## 現在の採用アイコン（2026-11-08、#268）

今回のユーザー指定 `C:/Users/kumes/Downloads/icon.png` を採用した。以下の2026-10-25の記録は履歴として保持する。ロゴは従来のまま。

- 原画像：`apps/desktop/icons/icon-source.png`（2048×2048、RGBA、881,644 bytes）。提供PNGとバイト単位で一致。
- SHA-256：`25c4195916c2a260ae3b8017c5ee125f79fea15bf72478e921a767c8e8e0f40b`。
- 透過部分・影・輪郭・配色・元からある余白を保持した。切り取り、背景除去、形状の修正は行っていない。

| 形式・用途 | ファイル | サイズ |
| --- | --- | --- |
| 再利用するSVG | `apps/desktop/icons/icon.svg` | 2048×2048、原PNGをdata URIで無劣化埋め込み |
| Windowsアプリ | `apps/desktop/icons/32x32.png`、`128x128.png`、`icon.png` | 32・128・256px |
| Windows実行ファイルのアイコン | `apps/desktop/icons/icon.ico` | 16・24・32・48・64・128・256px、透過あり |
| ブラウザfavicon | `apps/web/public/assets/icon.png` | 192px |
| iPhoneホーム画面用 | `apps/web/public/assets/apple-touch-icon.png` | 180px |
| Tauri起動画面favicon | `apps/desktop/ui/assets/icon.png` | 192px |

SVGはパス化したベクター画像ではなく、PNGを内包する自己完結したSVG。自動トレースによる外観の変化を避けるため、この形式を採用した。外部ファイル・フォント・通信は不要だが、拡大時の情報量は原PNGの2048pxまで。約1.18MBあるためブラウザfaviconには既存の縮小PNGを使い続ける。Windows用ICOの各サイズは、256pxを経由せず原画像から直接縮小する。

### 再生成と確認

開発用のPillow 11.3.0を使用。本番依存は追加していない。

```powershell
python scripts/windows/prepare-brand-assets.py
python scripts/sim/verify-brand-assets.py --preview docs/develop/design/evidence/icon-268/sizes-light-dark.png
cargo build --release --locked --offline --manifest-path apps/desktop/Cargo.toml
# CARGO_TARGET_DIRを設定した場合は、実際のビルド出力を指定する。
python scripts/sim/verify-brand-assets.py --exe apps/desktop/target/release/recooplay-desktop.exe
```

提供ファイルとも照合する場合は検証コマンドに `--source C:/Users/kumes/Downloads/icon.png` を追加する。EXEの照合はWindows専用で、PEをデータとして読み取り、コードを実行しない。

- 原画像と提供PNG、SVGに埋め込んだPNGがバイト単位で一致。PNG 6件とICO 7サイズは、原画像をLANCZOSで縮小したRGBAの全画素が一致した。
- ビルドしたEXEのアイコン7サイズがICOの画像データとバイト単位で一致した。リソースコンパイラーによるplanes値の0→1の正規化は画像の変更に含めない。
- [明暗背景・縮小表示](evidence/icon-268/sizes-light-dark.png)で16・24・32・48pxでも2体の形と水色・赤を識別できた。16pxでは表情の細部は小さくなる。比較画像の256px欄は表示上128pxに縮小している。
- 再ビルドしたTauriアプリをdry-runで起動し、実窓のタイトルバーに新アイコンが出ることを視認した。静的配信42ファイルのHTTP・MIME・キャッシュ照合、静的ページの構文確認も合格。
- タスクバー・デスクトップのショートカットのキャッシュ反映、iPhoneのホーム画面追加は未検証。既存のショートカットに古いアイコンが残る場合は、新しいEXEでの確認が必要。Minecraftやスマホの操作試験は今回の検証に含めない。

## 2026-10-25の反映記録（履歴）

2026-10-25の明示指定により、従来の文字ロゴと仮アイコンを提供画像へ差し替えた。ロゴ・キャラ等の仮素材を用いた過去のスクリーンショットは履歴として保持する。

| 用途 | 提供ファイル | リポジトリ内の原画像 | SHA256 |
| --- | --- | --- | --- |
| ロゴ | `C:/Users/kumes/Downloads/新しいフォルダー/新しいフォルダー/rogo.png` | `apps/web/public/assets/logo.png` | `4534d328a5feb9eeacb32342bef486d8ffa4208b1a33a9fe0338c158a028c99d` |
| アイコン | `C:/Users/kumes/Downloads/新しいフォルダー/新しいフォルダー/icon.png` | `apps/desktop/icons/icon-source.png` | `8ff959350eae161ab9eda1d01e554dc2824e1e03187eaa7f7492589055a0bed6` |

原画像は変更せず保存。ロゴ3200×2400、アイコン1774×1774。ロゴはPC左上、スマホヘッダー、Tauri起動画面へ配置し、object-fit:containで縦横比と全体を保つ。PCの専用領域は左列の上部112px。巨大見出し・QR・CTAとは重ならない。スマホは高さに応じて48px／36pxへ縮小し、従来どおり高さ600px以下では操作領域を優先してヘッダーロゴを非表示にする。ページのアイコンはその場合も有効。

Windowsには32/128/256pxのPNGと16〜256pxを含むICO、ブラウザには192px、iPhoneのホーム画面用に180pxのPNGを生成した。図案の改変・切り取り・背景除去はしていない。ブラウザの全4ページとTauri起動画面にfaviconを指定。ホーム画面追加やWindowsのキャッシュ更新は今回実機未検証。

```powershell
# Pillow入りの開発用Pythonで実行。本番依存は追加しない。
python scripts/windows/prepare-brand-assets.py
cargo build --release --locked --manifest-path apps/desktop/Cargo.toml
```

既存のTauri増分ビルドはアイコン変更を追跡しておらず、最初のビルドで古いアイコンが残った。`apps/desktop/build.rs` に `cargo:rerun-if-changed` を追加して再生成した。EXEの関連アイコンは新しいパスのコピーから抽出し、キャッシュの影響を避けて確認する。

再ビルド後に抽出した[実行ファイルのアイコン](evidence/brand-mobile/windows-exe-icon.png)は提供図案に一致することを視認した。配布ZIPは `.venv/branding-verified-dist/` に新規生成し、全UI26ファイルと両exeの内容一致を確認する。

## 画面確認

- PC：提供ロゴを反映した5画面×1920×1080／1280×720を独立したタブ29・30で各10枚、新規撮影。2回とも主要矩形の差分0件、コンソール警告・エラー0件。
- 原案の仮ロゴとの違いは新しい明示的ユーザー指定による仕様差。見出し・右領域・CTAの採点は従来どおり参加96／選択97／分担96／準備中96／準備可能97を維持する。完全な画素一致率ではない。
- スマホ：3担当の協力画面、ホスト準備中・一時停止の5状態×縦6サイズ、計30条件。横はみ出し・主要操作ボタンの画面外・高さ44px未満なし。既存の診断用通信テストボタンは44px判定の対象外。実端末のタッチ試験ではなく、表示専用データのブラウザ描画。
- スマホの検証器がPC用stateだけを送っていたため、スマホ用game通知も送るように検証器のみ修正。読み込み中に測った結果を合格にせず、担当画面の表示確定を待って再測定した。
- [最新PC比較・全画像](evidence/pc-fidelity-final/README.md)、[スマホ30条件](evidence/brand-mobile/README.md)、[監査履歴](evidence/pc-fidelity-progress.md)。

新UIのMinecraft・Tauri実窓・Android/iPhone実機の受入を検証済みとはしない。通信契約・入力処理・Ready・安全停止は変更していない。
