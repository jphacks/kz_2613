// Unity の PlayerPrefs に保存された、利用者のキーの割り当て (#484)。
// Windows の PlayerPrefs はレジストリ HKCU\Software\<会社名>\<製品名> の値 (名前の末尾に _h<ハッシュ>、文字列は
// UTF-8 のバイナリ値)。会社名・製品名は <Game>_Data/app.info の 1・2 行目。読み取り専用で開き、書き込まない。
// 値の中から Input System の上書き (SaveBindingOverridesAsJson の {"bindings":[{"action","id","path"}]}) を探し、
// ゲームに埋め込まれた .inputactions の同じ id の割り当てを置き換える。
// Rewired の保存 (UserDataStore_PlayerPrefs の XML) は操作の番号とキーの番号だけで、操作名と結び付ける表が DLL の
// 定数の値にあり、今の .NET の読み取り (名前だけ) では結び付けられないので、まだ読まない。
use std::path::Path;

use serde_json::Value;

/// (割り当ての id, 置き換え後のパス)
pub type Overrides = Vec<(String, String)>;

/// <Game>_Data から、PlayerPrefs に保存された上書きを読む
pub fn overrides(data_dir: &Path) -> Overrides {
    let Some((company, product)) = app_info(data_dir) else {
        return Vec::new();
    };
    registry_strings(&company, &product)
        .iter()
        .flat_map(|s| parse_overrides(s))
        .collect()
}

/// app.info の会社名と製品名
pub fn app_info(data_dir: &Path) -> Option<(String, String)> {
    let text = super::read_text(&data_dir.join("app.info"))?;
    let mut lines = text.lines().map(str::trim);
    let company = lines.next().filter(|s| !s.is_empty())?.to_string();
    let product = lines.next().filter(|s| !s.is_empty())?.to_string();
    // レジストリのパスに使うので、区切りの文字を含むものは使わない
    if company.contains(['\\', '/']) || product.contains(['\\', '/']) {
        return None;
    }
    Some((company, product))
}

/// {"bindings":[{"action":"Player/Jump","id":"...","path":"<Keyboard>/k"}]} を読む
pub fn parse_overrides(text: &str) -> Overrides {
    let text = text.trim_end_matches('\0').trim();
    if !text.starts_with('{') || !text.contains("\"bindings\"") {
        return Vec::new();
    }
    let Ok(v) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    v["bindings"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|b| {
            Some((
                b["id"].as_str()?.to_string(),
                b["path"].as_str()?.to_string(),
            ))
        })
        .filter(|(id, _)| !id.is_empty())
        .collect()
}

/// .inputactions の割り当てのパスを、同じ id の上書きで置き換える (overridePath と同じ意味)
pub fn apply(assets: &mut [Value], ov: &Overrides) {
    if ov.is_empty() {
        return;
    }
    for a in assets.iter_mut() {
        let Some(maps) = a["maps"].as_array_mut() else {
            continue;
        };
        for map in maps {
            let Some(bindings) = map["bindings"].as_array_mut() else {
                continue;
            };
            for b in bindings {
                let Some(id) = b["id"].as_str() else { continue };
                if let Some((_, path)) = ov.iter().find(|(i, _)| i == id) {
                    b["path"] = Value::from(path.clone());
                }
            }
        }
    }
}

#[cfg(windows)]
fn registry_strings(company: &str, product: &str) -> Vec<String> {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_BINARY,
    };

    let mut out = Vec::new();
    let path = format!("Software\\{company}\\{product}");
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            &HSTRING::from(path),
            Some(0),
            KEY_READ,
            &mut h,
        )
        .is_err()
        {
            return out;
        }
        for i in 0..4096u32 {
            let mut name = [0u16; 512];
            let mut name_len = name.len() as u32;
            let mut kind = 0u32;
            let mut data = vec![0u8; 256 * 1024];
            let mut data_len = data.len() as u32;
            let r = RegEnumValueW(
                h,
                i,
                Some(PWSTR(name.as_mut_ptr())),
                &mut name_len,
                None,
                Some(&mut kind),
                Some(data.as_mut_ptr()),
                Some(&mut data_len),
            );
            if r.is_err() {
                // 値が大きすぎる (ERROR_MORE_DATA) ものは飛ばし、それ以外 (終わり) で止める
                if r.0 == 234 {
                    continue;
                }
                break;
            }
            if kind == REG_BINARY.0 && data_len > 2 {
                data.truncate(data_len as usize);
                if let Ok(s) = String::from_utf8(data) {
                    if s.contains("\"bindings\"") {
                        out.push(s);
                    }
                }
            }
        }
        let _ = RegCloseKey(h);
    }
    out
}

#[cfg(not(windows))]
fn registry_strings(_company: &str, _product: &str) -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overrides_replace_binding_paths() {
        let saved = "{\"bindings\":[{\"action\":\"Player/Jump\",\"id\":\"b-jump\",\"path\":\"<Keyboard>/k\",\"interactions\":\"\",\"processors\":\"\"}]}\0";
        let ov = parse_overrides(saved);
        assert_eq!(ov, [("b-jump".to_string(), "<Keyboard>/k".to_string())]);
        let mut assets = vec![
            serde_json::json!({"version":1,"name":"Game","maps":[{"name":"Player","actions":[{"name":"Jump"}],
            "bindings":[{"id":"b-jump","action":"Jump","path":"<Keyboard>/space"},{"id":"other","action":"Jump","path":"<Gamepad>/a"}]}]}),
        ];
        apply(&mut assets, &ov);
        assert_eq!(assets[0]["maps"][0]["bindings"][0]["path"], "<Keyboard>/k");
        assert_eq!(assets[0]["maps"][0]["bindings"][1]["path"], "<Gamepad>/a");
        assert!(parse_overrides("ja").is_empty());
        assert!(parse_overrides("{\"other\":1}").is_empty());
    }

    #[test]
    fn app_info_gives_registry_names() {
        let dir = std::env::temp_dir().join(format!("recooplay-prefs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("app.info"), "Irox Games\nBongoCat").unwrap();
        assert_eq!(
            app_info(&dir),
            Some(("Irox Games".into(), "BongoCat".into()))
        );
        std::fs::write(dir.join("app.info"), "a\\b\nc").unwrap();
        assert_eq!(app_info(&dir), None, "区切りの文字は使わない");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
