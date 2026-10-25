// Minecraft のキー設定 (options.txt) を読み、スマホの操作 → PC へ送るキーの対応を作る (#101)。
// ユーザーがゲーム内でキーを変えていても、その設定に合わせて送る。ファイルは読むだけで書き換えない。
// 送れないキー (マウスの中ボタン等) や未設定の操作は、初期のキーで代用すると別の操作が動くため、送らずに警告する。

use std::path::{Path, PathBuf};

use crate::controls;

/// スマホの操作 → Minecraft の設定項目と表示名
const MINECRAFT_ACTIONS: &[(&str, &str, &str)] = &[
    ("FWD", "key.forward", "前進"),
    ("BACK", "key.back", "後退"),
    ("LEFT", "key.left", "左"),
    ("RIGHT", "key.right", "右"),
    ("JUMP", "key.jump", "ジャンプ"),
    ("SNEAK", "key.sneak", "スニーク"),
    ("SPRINT", "key.sprint", "ダッシュ"),
    ("ATTACK", "key.attack", "攻撃"),
    ("USE", "key.use", "使う"),
    ("INV", "key.inventory", "インベントリ"),
    ("DROP", "key.drop", "捨てる"),
];

/// 初期のキーを決めている役割 (role_control の参照に使う)
fn role_of(control: &str) -> &'static str {
    match control {
        "ATTACK" | "USE" | "INV" | "DROP" => "P3",
        _ => "P1",
    }
}

pub struct Keybinds {
    /// "options" (options.txt を読んだ) / "default" (読む対象でない・ファイルがない) / "unreadable" (読めない)
    pub source: &'static str,
    /// 操作 → 送る出力の ID。None は「送らない」(送れないキー・未設定)
    pub controls: Vec<(&'static str, Option<&'static str>)>,
    pub warnings: Vec<String>,
}

impl Keybinds {
    /// 初期のキー (Minecraft の初期設定と同じ)
    pub fn defaults(source: &'static str) -> Keybinds {
        let controls = MINECRAFT_ACTIONS.iter().map(|(c, _, _)| (*c, controls::role_control(role_of(c), c))).collect();
        Keybinds { source, controls, warnings: Vec::new() }
    }

    /// この操作の送り先。Some(None) は「送らない」、None はこの表で扱わない操作 (ホイール等)
    pub fn output_for(&self, control: &str) -> Option<Option<&'static str>> {
        self.controls.iter().find(|(c, _)| *c == control).map(|(_, o)| *o)
    }

    /// options.txt の中身から作る。書かれていない項目は初期のキーのまま
    pub fn from_minecraft_options(text: &str) -> Keybinds {
        let mut kb = Keybinds::defaults("options");
        for line in text.lines() {
            let Some((name, value)) = line.trim().strip_prefix("key_").and_then(|l| l.split_once(':')) else { continue };
            let Some(&(control, _, label)) = MINECRAFT_ACTIONS.iter().find(|(_, k, _)| *k == name) else { continue };
            let out = match minecraft_key(value.trim()) {
                Key::Output(id) => Some(id),
                Key::Unbound => {
                    kb.warnings.push(format!("「{label}」にキーが設定されていないため、送りません"));
                    None
                }
                Key::Unsupported(v) => {
                    kb.warnings.push(format!("「{label}」のキー（{v}）はまだ送れないため、送りません"));
                    None
                }
            };
            if let Some(slot) = kb.controls.iter_mut().find(|(c, _)| *c == control) {
                slot.1 = out;
            }
        }
        // 2 つの操作が同じキーだと、片方を押すと両方が動く
        for (i, (a, oa)) in kb.controls.iter().enumerate() {
            for (b, ob) in &kb.controls[i + 1..] {
                if oa.is_some() && oa == ob {
                    let label = |c: &str| MINECRAFT_ACTIONS.iter().find(|(x, _, _)| *x == c).map(|(_, _, l)| *l).unwrap_or("");
                    let key = controls::output(oa.unwrap()).map(|o| o.label).unwrap_or("");
                    kb.warnings.push(format!("「{}」と「{}」が同じキー（{key}）です", label(a), label(b)));
                }
            }
        }
        kb
    }

    /// options.txt を読む。ファイルがなければ初期のキー、読めなければ初期のキーで警告を付ける
    pub fn load_minecraft(path: Option<&Path>) -> Keybinds {
        let Some(path) = path else {
            return Keybinds::defaults("default");
        };
        match std::fs::read(path) {
            Ok(bytes) => Keybinds::from_minecraft_options(&String::from_utf8_lossy(&bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let mut kb = Keybinds::defaults("default");
                kb.warnings.push("Minecraftのキー設定（options.txt）が見つからないため、初期設定のキーで送ります".into());
                kb
            }
            Err(_) => {
                let mut kb = Keybinds::defaults("unreadable");
                kb.warnings.push("Minecraftのキー設定（options.txt）を読めないため、初期設定のキーで送ります".into());
                kb
            }
        }
    }
}

/// options.txt の場所: 環境変数 RECOOPLAY_MINECRAFT_OPTIONS → config.json の minecraftOptions → %APPDATA%\.minecraft\options.txt
pub fn minecraft_options_path(configured: Option<&str>) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_MINECRAFT_OPTIONS") {
        return Some(PathBuf::from(p));
    }
    if let Some(p) = configured {
        return Some(PathBuf::from(p));
    }
    std::env::var("APPDATA").ok().map(|a| Path::new(&a).join(".minecraft").join("options.txt"))
}

enum Key {
    Output(&'static str),
    Unbound,
    Unsupported(String),
}

/// options.txt のキーの値 → 出力の ID。新しい版は名前 (key.keyboard.w)、1.12 以前は番号 (LWJGL2 のキーコード) で書かれる
fn minecraft_key(value: &str) -> Key {
    if let Ok(n) = value.parse::<i32>() {
        // LWJGL2: 正の数はスキャンコード (0x80 以上は拡張キー)、0 は未設定、-100 から始まる負の数はマウスのボタン
        return match n {
            0 => Key::Unbound,
            -100 => Key::Output("MOUSE_L"),
            -99 => Key::Output("MOUSE_R"),
            n if n > 0 => {
                let (scan, ext) = if n >= 0x80 { ((n - 0x80) as u16, true) } else { (n as u16, false) };
                controls::output_by_scan(scan, ext).map_or(Key::Unsupported(value.to_string()), |o| Key::Output(o.id))
            }
            _ => Key::Unsupported(value.to_string()),
        };
    }
    if value == "key.keyboard.unknown" {
        return Key::Unbound;
    }
    if let Some(m) = value.strip_prefix("key.mouse.") {
        return match m {
            "left" => Key::Output("MOUSE_L"),
            "right" => Key::Output("MOUSE_R"),
            _ => Key::Unsupported(value.to_string()),
        };
    }
    let Some(k) = value.strip_prefix("key.keyboard.") else { return Key::Unsupported(value.to_string()) };
    let id: Option<&'static str> = match k {
        "space" => Some("SPACE"),
        "left.shift" => Some("LSHIFT"),
        "right.shift" => Some("RSHIFT"),
        "left.control" => Some("LCTRL"),
        "right.control" => Some("RCTRL"),
        "left.alt" => Some("LALT"),
        "right.alt" => Some("RALT"),
        "tab" => Some("TAB"),
        "caps.lock" => Some("CAPS_LOCK"),
        "backspace" => Some("BACKSPACE"),
        "enter" => Some("ENTER"),
        "escape" => Some("ESC"),
        "up" => Some("ARROW_UP"),
        "down" => Some("ARROW_DOWN"),
        "left" => Some("ARROW_LEFT"),
        "right" => Some("ARROW_RIGHT"),
        "grave.accent" => Some("GRAVE"),
        "minus" => Some("MINUS"),
        "equal" => Some("EQUAL"),
        "left.bracket" => Some("LBRACKET"),
        "right.bracket" => Some("RBRACKET"),
        "semicolon" => Some("SEMICOLON"),
        "apostrophe" => Some("APOSTROPHE"),
        "comma" => Some("COMMA"),
        "period" => Some("PERIOD"),
        "slash" => Some("SLASH"),
        "backslash" => Some("BACKSLASH"),
        "insert" => Some("INSERT"),
        "delete" => Some("DELETE"),
        "home" => Some("HOME"),
        "end" => Some("END"),
        "page.up" => Some("PAGE_UP"),
        "page.down" => Some("PAGE_DOWN"),
        _ => None,
    };
    let id = id.or_else(|| {
        let c = k.chars().next()?;
        let single = k.len() == 1;
        if single && c.is_ascii_lowercase() {
            controls::OUTPUTS.iter().find(|o| o.id.len() == 5 && o.id.starts_with("KEY_") && o.id.ends_with(c.to_ascii_uppercase())).map(|o| o.id)
        } else if single && c.is_ascii_digit() {
            controls::OUTPUTS.iter().find(|o| o.id.strip_prefix("DIGIT_") == Some(k)).map(|o| o.id)
        } else if let Some(n) = k.strip_prefix('f').filter(|n| n.parse::<u8>().is_ok()) {
            controls::OUTPUTS.iter().find(|o| o.id.strip_prefix('F') == Some(n)).map(|o| o.id)
        } else {
            None
        }
    });
    id.map_or(Key::Unsupported(value.to_string()), Key::Output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn out(kb: &Keybinds, c: &str) -> Option<&'static str> {
        kb.output_for(c).unwrap()
    }

    #[test]
    fn reads_rebound_keys() {
        // このPCで観測した設定: ダッシュ = Q、捨てる = R
        let kb = Keybinds::from_minecraft_options(
            "version:4325\nkey_key.forward:key.keyboard.w\nkey_key.sprint:key.keyboard.q\nkey_key.drop:key.keyboard.r\nkey_key.attack:key.mouse.left\nkey_key.sneak:key.keyboard.left.shift\n",
        );
        assert_eq!(kb.source, "options");
        assert_eq!(out(&kb, "SPRINT"), Some("KEY_Q"));
        assert_eq!(out(&kb, "DROP"), Some("KEY_R"));
        assert_eq!(out(&kb, "FWD"), Some("KEY_W"));
        assert_eq!(out(&kb, "ATTACK"), Some("MOUSE_L"));
        assert_eq!(out(&kb, "SNEAK"), Some("LSHIFT"));
        assert_eq!(out(&kb, "JUMP"), Some("SPACE")); // 書かれていない項目は初期のキー
        assert!(kb.warnings.is_empty(), "{:?}", kb.warnings);
        assert_eq!(kb.output_for("SLOT_NEXT"), None); // ホイールはこの表で扱わない
    }

    #[test]
    fn unsupported_and_unbound_keys_are_not_sent() {
        let kb = Keybinds::from_minecraft_options("key_key.use:key.mouse.middle\nkey_key.drop:key.keyboard.unknown\nkey_key.jump:key.keyboard.keypad.0\n");
        assert_eq!(out(&kb, "USE"), None);
        assert_eq!(out(&kb, "DROP"), None);
        assert_eq!(out(&kb, "JUMP"), None);
        assert_eq!(kb.warnings.len(), 3, "{:?}", kb.warnings);
    }

    #[test]
    fn duplicate_keys_are_warned() {
        let kb = Keybinds::from_minecraft_options("key_key.sprint:key.keyboard.q\nkey_key.drop:key.keyboard.q\n");
        assert_eq!(out(&kb, "SPRINT"), Some("KEY_Q"));
        assert!(kb.warnings.iter().any(|w| w.contains("ダッシュ") && w.contains("捨てる")), "{:?}", kb.warnings);
    }

    #[test]
    fn reads_legacy_numeric_codes() {
        // 1.12 以前: LWJGL2 のキーコード。17 = W、29 = 左Ctrl、157 = 右Ctrl (拡張)、-99 = 右クリック
        let kb = Keybinds::from_minecraft_options("key_key.forward:17\nkey_key.sprint:157\nkey_key.use:-99\nkey_key.drop:0\n");
        assert_eq!(out(&kb, "FWD"), Some("KEY_W"));
        assert_eq!(out(&kb, "SPRINT"), Some("RCTRL"));
        assert_eq!(out(&kb, "USE"), Some("MOUSE_R"));
        assert_eq!(out(&kb, "DROP"), None);
    }

    #[test]
    fn missing_file_falls_back_to_defaults() {
        let kb = Keybinds::load_minecraft(Some(Path::new("Z:/no/such/options.txt")));
        assert_eq!(kb.source, "default");
        assert_eq!(out(&kb, "SPRINT"), Some("LCTRL"));
        assert_eq!(out(&kb, "DROP"), Some("KEY_Q"));
        assert_eq!(kb.warnings.len(), 1);
    }

    #[test]
    fn letters_digits_and_function_keys() {
        let kb = Keybinds::from_minecraft_options("key_key.jump:key.keyboard.z\nkey_key.drop:key.keyboard.7\nkey_key.inventory:key.keyboard.f5\n");
        assert_eq!(out(&kb, "JUMP"), Some("KEY_Z"));
        assert_eq!(out(&kb, "DROP"), Some("DIGIT_7"));
        assert_eq!(out(&kb, "INV"), Some("F5"));
    }
}
