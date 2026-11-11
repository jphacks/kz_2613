# Wi-Fiの観測負荷を集計する

[試行計画](wifi-comparison-plan.md)で定期ICE観測、ホスト入力トレース、先行ACK観測のいずれかの比較を作る。各条件3回の試行を順に実施し、各試行の `summary.json` と `network.private.json` を同じフォルダーに残す。集計時に使う6件のsummaryは計画の順で指定する。

```powershell
node scripts/device/summarize-wifi-overhead.mjs $plan $trial1 $trial2 $trial3 $trial4 $trial5 $trial6
```

出力は3組の試行のJSON。端末内ACK往復、先行ACKまで、先行ACKから従来の観測まで、ホスト受信から受理、受理からdry出力、経路照合点のICE RTTを別々に出す。取得できない指標は `null`。条件間の差は端末内ACK往復だけを算出する。集計にはLANアドレス、パス、時刻の生データを出さない。入力の生記録はローカルに保管し、既存の測定データを上書きしない。

端末・PC・APが同一であること、位置と電波状態は操作者が記録する。ツールは記録された実行順、端末条件、資産、runner、経路、操作回数を照合する。実Wi-Fiでの負荷測定は #276 で追跡する。
