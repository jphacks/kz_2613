// Prism3D (SCS Software：Euro Truck Simulator 2・American Truck Simulator) (#506)。
// プロファイルの controls.sii の `config_lines[N]: "mix <操作名> `<式>`"` から、式の中の最初のキーボードのキー
// (`keyboard.w?0`) とマウスのボタン (`mouse.button_left?0`) を読む。暗号化された .sii (先頭が SiiNunit でない) は読まない。
// プロファイルは Documents\<ゲーム>\profiles と steam_profiles の中で、いちばん新しく書かれた controls.sii を使う。
use std::path::{Path, PathBuf};

use super::{button, child_ci, key_name, read_text};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let bin = child_ci(dir, "bin").and_then(|b| child_ci(&b, "win_x64"))?;
    let folder = if child_ci(&bin, "eurotrucks2.exe").is_some() {
        "Euro Truck Simulator 2"
    } else if child_ci(&bin, "amtrucks.exe").is_some() {
        "American Truck Simulator"
    } else {
        return None;
    };
    let docs = crate::keybinds::expand("%DOCUMENTS%")?.join(folder);
    let text = read_text(&newest_controls(&docs)?)?;
    let a = actions_from_controls(&text);
    (!a.is_empty()).then_some((a, "Prism3D の controls.sii"))
}

fn newest_controls(docs: &Path) -> Option<PathBuf> {
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for sub in ["profiles", "steam_profiles"] {
        let Ok(rd) = std::fs::read_dir(docs.join(sub)) else {
            continue;
        };
        for p in rd.flatten() {
            let f = p.path().join("controls.sii");
            if let Ok(m) = std::fs::metadata(&f) {
                found.push((m.modified().unwrap_or(std::time::UNIX_EPOCH), f));
            }
        }
    }
    found.into_iter().max_by_key(|(t, _)| *t).map(|(_, p)| p)
}

/// Prism3D のキー名 → 出力 ID
fn scs_key(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "lshift" => Some("LSHIFT"),
        "rshift" => Some("RSHIFT"),
        "lctrl" => Some("LCTRL"),
        "rctrl" => Some("RCTRL"),
        "lalt" => Some("LALT"),
        "ralt" => Some("RALT"),
        "pgup" => Some("PAGE_UP"),
        "pgdn" => Some("PAGE_DOWN"),
        n if n.starts_with("num") => None,
        n => key_name(n),
    }
}

/// よく使う操作の日本語のラベル (ほかは操作名のまま)
fn label(mix: &str) -> String {
    match mix {
        "steerleft" => "左へハンドル",
        "steerright" => "右へハンドル",
        "aforward" => "アクセル",
        "abackward" => "ブレーキ・後退",
        "parkingbrake" => "駐車ブレーキ",
        "lblinker" => "左ウインカー",
        "rblinker" => "右ウインカー",
        "hazard" => "ハザード",
        "light" => "ライト",
        "hblight" => "ハイビーム",
        "wipers" => "ワイパー",
        "horn" => "クラクション",
        "airhorn" => "エアホーン",
        "cruiectrl" => "クルーズコントロール",
        "engine" => "エンジン",
        "trailer" => "トレーラーの連結",
        "activate" => "使う・調べる",
        "menu" => "メニュー",
        other => return other.to_string(),
    }
    .to_string()
}

/// controls.sii の mix の行から操作を作る (キーボード・マウスの割当のあるものだけ)
pub fn actions_from_controls(text: &str) -> Vec<ReadAction> {
    if !text.trim_start().starts_with("SiiNunit") {
        return Vec::new();
    }
    let mut out: Vec<ReadAction> = Vec::new();
    for line in text.lines() {
        let Some(rest) = line.trim().strip_prefix("config_lines[") else {
            continue;
        };
        let Some(q) = rest.find("\"mix ") else {
            continue;
        };
        let body = &rest[q + 5..];
        let Some((mix, expr)) = body.split_once(' ') else {
            continue;
        };
        let expr = expr.trim_end_matches('"').trim_matches('`');
        let key = expr
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '_'))
            .find_map(|tok| {
                if let Some(k) = tok.strip_prefix("keyboard.") {
                    scs_key(k)
                } else {
                    match tok {
                        "mouse.button_left" => Some("MOUSE_L"),
                        "mouse.button_right" => Some("MOUSE_R"),
                        _ => None,
                    }
                }
            });
        let Some(key) = key else { continue };
        let id = format!("scs/{mix}");
        if !out.iter().any(|a| a.id == id) {
            out.push(button(id, label(mix), Some(key)));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const CONTROLS: &str = "SiiNunit\n{\ninput_config : .config {\n config_lines: 6\n config_lines[0]: \"mix steerleft `keyboard.a?0`\"\n config_lines[1]: \"mix aforward `keyboard.w?0 | joy.b1?0`\"\n config_lines[2]: \"mix lblinker `keyboard.leftbracket?0`\"\n config_lines[3]: \"mix steering `joy.x?0`\"\n config_lines[4]: \"mix horn `keyboard.h?0`\"\n config_lines[5]: \"mix activate `mouse.button_left?0`\"\n}\n}\n";

    #[test]
    fn controls_become_actions() {
        let a = actions_from_controls(CONTROLS);
        let got: Vec<(&str, &str, Option<&str>)> = a
            .iter()
            .map(|a| (a.id.as_str(), a.label.as_str(), a.default))
            .collect();
        assert_eq!(
            got,
            [
                ("scs/steerleft", "左へハンドル", Some("KEY_A")),
                ("scs/aforward", "アクセル", Some("KEY_W")),
                ("scs/lblinker", "左ウインカー", Some("LBRACKET")),
                ("scs/horn", "クラクション", Some("KEY_H")),
                ("scs/activate", "使う・調べる", Some("MOUSE_L")),
            ],
            "ゲームパッドだけの操作は出さない"
        );
        assert!(
            actions_from_controls("ScsC\u{1}\u{2}encrypted").is_empty(),
            "暗号化された .sii は読まない"
        );
    }
}
