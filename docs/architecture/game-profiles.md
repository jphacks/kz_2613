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
    { "id": "movement", "label": "移動", "role": "P1", "split": [ { "id": "left", "label": "左", "actions": ["left"] } ] }
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
- 担当の付くグループが3人分（P1〜P3）に足りないとき（操作がほぼ移動だけのゲームなど）は、`split` のあるグループを部分（例：「左」「右」「ジャンプ」）に分け、担当の少ない順に配る。ホストは `profiles::assignment` でこの案を作り、`game.profile.assignment` として配る。

## ユーザーの設定の重ね方（#99）

- 読み直すタイミング：起動時・ゲームの選択・準備（PREPARE）・Ready・再開（RESUME）。協力プレイ中以外は、設定ファイルの更新日時が変わっていたら読み直す（ゲームによっては終了時にしか書き出さないため、遊んでいる途中の変更は次の起動まで反映されないことがある）。
- 送れないキー（マウスの中ボタン・テンキー等）や未設定の操作は、初期のキーで代用すると別の操作が動くため送らずに警告する。2つの操作が同じキーなら警告する。読めない・見つからないときは初期キーで送り、その旨を表示する（`game.keys`）。
- Minecraftの `options.txt` の場所は、`config.json` の `minecraftOptions`（または `RECOOPLAY_MINECRAFT_OPTIONS`）で上書きできる（CurseForge・Prism等のランチャー用）。
