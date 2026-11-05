// Windows の SendInput でキーボード / マウス入力を注入する。
// キーはゲーム (DirectInput / raw input) でも拾えるようスキャンコードで送る。
// RECOOPLAY_DRY_RUN=1 なら実際には注入しない (自動テスト用)

/// HubからOS入力を切り離す最小境界。認可・停止・フォーカス・時間制約は呼出し側が管理する。
/// 成否は従来どおりboolで返し、この境界で再試行や状態の巻戻しを追加しない。
pub trait InputAdapter: Send {
    fn available(&self) -> bool;
    fn error(&self) -> Option<&str>;
    fn key(&mut self, scan: u16, ext: bool, down: bool) -> bool;
    fn mouse_button(&mut self, left: bool, down: bool) -> bool;
    fn mouse_move(&mut self, dx: i32, dy: i32) -> bool;
    fn wheel(&mut self, notches: i32) -> bool;
}

pub struct Input {
    dry_run: bool,
    error: Option<String>,
}

impl Input {
    /// 単体試験専用。環境変数やWindowsのタイマー設定に触れず、実入力を必ず無効にする。
    #[cfg(test)]
    pub(crate) fn for_test() -> Self {
        Self { dry_run: true, error: None }
    }

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

impl InputAdapter for Input {
    fn available(&self) -> bool { Input::available(self) }
    fn error(&self) -> Option<&str> { Input::error(self) }
    fn key(&mut self, scan: u16, ext: bool, down: bool) -> bool { Input::key(self, scan, ext, down) }
    fn mouse_button(&mut self, left: bool, down: bool) -> bool { Input::mouse_button(self, left, down) }
    fn mouse_move(&mut self, dx: i32, dy: i32) -> bool { Input::mouse_move(self, dx, dy) }
    fn wheel(&mut self, notches: i32) -> bool { Input::wheel(self, notches) }
}

/// 試験専用。実OS入力を呼ばず、要求の順序・引数・成否を観測する。
#[cfg(test)]
pub(crate) mod testing {
    use super::InputAdapter;
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Debug, PartialEq)]
    pub enum Operation {
        Key { scan: u16, ext: bool, down: bool },
        Button { left: bool, down: bool },
        Move { dx: i32, dy: i32 },
        Wheel(i32),
    }

    #[derive(Clone, Debug, PartialEq)]
    pub struct Call {
        pub operation: Operation,
        pub ok: bool,
    }

    #[derive(Default)]
    struct State {
        calls: Vec<Call>,
        results: VecDeque<bool>,
    }

    #[derive(Clone, Default)]
    pub struct RecordingInput {
        state: Arc<Mutex<State>>,
        error: Option<String>,
    }

    impl RecordingInput {
        pub fn with_results(results: impl IntoIterator<Item = bool>) -> Self {
            Self { state: Arc::new(Mutex::new(State { calls: Vec::new(), results: results.into_iter().collect() })), error: None }
        }

        pub fn unavailable(message: &str) -> Self {
            Self { error: Some(message.into()), ..Self::default() }
        }

        pub fn calls(&self) -> Vec<Call> { self.state.lock().unwrap().calls.clone() }

        fn record(&mut self, operation: Operation) -> bool {
            let mut state = self.state.lock().unwrap();
            let ok = state.results.pop_front().unwrap_or(true);
            state.calls.push(Call { operation, ok });
            ok
        }
    }

    impl InputAdapter for RecordingInput {
        fn available(&self) -> bool { self.error.is_none() }
        fn error(&self) -> Option<&str> { self.error.as_deref() }
        fn key(&mut self, scan: u16, ext: bool, down: bool) -> bool { self.record(Operation::Key { scan, ext, down }) }
        fn mouse_button(&mut self, left: bool, down: bool) -> bool { self.record(Operation::Button { left, down }) }
        fn mouse_move(&mut self, dx: i32, dy: i32) -> bool { self.record(Operation::Move { dx, dy }) }
        fn wheel(&mut self, notches: i32) -> bool { self.record(Operation::Wheel(notches)) }
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
