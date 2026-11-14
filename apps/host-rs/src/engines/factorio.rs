// Factorio (#508)。%APPDATA%\Factorio\config\config.ini の [controls] の `move-up=W` を読む。
// 既定のキーのままの操作は書かれていないことがあるので、遊びの中心の操作は既定のキーを持ち、書かれていれば置き換える。
// 修飾キー付き (「SHIFT + mouse-button-1」) は送れないので、その操作は初期キーなしにする。
use std::path::Path;

use super::{button, child_ci, key_name, read_text};
use crate::game_actions::ReadAction;

/// (設定の名前, ラベル, 既定のキー)
const CONTROLS: [(&str, &str, &str); 14] = [
    ("move-up", "上へ移動", "KEY_W"),
    ("move-down", "下へ移動", "KEY_S"),
    ("move-left", "左へ移動", "KEY_A"),
    ("move-right", "右へ移動", "KEY_D"),
    ("build", "建設・置く", "MOUSE_L"),
    ("mine", "採掘・撤去", "MOUSE_R"),
    ("open-character-gui", "持ち物・クラフト", "KEY_E"),
    ("rotate", "回転", "KEY_R"),
    ("pipette", "スポイト（同じ物を持つ）", "KEY_Q"),
    ("drop-cursor", "手の物を置く", "KEY_Z"),
    ("pick-items", "拾う", "KEY_F"),
    ("shoot-enemy", "撃つ", "SPACE"),
    ("toggle-driving", "乗り降り", "ENTER"),
    ("toggle-map", "地図", "KEY_M"),
];

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    child_ci(dir, "bin")
        .and_then(|b| child_ci(&b, "x64"))
        .and_then(|x| child_ci(&x, "factorio.exe"))?;
    let ini = crate::keybinds::expand("%APPDATA%")
        .and_then(|a| read_text(&a.join("Factorio").join("config").join("config.ini")))
        .unwrap_or_default();
    let source = if ini.contains("[controls]") {
        "Factorio の config.ini の controls"
    } else {
        "Factorio の既定のキー"
    };
    Some((actions_from_config(&ini), source))
}

/// Factorio のキー名 → 出力 ID
fn factorio_key(value: &str) -> Option<&'static str> {
    let v = value.trim();
    if v.contains('+') {
        return None;
    }
    match v.to_ascii_lowercase().as_str() {
        "mouse-button-1" => Some("MOUSE_L"),
        "mouse-button-2" => Some("MOUSE_R"),
        "" => None,
        n => key_name(n),
    }
}

pub fn actions_from_config(ini: &str) -> Vec<ReadAction> {
    let mut set: Vec<(&str, Option<&'static str>)> = Vec::new();
    let mut on = false;
    for line in ini.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            on = line == "[controls]";
            continue;
        }
        if !on || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            set.push((k.trim(), factorio_key(v)));
        }
    }
    CONTROLS
        .iter()
        .map(|(name, label, default)| {
            let key = set
                .iter()
                .find(|(k, _)| k == name)
                .map_or(Some(*default), |(_, v)| *v);
            button(format!("factorio/{name}"), *label, key)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_overrides_defaults() {
        let ini = "[path]\nread-data=__PATH__executable__/../../data\n\n[controls]\nmove-up=Up\nrotate=SHIFT + R\nmine=mouse-button-2\n";
        let a = actions_from_config(ini);
        assert_eq!(a.len(), 14);
        assert_eq!(a[0].default, Some("ARROW_UP"), "書かれていれば置き換える");
        assert_eq!(a[1].default, Some("KEY_S"), "書かれていなければ既定");
        assert_eq!(
            a.iter()
                .find(|a| a.id == "factorio/rotate")
                .unwrap()
                .default,
            None,
            "修飾キー付きは送れない"
        );
        assert_eq!(
            a.iter().find(|a| a.id == "factorio/mine").unwrap().default,
            Some("MOUSE_R")
        );
        assert_eq!(
            actions_from_config("").len(),
            14,
            "config.ini がなければ既定のキー"
        );
    }
}
