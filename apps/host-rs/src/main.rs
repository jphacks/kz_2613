// Re:Cooplay PC ホスト (Rust 版)
// PC(モバイルホットスポット親機) 上で HTTP + WebSocket + WebRTC を配信し、スマホ3台の入力を受けて
// Windows のキーボード / マウス入力として注入する。インターネットは一切使わない（外部CDNも読まない）。
// スマホ / PC の画面 (public/) とメッセージ形式は Node 版と共通。

mod config;
mod controls;
mod hub;
mod input;
mod netinfo;
mod rtc;

use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::config::Config;
use crate::hub::{Event, Hub, Out};

const WEB_DIR: &str = "apps/web-static";

#[derive(Clone)]
struct App {
    hub: Arc<Mutex<Sender<Event>>>,
    next_id: Arc<AtomicU64>,
    public_dir: Arc<PathBuf>,
    port: u16,
    wifi: Arc<Option<(String, String)>>,
}

impl App {
    fn send(&self, ev: Event) {
        if let Ok(tx) = self.hub.lock() {
            let _ = tx.send(ev);
        }
    }
}

/// 画面 (apps/web-static/) のある場所 (= リポジトリのルート) を探す。RECOOPLAY_ROOT で指定も可
fn find_root() -> PathBuf {
    if let Ok(r) = std::env::var("RECOOPLAY_ROOT") {
        return PathBuf::from(r);
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut candidates = vec![cwd.clone(), cwd.join(".."), cwd.join("../..")];
    if let Ok(exe) = std::env::current_exe() {
        candidates.extend(exe.ancestors().skip(1).take(4).map(Path::to_path_buf));
    }
    candidates.into_iter().find(|p| p.join(WEB_DIR).join("index.html").is_file()).unwrap_or(cwd)
}

fn is_loopback(addr: &SocketAddr) -> bool {
    match addr.ip() {
        std::net::IpAddr::V4(v4) => v4.is_loopback(),
        std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.to_ipv4_mapped().is_some_and(|v| v.is_loopback()),
    }
}

fn client_ip(addr: &SocketAddr) -> String {
    match addr.ip() {
        std::net::IpAddr::V6(v6) => v6.to_ipv4_mapped().map(|v| v.to_string()).unwrap_or_else(|| v6.to_string()),
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
    let log_dir = std::env::var("RECOOPLAY_LOG_DIR").map(PathBuf::from).unwrap_or_else(|_| root.join("logs"));
    let hub = match Hub::new(tx.clone(), &config, input, &log_dir) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("ログを作成できません: {e}");
            std::process::exit(1);
        }
    };

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("ポート {port} で待ち受けできません: {e}");
            std::process::exit(1);
        }
    };

    println!("\nRe:Cooplay ホスト (Rust) 起動 (port {port})");
    println!("  PC ダッシュボード : http://localhost:{port}/host");
    println!("  PC 疑似ゲーム画面 : http://localhost:{port}/game");
    let addrs = netinfo::addresses();
    for a in &addrs {
        let hs = if a.hotspot { ", ホットスポット" } else { "" };
        println!("  スマホ用 URL      : http://{}:{}/  ({}{})", a.address, port, a.name, hs);
    }
    if !addrs.iter().any(|a| a.hotspot) {
        println!("  ※ 192.168.137.x が見つかりません。モバイルホットスポットが OFF の可能性があります（ON にした後はダッシュボードを再読込）");
    }
    println!();

    // セッションの中枢は専用スレッド (視点の 4ms 刻みなどを非同期ランタイムに左右されずに回す)
    std::thread::Builder::new().name("hub".into()).spawn(move || hub.run(rx, port)).expect("hub thread");

    let app = App {
        hub: Arc::new(Mutex::new(tx.clone())),
        next_id: Arc::new(AtomicU64::new(1)),
        public_dir: Arc::new(root.join(WEB_DIR)),
        port,
        wifi: Arc::new(config.wifi.clone()),
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
                        _ => {}
                    }
                }
                let _ = tx.send(Event::Shutdown);
            })
            .expect("stdin-control thread");
    }

    // Ctrl+C: 押しっぱなしのキーを離してから終了する
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            let _ = tx.send(Event::Shutdown);
        }
    });

    let router = Router::new()
        .route("/api/info", get(api_info))
        .route("/ws", get(ws_upgrade))
        .fallback(get(static_file))
        .with_state(app);
    if let Err(e) = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>()).await {
        eprintln!("サーバーエラー: {e}");
    }
}

async fn api_info(State(app): State<App>) -> Response {
    let wifi = app.wifi.as_ref().as_ref().map(|(s, p)| (s.as_str(), p.as_str()));
    let body = netinfo::info(app.port, wifi);
    ([(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], body.to_string()).into_response()
}

async fn static_file(State(app): State<App>, ConnectInfo(addr): ConnectInfo<SocketAddr>, uri: Uri) -> Response {
    let path = match uri.path() {
        "/" => "/index.html",
        "/host" => "/host.html",
        "/game" => "/game.html",
        p => p,
    };
    // ダッシュボードと疑似ゲーム画面は PC 本体からのみ
    if matches!(path, "/host.html" | "/game.html") && !is_loopback(&addr) {
        return (StatusCode::FORBIDDEN, "this page is only available on the PC").into_response();
    }
    let rel = Path::new(path.trim_start_matches('/'));
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let file = app.public_dir.join(rel);
    let mime = match file.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    };
    match tokio::fs::read(&file).await {
        Ok(data) => ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "no-store")], data).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

// DNS再束縛と別Originからの管理操作を防ぐ。OriginなしはPC内の非ブラウザ検証クライアントに限る。
fn allowed_ws_headers(headers: &HeaderMap, port: u16, loopback: bool) -> bool {
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else { return false };
    let Ok(authority) = host.parse::<axum::http::uri::Authority>() else { return false };
    let hostname = authority.host();
    if authority.port_u16().unwrap_or(80) != port
        || !(matches!(hostname, "localhost" | "127.0.0.1" | "[::1]")
            || netinfo::addresses().iter().any(|a| a.address == hostname))
    {
        return false;
    }
    match headers.get(header::ORIGIN) {
        None => loopback,
        Some(value) => value.to_str().ok().is_some_and(|origin| origin == format!("http://{host}")),
    }
}

async fn ws_upgrade(ws: WebSocketUpgrade, ConnectInfo(addr): ConnectInfo<SocketAddr>, State(app): State<App>, headers: HeaderMap) -> Response {
    if !allowed_ws_headers(&headers, app.port, is_loopback(&addr)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.on_upgrade(move |socket| ws_session(socket, addr, app))
}

/// 1 本の WebSocket: 受信はハブへ、ハブからの送信はスマホ / PC 画面へ流す
async fn ws_session(mut socket: WebSocket, addr: SocketAddr, app: App) {
    let id = app.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    app.send(Event::WsOpen { id, tx, ip: client_ip(&addr), loopback: is_loopback(&addr) });
    let mut code: u16 = 1006;
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => app.send(Event::WsText { id, text: text.to_string() }),
                Some(Ok(Message::Close(frame))) => {
                    code = frame.map(|f| f.code).unwrap_or(1005);
                    break;
                }
                Some(Ok(_)) => {}
                Some(Err(_)) | None => break,
            },
            outgoing = rx.recv() => match outgoing {
                Some(Out::Text(text)) => {
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Some(Out::Close(c, reason)) => {
                    let _ = socket.send(Message::Close(Some(CloseFrame { code: c, reason: reason.into() }))).await;
                    code = c;
                    break;
                }
                Some(Out::Terminate) | None => break,
            },
        }
    }
    app.send(Event::WsClosed { id, code });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_origin_and_host_must_be_trusted() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:8080".parse().unwrap());
        assert!(allowed_ws_headers(&headers, 8080, true));
        assert!(!allowed_ws_headers(&headers, 8080, false));
        headers.insert(header::ORIGIN, "http://127.0.0.1:8080".parse().unwrap());
        assert!(allowed_ws_headers(&headers, 8080, false));
        for origin in ["null", "http://localhost:8080", "http://127.0.0.1:8081", "https://127.0.0.1:8080"] {
            headers.insert(header::ORIGIN, origin.parse().unwrap());
            assert!(!allowed_ws_headers(&headers, 8080, true));
        }
        headers.insert(header::HOST, "example.invalid:8080".parse().unwrap());
        headers.insert(header::ORIGIN, "http://example.invalid:8080".parse().unwrap());
        assert!(!allowed_ws_headers(&headers, 8080, true));
    }
}
