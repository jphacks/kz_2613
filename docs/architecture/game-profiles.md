# ゲームの操作定義（game profiles）

ゲームごとの操作の一覧・グループ・種類・初期キー・分担の案を、`apps/game-profiles/*.json` に持つ（#97）。人が確認した定義を主な情報源とし、ユーザーがゲーム内で変えたキーは、起動前に各ゲームの設定ファイルから読み直して重ねる（#99）。定義のないゲームは、ゲームのファイルから下書きを作る（#100、`scripts/profiles/extract.mjs`）。主要500タイトルの定義は #98。

- ホストは起動時にフォルダ内の定義をすべて読み、形式を検証する。不正なものは理由をログ（`profiles`）に残して使わない。Minecraftの定義はホストにも同梱し、フォルダがなくても動く。
- フォルダは `RECOOPLAY_ROOT/apps/game-profiles`（`RECOOPLAY_PROFILES_DIR` で変更可）。配布用zipにも同梱する。
- ゲームのコードは実行しない。設定ファイルは読むだけで書き換えない。

## 形式（schema 1）

```json
{
  "schema": 1,
  "id": "minecraft-java",
  "name": "Minecraft: Java Edition",
  "match": { "ids": ["minecraft-java"], "steamAppIds": [], "processes": ["javaw.exe"], "titleContains": "Minecraft" },
  "suitability": "good",
  "userBindings": { "reader": "minecraft-options", "path": "%APPDATA%/.minecraft/options.txt" },
  "groups": [
    { "id": "movement", "label": "移動", "role": "P1", "split": [ { "id": "left", "label": "左", "actions": ["sprint"] } ] }
  ],
  "actions": [
    { "id": "sprint", "label": "ダッシュ", "group": "movement", "type": "button", "default": "LCTRL", "bind": "key.sprint", "control": "SPRINT" }
  ],
  "verification": { "status": "device", "date": "2026-10-25", "gameVersion": "26.3", "sources": ["実機"] }
}
```

| 項目 | 内容 |
|---|---|
| `id` | 定義のID。ゲームの選択・検出（#54の `steam:<AppID>` 等）と `match` で結び付ける |
| `match.ids` / `match.steamAppIds` | このゲームを指すID・Steam AppID |
| `match.processes` / `match.titleContains` | 入力先のウィンドウの判定に使う予定の値（#19と同じ考え方） |
| `suitability` | 分担に向くか：`good` / `limited` / `unsuitable`（マウスだけ・ターン制等）/ `unknown` |
| `userBindings.reader` | ユーザーの設定の読み方：`minecraft-options`・`terraria-input-profiles`・`es3-keybindings`（Unity＋Easy Save）・`unity-inputsystem-json`（SaveBindingOverridesAsJson）・`ue-input-ini`（Unreal Engine 4）・`source-cfg`・`none` |
| `userBindings.path` | 設定ファイルの場所。`%APPDATA%`・`%LOCALAPPDATA%`・`%USERPROFILE%`・`%LOCALLOW%`・`%DOCUMENTS%`（OneDriveへ移した場合も含む）を使える |
| `groups[].role` | 分担の案：`P1`・`P2`・`P3`・`host`（メニュー＝ホストのリモコン）・`none`（分担しない） |
| `groups[].split` | 担当が3人分に足りないときに分ける単位（下記） |
| `actions[].type` | `button`・`axis2d`・`mouseDelta`（視点）・`wheel`・`text` |
| `actions[].default` | 初期キー（`apps/host-rs/src/controls.rs` の出力ID：`KEY_W`・`SPACE`・`LSHIFT`・`MOUSE_L` 等） |
| `actions[].bind` | 設定ファイル上の名前（`key.sprint`・`Jump`・`+forward`・`15`・`0/up` 等）。ユーザーのキーで上書きする目印 |
| `actions[].control` | 今のスマホの操作画面の操作名（`FWD`・`SPRINT` 等）。結び付く操作だけ |
| `verification.status` | `unverified`（未検証）・`template`（ジャンルの型からの仮）・`extracted`（自動抽出）・`reviewed`（人が確認）・`device`（実機で確認）。実機で確かめていない定義を「確認済み」と表示しない |

## 操作のまとめ方（ユーザー判断、2026-10-25）

- 同じ系統の操作（移動の前後左右、ホットバーの1〜9など）は、1つのグループにまとめ、まとめて1人に割り当てる。
- 担当の付くグループが人数に足りないとき（操作がほぼ移動だけのゲームなど）は、`split` のあるグループを部分（例：「左」「右」「ジャンプ」）に分けて配る。

## 参加人数に応じた割り振り（#105）

ホストは `profiles::assignment_for(定義, 人数)` で、1〜4人の分担の案を作る。

1. 担当の付くグループ（`role` が P1〜P3）を、定義の順（＝優先度：移動・視点・攻撃・持ち物…）に1つの単位とする。メニュー（`host`）はP1（ホスト）のリモコンのまま、会話等（`none`）は分担しない。
2. 単位が人数より少なければ、`split` のあるグループを重い順に部分へ分ける。それでも足りなければ、重い単位を半分に分ける。
3. 優先度の高い単位から1人ずつ配り、残りは負担が最も軽い人へ配る。負担は操作の重み（`actions[].weight`。省略時は視点・2軸＝3、ボタン＝1、ホイール＝0.5）の合計。

例：Minecraftは3人で「移動／視点／攻撃＋持ち物」、2人で「移動／視点＋攻撃＋持ち物」。プラットフォーマーの型は3人で「左（＋アクション）／右／ジャンプ・上下」。

- 分担はReadyと再開（RESUME）のときに、そのときの参加人数で決める（`game.assigned`）。協力プレイ中に人数が変わっても組み直さない（切断は一時停止になり、再開＝ホストの確認のときに組み直す）。
- 画面には、今の参加人数での案（`game.profile.assignment`）と、1〜4人の案（`game.profile.assignments`）を配る。
- 今は枠が3つ（P1〜P3）で、開始には3人が必要（#90・#91）。4人の案は表示のみで、4人目の参加は未対応。

## 操作定義から作る操作画面（#60）

- Minecraft以外で定義と分担があるゲームでは、スマホに、その人に割り当てた操作だけの画面を作る（`apps/web-static/scripts/generated-controls.js`）。方向の操作は十字に、ほかはボタン、ホイールは前後のボタン、視点はドラッグのパッドにする。ボタンにはゲームのキー設定に合わせた実際のキーを出す。
- ボタンは `input` の `button` に `act:<操作ID>`（ホイールは `act:<操作ID>:up|down`）を送る。ホストは協力プレイ中、その枠に割り当てた操作だけを、ゲームのキー設定に合わせたキーとして送る。視点（`look`）も、視点を割り当てた枠だけ受け付ける（分担がなければ従来どおりP2）。
- Minecraftは、実機で確かめた専用の画面のまま。

## ユーザーの設定の重ね方（#99）

- 読み直すタイミング：起動時・ゲームの選択・準備（PREPARE）・Ready・再開（RESUME）。協力プレイ中以外は、設定ファイルの更新日時が変わっていたら読み直す（ゲームによっては終了時にしか書き出さないため、遊んでいる途中の変更は次の起動まで反映されないことがある）。
- 送れないキー（マウスの中ボタン・テンキー等）や未設定の操作は、初期のキーで代用すると別の操作が動くため送らずに警告する。2つの操作が同じキーなら警告する。読めない・見つからないときは初期キーで送り、その旨を表示する（`game.keys`）。
- Minecraftの `options.txt` の場所は、`config.json` の `minecraftOptions`（または `RECOOPLAY_MINECRAFT_OPTIONS`）で上書きできる（CurseForge・Prism等のランチャー用）。

## 実装の適用範囲と検証の区別

- Minecraftのdevice記録は過去の作者による実機観測を参照したもの。このJSON読込経路と変更後の入力を新たに実機検証した意味ではない。
- assignmentは提案メタデータで、任意のゲームの操作画面生成は#60の対象。template・extracted・unverified、または固定画面と認可に結び付かない定義はReadyを拒否し、警告を表示する。検出・起動は可能でも協力操作の互換性を保証しない。
- Unrealでは配列の追加・削除・クリア・置換を順序どおり処理する。修飾キー付きの組合せは未対応として送信しない。読み取るのは指定された単一ファイルで、エンジンの設定階層全体の再現は未対応。
- Sourceではキー単位の再bind・unbind・unbindallを反映する。実行時のexecやaliasによる変更の評価は行わない。
- 自動抽出は静的データの下書き作成。ゲームのコードを実行せず、実機互換性の合格にはしない。上書き設定の複合バインドやゲーム固有の設定階層は実ゲームで追加検証が必要。
