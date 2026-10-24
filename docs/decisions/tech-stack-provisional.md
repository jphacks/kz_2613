# 仮の技術構成 — 選定理由と代替案

**すべて仮決定。** 選定基準は、①再現可能なMinecraftの一連のデモ、②UIの自由度、③開発速度と導入リスクの低さ。実機検証ゲートが通るまでは検証済みと呼ばない。

| 領域 | 仮の選定 | 理由 | 制約・代替案 |
|---|---|---|---|
| Windows入力 | Python `ctypes` からWin32 `SendInput` | 標準Windows API。Screactには特権ドライバーなしの絶対座標移動・左クリックの実例があり、Pythonでも同じAPIを呼べる | Minecraft Javaの相対視点・キー入力は未検証。ドライバーを分離し、不成立なら版や入力方式を見直す |
| ホスト実行環境 | Python **3.12** | API・セッション・入力・テストを同じ言語で扱える | C#/.NETもWindows向けの代替だが、バックエンド技術の切替が必要 |
| ホストAPI | FastAPI＋Uvicorn、**単一ワーカー** | 静的画面と3台のWebSocketを扱い、メモリー内状態で足りる | 実ゲームでは複数ワーカーや自動再読み込みを使わない。プロセスごとに状態が分離するため |
| 通信 | ローカルHTTP＋JSON WebSocket | 双方向APIが単純でブラウザから利用できる | 外部中継・クラウドは使わない。LANポート公開時も全操作を認可する |
| ネットワーク | Windowsモバイルホットスポット | Android・iPhoneの標準Wi-Fiでローカル接続できる | 上流回線なしの起動可否を実機確認。代替はローカルAP・ルーター、次にWi-Fi Direct Legacy AP |
| スマホUI | React＋TypeScript＋Vite | ブラウザ間でUIを共有でき、配布先にNode.js不要の静的ビルドを作れる | ネイティブiOS/Androidアプリは不要。Safariの長押し・複数指操作を試験する |
| スタイル | Tailwind CSS＋独自CSS | 操作部品の配置を自由に調整できる | `touch-action: none`、安全領域、操作領域は独自CSSで扱う |
| PC画面 | pywebview / WebView2 | ReactのPC画面を軽量なPython画面枠で再利用できる | pywebviewはメインスレッド、APIはバックグラウンドで動かす。失敗時はlocalhostブラウザ |
| セッション | 単一Pythonプロセスのメモリー内状態 | 1ホスト・3端末ではDB不要で運用が単純 | 再起動でリセットする。トークンと保持キーは永続化しない |
| プロファイル・設定 | ローカルJSON（ひな形では未実装） | 外部DBなしで固定Minecraft割当を編集できる | スキーマを検証し、書き込み先を制限する |
| QR | Python `qrcode` | 接続URLのQRをオフライン生成できる | Wi-Fi参加QRとセッション参加QRは端末によって別手順 |
| 配布 | PyInstaller **onedir** | onefileより同梱ファイルや依存漏れを調査しやすい | WebView2の有無を確認する。配布が難しければデモはvenvで実行する |
| バックエンド検証 | pytest、FastAPI TestClient、ruff | 状態やドメインの決定的なテストを書きやすい | 実入力はWindows実機で別途試験する |
| Web検証 | Vitest＋TypeScript | タッチ処理やUIロジックをローカルで確認できる | Android・iPhone・3台同時の手動試験も必要 |
| 開発環境 | `venv`、`pip`、`npm`、ロックファイル | PythonとJSのビルドを分け、実行時は同梱資産のみ使用する | 初回の一連の検証成功後にフロントのlockと実解決バージョンを記録する |
| ログ | `logging`、ローカルのローテーションログ | 外部へデータを送らず接続・状態を調査できる | トークン・IP・個人情報は記録しない |

## MVPで採用しない候補

- Electron/Node：PCのUIは柔軟だが、Windows入力用のネイティブ連携と別の実行環境が必要。
- Flutter＋C++：Screactの知見は使えるが、ブラウザ操作画面とは別のネイティブ層が必要。
- Tauri/Rust：実現可能だが、同じWindows連携リスクに対してRustが追加される。
- `PyDirectInput`：同じWin32 SendInput系であり、ゲームが合成入力を拒否した場合の独立した代替ではない。
- PyAutoGUI：ポインター操作は簡単だが、ゲーム入力の第一候補にはしない。
- ViGEm・仮想ゲームパッド・HID：Minecraft JavaのP0は汎用コントローラー入力を前提にしない。ドライバー導入のリスクも増える。
- Next.js・Redis・SQLite・外部アカウント・クラウド：単一セッションと静的ブラウザ画面には不要。
- CDN・PWAのセンサー要件：まずオフラインのローカルHTTPを優先する。端末の動きの取得には安全な通信環境が必要な場合があり、P0では扱わない。

## スレッド・フォーカス・安全性

- pywebviewはメインスレッド、Uvicornはバックグラウンドのループ・スレッドで実行する。サーバー状態の変更は**1つ**のイベントループかキューへ集約する。
- `SendInput` の送信先は指定HWNDではなく前面ウィンドウ。想定ゲームのフォーカスを確認し、喪失時は保持入力を解放する。予測できない強制切替を行わない。
- WebSocketの接続時に役割・セッションを認可し、クライアントのP1・ホスト・状態の自己申告を信用しない。
- `pointercancel`、ページ非表示、古いセッション、通信タイムアウト、`release_all` に対応する。表示更新より入力解放を優先する。

## 参考資料

- [ScreactのWindows入力実装](https://github.com/KIT-DevelopersHub/screact/blob/main/desktop/windows/runner/desktop_input_controller.cpp)：絶対座標・左クリックの例で、ゲーム視点の動作証拠ではない。
- [MicrosoftのSendInput資料](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput)
- [FastAPIのWebSocket資料](https://fastapi.tiangolo.com/advanced/websockets/)
- [CodexのAGENTS資料](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [ClaudeのCLAUDE.md資料](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts)
