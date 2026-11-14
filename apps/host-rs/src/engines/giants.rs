// GIANTS Engine (Farming Simulator) (#507)。
// Documents\My Games\FarmingSimulator20xx\inputBinding.xml の <actionBinding action="..."> の中の、
// キーボード・マウス (device="KB_MOUSE_DEFAULT") の <binding input="KEY_w" axisComponent="+"/> を読む。
// 操作が多い (乗り物・道具ごと) ので、歩き・運転・乗り降り・道具の中心の操作を先に並べ、上限で切る。
use std::path::Path;

use super::{button, child_ci, key_name, look, read_text};
use crate::game_actions::ReadAction;

/// 出す操作の上限 (分担しやすい数に絞る)
const LIMIT: usize = 40;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let text = read_text(&user_config_path(dir)?)?;
    let a = actions_from_bindings(&text);
    (!a.is_empty()).then_some((a, "GIANTS Engine の inputBinding.xml"))
}

/// 利用者のキー設定のファイル (#524)
pub fn user_config(dir: &Path) -> Option<std::path::PathBuf> {
    user_config_path(dir).filter(|p| p.is_file())
}

fn user_config_path(dir: &Path) -> Option<std::path::PathBuf> {
    let year = ["2025", "2022", "2019"].into_iter().find(|y| {
        let exe = format!("FarmingSimulator{y}.exe");
        child_ci(dir, &exe).is_some()
            || child_ci(dir, "x64")
                .and_then(|x| child_ci(&x, &format!("FarmingSimulator{y}Game.exe")))
                .is_some()
    })?;
    let docs = crate::keybinds::expand("%DOCUMENTS%")?;
    Some(
        docs.join("My Games")
            .join(format!("FarmingSimulator{year}"))
            .join("inputBinding.xml"),
    )
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let pat = format!("{name}=\"");
    let i = tag.find(&pat)? + pat.len();
    let end = tag[i..].find('"')?;
    Some(tag[i..i + end].to_string())
}

/// GIANTS のキー名 (KEY_w・KEY_lshift・MOUSE_BUTTON_LEFT など) → 出力 ID
pub fn giants_key(input: &str) -> Option<&'static str> {
    // 「KEY_lctrl KEY_w」のような同時押しは送れない
    if input.trim().contains(' ') {
        return None;
    }
    match input.trim() {
        "MOUSE_BUTTON_LEFT" => return Some("MOUSE_L"),
        "MOUSE_BUTTON_RIGHT" => return Some("MOUSE_R"),
        _ => {}
    }
    let k = input.trim().strip_prefix("KEY_")?.to_ascii_lowercase();
    match k.as_str() {
        "lshift" => Some("LSHIFT"),
        "rshift" => Some("RSHIFT"),
        "lctrl" => Some("LCTRL"),
        "rctrl" => Some("RCTRL"),
        "lalt" => Some("LALT"),
        "ralt" => Some("RALT"),
        "return" => Some("ENTER"),
        "esc" => Some("ESC"),
        k if k.starts_with("kp_") => None,
        k => key_name(k),
    }
}

/// 遊びの中心の操作を先にする並び (小さいほど先)
fn priority(action: &str) -> u8 {
    let a = action.to_ascii_uppercase();
    if a.contains("MOVE") && a.contains("PLAYER") {
        0
    } else if a.contains("ACCELERATE")
        || a.contains("BRAKE")
        || a.contains("MOVE_SIDE_VEHICLE")
        || a.contains("STEER")
    {
        1
    } else if a == "ENTER"
        || a.contains("JUMP")
        || a.contains("RUN")
        || a.contains("CROUCH")
        || a.contains("ACTIVATE")
        || a.contains("INTERACT")
    {
        2
    } else if a.starts_with("IMPLEMENT")
        || a.contains("LOWER")
        || a.contains("TOGGLE")
        || a.contains("ATTACH")
    {
        3
    } else if a.starts_with("MENU")
        || a.contains("CAMERA")
        || a.contains("CHAT")
        || a.contains("PAUSE")
        || a.contains("SWITCH_VEHICLE")
    {
        9
    } else {
        5
    }
}

pub fn actions_from_bindings(xml: &str) -> Vec<ReadAction> {
    let mut found: Vec<(u8, usize, ReadAction)> = Vec::new();
    let mut has_look = false;
    let mut from = 0;
    while let Some(i) = xml[from..].find("<actionBinding ").map(|i| i + from) {
        let Some(open_end) = xml[i..].find('>').map(|e| e + i) else {
            break;
        };
        let close = xml[open_end..]
            .find("</actionBinding>")
            .map_or(xml.len(), |c| c + open_end);
        from = close.max(open_end + 1);
        let Some(action) = attr(&xml[i..open_end], "action") else {
            continue;
        };
        let body = &xml[open_end..close];
        let (mut neg, mut pos, mut axis) = (None, None, false);
        let mut b_from = 0;
        while let Some(j) = body[b_from..].find("<binding ").map(|j| j + b_from) {
            let end = body[j..].find('>').map_or(body.len(), |e| e + j);
            b_from = end;
            let tag = &body[j..end];
            if attr(tag, "device").as_deref() != Some("KB_MOUSE_DEFAULT") {
                continue;
            }
            let Some(input) = attr(tag, "input") else {
                continue;
            };
            if input.starts_with("MOUSE_AXIS") {
                has_look = true;
                continue;
            }
            let Some(k) = giants_key(&input) else {
                continue;
            };
            match attr(tag, "axisComponent").as_deref() {
                Some("-") => {
                    axis = true;
                    neg = neg.or(Some(k));
                }
                Some("+") => {
                    axis = true;
                    pos = pos.or(Some(k));
                }
                _ => pos = pos.or(Some(k)),
            }
        }
        let p = priority(&action);
        let label = action
            .trim_start_matches("AXIS_")
            .replace('_', " ")
            .to_ascii_lowercase();
        let n = found.len();
        if axis && neg.is_some() {
            found.push((
                p,
                n,
                button(format!("giants/{action}/-"), format!("{label} -"), neg),
            ));
            found.push((
                p,
                n + 1,
                button(format!("giants/{action}/+"), format!("{label} +"), pos),
            ));
        } else if pos.is_some() {
            found.push((p, n, button(format!("giants/{action}"), label, pos)));
        }
    }
    found.sort_by_key(|(p, n, _)| (*p, *n));
    let mut out: Vec<ReadAction> = found.into_iter().map(|(_, _, a)| a).take(LIMIT).collect();
    if has_look {
        out.push(look("giants/look", "視点"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const BINDINGS: &str = r#"<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<inputBinding>
    <actionBinding action="MENU_ACCEPT">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_return" index="1" />
    </actionBinding>
    <actionBinding action="AXIS_MOVE_FORWARD_PLAYER">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_s" axisComponent="-" neutralInput="0" index="1" />
        <binding device="KB_MOUSE_DEFAULT" input="KEY_w" axisComponent="+" neutralInput="0" index="1" />
        <binding device="0_XINPUT_GAMEPAD" input="AXIS_2" axisComponent="+" index="1" />
    </actionBinding>
    <actionBinding action="JUMP">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_space" index="1" />
    </actionBinding>
    <actionBinding action="AXIS_LOOK_LEFTRIGHT_PLAYER">
        <binding device="KB_MOUSE_DEFAULT" input="MOUSE_AXIS_X" axisComponent="+" index="1" />
    </actionBinding>
    <actionBinding action="IMPLEMENT_EXTRA">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_lctrl KEY_v" index="1" />
    </actionBinding>
    <actionBinding action="ENTER">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_e" index="1" />
    </actionBinding>
</inputBinding>"#;

    #[test]
    fn bindings_become_actions() {
        let a = actions_from_bindings(BINDINGS);
        let got: Vec<(&str, Option<&str>)> = a.iter().map(|a| (a.id.as_str(), a.default)).collect();
        assert_eq!(
            got,
            [
                ("giants/AXIS_MOVE_FORWARD_PLAYER/-", Some("KEY_S")),
                ("giants/AXIS_MOVE_FORWARD_PLAYER/+", Some("KEY_W")),
                ("giants/JUMP", Some("SPACE")),
                ("giants/ENTER", Some("KEY_E")),
                ("giants/MENU_ACCEPT", Some("ENTER")),
                ("giants/look", None),
            ],
            "歩き・乗り降りを先に、メニューは後。同時押しは出さない"
        );
        assert_eq!(a[0].label, "move forward player -");
    }
}
