// Project Zomboid (#509)。%USERPROFILE%\Zomboid\Lua\keys.ini の `Forward=17` を読む。
// 値は Build 41 までは LWJGL 2 のキーコード (= DirectInput のスキャンコード)、Build 42 からは LWJGL 3 (GLFW) のキーコードの
// 可能性がある。移動のキー (Forward など) の値で見分ける：DirectInput なら W = 17、GLFW なら W = 87。
use std::path::Path;

use super::{button, child_ci, dik_key, key_name, look, read_text};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if child_ci(dir, "ProjectZomboid64.exe").is_none() || child_ci(dir, "media").is_none() {
        return None;
    }
    let home = crate::keybinds::expand("%USERPROFILE%")?;
    let text = read_text(&home.join("Zomboid").join("Lua").join("keys.ini"))?;
    let a = actions_from_keys(&text);
    (!a.is_empty()).then_some((a, "Project Zomboid の keys.ini"))
}

/// GLFW のキーコード → 出力 ID
fn glfw_key(code: u32) -> Option<&'static str> {
    let name = match code {
        32 => "space".to_string(),
        48..=57 | 65..=90 => char::from(code as u8).to_ascii_lowercase().to_string(),
        256 => "escape".into(),
        257 => "enter".into(),
        258 => "tab".into(),
        259 => "backspace".into(),
        262 => "right".into(),
        263 => "left".into(),
        264 => "down".into(),
        265 => "up".into(),
        290..=301 => format!("f{}", code - 289),
        340 => "leftshift".into(),
        341 => "leftctrl".into(),
        342 => "leftalt".into(),
        _ => return None,
    };
    key_name(&name)
}

/// 操作名の日本語のラベル (ほかは名前のまま)。None は分担に出さない
fn label(name: &str) -> Option<String> {
    Some(
        match name {
            "Forward" => "前進",
            "Backward" => "後退",
            "Left" => "左へ移動",
            "Right" => "右へ移動",
            "Run" => "走る",
            "Sprint" => "全力で走る",
            "Crouch" => "しゃがむ・隠れる",
            "Melee" => "近接攻撃",
            "Aim" => "構える",
            "Interact" => "使う・調べる",
            "Toggle Inventory" => "持ち物",
            "Equip/Turn On/Off Light Source" => "ライト",
            "Shout" => "叫ぶ",
            "ReloadWeapon" => "リロード",
            "Rack Firearm" => "弾を込める",
            "Main Menu"
            | "Toggle Lua Debugger"
            | "Toggle UI"
            | "Take screenshot"
            | "Zoom in"
            | "Zoom out"
            | "Display FPS"
            | "VERSION" => return None,
            other => return Some(other.to_string()),
        }
        .to_string(),
    )
}

pub fn actions_from_keys(text: &str) -> Vec<ReadAction> {
    let pairs: Vec<(&str, u32)> = text
        .lines()
        .filter_map(|l| l.split_once('='))
        .filter_map(|(k, v)| Some((k.trim(), v.trim().parse::<u32>().ok()?)))
        .collect();
    let forward = pairs.iter().find(|(k, _)| *k == "Forward").map(|(_, v)| *v);
    let glfw = matches!(forward, Some(65..=90) | Some(265));
    let mut out: Vec<ReadAction> = Vec::new();
    for (name, code) in pairs {
        let Some(l) = label(name) else { continue };
        if code == 0 {
            continue;
        }
        let key = if glfw { glfw_key(code) } else { dik_key(code) };
        let id = format!("zomboid/{name}");
        if !out.iter().any(|a| a.id == id) {
            out.push(button(id, l, key));
        }
    }
    if !out.is_empty() {
        // マウスの向きで狙う・歩く向きを決めるので、視点 (マウスの移動) も出す
        out.push(look("zomboid/look", "向き（マウス）"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_ini_in_both_codes() {
        let b41 = "VERSION=2\nForward=17\nBackward=31\nLeft=30\nRight=32\nRun=42\nMelee=57\nMain Menu=1\nUnbound=0\n";
        let a = actions_from_keys(b41);
        let got: Vec<(&str, Option<&str>)> = a.iter().map(|a| (a.id.as_str(), a.default)).collect();
        assert_eq!(
            got,
            [
                ("zomboid/Forward", Some("KEY_W")),
                ("zomboid/Backward", Some("KEY_S")),
                ("zomboid/Left", Some("KEY_A")),
                ("zomboid/Right", Some("KEY_D")),
                ("zomboid/Run", Some("LSHIFT")),
                ("zomboid/Melee", Some("SPACE")),
                ("zomboid/look", None),
            ],
            "メニューと未割当は出さない"
        );
        let b42 = "Forward=87\nBackward=83\nRun=340\n";
        let a = actions_from_keys(b42);
        assert_eq!(a[0].default, Some("KEY_W"), "GLFW のキーコード");
        assert_eq!(a[2].default, Some("LSHIFT"));
    }
}
