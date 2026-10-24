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

const WEB_DIR: &str = "apps/web-static";
const HOST_EXE: &str = if cfg!(windows) { "recooplay-host.exe" } else { "recooplay-host" };
const START_TIMEOUT: Duration = Duration::from_secs(15);
const QUIT_TIMEOUT: Duration = Duration::from_secs(3);

/// 起動したホストのプロセス
struct Host(Mutex<Option<Child>>);

/// リポジトリのルート (apps/web-static/ と config.json のある場所)。RECOOPLAY_ROOT で指定も可
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
    candidates.into_iter().find(|p| p.join(WEB_DIR).join("index.html").is_file())
}

/// ホストの実行ファイル: RECOOPLAY_HOST_EXE → アプリと同じフォルダ → リポジトリ内の release ビルド
fn find_host_exe(root: &Path) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_HOST_EXE") {
        return Some(PathBuf::from(p));
    }
    let beside = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join(HOST_EXE)));
    let built = root.join("apps").join("host-rs").join("target").join("release").join(HOST_EXE);
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
            v.get("port").and_then(serde_json::Value::as_u64).map(|p| p as u16)
        })
        .unwrap_or(8080)
}

fn spawn_host(root: &Path, exe: &Path, port: u16) -> std::io::Result<Child> {
    let mut cmd = Command::new(exe);
    cmd.current_dir(root)
        .env("RECOOPLAY_ROOT", root)
        .env("PORT", port.to_string())
        .env("RECOOPLAY_STDIN_CONTROL", "1")
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
fn wait_ready(host: &Mutex<Option<Child>>, port: u16) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let started = Instant::now();
    loop {
        if let Some(child) = host.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!(
                    "PCホストが終了しました（{status}）。\nポート {port} を別のプログラム（起動済みのホストなど）が使っていないか確認してください。"
                ));
            }
        }
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            // 既に別のホストが同じポートで動いていると、こちらの起動失敗より先につながることがある
            std::thread::sleep(Duration::from_millis(300));
            if let Some(child) = host.lock().unwrap().as_mut() {
                if let Ok(Some(_)) = child.try_wait() {
                    return Err(format!("ポート {port} は別のプログラムが使用中です。起動済みのホストを終了してから開き直してください。"));
                }
            }
            return Ok(());
        }
        if started.elapsed() > START_TIMEOUT {
            return Err(format!("PCホストが {} 秒以内に起動しませんでした。", START_TIMEOUT.as_secs()));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// ホストに安全停止 (全キー・ボタンの解放) をさせてから終了させる。応答がなければ強制終了する
fn stop_host(host: &Mutex<Option<Child>>) {
    let Some(mut child) = host.lock().unwrap().take() else { return };
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

fn show_error(app: &tauri::AppHandle, text: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(&format!("window.showError({})", serde_json::Value::from(text)));
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Host(Mutex::new(None)))
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Re:Cooplay")
                .inner_size(1280.0, 820.0)
                .min_inner_size(800.0, 560.0)
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
                let url: tauri::Url = format!("http://127.0.0.1:{port}/host").parse().expect("host url");
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.navigate(url);
                }
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
