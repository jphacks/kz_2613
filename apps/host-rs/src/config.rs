// config.json (Node 版と同じファイル・同じ項目) と環境変数 PORT

use std::path::Path;

use serde_json::Value;

use crate::focus::Target;

pub struct Config {
    pub port: u16,
    pub wifi: Option<(String, String)>,
    pub required_players: u64,
    pub inject_mode: String,
    pub auto_resume: bool,
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
        Config {
            port,
            wifi,
            required_players: v.get("requiredPlayers").and_then(Value::as_u64).filter(|r| (1..=3).contains(r)).unwrap_or(3),
            // 初期値は on (#114)。on でも、協力プレイ中で対象のゲームが前面のときだけ送る。
            // 手動で ON にする手順は、前面の確認 (#19) が入った後は二重の確認になるためなくした
            inject_mode: v.get("injectMode").and_then(Value::as_str).unwrap_or("on").to_string(),
            auto_resume: v.get("autoResume").and_then(Value::as_bool).unwrap_or(true),
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
