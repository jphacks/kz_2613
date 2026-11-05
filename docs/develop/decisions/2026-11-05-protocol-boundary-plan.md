# 型付きメッセージ境界の監査と試験設計（#179）

## 対象と未実装の範囲

main `b3c0e88` の `hub.rs` / `main.rs` / `rtc.rs`、Webのcontroller / transport、[通信仕様](../../protocol-specification.md)と#169/#176の回帰試験を照合した。ワイヤ形式はprotocolVersion=4のJSONのまま。今回は受信解釈の棚卸しとデコード試験設計で、型付き境界の製品実装はまだ行わない。

## 受信境界と意味を保持する項目

| 段階・種類 | 現行の扱いと抽出時の責任 |
|---|---|
| JSON構文/WS Origin | mainがOrigin/Hostを検証し、生TextをEvent::WsTextでHubへ渡す。JSONパースはHubのon_event。RTCもrtc_owner確認後にHubでパースする。接続のloopback/role/current connはHubが管理し、JSON内の自己申告で認可しない |
| hello | Unknown接続のみ。protocolVersionはas_u64で4、clientIdは文字列を64文字へ制限・空は拒否、uaは200文字、既存枠はサーバー発行tokenと照合。nextIseqはnumから整数へ変換し1未満を既定1へ |
| monitor | Unknownかつloopbackのみ。pageはapp/game、それ以外はhostへ。認証済み接続の再識別は4007で閉じる |
| input | numのiseqで重複・欠番待機を共通処理し、連番順にprocess_inputへ。旧epochは番号を消費してstale ACKのみ。button/state/burstの解釈と実操作の権限は別 |
| look | 現epoch、増加lseqのみ。cx/cyの差分を累積基準から算出し、欠番回復。担当外ではOS出力しない。順序検証と役割認可を一つのデコード関数へ混ぜない |
| command | WSのみ。PREPARE/READY/RESUME/OPEN_GAMEは現epoch、PAUSE/ENDは停止優先。P1限定はドメイン側。未知cmdは現行結果/理由を保持 |
| release_inputs / role_ok / remote | WS・現epoch。release_inputsは全参加者の全解放・視点破棄・epoch更新。role_okは本人のみ。remoteはP1・非coop・増加rseq・有限移動量を上限付きで扱う |
| ping / ka / RTC信号 | pong/kpongの時刻返却、統計、接続準備を維持。RTCは有効接続世代と所有Peerを確認後に共通処理へ渡す。WS限定操作をRTC経由で認可しない |
| PC管理 | inject_mode/focus/prepare/open_game/select_game/launch_game/swap_roles/confirm_lineup/unconfirm_lineup/refresh_games/add_game/rename_game/remove_game/observe/auto_resume/phase/reset。monitor認可後の列挙型候補で、ドメイン条件やOS実行をパーサーへ移さない |
| Web受信 | welcome/game/command_result/pong/ack/full/errorとRTC信号。現Socketの確認が先。token保存・入力失効・表示・RTTを別責任として保つ |

## 厳密化で無断変更しやすい現行挙動

Rustの `s` は文字列のみ、`num` はJSON数値だけでなくtrimした文字列のf64パースも受け付ける。iseq/lseqはf64からi64へ変換されるため、小数文字列を単に整数型デコードへ変えると現行の受理範囲が変わる。epoch/protocolVersionはas_u64で別扱いである。

- inputのstateはdownだけが押下、それ以外は解放として扱う。欠落・未知stateを一律エラーに変えるのも挙動変更になる。
- confirm_lineupのmembersは配列の文字列だけをfilter_mapで集める。不正要素を一つ含む配列全体を拒否する設計は互換差となる。
- auto_resumeのon欠落/不正型はfalse、focusのfocused欠落/不正型もfalse。monitor.pageの未知値はhost。未知typeは各境界で無視する。
- numは有限性を共通では確認しない。文字列のNaN/Infinityや非常に大きい値が視点の基準/量へ到達し得ることはコード上の懸念であり、実ゲームの不具合としては未実証。remoteのdx/dyは別途is_finiteとclampがある。
- WebのcontrollerはJSON.parseと各フィールド参照が中心で、壊れたgame等を独立デコーダーで一律安全無視する境界は未整備。transportのRTCフレームはtry/catchと旧channel確認がある。

新しいstrict decodeで有効入力と不正入力の境界を都合よく再定義しない。まず現行受理値/副作用を再現し、安全上拒否すべき差は根拠と互換影響を示す小さい挙動修正として分離する。上記を「正常仕様」と追認したものでもない。

## デコード部品と試験マトリクス

Rustは接続種別ごとの `PlayerMessage` / `MonitorMessage` 等へ段階的に変換する候補とする。型変換の結果は値・無視・構文エラー等を区別し、送信先のrole・current conn・epoch・iseqバッファ・RTC世代はドメイン側で維持する。Webは受信メッセージの安全な形の確認を独立関数へ寄せ、#178の接続世代と状態更新へ渡す。専用ジェネレーターや新依存は前提にしない。

| 入力群 | 比較する値・状態 |
|---|---|
| 型/構造 | null、配列、空object、type欠落/数値/未知、必須欠落、余分なフィールド、深い/長い値、空/長い文字列 |
| 数値 | 整数、0、負、小数、数値文字列、空白、null/boolean、NaN/Infinity文字列、範囲外・極大値。iseq/lseqとepoch/rseqの差も確認 |
| 認証 | 旧版/版なし、token不一致、再hello、認証前の管理命令、非loopback monitor、旧WS/RTC世代 |
| 順序 | WS→RTC/RTC→WS重複、逆順・欠番・後着解消、旧epochの番号消費、視点累積基準非巻戻し、再接続nextIseq |
| 管理 | 不正members要素、未知page/mode/phase、focused/on不正型、自己申告slot/host、観測eventsの単体/配列 |
| Web | 壊れたJSON、game欠落/null/型違い、旧Socketの受信、非同期Blobの旧channel完了、欠落ACK/RTT、エラー後の入力失効 |

デコード単体だけでなく、同じ生JSONを分離前後へ渡してACK・closeコード・認可・epoch・保持/視点・通知/ログを比較する契約試験を残す。NaN等はJSONが直接表現できないため、文字列と不正JSONを混同しない。

## 保留理由と再開条件

先行#173の状態/認可境界は未実装、#178のWeb状態分離も作業中である。ここでHubとcontrollerの受信処理を同時に変更すると、上記の現行寛容値とセッション副作用を一度に変え、親Stackのレビューを困難にする。Rust列は#172まで、Web列は#178までを区切り、本Issueは監査・試験設計までとする。

再開は、#173と#178の境界・親headが確定し、先行PRのレビュー/統合によりStackが短くなった時点。まずRust一種類またはWeb一種類の受信だけを小PRで移し、既存回帰と不正値対照を通す。通信v5・一般的なスキーマ共有・不正値の新しい扱いは独断で採用しない。実Peer/無線/実入力の受入を自動試験で代替しない。検証は[BUILD_LOG.md](../handoff/BUILD_LOG.md)へ記録する。
