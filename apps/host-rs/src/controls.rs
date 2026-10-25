// スマホの操作 (control) と PC への出力 (output) の対応表 (Node 版 controls.js と同じ)

#[derive(Clone, Copy, Debug)]
pub enum Kind {
    Key { scan: u16, ext: bool },
    Mouse { left: bool },
    Wheel { notches: i32 },
}

impl Kind {
    pub fn name(&self) -> &'static str {
        match self {
            Kind::Key { .. } => "key",
            Kind::Mouse { .. } => "mouse",
            Kind::Wheel { .. } => "wheel",
        }
    }
}

pub struct Output {
    pub id: &'static str,
    pub label: &'static str,
    pub kind: Kind,
    /// ブラウザの KeyboardEvent.code (疑似ゲーム画面での照合用)
    pub code: Option<&'static str>,
}

const fn key(id: &'static str, label: &'static str, scan: u16, ext: bool, code: &'static str) -> Output {
    Output { id, label, kind: Kind::Key { scan, ext }, code: Some(code) }
}

pub static OUTPUTS: &[Output] = &[
    key("KEY_W", "W", 0x11, false, "KeyW"),
    key("KEY_A", "A", 0x1e, false, "KeyA"),
    key("KEY_S", "S", 0x1f, false, "KeyS"),
    key("KEY_D", "D", 0x20, false, "KeyD"),
    key("SPACE", "Space", 0x39, false, "Space"),
    key("LSHIFT", "Shift", 0x2a, false, "ShiftLeft"),
    key("LCTRL", "Ctrl", 0x1d, false, "ControlLeft"),
    key("KEY_E", "E", 0x12, false, "KeyE"),
    key("KEY_Q", "Q", 0x10, false, "KeyQ"),
    key("ARROW_UP", "↑", 0x48, true, "ArrowUp"),
    key("ARROW_DOWN", "↓", 0x50, true, "ArrowDown"),
    key("ARROW_LEFT", "←", 0x4b, true, "ArrowLeft"),
    key("ARROW_RIGHT", "→", 0x4d, true, "ArrowRight"),
    key("ENTER", "Enter", 0x1c, false, "Enter"),
    key("ESC", "Esc", 0x01, false, "Escape"),
    // ゲームのキー設定に合わせて送れるよう、主なキーを用意する (#101)
    key("KEY_B", "B", 0x30, false, "KeyB"),
    key("KEY_C", "C", 0x2e, false, "KeyC"),
    key("KEY_F", "F", 0x21, false, "KeyF"),
    key("KEY_G", "G", 0x22, false, "KeyG"),
    key("KEY_H", "H", 0x23, false, "KeyH"),
    key("KEY_I", "I", 0x17, false, "KeyI"),
    key("KEY_J", "J", 0x24, false, "KeyJ"),
    key("KEY_K", "K", 0x25, false, "KeyK"),
    key("KEY_L", "L", 0x26, false, "KeyL"),
    key("KEY_M", "M", 0x32, false, "KeyM"),
    key("KEY_N", "N", 0x31, false, "KeyN"),
    key("KEY_O", "O", 0x18, false, "KeyO"),
    key("KEY_P", "P", 0x19, false, "KeyP"),
    key("KEY_R", "R", 0x13, false, "KeyR"),
    key("KEY_T", "T", 0x14, false, "KeyT"),
    key("KEY_U", "U", 0x16, false, "KeyU"),
    key("KEY_V", "V", 0x2f, false, "KeyV"),
    key("KEY_X", "X", 0x2d, false, "KeyX"),
    key("KEY_Y", "Y", 0x15, false, "KeyY"),
    key("KEY_Z", "Z", 0x2c, false, "KeyZ"),
    key("DIGIT_0", "0", 0x0b, false, "Digit0"),
    key("DIGIT_1", "1", 0x02, false, "Digit1"),
    key("DIGIT_2", "2", 0x03, false, "Digit2"),
    key("DIGIT_3", "3", 0x04, false, "Digit3"),
    key("DIGIT_4", "4", 0x05, false, "Digit4"),
    key("DIGIT_5", "5", 0x06, false, "Digit5"),
    key("DIGIT_6", "6", 0x07, false, "Digit6"),
    key("DIGIT_7", "7", 0x08, false, "Digit7"),
    key("DIGIT_8", "8", 0x09, false, "Digit8"),
    key("DIGIT_9", "9", 0x0a, false, "Digit9"),
    key("F1", "F1", 0x3b, false, "F1"),
    key("F2", "F2", 0x3c, false, "F2"),
    key("F3", "F3", 0x3d, false, "F3"),
    key("F4", "F4", 0x3e, false, "F4"),
    key("F5", "F5", 0x3f, false, "F5"),
    key("F6", "F6", 0x40, false, "F6"),
    key("F7", "F7", 0x41, false, "F7"),
    key("F8", "F8", 0x42, false, "F8"),
    key("F9", "F9", 0x43, false, "F9"),
    key("F10", "F10", 0x44, false, "F10"),
    key("F11", "F11", 0x57, false, "F11"),
    key("F12", "F12", 0x58, false, "F12"),
    key("RSHIFT", "右Shift", 0x36, false, "ShiftRight"),
    key("RCTRL", "右Ctrl", 0x1d, true, "ControlRight"),
    key("LALT", "Alt", 0x38, false, "AltLeft"),
    key("RALT", "右Alt", 0x38, true, "AltRight"),
    key("TAB", "Tab", 0x0f, false, "Tab"),
    key("CAPS_LOCK", "CapsLock", 0x3a, false, "CapsLock"),
    key("BACKSPACE", "Backspace", 0x0e, false, "Backspace"),
    key("GRAVE", "`", 0x29, false, "Backquote"),
    key("MINUS", "-", 0x0c, false, "Minus"),
    key("EQUAL", "=", 0x0d, false, "Equal"),
    key("LBRACKET", "[", 0x1a, false, "BracketLeft"),
    key("RBRACKET", "]", 0x1b, false, "BracketRight"),
    key("SEMICOLON", ";", 0x27, false, "Semicolon"),
    key("APOSTROPHE", "'", 0x28, false, "Quote"),
    key("COMMA", ",", 0x33, false, "Comma"),
    key("PERIOD", ".", 0x34, false, "Period"),
    key("SLASH", "/", 0x35, false, "Slash"),
    key("BACKSLASH", "\\", 0x2b, false, "Backslash"),
    key("INSERT", "Insert", 0x52, true, "Insert"),
    key("DELETE", "Delete", 0x53, true, "Delete"),
    key("HOME", "Home", 0x47, true, "Home"),
    key("END", "End", 0x4f, true, "End"),
    key("PAGE_UP", "PageUp", 0x49, true, "PageUp"),
    key("PAGE_DOWN", "PageDown", 0x51, true, "PageDown"),
    Output { id: "MOUSE_L", label: "左クリック", kind: Kind::Mouse { left: true }, code: None },
    Output { id: "MOUSE_R", label: "右クリック", kind: Kind::Mouse { left: false }, code: None },
    Output { id: "WHEEL_UP", label: "ホイール↑", kind: Kind::Wheel { notches: 1 }, code: None },
    Output { id: "WHEEL_DOWN", label: "ホイール↓", kind: Kind::Wheel { notches: -1 }, code: None },
];

pub fn output(id: &str) -> Option<&'static Output> {
    OUTPUTS.iter().find(|o| o.id == id)
}

/// スキャンコード (拡張キーかどうかを含む) から出力を引く
pub fn output_by_scan(scan: u16, ext: bool) -> Option<&'static Output> {
    OUTPUTS.iter().find(|o| matches!(o.kind, Kind::Key { scan: s, ext: e } if s == scan && e == ext))
}

/// ホストのリモコン (ロビー / 一時停止中に P1 だけが使える)
pub fn remote_control(control: &str) -> Option<&'static str> {
    Some(match control {
        "UP" => "ARROW_UP",
        "DOWN" => "ARROW_DOWN",
        "LEFT" => "ARROW_LEFT",
        "RIGHT" => "ARROW_RIGHT",
        "ENTER" => "ENTER",
        "ESC" => "ESC",
        "REMOTE_LEFT" => "MOUSE_L",
        "REMOTE_RIGHT" => "MOUSE_R",
        "REMOTE_E" => "KEY_E",
        "REMOTE_WHEEL_UP" => "WHEEL_UP",
        "REMOTE_WHEEL_DOWN" => "WHEEL_DOWN",
        _ => return None,
    })
}

/// 協力プレイ中の役割ごとの操作 (P2 の視点は look メッセージでマウス移動)
pub fn role_control(slot: &str, control: &str) -> Option<&'static str> {
    Some(match (slot, control) {
        ("P1", "FWD") => "KEY_W",
        ("P1", "BACK") => "KEY_S",
        ("P1", "LEFT") => "KEY_A",
        ("P1", "RIGHT") => "KEY_D",
        ("P1", "JUMP") => "SPACE",
        ("P1", "SNEAK") => "LSHIFT",
        ("P1", "SPRINT") => "LCTRL",
        ("P3", "ATTACK") => "MOUSE_L",
        ("P3", "USE") => "MOUSE_R",
        ("P3", "INV") => "KEY_E",
        ("P3", "DROP") => "KEY_Q",
        ("P3", "SLOT_PREV") => "WHEEL_UP",
        ("P3", "SLOT_NEXT") => "WHEEL_DOWN",
        _ => return None,
    })
}
