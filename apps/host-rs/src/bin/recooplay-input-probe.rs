// Windows 入力プローブ (#5)。Minecraft 実機で SendInput のキー・マウスが届くかを確かめる (#6〜#8) ための単独の道具。
// ホスト (recooplay-host) とは別に動き、スマホ・通信を使わない。
//
// 安全のための約束:
//   - 起動しただけでは何も送らない。標準入力に ARM と打って初めて送り始める (手動の arming)
//   - 送る直前に毎回、前面のウィンドウが入力先 (既定: javaw.exe / java.exe でタイトルに "Minecraft") か確かめる。
//     外れたら押しているキー・ボタンをすべて離し、戻るまで待つ (30 秒戻らなければ中止)
//   - 緊急停止: Ctrl+Alt+F12 (押されているかを 10ms ごとに見る。ホストのホットキー登録とは独立) と Ctrl+C・ウィンドウを閉じる
//   - どの終わり方 (完走・中止・停止・panic) でも、押しているキー・ボタンをすべて離してから終わる
//   - --mock は OS に入力を送らず、送る内容を表示するだけ。前面の判定と停止は標準入力の
//     "target on" / "target off" / "stop" で差し替える (scripts/sim/input-probe-sim.mjs で安全経路を確かめる)
//
//   cargo build --release (apps/host-rs) → target/release/recooplay-input-probe.exe [--mock] [--steps keys,mouse,look]
//
// 出力は 1 行ずつ「SEND ...」「RELEASE ...」「WAIT ...」「STOP ...」「DONE」。結果の記録 (BUILD_LOG) にそのまま使える。

#[allow(dead_code)]
#[path = "../focus.rs"]
mod focus;
#[allow(dead_code)]
#[path = "../input.rs"]
mod input;

use std::io::BufRead;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use focus::Target;
use input::Input;

const TICK: Duration = Duration::from_millis(10);
const TARGET_WAIT: Duration = Duration::from_secs(30);
const ARM_WORD: &str = "ARM";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Held {
    Key { scan: u16, ext: bool },
    Mouse { left: bool },
}

#[derive(Clone, Copy)]
enum Act {
    Down(Held),
    Up(Held),
    Wheel(i32),
    Move(i32, i32),
    Sleep(u64),
}

struct Step {
    group: &'static str,
    name: &'static str,
    acts: Vec<Act>,
}

const W: Held = Held::Key { scan: 0x11, ext: false };
const SPACE: Held = Held::Key { scan: 0x39, ext: false };
const SHIFT: Held = Held::Key { scan: 0x2A, ext: false };
const CTRL: Held = Held::Key { scan: 0x1D, ext: false };
const LEFT: Held = Held::Mouse { left: true };
const RIGHT: Held = Held::Mouse { left: false };

fn tap(h: Held, ms: u64) -> Vec<Act> {
    vec![Act::Down(h), Act::Sleep(ms), Act::Up(h), Act::Sleep(300)]
}

fn steps() -> Vec<Step> {
    let mut look_right = Vec::new();
    let mut look_left = Vec::new();
    for _ in 0..25 {
        look_right.extend([Act::Move(8, 0), Act::Sleep(8)]);
        look_left.extend([Act::Move(-8, 0), Act::Sleep(8)]);
    }
    vec![
        // #6 キー入力
        Step { group: "keys", name: "W を 100ms 押す (少し前へ)", acts: tap(W, 100) },
        Step { group: "keys", name: "W を 1 秒押し続ける (前へ歩く)", acts: tap(W, 1000) },
        Step { group: "keys", name: "Space (ジャンプ)", acts: tap(SPACE, 100) },
        Step { group: "keys", name: "Shift を 1 秒 (スニーク)", acts: tap(SHIFT, 1000) },
        Step { group: "keys", name: "Ctrl を押したまま W 1 秒 (ダッシュ)", acts: vec![Act::Down(CTRL), Act::Down(W), Act::Sleep(1000), Act::Up(W), Act::Up(CTRL), Act::Sleep(300)] },
        // #7 クリック・長押し・ホイール
        Step { group: "mouse", name: "左クリック", acts: tap(LEFT, 80) },
        Step { group: "mouse", name: "左を 1.5 秒長押し (採掘)", acts: tap(LEFT, 1500) },
        Step { group: "mouse", name: "右クリック (使う・置く)", acts: tap(RIGHT, 80) },
        Step { group: "mouse", name: "ホイール 1 段ずつ前後 (持ち物)", acts: vec![Act::Wheel(-1), Act::Sleep(400), Act::Wheel(1), Act::Sleep(300)] },
        // #8 相対マウス (視点)
        Step { group: "look", name: "右へ 200 (視点が右へ回る)", acts: look_right },
        Step { group: "look", name: "左へ 200 (元の向きへ戻る)", acts: look_left },
    ]
}

// ---------- 押しているもの・停止の状態 (Ctrl+C のハンドラーからも触る) ----------

static PRESSED: Mutex<Vec<Held>> = Mutex::new(Vec::new());
static STOP: AtomicBool = AtomicBool::new(false);
static MOCK_TARGET: AtomicBool = AtomicBool::new(true);
static INPUT: OnceLock<Input> = OnceLock::new();
static MOCK: AtomicBool = AtomicBool::new(false);

fn out(line: &str) {
    println!("{line}");
}

fn send_held(h: Held, down: bool) -> bool {
    let input = INPUT.get().expect("input");
    let ok = match h {
        Held::Key { scan, ext } => input.key(scan, ext, down),
        Held::Mouse { left } => input.mouse_button(left, down),
    };
    let what = match h {
        Held::Key { scan, .. } => format!("key 0x{scan:02X}"),
        Held::Mouse { left } => format!("mouse {}", if left { "left" } else { "right" }),
    };
    out(&format!("{} {what} {} ok={ok}", if down { "SEND" } else { "RELEASE" }, if down { "down" } else { "up" }));
    ok
}

/// 押しているキー・ボタンをすべて離す。何度呼んでもよい
fn release_all(why: &str) {
    let held: Vec<Held> = match PRESSED.lock() {
        Ok(mut p) => std::mem::take(&mut *p),
        Err(e) => std::mem::take(&mut *e.into_inner()),
    };
    if INPUT.get().is_none() {
        return;
    }
    for h in held.iter().rev() {
        send_held(*h, false);
    }
    out(&format!("RELEASE all ({why}) count={}", held.len()));
}

/// どの終わり方でも全解放する
struct Guard;
impl Drop for Guard {
    fn drop(&mut self) {
        release_all("exit");
    }
}

fn target_ok(target: &Target) -> bool {
    if MOCK.load(Ordering::SeqCst) {
        return MOCK_TARGET.load(Ordering::SeqCst);
    }
    focus::foreground().is_some_and(|f| target.matches(&f))
}

fn stop_requested() -> bool {
    STOP.load(Ordering::SeqCst) || (!MOCK.load(Ordering::SeqCst) && imp::emergency_keys_down())
}

enum Halt {
    Stop,
    TargetTimeout,
}

/// 前面が入力先になるまで待つ。外れていたら全解放する
fn ensure_target(target: &Target) -> Result<(), Halt> {
    if target_ok(target) {
        return Ok(());
    }
    release_all("target lost");
    out(&format!("WAIT target: {} を前面にしてください", target.describe()));
    let until = Instant::now() + TARGET_WAIT;
    while Instant::now() < until {
        if stop_requested() {
            return Err(Halt::Stop);
        }
        if target_ok(target) {
            out("WAIT target ok");
            return Ok(());
        }
        std::thread::sleep(TICK);
    }
    Err(Halt::TargetTimeout)
}

/// 指定時間待つ。その間も停止と入力先を見張る
fn wait(ms: u64, target: &Target, scale: f64) -> Result<(), Halt> {
    let until = Instant::now() + Duration::from_millis((ms as f64 * scale) as u64);
    loop {
        if stop_requested() {
            return Err(Halt::Stop);
        }
        ensure_target(target)?;
        if Instant::now() >= until {
            return Ok(());
        }
        std::thread::sleep(TICK.min(until.saturating_duration_since(Instant::now())));
    }
}

fn run_step(step: &Step, target: &Target, scale: f64) -> Result<(), Halt> {
    out(&format!("STEP [{}] {}", step.group, step.name));
    for act in &step.acts {
        if stop_requested() {
            return Err(Halt::Stop);
        }
        ensure_target(target)?;
        let input = INPUT.get().expect("input");
        match *act {
            Act::Down(h) => {
                PRESSED.lock().unwrap_or_else(|e| e.into_inner()).push(h);
                send_held(h, true);
            }
            Act::Up(h) => {
                let mut p = PRESSED.lock().unwrap_or_else(|e| e.into_inner());
                // 入力先から外れて全解放した後なら、もう離れている
                if let Some(i) = p.iter().position(|x| *x == h) {
                    p.remove(i);
                    drop(p);
                    send_held(h, false);
                }
            }
            Act::Wheel(n) => {
                let ok = input.wheel(n);
                out(&format!("SEND wheel {n} ok={ok}"));
            }
            Act::Move(dx, dy) => {
                let ok = input.mouse_move(dx, dy);
                if !ok || MOCK.load(Ordering::SeqCst) {
                    out(&format!("SEND move {dx},{dy} ok={ok}"));
                }
            }
            Act::Sleep(ms) => wait(ms, target, scale)?,
        }
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mock = args.iter().any(|a| a == "--mock");
    let groups: Vec<String> = args
        .iter()
        .position(|a| a == "--steps")
        .and_then(|i| args.get(i + 1))
        .map(|s| s.split(',').map(str::to_string).collect())
        .unwrap_or_else(|| vec!["keys".into(), "mouse".into(), "look".into()]);
    MOCK.store(mock, Ordering::SeqCst);
    if mock {
        // input.rs の DRY_RUN と同じ扱い: OS には何も送らない
        std::env::set_var("RECOOPLAY_DRY_RUN", "1");
    } else if !cfg!(windows) {
        eprintln!("Windows 以外では動きません (--mock なら手順だけ確認できます)");
        std::process::exit(1);
    }
    let target = Target::default();
    let plan: Vec<Step> = steps().into_iter().filter(|s| groups.iter().any(|g| g == s.group)).collect();
    // 時間は mock では半分 (自動試験を短くしつつ、試験側が押下中に割り込める長さを残す)
    let scale = if mock { 0.5 } else { 1.0 };

    out(&format!("Re:Cooplay 入力プローブ{}", if mock { " (mock: OS に入力を送りません)" } else { "" }));
    out(&format!("入力先: {}", target.describe()));
    out("緊急停止: Ctrl+Alt+F12 / Ctrl+C。どの終わり方でも、押しているキー・ボタンを離してから終わります");
    for s in &plan {
        out(&format!("  [{}] {}", s.group, s.name));
    }
    out(&format!("始めるには {ARM_WORD} と入力して Enter。5 秒後から、Minecraft が前面のときだけ送ります"));

    // 標準入力: ARM で開始 (それ以外の行では何も送らない)。mock では target on/off・stop も受け付ける
    let (arm_tx, arm_rx) = std::sync::mpsc::channel::<()>();
    std::thread::spawn(move || {
        let mut armed = false;
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            // PowerShell のパイプは先頭に BOM を付けることがある
            let line = line.trim_start_matches('\u{feff}').trim();
            if !armed {
                if line == ARM_WORD {
                    armed = true;
                    let _ = arm_tx.send(());
                } else {
                    out(&format!("{ARM_WORD} と入力するまで何も送りません"));
                }
                continue;
            }
            match line {
                "stop" => STOP.store(true, Ordering::SeqCst),
                "target on" if MOCK.load(Ordering::SeqCst) => MOCK_TARGET.store(true, Ordering::SeqCst),
                "target off" if MOCK.load(Ordering::SeqCst) => MOCK_TARGET.store(false, Ordering::SeqCst),
                _ => {}
            }
        }
        // 標準入力が閉じた: arming 前なら送り手が消えて開始しない
    });
    if arm_rx.recv().is_err() {
        out("STOP 開始前に入力が閉じました。何も送っていません");
        return;
    }

    // ここから先だけ OS に入力を送る
    INPUT.set(Input::new()).ok();
    if let Some(e) = INPUT.get().and_then(|i| i.error()) {
        out(&format!("STOP 入力を送れません: {e}"));
        return;
    }
    imp::install_ctrl_handler();
    std::panic::set_hook(Box::new(|info| {
        release_all("panic");
        eprintln!("{info}");
    }));
    let _guard = Guard;

    out("ARMED");
    // Minecraft を前面にするための 5 秒。この間は何も送らず、停止だけを見張る
    let until = Instant::now() + Duration::from_millis((5000.0 * scale) as u64);
    while Instant::now() < until {
        if stop_requested() {
            finish(Halt::Stop);
        }
        std::thread::sleep(TICK);
    }

    for step in &plan {
        if let Err(halt) = run_step(step, &target, scale) {
            finish(halt);
        }
    }
    release_all("done");
    out("DONE");
}

fn finish(halt: Halt) -> ! {
    match halt {
        Halt::Stop => {
            release_all("emergency stop");
            out("STOP emergency stop");
            std::process::exit(2);
        }
        Halt::TargetTimeout => {
            release_all("target timeout");
            out("STOP 入力先が 30 秒戻らなかったため中止しました");
            std::process::exit(3);
        }
    }
}

#[cfg(windows)]
mod imp {
    use windows::core::BOOL;
    use windows::Win32::System::Console::SetConsoleCtrlHandler;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_F12, VK_MENU};

    pub fn emergency_keys_down() -> bool {
        let down = |vk: u16| unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 };
        down(VK_CONTROL.0) && down(VK_MENU.0) && down(VK_F12.0)
    }

    unsafe extern "system" fn handler(_ctrl: u32) -> BOOL {
        // Ctrl+C・ウィンドウを閉じる・ログオフ: この中で全解放する (閉じる場合はこの後すぐ終了させられる)
        super::STOP.store(true, std::sync::atomic::Ordering::SeqCst);
        super::release_all("console close / Ctrl+C");
        BOOL(1)
    }

    pub fn install_ctrl_handler() {
        unsafe {
            let _ = SetConsoleCtrlHandler(Some(handler), true);
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn emergency_keys_down() -> bool {
        false
    }
    pub fn install_ctrl_handler() {}
}
