// ゲームの操作定義 (apps/game-profiles/*.json) を読み込み、検証し、分担の案を作る (#97)。
// 形式は docs/game-profile-specification.md。定義は人が確認した主な情報源で、ユーザーが変えたキーは keybinds が重ねる (#99)。

use std::path::Path;

use serde_json::{json, Value};

use crate::controls;

pub const SCHEMA: u64 = 1;
const TYPES: [&str; 5] = ["button", "axis2d", "mouseDelta", "wheel", "text"];
const ROLES: [&str; 5] = ["P1", "P2", "P3", "host", "none"];
const SUITABILITY: [&str; 4] = ["good", "limited", "unsuitable", "unknown"];
const STATUS: [&str; 5] = ["unverified", "template", "extracted", "reviewed", "device"];
const READERS: [&str; 7] =
    ["minecraft-options", "terraria-input-profiles", "es3-keybindings", "unity-inputsystem-json", "ue-input-ini", "source-cfg", "none"];

#[derive(Clone, Debug)]
pub struct Action {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: String,
    /// 初期のキー (controls::OUTPUTS の ID)
    pub default: Option<&'static str>,
    /// ユーザーの設定ファイルでの名前 (上書き用)
    pub bind: Option<String>,
    /// スマホの操作名 (今の操作画面と結び付く場合)
    pub control: Option<String>,
    /// 分担の釣り合いに使う負担の重み (省略時は種類から決める。#105)
    pub weight: f64,
}

#[derive(Clone, Debug)]
pub struct Part {
    pub id: String,
    pub label: String,
    pub actions: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Group {
    pub id: String,
    pub label: String,
    pub role: String,
    /// 担当が 3 人分に足りないときに分けられる単位 (例: 移動だけのゲームの「左」「右」「ジャンプ」)
    pub split: Vec<Part>,
}

#[derive(Clone, Debug)]
pub struct UserBindings {
    pub reader: String,
    pub path: String,
}

#[derive(Clone, Debug)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub ids: Vec<String>,
    pub steam_app_ids: Vec<u64>,
    pub processes: Vec<String>,
    pub title_contains: Option<String>,
    pub suitability: String,
    pub user_bindings: Option<UserBindings>,
    pub groups: Vec<Group>,
    pub actions: Vec<Action>,
    pub status: String,
    pub verified_date: Option<String>,
    pub game_version: Option<String>,
}

fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_string)
}

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect()).unwrap_or_default()
}

/// 1 件の定義を読み、形式を検証する。誤りは理由を返す
pub fn parse(v: &Value) -> Result<Profile, String> {
    if v.get("schema").and_then(Value::as_u64) != Some(SCHEMA) {
        return Err(format!("schema が {SCHEMA} ではありません"));
    }
    let id = s(v, "id").filter(|i| !i.is_empty()).ok_or("id がありません")?;
    let name = s(v, "name").ok_or("name がありません")?;
    let m = v.get("match").ok_or("match がありません")?;
    let suitability = s(v, "suitability").unwrap_or_else(|| "unknown".into());
    if !SUITABILITY.contains(&suitability.as_str()) {
        return Err(format!("suitability が不正です: {suitability}"));
    }
    let user_bindings = match v.get("userBindings") {
        Some(u) => {
            let reader = s(u, "reader").ok_or("userBindings.reader がありません")?;
            if !READERS.contains(&reader.as_str()) {
                return Err(format!("userBindings.reader が不正です: {reader}"));
            }
            let path = s(u, "path").unwrap_or_default();
            if reader != "none" && path.is_empty() {
                return Err("userBindings.path がありません".into());
            }
            Some(UserBindings { reader, path })
        }
        None => None,
    };
    let mut groups = Vec::new();
    for g in v.get("groups").and_then(Value::as_array).ok_or("groups がありません")? {
        let gid = s(g, "id").ok_or("group.id がありません")?;
        let role = s(g, "role").unwrap_or_else(|| "none".into());
        if !ROLES.contains(&role.as_str()) {
            return Err(format!("group {gid} の role が不正です: {role}"));
        }
        let split = g
            .get("split")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .map(|p| Part {
                        id: s(p, "id").unwrap_or_default(),
                        label: s(p, "label").unwrap_or_default(),
                        actions: strings(p.get("actions")),
                    })
                    .collect()
            })
            .unwrap_or_default();
        if groups.iter().any(|x: &Group| x.id == gid) {
            return Err(format!("group {gid} が重複しています"));
        }
        groups.push(Group { label: s(g, "label").unwrap_or_else(|| gid.clone()), id: gid, role, split });
    }
    let mut actions: Vec<Action> = Vec::new();
    for a in v.get("actions").and_then(Value::as_array).ok_or("actions がありません")? {
        let aid = s(a, "id").ok_or("action.id がありません")?;
        if actions.iter().any(|x| x.id == aid) {
            return Err(format!("action {aid} が重複しています"));
        }
        let group = s(a, "group").ok_or_else(|| format!("action {aid} に group がありません"))?;
        if !groups.iter().any(|g| g.id == group) {
            return Err(format!("action {aid} の group {group} が定義されていません"));
        }
        let kind = s(a, "type").unwrap_or_else(|| "button".into());
        if !TYPES.contains(&kind.as_str()) {
            return Err(format!("action {aid} の type が不正です: {kind}"));
        }
        let default = match s(a, "default") {
            Some(d) => Some(controls::output(&d).map(|o| o.id).ok_or_else(|| format!("action {aid} の default のキー {d} は送れません"))?),
            None => None,
        };
        if let Some(control) = s(a, "control") {
            if actions.iter().any(|a| a.control.as_deref() == Some(&control)) {
                return Err(format!("control {control} が重複しています"));
            }
            let role = &groups.iter().find(|g| g.id == group).unwrap().role;
            if kind != "button" || controls::role_control(role, &control).is_none() {
                return Err(format!("control {control} の担当または種類が不正です"));
            }
        }
        // 視点・2軸は常に操作し続けるため重い。ホイールは補助
        let weight = a.get("weight").and_then(Value::as_f64).filter(|w| *w >= 0.0).unwrap_or(match kind.as_str() {
            "mouseDelta" | "axis2d" => 3.0,
            "wheel" => 0.5,
            _ => 1.0,
        });
        actions.push(Action { label: s(a, "label").unwrap_or_else(|| aid.clone()), id: aid, group, kind, default, bind: s(a, "bind"), control: s(a, "control"), weight });
    }
    for g in &groups {
        let mut used = std::collections::HashSet::new();
        for p in &g.split {
            if let Some(x) = p.actions.iter().find(|x| !actions.iter().any(|a| &a.id == *x && a.group == g.id)) {
                return Err(format!("group {} の split {} の action {x} が定義されていません", g.id, p.id));
            }
            if p.id.is_empty() || p.actions.iter().any(|a| !used.insert(a)) {
                return Err(format!("group {} のsplitが空または重複しています", g.id));
            }
        }
    }
    let ver = v.get("verification");
    let status = ver.and_then(|x| s(x, "status")).unwrap_or_else(|| "unverified".into());
    if !STATUS.contains(&status.as_str()) {
        return Err(format!("verification.status が不正です: {status}"));
    }
    Ok(Profile {
        ids: { let mut ids = strings(m.get("ids")); if !ids.contains(&id) { ids.push(id.clone()); } ids },
        steam_app_ids: m.get("steamAppIds").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_u64).collect()).unwrap_or_default(),
        processes: strings(m.get("processes")),
        title_contains: s(m, "titleContains"),
        id,
        name,
        suitability,
        user_bindings,
        groups,
        actions,
        status,
        verified_date: ver.and_then(|x| s(x, "date")),
        game_version: ver.and_then(|x| s(x, "gameVersion")),
    })
}

/// 同梱の Minecraft の定義 (フォルダが見つからない場合の既定)
pub fn builtin_minecraft() -> Profile {
    let v: Value = serde_json::from_str(include_str!("../../game-profiles/minecraft-java.json")).expect("minecraft-java.json");
    parse(&v).expect("minecraft-java.json の形式")
}

/// 診断用の疑似ゲーム画面 (game.html) の定義。Minecraft と同じキー・分担を使う (#141)
pub fn builtin_pseudo() -> Profile {
    let mut p = builtin_minecraft();
    p.id = "pseudo-game".into();
    p.name = "疑似ゲーム画面".into();
    p.ids = vec!["pseudo-game".into()];
    p.steam_app_ids.clear();
    p.processes.clear();
    p.title_contains = None;
    p.user_bindings = None;
    p
}

/// 操作定義のない検出したゲームに当てる汎用の定義 (#123)。主要500タイトルの 3D アクション型 (scripts/profiles/build-catalog.mjs の
/// action3d) と同じ操作で、確認の状態は template (未検証)。Minecraft の固定の表を別のゲームへ送らないために使う
pub fn generic(game_id: &str, name: &str) -> Profile {
    let b = |id: &str, label: &str, group: &str, key: &str| json!({ "id": id, "label": label, "group": group, "type": "button", "default": key });
    let v = json!({
        "schema": SCHEMA, "id": "generic", "name": name,
        "match": { "ids": [game_id] },
        "verification": { "status": "template", "sources": ["汎用の型（3Dアクション）"] },
        "groups": [
            { "id": "movement", "label": "移動", "role": "P1" }, { "id": "look", "label": "視点", "role": "P2" },
            { "id": "gameplay", "label": "攻撃・使う", "role": "P3" }, { "id": "inventory", "label": "持ち物", "role": "P3" },
            { "id": "menu", "label": "メニュー", "role": "host" }
        ],
        "actions": [
            b("forward", "前進", "movement", "KEY_W"), b("back", "後退", "movement", "KEY_S"), b("left", "左", "movement", "KEY_A"), b("right", "右", "movement", "KEY_D"),
            b("jump", "ジャンプ", "movement", "SPACE"), b("sprint", "走る・回避", "movement", "LSHIFT"), b("crouch", "しゃがむ", "movement", "LCTRL"),
            { "id": "look", "label": "視点", "group": "look", "type": "mouseDelta" },
            b("attack", "攻撃", "gameplay", "MOUSE_L"), b("aim", "構える・防御", "gameplay", "MOUSE_R"), b("interact", "使う・調べる", "gameplay", "KEY_E"),
            b("item1", "アイテム1", "inventory", "DIGIT_1"), b("item2", "アイテム2", "inventory", "DIGIT_2"), b("inventory", "持ち物", "inventory", "TAB"),
            b("map", "マップ", "menu", "KEY_M"), b("pause", "メニュー", "menu", "ESC")
        ]
    });
    parse(&v).expect("汎用の定義の形式")
}

/// フォルダ内の定義をすべて読む。読めない・不正なものは理由を返して飛ばす
pub fn load_dir(dir: &Path) -> (Vec<Profile>, Vec<String>) {
    let mut list = Vec::new();
    let mut errors = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return (list, errors) };
    let mut paths: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "json")).collect();
    paths.sort();
    for p in paths {
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let parsed = std::fs::read_to_string(&p)
            .map_err(|e| e.to_string())
            .and_then(|t| serde_json::from_str::<Value>(t.trim_start_matches('\u{feff}')).map_err(|e| e.to_string()))
            .and_then(|v| parse(&v));
        match parsed {
            Ok(pr) if list.iter().any(|x: &Profile| x.id == pr.id) => errors.push(format!("{name}: id {} が重複しています", pr.id)),
            Ok(pr) => list.push(pr),
            Err(e) => errors.push(format!("{name}: {e}")),
        }
    }
    (list, errors)
}

/// ゲームの ID ("minecraft-java" / "steam:<AppID>" など) に合う定義
pub fn find<'a>(list: &'a [Profile], game_id: &str) -> Option<&'a Profile> {
    let appid = game_id.strip_prefix("steam:").and_then(|a| a.parse::<u64>().ok());
    list.iter().find(|p| p.ids.iter().any(|i| i == game_id) || appid.is_some_and(|a| p.steam_app_ids.contains(&a)))
}

/// 参加人数 n (1〜4) に合わせた分担の案 (#105)。
/// 1. 担当の付くグループ (role が P1〜P3) を、定義の順 (= 優先度: 移動・視点・攻撃・持ち物…) に 1 つの単位とする
/// 2. 単位が人数より少なければ、分けられるグループ (split) を重い順に部分へ分け、それでも足りなければ重い単位を半分に分ける
/// 3. 優先度の高い単位から 1 人ずつ配り、残りは負担 (重みの合計) が最も軽い人へ配る
/// メニュー (host) は P1 (ホスト) のリモコンのまま、会話等 (none) は分担しない
pub fn assignment_for(p: &Profile, n: usize) -> Vec<Vec<String>> {
    let n = n.clamp(1, 4);
    let weight = |ids: &[String]| -> f64 { ids.iter().filter_map(|i| p.actions.iter().find(|a| &a.id == i)).map(|a| a.weight).sum() };
    // (単位の操作, 分けられる部分)
    let mut units: Vec<(Vec<String>, Vec<Vec<String>>)> = p
        .groups
        .iter()
        .filter(|g| g.role.starts_with('P'))
        .map(|g| {
            let ids: Vec<String> = p.actions.iter().filter(|a| a.group == g.id).map(|a| a.id.clone()).collect();
            let mut parts: Vec<Vec<String>> = g.split.iter().map(|s| s.actions.clone()).collect();
            if !parts.is_empty() {
                let rest: Vec<String> = ids.iter().filter(|i| !parts.iter().any(|pp| pp.contains(i))).cloned().collect();
                if !rest.is_empty() {
                    parts.push(rest);
                }
            }
            (ids, parts)
        })
        .filter(|(ids, _)| !ids.is_empty())
        .collect();
    while units.len() < n {
        // 分けられる単位のうち最も重いもの
        let pick = units.iter().enumerate().filter(|(_, (_, parts))| parts.len() >= 2).max_by(|a, b| weight(&a.1 .0).total_cmp(&weight(&b.1 .0))).map(|(i, _)| i);
        if let Some(i) = pick {
            let (_, parts) = units.remove(i);
            for (k, part) in parts.into_iter().enumerate() {
                units.insert(i + k, (part, Vec::new()));
            }
            continue;
        }
        // 分けられる単位がなければ、操作が 2 つ以上ある最も重い単位を半分にする
        let Some(i) = units.iter().enumerate().filter(|(_, (ids, _))| ids.len() >= 2).max_by(|a, b| weight(&a.1 .0).total_cmp(&weight(&b.1 .0))).map(|(i, _)| i) else { break };
        let (ids, _) = units.remove(i);
        let half = ids.len().div_ceil(2);
        units.insert(i, (ids[half..].to_vec(), Vec::new()));
        units.insert(i, (ids[..half].to_vec(), Vec::new()));
    }
    let mut slots: Vec<Vec<String>> = vec![Vec::new(); n];
    for (k, (ids, _)) in units.into_iter().enumerate() {
        let target = if k < n { k } else { (0..n).min_by(|a, b| weight(&slots[*a]).total_cmp(&weight(&slots[*b]))).unwrap_or(0) };
        slots[target].extend(ids);
    }
    slots
}

/// 画面に配る要約。players は今の参加人数 (分担の案をこの人数で作る)。人数ごとの案 (1〜4 人) も付ける
pub fn snapshot(p: &Profile, players: usize) -> Value {
    let named = |n: usize| -> serde_json::Map<String, Value> {
        assignment_for(p, n).into_iter().enumerate().map(|(i, a)| (format!("P{}", i + 1), json!(a))).collect()
    };
    let assign = named(players);
    let by_players: serde_json::Map<String, Value> = (1..=4).map(|n| (n.to_string(), Value::Object(named(n)))).collect();
    json!({
        "id": p.id, "name": p.name, "suitability": p.suitability, "status": p.status,
        "controllerSupported": controller_supported(p),
        "verifiedDate": p.verified_date, "gameVersion": p.game_version,
        "match": { "processes": p.processes, "titleContains": p.title_contains },
        "groups": p.groups.iter().map(|g| json!({
            "id": g.id, "label": g.label, "role": g.role,
            "split": g.split.iter().map(|s| json!({ "id": s.id, "label": s.label, "actions": s.actions })).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
        "actions": p.actions.iter().map(|a| json!({ "id": a.id, "label": a.label, "group": a.group, "type": a.kind, "weight": a.weight })).collect::<Vec<_>>(),
        "players": players,
        "assignment": assign,
        "assignments": by_players,
    })
}

/// スマホの画面 (定義から作る画面) で分担できる定義か。
/// 確認の状態 (未検証など) では制限しない (#123、画面に「未検証」と表示し続ける)。
/// 分担できる操作がない (マウス操作だけの pointer 型など) か、送れない種類の操作があるときは false
pub fn controller_supported(p: &Profile) -> bool {
    let playable: Vec<_>=p.actions.iter().filter(|a| p.groups.iter().any(|g| g.id==a.group && g.role.starts_with('P'))).collect();
    !playable.is_empty() && playable.iter().all(|a| matches!(a.kind.as_str(), "button" | "wheel" | "mouseDelta"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal(extra_actions: &str, groups: &str) -> Value {
        serde_json::from_str(&format!(
            r#"{{"schema":1,"id":"t","name":"T","match":{{"ids":[],"steamAppIds":[42]}},"groups":[{groups}],"actions":[{extra_actions}]}}"#
        ))
        .unwrap()
    }

    #[test]
    fn bundled_profiles_are_valid() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("game-profiles");
        let (list, errors) = load_dir(&dir);
        assert!(errors.is_empty(), "{errors:?}");
        assert!(list.len() >= 500, "{}", list.len());
        assert!(list.iter().any(|p| p.id == "minecraft-java" && p.status == "device"));
    }

    #[test]
    fn invalid_definitions_are_rejected_with_reason() {
        let g = r#"{"id":"m","role":"P1"}"#;
        assert!(parse(&minimal(r#"{"id":"a","group":"x","type":"button"}"#, g)).unwrap_err().contains("group x"));
        assert!(parse(&minimal(r#"{"id":"a","group":"m","type":"button","default":"KEY_NOPE"}"#, g)).unwrap_err().contains("送れません"));
        assert!(parse(&minimal(r#"{"id":"a","group":"m","type":"jump"}"#, g)).unwrap_err().contains("type"));
        assert!(parse(&minimal(r#"{"id":"a","group":"m"}"#, r#"{"id":"m","role":"P9"}"#)).unwrap_err().contains("role"));
        assert!(parse(&minimal(r#"{"id":"a","group":"m"},{"id":"a","group":"m"}"#, g)).unwrap_err().contains("重複"));
        assert!(parse(&minimal(r#"{"id":"a","group":"m"}"#, r#"{"id":"m","role":"P1","split":[{"id":"s","actions":["zz"]}]}"#)).unwrap_err().contains("zz"));
        let mut v = minimal(r#"{"id":"a","group":"m"}"#, g);
        v["schema"] = json!(2);
        assert!(parse(&v).is_err());
    }

    #[test]
    fn find_by_id_and_steam_appid() {
        let p = parse(&minimal(r#"{"id":"a","group":"m","default":"KEY_W"}"#, r#"{"id":"m","role":"P1"}"#)).unwrap();
        let list = vec![p, builtin_minecraft()];
        assert_eq!(find(&list, "steam:42").map(|p| p.id.as_str()), Some("t"));
        assert_eq!(find(&list, "minecraft-java").map(|p| p.id.as_str()), Some("minecraft-java"));
        assert!(find(&list, "steam:43").is_none());
    }

    #[test]
    fn minecraft_assignment_by_players() {
        let p = builtin_minecraft();
        let a = |n| assignment_for(&p, n);
        assert_eq!(a(1).len(), 1);
        assert_eq!(a(1)[0].len(), 13);
        assert_eq!(a(2)[1], ["look", "attack", "use", "inventory", "drop", "hotbar"]);
        assert_eq!(a(3)[0], ["forward", "back", "left", "right", "jump", "sneak", "sprint"]);
        assert_eq!(a(3)[1], ["look"]);
        assert_eq!(a(3)[2], ["attack", "use", "inventory", "drop", "hotbar"]);
        assert_eq!(a(4)[3], ["inventory", "drop", "hotbar"]);
        assert_eq!(a(0).len(), 1); // 人数は 1〜4 に収める
        assert_eq!(a(9).len(), 4);
    }

    #[test]
    fn movement_only_game_is_split_and_unsplittable_groups_are_halved() {
        // 移動だけのゲーム: 3 人なら左・右・ジャンプに分ける
        let p = parse(&minimal(
            r#"{"id":"l","group":"m","default":"KEY_A"},{"id":"r","group":"m","default":"KEY_D"},{"id":"j","group":"m","default":"SPACE"}"#,
            r#"{"id":"m","role":"P1","split":[{"id":"a","actions":["l"]},{"id":"b","actions":["r"]},{"id":"c","actions":["j"]}]}"#,
        ))
        .unwrap();
        assert_eq!(assignment_for(&p, 3), vec![vec!["l"], vec!["r"], vec!["j"]]);
        assert_eq!(assignment_for(&p, 1), vec![vec!["l", "r", "j"]]);
        // 分けられる部分がないグループは半分にする (全員に担当が付く)
        let q = parse(&minimal(r#"{"id":"x","group":"m"},{"id":"y","group":"m"},{"id":"z","group":"m"},{"id":"w","group":"m"}"#, r#"{"id":"m","role":"P1"}"#)).unwrap();
        let a = assignment_for(&q, 2);
        assert_eq!(a, vec![vec!["x", "y"], vec!["z", "w"]]);
        // メニュー (host) と会話 (none) は分担しない
        let h = parse(&minimal(r#"{"id":"x","group":"m"},{"id":"esc","group":"h"},{"id":"t","group":"c"}"#, r#"{"id":"m","role":"P1"},{"id":"h","role":"host"},{"id":"c","role":"none"}"#)).unwrap();
        assert_eq!(assignment_for(&h, 3).concat(), vec!["x"]);
    }
}
#[cfg(test)]
mod review_tests {
    use super::*;
    fn fixture() -> Value { serde_json::from_str(include_str!("../../game-profiles/minecraft-java.json")).unwrap() }
    #[test]
    fn rejects_duplicate_actions_controls_and_foreign_split() {
        let mut v=fixture(); v["actions"][1]["id"]=v["actions"][0]["id"].clone();
        assert!(parse(&v).is_err());
        let mut v=fixture(); v["actions"][1]["control"]=json!("FWD");
        assert!(parse(&v).is_err());
        let mut v=fixture(); v["groups"][0]["split"]=json!([{"id":"bad","actions":["attack"]}]);
        assert!(parse(&v).is_err());
    }
    #[test]
    fn assignment_keeps_roles_and_splits_movement_without_duplicates() {
        let p=builtin_minecraft(); let a=assignment_for(&p,3);
        // 3人の分担は、これまでの固定の分担と同じ (P1 移動・P2 視点・P3 攻撃・使う・持ち物、#141)
        assert_eq!(a, vec![
            vec!["forward","back","left","right","jump","sneak","sprint"],
            vec!["look"],
            vec!["attack","use","inventory","drop","hotbar"],
        ]);
        let mut v=fixture();
        v["groups"]=json!([{"id":"movement","role":"P1","split":[{"id":"left","actions":["left"]},{"id":"right","actions":["right"]}]}]);
        v["actions"].as_array_mut().unwrap().retain(|a| a["group"]=="movement");
        let a=assignment_for(&parse(&v).unwrap(),3);
        assert!(a.iter().all(|a| !a.is_empty()));
        let flat:Vec<_>=a.iter().flat_map(|a|a).collect();
        assert_eq!(flat.len(),flat.iter().collect::<std::collections::HashSet<_>>().len());
    }
    #[test]
    fn all_repository_profiles_validate() {
        let dir=Path::new(env!("CARGO_MANIFEST_DIR")).join("../game-profiles");
        let (list,errors)=load_dir(&dir);
        assert!(errors.is_empty(),"{errors:?}"); assert!(!list.is_empty());
    }
    #[test]
    fn generic_profile_is_valid_and_supported() {
        let p = generic("steam:1", "試験");
        assert_eq!(p.id, "generic");
        assert_eq!(p.status, "template");
        assert!(controller_supported(&p));
        assert_eq!(find(std::slice::from_ref(&p), "steam:1").map(|x| x.name.as_str()), Some("試験"));
        let a = assignment_for(&p, 3);
        assert!(a[0].contains(&"forward".to_string()) && a[1].contains(&"look".to_string()) && a[2].contains(&"attack".to_string()));
    }

    #[test]
    fn pointer_only_profile_is_not_supported() {
        let p = parse(&serde_json::from_str::<Value>(r#"{"schema":1,"id":"pt","name":"PT","match":{"ids":["x"]},"verification":{"status":"template"},
            "groups":[{"id":"pointer","label":"マウス操作","role":"none"},{"id":"menu","label":"メニュー","role":"host"}],
            "actions":[{"id":"select","group":"pointer","default":"MOUSE_L"},{"id":"pause","group":"menu","default":"ESC"}]}"#).unwrap()).unwrap();
        assert!(!controller_supported(&p));
    }

    #[test]
    fn assignment_metadata_does_not_enable_an_unsupported_controller() {
        let mut p=builtin_minecraft(); assert!(controller_supported(&p));
        // 確認の状態では制限しない (#123)
        p.status="template".into(); assert!(controller_supported(&p)); p.status="device".into();
        // Minecraft も他のゲームと同じ判定 (#141): 送れない種類の操作があれば分担できない
        p.actions.iter_mut().for_each(|a| a.control=None);
        assert!(controller_supported(&p));
        p.actions[0].kind="axis2d".into();
        assert!(!controller_supported(&p));
    }
}

/// 代表的な型の分担 (#105)。主要500タイトルの定義 (docs/develop/data/top500-games.json の template) から各型 1 本を選び、
/// 1〜4人の分担が規則どおりで、負担 (重みの合計) が偏らないことを確かめる。
/// 表は `cargo test --release representative_assignment_table -- --ignored --nocapture` で出力する
#[cfg(test)]
mod representative_tests {
    use super::*;

    const REPRESENTATIVES: [(&str, &str); 5] = [
        ("FPS", "steam-1172470"),
        ("3Dアクション", "steam-2767030"),
        ("プラットフォーマー", "steam-268910"),
        ("見下ろし型", "steam-250900"),
        ("レース", "steam-2483190"),
    ];

    fn load(id: &str) -> Profile {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../game-profiles").join(format!("{id}.json"));
        parse(&serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()).unwrap()
    }

    fn load_of(p: &Profile, ids: &[String]) -> f64 {
        ids.iter().filter_map(|i| p.actions.iter().find(|a| &a.id == i)).map(|a| a.weight).sum()
    }

    /// 分けられない単位: 分け方 (split) のあるグループは各部分と残り、ないグループは全体
    fn parts(p: &Profile) -> Vec<Vec<String>> {
        p.groups.iter().filter(|g| g.role.starts_with('P')).flat_map(|g| {
            let ids: Vec<String> = p.actions.iter().filter(|a| a.group == g.id).map(|a| a.id.clone()).collect();
            if g.split.is_empty() { return vec![ids]; }
            let mut v: Vec<Vec<String>> = g.split.iter().map(|s| s.actions.clone()).collect();
            let rest: Vec<String> = ids.into_iter().filter(|i| !v.iter().any(|s| s.contains(i))).collect();
            if !rest.is_empty() { v.push(rest); }
            v
        }).collect()
    }

    #[test]
    fn representative_types_follow_rules_and_stay_balanced() {
        for (kind, id) in REPRESENTATIVES {
            let p = load(id);
            let playable: Vec<String> = parts(&p).concat();
            let first = &parts(&p)[0];
            for n in 1..=4 {
                let a = assignment_for(&p, n);
                let name = format!("{kind} {id} {n}人");
                assert_eq!(a.len(), n, "{name}: 人数分の担当");
                // 重複・漏れなし。メニュー (host) などは配らない
                let mut flat = a.concat();
                flat.sort();
                let mut want = playable.clone();
                want.sort();
                assert_eq!(flat, want, "{name}: 操作の重複・漏れ");
                if playable.len() >= n { assert!(a.iter().all(|x| !x.is_empty()), "{name}: 担当のない人"); }
                // 優先度: 最初の単位 (移動など) は P1 (ホスト) から配る
                assert!(a[0].iter().any(|x| first.contains(x)), "{name}: P1 に最初の単位がない");
                // 偏り: 最も重い人が分けられない単位 1 つだけを持つなら、それ以上は軽くできない。
                // そうでなければ、平均の 1.5 倍を超えない
                let loads: Vec<f64> = a.iter().map(|x| load_of(&p, x)).collect();
                let avg = loads.iter().sum::<f64>() / n as f64;
                let (heavy, max) = loads.iter().enumerate().max_by(|x, y| x.1.total_cmp(y.1)).map(|(i, l)| (i, *l)).unwrap();
                let single = parts(&p).iter().any(|part| a[heavy].iter().all(|x| part.contains(x)));
                assert!(single || max <= avg * 1.5, "{name}: 負担の偏り {loads:?}");
            }
        }
    }

    #[test]
    #[ignore]
    fn representative_assignment_table() {
        for (kind, id) in REPRESENTATIVES {
            let p = load(id);
            println!("\n### {kind}：{}（{id}）", p.name);
            println!("| 人数 | 担当（操作の数／重み） |\n|---|---|");
            for n in 1..=4 {
                let cells: Vec<String> = assignment_for(&p, n)
                    .iter()
                    .enumerate()
                    .map(|(i, a)| {
                        let labels: Vec<&str> = a.iter().filter_map(|x| p.actions.iter().find(|y| &y.id == x)).map(|y| y.label.as_str()).collect();
                        format!("P{}：{}（{}／{}）", i + 1, labels.join("・"), a.len(), load_of(&p, a))
                    })
                    .collect();
                println!("| {n} | {} |", cells.join("<br>"));
            }
        }
    }
}
