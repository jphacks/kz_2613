// RPGツクール (RPG Maker) 製のゲーム (#480)。
// - MV・MZ：rpg_core.js / rmmz_core.js の Input.keyMapper (キーコード → 操作の記号) を、JavaScript を実行せずに文字列として読む。
//   有効なプラグイン (js/plugins.js の status:true) の中の `Input.keyMapper[65] = 'xxx'` の形の追加も読む
// - VX Ace・VX・XP (RGSS)、2000・2003：キーはエンジンで固定なので、種類を見分けて既定のキーで操作を作る
use std::path::{Path, PathBuf};

use super::{button, child_ci, in_group, read_text, vk_key};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if let Some((core, plugins_dir, kind)) = mv_mz(dir) {
        let text = read_text(&core)?;
        let mut mapper = key_mapper(&text);
        if mapper.is_empty() {
            return None;
        }
        for (code, sym) in plugin_mappings(&plugins_dir) {
            mapper.retain(|(c, _)| *c != code);
            mapper.push((code, sym));
        }
        return Some((actions_from_mapper(&mapper), kind));
    }
    if let Some(version) = rgss_version(dir) {
        return Some((rgss_actions(version), "RPGツクール（RGSS）の既定のキー"));
    }
    if child_ci(dir, "RPG_RT.exe").is_some() || child_ci(dir, "RPG_RT.ini").is_some() {
        return Some((rpg2k_actions(), "RPGツクール 2000/2003 の既定のキー"));
    }
    None
}

/// (コアのスクリプト, プラグインのフォルダ, 説明)
fn mv_mz(dir: &Path) -> Option<(PathBuf, PathBuf, &'static str)> {
    for base in [dir.join("www"), dir.to_path_buf()] {
        let js = base.join("js");
        if js.join("rmmz_core.js").is_file() {
            return Some((
                js.join("rmmz_core.js"),
                js,
                "RPGツクール MZ の Input.keyMapper",
            ));
        }
        if js.join("rpg_core.js").is_file() {
            return Some((
                js.join("rpg_core.js"),
                js,
                "RPGツクール MV の Input.keyMapper",
            ));
        }
    }
    None
}

/// `Input.keyMapper = { 13: 'ok', ... };` の中身を、書かれた順に読む
pub fn key_mapper(text: &str) -> Vec<(u32, String)> {
    let Some(start) = text
        .find("Input.keyMapper = {")
        .or_else(|| text.find("Input.keyMapper={"))
    else {
        return Vec::new();
    };
    let body = &text[start..];
    let Some(open) = body.find('{') else {
        return Vec::new();
    };
    let Some(close) = body[open..].find('}') else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for line in body[open + 1..open + close].split([',', '\n']) {
        // コメント (// ...) を外す
        let line = line.split("//").next().unwrap_or("");
        let mut kv = line.splitn(2, ':');
        let (Some(k), Some(v)) = (kv.next(), kv.next()) else {
            continue;
        };
        let (Ok(code), Some(sym)) = (k.trim().parse::<u32>(), quoted(v)) else {
            continue;
        };
        out.push((code, sym));
    }
    out
}

fn quoted(v: &str) -> Option<String> {
    let v = v.trim();
    let q = v.chars().next().filter(|c| *c == '\'' || *c == '"')?;
    let rest = &v[1..];
    let end = rest.find(q)?;
    let s = &rest[..end];
    (!s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
        .then(|| s.to_string())
}

/// 有効なプラグインのファイルから、`keyMapper[65] = 'xxx'` の形の追加を読む
fn plugin_mappings(js: &Path) -> Vec<(u32, String)> {
    let Some(list) = read_text(&js.join("plugins.js")) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for name in enabled_plugins(&list) {
        // 名前にパスの区切りが入っていれば読まない (フォルダの外を読まない)
        if name.contains(['/', '\\']) || name.contains("..") {
            continue;
        }
        if let Some(text) = read_text(&js.join("plugins").join(format!("{name}.js"))) {
            out.extend(mapper_assignments(&text));
        }
    }
    out
}

/// js/plugins.js の `{"name":"X","status":true,...}` から、有効なプラグインの名前を読む
pub fn enabled_plugins(text: &str) -> Vec<String> {
    let Some(start) = text.find('[') else {
        return Vec::new();
    };
    let Some(end) = text.rfind(']') else {
        return Vec::new();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text[start..=end]) else {
        return Vec::new();
    };
    v.as_array()
        .into_iter()
        .flatten()
        .filter(|p| p["status"].as_bool() == Some(true))
        .filter_map(|p| p["name"].as_str().map(str::to_string))
        .collect()
}

/// `Input.keyMapper[65] = 'xxx';` の形を探す
pub fn mapper_assignments(text: &str) -> Vec<(u32, String)> {
    let mut out = Vec::new();
    let key = "keyMapper[";
    let mut from = 0;
    while let Some(pos) = text[from..].find(key).map(|p| p + from) {
        from = pos + key.len();
        let rest = &text[from..];
        let Some(close) = rest.find(']') else { break };
        let Ok(code) = rest[..close].trim().parse::<u32>() else {
            continue;
        };
        let after = rest[close + 1..].trim_start();
        let Some(value) = after.strip_prefix('=').filter(|v| !v.starts_with('=')) else {
            continue;
        };
        if let Some(sym) = quoted(value) {
            out.push((code, sym));
        }
    }
    out
}

/// 操作の記号の日本語のラベル。None は分担に出さない (開発用・既定では使わないもの)
fn symbol_label(sym: &str) -> Option<String> {
    Some(
        match sym {
            "ok" => "決定",
            "escape" | "cancel" | "menu" => "キャンセル・メニュー",
            "shift" => "ダッシュ",
            "pageup" => "前のページ",
            "pagedown" => "次のページ",
            "up" => "上へ移動",
            "down" => "下へ移動",
            "left" => "左へ移動",
            "right" => "右へ移動",
            // control (テストプレイのすり抜け)・debug (F9)・tab は既定では遊びに使わない
            "control" | "debug" | "tab" => return None,
            other => return Some(other.to_string()),
        }
        .to_string(),
    )
}

/// 記号の分類の手がかり (#512)。RPG では決定 (調べる・話す) とキャンセル (メニュー) が遊びの中心なので、
/// モデルがメニューに分類して P1 のリモコンに残さないよう、行動の操作として配る
fn symbol_group(sym: &str) -> Option<&'static str> {
    match sym {
        "ok" | "escape" | "cancel" | "menu" => Some("gameplay"),
        "up" | "down" | "left" | "right" => Some("movement"),
        _ => None,
    }
}

/// キーコード → 記号の表から、記号ごとに 1 つの操作を作る。初期キーは表で最初に出てくる送れるキー
pub fn actions_from_mapper(mapper: &[(u32, String)]) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    for (code, sym) in mapper {
        let Some(label) = symbol_label(sym) else {
            continue;
        };
        let id = format!("rpgmaker/{sym}");
        let key = vk_key(*code);
        match out.iter_mut().find(|a| a.id == id) {
            Some(a) => {
                if a.default.is_none() {
                    a.default = key;
                }
            }
            None => {
                let a = button(id, label, key);
                out.push(match symbol_group(sym) {
                    Some(g) => in_group(a, g),
                    None => a,
                });
            }
        }
    }
    out
}

/// Game.ini の Library から RGSS の版 (1 = XP、2 = VX、3 = VX Ace)
fn rgss_version(dir: &Path) -> Option<u8> {
    let ini = read_text(&child_ci(dir, "Game.ini")?)?;
    let lib = ini
        .lines()
        .find_map(|l| l.trim().strip_prefix("Library="))?
        .to_ascii_lowercase();
    let pos = lib.find("rgss")?;
    lib[pos + 4..].chars().next()?.to_digit(10).map(|d| d as u8)
}

fn moves() -> Vec<ReadAction> {
    [
        ("up", "上へ移動", "ARROW_UP"),
        ("down", "下へ移動", "ARROW_DOWN"),
        ("left", "左へ移動", "ARROW_LEFT"),
        ("right", "右へ移動", "ARROW_RIGHT"),
    ]
    .into_iter()
    .map(|(id, label, key)| {
        in_group(
            button(format!("rpgmaker/{id}"), label, Some(key)),
            "movement",
        )
    })
    .collect()
}

/// RGSS の既定 (F1 の設定画面の初期値)：C = Enter・Space・Z、B = Esc・X・テンキー0、A = Shift、L = Q、R = W。
/// X・Y・Z (A・S・D) は既定のスクリプトでは使わないので出さない
pub fn rgss_actions(version: u8) -> Vec<ReadAction> {
    let mut out = moves();
    out.push(in_group(
        button("rpgmaker/ok", "決定", Some("ENTER")),
        "gameplay",
    ));
    out.push(in_group(
        button("rpgmaker/escape", "キャンセル・メニュー", Some("ESC")),
        "gameplay",
    ));
    out.push(button(
        "rpgmaker/shift",
        if version >= 2 {
            "ダッシュ"
        } else {
            "A ボタン"
        },
        Some("LSHIFT"),
    ));
    out.push(button("rpgmaker/pageup", "前のページ", Some("KEY_Q")));
    out.push(button("rpgmaker/pagedown", "次のページ", Some("KEY_W")));
    out
}

/// 2000・2003 の既定：矢印で移動、Enter・Space・Z で決定、Esc・X などでキャンセル
pub fn rpg2k_actions() -> Vec<ReadAction> {
    let mut out = moves();
    out.push(in_group(
        button("rpgmaker/ok", "決定", Some("ENTER")),
        "gameplay",
    ));
    out.push(in_group(
        button("rpgmaker/escape", "キャンセル・メニュー", Some("ESC")),
        "gameplay",
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const MV_CORE: &str = r#"
Input.keyRepeatWait = 24;
Input.keyMapper = {
    9: 'tab',       // tab
    13: 'ok',       // enter
    16: 'shift',    // shift
    17: 'control',  // control
    18: 'control',  // alt
    27: 'escape',   // escape
    32: 'ok',       // space
    33: 'pageup',   // pageup
    34: 'pagedown', // pagedown
    37: 'left',     // left arrow
    38: 'up',       // up arrow
    39: 'right',    // right arrow
    40: 'down',     // down arrow
    45: 'escape',   // insert
    81: 'pageup',   // Q
    87: 'pagedown', // W
    88: 'escape',   // X
    90: 'ok',       // Z
    96: 'escape',   // numpad 0
    98: 'down',     // numpad 2
    100: 'left',    // numpad 4
    102: 'right',   // numpad 6
    104: 'up',      // numpad 8
    120: 'debug'    // F9
};
"#;

    #[test]
    fn mv_key_mapper_becomes_actions() {
        let m = key_mapper(MV_CORE);
        assert_eq!(m.len(), 24);
        let a = actions_from_mapper(&m);
        let ids: Vec<&str> = a.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "rpgmaker/ok",
                "rpgmaker/shift",
                "rpgmaker/escape",
                "rpgmaker/pageup",
                "rpgmaker/pagedown",
                "rpgmaker/left",
                "rpgmaker/up",
                "rpgmaker/right",
                "rpgmaker/down"
            ],
            "tab・control・debug は出さない"
        );
        assert_eq!(a[0].default, Some("ENTER"));
        assert_eq!(a[0].label, "決定");
        assert_eq!(a[2].default, Some("ESC"));
        assert_eq!(a[3].default, Some("PAGE_UP"));
    }

    #[test]
    fn plugins_add_symbols_only_when_enabled() {
        let list = r#"var $plugins =
[
{"name":"KeyAdd","status":true,"description":"","parameters":{}},
{"name":"Off","status":false,"description":"","parameters":{}}
];"#;
        assert_eq!(enabled_plugins(list), ["KeyAdd"]);
        let plugin = "Input.keyMapper[65] = 'skill';\nif (Input.keyMapper[66] == 'x') {}\nInput.keyMapper[ 67 ]=\"item\";";
        assert_eq!(
            mapper_assignments(plugin),
            [(65, "skill".to_string()), (67, "item".to_string())],
            "比較 (==) は追加ではない"
        );
        let mut m = key_mapper(MV_CORE);
        m.push((65, "skill".into()));
        let a = actions_from_mapper(&m);
        let skill = a.iter().find(|a| a.id == "rpgmaker/skill").unwrap();
        assert_eq!(
            (skill.label.as_str(), skill.default),
            ("skill", Some("KEY_A"))
        );
    }

    #[test]
    fn reads_game_folders() {
        let dir = std::env::temp_dir().join(format!("recooplay-rpgmaker-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        // MZ
        std::fs::create_dir_all(dir.join("mz/js/plugins")).unwrap();
        std::fs::write(dir.join("mz/js/rmmz_core.js"), MV_CORE).unwrap();
        std::fs::write(
            dir.join("mz/js/plugins.js"),
            r#"var $plugins = [{"name":"K","status":true,"parameters":{}}];"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("mz/js/plugins/K.js"),
            "Input.keyMapper[13] = 'menu';",
        )
        .unwrap();
        let (a, src) = read(&dir.join("mz")).unwrap();
        assert!(src.contains("MZ"));
        assert_eq!(
            a.iter().find(|a| a.id == "rpgmaker/ok").unwrap().default,
            Some("SPACE"),
            "Enter をプラグインがメニューに変えた"
        );
        assert_eq!(
            a.iter().find(|a| a.id == "rpgmaker/menu").unwrap().default,
            Some("ENTER")
        );
        // MV (www の下)
        std::fs::create_dir_all(dir.join("mv/www/js")).unwrap();
        std::fs::write(dir.join("mv/www/js/rpg_core.js"), MV_CORE).unwrap();
        assert!(read(&dir.join("mv")).unwrap().1.contains("MV"));
        // VX Ace
        std::fs::create_dir_all(dir.join("ace")).unwrap();
        std::fs::write(
            dir.join("ace/Game.ini"),
            "[Game]\r\nLibrary=System\\RGSS301.dll\r\nScripts=Data\\Scripts.rvdata2\r\n",
        )
        .unwrap();
        let (a, _) = read(&dir.join("ace")).unwrap();
        assert_eq!(
            a.iter().find(|a| a.id == "rpgmaker/shift").unwrap().label,
            "ダッシュ"
        );
        // XP
        std::fs::create_dir_all(dir.join("xp")).unwrap();
        std::fs::write(
            dir.join("xp/Game.ini"),
            "[Game]\r\nLibrary=RGSS104E.dll\r\n",
        )
        .unwrap();
        assert_eq!(
            read(&dir.join("xp"))
                .unwrap()
                .0
                .iter()
                .find(|a| a.id == "rpgmaker/shift")
                .unwrap()
                .label,
            "A ボタン"
        );
        // 2000
        std::fs::create_dir_all(dir.join("2k")).unwrap();
        std::fs::write(dir.join("2k/RPG_RT.exe"), b"MZ").unwrap();
        assert_eq!(read(&dir.join("2k")).unwrap().0.len(), 6);
        // ツクールでない
        std::fs::create_dir_all(dir.join("other")).unwrap();
        assert!(read(&dir.join("other")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
