// Creation Engine (Bethesda：Skyrim・Fallout 4・Starfield など) の ControlMap (#486)。
// 利用者の割当 `Documents\My Games\<ゲーム>\ControlMap_Custom.txt` (タブ区切り：操作名、キーボード (DirectInput の
// キーコード、16 進)、マウス、ゲームパッド…) の最初のまとまり (遊びの操作) を読む。
// ControlMap_Custom.txt がないとき (キーを変えたことがない) は、Skyrim だけ既定の割当の表を使う。
// 既定の ControlMap.txt はアーカイブ (.bsa・.ba2) の中にあり、圧縮の形式が作品で違うので、まだ読まない。
use std::path::{Path, PathBuf};

use super::{button, child_ci, dik_key, has_file, look, read_text};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let game = which(dir)?;
    if let Some(text) = custom_file(game).and_then(|p| read_text(&p)) {
        let actions = actions_from_control_map(&text);
        if !actions.is_empty() {
            return Some((actions, "Creation Engine の ControlMap_Custom.txt"));
        }
    }
    (game == Game::Skyrim).then(|| (skyrim_defaults(), "Skyrim の既定の割当"))
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Game {
    Skyrim,
    Fallout4,
    Starfield,
}

/// 実行ファイルとデータ (.esm) から作品を見分ける
fn which(dir: &Path) -> Option<Game> {
    let data = child_ci(dir, "Data").unwrap_or_else(|| dir.to_path_buf());
    if !has_file(&data, |n| n.ends_with(".esm")) && !has_file(dir, |n| n.ends_with(".esm")) {
        return None;
    }
    if child_ci(dir, "SkyrimSE.exe").is_some() {
        Some(Game::Skyrim)
    } else if child_ci(dir, "Fallout4.exe").is_some() {
        Some(Game::Fallout4)
    } else if child_ci(dir, "Starfield.exe").is_some() {
        Some(Game::Starfield)
    } else {
        None
    }
}

fn custom_file(game: Game) -> Option<PathBuf> {
    let folder = match game {
        Game::Skyrim => "Skyrim Special Edition",
        Game::Fallout4 => "Fallout4",
        Game::Starfield => "Starfield",
    };
    let docs = crate::keybinds::expand("%DOCUMENTS%")?;
    let p = docs
        .join("My Games")
        .join(folder)
        .join("ControlMap_Custom.txt");
    p.is_file().then_some(p)
}

/// 操作名 (英語の内部名) の日本語のラベル。None は分担に出さない (メニュー・開発用)
fn event_label(name: &str) -> Option<&'static str> {
    Some(match name {
        "Forward" => "前進",
        "Back" => "後退",
        "Strafe Left" => "左へ移動",
        "Strafe Right" => "右へ移動",
        "Move" => return None,
        "Look" => return None,
        "Left Attack/Block" => "左手・防御",
        "Right Attack/Block" => "右手・攻撃",
        "Primary Attack" => "攻撃",
        "Secondary Attack" => "狙う・防御",
        "Activate" => "使う・調べる",
        "Ready Weapon" => "武器を構える",
        "Tween Menu" => "メニュー",
        "Toggle POV" => "視点の切り替え",
        "Zoom Out" | "Zoom In" => return None,
        "Jump" => "ジャンプ",
        "Sprint" => "走る",
        "Shout" => "シャウト",
        "Sneak" => "しゃがむ・隠れる",
        "Run" => "走る・歩くの切り替え",
        "Toggle Always Run" => return None,
        "Auto-Move" => "自動で進む",
        "Favorites" => "お気に入り",
        "Hotkey1" | "Hotkey2" | "Hotkey3" | "Hotkey4" | "Hotkey5" | "Hotkey6" | "Hotkey7"
        | "Hotkey8" => "ホットキー",
        "Quicksave" | "Quickload" | "Console" | "Screenshot" | "Journal" | "Pause"
        | "Multi-Screenshot" => return None,
        "Wait" => "待機",
        "Quick Inventory" => "持ち物",
        "Quick Magic" => "魔法",
        "Quick Stats" => "スキル",
        "Quick Map" => "地図",
        "Reload" => "リロード",
        "VATS" => "V.A.T.S.",
        "Pipboy" => "Pip-Boy",
        "Grenade" | "Throw" => "投げる",
        "Melee" | "Bash" => "近接攻撃",
        _ => return None,
    })
}

/// 1 つの欄の値 (「0x11」や「0x11,0x2a」) の最初のキー
fn first_code(field: &str) -> Option<u32> {
    field
        .split(',')
        .filter_map(|v| {
            u32::from_str_radix(
                v.trim().trim_start_matches("0x").trim_start_matches("0X"),
                16,
            )
            .ok()
        })
        .find(|v| *v != 0xff && *v != 0xffff_ffff)
}

/// マウスの欄：0 = 左、1 = 右 (ほかのボタン・ホイールは送らない)
fn mouse_key(code: u32) -> Option<&'static str> {
    match code {
        0 => Some("MOUSE_L"),
        1 => Some("MOUSE_R"),
        _ => None,
    }
}

/// ControlMap の最初のまとまり (空行またはコメントの見出しまで) を操作にする
pub fn actions_from_control_map(text: &str) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    let mut started = false;
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() || line.trim_start().starts_with("//") {
            if started {
                break;
            }
            continue;
        }
        started = true;
        let cols: Vec<&str> = line.split('\t').filter(|c| !c.is_empty()).collect();
        let Some(&name) = cols.first() else { continue };
        let Some(label) = event_label(name.trim()) else {
            continue;
        };
        let key = cols
            .get(1)
            .and_then(|c| first_code(c))
            .and_then(dik_key)
            .or_else(|| cols.get(2).and_then(|c| first_code(c)).and_then(mouse_key));
        let id = format!("creation/{}", name.trim());
        if !out.iter().any(|a| a.id == id) {
            out.push(button(id, label, key));
        }
    }
    if !out.is_empty() {
        out.push(look("creation/look", "視点"));
    }
    out
}

/// Skyrim Special Edition の既定のキー (PC)
pub fn skyrim_defaults() -> Vec<ReadAction> {
    let k = |id: &str, label: &str, key: &'static str| {
        button(format!("creation/{id}"), label, Some(key))
    };
    vec![
        k("Forward", "前進", "KEY_W"),
        k("Back", "後退", "KEY_S"),
        k("Strafe Left", "左へ移動", "KEY_A"),
        k("Strafe Right", "右へ移動", "KEY_D"),
        k("Right Attack/Block", "右手・攻撃", "MOUSE_L"),
        k("Left Attack/Block", "左手・防御", "MOUSE_R"),
        k("Activate", "使う・調べる", "KEY_E"),
        k("Ready Weapon", "武器を構える", "KEY_R"),
        k("Jump", "ジャンプ", "SPACE"),
        k("Sprint", "走る", "LALT"),
        k("Sneak", "しゃがむ・隠れる", "LCTRL"),
        k("Shout", "シャウト", "KEY_Z"),
        k("Tween Menu", "メニュー", "TAB"),
        k("Favorites", "お気に入り", "KEY_Q"),
        k("Toggle POV", "視点の切り替え", "KEY_F"),
        k("Wait", "待機", "KEY_T"),
        look("creation/look", "視点"),
    ]
}

/// 利用者のキー設定のファイル (#524)
pub fn user_config(dir: &Path) -> Option<PathBuf> {
    custom_file(which(dir)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_map_first_block_becomes_actions() {
        let text = "// Main Gameplay\n\
Forward\t0x11\t0xff\t0x0001\t1\t1\t0\t0x8\n\
Back\t0x1f\t0xff\t0x0002\t1\t1\t0\t0x8\n\
Strafe Left\t0x1e\t0xff\t0x0004\t1\t1\t0\t0x8\n\
Right Attack/Block\t0xff\t0x0\t0x0009\t1\t1\t0\t0x8\n\
Jump\t0x39\t0xff\t0x8000\t1\t1\t0\t0x8\n\
Console\t0x29\t0xff\t0xff\t0\t0\t0\t0x8\n\
Activate\t0x12,0x1c\t0xff\t0x1000\t1\t1\t0\t0x8\n\
\n\
// Menu Mode\n\
Accept\t0x1c\t0xff\t0x1000\t0\t0\t0\t0x8\n";
        let a = actions_from_control_map(text);
        let ids: Vec<&str> = a.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "creation/Forward",
                "creation/Back",
                "creation/Strafe Left",
                "creation/Right Attack/Block",
                "creation/Jump",
                "creation/Activate",
                "creation/look"
            ],
            "コンソールとメニューのまとまりは出さない"
        );
        assert_eq!(a[0].default, Some("KEY_W"));
        assert_eq!(a[3].default, Some("MOUSE_L"), "キーボードがなければマウス");
        assert_eq!(a[4].default, Some("SPACE"));
        assert_eq!(a[5].default, Some("KEY_E"), "複数のキーは最初のもの");
    }

    #[test]
    fn skyrim_defaults_are_sendable() {
        let a = skyrim_defaults();
        assert!(a
            .iter()
            .filter(|a| a.kind == "button")
            .all(|a| a.default.is_some()));
        assert_eq!(dik_key(0x38), Some("LALT"));
    }
}
