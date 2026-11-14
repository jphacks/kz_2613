// 操作定義のないゲームのファイルから、操作 (名前・初期キー・種類) を読む (#431)。
// 読む範囲は scripts/profiles/extract.mjs と同じ。ゲームを起動しない・ファイルを書き換えない・外部へ送らない。
// 読める形式: Unity Input System (ゲームに埋め込まれた .inputactions の JSON。PlayerPrefs に保存した上書きを反映)、
// エンジンごとの読み取り (engines：RPGツクール・ウディタ・Source 2・Creation Engine・Quake 系と Source 1)、
// .NET の DLL にある Rewired の操作名 (キーなし)、Unity の旧 Input Manager の軸、.NET の列挙型 (キーなし) の順に試す。
// ほかの形式は読めないので None を返す。
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::keybinds::{unity_path, Key};

/// 読んだ操作 1 つ
#[derive(Clone, Debug, PartialEq)]
pub struct ReadAction {
    pub id: String,
    pub label: String,
    /// button または mouseDelta
    pub kind: &'static str,
    pub default: Option<&'static str>,
}

/// 1 つのゲームから読む操作の上限 (分担のモデルが 1 度に読める数)
pub const MAX_ACTIONS: usize = 160;
/// これより大きいファイルは読まない (extract.mjs と同じ)
const MAX_FILE: u64 = 300_000_000;

/// 読めたら (操作, 読んだ形式の説明)
pub fn read(install_dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    if let Some(actions) = unity_input_actions(install_dir).filter(|a| !a.is_empty()) {
        return Some((actions, "Unity Input System の埋め込み定義"));
    }
    if let Some(found) = crate::engines::read(install_dir) {
        return Some(found);
    }
    // Rewired の操作名 (作品が定義した操作) を、旧 Input Manager の軸 (既定の名残が多い) より優先する。
    // 列挙型からの推定 (キーなし) より、キーのある旧 Input Manager を優先する
    let dotnet = dotnet_actions(install_dir).filter(|(a, _)| !a.is_empty());
    if dotnet
        .as_ref()
        .is_some_and(|(_, s)| s.starts_with("Rewired"))
    {
        return dotnet;
    }
    crate::engines::unity_legacy::read(install_dir)
        .map(|(mut a, s)| {
            a.truncate(MAX_ACTIONS);
            (a, s)
        })
        .or(dotnet)
}

/// <ゲーム>_Data フォルダ
fn data_dir(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.ends_with("_Data"))
        })
}

fn candidate_files(dd: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let meta = dd
        .join("il2cpp_data")
        .join("Metadata")
        .join("global-metadata.dat");
    if meta.is_file() {
        files.push(meta);
    }
    for sub in [dd.to_path_buf(), dd.join("Managed")] {
        let Ok(rd) = std::fs::read_dir(&sub) else {
            continue;
        };
        let mut names: Vec<PathBuf> = rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        names.sort();
        for p in names {
            let n = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if n.ends_with(".assets")
                || n.ends_with(".dll")
                || n.starts_with("globalgamemanagers")
                || n.starts_with("resources")
            {
                files.push(p);
            }
        }
    }
    files
}

/// バイト列に埋め込まれた {"version": N, "name": "...", "maps": [...]} を探して読む
pub fn find_input_assets(bytes: &[u8]) -> Vec<Value> {
    let mut out = Vec::new();
    let key = b"\"maps\"";
    let mut from = 0;
    while let Some(pos) = find(&bytes[from..], key).map(|p| p + from) {
        from = pos + key.len();
        // "maps" の前 400 バイト以内にある {"version" から始まるものだけ
        let start = pos.saturating_sub(400);
        let Some(open) = bytes[start..pos]
            .iter()
            .rposition(|&b| b == b'{')
            .map(|p| p + start)
        else {
            continue;
        };
        let head: Vec<u8> = bytes[open + 1..pos]
            .iter()
            .copied()
            .filter(|b| !b.is_ascii_whitespace())
            .collect();
        if !head.starts_with(b"\"version\":") || !head.windows(7).any(|w| w == b"\"name\":") {
            continue;
        }
        let Some(end) = matching_brace(bytes, open) else {
            continue;
        };
        if let Ok(v) = serde_json::from_slice::<Value>(&bytes[open..=end]) {
            if v["name"].as_str() != Some("DefaultInputActions") && v["maps"].is_array() {
                out.push(v);
            }
        }
        from = end + 1;
    }
    out
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

/// 文字列の中の括弧を数えずに、対応する } を探す
fn matching_brace(bytes: &[u8], open: usize) -> Option<usize> {
    let (mut depth, mut in_str, mut esc) = (0usize, false, false);
    for (i, &b) in bytes.iter().enumerate().skip(open).take(2_000_000) {
        if in_str {
            match (esc, b) {
                (true, _) => esc = false,
                (false, b'\\') => esc = true,
                (false, b'"') => in_str = false,
                _ => {}
            }
            continue;
        }
        match b {
            b'"' => in_str = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn key_of(path: Option<&str>) -> Option<&'static str> {
    match unity_path(path?) {
        Key::Output(k) => Some(k),
        _ => None,
    }
}

/// .inputactions から操作を作る (extract.mjs の unityInputActions と同じ規則)
pub fn actions_from_assets(assets: &[Value]) -> Vec<ReadAction> {
    let mut out: Vec<ReadAction> = Vec::new();
    for a in assets {
        for map in a["maps"].as_array().into_iter().flatten() {
            let map_name = map["name"].as_str().unwrap_or("");
            let bindings: Vec<&Value> = map["bindings"].as_array().into_iter().flatten().collect();
            for ac in map["actions"].as_array().into_iter().flatten() {
                let name = ac["name"].as_str().unwrap_or("");
                if name.is_empty() {
                    continue;
                }
                let id = format!("{map_name}/{name}");
                if out
                    .iter()
                    .any(|x| x.id == id || x.id.starts_with(&format!("{id}/")))
                {
                    continue;
                }
                let bs: Vec<&&Value> = bindings
                    .iter()
                    .filter(|b| b["action"].as_str() == Some(name))
                    .collect();
                let path = |b: &Value| b["path"].as_str().unwrap_or("").to_string();
                let kb: Vec<&&Value> = bs
                    .iter()
                    .copied()
                    .filter(|b| {
                        let p = path(b);
                        p.starts_with("<Keyboard>") || p.starts_with("<Mouse>")
                    })
                    .collect();
                if ac["expectedControlType"].as_str() == Some("Vector2") {
                    let lower = name.to_ascii_lowercase();
                    let look = ["look", "camera", "aim"].iter().any(|w| lower.contains(w));
                    // 2DVector の部分 (up/down/left/right) を別の操作にする
                    for part in ["up", "down", "left", "right"] {
                        if let Some(b) = kb.iter().find(|b| {
                            b["isPartOfComposite"].as_bool() == Some(true)
                                && b["name"].as_str() == Some(part)
                        }) {
                            out.push(ReadAction {
                                id: format!("{id}/{part}"),
                                label: format!("{name} {part}"),
                                kind: "button",
                                default: key_of(b["path"].as_str()),
                            });
                        }
                    }
                    let delta = bs.iter().any(|b| {
                        let p = path(b);
                        p.starts_with("<Mouse>/delta") || p.starts_with("<Pointer>/delta")
                    });
                    if look || delta {
                        out.push(ReadAction {
                            id,
                            label: name.to_string(),
                            kind: "mouseDelta",
                            default: None,
                        });
                    }
                } else {
                    out.push(ReadAction {
                        id,
                        label: name.to_string(),
                        kind: "button",
                        default: key_of(kb.first().and_then(|b| b["path"].as_str())),
                    });
                }
            }
        }
    }
    out.truncate(MAX_ACTIONS);
    out
}

fn unity_input_actions(dir: &Path) -> Option<Vec<ReadAction>> {
    let dd = data_dir(dir)?;
    let mut assets = Vec::new();
    for f in candidate_files(&dd) {
        if std::fs::metadata(&f).map(|m| m.len()).unwrap_or(u64::MAX) > MAX_FILE {
            continue;
        }
        let Ok(bytes) = std::fs::read(&f) else {
            continue;
        };
        assets.extend(find_input_assets(&bytes));
    }
    if assets.is_empty() {
        return None;
    }
    // 利用者が変えたキー (PlayerPrefs の上書き、#484) を反映する
    crate::engines::unity_prefs::apply(&mut assets, &crate::engines::unity_prefs::overrides(&dd));
    Some(actions_from_assets(&assets))
}

// ---------- .NET のメタデータ (ECMA-335) から、型の定数・列挙の名前を読む。コードは実行しない ----------

struct Bytes<'a>(&'a [u8]);

impl Bytes<'_> {
    fn u16(&self, o: usize) -> Option<usize> {
        Some(u16::from_le_bytes(self.0.get(o..o + 2)?.try_into().ok()?) as usize)
    }
    fn u32(&self, o: usize) -> Option<usize> {
        Some(u32::from_le_bytes(self.0.get(o..o + 4)?.try_into().ok()?) as usize)
    }
    fn u64(&self, o: usize) -> Option<u64> {
        Some(u64::from_le_bytes(self.0.get(o..o + 8)?.try_into().ok()?))
    }
    fn idx(&self, o: usize, size: usize) -> Option<usize> {
        if size == 2 {
            self.u16(o)
        } else {
            self.u32(o)
        }
    }
    fn cstr(&self, o: usize) -> Option<String> {
        let rest = self.0.get(o..)?;
        let end = rest.iter().position(|&b| b == 0)?;
        String::from_utf8(rest[..end].to_vec()).ok()
    }
}

/// DLL の型ごとに (名前空間, 名前, フィールドの名前の一覧)
pub fn dotnet_types(bytes: &[u8]) -> Option<Vec<(String, String, Vec<String>)>> {
    let b = Bytes(bytes);
    if bytes.get(..2)? != b"MZ" {
        return None;
    }
    let pe = b.u32(0x3c)?;
    if bytes.get(pe..pe + 4)? != b"PE\0\0" {
        return None;
    }
    let nsec = b.u16(pe + 6)?;
    let opt_size = b.u16(pe + 20)?;
    let opt = pe + 24;
    let dd = opt + if b.u16(opt)? == 0x10b { 96 } else { 112 };
    let cli_rva = b.u32(dd + 14 * 8)?;
    let secs: Vec<(usize, usize, usize, usize)> = (0..nsec)
        .map(|i| {
            let o = opt + opt_size + i * 40;
            Some((
                b.u32(o + 8)?,
                b.u32(o + 12)?,
                b.u32(o + 16)?,
                b.u32(o + 20)?,
            ))
        })
        .collect::<Option<_>>()?;
    let off = |rva: usize| {
        secs.iter()
            .find(|&&(vs, va, rs, _)| rva >= va && rva < va + vs.max(rs))
            .map(|&(_, va, _, raw)| rva - va + raw)
    };
    let md = off(b.u32(off(cli_rva)? + 8)?)?;
    let vlen = b.u32(md + 12)?;
    let mut p = md + 16 + vlen + 2;
    let ns = b.u16(p)?;
    p += 2;
    let (mut tables, mut strings) = (None, None);
    for _ in 0..ns {
        let o = b.u32(p)?;
        let name = b.cstr(p + 8)?;
        match name.as_str() {
            "#~" | "#-" => tables = Some(md + o),
            "#Strings" => strings = Some(md + o),
            _ => {}
        }
        p = (p + 8 + name.len() + 1 + 3) & !3;
    }
    let (t, s) = (tables?, strings?);
    let heap = *bytes.get(t + 6)?;
    let valid = b.u64(t + 8)?;
    let mut rows = [0usize; 64];
    let mut q = t + 24;
    for (i, r) in rows.iter_mut().enumerate() {
        if valid >> i & 1 == 1 {
            *r = b.u32(q)?;
            q += 4;
        }
    }
    let si = if heap & 1 != 0 { 4 } else { 2 };
    let gi = if heap & 2 != 0 { 4 } else { 2 };
    let bi = if heap & 4 != 0 { 4 } else { 2 };
    let idx = |t: usize| if rows[t] < 65536 { 2 } else { 4 };
    let coded = |ts: &[usize], bits: u32| {
        if ts.iter().map(|&t| rows[t]).max().unwrap_or(0) < (1 << (16 - bits)) {
            2
        } else {
            4
        }
    };
    let size = [
        2 + si + gi * 3,
        coded(&[0, 0x1a, 0x23, 1], 2) + si * 2,
        4 + si * 2 + coded(&[2, 1, 0x1b], 2) + idx(4) + idx(6),
        idx(4),
        2 + si + bi,
    ];
    let mut base = [0usize; 5];
    for i in 0..5 {
        base[i] = q;
        q += size[i] * rows[i];
    }
    let name_at = |i: usize| b.cstr(s + i);
    let mut types = Vec::new();
    for r in 0..rows[2] {
        let o = base[2] + r * size[2] + 4;
        let name = name_at(b.idx(o, si)?)?;
        let namespace = name_at(b.idx(o + si, si)?)?;
        let fields = b.idx(o + si * 2 + coded(&[2, 1, 0x1b], 2), idx(4))?;
        types.push((namespace, name, fields));
    }
    let mut out = Vec::new();
    for (i, (namespace, name, first)) in types.iter().enumerate() {
        let end = types.get(i + 1).map_or(rows[4] + 1, |t| t.2);
        let mut fields = Vec::new();
        for f in *first..end.max(*first) {
            if f == 0 || f > rows[4] {
                break;
            }
            let n = name_at(b.idx(base[4] + (f - 1) * size[4] + 2, si)?)?;
            if n != "value__" {
                fields.push(n);
            }
        }
        out.push((namespace.clone(), name.clone(), fields));
    }
    Some(out)
}

/// Managed の DLL から、操作名の定数・列挙を探す (Mono のビルドだけ。IL2CPP には Managed がない)
fn dotnet_actions(dir: &Path) -> Option<(Vec<ReadAction>, &'static str)> {
    let managed = data_dir(dir)?.join("Managed");
    let mut dlls: Vec<PathBuf> = std::fs::read_dir(&managed)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("dll")))
        // Unity・.NET の標準のライブラリは操作名を持たないので読まない
        .filter(|p| {
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            ![
                "Unity",
                "System",
                "Mono",
                "mscorlib",
                "netstandard",
                "Microsoft",
            ]
            .iter()
            .any(|x| n.starts_with(x))
        })
        .collect();
    dlls.sort();
    let to_actions = |names: &[String]| -> Vec<ReadAction> {
        names
            .iter()
            .take(MAX_ACTIONS)
            .map(|n| {
                let l = n.to_ascii_lowercase();
                let kind = if l.contains("delta") || l.contains("look") {
                    "mouseDelta"
                } else {
                    "button"
                };
                ReadAction {
                    id: n.clone(),
                    label: n.clone(),
                    kind,
                    default: None,
                }
            })
            .collect()
    };
    let mut enums: Option<Vec<String>> = None;
    for dll in &dlls {
        if std::fs::metadata(dll).map(|m| m.len()).unwrap_or(u64::MAX) > MAX_FILE {
            continue;
        }
        let Ok(bytes) = std::fs::read(dll) else {
            continue;
        };
        let Some(types) = dotnet_types(&bytes) else {
            continue;
        };
        // Rewired が書き出す操作名の定数 (RewiredConsts.Action) を優先する
        if let Some((_, _, f)) = types
            .iter()
            .find(|(ns, n, f)| ns == "RewiredConsts" && n == "Action" && !f.is_empty())
        {
            return Some((
                to_actions(f),
                "Rewired の操作名の定数（RewiredConsts.Action、キーなし）",
            ));
        }
        if enums.is_none() && dll.file_name().is_some_and(|n| n == "Assembly-CSharp.dll") {
            enums = types
                .into_iter()
                .find(|(_, n, f)| {
                    [
                        "InputKey",
                        "InputAction",
                        "KeyAction",
                        "PlayerAction",
                        "GameAction",
                        "InputType",
                    ]
                    .contains(&n.as_str())
                        && !f.is_empty()
                })
                .map(|t| t.2);
        }
    }
    enums.map(|f| (to_actions(&f), ".NET の操作の列挙型（キーなし）"))
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// 試験用の Unity のゲームのフォルダ (resources.assets に .inputactions を埋め込む)
    pub fn fake_unity_game(dir: &Path) {
        let dd = dir.join("Fake_Data");
        std::fs::create_dir_all(&dd).unwrap();
        let actions = serde_json::json!({
            "version": 1, "name": "PlayerControls",
            "maps": [{
                "name": "Player",
                "actions": [
                    { "name": "Move", "type": "Value", "expectedControlType": "Vector2" },
                    { "name": "Look", "type": "Value", "expectedControlType": "Vector2" },
                    { "name": "Jump", "type": "Button" },
                    { "name": "Fire", "type": "Button" },
                    { "name": "Interact", "type": "Button" },
                    { "name": "Inventory", "type": "Button" },
                    { "name": "Pause", "type": "Button" }
                ],
                "bindings": [
                    { "name": "WASD", "path": "2DVector", "action": "Move", "isComposite": true },
                    { "name": "up", "path": "<Keyboard>/w", "action": "Move", "isPartOfComposite": true },
                    { "name": "down", "path": "<Keyboard>/s", "action": "Move", "isPartOfComposite": true },
                    { "name": "left", "path": "<Keyboard>/a", "action": "Move", "isPartOfComposite": true },
                    { "name": "right", "path": "<Keyboard>/d", "action": "Move", "isPartOfComposite": true },
                    { "name": "", "path": "<Mouse>/delta", "action": "Look" },
                    { "name": "", "path": "<Keyboard>/space", "action": "Jump" },
                    { "name": "", "path": "<Gamepad>/buttonSouth", "action": "Jump" },
                    { "name": "", "path": "<Mouse>/leftButton", "action": "Fire" },
                    { "name": "", "path": "<Keyboard>/e", "action": "Interact" },
                    { "name": "", "path": "<Keyboard>/tab", "action": "Inventory" },
                    { "name": "", "path": "<Keyboard>/escape", "action": "Pause" }
                ]
            }]
        });
        let mut bytes = b"\x00\x01UnityFS binary header {not json}\x00".to_vec();
        // 実際のゲームと同じく version → name → maps の順に書く (json! は名前順に並べ替えるので、maps 以外を先に書いて組み立てる)
        let text = format!(
            "{{\"version\": 1, \"name\": \"PlayerControls\", \"maps\": {}}}",
            actions["maps"]
        );
        bytes.extend_from_slice(text.as_bytes());
        bytes.extend_from_slice(
            b"\x00\xff trailing {\"version\": 2, \"name\": \"DefaultInputActions\", \"maps\": []}",
        );
        std::fs::write(dd.join("resources.assets"), bytes).unwrap();
    }

    #[test]
    fn reads_embedded_unity_input_actions_without_running_the_game() {
        let dir =
            std::env::temp_dir().join(format!("recooplay-game-actions-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        fake_unity_game(&dir);
        let (actions, source) = read(&dir).expect("読める");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(source.contains("Unity"));
        let ids: Vec<&str> = actions.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "Player/Move/up",
                "Player/Move/down",
                "Player/Move/left",
                "Player/Move/right",
                "Player/Look",
                "Player/Jump",
                "Player/Fire",
                "Player/Interact",
                "Player/Inventory",
                "Player/Pause"
            ]
        );
        let get = |id: &str| actions.iter().find(|a| a.id == id).unwrap();
        assert_eq!(get("Player/Move/up").default, Some("KEY_W"));
        assert_eq!(get("Player/Look").kind, "mouseDelta");
        assert_eq!(
            get("Player/Jump").default,
            Some("SPACE"),
            "キーボードの割り当てを使う (ゲームパッドは使わない)"
        );
        assert_eq!(get("Player/Fire").default, Some("MOUSE_L"));
    }

    /// 手元のゲームで確かめる: RECOOPLAY_GAME_DIRS にゲームのフォルダを ; 区切りで指定する (CI では動かさない)
    #[test]
    #[ignore]
    fn reads_local_games() {
        for d in std::env::var("RECOOPLAY_GAME_DIRS")
            .unwrap_or_default()
            .split(';')
            .filter(|d| !d.is_empty())
        {
            let started = std::time::Instant::now();
            match read(Path::new(d)) {
                Some((a, src)) => eprintln!(
                    "{d}: {} 操作（{src}、{} ms）例: {:?}",
                    a.len(),
                    started.elapsed().as_millis(),
                    a.iter()
                        .take(4)
                        .map(|x| (&x.id, x.default))
                        .collect::<Vec<_>>()
                ),
                None => eprintln!("{d}: 読めない（{} ms）", started.elapsed().as_millis()),
            }
        }
    }

    /// .NET のメタデータの読み取りを、Windows に入っている mscorlib.dll の列挙型で確かめる
    #[test]
    fn reads_enum_names_from_dotnet_metadata() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
        let dll = Path::new(&windir)
            .join("Microsoft.NET")
            .join("Framework64")
            .join("v4.0.30319")
            .join("mscorlib.dll");
        let Ok(bytes) = std::fs::read(&dll) else {
            eprintln!("mscorlib.dll がないので確かめない");
            return;
        };
        let types = dotnet_types(&bytes).expect("メタデータを読める");
        let (_, _, fields) = types
            .iter()
            .find(|(ns, n, _)| ns == "System" && n == "DayOfWeek")
            .expect("System.DayOfWeek がある");
        assert_eq!(
            fields,
            &[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ]
        );
        assert!(
            dotnet_types(b"MZ not a real pe file").is_none(),
            "壊れた DLL では落ちずに None"
        );
        assert!(dotnet_types(&bytes[..bytes.len() / 3]).is_none_or(|t| !t.is_empty()));
    }

    #[test]
    fn folders_without_a_known_engine_are_not_read() {
        let dir = std::env::temp_dir().join(format!(
            "recooplay-game-actions-none-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(dir.join("Other")).unwrap();
        std::fs::write(
            dir.join("Other").join("data.bin"),
            b"{\"version\":1,\"name\":\"X\",\"maps\":[]}",
        )
        .unwrap();
        assert!(read(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
