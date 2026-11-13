// Re:Cooplay PC ホスト (Rust 版)
// PC(モバイルホットスポット親機) 上で HTTP + WebSocket + WebRTC を配信し、スマホ3台の入力を受けて
// Windows のキーボード / マウス入力として注入する。インターネットは一切使わない（外部CDNも読まない）。
// スマホ / PC の画面 (public/) とメッセージ形式は Node 版と共通。

mod config;
mod controls;
mod focus;
mod freshness;
mod game_service;
mod games;
mod hotkey;
mod hub;
mod input;
mod input_manager;
mod input_trace;
mod key_overrides;
mod keybinds;
#[cfg(feature = "latency-measure")]
mod latency;
mod launchers;
mod look;
mod netinfo;
mod netwatch;
mod profiles;
mod protocol;
mod rtc;
mod runtime_measure;
mod session;

use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::config::Config;
use crate::hub::{Event, Hub, Out};

const WEB_DIR: &str = "apps/web/dist";

#[derive(Clone)]
struct App {
    hub: Arc<Mutex<Sender<Event>>>,
    next_id: Arc<AtomicU64>,
    public_dir: Arc<PathBuf>,
    build: Arc<serde_json::Value>,
    port: u16,
    wifi: Arc<Option<(String, String)>>,
    images: games::Images,
}

impl App {
    fn send(&self, ev: Event) {
        if let Ok(tx) = self.hub.lock() {
            let _ = tx.send(ev);
        }
    }
}

/// 画面 (apps/web/dist/) のある場所 (= リポジトリのルート) を探す。RECOOPLAY_ROOT で指定も可
fn find_root() -> PathBuf {
    if let Ok(r) = std::env::var("RECOOPLAY_ROOT") {
        return PathBuf::from(r);
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut candidates = vec![cwd.clone(), cwd.join(".."), cwd.join("../..")];
    if let Ok(exe) = std::env::current_exe() {
        candidates.extend(exe.ancestors().skip(1).take(4).map(Path::to_path_buf));
    }
    candidates
        .into_iter()
        .find(|p| p.join(WEB_DIR).join("phone/index.html").is_file())
        .unwrap_or(cwd)
}

fn is_loopback(addr: &SocketAddr) -> bool {
    match addr.ip() {
        std::net::IpAddr::V4(v4) => v4.is_loopback(),
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback() || v6.to_ipv4_mapped().is_some_and(|v| v.is_loopback())
        }
    }
}

fn client_ip(addr: &SocketAddr) -> String {
    match addr.ip() {
        std::net::IpAddr::V6(v6) => v6
            .to_ipv4_mapped()
            .map(|v| v.to_string())
            .unwrap_or_else(|| v6.to_string()),
        ip => ip.to_string(),
    }
}

#[tokio::main]
async fn main() {
    let root = find_root();
    let config = Config::load(&root);
    let port = config.port;
    let input = input::Input::new();

    let (tx, rx) = std::sync::mpsc::channel::<Event>();
    let log_dir = std::env::var("RECOOPLAY_LOG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root.join("logs"));
    runtime_measure::init(&log_dir);
    input_trace::init(&log_dir);
    let mut hub = match Hub::new(tx.clone(), &config, input, &log_dir) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("ログを作成できません: {e}");
            std::process::exit(1);
        }
    };

    let bind_ip = if runtime_measure::enabled() {
        "127.0.0.1"
    } else {
        "0.0.0.0"
    };
    let listener = match tokio::net::TcpListener::bind((bind_ip, port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("ポート {port} で待ち受けできません: {e}");
            std::process::exit(1);
        }
    };
    let port = if runtime_measure::enabled() {
        listener
            .local_addr()
            .expect("bind済みの計測用アドレス")
            .port()
    } else {
        port
    };

    println!("\nRe:Cooplay ホスト (Rust) 起動 (port {port})");
    println!("  PC アプリ画面     : http://localhost:{port}/app");
    println!("  PC ダッシュボード : http://localhost:{port}/host  (診断用)");
    println!("  PC 疑似ゲーム画面 : http://localhost:{port}/game");
    let addrs = netinfo::addresses();
    for a in &addrs {
        let hs = if a.hotspot {
            ", ホットスポット"
        } else {
            ""
        };
        println!(
            "  スマホ用 URL      : http://{}:{}/  ({}{})",
            a.address, port, a.name, hs
        );
    }
    if !addrs.iter().any(|a| a.hotspot) {
        println!("  ※ 192.168.137.x が見つかりません。モバイルホットスポットが OFF の可能性があります（ON にした後はダッシュボードを再読込）");
    }

    // 緊急停止のホットキー (スマホ・ダッシュボードの通信に頼らない)
    let hotkey = hotkey::start(tx.clone());
    match &hotkey {
        Ok(()) => println!(
            "  緊急停止          : {} (全キーを離して注入を OFF)",
            hotkey::LABEL
        ),
        Err(e) => println!("  ※ 緊急停止 {} を登録できません: {e}", hotkey::LABEL),
    }
    println!();
    hub.set_hotkey_status(hotkey);

    let images = hub.images();
    // セッションの中枢は専用スレッド (視点の 4ms 刻みなどを非同期ランタイムに左右されずに回す)
    std::thread::Builder::new()
        .name("hub".into())
        .spawn(move || hub.run(rx, port))
        .expect("hub thread");

    let app = App {
        hub: Arc::new(Mutex::new(tx.clone())),
        next_id: Arc::new(AtomicU64::new(1)),
        public_dir: Arc::new(root.join(WEB_DIR)),
        build: Arc::new(build_info(&root)),
        port,
        wifi: Arc::new(config.wifi.clone()),
        images,
    };

    // デスクトップアプリ (apps/desktop) から起動された場合: 標準入力の "quit" か、親が終了して入力が閉じたら
    // 押しっぱなしのキーを離してから終了する (親が異常終了しても入力を残さない)
    if std::env::var("RECOOPLAY_STDIN_CONTROL").as_deref() == Ok("1") {
        let tx = tx.clone();
        std::thread::Builder::new()
            .name("stdin-control".into())
            .spawn(move || {
                for line in std::io::stdin().lines() {
                    match line.as_deref().map(str::trim) {
                        Ok("quit") | Err(_) => break,
                        Ok("stop") => {
                            let _ = tx.send(Event::EmergencyStop {
                                source: "app",
                                enqueued_at: runtime_measure::start(),
                            });
                        }
                        // 試験用 (RECOOPLAY_DRY_RUN=1 と RECOOPLAY_FAKE_TARGET のときだけ有効): 前面のウィンドウの判定を差し替える
                        Ok("target on") => {
                            let _ = tx.send(Event::FakeTarget(true));
                        }
                        Ok("target off") => {
                            let _ = tx.send(Event::FakeTarget(false));
                        }
                        Ok("activate on") => {
                            let _ = tx.send(Event::FakeActivate(true));
                        }
                        Ok("activate off") => {
                            let _ = tx.send(Event::FakeActivate(false));
                        }
                        // 試験用 (同上): PC アプリのウィンドウが前面になった・外れた
                        Ok("app focus") => {
                            let _ = tx.send(Event::FakeAppWindow(true));
                        }
                        Ok("app blur") => {
                            let _ = tx.send(Event::FakeAppWindow(false));
                        }
                        // 試験用 (同上): PC アプリ以外のウィンドウ (ランチャー等) が前面になった・外れた (#287、#405)
                        Ok("launcher focus") => {
                            let _ = tx.send(Event::FakeLauncher(true));
                        }
                        Ok("launcher blur") => {
                            let _ = tx.send(Event::FakeLauncher(false));
                        }
                        // 試験用: 既定の音の出力先が Bluetooth になった・外れた (#131。実機では定期的に調べる)
                        Ok("rotate")
                            if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") =>
                        {
                            let _ = tx.send(Event::FakeRotationDue);
                        }
                        Ok("bt on") if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") => {
                            let _ = tx.send(Event::BluetoothAudio(true));
                        }
                        Ok("bt off")
                            if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") =>
                        {
                            let _ = tx.send(Event::BluetoothAudio(false));
                        }
                        _ => {}
                    }
                }
                let _ = tx.send(Event::Shutdown);
            })
            .expect("stdin-control thread");
    }

    // コンソールのウィンドウを閉じた場合も押しっぱなしのキーを離してから終了する (Windows は数秒だけ待ってくれる)
    #[cfg(windows)]
    {
        let tx = tx.clone();
        tokio::spawn(async move {
            if let Ok(mut close) = tokio::signal::windows::ctrl_close() {
                if close.recv().await.is_some() {
                    let _ = tx.send(Event::Shutdown);
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        });
    }

    // Ctrl+C: 押しっぱなしのキーを離してから終了する
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            let _ = tx.send(Event::Shutdown);
        }
    });

    let router = Router::new()
        .route("/api/info", get(api_info))
        .route("/api/hotspot", axum::routing::post(api_hotspot))
        .route("/api/game-image", get(game_image))
        .route("/ws", get(ws_upgrade))
        .fallback(get(static_file))
        .with_state(app);
    if let Err(e) = axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    {
        eprintln!("サーバーエラー: {e}");
    }
}

/// 製品の版。配布物は package-manifest.json の版と commit、開発中はビルドの版を使う
fn build_info(root: &Path) -> serde_json::Value {
    let text = std::fs::read_to_string(root.join("package-manifest.json")).unwrap_or_default();
    parse_build_info(&text)
}

fn parse_build_info(manifest: &str) -> serde_json::Value {
    // PowerShell が書いた manifest は先頭に BOM がある
    let value = serde_json::from_str::<serde_json::Value>(manifest.trim_start_matches('\u{feff}'))
        .unwrap_or_default();
    let version = value
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or(env!("CARGO_PKG_VERSION"));
    let commit = value
        .get("commit")
        .and_then(|v| v.as_str())
        .map(|c| c.chars().take(7).collect::<String>());
    serde_json::json!({ "version": version, "commit": commit })
}

async fn api_info(State(app): State<App>, ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Response {
    // ホットスポットの設定の読み取りは時間がかかることがあるので、待ち受けのスレッドを止めない
    let loopback = is_loopback(&addr);
    let build = app.build.clone();
    let mut body = tokio::task::spawn_blocking(move || {
        let wifi = app
            .wifi
            .as_ref()
            .as_ref()
            .map(|(s, p)| (s.as_str(), p.as_str()));
        netinfo::info(app.port, wifi, loopback)
    })
    .await
    .unwrap_or_default();
    // 版は PC の画面にだけ返す (#216)
    if loopback {
        body["build"] = (*build).clone();
    }
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body.to_string(),
    )
        .into_response()
}

/// 一覧のタイルの画像 (#121)。PC 本体からだけ、検出した項目の ID で引く (場所は受け取らない)。
/// 画像はユーザーの PC にランチャーが保存しているもので、リポジトリ・ログには残さない
async fn game_image(
    State(app): State<App>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    if !is_loopback(&addr) {
        return (
            StatusCode::FORBIDDEN,
            "this image is only available on the PC",
        )
            .into_response();
    }
    let path = q
        .get("id")
        .and_then(|id| app.images.lock().ok().and_then(|m| m.get(id).cloned()));
    let Some(path) = path else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = match path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        _ => "image/jpeg",
    };
    match tokio::fs::read(&path).await {
        // 再検出で画像が変わっても古い画像を出さないよう、保存させない (画面は一覧が変わったときだけ読み直す)
        Ok(data) => (
            [
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, "no-store"),
            ],
            data,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// PC 画面の「ホットスポットを ON にする」(#133)。PC 本体の画面からだけ受け付ける
/// (ほかの Web ページからの要求を防ぐため、WebSocket と同じ Origin の確認をする)
async fn api_hotspot(
    State(app): State<App>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    if !is_loopback(&addr)
        || !allowed_ws_headers(&headers, app.port, true)
        || headers.get(header::ORIGIN).is_none()
    {
        return (StatusCode::FORBIDDEN, "only from the PC app").into_response();
    }
    let result = tokio::task::spawn_blocking(netinfo::start_hotspot)
        .await
        .unwrap_or_else(|_| Err("失敗しました".into()));
    let body = match result {
        Ok(()) => serde_json::json!({ "ok": true }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    };
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        body.to_string(),
    )
        .into_response()
}

async fn static_file(
    State(app): State<App>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    uri: Uri,
) -> Response {
    let path = match uri.path() {
        "/" => "/phone/index.html",
        "/app" => "/pc/index.html",
        "/overlay" => "/overlay/index.html",
        "/host" => "/diagnostics/index.html",
        "/game" => "/pseudo-game/index.html",
        p => p,
    };
    let rel = Path::new(path.trim_start_matches('/'));
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    // Windows の代替データストリーム (host.html::$DATA) は配信しない
    if path.contains(':') {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    let file = app.public_dir.join(rel);
    // 大文字・末尾のドット・短い名前など、表記が違っても同じファイルなら実体で判定する (#214)
    let Ok(root) = tokio::fs::canonicalize(app.public_dir.as_ref()).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(real) = tokio::fs::canonicalize(&file).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !real.starts_with(&root) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !is_loopback(&addr) && is_pc_only_page(&real, &root) {
        return (
            StatusCode::FORBIDDEN,
            "this page is only available on the PC",
        )
            .into_response();
    }
    let mime = match real.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    };
    // ファイル名にハッシュが付いたビルドの JS・CSS は、中身が変われば名前も変わるのでキャッシュさせる (#308)。
    // スマホが再接続・再読み込みのたびに読み直さずに済む。HTML・画像など名前の変わらないものは従来どおり保存させない
    let cache = if immutable_asset(path) {
        "public, max-age=31536000, immutable"
    } else {
        "no-store"
    };
    match tokio::fs::read(&real).await {
        Ok(data) => (
            [(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache)],
            data,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

/// Vite がビルドで出す、名前にハッシュ (8文字) の付いた JS・CSS か (/assets/<名前>-<ハッシュ>.js)。
/// ハッシュ自体に `-` や `_` が入ることがある (例: index-B-9_sktw.js) ので、末尾の 8 文字とその前の `-` で判定する
fn immutable_asset(path: &str) -> bool {
    let Some(name) = path.strip_prefix("/assets/") else {
        return false;
    };
    if name.contains('/') {
        return false;
    }
    let Some(stem) = name
        .strip_suffix(".js")
        .or_else(|| name.strip_suffix(".css"))
    else {
        return false;
    };
    let b = stem.as_bytes();
    b.len() >= 10
        && b[b.len() - 9] == b'-'
        && b[b.len() - 8..]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-')
}

// DNS再束縛と別Originからの管理操作を防ぐ。OriginなしはPC内の非ブラウザ検証クライアントに限る。
/// 解決済みの実体がPC専用画面フォルダの配下ならLANへ返さない。
fn is_pc_only_page(path: &Path, root: &Path) -> bool {
    let Some(name) = path
        .strip_prefix(root)
        .ok()
        .and_then(|p| p.components().next())
    else {
        return false;
    };
    let name = name.as_os_str().to_string_lossy().to_ascii_lowercase();
    matches!(
        name.as_str(),
        "pc" | "overlay" | "diagnostics" | "pseudo-game"
    )
}

fn allowed_ws_headers(headers: &HeaderMap, port: u16, loopback: bool) -> bool {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    let Ok(authority) = host.parse::<axum::http::uri::Authority>() else {
        return false;
    };
    let hostname = authority.host();
    if authority.port_u16().unwrap_or(80) != port
        || !(matches!(hostname, "localhost" | "127.0.0.1" | "[::1]")
            || netinfo::addresses().iter().any(|a| a.address == hostname))
    {
        return false;
    }
    match headers.get(header::ORIGIN) {
        None => loopback,
        Some(value) => value
            .to_str()
            .ok()
            .is_some_and(|origin| origin == format!("http://{host}")),
    }
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(app): State<App>,
    headers: HeaderMap,
) -> Response {
    if !allowed_ws_headers(&headers, app.port, is_loopback(&addr)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(move |socket| ws_session(socket, addr, app))
}

/// 1 回の送信を待つ上限。スマホの切断判定 (4 秒) と揃える (#197)
const WS_SEND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(4);

/// 1 本の WebSocket: 受信はハブへ、ハブからの送信はスマホ / PC 画面へ流す
async fn ws_session(mut socket: WebSocket, addr: SocketAddr, app: App) {
    let id = app.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    let queued = Arc::new(hub::SendQueue::default());
    app.send(Event::WsOpen {
        id,
        tx,
        queued: queued.clone(),
        ip: client_ip(&addr),
        loopback: is_loopback(&addr),
    });
    let mut code: u16 = 1006;
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => app.send(Event::WsText { id, text: text.to_string(), enqueued_at: runtime_measure::start().or_else(input_trace::start) }),
                Some(Ok(Message::Close(frame))) => {
                    code = frame.map(|f| f.code).unwrap_or(1005);
                    break;
                }
                Some(Ok(_)) => {}
                Some(Err(_)) | None => break,
            },
            outgoing = rx.recv() => match outgoing {
                Some(Out::Text(text)) => {
                    queued.len.fetch_sub(1, Ordering::Relaxed);
                    // 読取りが止まった接続は切断判定と同じ時間で打ち切る。送信待ちが上限に達した接続も切る (#197)
                    let sent = tokio::time::timeout(WS_SEND_TIMEOUT, send_ws_text(&mut socket, &rx, Message::Text(text.into()))).await;
                    if !matches!(sent, Ok(Ok(()))) || queued.must_close() {
                        break;
                    }
                }
                Some(Out::Close(c, reason)) => {
                    let close = socket.send(Message::Close(Some(CloseFrame { code: c, reason: reason.into() })));
                    let _ = tokio::time::timeout(WS_SEND_TIMEOUT, close).await;
                    code = c;
                    break;
                }
                Some(Out::Terminate) | None => break,
            },
        }
    }
    app.send(Event::WsClosed { id, code });
}

async fn send_ws_text(
    socket: &mut WebSocket,
    queue: &tokio::sync::mpsc::UnboundedReceiver<Out>,
    message: Message,
) -> Result<(), axum::Error> {
    let Some(start) = runtime_measure::start() else {
        return socket.send(message).await;
    };
    runtime_measure::sample("ws_queue_messages", queue.len() as u64);
    let send = socket.send(message);
    tokio::pin!(send);
    let interval = std::time::Duration::from_millis(20);
    let mut probe = tokio::time::interval_at(tokio::time::Instant::now() + interval, interval);
    probe.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            biased;
            result = &mut send => {
                runtime_measure::elapsed("ws_send_us", Some(start));
                return result;
            }
            _ = probe.tick() => {
                runtime_measure::elapsed("ws_send_pending_us", Some(start));
                runtime_measure::sample("ws_queue_while_sending_messages", queue.len() as u64);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_hashed_build_assets_are_cached() {
        // Vite がビルドで出す名前 (ハッシュ 8 文字) の JS・CSS だけ (#308)
        for p in [
            "/assets/phone-4qsUqWul.js",
            "/assets/jsx-runtime-DJz8YQL1.js",
            "/assets/preload-helper-B_9_sktw.js",
            "/assets/index-B-9_sktw.js",
            "/assets/phone-Bliy9y0a.css",
        ] {
            assert!(immutable_asset(p), "{p}");
        }
        // HTML・名前の変わらない画像・アイコン・階層の下・ハッシュでない名前は保存させない
        for p in [
            "/",
            "/phone/index.html",
            "/assets/logo.png",
            "/assets/phone-stars.svg",
            "/assets/characters/blue.png",
            "/assets/characters/x-12345678.js",
            "/assets/app.js",
            "/assets/-12345678.js",
            "/assets/phone-123.js",
            "/game/runtime-12345678.js",
        ] {
            assert!(!immutable_asset(p), "{p}");
        }
    }

    #[test]
    fn build_info_reads_the_manifest_with_bom_and_falls_back_to_the_build_version() {
        let info = parse_build_info("\u{feff}{\"version\":\"9.8.7\",\"commit\":\"abcdef0123456\"}");
        assert_eq!(
            (info["version"].as_str(), info["commit"].as_str()),
            (Some("9.8.7"), Some("abcdef0"))
        );
        let dev = parse_build_info("");
        assert_eq!(dev["version"].as_str(), Some(env!("CARGO_PKG_VERSION")));
        assert!(dev["commit"].is_null());
    }

    #[test]
    fn pc_page_policy_covers_entire_resolved_directories() {
        let root = Path::new("dist");
        for dir in ["pc", "PC", "overlay", "diagnostics", "pseudo-game"] {
            assert!(is_pc_only_page(&root.join(dir).join("index.html"), root));
            assert!(is_pc_only_page(
                &root.join(dir).join("nested/file.txt"),
                root
            ));
        }
        assert!(!is_pc_only_page(&root.join("phone/index.html"), root));
        assert!(!is_pc_only_page(&root.join("assets/icon.png"), root));
    }

    #[test]
    fn websocket_origin_and_host_must_be_trusted() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:8080".parse().unwrap());
        assert!(allowed_ws_headers(&headers, 8080, true));
        assert!(!allowed_ws_headers(&headers, 8080, false));
        headers.insert(header::ORIGIN, "http://127.0.0.1:8080".parse().unwrap());
        assert!(allowed_ws_headers(&headers, 8080, false));
        for origin in [
            "null",
            "http://localhost:8080",
            "http://127.0.0.1:8081",
            "https://127.0.0.1:8080",
        ] {
            headers.insert(header::ORIGIN, origin.parse().unwrap());
            assert!(!allowed_ws_headers(&headers, 8080, true));
        }
        headers.insert(header::HOST, "example.invalid:8080".parse().unwrap());
        headers.insert(
            header::ORIGIN,
            "http://example.invalid:8080".parse().unwrap(),
        );
        assert!(!allowed_ws_headers(&headers, 8080, true));
    }
}
