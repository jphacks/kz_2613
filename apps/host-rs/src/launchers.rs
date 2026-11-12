// Steam・Epic・Minecraft 以外のランチャーに入っているゲームを見つける (#265)。
// 対象: Steam に追加したゲーム (shortcuts.vdf)・GOG・Ubisoft Connect・EA app・Battle.net・Xbox (PC Game Pass)。
// 読むのは PC 内のファイルとレジストリだけ。起動は検出時に確かめた値 (英数字の ID・実在する実行ファイル) だけから組み立てる。
// 見つけたことは入力が通ることを意味しない (要件 11 章 5 項)。一覧の項目はすべて「未検証」として扱う。
// itch.io は対象外: インストール情報が SQLite のデータベースと gzip のファイルにしかなく、今の依存関係では読めないため。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::games::Entry;

pub const STEAM_SHORTCUT_SOURCE: &str = "steam-shortcut";
pub const GOG_SOURCE: &str = "gog";
pub const UBISOFT_SOURCE: &str = "ubisoft";
pub const EA_SOURCE: &str = "ea";
pub const BATTLENET_SOURCE: &str = "battlenet";
pub const XBOX_SOURCE: &str = "xbox";

/// 公式の Minecraft ランチャーのパッケージ (Xbox の一覧には出さない。固定の Minecraft の項目で扱う)
const MINECRAFT_PACKAGE: &str = "Microsoft.4297127D64EC6";
/// Xbox アプリから入れた Minecraft: Java Edition。固定の「Minecraft Java Edition」(公式ランチャーで起動) と同じゲームなので重ねて出さない (#298)
const MINECRAFT_JAVA_PACKAGE: &str = "Microsoft.MinecraftJavaEdition";

// ---------- レジストリ (試験では JSON で差し替える) ----------

type RegistryKeys = HashMap<String, HashMap<String, HashMap<String, String>>>;

/// レジストリの読み方。実機は Windows のレジストリ、試験は `{ "<キーの場所>": { "<サブキー>": { "<値の名前>": "<値>" } } }` の JSON
pub enum Registry {
    System,
    Fake(RegistryKeys),
}

impl Registry {
    pub fn fake(file: &Path) -> Registry {
        let parsed: Option<RegistryKeys> = std::fs::read_to_string(file)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok());
        Registry::Fake(parsed.unwrap_or_default())
    }

    /// キー (HKLM\... / HKCU\...) の直下のサブキーの名前
    fn subkeys(&self, key: &str) -> Vec<String> {
        match self {
            Registry::System => imp::subkeys(key),
            Registry::Fake(m) => m
                .get(key)
                .map(|s| s.keys().cloned().collect())
                .unwrap_or_default(),
        }
    }

    /// 文字列の値
    fn value(&self, key: &str, sub: &str, name: &str) -> Option<String> {
        let v = match self {
            Registry::System => imp::value(&format!(r"{key}\{sub}"), name),
            Registry::Fake(m) => m.get(key)?.get(sub)?.get(name).cloned(),
        }?;
        let v = v.trim().to_string();
        (!v.is_empty()).then_some(v)
    }
}

/// 探す場所
pub struct Places {
    pub registry: Registry,
    /// Steam のフォルダ (userdata\<id>\config\shortcuts.vdf を読む)
    pub steam: Option<PathBuf>,
    /// Battle.net の product.db
    pub battlenet: Option<PathBuf>,
    /// Xbox アプリのインストール先 (各ドライブの XboxGames)
    pub xbox: Vec<PathBuf>,
}

impl Places {
    pub fn system(steam: Option<PathBuf>) -> Places {
        Places {
            registry: Registry::System,
            steam,
            battlenet: std::env::var_os("PROGRAMDATA")
                .map(|p| PathBuf::from(p).join(r"Battle.net\Agent\product.db")),
            xbox: (b'C'..=b'Z')
                .map(|d| PathBuf::from(format!(r"{}:\XboxGames", d as char)))
                .collect(),
        }
    }

    /// 試験用: <dir>\registry.json・<dir>\battlenet\product.db・<dir>\xbox
    pub fn fake(dir: &Path, steam: Option<PathBuf>) -> Places {
        Places {
            registry: Registry::fake(&dir.join("registry.json")),
            steam,
            battlenet: Some(dir.join(r"battlenet\product.db")),
            xbox: vec![dir.join("xbox")],
        }
    }
}

/// すべてのランチャーを探す。読めないもの・壊れたものは飛ばし、ほかのランチャーの検出を止めない
pub fn detect(p: &Places) -> Vec<Entry> {
    let mut list = Vec::new();
    if let Some(steam) = &p.steam {
        list.extend(steam_shortcuts(steam));
    }
    list.extend(gog(&p.registry));
    list.extend(ubisoft(&p.registry));
    list.extend(ea(&p.registry));
    if let Some(db) = &p.battlenet {
        list.extend(battlenet(db));
    }
    for root in &p.xbox {
        list.extend(xbox(root));
    }
    list
}

/// URL に埋め込む値は英数字と . _ - だけ (ほかの文字で URL や引数を組み替えられないように)
fn id_ok(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// 実在する絶対パスの .exe
fn exe_ok(p: &Path) -> bool {
    p.is_absolute() && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) && p.is_file()
}

fn entry(
    id: String,
    name: &str,
    source: &'static str,
    install_dir: PathBuf,
    launch_uri: String,
    image: Option<PathBuf>,
    icon: Option<PathBuf>,
) -> Option<Entry> {
    let name = name.trim();
    (!name.is_empty() && install_dir.is_absolute() && install_dir.is_dir()).then(|| Entry {
        id,
        name: name.chars().take(80).collect(),
        source,
        install_dir,
        launch_uri,
        image,
        icon_source: icon,
    })
}

// ---------- Steam に追加したゲーム (shortcuts.vdf) ----------

/// Steam の「ゲームを追加 → Steam以外のゲーム」で追加したゲーム。起動は Steam 経由 (steam://rungameid/<64 ビットの ID>)
pub fn steam_shortcuts(steam: &Path) -> Vec<Entry> {
    let mut list = Vec::new();
    let Ok(users) = std::fs::read_dir(steam.join("userdata")) else {
        return list;
    };
    for user in users.flatten() {
        let Ok(data) = std::fs::read(user.path().join(r"config\shortcuts.vdf")) else {
            continue;
        };
        let Some(root) = binary_vdf(&data) else {
            continue;
        };
        let Some(BinVdf::Map(items)) = root.get("shortcuts") else {
            continue;
        };
        for (_, item) in items {
            if let Some(e) = shortcut_entry(item) {
                if !list.iter().any(|x: &Entry| x.id == e.id) {
                    list.push(e);
                }
            }
        }
    }
    list
}

fn shortcut_entry(item: &BinVdf) -> Option<Entry> {
    let name = item.get("AppName")?.as_str()?;
    let exe_raw = item.get("Exe")?.as_str()?;
    let exe = PathBuf::from(exe_raw.trim().trim_matches('"'));
    if !exe_ok(&exe) {
        return None;
    }
    // 古い形式で appid がなければ、Steam と同じく 実行ファイル＋名前 の CRC32 に最上位ビットを立てた値
    let appid = match item.get("appid") {
        Some(BinVdf::Int(n)) => *n as u32,
        _ => crc32(format!("{exe_raw}{name}").as_bytes()) | 0x8000_0000,
    };
    let game_id = ((appid as u64) << 32) | 0x0200_0000;
    let start = item
        .get("StartDir")
        .and_then(BinVdf::as_str)
        .map(|s| PathBuf::from(s.trim().trim_matches('"')))
        .filter(|d| d.is_absolute() && d.is_dir());
    let dir = start.or_else(|| exe.parent().map(Path::to_path_buf))?;
    entry(
        format!("steam-shortcut:{appid}"),
        name,
        STEAM_SHORTCUT_SOURCE,
        dir,
        format!("steam://rungameid/{game_id}"),
        None,
        Some(exe),
    )
}

#[derive(Debug, PartialEq)]
enum BinVdf {
    Map(Vec<(String, BinVdf)>),
    Str(String),
    Int(i32),
}

impl BinVdf {
    /// キーは大文字小文字を区別しない (appid / AppName / Exe の表記は揺れる)
    fn get(&self, key: &str) -> Option<&BinVdf> {
        match self {
            BinVdf::Map(items) => items
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v),
            _ => None,
        }
    }
    fn as_str(&self) -> Option<&str> {
        match self {
            BinVdf::Str(s) => Some(s),
            _ => None,
        }
    }
}

/// Valve のバイナリ VDF (0x00 入れ子、0x01 文字列、0x02 32 ビット整数、0x07 64 ビット整数、0x08 終わり)
fn binary_vdf(data: &[u8]) -> Option<BinVdf> {
    fn cstr(d: &[u8], pos: &mut usize) -> Option<String> {
        let end = d[*pos..].iter().position(|&b| b == 0)? + *pos;
        let s = String::from_utf8_lossy(&d[*pos..end]).to_string();
        *pos = end + 1;
        Some(s)
    }
    fn map(d: &[u8], pos: &mut usize, depth: usize) -> Option<Vec<(String, BinVdf)>> {
        if depth > 16 {
            return None;
        }
        let mut items = Vec::new();
        loop {
            let t = *d.get(*pos)?;
            *pos += 1;
            match t {
                0x08 => return Some(items),
                0x00 => {
                    let k = cstr(d, pos)?;
                    items.push((k, BinVdf::Map(map(d, pos, depth + 1)?)));
                }
                0x01 => {
                    let k = cstr(d, pos)?;
                    items.push((k, BinVdf::Str(cstr(d, pos)?)));
                }
                0x02 => {
                    let k = cstr(d, pos)?;
                    let v = i32::from_le_bytes(d.get(*pos..*pos + 4)?.try_into().ok()?);
                    *pos += 4;
                    items.push((k, BinVdf::Int(v)));
                }
                0x07 => {
                    let k = cstr(d, pos)?;
                    *pos += 8;
                    let _ = k;
                }
                _ => return None,
            }
        }
    }
    let mut pos = 0;
    map(data, &mut pos, 0).map(BinVdf::Map)
}

fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xedb8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
    }
    !c
}

// ---------- GOG ----------

const GOG_KEYS: [&str; 2] = [
    r"HKLM\SOFTWARE\WOW6432Node\GOG.com\Games",
    r"HKLM\SOFTWARE\GOG.com\Games",
];

/// GOG のゲーム (DRM がないため、実行ファイルを直接起動する)。追加コンテンツ (dependsOn がある) は出さない
pub fn gog(reg: &Registry) -> Vec<Entry> {
    let mut list: Vec<Entry> = Vec::new();
    for key in GOG_KEYS {
        for sub in reg.subkeys(key) {
            let v = |n: &str| reg.value(key, &sub, n);
            if v("dependsOn").is_some() {
                continue;
            }
            let Some(id) = v("gameID")
                .or_else(|| Some(sub.clone()))
                .filter(|i| i.chars().all(|c| c.is_ascii_digit()) && i.len() <= 20)
            else {
                continue;
            };
            let (Some(name), Some(exe)) = (v("gameName"), v("exe").map(PathBuf::from)) else {
                continue;
            };
            if !exe_ok(&exe) || list.iter().any(|e| e.id == format!("gog:{id}")) {
                continue;
            }
            let dir = v("path")
                .map(PathBuf::from)
                .filter(|d| d.is_absolute() && d.is_dir())
                .or_else(|| exe.parent().map(Path::to_path_buf));
            let Some(dir) = dir else { continue };
            list.extend(entry(
                format!("gog:{id}"),
                &name,
                GOG_SOURCE,
                dir,
                exe.to_string_lossy().to_string(),
                None,
                Some(exe),
            ));
        }
    }
    list
}

// ---------- Ubisoft Connect ----------

const UBISOFT_KEYS: [&str; 2] = [
    r"HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
    r"HKLM\SOFTWARE\Ubisoft\Launcher\Installs",
];
const UNINSTALL_KEYS: [&str; 2] = [
    r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
];

/// Ubisoft Connect のゲーム。名前はアンインストール情報 ("Uplay Install <ID>") から取り、なければフォルダ名
pub fn ubisoft(reg: &Registry) -> Vec<Entry> {
    let mut list: Vec<Entry> = Vec::new();
    for key in UBISOFT_KEYS {
        for id in reg.subkeys(key) {
            if !id.chars().all(|c| c.is_ascii_digit())
                || id.len() > 12
                || list.iter().any(|e| e.id == format!("ubisoft:{id}"))
            {
                continue;
            }
            let Some(dir) = reg
                .value(key, &id, "InstallDir")
                .map(|d| PathBuf::from(d.replace('/', "\\")))
            else {
                continue;
            };
            let name = UNINSTALL_KEYS
                .iter()
                .find_map(|u| reg.value(u, &format!("Uplay Install {id}"), "DisplayName"))
                .or_else(|| {
                    dir.components()
                        .filter_map(|c| match c {
                            std::path::Component::Normal(n) => {
                                Some(n.to_string_lossy().to_string())
                            }
                            _ => None,
                        })
                        .next_back()
                });
            let Some(name) = name else { continue };
            list.extend(entry(
                format!("ubisoft:{id}"),
                &name,
                UBISOFT_SOURCE,
                dir,
                format!("uplay://launch/{id}/0"),
                None,
                None,
            ));
        }
    }
    list
}

// ---------- EA app ----------

/// EA app で入れたゲーム: アンインストール情報のうち、インストール先に `__Installer\installerdata.xml` があるもの。
/// 起動は contentID (例: Origin.OFR.50.0002694) を EA app に渡す
pub fn ea(reg: &Registry) -> Vec<Entry> {
    let mut list: Vec<Entry> = Vec::new();
    for key in UNINSTALL_KEYS {
        for sub in reg.subkeys(key) {
            let Some(dir) = reg
                .value(key, &sub, "InstallLocation")
                .map(|d| PathBuf::from(d.trim_matches('"')))
            else {
                continue;
            };
            if !dir.is_absolute() {
                continue;
            }
            let Some(xml) =
                std::fs::read_to_string(dir.join(r"__Installer\installerdata.xml")).ok()
            else {
                continue;
            };
            let Some(content) = xml_tag(&xml, "contentID").filter(|c| id_ok(c)) else {
                continue;
            };
            let Some(name) = reg.value(key, &sub, "DisplayName") else {
                continue;
            };
            if list.iter().any(|e| e.id == format!("ea:{content}")) {
                continue;
            }
            list.extend(entry(
                format!("ea:{content}"),
                &name,
                EA_SOURCE,
                dir,
                format!("origin2://game/launch?offerIds={content}&autoDownload=1"),
                None,
                None,
            ));
        }
    }
    list
}

/// 最初の <tag>…</tag> の中身
fn xml_tag(xml: &str, tag: &str) -> Option<String> {
    let start = xml.find(&format!("<{tag}>"))? + tag.len() + 2;
    let end = xml[start..].find(&format!("</{tag}>"))? + start;
    Some(xml[start..end].trim().to_string())
}

// ---------- Battle.net ----------

/// Battle.net のアプリ自身・更新用の項目 (ゲームではない)。agent_beta (Agenteta) など派生の項目もあるため前方一致で除く (#298)
const BATTLENET_NOT_GAMES: [&str; 3] = ["agent", "bna", "battle.net"];

/// Battle.net のゲーム: product.db (Protocol Buffers) の製品ごとの ID・製品コード・インストール先。
/// 起動は製品コードを Battle.net に渡す (battlenet://<製品コード>)。名前はインストール先のフォルダ名
pub fn battlenet(db: &Path) -> Vec<Entry> {
    let Ok(data) = std::fs::read(db) else {
        return vec![];
    };
    let mut list: Vec<Entry> = Vec::new();
    for product in pb_fields(&data, 1) {
        let uid = pb_fields(product, 1)
            .first()
            .map(|s| String::from_utf8_lossy(s).to_string())
            .unwrap_or_default();
        let code = pb_fields(product, 2)
            .first()
            .map(|s| String::from_utf8_lossy(s).to_string())
            .unwrap_or_default();
        let path = pb_fields(product, 3)
            .first()
            .and_then(|s| {
                pb_fields(s, 1)
                    .first()
                    .map(|p| String::from_utf8_lossy(p).to_string())
            })
            .unwrap_or_default();
        let not_game = |s: &str| {
            BATTLENET_NOT_GAMES
                .iter()
                .any(|n| s.to_ascii_lowercase().starts_with(n))
        };
        if not_game(&uid) || not_game(&code) || !id_ok(&code) || path.is_empty() {
            continue;
        }
        let dir = PathBuf::from(path.replace('/', "\\"));
        let Some(name) = dir.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        if list.iter().any(|e| e.id == format!("battlenet:{code}")) {
            continue;
        }
        list.extend(entry(
            format!("battlenet:{code}"),
            &name,
            BATTLENET_SOURCE,
            dir,
            format!("battlenet://{code}"),
            None,
            None,
        ));
    }
    list
}

/// Protocol Buffers の、ある番号の長さ付きの項目 (wire type 2) をすべて取り出す。ほかの型は飛ばす
fn pb_fields(data: &[u8], want: u64) -> Vec<&[u8]> {
    fn varint(d: &[u8], pos: &mut usize) -> Option<u64> {
        let mut v = 0u64;
        for shift in (0..64).step_by(7) {
            let b = *d.get(*pos)?;
            *pos += 1;
            v |= ((b & 0x7f) as u64) << shift;
            if b & 0x80 == 0 {
                return Some(v);
            }
        }
        None
    }
    let mut out = Vec::new();
    let mut pos = 0;
    while pos < data.len() {
        let Some(key) = varint(data, &mut pos) else {
            break;
        };
        let (field, wire) = (key >> 3, key & 7);
        match wire {
            0 => {
                if varint(data, &mut pos).is_none() {
                    break;
                }
            }
            1 => pos += 8,
            2 => {
                let Some(len) = varint(data, &mut pos) else {
                    break;
                };
                let Some(chunk) = data.get(pos..pos.saturating_add(len as usize)) else {
                    break;
                };
                if field == want {
                    out.push(chunk);
                }
                pos += len as usize;
            }
            5 => pos += 4,
            _ => break,
        }
    }
    out
}

// ---------- Xbox (PC Game Pass) ----------

/// Xbox アプリで入れたゲーム: <ドライブ>\XboxGames\<ゲーム>\Content に MicrosoftGame.config と appxmanifest.xml がある。
/// 起動はパッケージのアプリ ID (shell:AppsFolder\<パッケージファミリー名>!<アプリ ID>)。公式の Minecraft ランチャーは出さない
pub fn xbox(root: &Path) -> Vec<Entry> {
    let Ok(games) = std::fs::read_dir(root) else {
        return vec![];
    };
    let mut list = Vec::new();
    for g in games.flatten() {
        let content = g.path().join("Content");
        let (Ok(manifest), Ok(config)) = (
            std::fs::read_to_string(content.join("appxmanifest.xml")),
            std::fs::read_to_string(content.join("MicrosoftGame.config")),
        ) else {
            continue;
        };
        if let Some(e) = xbox_entry(
            &content,
            &manifest,
            &config,
            &g.file_name().to_string_lossy(),
        ) {
            list.push(e);
        }
    }
    list
}

fn xbox_entry(content: &Path, manifest: &str, config: &str, folder: &str) -> Option<Entry> {
    let identity = &manifest[manifest.find("<Identity")?..];
    let package = xml_attr(identity, "Name")?;
    if package == MINECRAFT_PACKAGE || package == MINECRAFT_JAVA_PACKAGE || !id_ok(&package) {
        return None;
    }
    let publisher = xml_attr(identity, "Publisher")?;
    let app = xml_attr(&manifest[manifest.find("<Application ")?..], "Id").filter(|a| id_ok(a))?;
    let family = format!("{package}_{}", publisher_id(&publisher));
    // 表示名: MicrosoftGame.config の DefaultDisplayName → appxmanifest の DisplayName (リソース参照でなければ) → フォルダ名
    let name = config
        .find("<ShellVisuals")
        .and_then(|i| xml_attr(&config[i..], "DefaultDisplayName"))
        .or_else(|| xml_tag(manifest, "DisplayName"))
        .filter(|n| !n.starts_with("ms-resource:"))
        .unwrap_or_else(|| folder.to_string());
    let image = crate::games::appx_logo(content);
    entry(
        format!("xbox:{package}"),
        &name,
        XBOX_SOURCE,
        content.to_path_buf(),
        format!(r"shell:AppsFolder\{family}!{app}"),
        image,
        None,
    )
}

/// 要素の属性値 (最初に出てくるもの)
fn xml_attr(xml: &str, name: &str) -> Option<String> {
    let head = &xml[..xml.find('>').unwrap_or(xml.len())];
    let start = head.find(&format!(" {name}=\""))? + name.len() + 3;
    let end = head[start..].find('"')? + start;
    Some(
        head[start..end]
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .trim()
            .to_string(),
    )
}

/// パッケージファミリー名の発行者 ID: 発行者名 (UTF-16LE) の SHA-256 の先頭 8 バイトに 0 のビットを 1 つ足し、
/// 5 ビットずつ Crockford 系の 32 文字 (0-9 a-z から i l o u を除く) で 13 文字にする
pub fn publisher_id(publisher: &str) -> String {
    let utf16: Vec<u8> = publisher
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    let hash = sha256(&utf16);
    let mut bits = u128::from_be_bytes([
        hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7], 0, 0, 0, 0, 0, 0,
        0, 0,
    ]);
    const ALPHABET: &[u8; 32] = b"0123456789abcdefghjkmnpqrstvwxyz";
    let mut out = String::new();
    for _ in 0..13 {
        out.push(ALPHABET[(bits >> 123) as usize] as char);
        bits <<= 5;
    }
    out
}

fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut msg = data.to_vec();
    let bit_len = (data.len() as u64) * 8;
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend(bit_len.to_be_bytes());
    for block in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7]
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [
                t1.wrapping_add(t2),
                v[0],
                v[1],
                v[2],
                v[3].wrapping_add(t1),
                v[4],
                v[5],
                v[6],
            ];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    let mut out = [0u8; 32];
    for i in 0..8 {
        out[i * 4..i * 4 + 4].copy_from_slice(&h[i].to_be_bytes());
    }
    out
}

/// 一覧の項目の出所ごとの件数 (ログ用。名前・場所は残さない)
pub fn counts(list: &[Entry]) -> Value {
    let mut m = serde_json::Map::new();
    for s in [
        STEAM_SHORTCUT_SOURCE,
        GOG_SOURCE,
        UBISOFT_SOURCE,
        EA_SOURCE,
        BATTLENET_SOURCE,
        XBOX_SOURCE,
    ] {
        m.insert(
            s.into(),
            list.iter().filter(|e| e.source == s).count().into(),
        );
    }
    Value::Object(m)
}

// ---------- OS ----------

#[cfg(windows)]
mod imp {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
        HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_SZ,
    };

    /// "HKLM\SOFTWARE\..." → (ルート, 残り)
    fn split(key: &str) -> Option<(HKEY, &str)> {
        let (root, rest) = key.split_once('\\')?;
        match root {
            "HKLM" => Some((HKEY_LOCAL_MACHINE, rest)),
            "HKCU" => Some((HKEY_CURRENT_USER, rest)),
            _ => None,
        }
    }

    pub fn subkeys(key: &str) -> Vec<String> {
        let Some((root, rest)) = split(key) else {
            return vec![];
        };
        let mut out = Vec::new();
        unsafe {
            let mut h = HKEY::default();
            if RegOpenKeyExW(root, &HSTRING::from(rest), Some(0), KEY_READ, &mut h).is_err() {
                return out;
            }
            for i in 0..4096u32 {
                let mut buf = [0u16; 256];
                let mut len = buf.len() as u32;
                if RegEnumKeyExW(
                    h,
                    i,
                    Some(PWSTR(buf.as_mut_ptr())),
                    &mut len,
                    None,
                    None,
                    None,
                    None,
                )
                .is_err()
                {
                    break;
                }
                out.push(String::from_utf16_lossy(&buf[..len as usize]));
            }
            let _ = RegCloseKey(h);
        }
        out
    }

    pub fn value(key: &str, name: &str) -> Option<String> {
        let (root, rest) = split(key)?;
        let mut buf = [0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        let r = unsafe {
            RegGetValueW(
                root,
                &HSTRING::from(rest),
                &HSTRING::from(name),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut len),
            )
        };
        if r.is_err() {
            return None;
        }
        let n = (len as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..n.min(buf.len())]))
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn subkeys(_: &str) -> Vec<String> {
        vec![]
    }
    pub fn value(_: &str, _: &str) -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("recooplay-launchers-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn publisher_id_matches_windows() {
        // Microsoft のパッケージのファミリー名の末尾 (例: Microsoft.4297127D64EC6_8wekyb3d8bbwe)
        assert_eq!(
            publisher_id(
                "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"
            ),
            "8wekyb3d8bbwe"
        );
    }

    #[test]
    fn sha256_known_vector() {
        let h = sha256(b"abc");
        assert_eq!(h[..4], [0xba, 0x78, 0x16, 0xbf]);
        assert_eq!(h[28..], [0xf2, 0x00, 0x15, 0xad]);
    }

    /// shortcuts.vdf を組み立てる (試験用)
    fn shortcuts_vdf(items: &[(Option<i32>, &str, &str, &str)]) -> Vec<u8> {
        let mut d = vec![0x00];
        d.extend(b"shortcuts\0");
        for (i, (appid, name, exe, start)) in items.iter().enumerate() {
            d.push(0x00);
            d.extend(format!("{i}\0").as_bytes());
            if let Some(a) = appid {
                d.push(0x02);
                d.extend(b"appid\0");
                d.extend(a.to_le_bytes());
            }
            for (k, v) in [("AppName", *name), ("Exe", *exe), ("StartDir", *start)] {
                d.push(0x01);
                d.extend(format!("{k}\0{v}\0").as_bytes());
            }
            d.push(0x00);
            d.extend(b"tags\0");
            d.push(0x08);
            d.push(0x08);
        }
        d.extend([0x08, 0x08]);
        d
    }

    #[test]
    fn steam_shortcuts_build_64bit_game_id_and_skip_missing_exe() {
        let dir = tmp("shortcuts");
        std::fs::create_dir_all(dir.join(r"Games\Foo")).unwrap();
        let exe = dir.join(r"Games\Foo\foo.exe");
        std::fs::write(&exe, b"x").unwrap();
        let cfg = dir.join(r"steam\userdata\123\config");
        std::fs::create_dir_all(&cfg).unwrap();
        let exe_q = format!("\"{}\"", exe.display());
        let start_q = format!("\"{}\"", dir.join(r"Games\Foo").display());
        std::fs::write(
            cfg.join("shortcuts.vdf"),
            shortcuts_vdf(&[
                (Some(-1_234_567_890), "Foo Game", &exe_q, &start_q),
                (Some(5), "Gone", r"C:\nope\gone.exe", ""),
            ]),
        )
        .unwrap();
        let found = steam_shortcuts(&dir.join("steam"));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(found.len(), 1, "実行ファイルがないものは出さない");
        let appid = (-1_234_567_890i32) as u32;
        assert_eq!(found[0].id, format!("steam-shortcut:{appid}"));
        assert_eq!(
            found[0].launch_uri,
            format!("steam://rungameid/{}", ((appid as u64) << 32) | 0x0200_0000)
        );
        assert_eq!(found[0].source, STEAM_SHORTCUT_SOURCE);
        assert!(found[0].install_dir.ends_with("Foo"));
    }

    #[test]
    fn binary_vdf_rejects_broken_data() {
        assert!(binary_vdf(&[0x00, b'a', 0]).is_none());
        assert!(binary_vdf(&[0x09]).is_none());
    }

    #[test]
    fn registry_launchers_from_fake_registry() {
        let dir = tmp("registry");
        for d in [
            r"GOG\Witcher",
            r"Ubi\AC",
            r"EA\Sims\__Installer",
            r"EA\Other",
        ] {
            std::fs::create_dir_all(dir.join(d)).unwrap();
        }
        let witcher_exe = dir.join(r"GOG\Witcher\witcher.exe");
        std::fs::write(&witcher_exe, b"x").unwrap();
        std::fs::write(dir.join(r"EA\Sims\__Installer\installerdata.xml"), "<DiPManifest><contentIDs><contentID>Origin.OFR.50.0002694</contentID></contentIDs></DiPManifest>").unwrap();
        let p = |s: &str| dir.join(s).to_string_lossy().to_string();
        let reg = serde_json::json!({
            r"HKLM\SOFTWARE\WOW6432Node\GOG.com\Games": {
                "1207664663": { "gameID": "1207664663", "gameName": "The Witcher", "exe": witcher_exe.to_string_lossy(), "path": p(r"GOG\Witcher") },
                "1495134320": { "gameID": "1495134320", "gameName": "DLC", "exe": witcher_exe.to_string_lossy(), "dependsOn": "1207664663" },
                "1": { "gameID": "1", "gameName": "No exe", "exe": p(r"GOG\nope.exe") }
            },
            r"HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs": {
                "4923": { "InstallDir": p(r"Ubi\AC").replace('\\', "/") },
                "1;calc": { "InstallDir": p(r"Ubi\AC") }
            },
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall": {
                "Uplay Install 4923": { "DisplayName": "Assassin's Creed" },
                "{sims}": { "DisplayName": "The Sims 4", "InstallLocation": p(r"EA\Sims") },
                "{other}": { "DisplayName": "Other App", "InstallLocation": p(r"EA\Other") }
            }
        });
        std::fs::write(dir.join("registry.json"), reg.to_string()).unwrap();
        let places = Places::fake(&dir, None);
        let list = detect(&places);
        let _ = std::fs::remove_dir_all(&dir);
        let ids: Vec<&str> = list.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["gog:1207664663", "ubisoft:4923", "ea:Origin.OFR.50.0002694"]
        );
        assert_eq!(
            list[0].launch_uri,
            witcher_exe.to_string_lossy(),
            "GOG は実行ファイルを起動する"
        );
        assert_eq!(list[1].name, "Assassin's Creed");
        assert_eq!(list[1].launch_uri, "uplay://launch/4923/0");
        assert_eq!(
            list[2].launch_uri,
            "origin2://game/launch?offerIds=Origin.OFR.50.0002694&autoDownload=1"
        );
        assert_eq!(counts(&list)["gog"], 1);
    }

    /// product.db を組み立てる (試験用): 製品ごとに field1=ID, field2=製品コード, field3={field1=インストール先}
    fn product_db(items: &[(&str, &str, &str)]) -> Vec<u8> {
        fn ld(field: u8, data: &[u8]) -> Vec<u8> {
            let mut v = vec![(field << 3) | 2];
            let mut n = data.len();
            loop {
                let b = (n & 0x7f) as u8;
                n >>= 7;
                if n == 0 {
                    v.push(b);
                    break;
                }
                v.push(b | 0x80);
            }
            v.extend(data);
            v
        }
        let mut out = Vec::new();
        for (uid, code, path) in items {
            let mut p = ld(1, uid.as_bytes());
            p.extend(ld(2, code.as_bytes()));
            p.extend(ld(3, &ld(1, path.as_bytes())));
            p.extend([0x20, 0x01]); // 数値の項目は飛ばす
            out.extend(ld(1, &p));
        }
        out.extend([0x10, 0x05]);
        out
    }

    #[test]
    fn battlenet_reads_products_and_skips_agent() {
        let dir = tmp("battlenet");
        std::fs::create_dir_all(dir.join("Overwatch")).unwrap();
        std::fs::create_dir_all(dir.join("battlenet")).unwrap();
        let ow = dir.join("Overwatch").to_string_lossy().replace('\\', "/");
        std::fs::write(
            dir.join(r"battlenet\product.db"),
            product_db(&[
                ("agent", "agent", "C:/ProgramData/Battle.net/Agent"),
                (
                    "agent_beta",
                    "agent_beta",
                    "C:/ProgramData/Battle.net/Agent/beta",
                ),
                ("battle.net", "bna", "C:/Program Files (x86)/Battle.net"),
                ("prometheus", "Pro", &ow),
                ("bad", "a&b", &ow),
                ("gone", "Gone", "C:/nope"),
            ]),
        )
        .unwrap();
        let list = battlenet(&dir.join(r"battlenet\product.db"));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "battlenet:Pro");
        assert_eq!(list[0].name, "Overwatch");
        assert_eq!(list[0].launch_uri, "battlenet://Pro");
    }

    #[test]
    fn battlenet_real_db_on_this_pc_has_no_games() {
        // 実機の product.db (Battle.net アプリ自身だけ) があれば、ゲームとして出さないことを確かめる
        let Some(p) = std::env::var_os("PROGRAMDATA")
            .map(|p| PathBuf::from(p).join(r"Battle.net\Agent\product.db"))
            .filter(|p| p.is_file())
        else {
            return;
        };
        // agent_beta (Agenteta) が「beta」というゲームとして出ていた (#298)
        assert!(
            battlenet(&p).iter().all(
                |e| !e.id.to_ascii_lowercase().starts_with("battlenet:agent")
                    && !e.id.eq_ignore_ascii_case("battlenet:bna")
            ),
            "{:?}",
            battlenet(&p).iter().map(|e| &e.id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn xbox_reads_game_pass_install_and_skips_minecraft_launcher() {
        let dir = tmp("xbox");
        let game = dir.join(r"xbox\Forza Horizon 5\Content");
        let mc = dir.join(r"xbox\Minecraft Launcher\Content");
        let java = dir.join(r"xbox\Minecraft- Java Edition\Content");
        std::fs::create_dir_all(&game).unwrap();
        std::fs::create_dir_all(&mc).unwrap();
        std::fs::create_dir_all(&java).unwrap();
        let publisher =
            "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US";
        std::fs::write(game.join("appxmanifest.xml"), format!(r#"<Package><Identity Name="Microsoft.SunriseBaseGame" Publisher="{publisher}" Version="1.0.0.0" /><Properties><DisplayName>ms-resource:Title</DisplayName></Properties><Applications><Application Id="Game" Executable="gamelaunchhelper.exe"></Application></Applications></Package>"#)).unwrap();
        std::fs::write(
            game.join("MicrosoftGame.config"),
            r#"<Game><ShellVisuals DefaultDisplayName="Forza Horizon 5" /></Game>"#,
        )
        .unwrap();
        std::fs::write(mc.join("appxmanifest.xml"), format!(r#"<Package><Identity Name="Microsoft.4297127D64EC6" Publisher="{publisher}" /><Applications><Application Id="Minecraft"></Application></Applications></Package>"#)).unwrap();
        std::fs::write(mc.join("MicrosoftGame.config"), "<Game />").unwrap();
        // Xbox アプリから入れた Java Edition は、固定の Minecraft Java Edition と同じゲームなので出さない (#298)
        std::fs::write(java.join("appxmanifest.xml"), format!(r#"<Package><Identity Name="Microsoft.MinecraftJavaEdition" Publisher="{publisher}" /><Applications><Application Id="Game"></Application></Applications></Package>"#)).unwrap();
        std::fs::write(
            java.join("MicrosoftGame.config"),
            r#"<Game><ShellVisuals DefaultDisplayName="Minecraft: Java Edition" /></Game>"#,
        )
        .unwrap();
        let list = xbox(&dir.join("xbox"));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(
            list.len(),
            1,
            "Minecraft のランチャーと Xbox の Java Edition は出さない"
        );
        assert_eq!(list[0].id, "xbox:Microsoft.SunriseBaseGame");
        assert_eq!(list[0].name, "Forza Horizon 5");
        assert_eq!(
            list[0].launch_uri,
            r"shell:AppsFolder\Microsoft.SunriseBaseGame_8wekyb3d8bbwe!Game"
        );
    }

    #[test]
    fn xbox_real_minecraft_launcher_family_name() {
        // 実機の Xbox 版 Minecraft ランチャーがあれば、計算したファミリー名が公式の値と一致することを確かめる
        let Some(content) = (b'C'..=b'Z')
            .map(|d| {
                PathBuf::from(format!(
                    r"{}:\XboxGames\Minecraft Launcher\Content",
                    d as char
                ))
            })
            .find(|p| p.join("appxmanifest.xml").is_file())
        else {
            return;
        };
        let m = std::fs::read_to_string(content.join("appxmanifest.xml")).unwrap();
        let identity = &m[m.find("<Identity").unwrap()..];
        let family = format!(
            "{}_{}",
            xml_attr(identity, "Name").unwrap(),
            publisher_id(&xml_attr(identity, "Publisher").unwrap())
        );
        assert_eq!(family, "Microsoft.4297127D64EC6_8wekyb3d8bbwe");
    }
}
