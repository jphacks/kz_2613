// Source 2 (Counter-Strike 2・Dota 2 など) の利用者のキー割当 (#487)。
// Steam の userdata/<アカウント>/<AppID>/local/cfg/ にある .vcfg (KeyValues 形式の "bindings" { "w" "+forward" })
// を読み、Source 1 と同じ命令の表で操作にする。AppID はライブラリの appmanifest_*.acf の installdir から探す。
use std::path::{Path, PathBuf};

use super::{key_name, quake::actions_from_bindings, read_text};
use crate::game_actions::ReadAction;

pub fn read(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if !dir.join("game").join("bin").join("win64").is_dir() {
        return None;
    }
    let vcfg = find_vcfg(dir)?;
    let actions = actions_from_vcfg(&read_text(&vcfg)?);
    (!actions.is_empty()).then_some((actions, "Source 2 の利用者のキー設定（.vcfg）"))
}

/// <Steam>/steamapps/common/<ゲーム> から、AppID とログインしたことのあるアカウントの cfg を探す
fn find_vcfg(dir: &Path) -> Option<PathBuf> {
    let install = dir.file_name()?.to_str()?.to_string();
    let steamapps = dir.parent()?.parent()?;
    let app_id = std::fs::read_dir(steamapps).ok()?.flatten().find_map(|e| {
        let name = e.file_name().to_str()?.to_string();
        let id = name
            .strip_prefix("appmanifest_")?
            .strip_suffix(".acf")?
            .to_string();
        let text = read_text(&e.path())?;
        let dir_name = kv_value(&text, "installdir")?;
        dir_name.eq_ignore_ascii_case(&install).then_some(id)
    })?;
    // userdata はライブラリではなく Steam の本体のフォルダにある (既定のライブラリなら steamapps の親)
    let steam = steamapps.parent()?;
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for user in std::fs::read_dir(steam.join("userdata")).ok()?.flatten() {
        let cfg = user.path().join(&app_id).join("local").join("cfg");
        let Ok(rd) = std::fs::read_dir(&cfg) else {
            continue;
        };
        for f in rd.flatten() {
            let p = f.path();
            let n = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if n.ends_with(".vcfg") && n.contains("keys") {
                let t = f
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                found.push((t, p));
            }
        }
    }
    // いちばん新しく書かれたもの
    found.into_iter().max_by_key(|(t, _)| *t).map(|(_, p)| p)
}

/// KeyValues のトークン (引用符の文字列・括弧) の並び。// のコメントは外す
fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                for c in chars.by_ref() {
                    if c == '"' {
                        break;
                    }
                    s.push(c);
                }
                out.push(s);
            }
            '{' | '}' => out.push(c.to_string()),
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            _ => {
                let mut s = c.to_string();
                while let Some(&n) = chars.peek() {
                    if n.is_whitespace() || n == '"' || n == '{' || n == '}' {
                        break;
                    }
                    s.push(n);
                    chars.next();
                }
                out.push(s);
            }
        }
    }
    out
}

/// "key" "value" の最初の値 (appmanifest の installdir など)
fn kv_value(text: &str, key: &str) -> Option<String> {
    let t = tokens(text);
    t.windows(2)
        .find(|w| w[0].eq_ignore_ascii_case(key) && w[1] != "{" && w[1] != "}")
        .map(|w| w[1].clone())
}

/// "bindings" { "キー" "命令" ... } の組 (書かれた順)
pub fn bindings(text: &str) -> Vec<(String, String)> {
    let t = tokens(text);
    let Some(start) = t
        .windows(2)
        .position(|w| w[0].eq_ignore_ascii_case("bindings") && w[1] == "{")
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut i = start + 2;
    while i + 1 < t.len() && t[i] != "}" {
        if t[i + 1] == "{" {
            // 入れ子 (使わない) は読み飛ばす
            let mut depth = 0;
            while i < t.len() {
                if t[i] == "{" {
                    depth += 1;
                } else if t[i] == "}" {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        out.push((t[i].clone(), t[i + 1].clone()));
        i += 2;
    }
    out
}

pub fn actions_from_vcfg(text: &str) -> Vec<ReadAction> {
    let mut binds: Vec<(String, Option<&'static str>)> = Vec::new();
    for (key, cmd) in bindings(text) {
        // 1 つのキーに「;」で複数の命令を並べたものは、最初の命令だけ
        let cmd = cmd.split(';').next().unwrap_or("").trim().to_string();
        if cmd.is_empty() {
            continue;
        }
        // CS2 の +left・+right は横移動 (Source 1 の +moveleft・+moveright にあたる)
        let cmd = match cmd.to_ascii_lowercase().as_str() {
            "+left" => "+moveleft".to_string(),
            "+right" => "+moveright".to_string(),
            _ => cmd,
        };
        let k = key_name(&key);
        match binds.iter_mut().find(|(c, _)| c.eq_ignore_ascii_case(&cmd)) {
            Some((_, existing)) => {
                if existing.is_none() {
                    *existing = k;
                }
            }
            None => binds.push((cmd, k)),
        }
    }
    actions_from_bindings(binds, "source2")
}

/// 利用者のキー設定のファイル (#524)
pub fn user_config(dir: &Path) -> Option<PathBuf> {
    if !dir.join("game").join("bin").join("win64").is_dir() {
        return None;
    }
    find_vcfg(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VCFG: &str = r#""config"
{
	"bindings"
	{
		"MOUSE1"		"+attack"
		"MOUSE2"		"+attack2"
		"w"		"+forward"
		"s"		"+back"
		"a"		"+left"
		"d"		"+right"
		"SPACE"		"+jump"
		"CTRL"		"+duck"
		"SHIFT"		"+sprint"
		"e"		"+use"
		"r"		"+reload"
		"1"		"slot1"
		"TAB"		"+showscores"
		"`"		"toggleconsole"
		"UPARROW"		"+forward"
	}
}
"#;

    #[test]
    fn vcfg_bindings_become_actions() {
        assert_eq!(bindings(VCFG).len(), 15);
        let a = actions_from_vcfg(VCFG);
        let f = a.iter().find(|a| a.id == "source2/+forward").unwrap();
        assert_eq!(
            (f.label.as_str(), f.default),
            ("前進", Some("KEY_W")),
            "最初に書かれたキー"
        );
        assert!(a
            .iter()
            .all(|a| a.id != "source2/+showscores" && a.id != "source2/toggleconsole"));
        assert_eq!(
            a.iter()
                .find(|a| a.id == "source2/+attack")
                .unwrap()
                .default,
            Some("MOUSE_L")
        );
        assert_eq!(
            a.iter()
                .find(|a| a.id == "source2/+sprint")
                .unwrap()
                .default,
            Some("LSHIFT")
        );
        assert!(
            a.iter().any(|a| a.kind == "mouseDelta"),
            "移動があれば視点を足す"
        );
    }

    #[test]
    fn finds_vcfg_through_appmanifest() {
        let root = std::env::temp_dir().join(format!("recooplay-source2-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = root.join("steamapps/common/Counter-Strike Global Offensive");
        std::fs::create_dir_all(game.join("game/bin/win64")).unwrap();
        std::fs::write(
            root.join("steamapps/appmanifest_730.acf"),
            "\"AppState\"\n{\n\t\"appid\"\t\t\"730\"\n\t\"installdir\"\t\t\"Counter-Strike Global Offensive\"\n}\n",
        )
        .unwrap();
        let cfg = root.join("userdata/123/730/local/cfg");
        std::fs::create_dir_all(&cfg).unwrap();
        std::fs::write(cfg.join("cs2_user_keys_0_slot0.vcfg"), VCFG).unwrap();
        let (a, src) = read(&game).unwrap();
        assert!(src.contains(".vcfg"));
        assert!(a.iter().any(|a| a.id == "source2/+jump"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
