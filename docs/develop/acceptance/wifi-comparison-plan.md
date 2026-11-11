# 同一Wi-Fiの性能比較を計画する

比較ごとに新しいローカルフォルダーを作り、条件JSONと生成した試行計画を保存する。従来の試行データは元の保存先に残す。

以下は通信方式を比べる条件JSONの例。資産のSHAは実際にビルドしたコミットに差し替える。

```json
{
  "axis": "transport",
  "baseline": {"assets": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "transport": "rtc-ws", "ackObserver": false},
  "candidate": {"assets": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "transport": "ws-only", "ackObserver": false}
}
```

`node scripts/device/wifi-comparison-plan.mjs <比較条件JSON>` の標準出力を新しい試行計画ファイルへ保存する。試行順は A→B、B→A、A→B の3組。旧版と新版、修正前と修正後は `assets`、先行ACK診断の負荷比較は `ackObserver` を比較軸とする。資産を比較するときは、同一ホストexeで両方を動かせる組み合わせを使う。

各試行は `node scripts/device/android-dry-run.mjs` に、共通の `--bin`、`--sha256`、`--wifi-network`、資産SHAに対応する `--root` と、試行の `args` を渡す。端末、Chrome、PC、無線構成、端末の位置、操作パターンを固定し、電波状態と試行開始時刻、出力されたレポートへの対応をローカルに記録する。経路判定は既存runnerのHTTP・WS・RTC検証を使う。生の経路ファイルはローカルに保管する。

通常系列ではホスト入力トレースとRTC使用時の5秒間隔のICE観測を収集する。先行ACK系列との比較で変わるのは先行ACKの追加だけ。

定期ICE観測の負荷を比べるには比較軸を `periodicIce` とし、同じ資産・`rtc-ws`・`ackObserver: false` で、一方の `periodicIce` を `true`、もう一方を `false` にする。計画は後者に `--no-periodic-ice` を付ける。レポートの `periodicIce` が指定と一致することを確認する。5秒間隔の観測だけを止め、既存のHTTP・WSと明示的な選択ICE候補対の照合点は維持する。

ホスト入力トレースの負荷を比べるには比較軸を `hostTrace` とし、他の条件を揃えて、一方の `hostTrace` を `true`、もう一方を `false` にする。計画は後者に `--no-host-trace` を付ける。レポートの `hostTrace` が指定と一致することを確認する。トレースなしでも端末側のACK往復、経路照合、定期ICEの設定は維持する。ホスト内の受信→受理・受理→dry出力はトレースありの試行でのみ取得できる。

実測と新しいデータセットの集計・匿名化は #276 の残作業。従来の集計器はホスト入力トレースと、RTC使用時の定期ICE履歴がある系列に使う。
