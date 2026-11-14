// Godot Engine 3・4 (#485)。書き出したゲームの PCK (独立した .pck、または exe の末尾に埋め込んだもの) の中の
// project.binary から、入力の割り当て (InputMap) を読む。
// project.binary は「ECFG」+ 項目数 (u32) + 項目 (キーの長さ u32・キー・値の長さ u32・値) の並び。
// キーが input/<操作名> の値 (Variant のバイナリ表現の辞書) の中の、イベントのクラス名 (InputEventKey など) と、
// その後ろのプロパティ (keycode・physical_keycode・scancode・button_index) の整数を拾う。
// PCK が暗号化されていれば ECFG が見つからないので読まない。組み込みの ui_* (メニューの操作) は出さない。
use std::path::{Path, PathBuf};

use super::{button, key_name};
use crate::game_actions::ReadAction;

/// これより大きいファイルは読まない (game_actions と同じ)
const MAX_FILE: u64 = 300_000_000;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    for file in candidates(dir) {
        if std::fs::metadata(&file)
            .map(|m| m.len())
            .unwrap_or(u64::MAX)
            > MAX_FILE
            || !pck_marker(&file)
        {
            continue;
        }
        let Ok(bytes) = std::fs::read(&file) else {
            continue;
        };
        if !is_pck(&bytes) {
            continue;
        }
        let actions = actions_from_project(&bytes);
        if !actions.is_empty() {
            return Some((actions, "Godot の project.binary の InputMap"));
        }
    }
    None
}

/// 独立した .pck と、PCK を埋め込んだかもしれない exe
fn candidates(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut pcks = Vec::new();
    let mut exes = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        let ext = p
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "pck" {
            pcks.push(p);
        } else if ext == "exe" {
            exes.push(p);
        }
    }
    pcks.sort();
    exes.sort();
    // .pck がなければ exe に埋め込まれている (末尾が GDPC)
    if pcks.is_empty() {
        exes
    } else {
        pcks
    }
}

/// ファイル全体を読む前に、先頭か末尾の 4 バイトだけで PCK かを確かめる (大きな exe を無駄に読まない)
fn pck_marker(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else {
        return false;
    };
    let mut head = [0u8; 4];
    if f.read_exact(&mut head).is_ok() && &head == b"GDPC" {
        return true;
    }
    let mut tail = [0u8; 4];
    f.seek(SeekFrom::End(-4)).is_ok() && f.read_exact(&mut tail).is_ok() && &tail == b"GDPC"
}

/// PCK の先頭 (独立した .pck) か末尾 (exe に埋め込み) に GDPC がある
pub fn is_pck(b: &[u8]) -> bool {
    b.starts_with(b"GDPC") || b.ends_with(b"GDPC")
}

fn u32_at(b: &[u8], o: usize) -> Option<usize> {
    Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?) as usize)
}

/// project.binary の項目 (キー, 値のバイト列)
pub fn project_entries(b: &[u8]) -> Vec<(String, &[u8])> {
    let mut from = 0;
    while let Some(pos) = b[from..]
        .windows(4)
        .position(|w| w == b"ECFG")
        .map(|p| p + from)
    {
        from = pos + 4;
        if let Some(entries) = parse_ecfg(b, pos) {
            return entries;
        }
    }
    Vec::new()
}

fn parse_ecfg(b: &[u8], pos: usize) -> Option<Vec<(String, &[u8])>> {
    let count = u32_at(b, pos + 4)?;
    if count == 0 || count > 100_000 {
        return None;
    }
    let mut o = pos + 8;
    let mut out = Vec::new();
    for _ in 0..count {
        let klen = u32_at(b, o)?;
        if klen == 0 || klen > 1024 {
            return None;
        }
        let key = std::str::from_utf8(b.get(o + 4..o + 4 + klen)?)
            .ok()?
            .to_string();
        o += 4 + klen;
        let vlen = u32_at(b, o)?;
        let value = b.get(o + 4..o + 4 + vlen)?;
        o += 4 + vlen;
        out.push((key, value));
    }
    // キーが設定の名前らしくなければ (偶然の ECFG) 使わない
    out.iter().any(|(k, _)| k.contains('/')).then_some(out)
}

/// 値の中の、長さ付きの文字列 name (Variant の String) の後ろの整数 (Variant の INT) を読む
fn int_after(v: &[u8], at: usize, name: &str) -> Option<i64> {
    // 名前の前の 4 バイトが長さ
    if at < 4 || u32_at(v, at - 4)? != name.len() {
        return None;
    }
    let after = (at + name.len() + 3) & !3;
    let header = u32_at(v, after)?;
    if header & 0xffff != 2 {
        return None;
    }
    if header & (1 << 16) != 0 {
        Some(i64::from_le_bytes(
            v.get(after + 4..after + 12)?.try_into().ok()?,
        ))
    } else {
        Some(i32::from_le_bytes(v.get(after + 4..after + 8)?.try_into().ok()?) as i64)
    }
}

fn find_all(hay: &[u8], needle: &[u8]) -> Vec<usize> {
    hay.windows(needle.len())
        .enumerate()
        .filter(|(_, w)| *w == needle)
        .map(|(i, _)| i)
        .collect()
}

/// 1 つの操作の値から、イベントごとの出力 (書かれた順)
pub fn events(v: &[u8]) -> Vec<Option<&'static str>> {
    // クラス名の位置で区切る
    let mut marks: Vec<(usize, &str)> = Vec::new();
    for class in [
        "InputEventKey",
        "InputEventMouseButton",
        "InputEventJoypadButton",
        "InputEventJoypadMotion",
    ] {
        for at in find_all(v, class.as_bytes()) {
            // InputEventKey は InputEventKeyboard などの一部ではない (直後が英字でない)
            if v.get(at + class.len())
                .is_some_and(|c| c.is_ascii_alphabetic())
            {
                continue;
            }
            marks.push((at, class));
        }
    }
    marks.sort();
    let mut out = Vec::new();
    for (i, (at, class)) in marks.iter().enumerate() {
        let end = marks.get(i + 1).map_or(v.len(), |m| m.0);
        let seg_start = *at;
        let seg = &v[..end];
        let prop = |name: &str| -> Option<i64> {
            find_all(&seg[seg_start..], name.as_bytes())
                .into_iter()
                .find_map(|p| int_after(seg, seg_start + p, name))
                .filter(|v| *v != 0)
        };
        let key = match *class {
            "InputEventKey" => prop("physical_keycode")
                .or_else(|| prop("keycode"))
                .or_else(|| prop("physical_scancode"))
                .or_else(|| prop("scancode"))
                .and_then(godot_key),
            "InputEventMouseButton" => match prop("button_index") {
                Some(1) => Some("MOUSE_L"),
                Some(2) => Some("MOUSE_R"),
                _ => None,
            },
            // ゲームパッドは送れない
            _ => continue,
        };
        out.push(key);
    }
    out
}

/// Godot のキーコード → 出力 ID。特殊なキーは Godot 4 が 1<<22、Godot 3 が 1<<24 から始まる
pub fn godot_key(code: i64) -> Option<&'static str> {
    let special = if code & (1 << 24) != 0 {
        Some(code - (1 << 24))
    } else if code & (1 << 22) != 0 {
        Some(code - (1 << 22))
    } else {
        None
    };
    if let Some(off) = special {
        let name = match off {
            0x01 => "escape",
            0x02 => "tab",
            0x04 => "backspace",
            0x05 => "enter",
            0x07 => "insert",
            0x08 => "delete",
            0x0d => "home",
            0x0e => "end",
            0x0f => "left",
            0x10 => "up",
            0x11 => "right",
            0x12 => "down",
            0x13 => "pageup",
            0x14 => "pagedown",
            0x15 => "shift",
            0x16 => "ctrl",
            0x18 => "alt",
            0x19 => "capslock",
            0x1c..=0x27 => return key_name(&format!("f{}", off - 0x1b)),
            _ => return None,
        };
        return key_name(name);
    }
    let c = u8::try_from(code).ok()?;
    let name = match c {
        b' ' => "space".to_string(),
        b'\'' => "apostrophe".into(),
        b',' => "comma".into(),
        b'-' => "minus".into(),
        b'.' => "period".into(),
        b'/' => "slash".into(),
        b';' => "semicolon".into(),
        b'=' => "equals".into(),
        b'[' => "leftbracket".into(),
        b'\\' => "backslash".into(),
        b']' => "rightbracket".into(),
        b'`' => "grave".into(),
        b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' => (c as char).to_ascii_lowercase().to_string(),
        _ => return None,
    };
    key_name(&name)
}

/// project.binary の input/* から操作を作る (ui_* は出さない)
pub fn actions_from_project(b: &[u8]) -> Vec<ReadAction> {
    let mut out = Vec::new();
    for (key, value) in project_entries(b) {
        let Some(name) = key.strip_prefix("input/") else {
            continue;
        };
        if name.starts_with("ui_") || name.is_empty() {
            continue;
        }
        let evs = events(value);
        if evs.is_empty() {
            continue;
        }
        let default = evs.iter().copied().flatten().next();
        out.push(button(
            format!("godot/{name}"),
            name.replace('_', " "),
            default,
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Variant の String (型 4、長さ、本体、4 バイト境界まで詰め物)
    fn vstr(out: &mut Vec<u8>, s: &str) {
        out.extend(4u32.to_le_bytes());
        out.extend((s.len() as u32).to_le_bytes());
        out.extend(s.as_bytes());
        while !out.len().is_multiple_of(4) {
            out.push(0);
        }
    }

    fn vint(out: &mut Vec<u8>, v: i64) {
        out.extend(2u32.to_le_bytes());
        out.extend((v as i32).to_le_bytes());
    }

    /// 辞書 {"deadzone": 0.5, "events": [Object(class, props...)]} のそれらしい並び
    fn action_value(events: &[(&str, &[(&str, i64)])]) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend(18u32.to_le_bytes());
        v.extend(2u32.to_le_bytes());
        vstr(&mut v, "deadzone");
        v.extend(3u32.to_le_bytes());
        v.extend(0.5f32.to_le_bytes());
        vstr(&mut v, "events");
        v.extend(19u32.to_le_bytes());
        v.extend((events.len() as u32).to_le_bytes());
        for (class, props) in events {
            v.extend(24u32.to_le_bytes());
            vstr(&mut v, class);
            v.extend((props.len() as u32).to_le_bytes());
            for (name, value) in *props {
                vstr(&mut v, name);
                vint(&mut v, *value);
            }
        }
        v
    }

    fn project(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut b = b"GDPC".to_vec();
        b.extend([0u8; 92]);
        b.extend(b"ECFG");
        b.extend((entries.len() as u32).to_le_bytes());
        for (k, v) in entries {
            b.extend((k.len() as u32).to_le_bytes());
            b.extend(k.as_bytes());
            b.extend((v.len() as u32).to_le_bytes());
            b.extend(v);
        }
        b
    }

    #[test]
    fn reads_input_map_of_godot_4_and_3() {
        let b = project(&[
            ("application/config/name", {
                let mut v = Vec::new();
                vstr(&mut v, "Test");
                v
            }),
            (
                "input/move_left",
                action_value(&[
                    ("InputEventKey", &[("keycode", 0), ("physical_keycode", 65)]),
                    ("InputEventKey", &[("physical_keycode", (1 << 22) | 0x0f)]),
                ]),
            ),
            (
                "input/jump",
                action_value(&[
                    ("InputEventJoypadButton", &[("button_index", 0)]),
                    ("InputEventKey", &[("physical_keycode", 32)]),
                ]),
            ),
            (
                "input/shoot",
                action_value(&[("InputEventMouseButton", &[("button_index", 1)])]),
            ),
            (
                "input/ui_accept",
                action_value(&[("InputEventKey", &[("physical_keycode", (1 << 22) | 0x05)])]),
            ),
            // Godot 3 の scancode (特殊なキーは 1<<24 から)
            (
                "input/dash",
                action_value(&[("InputEventKey", &[("scancode", (1 << 24) | 0x15)])]),
            ),
        ]);
        let a = actions_from_project(&b);
        let got: Vec<(&str, &str, Option<&str>)> = a
            .iter()
            .map(|a| (a.id.as_str(), a.label.as_str(), a.default))
            .collect();
        assert_eq!(
            got,
            [
                ("godot/move_left", "move left", Some("KEY_A")),
                ("godot/jump", "jump", Some("SPACE")),
                ("godot/shoot", "shoot", Some("MOUSE_L")),
                ("godot/dash", "dash", Some("LSHIFT")),
            ],
            "ui_* は出さない。ゲームパッドは飛ばして、最初の送れるキー"
        );
    }

    #[test]
    fn keycodes_map_to_outputs() {
        assert_eq!(godot_key(87), Some("KEY_W"));
        assert_eq!(godot_key((1 << 22) | 0x10), Some("ARROW_UP"));
        assert_eq!(godot_key((1 << 24) | 0x10), Some("ARROW_UP"));
        assert_eq!(godot_key((1 << 22) | 0x1c), Some("F1"));
        assert_eq!(godot_key((1 << 22) | 0x01), Some("ESC"));
        assert_eq!(godot_key(0x2a), None, "* は送れない");
    }

    #[test]
    fn encrypted_or_other_files_are_not_read() {
        assert!(actions_from_project(b"GDPC\0\0\0\0random bytes without the config").is_empty());
        assert!(!is_pck(b"MZ\x90\0"));
        let mut exe = b"MZ".to_vec();
        exe.extend(project(&[(
            "input/jump",
            action_value(&[("InputEventKey", &[("keycode", 32)])]),
        )]));
        exe.extend(b"GDPC");
        assert!(is_pck(&exe), "exe の末尾に埋め込んだ PCK");
        assert_eq!(actions_from_project(&exe)[0].default, Some("SPACE"));
    }
}
