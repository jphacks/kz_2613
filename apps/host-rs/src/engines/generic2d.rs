// ファイルから操作を読めない 2D 向けのエンジン (GameMaker #490・LÖVE #494・HTML5 系 #495) の、2D 向けの汎用の割当。
// キーの判定はゲームのコードの中にあり、操作名が残らないので読まない (利用者の判断 2026-11-14「汎用定義メイン」)。
// エンジンだけを見分けて、矢印の移動と Z・X・C・Enter・Esc・Shift を出す (WASD とマウスの視点の汎用定義は 2D に合わないため)。
// XNA・FNA・MonoGame は WASD とマウスの作品が多いので、ここでは扱わず従来の汎用定義のまま (#493)。
// RPGツクール MV・MZ (NW.js) は rpgmaker が先に読むので、ここには来ない。
use std::path::Path;

use super::{button, child_ci, has_file, in_group};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let source = engine(dir)?;
    Some((actions(), source))
}

/// エンジンの見分け (読み取りなし)
fn engine(dir: &Path) -> Option<&'static str> {
    if child_ci(dir, "data.win").is_some() {
        return Some("GameMaker（読み取りなし・2D 向けの汎用の割当）");
    }
    if child_ci(dir, "love.dll").is_some()
        && has_file(dir, |n| n.starts_with("lua5") && n.ends_with(".dll"))
    {
        return Some("LÖVE（読み取りなし・2D 向けの汎用の割当）");
    }
    let electron = child_ci(dir, "resources")
        .and_then(|r| child_ci(&r, "app.asar"))
        .is_some();
    if child_ci(dir, "nw.dll").is_some() || child_ci(dir, "package.nw").is_some() || electron {
        return Some("HTML5（NW.js・Electron、読み取りなし・2D 向けの汎用の割当）");
    }
    None
}

pub fn actions() -> Vec<ReadAction> {
    vec![
        in_group(button("2d/up", "上へ移動", Some("ARROW_UP")), "movement"),
        in_group(
            button("2d/down", "下へ移動", Some("ARROW_DOWN")),
            "movement",
        ),
        in_group(
            button("2d/left", "左へ移動", Some("ARROW_LEFT")),
            "movement",
        ),
        in_group(
            button("2d/right", "右へ移動", Some("ARROW_RIGHT")),
            "movement",
        ),
        // 移動と Z・X・C は意味が決まっているので、モデルの分類より優先する (#512)
        in_group(button("2d/z", "Z（決定・行動）", Some("KEY_Z")), "gameplay"),
        in_group(
            button("2d/x", "X（キャンセル・行動）", Some("KEY_X")),
            "gameplay",
        ),
        in_group(button("2d/c", "C（行動）", Some("KEY_C")), "gameplay"),
        button("2d/shift", "Shift（ダッシュなど）", Some("LSHIFT")),
        button("2d/enter", "Enter（決定・開始）", Some("ENTER")),
        button("2d/esc", "Esc（メニュー・ポーズ）", Some("ESC")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_2d_engines_only() {
        let dir = std::env::temp_dir().join(format!("recooplay-2d-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for (sub, files, want) in [
            ("gm", &["data.win"][..], Some("GameMaker")),
            ("love", &["love.dll", "lua51.dll"][..], Some("LÖVE")),
            ("love-only", &["love.dll"][..], None),
            ("nw", &["nw.dll"][..], Some("HTML5")),
            ("electron", &["resources/app.asar"][..], Some("HTML5")),
            ("xna", &["MonoGame.Framework.dll"][..], None),
        ] {
            for f in files {
                let p = dir.join(sub).join(f);
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::write(p, b"x").unwrap();
            }
            let got = read(&dir.join(sub));
            match want {
                Some(w) => {
                    let (a, src) = got.unwrap();
                    assert!(src.starts_with(w), "{sub}: {src}");
                    assert_eq!(a.len(), 10);
                    assert!(a.iter().all(|a| a.default.is_some()));
                }
                None => assert!(got.is_none(), "{sub}"),
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
