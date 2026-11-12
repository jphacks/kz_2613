// ゲーム管理の外部境界。Hubのセッション・認可・入力解放・epoch・通知には依存しない。
use crate::focus::{self, Foreground, Target};
use crate::games::{self, Entry};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub(crate) const TITLES: [&str; 2] = ["minecraft-java", "pseudo-game"];
pub(crate) const LAUNCH_POLL: Duration = Duration::from_millis(500);
const FOCUS_WAIT: Duration = Duration::from_secs(5);
pub(crate) fn launch_timeout(minecraft: bool) -> Duration {
    Duration::from_secs(if minecraft { 300 } else { 90 })
}
fn dry_run() -> bool {
    std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1")
}

pub(crate) trait GameBackend: Send + Sync {
    fn roots(&self) -> games::Roots;
    fn detect(&self, roots: &games::Roots) -> games::Detected;
    fn foreground(&self) -> Option<Foreground>;
    fn exists(&self, target: &Target) -> bool;
    fn activate(&self, target: &Target) -> Result<(), String>;
    fn launch(&self, entry: &Entry) -> Result<(), String>;
    fn pick_exe(&self) -> Option<PathBuf>;
}
struct SystemBackend;
impl GameBackend for SystemBackend {
    fn roots(&self) -> games::Roots {
        match std::env::var_os("RECOOPLAY_FAKE_GAMES") {
            Some(dir) if dry_run() => games::Roots::fake(Path::new(&dir)),
            _ => games::Roots::system(),
        }
    }
    fn detect(&self, roots: &games::Roots) -> games::Detected {
        games::detect(roots)
    }
    fn foreground(&self) -> Option<Foreground> {
        focus::foreground()
    }
    fn exists(&self, target: &Target) -> bool {
        focus::exists(target)
    }
    fn activate(&self, target: &Target) -> Result<(), String> {
        focus::activate(target)
    }
    fn launch(&self, entry: &Entry) -> Result<(), String> {
        games::launch(entry)
    }
    fn pick_exe(&self) -> Option<PathBuf> {
        games::pick_exe()
    }
}

#[derive(Clone)]
pub(crate) struct GameService {
    backend: Arc<dyn GameBackend>,
}
impl GameService {
    pub(crate) fn new() -> Self {
        Self {
            backend: Arc::new(SystemBackend),
        }
    }
    #[cfg(test)]
    pub(crate) fn with_backend(backend: Arc<dyn GameBackend>) -> Self {
        Self { backend }
    }
    pub(crate) fn roots(&self) -> games::Roots {
        self.backend.roots()
    }
    pub(crate) fn detect(&self, roots: &games::Roots) -> games::Detected {
        self.backend.detect(roots)
    }
    pub(crate) fn foreground(&self) -> Option<Foreground> {
        self.backend.foreground()
    }
    pub(crate) fn exists(&self, target: &Target) -> bool {
        self.backend.exists(target)
    }
    pub(crate) fn activate(&self, target: &Target) -> Result<(), String> {
        self.backend.activate(target)
    }
    pub(crate) fn launch(&self, entry: &Entry) -> Result<(), String> {
        self.backend.launch(entry)
    }
    pub(crate) fn pick(&self, simulated: bool, fake: Option<PathBuf>) -> Option<PathBuf> {
        if simulated {
            fake.and_then(|f| std::fs::read_to_string(f).ok())
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .map(PathBuf::from)
        } else {
            self.backend.pick_exe()
        }
    }
    pub(crate) fn register(&self, exe: PathBuf) -> Result<String, &'static str> {
        let Some(file) = self.roots().manual else {
            return Err("登録先のフォルダが見つかりません");
        };
        games::manual_exe_ok(&exe)?;
        let mut list = games::load_manual(&file);
        let id = games::manual_id(&exe);
        if list.iter().any(|g| g.id == id) {
            return Err("このゲームは登録済みです");
        }
        let name = exe
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "ゲーム".into());
        list.push(games::ManualGame {
            id: id.clone(),
            name,
            exe,
        });
        games::save_manual(&file, &list).map_err(|_| "登録を保存できませんでした")?;
        Ok(id)
    }
    pub(crate) fn edit(&self, id: &str, name: Option<String>) -> Option<&'static str> {
        let key = id.strip_prefix("manual:")?;
        let file = self.roots().manual?;
        let mut list = games::load_manual(&file);
        let i = list.iter().position(|g| g.id == key)?;
        let action = match name {
            Some(n) => {
                let n: String = n
                    .chars()
                    .filter(|c| !c.is_control())
                    .collect::<String>()
                    .trim()
                    .chars()
                    .take(60)
                    .collect();
                if n.is_empty() {
                    return None;
                }
                list[i].name = n;
                "rename"
            }
            None => {
                list.remove(i);
                "remove"
            }
        };
        games::save_manual(&file, &list).ok()?;
        Some(action)
    }
}

pub(crate) fn title_known(entries: &[Entry], title: &str) -> bool {
    TITLES.contains(&title) || entries.iter().any(|g| g.id == title)
}
pub(crate) fn game_name(entries: &[Entry], title: &str) -> String {
    match entries.iter().find(|g| g.id == title) {
        Some(g) => g.name.clone(),
        None if title == "pseudo-game" => "疑似ゲーム画面".into(),
        _ => "Minecraft".into(),
    }
}
pub(crate) fn target_for(entries: &[Entry], title: &str, base: &Target) -> Target {
    match entries.iter().find(|g| g.id == title) {
        Some(g) if g.source == games::MANUAL_SOURCE => Target::executable(Path::new(&g.launch_uri)),
        Some(g) => Target::install_dir(&g.install_dir),
        None if TITLES.contains(&title) => base.clone(),
        None => Target {
            processes: vec![],
            title_contains: String::new(),
            dir: None,
            executable: None,
        },
    }
}
pub(crate) fn minecraft_entry(launch: Option<&str>) -> Option<Entry> {
    launch.map(|launch| Entry {
        id: "minecraft-java".into(),
        name: "Minecraft".into(),
        source: games::MINECRAFT_SOURCE,
        install_dir: PathBuf::new(),
        launch_uri: launch.into(),
        image: None,
        icon_source: None,
    })
}

pub(crate) struct Launch {
    pub id: String,
    pub name: String,
    pub state: &'static str,
    pub message: String,
    pub gen: u64,
    pub deadline: Instant,
    pub seen: Option<Instant>,
}
pub(crate) enum Watch {
    Ignore,
    Wait,
    Complete {
        state: &'static str,
        message: String,
    },
}
impl Launch {
    pub(crate) fn current(&self, gen: u64) -> bool {
        self.gen == gen && self.state == "launching"
    }
    pub(crate) fn observe(
        &mut self,
        gen: u64,
        now: Instant,
        appeared: bool,
        activation: Result<(), String>,
    ) -> Watch {
        if !self.current(gen) {
            return Watch::Ignore;
        }
        if appeared {
            let seen = *self.seen.get_or_insert(now);
            match activation {
                Ok(()) => Watch::Complete {
                    state: "started",
                    message: format!(
                        "{}を前面にしました。ホストが準備してReadyを押すと開始します",
                        self.name
                    ),
                },
                Err(_) if now.saturating_duration_since(seen) < FOCUS_WAIT => Watch::Wait,
                Err(reason) => Watch::Complete {
                    state: "started",
                    message: format!(
                        "{}は起動しましたが、{}。手動で前面にしてください",
                        self.name, reason
                    ),
                },
            }
        } else if now >= self.deadline {
            Watch::Complete { state: "timeout", message: format!("{}の起動を確認できませんでした。ランチャーの画面（更新・ログイン・確認）を確かめ、手動で起動してください", self.name) }
        } else {
            Watch::Wait
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    struct FakeBackend {
        root: PathBuf,
        calls: Mutex<Vec<String>>,
    }
    impl FakeBackend {
        fn note(&self, name: &str) {
            self.calls.lock().unwrap().push(name.into());
        }
    }
    impl GameBackend for FakeBackend {
        fn roots(&self) -> games::Roots {
            games::Roots::fake(&self.root)
        }
        fn detect(&self, _: &games::Roots) -> games::Detected {
            self.note("detect");
            games::Detected {
                games: vec![],
                minecraft: None,
            }
        }
        fn foreground(&self) -> Option<Foreground> {
            self.note("foreground");
            None
        }
        fn exists(&self, _: &Target) -> bool {
            self.note("exists");
            true
        }
        fn activate(&self, _: &Target) -> Result<(), String> {
            self.note("activate");
            Err("前面化の拒否".into())
        }
        fn launch(&self, entry: &Entry) -> Result<(), String> {
            self.note(&entry.id);
            Ok(())
        }
        fn pick_exe(&self) -> Option<PathBuf> {
            self.note("pick");
            None
        }
    }
    fn entry(source: &'static str) -> Entry {
        Entry {
            id: format!("{source}:test"),
            name: "試験".into(),
            source,
            install_dir: PathBuf::from("C:/mock/game"),
            launch_uri: "C:/mock/game/game.exe".into(),
            image: None,
            icon_source: None,
        }
    }
    fn launch(now: Instant, minecraft: bool) -> Launch {
        Launch {
            id: "test".into(),
            name: "試験".into(),
            state: "launching",
            message: String::new(),
            gen: 7,
            deadline: now + launch_timeout(minecraft),
            seen: None,
        }
    }

    #[test]
    fn backend_records_detection_launch_and_focus_without_touching_os() {
        let fake = Arc::new(FakeBackend {
            root: PathBuf::new(),
            calls: Mutex::new(vec![]),
        });
        let service = GameService::with_backend(fake.clone());
        let target = Target::default();
        assert!(service.detect(&service.roots()).games.is_empty());
        assert!(service.foreground().is_none());
        assert!(service.exists(&target));
        assert_eq!(service.activate(&target), Err("前面化の拒否".into()));
        for source in ["steam", "epic", games::MANUAL_SOURCE] {
            service.launch(&entry(source)).unwrap();
        }
        let minecraft = minecraft_entry(Some("公式ランチャー")).unwrap();
        service.launch(&minecraft).unwrap();
        assert!(service.pick(false, None).is_none());
        assert_eq!(
            *fake.calls.lock().unwrap(),
            [
                "detect",
                "foreground",
                "exists",
                "activate",
                "steam:test",
                "epic:test",
                "registered:test",
                "minecraft-java",
                "pick"
            ]
        );
    }

    #[test]
    fn selection_keeps_detected_roots_manual_exact_path_and_unknown_fail_closed() {
        let base = Target::default();
        assert!(title_known(&[], "minecraft-java"));
        assert!(!title_known(&[], "steam:unknown"));
        assert_eq!(game_name(&[], "pseudo-game"), "疑似ゲーム画面");
        for source in ["steam", "epic"] {
            let e = entry(source);
            let target = target_for(std::slice::from_ref(&e), &e.id, &base);
            assert!(target.matches(&Foreground {
                process: "game.exe".into(),
                path: e.launch_uri.clone(),
                title: String::new()
            }));
            assert!(!target.matches(&Foreground {
                process: "javaw.exe".into(),
                path: "C:/other/game.exe".into(),
                title: "Minecraft".into()
            }));
        }
        let e = entry(games::MANUAL_SOURCE);
        let target = target_for(std::slice::from_ref(&e), &e.id, &base);
        assert!(target.matches(&Foreground {
            process: "game.exe".into(),
            path: e.launch_uri.clone(),
            title: String::new()
        }));
        assert!(!target.matches(&Foreground {
            process: "other.exe".into(),
            path: "C:/mock/game/other.exe".into(),
            title: String::new()
        }));
        let unknown = target_for(&[], "steam:unknown", &base);
        assert!(!unknown.matches(&Foreground {
            process: "javaw.exe".into(),
            path: String::new(),
            title: "Minecraft".into()
        }));
        assert!(minecraft_entry(None).is_none());
    }

    #[test]
    fn launch_watch_rejects_old_generations_and_keeps_ninety_and_three_hundred_second_limits() {
        let now = Instant::now();
        for minecraft in [false, true] {
            let mut l = launch(now, minecraft);
            let deadline = l.deadline;
            assert_eq!(
                deadline.duration_since(now).as_secs(),
                if minecraft { 300 } else { 90 }
            );
            assert!(matches!(
                l.observe(6, deadline, true, Ok(())),
                Watch::Ignore
            ));
            assert!(l.seen.is_none());
            assert!(matches!(
                l.observe(7, deadline - Duration::from_nanos(1), false, Ok(())),
                Watch::Wait
            ));
            assert!(matches!(
                l.observe(7, deadline, false, Ok(())),
                Watch::Complete {
                    state: "timeout",
                    ..
                }
            ));
            l.state = "started";
            assert!(matches!(
                l.observe(7, deadline, true, Ok(())),
                Watch::Ignore
            ));
        }
    }

    #[test]
    fn launch_focus_refusal_waits_five_seconds_then_preserves_manual_guidance() {
        let now = Instant::now();
        let mut l = launch(now, false);
        assert!(matches!(
            l.observe(7, now, true, Err("拒否".into())),
            Watch::Wait
        ));
        assert!(matches!(
            l.observe(
                7,
                now + FOCUS_WAIT - Duration::from_nanos(1),
                true,
                Err("拒否".into())
            ),
            Watch::Wait
        ));
        let Watch::Complete { state, message } =
            l.observe(7, now + FOCUS_WAIT, true, Err("拒否".into()))
        else {
            panic!("手動案内が必要")
        };
        assert_eq!(state, "started");
        assert!(message.contains("拒否。手動で前面にしてください"));
        let mut l = launch(now, false);
        assert!(matches!(
            l.observe(7, now, true, Ok(())),
            Watch::Complete {
                state: "started",
                ..
            }
        ));
    }

    #[test]
    fn manual_registration_and_editing_reuse_existing_storage_and_name_rules() {
        let root = std::env::temp_dir().join(format!(
            "recooplay-service-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let exe = root.join("test.exe");
        std::fs::write(&exe, b"test").unwrap();
        let fake = Arc::new(FakeBackend {
            root: root.clone(),
            calls: Mutex::new(vec![]),
        });
        let service = GameService::with_backend(fake.clone());
        let id = service.register(exe.clone()).unwrap();
        assert_eq!(service.register(exe), Err("このゲームは登録済みです"));
        assert_eq!(service.edit("steam:123", Some("変更".into())), None);
        assert_eq!(
            service.edit(&format!("manual:{id}"), Some("\n\0".into())),
            None
        );
        assert_eq!(
            service.edit(
                &format!("manual:{id}"),
                Some(format!("\n {}\0 ", "名".repeat(80)))
            ),
            Some("rename")
        );
        let file = service.roots().manual.unwrap();
        let list = games::load_manual(&file);
        assert_eq!(list[0].name, "名".repeat(60));
        assert_eq!(service.edit(&format!("manual:{id}"), None), Some("remove"));
        assert!(games::load_manual(&file).is_empty());
        assert!(fake.calls.lock().unwrap().is_empty());
        let pick = root.join("pick.txt");
        std::fs::write(&pick, "  \n ").unwrap();
        assert!(service.pick(true, Some(pick)).is_none());
    }
}
