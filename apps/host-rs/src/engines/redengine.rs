// REDengine (CD PROJEKT RED) (#505)。
// - Cyberpunk 2077：r6/config/inputUserMappings.xml の <mapping name="..."> と、その中の <button id="IK_W" val="-1.0"/>
// - The Witcher 3：Documents\The Witcher 3\input.settings の [Exploration]・[Combat] の `IK_W=(Action=MoveForward)`
// キー名は IK_* (REDengine の表記)。Cyberpunk 2077 の利用者の変更 (UserSettings.json) は形式を実物で確かめていないので、まだ読まない。
use std::path::Path;

use super::{button, child_ci, key_name, look, read_text};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let bin = child_ci(dir, "bin").and_then(|b| child_ci(&b, "x64"));
    let bin12 = child_ci(dir, "bin").and_then(|b| child_ci(&b, "x64_dx12"));
    let has = |n: &str| {
        bin.as_ref().and_then(|b| child_ci(b, n)).is_some()
            || bin12.as_ref().and_then(|b| child_ci(b, n)).is_some()
    };
    if has("Cyberpunk2077.exe") {
        let xml = read_text(&dir.join("r6").join("config").join("inputUserMappings.xml"))?;
        let a = actions_from_mappings(&xml);
        return (!a.is_empty()).then_some((a, "Cyberpunk 2077 の inputUserMappings.xml"));
    }
    if has("witcher3.exe") {
        let docs = crate::keybinds::expand("%DOCUMENTS%")?;
        let text = read_text(&docs.join("The Witcher 3").join("input.settings"))?;
        let a = actions_from_input_settings(&text);
        return (!a.is_empty()).then_some((a, "The Witcher 3 の input.settings"));
    }
    None
}

/// REDengine のキー名 (IK_W・IK_Space・IK_LeftMouse など) → 出力 ID
pub fn ik_key(id: &str) -> Option<&'static str> {
    let n = id.trim().strip_prefix("IK_")?.to_ascii_lowercase();
    match n.as_str() {
        "leftmouse" => Some("MOUSE_L"),
        "rightmouse" => Some("MOUSE_R"),
        "lshift" | "shift" => Some("LSHIFT"),
        "rshift" => Some("RSHIFT"),
        "lcontrol" | "control" | "ctrl" => Some("LCTRL"),
        "rcontrol" => Some("RCTRL"),
        "alt" | "lalt" => Some("LALT"),
        "ralt" => Some("RALT"),
        n if n.starts_with("pad_") || n.contains("mouse") || n.starts_with("numpad") => None,
        n => key_name(n),
    }
}

/// 属性 name="..." の値
fn attr(tag: &str, name: &str) -> Option<String> {
    let pat = format!("{name}=\"");
    let i = tag.find(&pat)? + pat.len();
    let end = tag[i..].find('"')?;
    Some(tag[i..i + end].to_string())
}

/// 操作名の語尾 (_Button・_Axis など) を外したラベル
fn clean(name: &str) -> String {
    let n = ["_Button", "_Axis", "_Hold", "_Press"]
        .iter()
        .fold(name.to_string(), |n, s| n.trim_end_matches(s).to_string());
    n.replace('_', " ")
}

/// inputUserMappings.xml の <mapping> から操作を作る。val が負・正のボタンは別の操作に分ける。マウスの軸は視点
pub fn actions_from_mappings(xml: &str) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    let mut has_look = false;
    let mut from = 0;
    while let Some(i) = xml[from..].find("<mapping ").map(|i| i + from) {
        let Some(open_end) = xml[i..].find('>').map(|e| e + i) else {
            break;
        };
        let tag = &xml[i..open_end];
        let close = if tag.ends_with('/') {
            open_end
        } else {
            xml[open_end..]
                .find("</mapping>")
                .map_or(xml.len(), |c| c + open_end)
        };
        from = close.max(open_end + 1);
        let Some(name) = attr(tag, "name") else {
            continue;
        };
        let body = &xml[open_end..close];
        let mut neg: Option<&'static str> = None;
        let mut pos: Option<&'static str> = None;
        let mut any_axis = false;
        let mut b_from = 0;
        while let Some(j) = body[b_from..].find("<button ").map(|j| j + b_from) {
            let end = body[j..].find('>').map_or(body.len(), |e| e + j);
            b_from = end;
            let btag = &body[j..end];
            let Some(id) = attr(btag, "id") else { continue };
            if id.eq_ignore_ascii_case("IK_MouseX") || id.eq_ignore_ascii_case("IK_MouseY") {
                has_look = true;
                continue;
            }
            let Some(k) = ik_key(&id) else { continue };
            let val = attr(btag, "val").and_then(|v| v.parse::<f32>().ok());
            any_axis |= val.is_some();
            if val.is_some_and(|v| v < 0.0) {
                neg = neg.or(Some(k));
            } else {
                pos = pos.or(Some(k));
            }
        }
        let label = clean(&name);
        if any_axis && neg.is_some() {
            out.push(button(format!("red/{name}/-"), format!("{label} -"), neg));
            out.push(button(format!("red/{name}/+"), format!("{label} +"), pos));
        } else if pos.is_some() && !out.iter().any(|a| a.id == format!("red/{name}")) {
            out.push(button(format!("red/{name}"), label, pos));
        }
    }
    if has_look {
        out.push(look("red/look", "視点"));
    }
    out
}

/// input.settings の遊びの節 ([Exploration]・[Combat]) の `IK_W=(Action=MoveForward)` から操作を作る
pub fn actions_from_input_settings(text: &str) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    let mut has_look = false;
    let mut on = false;
    for line in text.lines() {
        let line = line.trim();
        if let Some(sec) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            on = sec == "Exploration" || sec == "Combat";
            continue;
        }
        if !on {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let Some(action) = value
            .find("Action=")
            .map(|i| &value[i + 7..])
            .map(|v| v.split([',', ')']).next().unwrap_or("").trim())
            .filter(|a| !a.is_empty())
        else {
            continue;
        };
        // マウスの軸は視点にまとめる (キーに割り当てた軸は、ボタンとして出す)
        if key.eq_ignore_ascii_case("IK_MouseX") || key.eq_ignore_ascii_case("IK_MouseY") {
            has_look = true;
            continue;
        }
        let Some(k) = ik_key(key) else { continue };
        let id = format!("red/{action}");
        match out.iter_mut().find(|a| a.id == id) {
            Some(a) => a.default = a.default.or(Some(k)),
            None => out.push(button(id, action.to_string(), Some(k))),
        }
    }
    if has_look {
        out.push(look("red/look", "視点"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const CP_XML: &str = r#"<?xml version="1.0"?>
<bindings>
  <mapping name="LeftX_Axis" type="Axis">
    <button id="IK_A" val="-1.0" />
    <button id="IK_D" val="1.0" />
    <button id="IK_Pad_LeftAxisX" />
  </mapping>
  <mapping name="Jump_Button" type="Button">
    <button id="IK_Space" />
    <button id="IK_Pad_A_CROSS" />
  </mapping>
  <mapping name="Shoot_Button" type="Button">
    <button id="IK_LeftMouse" />
  </mapping>
  <mapping name="MouseX_Axis" type="Axis">
    <button id="IK_MouseX" />
  </mapping>
  <mapping name="PadOnly" type="Button">
    <button id="IK_Pad_B_CIRCLE" />
  </mapping>
</bindings>"#;

    pub const W3_SETTINGS: &str = "[Exploration]\r\nIK_W=(Action=MoveForward)\r\nIK_Up=(Action=MoveForward)\r\nIK_S=(Action=MoveBackward)\r\nIK_Space=(Action=Jump)\r\nIK_LShift=(Action=Sprint)\r\nIK_MouseX=(Action=GI_MouseDampX,State=Axis,IdleTime=0)\r\nIK_Pad_A_CROSS=(Action=Interact)\r\n\r\n[Combat]\r\nIK_LeftMouse=(Action=AttackLight)\r\nIK_W=(Action=MoveForward)\r\n\r\n[Horse]\r\nIK_X=(Action=HorseDismount)\r\n";

    #[test]
    fn cyberpunk_mappings_become_actions() {
        let a = actions_from_mappings(CP_XML);
        let got: Vec<(&str, &str, Option<&str>)> = a
            .iter()
            .map(|a| (a.id.as_str(), a.label.as_str(), a.default))
            .collect();
        assert_eq!(
            got,
            [
                ("red/LeftX_Axis/-", "LeftX -", Some("KEY_A")),
                ("red/LeftX_Axis/+", "LeftX +", Some("KEY_D")),
                ("red/Jump_Button", "Jump", Some("SPACE")),
                ("red/Shoot_Button", "Shoot", Some("MOUSE_L")),
                ("red/look", "視点", None),
            ],
            "ゲームパッドだけの操作は出さない"
        );
    }

    #[test]
    fn witcher_settings_become_actions() {
        let a = actions_from_input_settings(W3_SETTINGS);
        let got: Vec<(&str, Option<&str>)> = a.iter().map(|a| (a.id.as_str(), a.default)).collect();
        assert_eq!(
            got,
            [
                ("red/MoveForward", Some("KEY_W")),
                ("red/MoveBackward", Some("KEY_S")),
                ("red/Jump", Some("SPACE")),
                ("red/Sprint", Some("LSHIFT")),
                ("red/AttackLight", Some("MOUSE_L")),
                ("red/look", None),
            ],
            "馬 (Horse) の節は出さない。同じ操作は最初のキー"
        );
        assert_eq!(ik_key("IK_Pad_A_CROSS"), None);
        assert_eq!(ik_key("IK_Escape"), Some("ESC"));
    }
}
