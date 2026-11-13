// 操作定義のないゲームのファイルから、操作 (名前・初期キー・種類) を読む (#431)。
// 読む範囲は scripts/profiles/extract.mjs と同じ。ゲームを起動しない・ファイルを書き換えない・外部へ送らない。
// 今は Unity Input System (ゲームに埋め込まれた .inputactions の JSON) だけ。ほかのエンジンは読めないので None を返す。
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
    let actions = unity_input_actions(install_dir)?;
    (!actions.is_empty()).then_some((actions, "Unity Input System の埋め込み定義"))
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
    (!assets.is_empty()).then(|| actions_from_assets(&assets))
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
