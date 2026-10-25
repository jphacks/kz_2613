// ユーザーが変えたキー割当をゲームの設定ファイルから読み、操作定義 (profiles) の初期キーに重ねる (#99・#101)。
// ファイルは読むだけで書き換えない。ゲームのコードは実行しない。
// 送れないキー (マウスの中ボタン等) や未設定の操作は、初期のキーで代用すると別の操作が動くため、送らずに警告する。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::controls;
use crate::profiles::Profile;

pub struct Keybinds {
    /// "user" (設定ファイルを読んだ) / "default" (読む対象がない・ファイルがない) / "unreadable" (読めない) / "none" (定義なし)
    pub source: &'static str,
    /// 定義の操作 ID → 送る出力の ID。None は「送らない」
    pub actions: Vec<(String, Option<&'static str>)>,
    /// スマホの操作名 → 送る出力の ID (今の操作画面と結び付く操作だけ)
    pub controls: Vec<(String, Option<&'static str>)>,
    pub warnings: Vec<String>,
    file: Option<PathBuf>,
    modified: Option<SystemTime>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Key {
    Output(&'static str),
    Unbound,
    Unsupported(String),
}

impl Keybinds {
    /// 定義のないゲーム: 固定の表 (controls::role_control) をそのまま使う
    pub fn none() -> Keybinds {
        Keybinds { source: "none", actions: Vec::new(), controls: Vec::new(), warnings: Vec::new(), file: None, modified: None }
    }

    /// この操作の送り先。Some(None) は「送らない」、None はこの表で扱わない操作
    pub fn output_for(&self, control: &str) -> Option<Option<&'static str>> {
        self.controls.iter().find(|(c, _)| c == control).map(|(_, o)| *o)
    }

    /// 設定ファイルが読んだ時から変わったか (更新日時で判断する)
    pub fn changed(&self) -> bool {
        let Some(f) = &self.file else { return false };
        std::fs::metadata(f).and_then(|m| m.modified()).ok() != self.modified
    }

    /// 定義の初期キーに、ユーザーの設定ファイルのキーを重ねる。override_path は設定ファイルの場所の上書き (config.json 等)
    pub fn build(p: &Profile, override_path: Option<&Path>) -> Keybinds {
        let mut kb = Keybinds {
            source: "default",
            actions: p.actions.iter().map(|a| (a.id.clone(), a.default)).collect(),
            controls: Vec::new(),
            warnings: Vec::new(),
            file: None,
            modified: None,
        };
        if let Some(ub) = p.user_bindings.as_ref().filter(|u| u.reader != "none") {
            let path = override_path.map(Path::to_path_buf).or_else(|| expand(&ub.path));
            kb.file = path.clone();
            kb.modified = path.as_ref().and_then(|f| std::fs::metadata(f).and_then(|m| m.modified()).ok());
            match path.as_ref().map(std::fs::read) {
                Some(Ok(bytes)) => {
                    let text = String::from_utf8_lossy(&bytes);
                    let text = text.trim_start_matches('\u{feff}');
                    match read(&ub.reader, text) {
                        Some(map) => {
                            kb.source = "user";
                            for (i, a) in p.actions.iter().enumerate() {
                                if a.kind != "button" {
                                    continue; // 視点・ホイールは固定の出力
                                }
                                let Some(key) = a.bind.as_ref().and_then(|b| map.get(b)) else { continue };
                                kb.actions[i].1 = match key {
                                    Key::Output(id) => Some(*id),
                                    Key::Unbound => {
                                        kb.warnings.push(format!("「{}」にキーが設定されていないため、送りません", a.label));
                                        None
                                    }
                                    Key::Unsupported(v) => {
                                        kb.warnings.push(format!("「{}」のキー（{v}）はまだ送れないため、送りません", a.label));
                                        None
                                    }
                                };
                            }
                        }
                        None => {
                            kb.source = "unreadable";
                            kb.warnings.push(format!("{}のキー設定を読めないため、初期設定のキーで送ります", p.name));
                        }
                    }
                }
                Some(Err(e)) if e.kind() != std::io::ErrorKind::NotFound => {
                    kb.source = "unreadable";
                    kb.warnings.push(format!("{}のキー設定を読めないため、初期設定のキーで送ります", p.name));
                }
                _ => kb.warnings.push(format!("{}のキー設定が見つからないため、初期設定のキーで送ります", p.name)),
            }
        }
        // 2 つの操作が同じキーだと、片方を押すと両方が動く
        let buttons: Vec<(&str, &'static str)> = p
            .actions
            .iter()
            .zip(&kb.actions)
            .filter(|(a, _)| a.kind == "button")
            .filter_map(|(a, (_, o))| o.map(|o| (a.label.as_str(), o)))
            .collect();
        for (i, (la, oa)) in buttons.iter().enumerate() {
            for (lb, ob) in &buttons[i + 1..] {
                if oa == ob {
                    let key = controls::output(oa).map(|o| o.label).unwrap_or("");
                    kb.warnings.push(format!("「{la}」と「{lb}」が同じキー（{key}）です"));
                }
            }
        }
        kb.controls = p
            .actions
            .iter()
            .zip(&kb.actions)
            .filter_map(|(a, (_, o))| a.control.as_ref().map(|c| (c.clone(), *o)))
            .collect();
        kb
    }
}

/// 設定ファイルの場所の展開: %APPDATA% / %LOCALAPPDATA% / %USERPROFILE% / %LOCALLOW% / %DOCUMENTS%
pub fn expand(path: &str) -> Option<PathBuf> {
    let env = |k: &str| std::env::var(k).ok();
    let mut out = path.to_string();
    for (token, value) in [
        ("%APPDATA%", env("APPDATA")),
        ("%LOCALAPPDATA%", env("LOCALAPPDATA")),
        ("%USERPROFILE%", env("USERPROFILE")),
        ("%LOCALLOW%", env("USERPROFILE").map(|u| format!("{u}/AppData/LocalLow"))),
        ("%DOCUMENTS%", documents_dir().map(|d| d.to_string_lossy().to_string())),
    ] {
        if out.contains(token) {
            out = out.replace(token, &value?);
        }
    }
    Some(PathBuf::from(out))
}

/// 「ドキュメント」の場所 (OneDrive へ移されている場合も含めて Windows に問い合わせる)
fn documents_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::{FOLDERID_Documents, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
        if let Ok(p) = SHGetKnownFolderPath(&FOLDERID_Documents, KF_FLAG_DEFAULT, None) {
            let s = p.to_string().ok();
            CoTaskMemFree(Some(p.0 as *const _));
            return s.map(PathBuf::from);
        }
    }
    std::env::var("USERPROFILE").ok().map(|u| Path::new(&u).join("Documents"))
}

/// Minecraft の options.txt の場所の上書き: 環境変数 RECOOPLAY_MINECRAFT_OPTIONS → config.json の minecraftOptions
pub fn minecraft_override(configured: Option<&str>) -> Option<PathBuf> {
    std::env::var("RECOOPLAY_MINECRAFT_OPTIONS").ok().or_else(|| configured.map(str::to_string)).map(PathBuf::from)
}

// ---------- 設定ファイルの読み方 (設定ファイル上の名前 → キー) ----------

/// 読めない形式なら None
pub fn read(reader: &str, text: &str) -> Option<HashMap<String, Key>> {
    match reader {
        "minecraft-options" => Some(minecraft_options(text)),
        "terraria-input-profiles" => terraria(text),
        "es3-keybindings" => es3_bindings(text),
        "unity-inputsystem-json" => unity_overrides(text),
        "ue-input-ini" => Some(ue_input_ini(text)),
        "source-cfg" => Some(source_cfg(text)),
        _ => None,
    }
}

/// Minecraft: `key_key.forward:key.keyboard.w` (1.12 以前は番号)
fn minecraft_options(text: &str) -> HashMap<String, Key> {
    text.lines()
        .filter_map(|l| l.trim().strip_prefix("key_")?.split_once(':'))
        .map(|(name, value)| (name.to_string(), minecraft_key(value.trim())))
        .collect()
}

/// Terraria / tModLoader: input profiles.json の、選択中のプロファイルの "Mouse And Keyboard" (ゲーム中の操作)
fn terraria(text: &str) -> Option<HashMap<String, Key>> {
    let j: serde_json::Value = serde_json::from_str(text).ok()?;
    let sel = j.get("Selected Profile")?.as_str()?;
    let kb = j.get(sel)?.get("Mouse And Keyboard")?.as_object()?;
    Some(
        kb.iter()
            .map(|(name, v)| {
                let first = v.as_array().and_then(|a| a.iter().filter_map(|x| x.as_str()).next());
                (name.clone(), first.map_or(Key::Unbound, |k| name_key(k)))
            })
            .collect(),
    )
}

/// Easy Save 3 で保存された Unity Input System の上書き (R.E.P.O. の CurrentKeyBindings.es3)。
/// `0:["2DVector","<Keyboard>/w",...]` の形。2DVector は "番号/up" "番号/down" "番号/left" "番号/right" に分ける
fn es3_bindings(text: &str) -> Option<HashMap<String, Key>> {
    let body = &text[text.find("bindingOverrides")?..];
    let mut map = HashMap::new();
    let mut rest = body;
    while let Some(colon) = rest.find(":[") {
        let head = &rest[..colon];
        let num: String = head.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect();
        let Some(end) = rest[colon..].find(']') else { break };
        let items: Vec<String> = rest[colon + 2..colon + end]
            .split('"')
            .skip(1)
            .step_by(2)
            .map(|x| x.replace("\\/", "/"))
            .collect();
        if !num.is_empty() {
            if items.first().is_some_and(|f| f.eq_ignore_ascii_case("2DVector")) {
                for (part, path) in ["up", "down", "left", "right"].iter().zip(items.iter().skip(1)) {
                    map.insert(format!("{num}/{part}"), unity_path(path));
                }
            } else if let Some(first) = items.first() {
                map.insert(num, unity_path(first));
            }
        }
        rest = &rest[colon + end..];
    }
    (!map.is_empty()).then_some(map)
}

/// Unity Input System の SaveBindingOverridesAsJson の形式: {"bindings":[{"action":"Player/Jump","path":"<Keyboard>/space"}]}
fn unity_overrides(text: &str) -> Option<HashMap<String, Key>> {
    let j: serde_json::Value = serde_json::from_str(text).ok()?;
    let mut map = HashMap::new();
    for b in j.get("bindings")?.as_array()? {
        let (Some(action), Some(path)) = (b.get("action").and_then(|v| v.as_str()), b.get("path").and_then(|v| v.as_str())) else { continue };
        map.entry(action.to_string()).or_insert_with(|| if path.is_empty() { Key::Unbound } else { unity_path(path) });
    }
    Some(map)
}

/// Unreal Engine 4 の Input.ini: ActionMappings=(ActionName="Jump",...,Key=SpaceBar) / AxisMappings=(AxisName="MoveForward",Scale=1.0,Key=W)。
/// 軸は "名前/+" "名前/-" に分ける。ゲームパッドのキーは飛ばす
fn ue_input_ini(text: &str) -> HashMap<String, Key> {
    let mut map = HashMap::new();
    let field = |line: &str, k: &str| -> Option<String> {
        let i = line.find(&format!("{k}="))? + k.len() + 1;
        let v: String = line[i..].trim_start_matches('"').chars().take_while(|c| !matches!(c, '"' | ',' | ')')).collect();
        Some(v)
    };
    for line in text.lines() {
        let l = line.trim().trim_start_matches(['+', '-', '.']);
        let Some(key) = field(l, "Key") else { continue };
        if key.starts_with("Gamepad") || key.starts_with("MotionController") {
            continue;
        }
        let name = if l.starts_with("ActionMappings") {
            field(l, "ActionName")
        } else if l.starts_with("AxisMappings") {
            let scale: f64 = field(l, "Scale").and_then(|s| s.parse().ok()).unwrap_or(1.0);
            field(l, "AxisName").map(|n| format!("{n}/{}", if scale < 0.0 { '-' } else { '+' }))
        } else {
            None
        };
        if let Some(n) = name {
            map.entry(n).or_insert_with(|| name_key(&key));
        }
    }
    map
}

/// Source エンジンの config.cfg: bind "w" "+forward" → "+forward" の操作は W
fn source_cfg(text: &str) -> HashMap<String, Key> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('"').collect();
        if line.trim_start().starts_with("bind") && parts.len() >= 4 {
            map.entry(parts[3].to_string()).or_insert_with(|| name_key(parts[1]));
        }
    }
    map
}

// ---------- キー名 → 出力 ----------

/// Unity Input System のパス: <Keyboard>/w、<Mouse>/leftButton など
fn unity_path(path: &str) -> Key {
    let p = path.trim();
    if let Some(k) = p.strip_prefix("<Keyboard>/") {
        return name_key(k);
    }
    match p {
        "<Mouse>/leftButton" => Key::Output("MOUSE_L"),
        "<Mouse>/rightButton" => Key::Output("MOUSE_R"),
        "" => Key::Unbound,
        _ => Key::Unsupported(p.to_string()),
    }
}

/// エンジン共通のキー名 (XNA / Unreal / Source / Unity のキー名の表記ゆれをまとめる)
pub fn name_key(name: &str) -> Key {
    let n: String = name.trim().chars().filter(|c| !matches!(c, ' ' | '_' | '-')).collect::<String>().to_ascii_lowercase();
    let id: Option<&'static str> = match n.as_str() {
        "" | "none" | "unknown" => return Key::Unbound,
        "space" | "spacebar" => Some("SPACE"),
        "enter" | "return" => Some("ENTER"),
        "escape" | "esc" => Some("ESC"),
        "tab" => Some("TAB"),
        "backspace" => Some("BACKSPACE"),
        "capslock" | "capital" => Some("CAPS_LOCK"),
        "leftshift" | "lshift" | "shift" => Some("LSHIFT"),
        "rightshift" | "rshift" => Some("RSHIFT"),
        "leftcontrol" | "leftctrl" | "lctrl" | "ctrl" | "control" => Some("LCTRL"),
        "rightcontrol" | "rightctrl" | "rctrl" => Some("RCTRL"),
        "leftalt" | "lalt" | "alt" => Some("LALT"),
        "rightalt" | "ralt" => Some("RALT"),
        "up" | "uparrow" => Some("ARROW_UP"),
        "down" | "downarrow" => Some("ARROW_DOWN"),
        "left" | "leftarrow" => Some("ARROW_LEFT"),
        "right" | "rightarrow" => Some("ARROW_RIGHT"),
        "mouse1" | "leftmousebutton" | "leftbutton" | "mouseleft" => Some("MOUSE_L"),
        "mouse2" | "rightmousebutton" | "rightbutton" | "mouseright" => Some("MOUSE_R"),
        "mwheelup" | "mousewheelup" | "mousescrollup" | "wheelup" => Some("WHEEL_UP"),
        "mwheeldown" | "mousewheeldown" | "mousescrolldown" | "wheeldown" => Some("WHEEL_DOWN"),
        "insert" | "ins" => Some("INSERT"),
        "delete" | "del" => Some("DELETE"),
        "home" => Some("HOME"),
        "end" => Some("END"),
        "pageup" | "pgup" => Some("PAGE_UP"),
        "pagedown" | "pgdn" => Some("PAGE_DOWN"),
        "tilde" | "grave" | "backquote" | "oemtilde" => Some("GRAVE"),
        "minus" | "oemminus" | "hyphen" => Some("MINUS"),
        "equals" | "equal" | "oemplus" => Some("EQUAL"),
        "leftbracket" | "oemopenbrackets" => Some("LBRACKET"),
        "rightbracket" | "oemclosebrackets" => Some("RBRACKET"),
        "semicolon" | "oemsemicolon" => Some("SEMICOLON"),
        "apostrophe" | "quote" | "oemquotes" => Some("APOSTROPHE"),
        "comma" | "oemcomma" => Some("COMMA"),
        "period" | "oemperiod" => Some("PERIOD"),
        "slash" | "oemquestion" => Some("SLASH"),
        "backslash" | "oempipe" | "oembackslash" => Some("BACKSLASH"),
        _ => None,
    };
    if let Some(id) = id {
        return Key::Output(id);
    }
    // 1 文字の英字・数字、D1 / Alpha1 / Digit1 / One、F1〜F12
    let digit_words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    let digit = n
        .strip_prefix("alpha")
        .or_else(|| n.strip_prefix("digit"))
        .or_else(|| n.strip_prefix('d').filter(|d| d.len() == 1))
        .or(Some(n.as_str()).filter(|d| d.len() == 1 && d.chars().all(|c| c.is_ascii_digit())))
        .map(str::to_string)
        .or_else(|| digit_words.iter().position(|w| *w == n).map(|i| i.to_string()));
    if let Some(d) = digit.filter(|d| d.len() == 1 && d.chars().all(|c| c.is_ascii_digit())) {
        if let Some(o) = controls::OUTPUTS.iter().find(|o| o.id.strip_prefix("DIGIT_") == Some(d.as_str())) {
            return Key::Output(o.id);
        }
    }
    if n.len() == 1 && n.chars().all(|c| c.is_ascii_lowercase()) {
        let want = format!("KEY_{}", n.to_ascii_uppercase());
        if let Some(o) = controls::OUTPUTS.iter().find(|o| o.id == want) {
            return Key::Output(o.id);
        }
    }
    if let Some(f) = n.strip_prefix('f').filter(|f| f.parse::<u8>().is_ok()) {
        let want = format!("F{f}");
        if let Some(o) = controls::OUTPUTS.iter().find(|o| o.id == want) {
            return Key::Output(o.id);
        }
    }
    Key::Unsupported(name.to_string())
}

/// Minecraft のキーの値。新しい版は名前 (key.keyboard.w)、1.12 以前は番号 (LWJGL2 のキーコード)
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
    // Minecraft の名前はドット区切り (left.shift、page.up、grave.accent)。方向キーは矢印
    let key = match k {
        "left" => return Key::Output("ARROW_LEFT"),
        "right" => return Key::Output("ARROW_RIGHT"),
        "up" => return Key::Output("ARROW_UP"),
        "down" => return Key::Output("ARROW_DOWN"),
        "grave.accent" => "grave",
        "caps.lock" => "capslock",
        other if other.starts_with("keypad.") => return Key::Unsupported(value.to_string()),
        other => other,
    };
    match name_key(&key.replace('.', "")) {
        Key::Unsupported(_) => Key::Unsupported(value.to_string()),
        k => k,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles;

    fn out(kb: &Keybinds, c: &str) -> Option<&'static str> {
        kb.output_for(c).unwrap()
    }

    fn with_file(text: &str) -> Keybinds {
        let dir = std::env::temp_dir().join(format!("recooplay-kb-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join(format!("options-{}.txt", text.len()));
        std::fs::write(&f, text).unwrap();
        Keybinds::build(&profiles::builtin_minecraft(), Some(&f))
    }

    #[test]
    fn minecraft_rebound_keys() {
        // このPCで観測した設定: ダッシュ = Q、捨てる = R
        let kb = with_file("key_key.forward:key.keyboard.w\nkey_key.sprint:key.keyboard.q\nkey_key.drop:key.keyboard.r\nkey_key.attack:key.mouse.left\nkey_key.sneak:key.keyboard.left.shift\n");
        assert_eq!(kb.source, "user");
        assert_eq!(out(&kb, "SPRINT"), Some("KEY_Q"));
        assert_eq!(out(&kb, "DROP"), Some("KEY_R"));
        assert_eq!(out(&kb, "SNEAK"), Some("LSHIFT"));
        assert_eq!(out(&kb, "JUMP"), Some("SPACE"));
        assert!(kb.warnings.is_empty(), "{:?}", kb.warnings);
    }

    #[test]
    fn minecraft_unsupported_unbound_duplicate_legacy() {
        let kb = with_file("key_key.use:key.mouse.middle\nkey_key.drop:key.keyboard.unknown\nkey_key.sprint:key.keyboard.e\n");
        assert_eq!(out(&kb, "USE"), None);
        assert_eq!(out(&kb, "DROP"), None);
        assert!(kb.warnings.iter().any(|w| w.contains("ダッシュ") && w.contains("インベントリ")), "{:?}", kb.warnings);
        let legacy = with_file("key_key.forward:17\nkey_key.sprint:157\nkey_key.use:-99\n");
        assert_eq!(out(&legacy, "FWD"), Some("KEY_W"));
        assert_eq!(out(&legacy, "SPRINT"), Some("RCTRL"));
        assert_eq!(out(&legacy, "USE"), Some("MOUSE_R"));
    }

    #[test]
    fn missing_file_uses_defaults() {
        let kb = Keybinds::build(&profiles::builtin_minecraft(), Some(Path::new("Z:/no/such/options.txt")));
        assert_eq!(kb.source, "default");
        assert_eq!(out(&kb, "SPRINT"), Some("LCTRL"));
        assert_eq!(kb.warnings.len(), 1);
    }

    #[test]
    fn readers_and_key_names() {
        let t = read("terraria-input-profiles", r#"{"Selected Profile":"Custom","Custom":{"Mouse And Keyboard":{"Jump":["Space"],"Grapple":["E"],"MouseLeft":["Mouse1"],"Hotbar1":["D1"]}}}"#).unwrap();
        assert_eq!(t["Jump"], Key::Output("SPACE"));
        assert_eq!(t["MouseLeft"], Key::Output("MOUSE_L"));
        assert_eq!(t["Hotbar1"], Key::Output("DIGIT_1"));
        let r = read("es3-keybindings", "{\"bindingOverrides\" : {0:[\"2DVector\",\"<Keyboard>\\/w\",\"<Keyboard>\\/s\",\"<Keyboard>\\/a\",\"<Keyboard>\\/d\"],15:[\"<Keyboard>\\/leftShift\"],10:[\"<Mouse>\\/leftButton\"]}}").unwrap();
        assert_eq!(r["0/up"], Key::Output("KEY_W"));
        assert_eq!(r["0/right"], Key::Output("KEY_D"));
        assert_eq!(r["15"], Key::Output("LSHIFT"));
        assert_eq!(r["10"], Key::Output("MOUSE_L"));
        let u = read("ue-input-ini", "+ActionMappings=(ActionName=\"Jump\",bShift=False,Key=SpaceBar)\n+AxisMappings=(AxisName=\"MoveForward\",Scale=-1.000000,Key=S)\n+ActionMappings=(ActionName=\"Jump\",Key=Gamepad_FaceButton_Bottom)").unwrap();
        assert_eq!(u["Jump"], Key::Output("SPACE"));
        assert_eq!(u["MoveForward/-"], Key::Output("KEY_S"));
        let s = read("source-cfg", "bind \"w\" \"+forward\"\nbind \"MOUSE1\" \"+attack\"\nbind \"SHIFT\" \"+speed\"").unwrap();
        assert_eq!(s["+forward"], Key::Output("KEY_W"));
        assert_eq!(s["+attack"], Key::Output("MOUSE_L"));
        assert_eq!(s["+speed"], Key::Output("LSHIFT"));
        let j = read("unity-inputsystem-json", r#"{"bindings":[{"action":"Player/Jump","id":"x","path":"<Keyboard>/f","interactions":"","processors":""}]}"#).unwrap();
        assert_eq!(j["Player/Jump"], Key::Output("KEY_F"));
        assert_eq!(name_key("F5"), Key::Output("F5"));
        assert_eq!(name_key("Alpha3"), Key::Output("DIGIT_3"));
        assert!(matches!(name_key("NumPad0"), Key::Unsupported(_)));
    }
}
