// モデルが作った分担の保存 (#431)。プリセットのないゲーム (未知のゲーム) を一覧で見つけたときに 1 回だけ
// モデルで分担を作り、人数ごと (1〜4 人) に保存する。以後は保存した分担を配り、モデルは動かさない。
// 保存した値は、操作定義の指紋 (操作 ID・グループ) とモデルの版が今と同じときだけ使う。
// 読めない・壊れた・合わない値は使わず、規則の分担に戻る。
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::profiles::Profile;

/// 1 つのゲームの保存値。by_players[n-1] が n 人の分担 (枠ごとの操作 ID の一覧)
#[derive(Clone, Debug, PartialEq)]
pub struct Stored {
    pub fingerprint: String,
    pub model: String,
    pub by_players: Vec<Vec<Vec<String>>>,
}

pub type Store = HashMap<String, Stored>;

/// 保存先。試験用の RECOOPLAY_MODEL_PRESETS を優先し、設定を読まない起動 (シミュレーション) では保存しない
pub fn default_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_MODEL_PRESETS") {
        return Some(PathBuf::from(p));
    }
    if std::env::var("RECOOPLAY_NO_CONFIG").as_deref() == Ok("1") {
        return None;
    }
    std::env::var_os("LOCALAPPDATA").map(|p| {
        PathBuf::from(p)
            .join("Re-Cooplay")
            .join("model-presets.json")
    })
}

/// 操作定義の指紋。操作の追加・削除・グループの変更で変わる (FNV-1a 64bit)
pub fn fingerprint(p: &Profile) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for a in &p.actions {
        for b in
            a.id.bytes()
                .chain([0u8])
                .chain(a.group.bytes())
                .chain([0u8])
                .chain(a.kind.bytes())
                .chain([1u8])
        {
            h ^= u64::from(b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// 検証済みの操作定義 (実機の記録があるもの) は、定義の分担を使い、モデルを動かさない (#411)
pub fn needs_model(p: &Profile) -> bool {
    p.status != "device"
}

/// 保存値がこの定義・このモデルで使えるか。人数ごとに、定義にある操作だけ・重複なし・人数分の枠であること
pub fn valid_for(s: &Stored, p: &Profile, model: &str) -> bool {
    if s.fingerprint != fingerprint(p) || s.model != model || s.by_players.len() != 4 {
        return false;
    }
    let known: HashSet<&str> = p.actions.iter().map(|a| a.id.as_str()).collect();
    s.by_players.iter().enumerate().all(|(i, slots)| {
        let mut seen = HashSet::new();
        slots.len() == i + 1
            && slots
                .iter()
                .flatten()
                .all(|id| known.contains(id.as_str()) && seen.insert(id.as_str()))
    })
}

/// 使える保存値があれば、その人数の分担を返す
pub fn lookup<'a>(
    store: &'a Store,
    p: &Profile,
    model: &str,
    players: usize,
) -> Option<&'a Vec<Vec<String>>> {
    let s = store.get(&p.id)?;
    if !(1..=4).contains(&players) || !valid_for(s, p, model) {
        return None;
    }
    s.by_players.get(players - 1)
}

/// モデルで 1〜4 人の分担を作って保存値にする
pub fn compute(
    p: &Profile,
    model: &str,
    assign: impl Fn(&Profile, usize) -> Vec<Vec<String>>,
) -> Stored {
    Stored {
        fingerprint: fingerprint(p),
        model: model.to_string(),
        by_players: (1..=4).map(|n| assign(p, n)).collect(),
    }
}

pub fn parse(text: &str) -> Store {
    let value: Value =
        serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or(Value::Null);
    let mut out = Store::new();
    let Some(games) = value.get("games").and_then(Value::as_object) else {
        return out;
    };
    for (game, v) in games {
        let text = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
        let (Some(fingerprint), Some(model)) = (text("fingerprint"), text("model")) else {
            continue;
        };
        let Some(by) = v.get("byPlayers").and_then(Value::as_array) else {
            continue;
        };
        let by_players: Option<Vec<Vec<Vec<String>>>> = by
            .iter()
            .map(|slots| {
                slots
                    .as_array()?
                    .iter()
                    .map(|ids| {
                        ids.as_array()?
                            .iter()
                            .map(|id| id.as_str().map(str::to_string))
                            .collect()
                    })
                    .collect()
            })
            .collect();
        if let Some(by_players) = by_players {
            out.insert(
                game.clone(),
                Stored {
                    fingerprint,
                    model,
                    by_players,
                },
            );
        }
    }
    out
}

pub fn load(path: Option<&Path>) -> Store {
    path.and_then(|p| std::fs::read_to_string(p).ok())
        .map(|t| parse(&t))
        .unwrap_or_default()
}

pub fn to_json(store: &Store) -> Value {
    let games: Map<String, Value> = store
        .iter()
        .map(|(g, s)| (g.clone(), json!({ "fingerprint": s.fingerprint, "model": s.model, "byPlayers": s.by_players })))
        .collect();
    json!({ "note": "Re:Cooplay がモデルで作った分担 (ゲームごと・人数ごと)。消すと次の一覧の読み込みで作り直します", "games": games })
}

/// 一時ファイルに書いてから置き換える (書きかけのファイルを残さない)
pub fn save(path: &Path, store: &Store) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&to_json(store))?)?;
    std::fs::rename(tmp, path)
}

// ---------- ゲームのファイルから読んで作った仮の操作定義 (#431) ----------
// 操作定義のないゲームごとに、作った仮の定義 (読めなかったときは None) を、作ったモデルの版と一緒に保存する。
// 同じ版では読み直さない。版が変われば作り直す。

#[derive(Clone, Debug, PartialEq)]
pub struct Detected {
    pub model: String,
    pub profile: Option<Value>,
}

pub type DetectedStore = HashMap<String, Detected>;

pub fn detected_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("RECOOPLAY_DETECTED_PROFILES") {
        return Some(PathBuf::from(p));
    }
    if std::env::var("RECOOPLAY_NO_CONFIG").as_deref() == Ok("1") {
        return None;
    }
    std::env::var_os("LOCALAPPDATA").map(|p| {
        PathBuf::from(p)
            .join("Re-Cooplay")
            .join("detected-profiles.json")
    })
}

pub fn parse_detected(text: &str) -> DetectedStore {
    let value: Value =
        serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or(Value::Null);
    let mut out = DetectedStore::new();
    for (game, v) in value
        .get("games")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        let Some(model) = v.get("model").and_then(Value::as_str) else {
            continue;
        };
        // 読み込み時に形式を確かめ、壊れた定義は「なし」として扱う (次の版で作り直す)
        let profile = v
            .get("profile")
            .filter(|p| crate::profiles::parse(p).is_ok())
            .cloned();
        out.insert(
            game.clone(),
            Detected {
                model: model.to_string(),
                profile,
            },
        );
    }
    out
}

pub fn load_detected(path: Option<&Path>) -> DetectedStore {
    path.and_then(|p| std::fs::read_to_string(p).ok())
        .map(|t| parse_detected(&t))
        .unwrap_or_default()
}

pub fn save_detected(path: &Path, store: &DetectedStore) -> std::io::Result<()> {
    let games: Map<String, Value> = store
        .iter()
        .map(|(g, d)| (g.clone(), json!({ "model": d.model, "profile": d.profile })))
        .collect();
    let v = json!({ "note": "Re:Cooplay がゲームのファイルから読んで作った仮の操作定義 (未検証)。消すと次の一覧の読み込みで作り直します", "games": games });
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&v)?)?;
    std::fs::rename(tmp, path)
}

/// 試験用の操作定義 (ホストの試験からも使う)
#[cfg(test)]
pub fn test_profile(id: &str, status: &str, actions: &[(&str, &str)]) -> Profile {
    let v = json!({
        "schema": crate::profiles::SCHEMA, "id": id, "name": "試験", "match": { "ids": [id] },
        "verification": { "status": status },
        "groups": [{ "id": "movement", "label": "移動", "role": "P1" }, { "id": "gameplay", "label": "行動", "role": "P2" }],
        "actions": actions.iter().map(|(a, g)| json!({ "id": a, "label": a, "group": g, "type": "button" })).collect::<Vec<_>>(),
    });
    crate::profiles::parse(&v).expect("試験の定義")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(status: &str, ids: &[(&str, &str)]) -> Profile {
        test_profile("steam:1", status, ids)
    }

    fn by_players(p: &Profile) -> Stored {
        compute(p, "v1", |p, n| {
            let mut out = vec![Vec::new(); n];
            for (i, a) in p.actions.iter().enumerate() {
                out[i % n].push(a.id.clone());
            }
            out
        })
    }

    #[test]
    fn stored_presets_are_used_only_for_the_same_definition_and_model() {
        let p = profile(
            "extracted",
            &[
                ("jump", "movement"),
                ("use", "gameplay"),
                ("map", "gameplay"),
            ],
        );
        let mut store = Store::new();
        store.insert(p.id.clone(), by_players(&p));
        assert_eq!(
            lookup(&store, &p, "v1", 2).unwrap(),
            &vec![vec!["jump".to_string(), "map".into()], vec!["use".into()]]
        );
        assert!(
            lookup(&store, &p, "v2", 2).is_none(),
            "モデルの版が変われば使わない"
        );
        let changed = profile("extracted", &[("jump", "movement"), ("use", "gameplay")]);
        assert!(
            lookup(&store, &changed, "v1", 2).is_none(),
            "操作が変われば使わない"
        );
        assert!(lookup(&store, &p, "v1", 5).is_none());
    }

    #[test]
    fn broken_or_mismatched_values_fall_back_instead_of_being_used() {
        let p = profile("extracted", &[("jump", "movement"), ("use", "gameplay")]);
        let mut s = by_players(&p);
        s.by_players[1] = vec![vec!["jump".into()], vec!["jump".into()]];
        assert!(!valid_for(&s, &p, "v1"), "重複は使わない");
        let mut s = by_players(&p);
        s.by_players[2].push(vec![]);
        assert!(!valid_for(&s, &p, "v1"), "人数と枠の数が合わない");
        let mut s = by_players(&p);
        s.by_players[0][0].push("ghost".into());
        assert!(!valid_for(&s, &p, "v1"), "定義にない操作は使わない");
        assert!(parse("{ broken").is_empty());
        assert!(parse(
            r#"{"games":{"x":{"fingerprint":"a","model":"v1","byPlayers":[[["ok", 3]]]}}}"#
        )
        .is_empty());
    }

    #[test]
    fn saved_presets_round_trip_and_verified_definitions_skip_the_model() {
        let p = profile("extracted", &[("jump", "movement"), ("use", "gameplay")]);
        let mut store = Store::new();
        store.insert(p.id.clone(), by_players(&p));
        let dir =
            std::env::temp_dir().join(format!("recooplay-model-presets-{}", std::process::id()));
        let path = dir.join("model-presets.json");
        save(&path, &store).unwrap();
        assert_eq!(load(Some(&path)), store);
        let _ = std::fs::remove_dir_all(dir);
        assert!(needs_model(&p));
        assert!(!needs_model(&profile("device", &[("jump", "movement")])));
    }
}
