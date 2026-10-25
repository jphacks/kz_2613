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
    /// 一覧のタイルに出す画像 (#121)。ランチャーがユーザーの PC に保存している画像の場所で、PC 画面にだけ配る。
    /// 場所は画面へ送らず、項目 ID で引く (/api/game-image)
    pub image: Option<PathBuf>,
    /// ランチャーの画像がないときにアイコンを取り出す実行ファイル (#128。Epic のマニフェストの LaunchExecutable)
    pub icon_source: Option<PathBuf>,
}

/// Minecraft のランチャー (#128)。一覧 (`games`) には混ぜない (入力先は javaw.exe、起動は手動のまま)。
/// 画面の固定の項目に画像を付けるためだけに使う
pub struct Minecraft {
    pub image: Option<PathBuf>,
    /// 公式ランチャーを開く先 (#55)。Xbox・Microsoft Store 版はアプリの ID (shell:AppsFolder\...)、
    /// 旧来のインストーラー版は実行ファイルの場所。ゲーム本体は起動せず、ランチャーを開くだけ (認証はランチャーに任せる)
    pub launch: String,
}

/// Xbox・Microsoft Store 版の公式 Minecraft ランチャーのパッケージ名とアプリの ID
const MINECRAFT_PACKAGE: &str = "Microsoft.4297127D64EC6";
const MINECRAFT_AUMID: &str = r"shell:AppsFolder\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft";

/// 見つけたランチャーの開き方。パッケージのアプリは中の実行ファイルを直接開かず、アプリの ID で開く
fn minecraft_launch(exe: &Path) -> String {
    let packaged = exe
        .parent()
        .and_then(|d| std::fs::read_to_string(d.join("appxmanifest.xml")).ok())
        .is_some_and(|m| m.contains(&format!("Name=\"{MINECRAFT_PACKAGE}\"")));
    if packaged { MINECRAFT_AUMID.into() } else { exe.to_string_lossy().to_string() }
}

/// 公式の Minecraft ランチャーを開く (#55)。dry-run では呼ばない
pub fn open_minecraft_launcher(launch: &str) -> Result<(), String> {
    if launch.starts_with("shell:") { imp::open_uri(launch) } else { imp::open_exe(Path::new(launch)) }
        .map_err(|_| "Minecraftのランチャーを開けませんでした".into())
}

/// 検出の結果
pub struct Detected {
    pub games: Vec<Entry>,
    /// Minecraft のランチャーが見つかったか (見つからなければ None)
    pub minecraft: Option<Minecraft>,
}

/// 項目 ID → 画像の場所。ホスト (検出) が書き、HTTP の /api/game-image が読む
pub type Images = std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, PathBuf>>>;

impl Entry {
    pub fn snapshot(&self) -> Value {
        json!({ "id": self.id, "name": self.name, "source": self.source, "verified": false, "launchable": true, "image": self.image.is_some() })
    }
}

/// 探す場所。実機では Windows の既定の場所、試験では RECOOPLAY_FAKE_GAMES のフォルダを使う
pub struct Roots {
    pub steam: Option<PathBuf>,
    pub epic_manifests: Option<PathBuf>,
    /// Minecraft のランチャーの実行ファイルの候補 (#128)
    pub minecraft: Vec<PathBuf>,
    /// 取り出したアイコン (PNG) を置くフォルダ
    pub icons: PathBuf,
    /// 手動で登録したアプリの一覧 (#49・#56)。ユーザーのフォルダに置き、リポジトリには置かない
    pub manual: Option<PathBuf>,
}

impl Roots {
    pub fn system() -> Roots {
        Roots {
            steam: imp::steam_path(),
            epic_manifests: std::env::var_os("PROGRAMDATA")
                .map(|p| PathBuf::from(p).join(r"Epic\EpicGamesLauncher\Data\Manifests")),
            minecraft: minecraft_candidates(),
            icons: std::env::temp_dir().join("recooplay-icons"),
            manual: manual_file(),
        }
    }

    /// 試験用: <dir>/steam を Steam のフォルダ、<dir>/epic を Epic のマニフェストのフォルダとみなす
    pub fn fake(dir: &Path) -> Roots {
        Roots {
            steam: Some(dir.join("steam")),
            epic_manifests: Some(dir.join("epic")),
            minecraft: vec![dir.join(r"minecraft\Minecraft.exe")],
            icons: dir.join("icons"),
            manual: Some(dir.join("manual-games.json")),
        }
    }
}

/// Minecraft のランチャーの候補: Xbox・Microsoft Store 版 (各ドライブの XboxGames) と旧版 (Program Files)
fn minecraft_candidates() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = (b'C'..=b'Z').map(|d| PathBuf::from(format!(r"{}:\XboxGames\Minecraft Launcher\Content\Minecraft.exe", d as char))).collect();
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Some(p) = std::env::var_os(var) {
            v.push(PathBuf::from(p).join(r"Minecraft Launcher\MinecraftLauncher.exe"));
        }
    }
    v
}

/// インストール済みのゲームを探す。読めないファイルは飛ばす (一部が壊れていても残りは出す)。
/// 画像は、ランチャーの画像 → 実行ファイルのアイコン (#128) の順に探し、どちらもなければ画面が頭文字で代わりに表示する
pub fn detect(roots: &Roots) -> Detected {
    let mut list = Vec::new();
    if let Some(steam) = &roots.steam {
        list.extend(detect_steam(steam));
    }
    if let Some(dir) = &roots.epic_manifests {
        list.extend(detect_epic(dir));
    }
    if let Some(file) = &roots.manual {
        list.extend(load_manual(file).into_iter().filter_map(manual_entry));
    }
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
    list.dedup_by(|a, b| a.id == b.id);
    for e in list.iter_mut().filter(|e| e.image.is_none()) {
        if let Some(exe) = e.icon_source.clone() {
            e.image = app_image(&exe, &roots.icons, &e.id);
        }
    }
    let minecraft = roots.minecraft.iter().find(|p| p.is_file()).map(|exe| Minecraft { image: app_image(exe, &roots.icons, "minecraft-java"), launch: minecraft_launch(exe) });
    Detected { games: list, minecraft }
}

/// アプリの画像: Xbox・Microsoft Store 版のアプリ (実行ファイルの隣に appxmanifest.xml がある) はマニフェストのロゴ、
/// それ以外は実行ファイルのアイコン。Xbox 版の Minecraft ランチャーの Minecraft.exe はアイコンを持たず、
/// シェルからは汎用のアプリのアイコンしか取れないため、ロゴを先に見る (#128)
fn app_image(exe: &Path, icons: &Path, id: &str) -> Option<PathBuf> {
    exe.parent().and_then(appx_logo).or_else(|| icon_file(exe, icons, id))
}

/// appxmanifest.xml のロゴ (Square150x150Logo・Square44x44Logo・Logo) のうち、いちばん大きい版の PNG。
/// 版はファイル名の後ろに付く (例: SmallLogo.altform-unplated_targetsize-256.png)。ハイコントラスト用 (contrast) は使わない
fn appx_logo(dir: &Path) -> Option<PathBuf> {
    let manifest = std::fs::read_to_string(dir.join("appxmanifest.xml")).ok()?;
    let mut best: Option<(u32, PathBuf)> = None;
    for attr in ["Square150x150Logo", "Square44x44Logo", "Logo"] {
        let mut rest = manifest.as_str();
        while let Some(i) = rest.find(&format!(" {attr}=\"")) {
            rest = &rest[i + attr.len() + 3..];
            let Some(end) = rest.find('"') else { break };
            let rel = Path::new(&rest[..end]);
            if !rel.components().all(|c| matches!(c, std::path::Component::Normal(_))) {
                continue;
            }
            let folder = dir.join(rel.parent().unwrap_or(Path::new("")));
            let Some(stem) = rel.file_stem().and_then(|s| s.to_str()) else { continue };
            let Ok(files) = std::fs::read_dir(&folder) else { continue };
            for f in files.flatten() {
                let name = f.file_name().to_string_lossy().to_string();
                if !(name.starts_with(stem) && name.ends_with(".png")) || name.contains("contrast") {
                    continue;
                }
                let width = png_width(&f.path()).unwrap_or(0);
                if best.as_ref().map_or(true, |(w, p)| width > *w || (width == *w && f.path() < *p)) {
                    best = Some((width, f.path()));
                }
            }
        }
    }
    best.filter(|(w, _)| *w > 0).map(|(_, p)| p)
}

/// PNG の幅 (IHDR)
fn png_width(path: &Path) -> Option<u32> {
    use std::io::Read;
    let mut head = [0u8; 24];
    std::fs::File::open(path).ok()?.read_exact(&mut head).ok()?;
    (&head[..8] == b"\x89PNG\r\n\x1a\n" && &head[12..16] == b"IHDR").then(|| u32::from_be_bytes([head[16], head[17], head[18], head[19]]))
}

/// 実行ファイルのアイコン (Windows がエクスプローラー・スタートメニューで出すもの、最大 256px) を PNG にして置く
fn icon_file(exe: &Path, dir: &Path, id: &str) -> Option<PathBuf> {
    let data = imp::icon_png(exe)?;
    std::fs::create_dir_all(dir).ok()?;
    let name: String = id.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    let path = dir.join(format!("{name}.png"));
    std::fs::write(&path, data).ok()?;
    Some(path)
}

/// RGBA の画像を PNG にする (依存を増やさないため、無圧縮の deflate で書く)
pub fn png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    fn crc(data: &[u8]) -> u32 {
        let mut c = 0xffff_ffffu32;
        for &b in data {
            c ^= b as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
        !c
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend((data.len() as u32).to_be_bytes());
        let start = out.len();
        out.extend(kind);
        out.extend(data);
        let c = crc(&out[start..]);
        out.extend(c.to_be_bytes());
    }
    let row = width as usize * 4;
    let mut raw = Vec::with_capacity((row + 1) * height as usize);
    for y in 0..height as usize {
        raw.push(0); // 行ごとのフィルタ: なし
        raw.extend_from_slice(&rgba[y * row..(y + 1) * row]);
    }
    let mut z = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = if raw.is_empty() { vec![&[][..]] } else { raw.chunks(65535).collect() };
    for (i, b) in blocks.iter().enumerate() {
        z.push((i + 1 == blocks.len()) as u8);
        z.extend((b.len() as u16).to_le_bytes());
        z.extend((!(b.len() as u16)).to_le_bytes());
        z.extend_from_slice(b);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &x in &raw {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    z.extend(((b << 16) | a).to_be_bytes());
    let mut ihdr = Vec::new();
    ihdr.extend(width.to_be_bytes());
    ihdr.extend(height.to_be_bytes());
    ihdr.extend([8, 6, 0, 0, 0]); // 8 ビット・RGBA
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &z);
    chunk(&mut out, b"IEND", &[]);
    out
}

/// 一覧での出所: 公式の Minecraft ランチャー (#55)
pub const MINECRAFT_SOURCE: &str = "minecraft";

/// ランチャーのプロトコルで起動する。手動で登録したアプリは、その実行ファイルを引数なしで起動する。
/// Minecraft は公式ランチャーを開くだけ。dry-run では呼ばない
pub fn launch(entry: &Entry) -> Result<(), String> {
    if entry.source == MINECRAFT_SOURCE {
        return open_minecraft_launcher(&entry.launch_uri);
    }
    if entry.source == MANUAL_SOURCE {
        return imp::open_exe(Path::new(&entry.launch_uri));
    }
    imp::open_uri(&entry.launch_uri)
}

// ---------- 手動で登録したアプリ (#49・#56) ----------

/// Windows のファイル選択の画面で .exe を選ばせる (PC の前の人が選ぶ)
pub fn pick_exe() -> Option<PathBuf> {
    imp::pick_exe()
}

/// 一覧での出所 (Steam・Epic と区別して「手動登録」と表示する)
pub const MANUAL_SOURCE: &str = "registered";

/// 手動で登録したアプリ 1 件。起動は実行ファイルを引数なしで行う (引数・コマンドは受け付けない)
#[derive(Clone, PartialEq, Debug)]
pub struct ManualGame {
    pub id: String,
    pub name: String,
    pub exe: PathBuf,
}

/// 保存先: %LOCALAPPDATA%\Re-Cooplay\manual-games.json
fn manual_file() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Re-Cooplay").join("manual-games.json"))
}

pub fn load_manual(file: &Path) -> Vec<ManualGame> {
    let Ok(text) = std::fs::read_to_string(file) else { return vec![] };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else { return vec![] };
    items
        .iter()
        .filter_map(|v| {
            let id = v.get("id")?.as_str()?.to_string();
            let name = v.get("name")?.as_str()?.to_string();
            let exe = PathBuf::from(v.get("exe")?.as_str()?);
            Some(ManualGame { id, name, exe })
        })
        .collect()
}

pub fn save_manual(file: &Path, list: &[ManualGame]) -> Result<(), String> {
    let items: Vec<Value> = list.iter().map(|g| json!({ "id": g.id, "name": g.name, "exe": g.exe })).collect();
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(file, serde_json::to_string_pretty(&items).unwrap_or_default()).map_err(|e| e.to_string())
}

/// 登録できる実行ファイルか: 絶対パスで、存在する .exe。ほかの種類 (.bat・.cmd・.lnk など) は受け付けない
pub fn manual_exe_ok(exe: &Path) -> Result<(), &'static str> {
    if !exe.is_absolute() || !exe.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) {
        return Err("登録できるのはゲームの実行ファイル（.exe）だけです");
    }
    if !exe.is_file() {
        return Err("実行ファイルが見つかりません");
    }
    Ok(())
}

/// 実行ファイルの場所から決める ID (同じ実行ファイルは同じ ID)
pub fn manual_id(exe: &Path) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in exe.to_string_lossy().to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn manual_entry(g: ManualGame) -> Option<Entry> {
    manual_exe_ok(&g.exe).ok()?;
    Some(Entry {
        id: format!("manual:{}", g.id),
        name: g.name,
        source: MANUAL_SOURCE,
        // 入力先は実行ファイルのフォルダ内のプロセス (Steam・Epic のインストール先と同じ扱い)
        install_dir: g.exe.parent()?.to_path_buf(),
        launch_uri: g.exe.to_string_lossy().to_string(),
        image: None,
        icon_source: Some(g.exe),
    })
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
            if let Some(mut e) = steam_entry(&acf, &lib) {
                if e.install_dir.is_dir() {
                    e.image = steam_image(steam, e.id.trim_start_matches("steam:"));
                    list.push(e);
                }
            }
        }
    }
    list
}

/// Steam がライブラリの表示用に保存している画像 (`appcache\librarycache\<appid>\`)。縦長
/// (`library_600x900.jpg`、新しい Steam は `library_capsule.jpg`。タイルを中央で正方形に切り抜く) を優先し、
/// なければ横長 (`header.jpg`・`library_header.jpg`)。新しい Steam は 1 段下のフォルダに置くので、そこも見る。
/// appid は数字だけ (steam_entry で確認済み)
fn steam_image(steam: &Path, appid: &str) -> Option<PathBuf> {
    let dir = steam.join("appcache").join("librarycache").join(appid);
    let sub: Vec<PathBuf> = std::fs::read_dir(&dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    let dirs: Vec<PathBuf> = std::iter::once(dir).chain(sub).collect();
    ["library_600x900", "library_capsule", "header", "library_header"].iter().find_map(|stem| {
        // 決まった名前がなければ、Steam の表示言語に合わせた名前 (`<名前>_<言語>.jpg`、例: header_japanese.jpg) を使う (#128)
        dirs.iter().find_map(|d| Some(d.join(format!("{stem}.jpg"))).filter(|p| p.is_file()))
            .or_else(|| dirs.iter().find_map(|d| localized(d, stem)))
    })
}

/// `<stem>_<言語>.jpg` (言語は英小文字だけ) の画像
fn localized(dir: &Path, stem: &str) -> Option<PathBuf> {
    let prefix = format!("{stem}_");
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).filter(|p| {
        p.is_file() && p.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_prefix(&prefix)).and_then(|n| n.strip_suffix(".jpg"))
            .is_some_and(|lang| !lang.is_empty() && lang.chars().all(|c| c.is_ascii_lowercase()))
    }).collect();
    found.sort();
    found.into_iter().next()
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
        image: None,
        icon_source: None,
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
    let install_dir_for_icon = install_dir.clone();
    Some(Entry {
        id: format!("epic:{app}"),
        name: name.to_string(),
        source: "epic",
        install_dir,
        launch_uri: format!("com.epicgames.launcher://apps/{target}?action=launch&silent=true"),
        // Epic のランチャーの画像は手元にないため、実行ファイルのアイコンを使う (#128)
        image: None,
        icon_source: launch_exe(&install_dir_for_icon, text("LaunchExecutable")),
    })
}

/// インストール先の中の実行ファイル (`..` などで外へ出る値は使わない)
fn launch_exe(dir: &Path, rel: Option<&str>) -> Option<PathBuf> {
    let rel = Path::new(rel?);
    if !rel.components().all(|c| matches!(c, std::path::Component::Normal(_))) {
        return None;
    }
    Some(dir.join(rel)).filter(|p| p.is_file())
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

    /// 実行ファイルを引数なしで、そのフォルダを作業フォルダーにして起動する (#49)
    pub fn open_exe(exe: &std::path::Path) -> Result<(), String> {
        let dir = exe.parent().map(|d| HSTRING::from(d.as_os_str())).unwrap_or_default();
        let r = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(exe.as_os_str()), PCWSTR::null(), &dir, SW_SHOWNORMAL) };
        if r.0 as isize > 32 { Ok(()) } else { Err("起動できませんでした".into()) }
    }

    /// Windows のファイル選択の画面で .exe を 1 つ選ばせる (#49)。PC の前の人が選ぶ。キャンセルなら None
    pub fn pick_exe() -> Option<std::path::PathBuf> {
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
        use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
        use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH};
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
            let filter = [COMDLG_FILTERSPEC { pszName: w!("ゲームの実行ファイル (*.exe)"), pszSpec: w!("*.exe") }];
            dialog.SetFileTypes(&filter).ok()?;
            dialog.SetTitle(w!("Re:Cooplay に登録するゲームの実行ファイルを選ぶ")).ok()?;
            dialog.SetOptions(FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM).ok()?;
            dialog.Show(Some(GetForegroundWindow())).ok()?;
            let item = dialog.GetResult().ok()?;
            let path = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
            let text = path.to_string().ok();
            windows::Win32::System::Com::CoTaskMemFree(Some(path.0 as *const _));
            text.map(std::path::PathBuf::from)
        }
    }

    /// 実行ファイルのアイコン (最大 256px) を Windows のシェルで取り出し、PNG にする (#128)
    pub fn icon_png(path: &std::path::Path) -> Option<Vec<u8>> {
        use windows::Win32::Foundation::SIZE;
        use windows::Win32::Graphics::Gdi::{CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ};
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};
        unsafe {
            // 検出のスレッドで使う。既に初期化済みでも続ける
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None).ok()?;
            let bitmap = factory.GetImage(SIZE { cx: 256, cy: 256 }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK).ok()?;
            let object = HGDIOBJ(bitmap.0);
            let mut bm = BITMAP::default();
            GetObjectW(object, std::mem::size_of::<BITMAP>() as i32, Some((&mut bm as *mut BITMAP).cast()));
            let (w, h) = (bm.bmWidth, bm.bmHeight);
            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // 上から下へ
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut px = vec![0u8; (w.max(0) * h.max(0) * 4) as usize];
            let dc = CreateCompatibleDC(None);
            let lines = GetDIBits(dc, bitmap, 0, h as u32, Some(px.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
            let _ = DeleteDC(dc);
            let _ = DeleteObject(object);
            if lines == 0 || w <= 0 || h <= 0 {
                return None;
            }
            // BGRA (透明度を掛けた値) → RGBA。透明度の情報がない画像は不透明にする
            let has_alpha = px.chunks(4).any(|p| p[3] != 0);
            for p in px.chunks_mut(4) {
                let a = if has_alpha { p[3] } else { 255 };
                let un = |c: u8| if a == 0 || a == 255 { c } else { ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8 };
                let (b, g, r) = (p[0], p[1], p[2]);
                p[0] = un(r);
                p[1] = un(g);
                p[2] = un(b);
                p[3] = a;
            }
            Some(super::png(w as u32, h as u32, &px))
        }
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
    pub fn icon_png(_: &std::path::Path) -> Option<Vec<u8>> {
        None
    }
    pub fn open_exe(_: &std::path::Path) -> Result<(), String> {
        Err("Windows以外では起動できません".into())
    }
    pub fn pick_exe() -> Option<std::path::PathBuf> {
        None
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
    fn png_has_valid_structure() {
        let data = png(2, 1, &[255, 0, 0, 255, 0, 0, 255, 128]);
        assert_eq!(&data[..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(&data[12..16], b"IHDR");
        assert_eq!(&data[16..24], &[0, 0, 0, 2, 0, 0, 0, 1]);
        // IEND の CRC は常に AE426082
        assert_eq!(&data[data.len() - 8..], &[0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    }

    #[test]
    fn appx_logo_picks_largest_non_contrast_variant() {
        let dir = std::env::temp_dir().join(format!("recooplay-appx-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Assets")).unwrap();
        std::fs::write(dir.join("appxmanifest.xml"), r#"<VisualElements Square150x150Logo="GraphicsLogo.png" Square44x44Logo="Assets\SmallLogo.png" />"#).unwrap();
        let png_of = |w: u32| png(w, 1, &vec![0; w as usize * 4]);
        std::fs::write(dir.join("GraphicsLogo.png"), png_of(150)).unwrap();
        std::fs::write(dir.join(r"Assets\SmallLogo.png"), png_of(44)).unwrap();
        std::fs::write(dir.join(r"Assets\SmallLogo.altform-unplated_targetsize-256.png"), png_of(256)).unwrap();
        std::fs::write(dir.join(r"Assets\SmallLogo.contrast-black_targetsize-400.png"), png_of(400)).unwrap();
        let logo = appx_logo(&dir).map(|p| p.file_name().unwrap().to_string_lossy().to_string());
        let none = appx_logo(&dir.join("Assets"));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(logo.as_deref(), Some("SmallLogo.altform-unplated_targetsize-256.png"));
        assert!(none.is_none(), "マニフェストがなければ使わない");
    }

    #[test]
    fn minecraft_launcher_opens_packaged_app_by_id() {
        let dir = std::env::temp_dir().join(format!("recooplay-mc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("xbox")).unwrap();
        std::fs::create_dir_all(dir.join("classic")).unwrap();
        let xbox = dir.join(r"xbox\Minecraft.exe");
        std::fs::write(&xbox, b"x").unwrap();
        std::fs::write(dir.join(r"xbox\appxmanifest.xml"), r#"<Identity Name="Microsoft.4297127D64EC6" Publisher="CN=Microsoft Corporation" />"#).unwrap();
        let classic = dir.join(r"classic\MinecraftLauncher.exe");
        std::fs::write(&classic, b"x").unwrap();
        let (a, b) = (minecraft_launch(&xbox), minecraft_launch(&classic));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(a, MINECRAFT_AUMID);
        assert_eq!(b, classic.to_string_lossy());
    }

    #[test]
    fn manual_games_round_trip_and_reject_non_exe() {
        let dir = std::env::temp_dir().join(format!("recooplay-manual-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Game")).unwrap();
        let exe = dir.join(r"Game\MyGame.exe");
        std::fs::write(&exe, b"x").unwrap();
        std::fs::write(dir.join("run.bat"), b"x").unwrap();
        assert!(manual_exe_ok(&exe).is_ok());
        assert!(manual_exe_ok(&dir.join("run.bat")).is_err(), ".bat は受け付けない");
        assert!(manual_exe_ok(Path::new(r"Game\MyGame.exe")).is_err(), "相対パスは受け付けない");
        assert!(manual_exe_ok(&dir.join(r"Game\Nope.exe")).is_err(), "存在しない");
        assert_eq!(manual_id(&exe), manual_id(Path::new(&exe.to_string_lossy().to_uppercase())), "大文字小文字で別にしない");
        let file = dir.join("manual-games.json");
        let list = vec![ManualGame { id: manual_id(&exe), name: "My Game".into(), exe: exe.clone() }];
        save_manual(&file, &list).unwrap();
        assert_eq!(load_manual(&file), list);
        let found = detect(&Roots { steam: None, epic_manifests: None, minecraft: vec![], icons: dir.join("icons"), manual: Some(file) }).games;
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].source, MANUAL_SOURCE);
        assert!(found[0].id.starts_with("manual:") && found[0].install_dir.ends_with("Game"));
    }

    #[test]
    fn launch_exe_stays_inside_install_dir() {
        let dir = std::env::temp_dir().join(format!("recooplay-exe-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        std::fs::write(dir.join(r"bin\game.exe"), b"x").unwrap();
        let ok = launch_exe(&dir, Some(r"bin\game.exe"));
        let outside = launch_exe(&dir, Some(r"..\other.exe"));
        let absolute = launch_exe(&dir, Some(r"C:\Windows\explorer.exe"));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(ok.is_some() && outside.is_none() && absolute.is_none());
    }

    #[cfg(windows)]
    #[test]
    fn icon_png_reads_windows_icon() {
        let exe = std::path::PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into())).join("explorer.exe");
        let data = imp::icon_png(&exe).expect("explorer.exe のアイコン");
        assert_eq!(&data[..8], b"\x89PNG\r\n\x1a\n");
        assert!(data.len() > 1000);
    }

    #[test]
    fn steam_image_uses_localized_names() {
        // 東方風神録のように、Steam の表示言語に合わせた名前だけがある場合 (#128)
        let dir = std::env::temp_dir().join(format!("recooplay-images-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let cache = dir.join(r"appcache\librarycache\9");
        std::fs::create_dir_all(&cache).unwrap();
        for name in ["header_japanese.jpg", "library_600x900_japanese.jpg", "library_hero_japanese.jpg", "library_600x900_x1.jpg"] {
            std::fs::write(cache.join(name), b"x").unwrap();
        }
        let image = steam_image(&dir, "9").map(|p| p.file_name().unwrap().to_string_lossy().to_string());
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(image.as_deref(), Some("library_600x900_japanese.jpg"), "縦長を優先し、言語名は英小文字だけ");
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
        // 画像 (#121): 縦長を優先し、なければ横長。1 段下のフォルダも見る。ない項目は None
        std::fs::create_dir_all(steam.join(r"appcache\librarycache\1")).unwrap();
        std::fs::write(steam.join(r"appcache\librarycache\1\header.jpg"), b"h").unwrap();
        std::fs::write(steam.join(r"appcache\librarycache\1\library_600x900.jpg"), b"l").unwrap();
        // 新しい Steam: 1 段下のフォルダに library_header.jpg・library_capsule.jpg
        std::fs::create_dir_all(steam.join(r"appcache\librarycache\2\abc")).unwrap();
        std::fs::create_dir_all(steam.join(r"appcache\librarycache\2\def")).unwrap();
        std::fs::write(steam.join(r"appcache\librarycache\2\abc\library_header.jpg"), b"h").unwrap();
        std::fs::write(steam.join(r"appcache\librarycache\2\def\library_capsule.jpg"), b"c").unwrap();
        let found = detect(&Roots::fake(&dir)).games;
        let _ = std::fs::remove_dir_all(&dir);
        let ids: Vec<&str> = found.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["steam:1", "steam:2", "epic:Gamma"]);
        let image = |i: usize| found[i].image.as_ref().map(|p| p.file_name().unwrap().to_string_lossy().to_string());
        assert_eq!(image(0).as_deref(), Some("library_600x900.jpg"));
        assert_eq!(image(1).as_deref(), Some("library_capsule.jpg"), "新しい Steam の縦長を横長より優先");
        assert_eq!(image(2), None);
        assert_eq!(found[0].snapshot()["image"], json!(true));
        assert_eq!(found[2].snapshot()["image"], json!(false));
    }
}
