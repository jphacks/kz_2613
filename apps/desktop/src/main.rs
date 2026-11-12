// Re:Cooplay PC アプリ (Tauri / WebView2)
// PC ホスト (apps/host-rs の recooplay-host.exe) を子プロセスとして起動し、PC の画面 (/host) をアプリのウィンドウに表示する。
// 入力の注入・通信はすべてホスト側が行う。終了時はホストに "quit" を送り、押しっぱなしのキーを離してから閉じさせる。
// アプリが異常終了した場合も、ホストは標準入力が閉じたことで同じ安全停止をする (RECOOPLAY_STDIN_CONTROL=1)。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const WEB_DIR: &str = "apps/web/dist";
const HOST_EXE: &str = if cfg!(windows) {
    "recooplay-host.exe"
} else {
    "recooplay-host"
};
const START_TIMEOUT: Duration = Duration::from_secs(15);
const QUIT_TIMEOUT: Duration = Duration::from_secs(3);
/// ホストの終了を調べる間隔と、続けて再起動する上限 (#222)
const WATCH_INTERVAL: Duration = Duration::from_millis(500);
const MAX_RESTARTS: u32 = 3;
/// これより長く動いたら、次の異常終了は別の問題として数え直す
const STABLE_RUN: Duration = Duration::from_secs(60);

/// 起動したホストのプロセス
struct Host(Mutex<Option<Child>>);

/// ホストの待受ポート。観客向けオーバーレイ (#163) の URL に使う。起動前は None
#[derive(Default)]
struct HostPort(Mutex<Option<u16>>);

/// 観客向けオーバーレイ (#163) を表示しているか。起動のたびに OFF から始める (Q43)
#[derive(Default)]
struct OverlayOn(Mutex<bool>);

/// PC の画面 (/app) からの切替要求。画面には Tauri の API を開放しないので、この URL への移動を横取りして受け取る
const OVERLAY_PATH: &str = "/__desktop/overlay";
const OVERLAY_LABEL: &str = "overlay";
/// オーバーレイの大きさ (論理px)。担当カード4枚と状態表示が縦に収まる、画面の右上の小さな領域
const OVERLAY_SIZE: (f64, f64) = (300.0, 440.0);
const OVERLAY_MARGIN: f64 = 16.0;

/// 起動失敗が画面の読込より先に届いても、案内を失わない。
#[derive(Default)]
struct StartupError(Mutex<Option<String>>);

/// リポジトリのルート (apps/web/dist/ と config.json のある場所)。RECOOPLAY_ROOT で指定も可
fn find_root() -> Option<PathBuf> {
    if let Ok(r) = std::env::var("RECOOPLAY_ROOT") {
        return Some(PathBuf::from(r));
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.extend(cwd.ancestors().take(4).map(Path::to_path_buf));
    }
    if let Ok(exe) = std::env::current_exe() {
        candidates.extend(exe.ancestors().skip(1).take(6).map(Path::to_path_buf));
    }
    candidates
        .into_iter()
        .find(|p| p.join(WEB_DIR).join("phone/index.html").is_file())
}

/// ホストの実行ファイル: RECOOPLAY_HOST_EXE → アプリと同じフォルダ → リポジトリ内の release ビルド
fn find_host_exe(root: &Path) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_HOST_EXE") {
        return Some(PathBuf::from(p));
    }
    let beside = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.join(HOST_EXE)));
    let built = root
        .join("apps")
        .join("host-rs")
        .join("target")
        .join("release")
        .join(HOST_EXE);
    beside.into_iter().chain([built]).find(|p| p.is_file())
}

/// ホストと同じ規則のポート: 環境変数 PORT → config.json の port → 8080
fn host_port(root: &Path) -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .or_else(|| {
            let text = std::fs::read_to_string(root.join("config.json")).ok()?;
            let v: serde_json::Value = serde_json::from_str(&text).ok()?;
            v.get("port")
                .and_then(serde_json::Value::as_u64)
                .map(|p| p as u16)
        })
        .unwrap_or(8080)
}

fn spawn_host(root: &Path, exe: &Path, port: u16) -> std::io::Result<Child> {
    let mut cmd = Command::new(exe);
    cmd.current_dir(root)
        .env("RECOOPLAY_ROOT", root)
        .env("PORT", port.to_string())
        .env("RECOOPLAY_STDIN_CONTROL", "1")
        // PC アプリから起動したことを知らせる (ホストは前面のプロセス名で PC アプリへの手動復帰を判定する)
        .env("RECOOPLAY_DESKTOP", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
}

/// ホストが待ち受けを始めるまで待つ。先に終了した (ポート使用中など) なら Err
fn host_exit_message(status: std::process::ExitStatus, port: u16) -> String {
    if status.code().map(|code| code as u32) == Some(0xc0000135) {
        return "PCホストに必要なDLLが見つかりません（0xC0000135）。\nMicrosoft Visual C++ v14 Redistributable（x64）を確認してください。\n公式の案内: https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist\n導入済みなら、配布フォルダの不足・破損も確認してください。".into();
    }
    format!("PCホストが終了しました（{status}）。\nポート {port} を別のプログラム（起動済みのホストなど）が使っていないか確認してください。")
}

fn wait_ready(host: &Mutex<Option<Child>>, port: u16) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let started = Instant::now();
    loop {
        if let Some(child) = host.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(host_exit_message(status, port));
            }
        }
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            // 既に別のホストが同じポートで動いていると、こちらの起動失敗より先につながることがある
            std::thread::sleep(Duration::from_millis(300));
            if let Some(child) = host.lock().unwrap().as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    return Err(host_exit_message(status, port));
                }
            }
            return Ok(());
        }
        if started.elapsed() > START_TIMEOUT {
            return Err(format!(
                "PCホストが {} 秒以内に起動しませんでした。",
                START_TIMEOUT.as_secs()
            ));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// ホストに安全停止 (全キー・ボタンの解放) をさせてから終了させる。応答がなければ強制終了する
fn stop_host(host: &Mutex<Option<Child>>) {
    let Some(mut child) = host.lock().unwrap().take() else {
        return;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"quit\n");
        let _ = stdin.flush();
    }
    let started = Instant::now();
    while started.elapsed() < QUIT_TIMEOUT {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// 動作中のホストの異常終了の案内 (#222)。実入力の押下はホスト自身が解放できない場合があるので、必ず知らせる
fn host_restart_notice(restarted: bool) -> String {
    let keys = "キーが押されたままなら、物理キーを押して離してください。";
    if restarted {
        format!("PCホストが異常終了したため再起動しました。{keys}スマホは自動で参加し直します。分担からやり直してください。")
    } else {
        format!("PCホストが異常終了を繰り返したため、再起動を止めました。{keys}アプリを閉じて起動し直してください。")
    }
}

/// 続けて再起動してよいか。長く動いた後の異常終了は数え直す
fn next_restart_count(count: u32, ran_for: Duration) -> Option<u32> {
    let next = if ran_for >= STABLE_RUN { 1 } else { count + 1 };
    (next <= MAX_RESTARTS).then_some(next)
}

fn show_host_notice(app: &tauri::AppHandle, text: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(format!(
            "window.showHostNotice?.({})",
            serde_json::Value::from(text)
        ));
    }
}

/// 起動後のホストを見守る。終了要求 (stop_host) ではホストの取り出しで止まる。
/// 再起動したホストはロビーから始まり、Ready まで入力を送らない
fn watch_host(handle: tauri::AppHandle, root: PathBuf, exe: PathBuf, port: u16) {
    let host = handle.state::<Host>();
    let (mut restarts, mut started) = (0, Instant::now());
    loop {
        std::thread::sleep(WATCH_INTERVAL);
        {
            let mut guard = host.0.lock().unwrap();
            let Some(child) = guard.as_mut() else { return };
            if !matches!(child.try_wait(), Ok(Some(_))) {
                continue;
            }
            *guard = None;
        }
        let Some(next) = next_restart_count(restarts, started.elapsed()) else {
            return show_host_notice(&handle, &host_restart_notice(false));
        };
        restarts = next;
        started = Instant::now();
        match spawn_host(&root, &exe, port) {
            Ok(child) => *host.0.lock().unwrap() = Some(child),
            Err(_) => return show_host_notice(&handle, &host_restart_notice(false)),
        }
        if wait_ready(&host.0, port).is_ok() {
            show_host_notice(&handle, &host_restart_notice(true));
        }
    }
}

fn show_error(app: &tauri::AppHandle, text: &str) {
    *app.state::<StartupError>().0.lock().unwrap() = Some(text.to_string());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(format!(
            "window.showError({})",
            serde_json::Value::from(text)
        ));
    }
}

/// 切替要求の URL なら、求められた ON/OFF を返す。それ以外の移動は通常どおり通す
fn overlay_request(url: &tauri::Url) -> Option<bool> {
    let loopback = matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"));
    if !loopback || url.path() != OVERLAY_PATH {
        return None;
    }
    url.query_pairs()
        .find(|(k, _)| k == "on")
        .map(|(_, v)| v == "1")
}

/// オーバーレイの位置 (論理px)。PC アプリのウィンドウがあるモニターの右上
fn overlay_position(monitor_pos: (f64, f64), monitor_size: (f64, f64)) -> (f64, f64) {
    (
        monitor_pos.0 + monitor_size.0 - OVERLAY_SIZE.0 - OVERLAY_MARGIN,
        monitor_pos.1 + OVERLAY_MARGIN,
    )
}

/// PC の画面へ現在の状態を伝える。画面は window.recooplayDesktop があるときだけ切替を出す
fn tell_overlay_state(app: &tauri::AppHandle, error: Option<&str>) {
    let on = *app.state::<OverlayOn>().0.lock().unwrap();
    let state = serde_json::json!({ "overlay": on, "overlayError": error });
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(format!(
            "window.recooplayDesktop={state};window.dispatchEvent(new Event('recooplay-desktop'))"
        ));
    }
}

/// WebView2 の起動オプション。既定は wry の既定値と同じ。
/// 試験用 (#379): dry-run のときだけ、RECOOPLAY_WEBVIEW2_DEBUG_PORT のポートで WebView2 のデバッグ接続を開く。
/// CI のランナーの WebView2 では、環境変数 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS が反映されなかったため。
/// 同じ保存先のウィンドウは起動オプションをそろえる必要があるので、メイン画面とオーバーレイの両方に使う
fn browser_args(dry_run: Option<&str>, debug_port: Option<&str>) -> String {
    const DEFAULT: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
    match (
        dry_run,
        debug_port
            .and_then(|p| p.parse::<u16>().ok())
            .filter(|p| *p > 0),
    ) {
        (Some("1"), Some(port)) => format!("{DEFAULT} --remote-debugging-port={port}"),
        _ => DEFAULT.into(),
    }
}

fn window_browser_args() -> String {
    browser_args(
        std::env::var("RECOOPLAY_DRY_RUN").ok().as_deref(),
        std::env::var("RECOOPLAY_WEBVIEW2_DEBUG_PORT")
            .ok()
            .as_deref(),
    )
}

/// 透明・最前面・クリック透過・非アクティブのウィンドウで /overlay を表示する (#163、Q45)。
/// フォーカスを取らず、マウス・キーボードを受けないので、ゲームの前面判定と入力の経路は変わらない
fn open_overlay(app: &tauri::AppHandle, port: u16) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("モニターの情報を取得できません")?;
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    let (x, y) = overlay_position((pos.x, pos.y), (size.width, size.height));
    let url: tauri::Url = format!("http://127.0.0.1:{port}/overlay?layout=desktop")
        .parse()
        .map_err(|_| "URL を作れません")?;
    let window = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::External(url))
        .title("Re:Cooplay 観客向け表示")
        .inner_size(OVERLAY_SIZE.0, OVERLAY_SIZE.1)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .additional_browser_args(&window_browser_args())
        .build()
        .map_err(|e| format!("表示用のウィンドウを作れません: {e}"))?;
    if let Err(e) = window.set_ignore_cursor_events(true) {
        // クリックを透過できないなら、ゲームの操作を妨げないよう出さない
        let _ = window.destroy();
        return Err(format!("クリックを透過できないため表示しません: {e}"));
    }
    window.show().map_err(|e| format!("表示できません: {e}"))
}

fn close_overlay(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = w.destroy();
    }
}

/// 切替要求を処理する。Windows ではイベント処理の中でウィンドウを作るとデッドロックするため、別のスレッドで行う
fn handle_overlay_request(app: tauri::AppHandle, on: bool) {
    std::thread::spawn(move || {
        let port = *app.state::<HostPort>().0.lock().unwrap();
        let result = match (on, port) {
            (false, _) => {
                close_overlay(&app);
                Ok(())
            }
            (true, Some(port)) => open_overlay(&app, port),
            (true, None) => Err("PCホストの起動を待っています".to_string()),
        };
        *app.state::<OverlayOn>().0.lock().unwrap() = on && result.is_ok();
        tell_overlay_state(&app, result.err().as_deref());
    });
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Host(Mutex::new(None)))
        .manage(StartupError::default())
        .manage(HostPort::default())
        .manage(OverlayOn::default())
        // メイン画面を閉じたらアプリを終了する。利用者が閉じられないオーバーレイ (#163) が残ると
        // 最後のウィンドウが閉じず、ホストの安全停止 (RunEvent::Exit) へ進まないため
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            let nav = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Re:Cooplay")
                .inner_size(1280.0, 820.0)
                .min_inner_size(800.0, 560.0)
                .additional_browser_args(&window_browser_args())
                .on_navigation(move |url| match overlay_request(url) {
                    Some(on) => { handle_overlay_request(nav.clone(), on); false }
                    None => true,
                })
                .on_page_load(|window, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        if window.url().is_ok_and(|u| u.path() == "/app") { tell_overlay_state(window.app_handle(), None); }
                        let error = window.state::<StartupError>().0.lock().unwrap().clone();
                        if let Some(text) = error {
                            let _ = window.eval(format!("window.showError({})", serde_json::Value::from(text)));
                        }
                    }
                })
                .build()?;

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let Some(root) = find_root() else {
                    return show_error(&handle, &format!("画面のフォルダ（{WEB_DIR}）が見つかりません。RECOOPLAY_ROOT でリポジトリのルートを指定してください。"));
                };
                let Some(exe) = find_host_exe(&root) else {
                    return show_error(&handle, &format!("PCホスト（{HOST_EXE}）が見つかりません。apps/host-rs で cargo build --release を実行してください。"));
                };
                let port = host_port(&root);
                *handle.state::<HostPort>().0.lock().unwrap() = Some(port);
                let host = handle.state::<Host>();
                match spawn_host(&root, &exe, port) {
                    Ok(child) => *host.0.lock().unwrap() = Some(child),
                    Err(e) => return show_error(&handle, &format!("PCホストを起動できません: {e}")),
                }
                if let Err(e) = wait_ready(&host.0, port) {
                    stop_host(&host.0);
                    return show_error(&handle, &e);
                }
                // ダッシュボードは PC 本体 (ループバック) からのみ開ける
                let url: tauri::Url = format!("http://127.0.0.1:{port}/app").parse().expect("app url");
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.navigate(url);
                }
                watch_host(handle.clone(), root, exe, port);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri アプリを初期化できません");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_host(&handle.state::<Host>().0);
        }
    });
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::os::windows::process::ExitStatusExt;

    #[test]
    fn webview2_debug_port_only_in_dry_run() {
        let default = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
        assert_eq!(browser_args(None, None), default);
        assert_eq!(browser_args(Some("1"), None), default);
        // 製品の通常起動 (dry-run でない) では、ポートを指定してもデバッグ接続を開かない
        assert_eq!(browser_args(None, Some("9222")), default);
        assert_eq!(browser_args(Some("0"), Some("9222")), default);
        assert_eq!(browser_args(Some("1"), Some("abc")), default);
        assert_eq!(browser_args(Some("1"), Some("0")), default);
        assert_eq!(
            browser_args(Some("1"), Some("9222")),
            format!("{default} --remote-debugging-port=9222")
        );
    }

    #[test]
    fn missing_dll_is_distinguished_from_other_startup_failures() {
        let missing = host_exit_message(std::process::ExitStatus::from_raw(0xc0000135), 8080);
        assert!(
            missing.contains("Visual C++")
                && missing.contains("x64")
                && missing.contains("不足・破損")
        );
        assert!(!missing.contains("ポート"));
        let other = host_exit_message(std::process::ExitStatus::from_raw(1), 18600);
        assert!(other.contains("18600") && !other.contains("Visual C++"));
    }

    #[test]
    fn host_restarts_stop_after_the_limit_and_count_again_after_a_stable_run() {
        let short = Duration::from_secs(1);
        assert_eq!(next_restart_count(0, short), Some(1));
        assert_eq!(
            next_restart_count(MAX_RESTARTS - 1, short),
            Some(MAX_RESTARTS)
        );
        assert_eq!(next_restart_count(MAX_RESTARTS, short), None);
        assert_eq!(next_restart_count(MAX_RESTARTS, STABLE_RUN), Some(1));
    }

    #[test]
    fn overlay_requests_are_only_the_loopback_switch_url() {
        let url = |s: &str| s.parse::<tauri::Url>().unwrap();
        assert_eq!(
            overlay_request(&url("http://127.0.0.1:8080/__desktop/overlay?on=1")),
            Some(true)
        );
        assert_eq!(
            overlay_request(&url("http://127.0.0.1:8080/__desktop/overlay?on=0")),
            Some(false)
        );
        assert_eq!(overlay_request(&url("http://127.0.0.1:8080/app")), None);
        assert_eq!(
            overlay_request(&url("http://192.0.2.10:8080/__desktop/overlay?on=1")),
            None
        );
        assert_eq!(
            overlay_request(&url("http://127.0.0.1:8080/__desktop/overlay")),
            None
        );
    }

    #[test]
    fn overlay_sits_in_the_top_right_of_the_monitor() {
        let (x, y) = overlay_position((1920.0, 0.0), (1280.0, 720.0));
        assert_eq!(
            (x, y),
            (
                1920.0 + 1280.0 - OVERLAY_SIZE.0 - OVERLAY_MARGIN,
                OVERLAY_MARGIN
            )
        );
    }

    #[test]
    fn host_notice_always_mentions_keys_that_may_stay_pressed() {
        for restarted in [true, false] {
            assert!(host_restart_notice(restarted).contains("物理キー"));
        }
    }
}
