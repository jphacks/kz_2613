// config.json (Node 版と同じファイル・同じ項目) と環境変数 PORT

use std::path::Path;

use serde_json::Value;

use crate::focus::Target;

pub struct Config {
    pub port: u16,
    pub wifi: Option<(String, String)>,
    pub inject_mode: String,
    pub auto_resume: bool,
    /// 設定を保存する config.json の場所の基準 (RECOOPLAY_NO_CONFIG=1 のときは None で、読み書きしない)
    pub settings_root: Option<std::path::PathBuf>,
    pub auto_resume_ms: u64,
    pub look_smooth_min_ms: f64,
    pub look_smooth_max_ms: f64,
    /// 常時 ON で注入してよい前面のウィンドウ ("target": { "processes": [...], "titleContains": "..." })
    pub target: Target,
    /// Minecraft のキー設定 (options.txt) の場所。ランチャーで .minecraft 以外を使う場合に指定する (#101)
    pub minecraft_options: Option<String>,
    /// ゲームの操作定義のフォルダ (#97)
    pub profiles_dir: std::path::PathBuf,
}

/// 設定ファイルの版。2以上は、自動復帰を利用者が明示的に選んだ値として扱う。
/// 版がない config.json の `autoResume: true` は、旧初期値 (ON) の結果か明示操作か区別できないため、
/// 一度だけOFFへ移行して版を書き込む (#225・Q40)。
const SETTINGS_VERSION: u64 = 2;

/// 自動復帰の有効値と、config.json へ版を書き込む必要があるか。(有効値, 移行の書き込みが必要)
fn resolve_auto_resume(v: &Value) -> (bool, bool) {
    let Some(obj) = v.as_object() else { return (false, false) };
    if obj.get("settingsVersion").and_then(Value::as_u64).unwrap_or(0) >= SETTINGS_VERSION {
        return (obj.get("autoResume").and_then(Value::as_bool).unwrap_or(false), false);
    }
    (false, true)
}

fn write_json(path: &Path, v: &Value) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(v).unwrap_or_default() + "
")?;
    std::fs::rename(&tmp, path)
}

/// 利用者が自動復帰を明示的に切り替えた値を config.json へ保存する。以降は移行でOFFへ戻さない。
/// 失敗しても今回の動作には影響させない (戻り値はログ用)。
pub fn save_auto_resume(root: &Path, on: bool) -> std::io::Result<()> {
    let path = root.join("config.json");
    let mut v: Value = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    if !v.is_object() { v = Value::Object(Default::default()); }
    let obj = v.as_object_mut().unwrap();
    obj.insert("autoResume".into(), Value::Bool(on));
    obj.insert("settingsVersion".into(), Value::from(SETTINGS_VERSION));
    write_json(&path, &v)
}

impl Config {
    pub fn load(root: &Path) -> Config {
        // RECOOPLAY_NO_CONFIG=1 なら config.json を読まない (シミュレーションを手元の設定に左右させない)
        let skip = std::env::var("RECOOPLAY_NO_CONFIG").as_deref() == Ok("1");
        let v: Value = (!skip)
            .then(|| std::fs::read_to_string(root.join("config.json")).ok())
            .flatten()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or(Value::Null);
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .or_else(|| v.get("port").and_then(Value::as_u64).map(|p| p as u16))
            .unwrap_or(8080);
        let wifi = v.get("wifi").and_then(|w| {
            let ssid = w.get("ssid").and_then(Value::as_str).filter(|s| !s.is_empty())?;
            let password = w.get("password").and_then(Value::as_str).unwrap_or("");
            Some((ssid.to_string(), password.to_string()))
        });
        // 自動復帰は初期OFF (Q40)。旧版の設定は一度だけOFFへ移行し、版を記録する
        let (auto_resume, needs_stamp) = resolve_auto_resume(&v);
        let settings_root = (!skip).then(|| root.to_path_buf());
        if needs_stamp {
            let was_on = v.get("autoResume").and_then(Value::as_bool) == Some(true);
            let mut next = v.clone();
            let obj = next.as_object_mut().unwrap();
            obj.insert("autoResume".into(), Value::Bool(false));
            obj.insert("settingsVersion".into(), Value::from(SETTINGS_VERSION));
            match write_json(&root.join("config.json"), &next) {
                Ok(()) if was_on => eprintln!("config.json: 旧版の自動復帰ON設定を、一度だけOFFへ移行しました。使う場合は設定で明示的にONにしてください"),
                Ok(()) => {}
                Err(e) => eprintln!("config.json: 設定の移行を保存できませんでした ({e})。今回はOFFで動作します"),
            }
        }
        Config {
            port,
            wifi,
            // 初期値は on (#114)。on でも、協力プレイ中で対象のゲームが前面のときだけ送る。
            // 手動で ON にする手順は、前面の確認 (#19) が入った後は二重の確認になるためなくした
            inject_mode: v.get("injectMode").and_then(Value::as_str).unwrap_or("on").to_string(),
            auto_resume,
            settings_root,
            auto_resume_ms: v.get("autoResumeMs").and_then(Value::as_u64).unwrap_or(15000),
            look_smooth_min_ms: v.get("lookSmoothMinMs").and_then(Value::as_f64).unwrap_or(30.0),
            look_smooth_max_ms: v.get("lookSmoothMaxMs").and_then(Value::as_f64).unwrap_or(120.0),
            target: {
                let t = v.get("target");
                let mut target = Target::default();
                if let Some(list) = t.and_then(|t| t.get("processes")).and_then(Value::as_array) {
                    target.processes = list.iter().filter_map(Value::as_str).map(str::to_string).collect();
                }
                if let Some(title) = t.and_then(|t| t.get("titleContains")).and_then(Value::as_str) {
                    target.title_contains = title.to_string();
                }
                target
            },
            minecraft_options: v.get("minecraftOptions").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string),
            profiles_dir: std::env::var("RECOOPLAY_PROFILES_DIR").map(std::path::PathBuf::from).unwrap_or_else(|_| root.join("apps").join("game-profiles")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn auto_resume_is_off_by_default_and_for_missing_or_unversioned_settings() {
        assert_eq!(resolve_auto_resume(&Value::Null), (false, false)); // config.json なし
        assert_eq!(resolve_auto_resume(&json!({})), (false, true)); // 設定欠落
        assert_eq!(resolve_auto_resume(&json!({"autoResume": true})), (false, true)); // 版なしのONは一度だけOFFへ移行する
        assert_eq!(resolve_auto_resume(&json!({"autoResume": false})), (false, true));
    }

    #[test]
    fn explicit_on_with_current_version_is_kept() {
        assert_eq!(resolve_auto_resume(&json!({"settingsVersion": 2, "autoResume": true})), (true, false));
        assert_eq!(resolve_auto_resume(&json!({"settingsVersion": 2, "autoResume": false})), (false, false));
        assert_eq!(resolve_auto_resume(&json!({"settingsVersion": 2})), (false, false));
        assert_eq!(resolve_auto_resume(&json!({"settingsVersion": 1, "autoResume": true})), (false, true));
    }

    fn temp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("recooplay-cfg-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn load_migrates_once_then_keeps_the_explicit_choice() {
        std::env::remove_var("RECOOPLAY_NO_CONFIG");
        let root = temp_root("migrate");
        std::fs::write(root.join("config.json"), r#"{"port": 9000, "autoResume": true, "wifi": {"ssid": "x", "password": "y"}}"#).unwrap();
        let c = Config::load(&root);
        assert!(!c.auto_resume);
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(root.join("config.json")).unwrap()).unwrap();
        assert_eq!(saved["settingsVersion"], 2);
        assert_eq!(saved["autoResume"], false);
        assert_eq!(saved["port"], 9000); // ほかの設定は保持する
        assert_eq!(saved["wifi"]["ssid"], "x");
        // 利用者が明示的にONにした後は、再起動してもOFFへ戻さない
        save_auto_resume(&root, true).unwrap();
        assert!(Config::load(&root).auto_resume);
        assert!(Config::load(&root).auto_resume);
        save_auto_resume(&root, false).unwrap();
        assert!(!Config::load(&root).auto_resume);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn load_without_config_file_is_off_and_does_not_create_one() {
        std::env::remove_var("RECOOPLAY_NO_CONFIG");
        let root = temp_root("none");
        assert!(!Config::load(&root).auto_resume);
        assert!(!root.join("config.json").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
