// CryEngine・Lumberyard (#489)。pak (中身は zip) の中の actionmaps の XML (Libs/Config/defaultProfile.xml など) を読む。
// <action name="moveforward" keyboard="w" /> の属性の形と、<action name="..."><keyboard input="w" /></action> の形を読む。
// 暗号化された pak (zip として読めない、または項目が暗号化) は読まない。
use std::path::{Path, PathBuf};

use super::{button, key_name, look, zip};
use crate::game_actions::ReadAction;

/// これより大きい pak は読まない
const MAX_PAK: u64 = 300_000_000;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if !dir.join("Bin64").is_dir() && !dir.join("bin").join("win_x64").is_dir() {
        return None;
    }
    for pak in paks(dir) {
        if std::fs::metadata(&pak).map(|m| m.len()).unwrap_or(u64::MAX) > MAX_PAK {
            continue;
        }
        let Ok(bytes) = std::fs::read(&pak) else {
            continue;
        };
        for e in zip::entries(&bytes) {
            let n = e.name.to_ascii_lowercase();
            if !(n.ends_with("defaultprofile.xml")
                || (n.contains("actionmap") && n.ends_with(".xml")))
            {
                continue;
            }
            let Some(xml) = zip::read(&bytes, &e) else {
                continue;
            };
            let actions = actions_from_xml(&String::from_utf8_lossy(&xml));
            if !actions.is_empty() {
                return Some((actions, "CryEngine の actionmaps（pak の中）"));
            }
        }
    }
    None
}

/// GameData・Engine などの pak (小さいもの = 設定が入りやすいものを先に)
fn paks(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for sub in [
        dir.to_path_buf(),
        dir.join("GameData"),
        dir.join("Data"),
        dir.join("Engine"),
    ] {
        let Ok(rd) = std::fs::read_dir(&sub) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("pak")) {
                out.push((e.metadata().map(|m| m.len()).unwrap_or(u64::MAX), p));
            }
        }
    }
    out.sort();
    out.into_iter().map(|(_, p)| p).collect()
}

/// タグの属性 name="..." の値
fn attr(tag: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(i) = tag[from..].find(name).map(|i| i + from) {
        from = i + name.len();
        // 前が属性の区切り (空白) で、後ろが =" のものだけ
        if i > 0 && !tag.as_bytes()[i - 1].is_ascii_whitespace() {
            continue;
        }
        let rest = tag[from..].trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim_start();
        let q = rest.chars().next()?;
        if q != '"' && q != '\'' {
            continue;
        }
        let end = rest[1..].find(q)?;
        return Some(rest[1..1 + end].to_string());
    }
    None
}

/// CryEngine のキー名 → 出力 (mouse1 = 左、mouse2 = 右。maxis_x・maxis_y はマウスの移動)
fn cry_key(name: &str) -> Option<&'static str> {
    let n = name.trim().to_ascii_lowercase();
    match n.as_str() {
        "lshift" => Some("LSHIFT"),
        "rshift" => Some("RSHIFT"),
        "lctrl" => Some("LCTRL"),
        "rctrl" => Some("RCTRL"),
        "lalt" => Some("LALT"),
        "ralt" => Some("RALT"),
        "enter" | "np_enter" => Some("ENTER"),
        _ => key_name(&n),
    }
}

/// actionmaps の XML から操作を作る (書かれた順。同じ名前は最初のもの)
pub fn actions_from_xml(xml: &str) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    let mut has_look = false;
    let mut from = 0;
    while let Some(i) = xml[from..].find("<action").map(|i| i + from) {
        let Some(end) = xml[i..].find('>').map(|e| e + i) else {
            break;
        };
        from = end + 1;
        let tag = &xml[i..end];
        // <actionmap ...> は飛ばす
        if tag.starts_with("<actionmap") {
            continue;
        }
        let Some(name) = attr(tag, "name") else {
            continue;
        };
        // 属性の形、または中の <keyboard input="w"/> の形
        let mut keyboard = attr(tag, "keyboard");
        if keyboard.is_none() && !tag.ends_with('/') {
            if let Some(close) = xml[from..].find("</action>").map(|c| c + from) {
                let inner = &xml[from..close];
                keyboard = inner
                    .find("<keyboard")
                    .and_then(|k| inner[k..].find('>').map(|e| &inner[k..k + e]))
                    .and_then(|t| attr(t, "input"));
                from = close;
            }
        }
        let Some(k) = keyboard.filter(|k| !k.is_empty()) else {
            continue;
        };
        let lower = k.to_ascii_lowercase();
        if lower.starts_with("maxis_") || lower == "mouse_x" || lower == "mouse_y" {
            has_look = true;
            continue;
        }
        let id = format!("cryengine/{name}");
        if out.iter().any(|a| a.id == id) {
            continue;
        }
        // 送れないキーの操作も、名前は分担のために残す (初期キーなし)
        out.push(button(id, name.replace('_', " "), cry_key(&k)));
    }
    if has_look {
        out.push(look("cryengine/look", "視点"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<profile version="2">
 <actionmap name="player" version="22">
  <action name="moveforward" onPress="1" onRelease="1" keyboard="w" xboxpad="xi_thumbly" />
  <action name="moveleft" onPress="1" onRelease="1" keyboard="a" />
  <action name="jump" onPress="1" keyboard="space" />
  <action name="sprint" onPress="1" keyboard="lshift" />
  <action name="attack1" onPress="1" keyboard="mouse1" />
  <action name="rotateyaw" keyboard="maxis_x" />
  <action name="use">
   <keyboard input="f" />
  </action>
  <action name="voice" keyboard="" />
 </actionmap>
</profile>"#;

    #[test]
    fn actionmaps_become_actions() {
        let a = actions_from_xml(XML);
        let got: Vec<(&str, Option<&str>)> = a.iter().map(|a| (a.id.as_str(), a.default)).collect();
        assert_eq!(
            got,
            [
                ("cryengine/moveforward", Some("KEY_W")),
                ("cryengine/moveleft", Some("KEY_A")),
                ("cryengine/jump", Some("SPACE")),
                ("cryengine/sprint", Some("LSHIFT")),
                ("cryengine/attack1", Some("MOUSE_L")),
                ("cryengine/use", Some("KEY_F")),
                ("cryengine/look", None),
            ],
            "キーのない操作は出さない。マウスの軸は視点にまとめる"
        );
    }

    #[test]
    fn reads_actionmaps_inside_pak() {
        let dir = std::env::temp_dir().join(format!("recooplay-cry-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Bin64")).unwrap();
        std::fs::create_dir_all(dir.join("GameData")).unwrap();
        let pak = zip::tests::make_zip(&[("Libs/Config/defaultProfile.xml", XML.as_bytes())], true);
        std::fs::write(dir.join("GameData/GameData.pak"), pak).unwrap();
        let (a, src) = read(&dir).unwrap();
        assert!(src.contains("CryEngine"));
        assert_eq!(a[0].id, "cryengine/moveforward");
        // 暗号化などで zip として読めない pak
        std::fs::write(dir.join("GameData/GameData.pak"), vec![0x5au8; 2048]).unwrap();
        assert!(read(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
