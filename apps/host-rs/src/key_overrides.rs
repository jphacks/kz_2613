// 利用者が変えたキー割当の保存 (#50・#53)。ゲームごとに、操作 ID → 送る出力 ID (null は送らない) を持つ。
// 読めない・壊れたファイルは無視して初期値で動く。選べる出力はキーと左右のマウスボタンだけ。
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::controls::{self, Kind};

pub type GameOverrides = HashMap<String, Option<String>>;
pub type Overrides = HashMap<String, GameOverrides>;

/// 保存先。試験用の RECOOPLAY_KEY_OVERRIDES を優先し、設定を読まない起動 (シミュレーション) では保存しない
pub fn default_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_KEY_OVERRIDES") { return Some(PathBuf::from(p)); }
    if std::env::var("RECOOPLAY_NO_CONFIG").as_deref() == Ok("1") { return None; }
    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Re-Cooplay").join("key-overrides.json"))
}

/// 操作に割り当ててよい出力か (ホイールは操作の種類が違うので選ばせない)
pub fn assignable(id: &str) -> bool {
    controls::output(id).is_some_and(|o| matches!(o.kind, Kind::Key { .. } | Kind::Mouse { .. }))
}

pub fn parse(text: &str) -> Overrides {
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or(Value::Null);
    let mut out = Overrides::new();
    let Some(games) = value.get("games").and_then(Value::as_object) else { return out };
    for (game, actions) in games {
        let Some(actions) = actions.as_object() else { continue };
        let mut map = GameOverrides::new();
        for (action, v) in actions {
            match v {
                Value::Null => { map.insert(action.clone(), None); }
                Value::String(id) if assignable(id) => { map.insert(action.clone(), Some(id.clone())); }
                _ => {} // 知らないキー名は捨てる
            }
        }
        if !map.is_empty() { out.insert(game.clone(), map); }
    }
    out
}

pub fn load(path: Option<&Path>) -> Overrides {
    path.and_then(|p| std::fs::read_to_string(p).ok()).map(|t| parse(&t)).unwrap_or_default()
}

pub fn to_json(all: &Overrides) -> Value {
    let games: Map<String, Value> = all.iter().map(|(g, m)| {
        (g.clone(), Value::Object(m.iter().map(|(a, o)| (a.clone(), o.clone().map_or(Value::Null, Value::String))).collect()))
    }).collect();
    json!({ "version": 1, "games": games })
}

/// 一時ファイルへ書いてから置き換え、途中で止まっても壊れたファイルを残さない
pub fn save(path: Option<&Path>, all: &Overrides) -> Result<(), String> {
    let Some(path) = path else { return Ok(()) };
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&to_json(all)).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broken_or_unknown_entries_are_ignored_and_valid_ones_round_trip() {
        assert!(parse("{").is_empty());
        assert!(parse("[]").is_empty());
        let all = parse("\u{feff}{\"version\":1,\"games\":{\"g\":{\"jump\":\"KEY_E\",\"use\":null,\"bad\":\"NOPE\",\"wheel\":\"WHEEL_UP\",\"n\":1},\"empty\":{}}}");
        assert_eq!(all.len(), 1);
        let g = &all["g"];
        assert_eq!(g.get("jump"), Some(&Some("KEY_E".to_string())));
        assert_eq!(g.get("use"), Some(&None));
        assert!(!g.contains_key("bad") && !g.contains_key("wheel") && !g.contains_key("n"));
        assert_eq!(parse(&to_json(&all).to_string()), all);
    }

    #[test]
    fn save_writes_through_a_temporary_file() {
        let dir = std::env::temp_dir().join(format!("recooplay-keys-{}", std::process::id()));
        let path = dir.join("key-overrides.json");
        let mut all = Overrides::new();
        all.entry("g".into()).or_default().insert("jump".into(), Some("MOUSE_L".into()));
        save(Some(&path), &all).unwrap();
        assert_eq!(load(Some(&path)), all);
        assert!(!path.with_extension("json.tmp").exists());
        assert!(save(None, &all).is_ok());
        let _ = std::fs::remove_dir_all(dir);
    }
}
