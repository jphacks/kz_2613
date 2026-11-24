# 技術選定とアーキテクチャの再評価（2026-11-24）

外部レビューを起点に、基準コミット `c406a4e62022fd60a6a0341ec77c30f6b9b99eb3`（`main`）でコードベース・実測データ・既存 Issue・公式資料を照合し、主要技術スタックの妥当性と今後の改善方針を整理した。本記録は、後から同じ議論を繰り返さないための事実・採用方針・見送り理由・再検討条件を残すものである。

## 総合結論

- 主要な技術スタック（Rust + Tokio + Axum の単一 `hub` スレッド、Win32 `SendInput` + `timeBeginPeriod(1)`、Tauri 2 の薄いシェル＋子プロセス分離、React 19 + TypeScript strict + Vite、通常 CSS、WebSocket + WebRTC DataChannel 併用、Python 学習＋Rust 独自 AI 推論、PowerShell + NSIS 配布）に破綻はなく、**現行スタックを維持**する。
- 一般公開を止めている主要因は技術選定ではなく実機受入の未完了項目であり、優先順位は **①実機受入（#437・#426・安全停止・クリーン PC 導入） → ②モデル表示訂正（#620）と公開判断材料整理 → ③キー正規化の差異検出試験（#619） → ④`hub.rs` 試験分離（#617）・静的 CRT 限定検証（#219） → ⑤その他（#272・#278・次回書き出し時トークナイザー検証）** とする。

## 論点別の事実・実測・決定事項

### 1. WebRTC ライブラリと CRT 静的リンク（[#219](https://github.com/jphacks/kz_2613/issues/219)）

- **確認した実測（既存ビルド・配布 zip の PE インポート解析）**：

| 実行ファイル | `MSVCP140.dll` | `VCRUNTIME140.dll` 等 | 構成 |
|:--|:--|:--|:--|
| `recooplay-host.exe` | あり | あり（`VCRUNTIME140.dll`・`VCRUNTIME140_1.dll`） | `libdatachannel`（C++）＋既定 MSVC CRT |
| `recooplay-desktop.exe` | なし | なし | `tauri-build` が `static_vcruntime` を使用し UCRT（OS 標準）のみ参照 |
| `recooplay-input-probe.exe` | なし | `VCRUNTIME140.dll` のみあり | 純 Rust（既定 MSVC CRT） |

- **方針**：現行の `libdatachannel`（`datachannel` クレート）を維持する。正常なビルド環境（または CI）で CRT 静的リンク（`/MT`、`+crt-static`）を限定的に 1 回検証し、ビルド成否（CMake 側不整合による `LNK2038` の有無）と上記 3 DLL の消失を確認する（成功してもクリーン PC での実機確認は別途必要）。
- **代替候補（`str0m`・`webrtc-rs` 等）の再検討条件**：純 Rust 化しても Windows 向け MSVC リンカーと Windows SDK への依存は残る（減るのは CMake・Perl・libclang と C++ ランタイム依存）。以下のいずれかが生じた場合に比較 PoC を再検討する。
  1. C++ 部分を静的リンクできず、クリーン PC で VC++ ランタイム不足による失敗が継続する
  2. vendored OpenSSL や `libdatachannel` に起因する `cargo-audit` 停止やビルド破損が繰り返される
  3. Windows 以外のホスト対応、または `libdatachannel` では対応できない機能が必要になる
- **PoC の合格基準**：iPhone Safari・Android Chrome で順序保証なし・再送なし（`ordered: false`, `maxRetransmits: 0`）の DataChannel を確立・再接続でき、#435 の計測用ビルドによる遅延分布が現行と同等以上であること。

### 2. 分担 AI モデルの `tokenizer.json` と表記訂正（[#620](https://github.com/jphacks/kz_2613/issues/620)）

- **実測結果（Hugging Face 固定版 `preset-model-v2` の `tokenizer.json`）**：

| 形式 | 現行（整形済み） | minify 後 | 差 |
|:--|--:|--:|--:|
| 非圧縮 | 17.08 MB | 9.08 MB | −8.00 MB |
| Deflate（ZIP 相当） | 4.01 MB | 3.54 MB | −0.47 MB |
| LZMA（NSIS `/SOLID lzma` 相当） | 2.38 MB | 2.26 MB | −0.12 MB |

- **確認した事実**：
  - JSON として読み直した値は一致するが、トークナイザー・推論実行による等価性は未検証。
  - `NOTICE` はトークナイザーを「元のまま再配布（as obtained from the original model）」と記載しているが、実際には `scripts/preset-model/train.py`（100・733 行目）の `save_pretrained` により整形 JSON かつ `truncation (max_length 48)` 付きの別ファイル（17,082,986 バイト）が書き出されており、元モデル（9,081,518 バイト）と一致しない。
  - モデルカードにも 137〜142 行目（「すべて CC BY-NC-ND」）と 146 行目（「作者が加えた部分」）の不整合がある。
- **方針**：
  - 圧縮後の削減幅が小さいため、**単独での軽量化・minify は見送る**。
  - 語彙削減（トークナイザー自身の語彙削除）は分割結果が変わり再検証が必要になるため**見送る**。
  - `NOTICE` の事実誤りとモデルカードの不整合は [#620](https://github.com/jphacks/kz_2613/issues/620) で管理し、遅くとも公開 Go 判断前に作者（`YOSHI0209`）による HF 更新と `pin_v2.py` 再固定で訂正する。
  - 次回のモデル書き出し時には、`text_encoder.rs`（242〜247 行目）が `max_length=48` を自前切り詰めしている点を踏まえ、**元モデル（Apache-2.0）の `tokenizer.json`（9,081,518 バイト）を無改変で直接同梱する案**を第一候補とし、`parity.json` 全ケースで「トークン ID 列・特殊トークン・長い文の切り詰め・ベクトル・分担結果」の等価性を検証する（不成立なら現行方式を維持）。

### 3. 操作抽出・キー名正規化の重複（[#619](https://github.com/jphacks/kz_2613/issues/619)）

- **確認した実測（全実装のキー表記和集合＋数字英単語での照合）**：別キーへの誤変換は 0 件、差はすべて取りこぼし（`engines.mjs` 21 件、`extract.mjs` 22 件、`build_dataset.py` 35 件）。逆に `lbracket`・`rbracket` は Python のみ変換し Rust は未対応（実ゲームでの出所未確認のため要調査）。`extract.mjs` の Rewired 非対応（Python 側で補完）と `configPairs`（下書き専用）は意図的な設計差である。
- **方針**：
  - 全面的な Rust 単一ソース化は **P3** を維持し、**差異検出試験を P2 として先行**させる。
  - 共通 fixture（文脈別期待値と `knownGaps`）を `apps/host-rs` 配下に置き、Rust は `include_str!` で実コードを実行、JS・Python も実コードで照合する（`host-rs` CI へ Node/Python 依存を追加しない）。Rust を無条件に正解扱いせず、意図的な仕様差と不整合を区別し、件数そのものを目標にしない。
  - 学習データへの実害量は、`scripts/preset-model/data/` と元資料を持つメンバーが再抽出比較して確認する。
  - **着手・再学習条件**：全面統合は「次回モデル再学習前」または「新規エンジンパーサー追加前」を着手条件とする。Python の 35 件すべての一括修正は再学習の前提にせず、①実データに出現する不整合が 0 件、②`knownGaps` へ新規不整合が増えていないこと、の 2 点を再学習条件とする。

### 4. ライセンス・コード署名（[release-readiness.md](../acceptance/release-readiness.md)）

- 事実誤り訂正（#620）と権利者・チーム判断事項を明確に分離した。ファイル単位のライセンス整理表、6 区分、コード署名（Azure Artifact Signing・OV・EV）の最新調査結果は [release-readiness.md](../acceptance/release-readiness.md) §2.1 に集約し、チームの Go/No-Go 判断材料として管理する。

### 5. その他既存 Issue との整合（変更なし）

- **#451（WebRTC 未 ACK バンドル）**：#457 で実装済み（`protocolVersion = 6`）。残件は実指・実 Wi-Fi の比較検証。
- **#617（`hub.rs` 責務分離）・#272（型契約）**：単一 `hub` スレッド設計は維持し、テスト（2,618 行）分離と分担 AI 非同期ジョブの切り出しから段階実施する。送信の型付き化（#272）は #617 の分割と連動させる方針で整合済み。
- **#278（CSS 整理）・#618（資料の最新化）**：既存 Issue のスコープで継続する。

## 今回見送った提案一覧

| 見送り項目 | 理由 |
|:--|:--|
| `str0m`・`webrtc-rs` 等への即時移行 | 実機（iPhone Safari・Android Chrome）再検証コストが大きく、現行インストーラーで VC++ ランタイム不足に対処できているため（上記 3 条件で再検討） |
| トークナイザーの語彙削減 | 分割結果が変化しモデル精度の再検証が必要になるため |
| `tokenizer.json` の単独 minify | 圧縮後ダウンロード差が ZIP 0.47 MB・NSIS 0.12 MB と小さく、単独で HF 更新・`pin_v2.py` 再固定を行う費用に見合わないため |
| ONNX Runtime（`ort`）・`tract` への推論基盤移行 | 現行の純 Rust 推論（`text_encoder.rs` 本番 397 行・14 操作約 80 ms）が安定稼働しており、`ort` は 40〜100 MB 級 DLL と C++ 依存を増やすため |
| テストコード（`.mjs`）の一括 TypeScript 化 | すでに Node の type stripping で製品 `.ts` を直接検証できており、リポジトリルートに `node_modules` を持たない利点を損なうため |
| Tailwind CSS 等の CSS フレームワーク導入 | 実測座標ベースの PC 画面・独自ゲーム UI・個人レイアウト編集には通常 CSS が適合しているため（構造整理は #278 で対応） |
| Python の 35 件一括修正を再学習条件にすること | 実学習データに出現しないキー表記の修正を必須にする合理性がなく、実データ上の不整合 0 件と `knownGaps` 増加防止で十分であるため |

## 関連資料

- [技術構成の検証記録](tech-stack.md)
- [一般向けリリースの判定チェックリスト](../acceptance/release-readiness.md)
- [分担AI仕様書](../../preset-model-specification.md)
- [ホスト仕様書](../../host-specification.md)
