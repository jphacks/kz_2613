// id Tech・Quake 系と、Source 1 の作品の cfg (#491)。`bind "w" "+forward"` の形のキー設定を、
// 既存の source-cfg と同じ読み方 (keybinds::source_cfg) で読み、割り当てのある命令を操作にする。
// 対象：Quake (id1/config.cfg)、Quake II (baseq2/config.cfg)、Quake III (baseq3/q3config.cfg)、
// Source 1 の作品 (<mod>/gameinfo.txt があるフォルダの <mod>/cfg/config.cfg)。
use std::path::{Path, PathBuf};

use super::{button, child_ci, look, read_text};
use crate::game_actions::ReadAction;
use crate::keybinds::Key;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let (cfg, kind) = find_cfg(dir)?;
    let text = read_text(&cfg)?;
    let actions = actions_from_cfg(&text);
    (!actions.is_empty()).then_some((actions, kind))
}

fn find_cfg(dir: &Path) -> Option<(PathBuf, &'static str)> {
    for (sub, file, kind) in [
        ("id1", "config.cfg", "Quake の config.cfg"),
        ("baseq2", "config.cfg", "Quake II の config.cfg"),
        ("baseq3", "q3config.cfg", "Quake III の q3config.cfg"),
    ] {
        if let Some(f) = child_ci(dir, sub).and_then(|d| child_ci(&d, file)) {
            return Some((f, kind));
        }
    }
    // Source 1：gameinfo.txt のあるフォルダ (mod) の cfg/config.cfg
    let mut mods: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && child_ci(p, "gameinfo.txt").is_some())
        .collect();
    mods.sort();
    mods.into_iter().find_map(|m| {
        child_ci(&m, "cfg")
            .and_then(|c| child_ci(&c, "config.cfg"))
            .map(|f| (f, "Source の config.cfg"))
    })
}

/// 命令の日本語のラベル。並びは操作の出す順。None は分担に出さない (画面・会話・開発用)
pub fn command_label(cmd: &str) -> Option<String> {
    let c = cmd.trim().to_ascii_lowercase();
    if let Some(n) = c.strip_prefix("slot").and_then(|n| n.parse::<u32>().ok()) {
        return Some(format!("武器・持ち物 {n}"));
    }
    let label = match c.as_str() {
        "+forward" => "前進",
        "+back" => "後退",
        "+moveleft" => "左へ移動",
        "+moveright" => "右へ移動",
        "+left" => "左を向く",
        "+right" => "右を向く",
        "+jump" | "+moveup" => "ジャンプ",
        "+duck" | "+movedown" => "しゃがむ",
        "+speed" | "+sprint" => "走る",
        "+walk" => "歩く",
        "+attack" => "攻撃",
        "+attack2" => "攻撃2・狙う",
        "+attack3" => "攻撃3",
        "+reload" => "リロード",
        "+use" | "+activate" => "使う・調べる",
        "+zoom" => "ズーム",
        "+button0" | "+button1" | "+button2" => return Some(cmd.to_string()),
        "invnext" | "weapnext" => "次の武器",
        "invprev" | "weapprev" => "前の武器",
        "lastinv" => "直前の武器",
        "drop" => "捨てる",
        "phys_swap" => "物理ガン",
        "impulse 100" => "ライト",
        "impulse 201" => "スプレー",
        "+lookatweapon" => "武器を見る",
        "+inspect" => "調べる",
        "buymenu" => "購入メニュー",
        // 画面・会話・開発用は分担しない
        "+showscores" | "+score" | "+voicerecord" | "toggleconsole" | "screenshot" | "jpeg"
        | "messagemode" | "messagemode2" | "pause" | "quit" | "save quick" | "load quick"
        | "cancelselect" | "+graph" => return None,
        other if other.starts_with('+') => return Some(cmd.to_string()),
        _ => return None,
    };
    Some(label.to_string())
}

fn order(cmd: &str) -> usize {
    const ORDER: [&str; 12] = [
        "+forward",
        "+back",
        "+moveleft",
        "+moveright",
        "+jump",
        "+duck",
        "+speed",
        "+sprint",
        "+walk",
        "+attack",
        "+attack2",
        "+reload",
    ];
    ORDER.iter().position(|c| *c == cmd).unwrap_or(ORDER.len())
}

/// cfg の割り当てから操作を作る (割り当てのない命令は出さない)。移動があればマウスの視点も足す
pub fn actions_from_cfg(text: &str) -> Vec<ReadAction> {
    let map = crate::keybinds::source_cfg(text);
    actions_from_bindings(
        map.iter()
            .filter(|(c, _)| !c.starts_with("key:") && *c != "*")
            .filter_map(|(c, k)| match k {
                Key::Output(k) => Some((c.clone(), Some(*k))),
                _ => None,
            })
            .collect(),
        "cfg",
    )
}

/// (命令, キー) の一覧から操作を作る (Source 2 と共通)
pub fn actions_from_bindings(
    mut binds: Vec<(String, Option<&'static str>)>,
    prefix: &str,
) -> Vec<ReadAction> {
    binds.sort_by(|a, b| {
        order(&a.0.to_ascii_lowercase())
            .cmp(&order(&b.0.to_ascii_lowercase()))
            .then(a.0.cmp(&b.0))
    });
    let mut out: Vec<ReadAction> = Vec::new();
    for (cmd, key) in binds {
        let Some(label) = command_label(&cmd) else {
            continue;
        };
        let id = format!("{prefix}/{}", cmd.to_ascii_lowercase());
        if out.iter().any(|a| a.id == id) {
            continue;
        }
        out.push(button(id, label, key));
    }
    if out
        .iter()
        .any(|a| a.id.ends_with("/+forward") || a.id.ends_with("/+moveleft"))
    {
        out.push(look(format!("{prefix}/look"), "視点"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quake_cfg_becomes_actions() {
        let cfg = r#"unbindall
bind "w" "+forward"
bind "s" "+back"
bind a +moveleft
bind d +moveright
bind SPACE "+jump"
bind MOUSE1 "+attack"
bind "`" "toggleconsole"
bind "TAB" "+showscores"
bind "1" "slot1"; bind "2" "impulse 100"
"#;
        let a = actions_from_cfg(cfg);
        let ids: Vec<&str> = a.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "cfg/+forward",
                "cfg/+back",
                "cfg/+moveleft",
                "cfg/+moveright",
                "cfg/+jump",
                "cfg/+attack",
                "cfg/impulse 100",
                "cfg/slot1",
                "cfg/look"
            ],
            "コンソール・スコアは出さない。移動があれば視点を足す"
        );
        assert_eq!(a[0].default, Some("KEY_W"));
        assert_eq!(a[5].default, Some("MOUSE_L"));
        assert_eq!(a[6].label, "ライト");
        assert_eq!(a[7].label, "武器・持ち物 1");
        assert_eq!(a[8].kind, "mouseDelta");
    }

    #[test]
    fn finds_cfg_in_quake_and_source_folders() {
        let dir = std::env::temp_dir().join(format!("recooplay-quake-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("q/id1")).unwrap();
        std::fs::write(dir.join("q/id1/config.cfg"), "bind w +forward\n").unwrap();
        assert!(read(&dir.join("q")).unwrap().1.starts_with("Quake"));
        std::fs::create_dir_all(dir.join("s/mymod/cfg")).unwrap();
        std::fs::write(dir.join("s/mymod/gameinfo.txt"), "\"GameInfo\" {}").unwrap();
        std::fs::write(dir.join("s/mymod/cfg/config.cfg"), "bind \"e\" \"+use\"\n").unwrap();
        let (a, src) = read(&dir.join("s")).unwrap();
        assert!(src.starts_with("Source"));
        assert_eq!(
            (a[0].label.as_str(), a[0].default),
            ("使う・調べる", Some("KEY_E"))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
