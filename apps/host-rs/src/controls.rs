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
    Output { id: "MOUSE_L", label: "左クリック", kind: Kind::Mouse { left: true }, code: None },
    Output { id: "MOUSE_R", label: "右クリック", kind: Kind::Mouse { left: false }, code: None },
    Output { id: "WHEEL_UP", label: "ホイール↑", kind: Kind::Wheel { notches: 1 }, code: None },
    Output { id: "WHEEL_DOWN", label: "ホイール↓", kind: Kind::Wheel { notches: -1 }, code: None },
];

pub fn output(id: &str) -> Option<&'static Output> {
    OUTPUTS.iter().find(|o| o.id == id)
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
