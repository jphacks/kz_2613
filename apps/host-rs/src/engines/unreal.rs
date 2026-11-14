// Unreal Engine 4・5 (#482)。従来の入力 (ActionMappings・AxisMappings) を読む。
// - 既定の割当：<Project>/Content/Paks/*.pak の中の DefaultInput.ini ([/Script/Engine.InputSettings])。
//   pak が暗号化・圧縮 (Oodle など) されていれば文字として見つからないので読まない
// - 利用者の上書き：%LOCALAPPDATA%\<Project>\Saved\Config\Windows\Input.ini (UE5)、WindowsNoEditor (UE4)
// 既定のあとに上書きを重ね、既存の ue-input-ini と同じ読み方 (keybinds::ue_input_ini) で操作にする。
// UE5 の Enhanced Input (InputMappingContext のアセット) は cook されたバイナリなので、まだ読まない。
use std::path::{Path, PathBuf};

use super::{button, look, read_text};
use crate::game_actions::ReadAction;
use crate::keybinds::Key;

/// これより大きい pak は探さない (設定は先頭の pakchunk0 にあることが多い)
const MAX_PAK: u64 = 1_500_000_000;
const SECTION: &[u8] = b"[/Script/Engine.InputSettings]";

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let project = project_dir(dir)?;
    let name = project.file_name()?.to_str()?.to_string();
    let defaults = default_input(&project);
    let user = user_input(&name);
    if defaults.is_none() && user.is_none() {
        return None;
    }
    let text = format!(
        "{}\n{}",
        defaults.clone().unwrap_or_default(),
        user.clone().unwrap_or_default()
    );
    let actions = actions_from_ini(&text);
    let source = match (defaults.is_some(), user.is_some()) {
        (true, true) => "Unreal Engine の DefaultInput.ini と利用者の Input.ini",
        (true, false) => "Unreal Engine の DefaultInput.ini（pak の中）",
        _ => "Unreal Engine の利用者の Input.ini",
    };
    (!actions.is_empty()).then_some((actions, source))
}

/// <Project>/Binaries/Win64 と <Project>/Content/Paks を持つフォルダ (Engine は除く)
fn project_dir(dir: &Path) -> Option<PathBuf> {
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name().is_some_and(|n| n != "Engine")
                && p.join("Binaries").join("Win64").is_dir()
                && p.join("Content").join("Paks").is_dir()
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

fn user_input(project: &str) -> Option<String> {
    let base = crate::keybinds::expand("%LOCALAPPDATA%")?
        .join(project)
        .join("Saved")
        .join("Config");
    ["Windows", "WindowsNoEditor"]
        .iter()
        .find_map(|p| read_text(&base.join(p).join("Input.ini")))
        .filter(|t| t.contains("Mappings"))
}

fn default_input(project: &Path) -> Option<String> {
    let mut paks: Vec<PathBuf> = std::fs::read_dir(project.join("Content").join("Paks"))
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("pak")))
        .collect();
    // pakchunk0 (設定が入る) を先に
    paks.sort_by_key(|p| {
        let n = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        (!n.contains("chunk0"), n)
    });
    paks.iter().find_map(|p| find_section(p))
}

/// pak を少しずつ読み、[/Script/Engine.InputSettings] の節 (次の節まで、64 KB まで) を探す
fn find_section(path: &Path) -> Option<String> {
    use std::io::Read;
    if std::fs::metadata(path).ok()?.len() > MAX_PAK {
        return None;
    }
    let mut f = std::fs::File::open(path).ok()?;
    let mut carry: Vec<u8> = Vec::new();
    let mut buf = vec![0u8; 8 * 1024 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            return None;
        }
        carry.extend_from_slice(&buf[..n]);
        if let Some(pos) = carry.windows(SECTION.len()).position(|w| w == SECTION) {
            // 節の続きが足りなければ、もう少し読む
            while carry.len() < pos + 65_536 {
                let n = f.read(&mut buf).ok()?;
                if n == 0 {
                    break;
                }
                carry.extend_from_slice(&buf[..n]);
            }
            let body = &carry[pos..carry.len().min(pos + 65_536)];
            let text = String::from_utf8_lossy(body);
            // 次の節 (行頭の [) か、文字でないところまで
            let mut out = String::new();
            for (i, line) in text.lines().enumerate() {
                if i > 0 && line.starts_with('[') {
                    break;
                }
                if line.contains('\0') {
                    break;
                }
                out.push_str(line);
                out.push('\n');
            }
            return Some(out);
        }
        // 境界をまたぐ分だけ残す
        let keep = carry.len().saturating_sub(SECTION.len());
        carry.drain(..keep);
    }
}

/// 軸の名前と向きの読みやすいラベル (MoveForward/+ → MoveForward forward など)
fn axis_label(name: &str) -> String {
    let Some((axis, sign)) = name.rsplit_once('/') else {
        return name.to_string();
    };
    let lower = axis.to_ascii_lowercase();
    let (minus, plus) = if lower.contains("forward") {
        ("back", "forward")
    } else if lower.contains("right") {
        ("left", "right")
    } else if lower.contains("up") {
        ("down", "up")
    } else {
        ("negative", "positive")
    };
    format!("{axis} {}", if sign == "-" { minus } else { plus })
}

/// ActionMappings・AxisMappings から操作を作る。マウスの移動 (MouseX・MouseY) の軸は視点にまとめる
pub fn actions_from_ini(text: &str) -> Vec<ReadAction> {
    let map = crate::keybinds::ue_input_ini(text);
    let mut names: Vec<&String> = map.keys().filter(|k| !k.ends_with("/*")).collect();
    names.sort();
    let mut out: Vec<ReadAction> = Vec::new();
    let mut has_look = false;
    for name in names {
        match &map[name] {
            Key::Output(k) => out.push(button(format!("unreal/{name}"), axis_label(name), Some(k))),
            Key::Unsupported(k)
                if k.eq_ignore_ascii_case("MouseX") || k.eq_ignore_ascii_case("MouseY") =>
            {
                has_look = true
            }
            _ => {}
        }
    }
    if has_look {
        out.push(look("unreal/look", "視点"));
    }
    out
}

/// 利用者のキー設定のファイル (#524)
pub fn user_config(dir: &Path) -> Option<PathBuf> {
    let name = project_dir(dir)?.file_name()?.to_str()?.to_string();
    let base = crate::keybinds::expand("%LOCALAPPDATA%")?
        .join(name)
        .join("Saved")
        .join("Config");
    ["Windows", "WindowsNoEditor"]
        .iter()
        .map(|p| base.join(p).join("Input.ini"))
        .find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEFAULT_INPUT: &str = "[/Script/Engine.InputSettings]\r\n\
+ActionMappings=(ActionName=\"Jump\",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=SpaceBar)\r\n\
+ActionMappings=(ActionName=\"Jump\",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=Gamepad_FaceButton_Bottom)\r\n\
+ActionMappings=(ActionName=\"Fire\",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=LeftMouseButton)\r\n\
+AxisMappings=(AxisName=\"MoveForward\",Scale=1.000000,Key=W)\r\n\
+AxisMappings=(AxisName=\"MoveForward\",Scale=-1.000000,Key=S)\r\n\
+AxisMappings=(AxisName=\"MoveRight\",Scale=1.000000,Key=D)\r\n\
+AxisMappings=(AxisName=\"Turn\",Scale=1.000000,Key=MouseX)\r\n\
+AxisMappings=(AxisName=\"LookUp\",Scale=-1.000000,Key=MouseY)\r\n\
\r\n[/Script/Engine.Other]\r\nfoo=bar\r\n";

    #[test]
    fn mappings_become_actions() {
        let a = actions_from_ini(DEFAULT_INPUT);
        let got: Vec<(&str, &str, Option<&str>)> = a
            .iter()
            .map(|a| (a.id.as_str(), a.label.as_str(), a.default))
            .collect();
        assert_eq!(
            got,
            [
                ("unreal/Fire", "Fire", Some("MOUSE_L")),
                ("unreal/Jump", "Jump", Some("SPACE")),
                ("unreal/MoveForward/+", "MoveForward forward", Some("KEY_W")),
                ("unreal/MoveForward/-", "MoveForward back", Some("KEY_S")),
                ("unreal/MoveRight/+", "MoveRight right", Some("KEY_D")),
                ("unreal/look", "視点", None),
            ]
        );
        // 利用者の上書き (既定のあとに重ねる)
        let user = "[/Script/Engine.InputSettings]\n-ActionMappings=(ActionName=\"Jump\",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=SpaceBar)\n+ActionMappings=(ActionName=\"Jump\",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=J)\n";
        let a = actions_from_ini(&format!("{DEFAULT_INPUT}\n{user}"));
        assert_eq!(
            a.iter().find(|a| a.id == "unreal/Jump").unwrap().default,
            Some("KEY_J")
        );
    }

    #[test]
    fn finds_section_inside_pak() {
        let dir = std::env::temp_dir().join(format!("recooplay-unreal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let project = dir.join("MyGame");
        std::fs::create_dir_all(project.join("Binaries/Win64")).unwrap();
        std::fs::create_dir_all(project.join("Content/Paks")).unwrap();
        std::fs::create_dir_all(dir.join("Engine/Binaries/Win64")).unwrap();
        let mut pak = vec![0xCCu8; 9 * 1024 * 1024 - 10];
        pak.extend(DEFAULT_INPUT.as_bytes());
        pak.push(0);
        pak.extend([0xEEu8; 1000]);
        std::fs::write(
            project.join("Content/Paks/MyGame-WindowsNoEditor.pak"),
            &pak,
        )
        .unwrap();
        let (a, src) = read(&dir).unwrap();
        assert!(src.contains("DefaultInput.ini"), "{src}");
        assert!(
            a.iter().any(|a| a.id == "unreal/Jump"),
            "チャンクの境界をまたいでも見つける"
        );
        assert!(!a.iter().any(|a| a.id.contains("foo")));
        // 暗号化などで文字として見つからない pak
        std::fs::write(
            project.join("Content/Paks/MyGame-WindowsNoEditor.pak"),
            vec![0xAB; 4096],
        )
        .unwrap();
        assert!(read(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
