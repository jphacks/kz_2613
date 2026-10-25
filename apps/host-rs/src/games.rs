// PC 内のランチャーの情報からインストール済みのゲームを見つけ、選んだゲームを起動する (#54・#93)。
// 読むのは PC 内のファイルとレジストリだけで、ネットワークは使わない。
// 見つけたことは入力が通ることを意味しない (要件 11 章 5 項)。一覧の項目はすべて「未検証」として扱う。
// 起動はホストが検出時に確かめた値だけから組み立てる。画面からは項目の id しか受け取らない (#88 の制約)。

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

/// 一覧の 1 項目
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    /// "steam:<appid>" / "epic:<AppName>"
    pub id: String,
    pub name: String,
    pub source: &'static str,
    /// インストール先 (入力先の判定に使う: このフォルダ内のプロセスが前面のときだけ注入する)
    pub install_dir: PathBuf,
    /// 起動に使う URL (ランチャーのプロトコル)。値は検出時に確かめたものだけ
    pub launch_uri: String,
}

impl Entry {
    pub fn snapshot(&self) -> Value {
        json!({ "id": self.id, "name": self.name, "source": self.source, "verified": false, "launchable": true })
    }
}

/// 探す場所。実機では Windows の既定の場所、試験では RECOOPLAY_FAKE_GAMES のフォルダを使う
pub struct Roots {
    pub steam: Option<PathBuf>,
    pub epic_manifests: Option<PathBuf>,
}

impl Roots {
    pub fn system() -> Roots {
        Roots {
            steam: imp::steam_path(),
            epic_manifests: std::env::var_os("PROGRAMDATA")
                .map(|p| PathBuf::from(p).join(r"Epic\EpicGamesLauncher\Data\Manifests")),
        }
    }

    /// 試験用: <dir>/steam を Steam のフォルダ、<dir>/epic を Epic のマニフェストのフォルダとみなす
    pub fn fake(dir: &Path) -> Roots {
        Roots { steam: Some(dir.join("steam")), epic_manifests: Some(dir.join("epic")) }
    }
}

/// インストール済みのゲームを探す。読めないファイルは飛ばす (一部が壊れていても残りは出す)
pub fn detect(roots: &Roots) -> Vec<Entry> {
    let mut list = Vec::new();
    if let Some(steam) = &roots.steam {
        list.extend(detect_steam(steam));
    }
    if let Some(dir) = &roots.epic_manifests {
        list.extend(detect_epic(dir));
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
    list.dedup_by(|a, b| a.id == b.id);
    list
}

/// ランチャーのプロトコルで起動する。dry-run では呼ばない
pub fn launch(entry: &Entry) -> Result<(), String> {
    imp::open_uri(&entry.launch_uri)
}

// ---------- Steam ----------

// ゲームではない Steam の項目 (再頒布パッケージ・互換レイヤー)
const STEAM_NOT_GAMES: [&str; 1] = ["228980"];
const STEAM_NOT_GAME_PREFIXES: [&str; 3] = ["Proton", "Steam Linux Runtime", "Steamworks Common"];
const STEAM_FULLY_INSTALLED: u64 = 4;

fn detect_steam(steam: &Path) -> Vec<Entry> {
    let mut libraries = vec![steam.to_path_buf()];
    if let Some(vdf) = std::fs::read_to_string(steam.join(r"steamapps\libraryfolders.vdf")).ok().and_then(|t| parse_vdf(&t)) {
        for path in library_paths(&vdf) {
            if !libraries.iter().any(|l| same_path(l, &path)) {
                libraries.push(path);
            }
        }
    }
    let mut list = Vec::new();
    for lib in libraries {
        let Ok(dir) = std::fs::read_dir(lib.join("steamapps")) else { continue };
        for f in dir.flatten() {
            let name = f.file_name().to_string_lossy().to_string();
            if !(name.starts_with("appmanifest_") && name.ends_with(".acf")) {
                continue;
            }
            let Some(acf) = std::fs::read_to_string(f.path()).ok().and_then(|t| parse_vdf(&t)) else { continue };
            if let Some(e) = steam_entry(&acf, &lib) {
                if e.install_dir.is_dir() {
                    list.push(e);
                }
            }
        }
    }
    list
}

fn library_paths(vdf: &Vdf) -> Vec<PathBuf> {
    let Some(root) = vdf.get("libraryfolders") else { return vec![] };
    let Vdf::Obj(items) = root else { return vec![] };
    items
        .iter()
        .filter(|(k, _)| k.chars().all(|c| c.is_ascii_digit()))
        .filter_map(|(_, v)| match v {
            // 新しい形式: "0" { "path" "D:\\SteamLibrary" ... }
            Vdf::Obj(_) => v.get("path").and_then(Vdf::as_str),
            // 古い形式: "1" "D:\\SteamLibrary"
            Vdf::Str(s) => Some(s.as_str()),
        })
        .map(PathBuf::from)
        .collect()
}

fn steam_entry(acf: &Vdf, library: &Path) -> Option<Entry> {
    let app = acf.get("AppState")?;
    let appid = app.get("appid")?.as_str()?;
    let name = app.get("name")?.as_str()?.trim();
    let installdir = app.get("installdir")?.as_str()?;
    let flags: u64 = app.get("StateFlags").and_then(Vdf::as_str).and_then(|f| f.parse().ok()).unwrap_or(0);
    if appid.is_empty() || !appid.chars().all(|c| c.is_ascii_digit()) || appid.len() > 10 {
        return None;
    }
    if name.is_empty() || flags & STEAM_FULLY_INSTALLED == 0 || STEAM_NOT_GAMES.contains(&appid) {
        return None;
    }
    if STEAM_NOT_GAME_PREFIXES.iter().any(|p| name.starts_with(p)) {
        return None;
    }
    let install_dir = library.join("steamapps").join("common").join(safe_dir(installdir)?);
    Some(Entry {
        id: format!("steam:{appid}"),
        name: name.to_string(),
        source: "steam",
        install_dir,
        launch_uri: format!("steam://rungameid/{appid}"),
    })
}

// ---------- Epic ----------

fn detect_epic(dir: &Path) -> Vec<Entry> {
    let Ok(files) = std::fs::read_dir(dir) else { return vec![] };
    files
        .flatten()
        .filter(|f| f.path().extension().is_some_and(|e| e.eq_ignore_ascii_case("item")))
        .filter_map(|f| std::fs::read_to_string(f.path()).ok())
        .filter_map(|t| serde_json::from_str::<Value>(&t).ok())
        .filter_map(|v| epic_entry(&v))
        .filter(|e| e.install_dir.is_dir())
        .collect()
}

fn epic_entry(v: &Value) -> Option<Entry> {
    let text = |k: &str| v.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty());
    let app = text("AppName").filter(|a| epic_id_ok(a))?;
    let name = text("DisplayName")?;
    let dir = text("InstallLocation")?;
    if v.get("bIsIncompleteInstall").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    // 追加コンテンツ (DLC) は本体の AppName を MainGameAppName に持つ
    if text("MainGameAppName").is_some_and(|m| m != app) {
        return None;
    }
    // カテゴリがあるなら "games" を含むものだけ (Unreal Engine などのツールを除く)
    if let Some(cats) = v.get("AppCategories").and_then(Value::as_array) {
        if !cats.iter().any(|c| c.as_str() == Some("games")) {
            return None;
        }
    }
    let ns = text("CatalogNamespace").filter(|s| epic_id_ok(s));
    let item = text("CatalogItemId").filter(|s| epic_id_ok(s));
    let target = match (ns, item) {
        (Some(ns), Some(item)) => format!("{ns}%3A{item}%3A{app}"),
        _ => app.to_string(),
    };
    let install_dir = PathBuf::from(dir);
    if !install_dir.is_absolute() {
        return None;
    }
    Some(Entry {
        id: format!("epic:{app}"),
        name: name.to_string(),
        source: "epic",
        install_dir,
        launch_uri: format!("com.epicgames.launcher://apps/{target}?action=launch&silent=true"),
    })
}

/// URL に埋め込む値は英数字と . _ - だけを許す (それ以外の文字で URL や引数を組み替えられないように)
fn epic_id_ok(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// フォルダ名 1 つだけを許す (区切り文字や .. でライブラリの外を指させない)
fn safe_dir(name: &str) -> Option<&str> {
    let name = name.trim();
    (!name.is_empty() && name != "." && name != ".." && !name.contains(['\\', '/', ':'])).then_some(name)
}

fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}

// ---------- Valve の KeyValues 形式 (VDF / ACF) ----------

#[derive(Debug, PartialEq)]
enum Vdf {
    Str(String),
    Obj(Vec<(String, Vdf)>),
}

impl Vdf {
    /// キーは大文字小文字を区別しない (Steam のファイルは表記が揺れる)
    fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(items) => items.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            Vdf::Str(_) => None,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s),
            Vdf::Obj(_) => None,
        }
    }
}

#[derive(Debug, PartialEq)]
enum Token {
    Str(String),
    Open,
    Close,
}

fn tokenize(text: &str) -> Option<Vec<Token>> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' => out.push(Token::Open),
            '}' => out.push(Token::Close),
            '"' => {
                let mut s = String::new();
                loop {
                    match chars.next()? {
                        '"' => break,
                        '\\' => match chars.next()? {
                            'n' => s.push('\n'),
                            't' => s.push('\t'),
                            other => s.push(other),
                        },
                        other => s.push(other),
                    }
                }
                out.push(Token::Str(s));
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            // 引用符なしの値 (古いファイルにある)
            _ => {
                let mut s = String::from(c);
                while let Some(&n) = chars.peek() {
                    if n.is_whitespace() || n == '{' || n == '}' || n == '"' {
                        break;
                    }
                    s.push(n);
                    chars.next();
                }
                out.push(Token::Str(s));
            }
        }
    }
    Some(out)
}

fn parse_vdf(text: &str) -> Option<Vdf> {
    let tokens = tokenize(text)?;
    let mut pos = 0;
    let items = parse_items(&tokens, &mut pos, 0)?;
    Some(Vdf::Obj(items))
}

fn parse_items(tokens: &[Token], pos: &mut usize, depth: usize) -> Option<Vec<(String, Vdf)>> {
    if depth > 32 {
        return None;
    }
    let mut items = Vec::new();
    while *pos < tokens.len() {
        let key = match &tokens[*pos] {
            Token::Close if depth > 0 => {
                *pos += 1;
                return Some(items);
            }
            Token::Str(k) => k.clone(),
            _ => return None,
        };
        *pos += 1;
        match tokens.get(*pos)? {
            Token::Str(v) => {
                items.push((key, Vdf::Str(v.clone())));
                *pos += 1;
            }
            Token::Open => {
                *pos += 1;
                items.push((key, Vdf::Obj(parse_items(tokens, pos, depth + 1)?)));
            }
            Token::Close => return None,
        }
    }
    (depth == 0).then_some(items)
}

// ---------- OS ----------

#[cfg(windows)]
mod imp {
    use std::path::PathBuf;

    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn reg_string(root: HKEY, key: PCWSTR, value: PCWSTR) -> Option<String> {
        let mut buf = [0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        let r = unsafe { RegGetValueW(root, key, value, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len)) };
        if r.is_err() {
            return None;
        }
        let n = (len as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..n.min(buf.len())]))
    }

    pub fn steam_path() -> Option<PathBuf> {
        reg_string(HKEY_CURRENT_USER, w!(r"Software\Valve\Steam"), w!("SteamPath"))
            .or_else(|| reg_string(HKEY_LOCAL_MACHINE, w!(r"SOFTWARE\WOW6432Node\Valve\Steam"), w!("InstallPath")))
            .map(|p| PathBuf::from(p.replace('/', "\\")))
            .filter(|p| p.is_dir())
    }

    pub fn open_uri(uri: &str) -> Result<(), String> {
        let r = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(uri), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        // 32 以下は失敗 (ランチャーが入っていない・プロトコルが登録されていないなど)
        if r.0 as isize > 32 { Ok(()) } else { Err("ランチャーを起動できませんでした".into()) }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn steam_path() -> Option<std::path::PathBuf> {
        None
    }
    pub fn open_uri(_: &str) -> Result<(), String> {
        Err("Windows以外では起動できません".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vdf_nested_and_escapes() {
        let v = parse_vdf("\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\" { \"path\" \"D:\\\\SteamLibrary\" } // コメント\n}\n").unwrap();
        assert_eq!(library_paths(&v), vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]);
    }

    #[test]
    fn vdf_old_library_format() {
        let v = parse_vdf("\"LibraryFolders\" { \"TimeNextStatsReport\" \"123\" \"ContentStatsID\" \"-1\" \"1\" \"E:\\\\Games\" }").unwrap();
        assert_eq!(library_paths(&v), vec![PathBuf::from(r"E:\Games")]);
    }

    #[test]
    fn vdf_rejects_broken_files() {
        assert!(parse_vdf("\"AppState\" { \"appid\" ").is_none());
        assert!(parse_vdf("\"AppState\" { \"appid\" \"1\" ").is_none());
        assert!(parse_vdf("} \"x\" \"y\"").is_none());
    }

    fn acf(appid: &str, name: &str, dir: &str, flags: &str) -> Vdf {
        parse_vdf(&format!("\"AppState\" {{ \"appid\" \"{appid}\" \"name\" \"{name}\" \"StateFlags\" \"{flags}\" \"installdir\" \"{dir}\" }}")).unwrap()
    }

    #[test]
    fn steam_entry_builds_launch_from_appid() {
        let e = steam_entry(&acf("413150", "Stardew Valley", "Stardew Valley", "4"), Path::new(r"D:\Lib")).unwrap();
        assert_eq!(e.id, "steam:413150");
        assert_eq!(e.launch_uri, "steam://rungameid/413150");
        assert_eq!(e.install_dir, PathBuf::from(r"D:\Lib\steamapps\common\Stardew Valley"));
    }

    #[test]
    fn steam_entry_skips_tools_partial_and_unsafe_values() {
        let lib = Path::new(r"D:\Lib");
        assert!(steam_entry(&acf("228980", "Steamworks Common Redistributables", "Steamworks Shared", "4"), lib).is_none());
        assert!(steam_entry(&acf("1493710", "Proton Experimental", "Proton - Experimental", "4"), lib).is_none());
        assert!(steam_entry(&acf("10", "Half", "Half", "1026"), lib).is_none()); // 更新待ち (完全にはインストールされていない)
        assert!(steam_entry(&acf("10;calc", "Bad", "Bad", "4"), lib).is_none());
        assert!(steam_entry(&acf("10", "Bad", "..", "4"), lib).is_none());
        assert!(steam_entry(&acf("10", "Bad", "..\\\\..\\\\Windows", "4"), lib).is_none());
    }

    #[test]
    fn epic_entry_uses_catalog_ids() {
        let v = json!({ "AppName": "Fortnite", "DisplayName": "Fortnite", "InstallLocation": r"C:\Epic\Fortnite",
            "CatalogNamespace": "fn", "CatalogItemId": "4fe75bbc5a674f4f9b356b5c90567da5", "AppCategories": ["public", "games"] });
        let e = epic_entry(&v).unwrap();
        assert_eq!(e.id, "epic:Fortnite");
        assert_eq!(e.launch_uri, "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true");
    }

    #[test]
    fn epic_entry_skips_dlc_tools_incomplete_and_unsafe_values() {
        let base = |extra: Value| {
            let mut v = json!({ "AppName": "Game", "DisplayName": "Game", "InstallLocation": r"C:\Epic\Game" });
            v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            epic_entry(&v)
        };
        assert!(base(json!({})).is_some());
        assert!(base(json!({ "MainGameAppName": "Other" })).is_none());
        assert!(base(json!({ "AppCategories": ["engines"] })).is_none());
        assert!(base(json!({ "bIsIncompleteInstall": true })).is_none());
        assert!(base(json!({ "AppName": "a&b" })).is_none());
        assert!(base(json!({ "InstallLocation": "relative" })).is_none());
        // 名前空間が不正なら AppName だけで起動する
        assert_eq!(base(json!({ "CatalogNamespace": "x?y", "CatalogItemId": "1" })).unwrap().launch_uri, "com.epicgames.launcher://apps/Game?action=launch&silent=true");
    }

    #[test]
    fn detect_reads_fixture_folders() {
        let dir = std::env::temp_dir().join(format!("recooplay-games-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let steam = dir.join("steam");
        let lib2 = dir.join("lib2");
        std::fs::create_dir_all(steam.join(r"steamapps\common\Alpha")).unwrap();
        std::fs::create_dir_all(lib2.join(r"steamapps\common\Beta")).unwrap();
        std::fs::create_dir_all(dir.join(r"epic-install\Gamma")).unwrap();
        std::fs::create_dir_all(dir.join("epic")).unwrap();
        let lib2_text = lib2.to_string_lossy().replace('\\', "\\\\");
        std::fs::write(steam.join(r"steamapps\libraryfolders.vdf"), format!("\"libraryfolders\" {{ \"1\" {{ \"path\" \"{lib2_text}\" }} }}")).unwrap();
        std::fs::write(steam.join(r"steamapps\appmanifest_1.acf"), "\"AppState\" { \"appid\" \"1\" \"name\" \"Alpha\" \"StateFlags\" \"4\" \"installdir\" \"Alpha\" }").unwrap();
        std::fs::write(lib2.join(r"steamapps\appmanifest_2.acf"), "\"AppState\" { \"appid\" \"2\" \"name\" \"Beta\" \"StateFlags\" \"4\" \"installdir\" \"Beta\" }").unwrap();
        // インストール先がない項目は出さない
        std::fs::write(lib2.join(r"steamapps\appmanifest_3.acf"), "\"AppState\" { \"appid\" \"3\" \"name\" \"Gone\" \"StateFlags\" \"4\" \"installdir\" \"Gone\" }").unwrap();
        std::fs::write(lib2.join(r"steamapps\appmanifest_4.acf"), "壊れたファイル {").unwrap();
        let gamma = dir.join(r"epic-install\Gamma");
        std::fs::write(dir.join(r"epic\g.item"), json!({ "AppName": "Gamma", "DisplayName": "gamma", "InstallLocation": gamma }).to_string()).unwrap();
        let ids: Vec<String> = detect(&Roots::fake(&dir)).into_iter().map(|e| e.id).collect();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(ids, vec!["steam:1", "steam:2", "epic:Gamma"]);
    }
}
