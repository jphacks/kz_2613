// PC の緊急停止ホットキー (Ctrl+Alt+F12)。スマホやダッシュボードの通信に頼らず、PC のキー操作だけで
// 全キー・マウスボタンを離して注入を OFF にする。専用スレッドで RegisterHotKey のメッセージを待つ。

use std::sync::mpsc::Sender;

use crate::hub::Event;

pub const LABEL: &str = "Ctrl+Alt+F12";

/// ホットキーを登録する。登録できなければ理由を返す (他のアプリが同じキーを使っている等)
pub fn start(tx: Sender<Event>) -> Result<(), String> {
    imp::start(tx)
}

#[cfg(windows)]
mod imp {
    use std::sync::mpsc::Sender;

    use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, VK_F12};
    use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};

    use crate::hub::Event;

    const HOTKEY_ID: i32 = 1;

    pub fn start(tx: Sender<Event>) -> Result<(), String> {
        // ホットキーは登録したスレッドのメッセージキューに届くので、登録と待機を同じスレッドで行う
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("hotkey".into())
            .spawn(move || {
                let registered = unsafe {
                    RegisterHotKey(None, HOTKEY_ID, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_F12.0 as u32)
                };
                if let Err(e) = registered {
                    let _ = ready_tx.send(Err(e.to_string()));
                    return;
                }
                let _ = ready_tx.send(Ok(()));
                let mut msg = MSG::default();
                while unsafe { GetMessageW(&mut msg, None, 0, 0) }.as_bool() {
                    if msg.message == WM_HOTKEY && msg.wParam.0 == HOTKEY_ID as usize {
                        let _ = tx.send(Event::EmergencyStop { source: "hotkey" });
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        ready_rx.recv().unwrap_or_else(|_| Err("ホットキーのスレッドが終了しました".into()))
    }
}

#[cfg(not(windows))]
mod imp {
    use std::sync::mpsc::Sender;

    use crate::hub::Event;

    pub fn start(_: Sender<Event>) -> Result<(), String> {
        Err("Windows 以外では使えません".into())
    }
}
