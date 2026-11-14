// WOLF RPG エディター (ウディタ) 製のゲーム (#488)。
// 基本のキーはエンジンでほぼ固定 (決定 = Z・Space・Enter、キャンセル = X・Esc、サブキー = Shift、移動 = 矢印)。
// データ (Data.wolf など) は暗号化されていることがあるので読まず、ファイルの並びで見分けて既定のキーで操作を作る。
use std::path::Path;

use super::{button, child_ci};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if !is_wolf(dir) {
        return None;
    }
    Some((actions(), "WOLF RPG エディターの既定のキー"))
}

/// Game.exe があり、Data.wolf か Data/BasicData (アーカイブにしていない作品) がある
pub fn is_wolf(dir: &Path) -> bool {
    if child_ci(dir, "Game.exe").is_none() {
        return false;
    }
    if child_ci(dir, "Data.wolf").is_some() {
        return true;
    }
    child_ci(dir, "Data")
        .and_then(|d| child_ci(&d, "BasicData"))
        .is_some_and(|b| b.is_dir())
}

pub fn actions() -> Vec<ReadAction> {
    vec![
        button("wolf/up", "上へ移動", Some("ARROW_UP")),
        button("wolf/down", "下へ移動", Some("ARROW_DOWN")),
        button("wolf/left", "左へ移動", Some("ARROW_LEFT")),
        button("wolf/right", "右へ移動", Some("ARROW_RIGHT")),
        button("wolf/ok", "決定", Some("KEY_Z")),
        button("wolf/cancel", "キャンセル・メニュー", Some("KEY_X")),
        button("wolf/sub", "サブキー（ダッシュなど）", Some("LSHIFT")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_wolf_folders() {
        let dir = std::env::temp_dir().join(format!("recooplay-wolf-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("a")).unwrap();
        std::fs::write(dir.join("a/Game.exe"), b"MZ").unwrap();
        assert!(
            !is_wolf(&dir.join("a")),
            "Game.exe だけではツクールなどと区別できない"
        );
        std::fs::write(dir.join("a/Data.wolf"), b"").unwrap();
        assert!(is_wolf(&dir.join("a")));
        std::fs::create_dir_all(dir.join("b/Data/BasicData")).unwrap();
        std::fs::write(dir.join("b/Game.exe"), b"MZ").unwrap();
        let (a, _) = read(&dir.join("b")).unwrap();
        assert_eq!(a.len(), 7);
        assert_eq!(a[4].default, Some("KEY_Z"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
