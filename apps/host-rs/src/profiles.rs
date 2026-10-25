// ゲームの操作定義 (apps/game-profiles/*.json) を読み込み、検証し、分担の案を作る (#97)。
// 形式は docs/architecture/game-profiles.md。定義は人が確認した主な情報源で、ユーザーが変えたキーは keybinds が重ねる (#99)。

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
        // 視点・2軸は常に操作し続けるため重い。ホイールは補助
        let weight = a.get("weight").and_then(Value::as_f64).filter(|w| *w >= 0.0).unwrap_or(match kind.as_str() {
            "mouseDelta" | "axis2d" => 3.0,
            "wheel" => 0.5,
            _ => 1.0,
        });
        actions.push(Action { label: s(a, "label").unwrap_or_else(|| aid.clone()), id: aid, group, kind, default, bind: s(a, "bind"), control: s(a, "control"), weight });
    }
    for g in &groups {
        for p in &g.split {
            if let Some(x) = p.actions.iter().find(|x| !actions.iter().any(|a| &a.id == *x)) {
                return Err(format!("group {} の split {} の action {x} が定義されていません", g.id, p.id));
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
