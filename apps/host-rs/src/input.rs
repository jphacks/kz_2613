// Windows の SendInput でキーボード / マウス入力を注入する。
// キーはゲーム (DirectInput / raw input) でも拾えるようスキャンコードで送る。
// RECOOPLAY_DRY_RUN=1 なら実際には注入しない (自動テスト用)

pub struct Input {
    dry_run: bool,
    error: Option<String>,
}

impl Input {
    pub fn new() -> Self {
        let dry_run = std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1");
        let error = if cfg!(windows) || dry_run { None } else { Some("Windows 以外では注入できません".to_string()) };
        #[cfg(windows)]
        unsafe {
            // Windows のタイマー分解能は既定 15.6ms。視点の補間を細かく刻めるよう 1ms にする (プロセス終了で自動的に戻る)
            windows::Win32::Media::timeBeginPeriod(1);
        }
        Input { dry_run, error }
    }

    pub fn available(&self) -> bool {
        self.error.is_none()
    }

    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn key(&self, scan: u16, ext: bool, down: bool) -> bool {
        if self.dry_run {
            return true;
        }
        imp::key(scan, ext, down)
    }

    pub fn mouse_button(&self, left: bool, down: bool) -> bool {
        if self.dry_run {
            return true;
        }
        imp::mouse_button(left, down)
    }

    pub fn mouse_move(&self, dx: i32, dy: i32) -> bool {
        if self.dry_run {
            return true;
        }
        imp::mouse_move(dx, dy)
    }

    pub fn wheel(&self, notches: i32) -> bool {
        if self.dry_run {
            return true;
        }
        imp::wheel(notches)
    }
}

#[cfg(windows)]
mod imp {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;

    fn send(input: INPUT) -> bool {
        unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) == 1 }
    }

    pub fn key(scan: u16, ext: bool, down: bool) -> bool {
        let mut flags = KEYEVENTF_SCANCODE;
        if ext {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if !down {
            flags |= KEYEVENTF_KEYUP;
        }
        send(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: VIRTUAL_KEY(0), wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
            },
        })
    }

    fn mouse(dx: i32, dy: i32, data: i32, flags: MOUSE_EVENT_FLAGS) -> bool {
        send(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT { dx, dy, mouseData: data as _, dwFlags: flags, time: 0, dwExtraInfo: 0 },
            },
        })
    }

    pub fn mouse_button(left: bool, down: bool) -> bool {
        let flags = match (left, down) {
            (true, true) => MOUSEEVENTF_LEFTDOWN,
            (true, false) => MOUSEEVENTF_LEFTUP,
            (false, true) => MOUSEEVENTF_RIGHTDOWN,
            (false, false) => MOUSEEVENTF_RIGHTUP,
        };
        mouse(0, 0, 0, flags)
    }

    pub fn mouse_move(dx: i32, dy: i32) -> bool {
        mouse(dx, dy, 0, MOUSEEVENTF_MOVE)
    }

    pub fn wheel(notches: i32) -> bool {
        mouse(0, 0, notches * 120, MOUSEEVENTF_WHEEL)
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn key(_: u16, _: bool, _: bool) -> bool {
        false
    }
    pub fn mouse_button(_: bool, _: bool) -> bool {
        false
    }
    pub fn mouse_move(_: i32, _: i32) -> bool {
        false
    }
    pub fn wheel(_: i32) -> bool {
        false
    }
}
