// セッションの中枢。役割・進行・入力の順序制御・キー/マウスの出力キュー・視点の補間を
// 1 本の専用スレッドで処理する (Node 版 server.js と同じ仕様・同じメッセージ形式)。
// すべての状態変更はこのスレッドだけが行うのでロック不要。タイマーもこのスレッドで回す (視点は 4ms 刻み)。

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap, HashMap, VecDeque};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::config::Config;
use crate::controls::{self, Kind, OUTPUTS};
use crate::keybinds::{self, Keybinds};
use crate::profiles::{self, Profile};
use crate::focus::{self, Foreground, Target};
use crate::games::{self, Entry};
use crate::input::Input;
use crate::rtc::{Peer, RtcSignal};

// 参加枠は P1〜P4 (#57)。2〜4人で遊び、人数は Ready の時点で接続している人数で決める (#105)
const MAX_SLOTS: usize = 4;
const MIN_PLAYERS: usize = 2;
const SLOT_NAMES: [&str; MAX_SLOTS] = ["P1", "P2", "P3", "P4"];
// 枠の既定の表示 (Minecraft を 3〜4人で遊ぶときの担当)。実際の担当は分担 (game.assigned) で決まる
const SLOT_ROLES: [&str; MAX_SLOTS] = ["移動・ホスト", "視点", "アクション", "持ち物"];
/// 通信契約の版 (docs/architecture/protocol.md)。変えるときは protocol.md とシミュレーションも同時に更新する
// PC アプリで選べるゲーム (apps/web-static/app-view.js の GAMES と同じ id)。P0 は Minecraft Java Edition のみ。
// "pseudo-game" は診断用の疑似ゲーム画面 (/game) で、PC アプリの一覧には出さない (ゲーム変更の試験にも使う)
const TITLES: [&str; 2] = ["minecraft-java", "pseudo-game"];
// PC アプリ (apps/desktop) の実行ファイル名。前面になったら PC アプリへの手動復帰とみなす
const DESKTOP_PROCESS: &str = "recooplay-desktop.exe";
const DEFAULT_TITLE: &str = TITLES[0];
const PROTOCOL_VERSION: u64 = 4;
const CLOSE_PROTOCOL_VERSION: u16 = 4005;
const CLOSE_BAD_TOKEN: u16 = 4006;
const HEARTBEAT_TIMEOUT_MS: u64 = 4000; // この時間メッセージが来なければ切断扱い
const MIN_HOLD_MS: u64 = 60; // 押下は最低この時間続ける (ゲームは 50ms ごとに入力を読む)
const MIN_GAP_MS: u64 = 50; // 解放も最低この時間続けてから次を押す (連打を 1 回ずつ認識させる)
const MAX_QUEUE: usize = 8; // 通信が詰まって溜まった連打は 4 回分まで (それ以上は古い方を捨てる)
const LOOK_TICK: Duration = Duration::from_millis(4);
const RTC_TIMEOUT: Duration = Duration::from_secs(5);
const FOCUS_CHECK: Duration = Duration::from_millis(100); // 前面のウィンドウを確認する間隔
const LAUNCH_POLL: Duration = Duration::from_millis(500); // 起動したゲームのウィンドウを探す間隔
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(90); // ランチャーの更新などを待つ上限。過ぎたら手動起動を案内する
const FOCUS_WAIT: Duration = Duration::from_secs(5); // ウィンドウが現れてから前面になるのを待つ上限

// ---------- 外部とのやり取り ----------

pub enum Out {
    Text(String),
    Close(u16, String),
    Terminate,
}

pub enum Event {
    WsOpen { id: u64, tx: UnboundedSender<Out>, ip: String, loopback: bool },
    WsText { id: u64, text: String },
    WsClosed { id: u64, code: u16 },
    RtcDescription { slot: usize, gen: u64, sdp: String, kind: String },
    RtcCandidate { slot: usize, gen: u64, cand: String, mid: String },
    RtcState { slot: usize, gen: u64, state: RtcSignal },
    RtcMessage { slot: usize, gen: u64, text: String },
    /// 緊急停止 (PC のホットキー / デスクトップアプリ)。全解放して注入を OFF にする
    EmergencyStop { source: &'static str },
    /// 試験用: 前面のウィンドウが入力先かどうかを差し替える (DRY_RUN のときだけ)
    FakeTarget(bool),
    /// 既定の音の出力先が Bluetooth か (#131)。実機では定期的に調べ、試験では標準入力の "bt on/off" で差し替える
    BluetoothAudio(bool),
    /// ファイル選択の画面で選ばれた実行ファイル (#49。キャンセルなら None)
    ManualPicked(Option<PathBuf>),
    /// 試験用: PC アプリのウィンドウが前面になった・外れた (DRY_RUN のときだけ。実際は前面のプロセス名で判定する)
    FakeAppWindow(bool),
    /// インストール済みのゲームを探し終えた (別スレッドから)
    GamesDetected(games::Detected),
    /// ランチャーへの起動要求が終わった (別スレッドから。Err は理由)
    Launched { gen: u64, result: Result<(), String> },
    Shutdown,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Timer {
    LookTick,
    LookReport,
    Heartbeat,
    FocusCheck,
    StateFlush,
    Pump(usize, u64),       // (出力の番号, 世代)
    RtcTimeout(usize, u64), // (スロット, 世代)
    LaunchWatch(u64),       // 起動の世代
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn dry_run() -> bool {
    std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1")
}

/// 一覧から選んだゲームの起動の見届け (#93)。state は launching / started / failed / timeout
struct Launch {
    id: String,
    name: String,
    state: &'static str,
    message: String,
    gen: u64,
    deadline: Instant,
    seen: Option<Instant>, // ゲームのウィンドウを最初に見つけた時刻
}

// ---------- 状態 ----------

#[derive(PartialEq, Eq, Clone, Copy)]
enum Page {
    Host,
    Game,
    App, // PC アプリの画面 (/app)。前面になったことを focus で知らせる
}

enum Role {
    Unknown,
    Monitor { page: Page, focused: bool },
    Player { slot: usize },
}

struct Conn {
    tx: UnboundedSender<Out>,
    ip: String,
    loopback: bool,
    role: Role,
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Via {
    Ws,
    Rtc,
}

impl Via {
    fn name(self) -> &'static str {
        match self {
            Via::Ws => "ws",
            Via::Rtc => "rtc",
        }
    }
}

struct Slot {
    client_id: String,
    token: String, // 再接続用。サーバーが発行する 128bit の乱数 (ログ・PC 画面には出さない)
    conn: Option<u64>,
    connected: bool,
    ip: Option<String>,
    ua: Option<String>,
    connected_at: Option<u64>,
    last_seen: u64,
    reconnects: u64,
    pressed: BTreeSet<String>,
    last_seq: i64,
    events: u64,
    lost: u64,
    out_of_order: u64,
    client_stats: Value,
    // 受信の途切れの観測 (#131)。net_recent は直近 10 秒の (途切れの回数, 最大の空白 ms)
    arrivals: crate::netwatch::Arrivals,
    net_recent: (u32, u64),
    rtc: Option<Peer>,
    rtc_gen: u64,
    rtc_state: &'static str,
    next_iseq: i64, // 次に処理する入力番号 (WebSocket / WebRTC のどちらで届いても番号順に 1 回だけ処理する)
    ibuf: BTreeMap<i64, (Value, Via)>,
    via_ws: u64,
    via_rtc: u64,
    look_seq: i64,
    remote_seq: u64,
    look_cx: f64, // 視点の累積移動量 (パケットが欠けても次のパケットで取り戻せる)
    look_cy: f64,
    look_lost: u64,
}

impl Slot {
    fn new(client_id: String, token: String) -> Self {
        Slot {
            client_id,
            token,
            conn: None,
            connected: false,
            ip: None,
            ua: None,
            connected_at: None,
            last_seen: 0,
            reconnects: 0,
            pressed: BTreeSet::new(),
            last_seq: 0,
            events: 0,
            lost: 0,
            out_of_order: 0,
            client_stats: Value::Null,
            arrivals: crate::netwatch::Arrivals::default(),
            net_recent: (0, 0),
            rtc: None,
            rtc_gen: 0,
            rtc_state: "none",
            next_iseq: 1,
            ibuf: BTreeMap::new(),
            via_ws: 0,
            via_rtc: 0,
            look_seq: 0,
            remote_seq: 0,
            look_cx: 0.0,
            look_cy: 0.0,
            look_lost: 0,
        }
    }
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Phase {
    Lobby,
    Preparing,
    Coop,
    Paused,
}

impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Lobby => "lobby",
            Phase::Preparing => "preparing",
            Phase::Coop => "coop",
            Phase::Paused => "paused",
        }
    }
    fn parse(s: &str) -> Option<Phase> {
        match s {
            "lobby" => Some(Phase::Lobby),
            "preparing" => Some(Phase::Preparing),
            "coop" => Some(Phase::Coop),
            "paused" => Some(Phase::Paused),
            _ => None,
        }
    }
}

/// 決定したメンバーと分担 (#109)。分担はゲームと参加者から決まるので、この 2 つを照合すれば古い決定を使わない
#[derive(Clone, PartialEq)]
struct Lineup {
    title: String,
    // 席順に並べたメンバー (入れ替えると一致しなくなる)
    members: Vec<usize>,
}

struct Game {
    host_ready: bool,
    prepare_status: String,
    phase: Phase,
    required: u64,
    reason: Option<String>,
    // 切断による一時停止は、全員がこの時間内に戻れば自動で協力プレイに復帰する (ホストの PAUSE は対象外)
    auto_resume: bool,
    auto_resume_ms: u64,
    auto_resume_until: u64,
    // 進行が変わるたびに増やす番号。入力・視点に付けて送らせ、古い状態のときに送られたものを新しい状態で処理しない
    epoch: u64,
    // PC アプリで選んだゲーム (表示先)。入力の許可 (進行・注入モード・入力先) とは別に持つ
    title: String,
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum InjectMode {
    Off,
    Test,
    On,
}

impl InjectMode {
    fn name(self) -> &'static str {
        match self {
            InjectMode::Off => "off",
            InjectMode::Test => "test",
            InjectMode::On => "on",
        }
    }
    fn parse(s: &str) -> Option<InjectMode> {
        match s {
            "off" => Some(InjectMode::Off),
            "test" => Some(InjectMode::Test),
            "on" => Some(InjectMode::On),
            _ => None,
        }
    }
}

/// キー / マウスボタンごとの状態。複数人が同じ出力を押していれば全員離すまで押したまま。
/// 押下・解放はキューに積み、最低押下時間・最低解放時間を守って 1 つずつ実行する。
#[derive(Default)]
struct OutputState {
    holders: BTreeSet<&'static str>,
    physical: bool,
    changed_at: Option<Instant>,
    queue: VecDeque<(bool, &'static str)>,
    timer_gen: u64,
    timer_pending: bool,
}

/// 視点 (P2) の補間。届いた量を「未消化分」に積み、4ms ごとに一定割合ずつ流す。
/// 流す速さ (時定数) は直近 2 秒の到着の途切れに合わせて自動調整する。
struct Look {
    slot: &'static str, // 視点を動かしている枠 (分担で変わる、#105)
    px: f64,
    py: f64,
    fx: f64,
    fy: f64,
    sum_x: i64,
    sum_y: i64,
    n: u64,
    last_tick: Instant,
    last_arrive: Option<Instant>,
    gaps: VecDeque<(Instant, f64)>,
    tau: f64,
    min_ms: f64,
    max_ms: f64,
}

pub struct Hub {
    tx: Sender<Event>,
    input: Input,
    log_file: BufWriter<File>,
    conns: HashMap<u64, Conn>,
    slots: [Option<Slot>; MAX_SLOTS],
    game: Game,
    inject: InjectMode,
    outputs: Vec<OutputState>,
    look: Look,
    timers: BinaryHeap<Reverse<(Instant, u64, Timer)>>,
    timer_seq: u64,
    state_pending: bool,
    hotkey: Result<(), String>, // 緊急停止ホットキーの登録結果 (ダッシュボードに表示する)
    // 常時 ON の入力先 (前面のウィンドウが選んだゲームのときだけ注入する)。
    // base_target は Minecraft の条件 (config.json)、一覧で選んだゲームはそのインストール先
    target: Target,
    base_target: Target,
    games: Vec<Entry>,
    // 一覧のタイルの画像 (項目 ID → 場所)。HTTP の /api/game-image と共有する (#121)
    images: games::Images,
    // Minecraft のランチャーを見つけたか (Some(画像があるか))。見つからなければ None (#128)
    minecraft: Option<bool>,
    // 通信の途切れへの対策 (#131): 協力プレイ中の Wi-Fi のメディアストリーミングモード、Bluetooth の音の出力
    // 手動登録のファイル選択の画面を出している途中か・探し直しを待っているか (#49)
    picking: bool,
    rescan_pending: bool,
    streaming: crate::netwatch::StreamingMode,
    low_latency: bool,
    bluetooth_audio: bool,
    net_tick: u64,
    games_scanning: bool,
    launch: Option<Launch>,
    launch_gen: u64,
    target_fg: Option<Foreground>,
    target_ok: bool,
    fake_target: Option<bool>, // 試験用 (DRY_RUN のときだけ)。Some なら OS に問い合わせない
    // ゲームのキー設定に合わせた、操作 → 送るキーの対応 (#101)。準備・Ready・再開のたびに読み直す
    keybinds: Keybinds,
    minecraft_options: Option<std::path::PathBuf>,
    // ゲームの操作定義 (apps/game-profiles/*.json、#97)。起動時に読み、不正なものは理由をログに残して使わない
    profiles: Vec<Profile>,
    profile: Option<Profile>,
    // 協力プレイで使う分担 (枠の番号ごとの操作 ID、#105)。Ready のときに参加者から決め、終了するまで組み直さない。
    // 操作定義がなければ空 (Minecraft の固定の表を使う)
    assigned: Vec<Vec<String>>,
    // Ready の時点で接続していた枠 (協力プレイの参加者)。後から来た人は次の Ready から参加する
    participants: Vec<usize>,
    // PC 画面でホストが決定したメンバーと分担 (#109)。今の選択・接続と一致するときだけ起動・準備・Ready を受け付ける
    lineup: Option<Lineup>,
    // 枠ごとの席順 (#47・#62)。分担の束 (移動・視点…) を席順の早い人から配る。初期値は枠の順。
    // ホストが入れ替えると束ごと交換される。終了してもリセットするまで保つ (入れ替えたまま再挑戦できる)
    seats: [usize; MAX_SLOTS],
    // 担当が変わり、本人がスマホで「確認しました」を押していない枠。押すまで Ready・再開できない
    role_ack: Vec<usize>,
    app_focused: bool,           // PC アプリが前面か (手動復帰の判定に使う)
    // PC アプリ (デスクトップアプリ) から起動されたか。そのときは前面のプロセス名で PC アプリの前面を判定し、
    // 画面 (WebView2 は背面でも focused のまま) の知らせは使わない
    desktop: bool,
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

/// ログに残す端末の種類。IP・User-Agent・clientId はログに書かない (ダッシュボードの表示は PC 本体のみ)
fn device_kind(ua: &str) -> &'static str {
    if ua.contains("iPhone") || ua.contains("iPad") {
        "iOS"
    } else if ua.contains("Android") {
        "Android"
    } else if ua.contains("Windows") {
        "Windows"
    } else {
        "other"
    }
}

/// 再接続用トークン: OS の乱数 128bit を 16 進 32 文字にする
fn new_token() -> Option<String> {
    let mut buf = [0u8; 16];
    getrandom::fill(&mut buf).ok()?;
    Some(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// 比較にかかる時間から一致した長さを推測されないよう、全体を比べてから判定する
fn token_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn num(v: &Value, key: &str) -> Option<f64> {
    match v.get(key) {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(t)) => t.trim().parse().ok(),
        _ => None,
    }
}

impl Hub {
    pub fn new(tx: Sender<Event>, config: &Config, input: Input, log_dir: &Path) -> std::io::Result<Hub> {
        std::fs::create_dir_all(log_dir)?;
        let name = format!("session-{}.jsonl", chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S-%3fZ"));
        let log_file = BufWriter::new(File::options().create(true).append(true).open(log_dir.join(name))?);
        let now = Instant::now();
        let mut hub = Hub {
            tx,
            input,
            log_file,
            conns: HashMap::new(),
            slots: [None, None, None, None],
            game: Game {
                phase: Phase::Lobby,
                host_ready: false,
                prepare_status: String::new(),
                required: MIN_PLAYERS as u64,
                reason: None,
                auto_resume: config.auto_resume,
                auto_resume_ms: config.auto_resume_ms,
                auto_resume_until: 0,
                epoch: 1,
                title: DEFAULT_TITLE.to_string(),
            },
            inject: InjectMode::parse(&config.inject_mode).unwrap_or(InjectMode::Off),
            outputs: OUTPUTS.iter().map(|_| OutputState::default()).collect(),
            look: Look {
                slot: "P2",
                px: 0.0,
                py: 0.0,
                fx: 0.0,
                fy: 0.0,
                sum_x: 0,
                sum_y: 0,
                n: 0,
                last_tick: now,
                last_arrive: None,
                gaps: VecDeque::new(),
                tau: config.look_smooth_min_ms,
                min_ms: config.look_smooth_min_ms,
                max_ms: config.look_smooth_max_ms,
            },
            timers: BinaryHeap::new(),
            timer_seq: 0,
            state_pending: false,
            hotkey: Err("未登録".into()),
            target: config.target.clone(),
            base_target: config.target.clone(),
            games: Vec::new(),
            images: games::Images::default(),
            picking: false,
            rescan_pending: false,
            streaming: crate::netwatch::StreamingMode::new(),
            low_latency: false,
            bluetooth_audio: false,
            net_tick: 0,
            minecraft: None,
            games_scanning: false,
            launch: None,
            launch_gen: 0,
            target_fg: None,
            target_ok: false,
            keybinds: Keybinds::none(),
            minecraft_options: keybinds::minecraft_override(config.minecraft_options.as_deref()),
            profiles: Vec::new(),
            profile: None,
            assigned: Vec::new(),
            participants: Vec::new(),
            lineup: None,
            seats: [0, 1, 2, 3],
            role_ack: Vec::new(),
            fake_target: std::env::var("RECOOPLAY_FAKE_TARGET")
                .ok()
                .filter(|_| std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1"))
                .map(|v| v == "1"),
            app_focused: false,
            desktop: std::env::var("RECOOPLAY_DESKTOP").as_deref() == Ok("1"),
        };
        let (mut list, errors) = profiles::load_dir(&config.profiles_dir);
        if !list.iter().any(|p| p.id == "minecraft-java") {
            list.push(profiles::builtin_minecraft()); // フォルダがない・壊れている場合も Minecraft は動かす
        }
        hub.log("profiles", json!({ "loaded": list.len(), "errors": errors }));
        hub.profiles = list;
        hub.reload_keybinds();
        hub.schedule(now + LOOK_TICK, Timer::LookTick);
        hub.schedule(now + Duration::from_millis(100), Timer::LookReport);
        hub.schedule(now + Duration::from_secs(1), Timer::Heartbeat);
        hub.schedule(now, Timer::FocusCheck);
        hub.scan_games();
        Ok(hub)
    }

    /// イベントループ。次のタイマーまでイベントを待ち、期限が来たタイマーを処理する
    /// 一覧のタイルの画像の表 (HTTP の /api/game-image と共有する)
/// 準備・協力プレイ・一時停止の間だけ Wi-Fi のメディアストリーミングモードを有効にする (#131)。
    /// dry-run では Windows の機能を呼ばず、状態とログだけ切り替える
    fn update_low_latency(&mut self) {
        let want = self.game.phase != Phase::Lobby;
        if want == self.low_latency {
            return;
        }
        let ok = if dry_run() {
            true
        } else if want {
            self.streaming.enable()
        } else {
            self.streaming.disable();
            true
        };
        // 使えない環境 (Wi-Fi がない・拒否された) では有効にしたことにせず、次の機会にまた試す
        if want && !ok {
            return;
        }
        self.low_latency = want;
        self.log("low_latency", json!({ "on": want }));
        self.push_state();
    }

    /// 10 秒ごとに、スマホごとの受信の途切れと往復時間をログに残す (#131)。IP・端末の識別子は残さない
    fn report_net(&mut self) {
        let mut rows = Vec::new();
        for i in 0..MAX_SLOTS {
            let Some(s) = self.slots[i].as_mut().filter(|s| s.connected) else { continue };
            let (stalls, max_stall) = s.arrivals.take();
            s.net_recent = (stalls, max_stall);
            let st = &s.client_stats;
            rows.push(json!({ "slot": SLOT_NAMES[i], "stalls": stalls, "maxStallMs": max_stall,
                "rttAvg": st.get("avg"), "rttMax": st.get("max"), "path": st.get("path") }));
        }
        if !rows.is_empty() {
            self.log("net", json!({ "slots": rows, "bluetoothAudio": self.bluetooth_audio, "lowLatency": self.low_latency }));
        }
    }

    pub fn images(&self) -> games::Images {
        self.images.clone()
    }

    pub fn run(mut self, rx: Receiver<Event>, port: u16) {
        if !dry_run() {
            let tx = self.tx.clone();
            let _ = std::thread::Builder::new().name("bluetooth-audio".into()).spawn(move || {
                let mut last = None;
                loop {
                    let on = crate::netwatch::bluetooth_audio().unwrap_or(false);
                    if last != Some(on) {
                        last = Some(on);
                        if tx.send(Event::BluetoothAudio(on)).is_err() {
                            break;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(5));
                }
            });
        }
        self.log("server_start", json!({ "port": port }));
        loop {
            let now = Instant::now();
            while let Some(Reverse((at, _, timer))) = self.timers.peek().copied() {
                if at > now {
                    break;
                }
                self.timers.pop();
                self.on_timer(timer, at);
            }
            let wait = self
                .timers
                .peek()
                .map(|Reverse((at, _, _))| at.saturating_duration_since(Instant::now()))
                .unwrap_or(Duration::from_secs(1));
            match rx.recv_timeout(wait) {
                Ok(Event::Shutdown) => {
                    // 終了時は押しっぱなしを残さない
                    self.release_outputs(None);
                    self.log("shutdown", json!({}));
                    let _ = self.log_file.flush();
                    std::process::exit(0);
                }
                Ok(ev) => self.on_event(ev),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    }

    fn schedule(&mut self, at: Instant, timer: Timer) {
        self.timer_seq += 1;
        self.timers.push(Reverse((at, self.timer_seq, timer)));
    }

    // ---------- ログ ----------

    fn record(&mut self, kind: &str, data: Value) -> Value {
        let mut entry = Map::new();
        entry.insert("t".into(), json!(now_ms()));
        entry.insert("kind".into(), json!(kind));
        if let Value::Object(m) = data {
            entry.extend(m);
        }
        let entry = Value::Object(entry);
        let _ = writeln!(self.log_file, "{}", entry);
        entry
    }

    fn log(&mut self, kind: &str, data: Value) {
        let has_data = data.as_object().is_some_and(|m| !m.is_empty());
        let text = if has_data { data.to_string() } else { String::new() };
        let entry = self.record(kind, data);
        println!("[{}] {} {}", chrono::Local::now().format("%H:%M:%S"), kind, text);
        self.broadcast_monitors(&json!({ "type": "log", "entry": entry }));
    }

    // ---------- 送信 ----------

    fn send(&self, conn: Option<u64>, msg: &Value) {
        if let Some(c) = conn.and_then(|id| self.conns.get(&id)) {
            let _ = c.tx.send(Out::Text(msg.to_string()));
        }
    }

    fn close(&self, conn: Option<u64>, code: u16, reason: &str) {
        if let Some(c) = conn.and_then(|id| self.conns.get(&id)) {
            let _ = c.tx.send(Out::Close(code, reason.to_string()));
        }
    }

    fn broadcast_monitors(&self, msg: &Value) {
        let text = msg.to_string();
        for c in self.conns.values() {
            if matches!(c.role, Role::Monitor { .. }) {
                let _ = c.tx.send(Out::Text(text.clone()));
            }
        }
    }

    fn broadcast_players(&self, msg: &Value) {
        let text = msg.to_string();
        for slot in self.slots.iter().flatten() {
            if let Some(c) = slot.conn.and_then(|id| self.conns.get(&id)) {
                let _ = c.tx.send(Out::Text(text.clone()));
            }
        }
    }

    // ---------- スナップショット ----------

    fn connected_slots(&self) -> Vec<usize> {
        (0..MAX_SLOTS).filter(|&i| self.slots[i].as_ref().is_some_and(|s| s.connected)).collect()
    }

    fn ready_reasons(&self) -> Vec<String> {
        let mut reasons: Vec<String> = Vec::new();
        let connected = self.connected_slots();
        if self.game.phase == Phase::Paused && !self.participants.is_empty() {
            // 再開は Ready で決めた参加者で行う。人数を変えるときは終了して組み直す (勝手に組み直さない)
            let missing: Vec<&str> = self.participants.iter().filter(|i| !connected.contains(i)).map(|&i| SLOT_NAMES[i]).collect();
            if !missing.is_empty() {
                reasons.push(format!("{}の再接続を待っています。人数を変えるときは終了して組み直してください", missing.join("・")));
            }
        } else {
            if !connected.contains(&0) { reasons.push("ホスト（P1）の接続が必要です".into()); }
            if connected.len() < MIN_PLAYERS { reasons.push(format!("{}人以上の接続が必要です", MIN_PLAYERS)); }
            if self.profile.is_none() && !self.fixed_controls(&connected) {
                reasons.push("この人数に対応する操作定義がありません。3人（P1〜P3）で遊んでください".into());
            }
        }
        let unacked: Vec<&str> = self.role_ack.iter().filter(|i| self.role_slots().contains(i)).map(|&i| SLOT_NAMES[i]).collect();
        if !unacked.is_empty() {
            reasons.push(format!("{}が新しい担当をスマホで確認していません", unacked.join("・")));
        }
        if self.game.phase != Phase::Paused && !self.lineup_ok() {
            reasons.push("PCの画面でメンバーと分担を決定してください（参加者やゲームが変わった場合は決定し直してください）".into());
        }
        if !self.title_known(&self.game.title) { reasons.push("ゲームを選択してください".into()); }
        if self.profile.as_ref().is_some_and(|p| !profiles::controller_supported(p)) {
            reasons.push("このゲームはマウス操作が中心のため、スマホで分担できる操作がありません".into());
        }
        if !self.input.available() { reasons.push("入力ドライバーが利用できません".into()); }
        if self.hotkey.is_err() && self.fake_target.is_none() { reasons.push("PCの緊急停止キーを登録してください".into()); }
        // 入力が OFF なのは緊急停止の後か、診断で切り替えたとき。PC の前で確かめてから再開させる (#114)
        if self.inject == InjectMode::Off { reasons.push("入力が止まっています（緊急停止など）。PCの画面で「入力を再開する」を押してください".into()); }
        else if !self.can_inject() { reasons.push("対象のゲームを前面にしてください".into()); }
        reasons
    }

    fn can_prepare(&self) -> bool {
        self.game.phase == Phase::Lobby && self.connected_slots().contains(&0) && self.lineup_ok()
    }

    /// 決定したメンバーと分担が、今の選択と接続者に一致しているか
    fn lineup_ok(&self) -> bool {
        self.lineup.as_ref().is_some_and(|l| l.title == self.game.title && l.members == self.ranked(&self.connected_slots()))
    }

    /// PC 画面の「この分担で決定」。画面が見ていたゲーム・メンバーが今と一致するときだけ受け付ける
    fn confirm_lineup(&mut self, title: Option<String>, members: Vec<String>, epoch: Option<u64>) {
        let connected = self.connected_slots();
        let names: Vec<&str> = connected.iter().map(|&i| SLOT_NAMES[i]).collect();
        let accepted = matches!(self.game.phase, Phase::Lobby | Phase::Preparing)
            && epoch == Some(self.game.epoch)
            && title.as_deref() == Some(self.game.title.as_str())
            && self.title_known(&self.game.title)
            && members == names
            && connected.contains(&0)
            && connected.len() >= MIN_PLAYERS;
        self.log("lineup", json!({ "accepted": accepted, "title": self.game.title, "members": names }));
        if accepted {
            self.lineup = Some(Lineup { title: self.game.title.clone(), members: self.ranked(&connected) });
        }
        self.push_game();
    }

    /// 起動を要求できるか (決定済み・ロビーか準備中・一覧の項目・起動中でない)
    fn can_launch(&self) -> bool {
        matches!(self.game.phase, Phase::Lobby | Phase::Preparing)
            && self.lineup_ok()
            && self.games.iter().any(|g| g.id == self.game.title)
            && !self.launch.as_ref().is_some_and(|l| l.id == self.game.title && l.state == "launching")
    }

    fn can_ready(&self) -> bool {
        self.game.phase == Phase::Preparing && self.ready_reasons().is_empty()
    }

    fn can_resume(&self) -> bool {
        self.game.phase == Phase::Paused && self.game.host_ready && self.ready_reasons().is_empty()
    }

    fn game_snapshot(&self) -> Value {
        let connected_idx = self.connected_slots();
        let connected: Vec<&str> = connected_idx.iter().map(|&i| SLOT_NAMES[i]).collect();
        json!({
            "phase": self.game.phase.name(),
            "required": self.game.required,
            "maxPlayers": MAX_SLOTS,
            // Ready で決めた参加者 (ロビー・準備中は空)
            "participants": self.participants.iter().map(|&i| SLOT_NAMES[i]).collect::<Vec<_>>(),
            // Minecraft の固定の画面 (P1 移動・P2 視点・P3 アクション) を使うか。使わなければ分担から作った画面
            // PC 画面で決定したメンバーと分担 (#109)。lineupOk は今の選択・接続と一致しているか
            "lineup": self.lineup.as_ref().map(|l| json!({ "title": l.title, "members": l.members.iter().map(|&i| SLOT_NAMES[i]).collect::<Vec<_>>() })),
            "lineupOk": self.lineup_ok(),
            // 枠 → 担当 (席順の番号を P1〜 で表す。Minecraft の固定の画面はこの担当の画面を出す、#47)
            "roleOf": self.role_slots().iter().filter_map(|&i| self.role_rank(i).map(|k| (SLOT_NAMES[i].to_string(), json!(SLOT_NAMES[k])))).collect::<Map<String, Value>>(),
            "roleAck": self.role_ack.iter().map(|&i| SLOT_NAMES[i]).collect::<Vec<_>>(),
            "canSwap": matches!(self.game.phase, Phase::Lobby | Phase::Preparing) || (self.game.phase == Phase::Paused && !self.participants.is_empty()),
            "canLaunch": self.can_launch(),
            "fixedControls": self.fixed_controls(if self.participants.is_empty() { &connected_idx } else { &self.participants }),
            "reason": self.game.reason,
            "autoResume": self.game.auto_resume,
            "autoResumeMs": self.game.auto_resume_ms,
            "autoResumeUntil": self.game.auto_resume_until,
            "epoch": self.game.epoch,
            "title": self.game.title,
            "connected": connected,
            // 操作 → 実際に送るキー (ゲームのキー設定に合わせる)。スマホ・PC 画面のキー表示に使う
            "keys": self.keys_snapshot(),
            // 選んだゲームの操作定義の要約と分担の案 (#97)
            "profile": self.profile.as_ref().map(|p| {
                let mut v = profiles::snapshot(p, connected_idx.len().max(1));
                // 分担の案は、今接続している枠の名前で示す (P3 が空いていて P4 がいる場合など)
                v["assignment"] = self.slot_map(&self.proposal(p));
                v
            }),
            // 今の協力プレイで使っている分担 (Ready・再開のときに決めたもの)
            "assigned": self.assigned_snapshot(),
            "canPrepare": self.can_prepare(),
            "canReady": self.can_ready(),
            "canResume": self.can_resume(),
            "hostReady": self.game.host_ready,
            "readyReasons": self.ready_reasons(),
            "prepareStatus": self.game.prepare_status,
            "titleName": self.game_name(),
            "launch": self.launch.as_ref().map(|l| json!({ "id": l.id, "state": l.state, "message": l.message })),
            "remoteRoute": if self.remote_app_active() { "app" } else if self.remote_game_active() { "game" } else { "none" },
            // 入力が PC に届く状態か (注入モード・入力先のウィンドウ)。スマホに「届いていない」ことを知らせる
            "inputActive": self.can_inject(),
            "inputTarget": self.inject == InjectMode::On && !self.target_ok,
        })
    }

    fn slot_snapshot(&self) -> Value {
        Value::Array(
            (0..MAX_SLOTS)
                .map(|i| match &self.slots[i] {
                    None => json!({ "name": SLOT_NAMES[i], "role": SLOT_ROLES[i], "assigned": false }),
                    Some(s) => json!({
                        "name": SLOT_NAMES[i],
                        "role": SLOT_ROLES[i],
                        "assigned": true,
                        "connected": s.connected,
                        "ip": s.ip,
                        "ua": s.ua,
                        "connectedAt": s.connected_at,
                        "lastSeen": s.last_seen,
                        "reconnects": s.reconnects,
                        "pressed": s.pressed,
                        "events": s.events,
                        "lost": s.lost,
                        "outOfOrder": s.out_of_order,
                        "clientStats": s.client_stats,
                        "rtcState": s.rtc_state,
                        "via": { "ws": s.via_ws, "rtc": s.via_rtc },
                        "lookLost": s.look_lost,
                        // 直近 10 秒の受信の途切れ (#131)
                        "net": { "stalls": s.net_recent.0, "maxStallMs": s.net_recent.1 },
                    }),
                })
                .collect(),
        )
    }

    fn game_focused(&self) -> bool {
        self.conns.values().any(|c| matches!(c.role, Role::Monitor { page: Page::Game, focused: true }))
    }

    fn can_inject(&self) -> bool {
        self.title_known(&self.game.title) && self.input.available()
            && match self.inject {
                InjectMode::Off => false,
                InjectMode::Test => self.game_focused(),
                // 常時 ON でも、前面のウィンドウが入力先 (Minecraft) のときだけ
                InjectMode::On => self.target_ok,
            }
    }

    fn inject_snapshot(&self) -> Value {
        let outputs: Map<String, Value> = OUTPUTS
            .iter()
            .map(|o| (o.id.to_string(), json!({ "label": o.label, "kind": o.kind.name(), "code": o.code })))
            .collect();
        let down: Vec<&str> =
            OUTPUTS.iter().zip(&self.outputs).filter(|(_, st)| st.physical).map(|(o, _)| o.id).collect();
        json!({
            "mode": self.inject.name(),
            "gameFocused": self.game_focused(),
            "active": self.can_inject(),
            "available": self.input.available(),
            "error": self.input.error(),
            "minHoldMs": MIN_HOLD_MS,
            "emergencyHotkey": crate::hotkey::LABEL,
            "emergencyHotkeyError": self.hotkey.as_ref().err(),
            "target": {
                "ok": self.target_ok,
                "expect": self.target.describe(),
                "process": self.target_fg.as_ref().map(|f| f.process.clone()),
                "title": self.target_fg.as_ref().map(|f| f.title.clone()),
                "fake": self.fake_target.is_some(),
            },
            "minGapMs": MIN_GAP_MS,
            "outputs": outputs,
            "down": down,
        })
    }

    fn push_state(&self) {
        self.broadcast_monitors(&json!({
            "type": "state",
            "slots": self.slot_snapshot(),
            "now": now_ms(),
            "game": self.game_snapshot(),
            "inject": self.inject_snapshot(),
            // インストール済みのゲーム一覧は PC 画面にだけ送る (スマホには選んだゲームしか出さない)
            "games": self.games.iter().map(Entry::snapshot).collect::<Vec<_>>(),
            "gamesScanning": self.games_scanning,
            // 通信の状態 (#131): Bluetooth で音を出しているか、Wi-Fi の低遅延の動作 (メディアストリーミングモード) が有効か
            "network": { "bluetoothAudio": self.bluetooth_audio, "lowLatency": self.low_latency },
            // Minecraft のランチャーを見つけたか・画像があるか (#128)。場所は送らない
            "minecraft": { "detected": self.minecraft.is_some(), "image": self.minecraft == Some(true) },
        }));
    }

    fn push_state_throttled(&mut self) {
        if self.state_pending {
            return;
        }
        self.state_pending = true;
        self.schedule(Instant::now() + Duration::from_millis(100), Timer::StateFlush);
    }

    fn push_game(&self) {
        let msg = json!({ "type": "game", "game": self.game_snapshot() });
        self.broadcast_players(&msg);
        self.broadcast_monitors(&msg);
    }

    // ---------- 進行 ----------
    // lobby: ホストがリモコンで PC を操作 / coop: 3 人の分担操作 / paused: 分担操作を停止しホストにリモコンを戻す

    fn set_phase(&mut self, phase: Phase, reason: &str) {
        if self.game.phase == phase {
            return;
        }
        self.release_outputs(None);
        self.reset_look();
        self.game.phase = phase;
        if phase == Phase::Lobby { self.assigned.clear(); self.participants.clear(); self.lineup = None; }
        self.game.reason = Some(reason.to_string());
        self.advance_epoch();
        self.log("phase", json!({ "phase": phase.name(), "reason": reason, "epoch": self.game.epoch }));
        self.update_low_latency();
        self.push_game();
    }

    fn maybe_auto_resume(&mut self) {
        let by_disconnect = self.game.reason.as_deref().is_some_and(|r| r.ends_with("disconnected"));
        if self.game.phase != Phase::Paused || !by_disconnect || !self.game.auto_resume {
            return;
        }
        if now_ms() > self.game.auto_resume_until {
            return;
        }
        // WebRTC の接続中は待つ (つながるか、失敗して WebSocket のみになってから復帰)
        let rtc_settled = self
            .connected_slots()
            .into_iter()
            .all(|i| self.slots[i].as_ref().is_some_and(|s| s.rtc_state != "connecting"));
        if self.can_resume() && rtc_settled {
            self.set_phase(Phase::Coop, "auto resume");
        }
    }

    fn command(&mut self, slot: usize, cmd: &str) {
        if slot != 0 {
            return;
        }
        let name = self.game_name();
        let accepted = match (cmd, self.game.phase) {
            ("OPEN_GAME", Phase::Preparing | Phase::Paused) => {
                self.game.prepare_status = if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
                    "dry-run：実ウィンドウは操作しません".into()
                } else { match crate::focus::activate(&self.target) {
                    Ok(()) => "対象ゲームを前面にしました".into(),
                    Err(reason) => format!("{}。{}を手動で前面にしてください", reason, name),
                }};
                self.push_game(); true
            }
            ("PREPARE", Phase::Lobby) if self.can_prepare() => {
                self.game.host_ready = false;
                self.game.prepare_status = if self.fake_target.is_some() {
                    "シミュレーション：実ゲームは起動していません".into()
                } else if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
                    format!("dry-run：{}を手動で開いてください", name)
                } else {
                    match crate::focus::activate(&self.target) {
                        Ok(()) => format!("{}のウィンドウを前面にしました。ワールドを準備してください", name),
                        Err(reason) => format!("{}。{}を手動で開き、ワールドを準備してください", reason, name),
                    }
                };
                self.reload_keybinds();
                self.set_phase(Phase::Preparing, "host prepare"); true
            }
            ("READY", Phase::Preparing) if self.can_ready() => {
                self.reload_keybinds();
                self.fix_assignment();
                self.game.host_ready = true;
                self.set_phase(Phase::Coop, "host ready"); true
            }
            // 再開は Ready で決めた参加者・分担のまま (参加者がそろうまで再開できない)
            ("RESUME", Phase::Paused) if self.can_resume() => { self.reload_keybinds(); self.set_phase(Phase::Coop, "host resume"); true }
            ("PAUSE", Phase::Coop | Phase::Paused) => {
                self.game.auto_resume_until = 0;
                self.game.reason = Some("host pause".into());
                if self.game.phase == Phase::Paused { self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game(); }
                else { self.set_phase(Phase::Paused, "host pause"); } true
            }
            ("END", p) if p != Phase::Lobby => {
                self.game.host_ready = false;
                self.game.auto_resume_until = 0;
                self.set_phase(Phase::Lobby, "host end"); true
            }
            _ => false,
        };
        self.send(self.slots[slot].as_ref().and_then(|s| s.conn), &json!({
            "type": "command_result", "cmd": cmd, "accepted": accepted,
            "reasons": if accepted { vec![] } else { self.ready_reasons() },
        }));
    }

    /// その操作を今このスロットが使えるか → 出力の番号
    fn resolve_control(&self, slot: usize, control: &str) -> Option<usize> {
        let id = if self.game.phase == Phase::Coop && control.starts_with("act:") {
            if !self.uses_generated_controls() { return None; }
            // 操作定義から生成した操作画面 (#60): 分担で割り当てた操作だけ、ゲームのキー設定に合わせて送る
            self.action_output(slot, control)
        } else if self.game.phase == Phase::Coop {
            // 操作定義の画面を使うゲームでは、Minecraft 用の固定の操作は送らない (別のゲームで別の操作が動くため)
            if self.uses_generated_controls() {
                return None;
            }
            // 担当の確認は固定の表で行い、送るキーはゲームのキー設定に合わせる (送れないキーは送らない)
            if !self.participants.contains(&slot) { return None; }
            // 固定の表は担当 (席順) で引く。入れ替えた人は入れ替えた先の操作を送る
            let default = controls::role_control(SLOT_NAMES[self.role_rank(slot)?], control)?;
            self.keybinds.output_for(control).unwrap_or(Some(default))
        } else if slot == 0 && self.remote_game_active() {
            let default = controls::remote_control(control)?;
            // メニューでの「持ち物」はインベントリのキー (Minecraft の設定に合わせる)
            if control == "REMOTE_E" { self.keybinds.output_for("INV").unwrap_or(Some(default)) } else { Some(default) }
        } else {
            None
        }?;
        OUTPUTS.iter().position(|o| o.id == id)
    }

    /// 選んだゲームの操作定義を引き、ユーザーのキー設定を読み直して重ねる (#97・#99)。定義がなければ固定の表を使う
    fn reload_keybinds(&mut self) {
        // 定義のない検出したゲームには汎用の定義を当てる (#123)。Minecraft の固定の表を別のゲームへ送らない
        self.profile = profiles::find(&self.profiles, &self.game.title).cloned().or_else(|| {
            self.games.iter().find(|g| g.id == self.game.title).map(|g| profiles::generic(&g.id, &g.name))
        });
        self.keybinds = match &self.profile {
            Some(p) => {
                let over = if p.id == "minecraft-java" { self.minecraft_options.as_deref() } else { None };
                Keybinds::build(p, over)
            }
            None => Keybinds::none(),
        };
        if self.profile.as_ref().is_some_and(|p| !profiles::controller_supported(p)) {
            self.keybinds.warnings.push("このゲームはマウス操作が中心のため、スマホで分担できる操作がありません".into());
        }
        // ファイルの場所 (ユーザー名を含む) はログに残さない
        self.log("keybinds", json!({ "source": self.keybinds.source, "warnings": self.keybinds.warnings }));
    }

    fn keys_snapshot(&self) -> Value {
        let controls: Map<String, Value> = self
            .keybinds
            .controls
            .iter()
            .map(|(c, o)| {
                let v = o.and_then(controls::output).map_or(Value::Null, |out| json!({ "out": out.id, "label": out.label }));
                (c.to_string(), v)
            })
            .collect();
        // 定義の操作 ID → 実際に送るキー (生成した操作画面のキー表示に使う)
        let actions: Map<String, Value> = self
            .keybinds
            .actions
            .iter()
            .map(|(a, o)| (a.clone(), o.and_then(controls::output).map_or(Value::Null, |out| json!({ "out": out.id, "label": out.label }))))
            .collect();
        json!({ "source": self.keybinds.source, "warnings": self.keybinds.warnings, "controls": controls, "actions": actions })
    }

    /// 今接続している枠に、参加人数と操作定義から分担の案を作る (#105)。枠の番号ごと (参加していない枠は空)
    fn proposal(&self, p: &Profile) -> Vec<Vec<String>> {
        self.proposal_for(p, &self.connected_slots())
    }

    /// slots の人に分担を配る。席順の早い人から、優先度の高い操作 (移動・視点…) の束を配る
    fn proposal_for(&self, p: &Profile, slots: &[usize]) -> Vec<Vec<String>> {
        let ranked = self.ranked(slots);
        let mut out = vec![Vec::new(); MAX_SLOTS];
        for (k, a) in profiles::assignment_for(p, ranked.len().max(1)).into_iter().enumerate() {
            if let Some(&i) = ranked.get(k) { out[i] = a; }
        }
        out
    }

    /// 枠を席順に並べる
    fn ranked(&self, slots: &[usize]) -> Vec<usize> {
        let mut v = slots.to_vec();
        v.sort_by_key(|&i| self.seats[i]);
        v
    }

    /// 担当を決める対象の枠 (協力プレイの参加者、なければ接続中の枠)
    fn role_slots(&self) -> Vec<usize> {
        if self.participants.is_empty() { self.connected_slots() } else { self.participants.clone() }
    }

    /// その枠の担当の番号 (席順で何番目か)。Minecraft の固定の表では 0 = 移動 (P1 の表)、1 = 視点、2 = アクション
    fn role_rank(&self, slot: usize) -> Option<usize> {
        self.ranked(&self.role_slots()).iter().position(|&i| i == slot)
    }

    /// 2 人の担当を入れ替える (#47)。開始前 (ロビー・準備中) と一時停止中だけ。全解放して epoch を進め、
    /// 2 人がスマホで新しい担当を確認するまで Ready・再開できない。ロビーでは分担の決定もやり直しになる
    fn swap_roles(&mut self, a: usize, b: usize) {
        let set = match self.game.phase {
            Phase::Lobby | Phase::Preparing => self.connected_slots(),
            Phase::Paused if !self.participants.is_empty() => self.participants.clone(),
            _ => return,
        };
        if a == b || !set.contains(&a) || !set.contains(&b) {
            return;
        }
        self.seats.swap(a, b);
        self.release_outputs(None);
        self.reset_look();
        self.advance_epoch();
        if self.game.phase == Phase::Paused {
            if let Some(p) = self.profile.clone() {
                self.assigned = self.proposal_for(&p, &self.participants.clone());
            }
            self.game.auto_resume_until = 0;
        }
        for i in [a, b] {
            if !self.role_ack.contains(&i) { self.role_ack.push(i); }
        }
        self.log("swap_roles", json!({ "a": SLOT_NAMES[a], "b": SLOT_NAMES[b], "phase": self.game.phase.name() }));
        self.push_game();
        self.push_state();
    }

    /// Ready の時点の参加者と分担を確定する。定義がなければ分担は空 (固定の表を使う)
    fn fix_assignment(&mut self) {
        self.participants = self.connected_slots();
        self.assigned = match &self.profile {
            Some(p) => self.proposal(p),
            None => Vec::new(),
        };
        let players: Vec<&str> = self.participants.iter().map(|&i| SLOT_NAMES[i]).collect();
        self.log("assignment", json!({ "players": players, "assigned": self.slot_map(&self.assigned) }));
    }

    /// 枠の番号ごとの分担 → { "P1": [...], ... } (担当のない枠は出さない)
    fn slot_map(&self, by_slot: &[Vec<String>]) -> Value {
        let m: Map<String, Value> = by_slot.iter().enumerate().filter(|(_, a)| !a.is_empty()).map(|(i, a)| (SLOT_NAMES[i].to_string(), json!(a))).collect();
        Value::Object(m)
    }

    fn assigned_snapshot(&self) -> Value {
        self.slot_map(&self.assigned)
    }

    /// Minecraft の固定の画面と表を使うか。実機で確かめた 3人 (P1〜P3) のときだけ使い、
    /// 2人・4人や枠が飛んでいる場合は操作定義の分担から作った画面にする (#57・#105)
    fn fixed_controls(&self, players: &[usize]) -> bool {
        let three = players == [0, 1, 2];
        match &self.profile {
            // 定義がないのは診断用の疑似ゲーム画面だけ (検出したゲームには汎用の定義を当てる)
            None => three && self.game.title == "pseudo-game",
            Some(p) => p.id == "minecraft-java" && three,
        }
    }

    /// 操作定義から作った画面を使うか (分担が決まっていて、固定の画面を使わない)
    fn uses_generated_controls(&self) -> bool {
        !self.assigned.is_empty() && !self.fixed_controls(&self.participants)
    }

    /// この枠に割り当てた操作か
    fn is_assigned(&self, slot: usize, action: &str) -> bool {
        self.assigned.get(slot).is_some_and(|a| a.iter().any(|x| x == action))
    }

    /// この枠が視点 (マウス移動) を担当しているか。分担がなければ従来どおり P2
    fn owns_look(&self, slot: usize) -> bool {
        match (&self.profile, self.assigned.is_empty()) {
            (Some(p), false) => p.actions.iter().any(|a| a.kind == "mouseDelta" && self.is_assigned(slot, &a.id)),
            _ => self.role_rank(slot) == Some(1),
        }
    }

    /// 生成した操作画面の入力 "act:<操作ID>" (ホイールは "act:<操作ID>:up|down") → 出力の ID。割り当てた操作だけ通す
    fn action_output(&self, slot: usize, control: &str) -> Option<&'static str> {
        let rest = control.strip_prefix("act:")?;
        let exact = self.profile.as_ref()?.actions.iter().any(|a| a.id == rest);
        let (id, dir) = match rest.rsplit_once(':') {
            Some((id, d)) if !exact && (d == "up" || d == "down") => (id, Some(d)),
            _ => (rest, None),
        };
        if !self.is_assigned(slot, id) {
            return None;
        }
        let action = self.profile.as_ref()?.actions.iter().find(|a| a.id == id)?;
        match (action.kind.as_str(), dir) {
            ("wheel", Some("up")) => Some("WHEEL_UP"),
            ("wheel", Some("down")) => Some("WHEEL_DOWN"),
            ("button", None) => self.keybinds.actions.iter().find(|(a, _)| a == id).and_then(|(_, o)| *o),
            _ => None,
        }
    }

    // ---------- 入力注入 ----------

    fn apply_output(&mut self, idx: usize, down: bool, slot: &str) {
        let o = &OUTPUTS[idx];
        let ok = match o.kind {
            Kind::Key { scan, ext } => self.input.key(scan, ext, down),
            Kind::Mouse { left } => self.input.mouse_button(left, down),
            Kind::Wheel { .. } => false,
        };
        let entry = self.record(
            "inject",
            json!({ "slot": slot, "out": o.id, "label": o.label, "state": if down { "down" } else { "up" }, "ok": ok }),
        );
        self.broadcast_monitors(&json!({ "type": "inject", "entry": entry }));
    }

    fn pump(&mut self, idx: usize) {
        if self.outputs[idx].timer_pending {
            return;
        }
        loop {
            let st = &mut self.outputs[idx];
            let Some(&(down, slot)) = st.queue.front() else { return };
            if down == st.physical {
                st.queue.pop_front();
                continue;
            }
            let min = Duration::from_millis(if st.physical { MIN_HOLD_MS } else { MIN_GAP_MS });
            let elapsed = st.changed_at.map(|t| t.elapsed()).unwrap_or(Duration::MAX);
            if elapsed < min {
                st.timer_pending = true;
                st.timer_gen += 1;
                let at = Instant::now() + (min - elapsed);
                let gen = st.timer_gen;
                self.schedule(at, Timer::Pump(idx, gen));
                return;
            }
            st.queue.pop_front();
            st.physical = down;
            st.changed_at = Some(Instant::now());
            self.apply_output(idx, down, slot);
        }
    }

    fn set_output(&mut self, idx: usize, slot: &'static str, down: bool) {
        let st = &mut self.outputs[idx];
        let before = !st.holders.is_empty();
        if down {
            st.holders.insert(slot);
        } else {
            st.holders.remove(slot);
        }
        let after = !st.holders.is_empty();
        if before == after {
            return;
        }
        // キューは押下/解放が交互に並ぶので、古い方から 1 組ずつ捨てれば整合は崩れない
        let mut dropped = 0;
        while st.queue.len() >= MAX_QUEUE {
            st.queue.drain(..2);
            dropped += 1;
        }
        st.queue.push_back((after, slot));
        for _ in 0..dropped {
            self.record("queue_drop", json!({ "out": OUTPUTS[idx].id, "slot": slot }));
        }
        self.pump(idx);
    }

    /// 切断・停止時: 押しっぱなしのキーを即座に離す (slot = None なら全員分)
    fn release_outputs(&mut self, slot: Option<&'static str>) {
        for idx in 0..OUTPUTS.len() {
            let st = &mut self.outputs[idx];
            match slot {
                Some(s) => {
                    st.holders.remove(s);
                }
                None => st.holders.clear(),
            }
            if !st.holders.is_empty() {
                continue;
            }
            st.timer_pending = false;
            st.timer_gen += 1; // 予約済みのタイマーを無効化
            st.queue.clear();
            if st.physical {
                st.physical = false;
                st.changed_at = Some(Instant::now());
                self.apply_output(idx, false, slot.unwrap_or("system"));
            }
        }
    }

    fn handle_control(&mut self, slot: usize, control: &str, state: &str) {
        // 経路はサーバーの前面判定で排他的に決める。WebViewのhasFocusだけでは決めない。
        if slot == 0 && self.game.phase != Phase::Coop && controls::remote_control(control).is_some() && self.remote_app_active() {
            self.broadcast_monitors(&json!({ "type": "remote", "route":"app", "epoch":self.game.epoch, "control": control, "state": state }));
            return;
        }
        let Some(idx) = self.resolve_control(slot, control) else { return };
        let down = state == "down";
        let o = &OUTPUTS[idx];
        if let Kind::Wheel { notches } = o.kind {
            if !down || !self.can_inject() {
                return;
            }
            let ok = self.input.wheel(notches);
            let entry = self.record(
                "inject",
                json!({ "slot": SLOT_NAMES[slot], "out": o.id, "label": o.label, "state": "down", "ok": ok }),
            );
            self.broadcast_monitors(&json!({ "type": "inject", "entry": entry }));
            return;
        }
        // 押下は注入可能な時だけ受け付ける。解放は常に通す (押しっぱなしを残さない)
        if down && !self.can_inject() {
            return;
        }
        self.set_output(idx, SLOT_NAMES[slot], down);
    }

    fn remote_app_active(&self) -> bool {
        if self.game.phase == Phase::Coop { return false; }
        if self.desktop { return self.app_focused; }
        let page = self.conns.values().any(|c| matches!(c.role, Role::Monitor {page:Page::App,focused:true}));
        page && (self.fake_target.is_some() || crate::focus::foreground().is_some_and(|f|
            ["msedge.exe", "chrome.exe", "firefox.exe"].contains(&f.process.as_str()) && f.title.contains("Re:Cooplay")))
    }

    fn remote_game_active(&self) -> bool {
        matches!(self.game.phase, Phase::Preparing | Phase::Paused) && !self.remote_app_active() && self.can_inject()
            && (self.hotkey.is_ok() || self.fake_target.is_some())
    }

    fn remote_message(&mut self, idx: usize, msg: &Value) {
        if idx != 0 || self.game.phase == Phase::Coop || msg.get("epoch").and_then(Value::as_u64) != Some(self.game.epoch) { return; }
        let seq = msg.get("rseq").and_then(Value::as_u64).unwrap_or(0);
        let slot = self.slots[idx].as_mut().unwrap();
        if seq <= slot.remote_seq { return; }
        slot.remote_seq = seq;
        let kind = s(msg, "kind").unwrap_or_default();
        if kind == "release" {
            self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game(); return;
        }
        let x = msg.get("dx").and_then(Value::as_f64).filter(|n| n.is_finite()).unwrap_or(0.0).clamp(-120.0,120.0);
        let y = msg.get("dy").and_then(Value::as_f64).filter(|n| n.is_finite()).unwrap_or(0.0).clamp(-120.0,120.0);
        if !matches!(kind.as_str(), "move" | "scroll") { return; }
        if self.remote_app_active() {
            self.broadcast_monitors(&json!({"type":"remote","route":"app","epoch":self.game.epoch,"kind":kind,"dx":x,"dy":y}));
        } else if self.remote_game_active() {
            // スクロール量に合わせてホイールを 1〜3 段送る (40px で 1 段、#122)。下へのスクロールはホイールの負の向き
            let notches = if kind == "scroll" { ((y.abs() / 40.0).ceil() as i32).clamp(0, 3) * if y > 0.0 { -1 } else { 1 } } else { 0 };
            let ok = if kind == "move" { self.input.mouse_move(x.round() as i32,y.round() as i32) } else { self.input.wheel(notches) };
            let entry = self.record("remote_input",json!({"kind":kind,"dx":x,"dy":y,"notches":notches,"ok":ok}));
            self.broadcast_monitors(&json!({"type":"remote_input","entry":entry}));
        }
    }

    fn handle_look(&mut self, slot: usize, dx: f64, dy: f64) {
        if self.game.phase != Phase::Coop || !self.owns_look(slot) || !self.can_inject() {
            return;
        }
        let now = Instant::now();
        let look = &mut self.look;
        look.slot = SLOT_NAMES[slot];
        if let Some(prev) = look.last_arrive {
            let gap = now.duration_since(prev).as_secs_f64() * 1000.0;
            if gap < 1000.0 {
                look.gaps.push_back((now, gap));
            }
        }
        look.last_arrive = Some(now);
        // 直近 2 秒のドラッグ中で一番長い途切れに合わせる (まとめて届く端末は平均だと間隔が短く見えるため最大値を使う)
        while look.gaps.front().is_some_and(|(at, _)| now.duration_since(*at) > Duration::from_secs(2)) {
            look.gaps.pop_front();
        }
        let max_gap = look.gaps.iter().map(|(_, g)| *g).fold(0.0, f64::max);
        look.tau = (max_gap * 0.5).clamp(look.min_ms, look.max_ms);
        look.px += dx;
        look.py += dy;
    }

    fn reset_look(&mut self) {
        let l = &mut self.look;
        l.px = 0.0;
        l.py = 0.0;
        l.fx = 0.0;
        l.fy = 0.0;
    }

    fn look_tick(&mut self) {
        let now = Instant::now();
        let dt = now.duration_since(self.look.last_tick).as_secs_f64() * 1000.0;
        self.look.last_tick = now;
        if self.look.px == 0.0 && self.look.py == 0.0 {
            return;
        }
        if self.game.phase != Phase::Coop || !self.can_inject() {
            return self.reset_look();
        }
        let l = &mut self.look;
        // 未消化分が 0.5px 未満なら残りを全部流して終わらせる
        let k = 1.0 - (-dt / l.tau).exp();
        let small = l.px.abs() < 0.5 && l.py.abs() < 0.5;
        let ox = if small { l.px } else { l.px * k };
        let oy = if small { l.py } else { l.py * k };
        l.px -= ox;
        l.py -= oy;
        l.fx += ox;
        l.fy += oy;
        let ix = l.fx.trunc();
        let iy = l.fy.trunc();
        l.fx -= ix;
        l.fy -= iy;
        if ix != 0.0 || iy != 0.0 {
            self.input.mouse_move(ix as i32, iy as i32);
            self.look.sum_x += ix as i64;
            self.look.sum_y += iy as i64;
            self.look.n += 1;
        }
    }

    pub fn set_hotkey_status(&mut self, status: Result<(), String>) {
        self.record("hotkey", json!({ "key": crate::hotkey::LABEL, "ok": status.is_ok(), "error": status.as_ref().err() }));
        self.hotkey = status;
    }

    /// 緊急停止: 最低押下時間・連打キューより優先して全キー・マウスボタンを離し、視点の未処理分を捨て、注入を OFF にする。
    /// 協力プレイ中なら一時停止へ移す (停止理由は切断ではないので自動復帰しない)
    fn emergency_stop(&mut self, source: &str) {
        self.release_outputs(None);
        self.reset_look();
        self.inject = InjectMode::Off;
        self.game.auto_resume_until = 0;
        if self.game.phase == Phase::Coop {
            self.set_phase(Phase::Paused, "emergency stop");
        } else {
            // 切断待ちのpaused中でも停止理由を上書きし、自動復帰を確実に解除する。
            self.game.reason = Some("emergency stop".into());
            self.advance_epoch();
            self.push_game();
        }
        self.log("emergency_stop", json!({ "source": source }));
        self.push_state();
    }

    /// 前面のウィンドウが入力先かを確認する。外れたら (常時 ON で注入中なら) 全キーを離し、PC 画面とスマホに知らせる
    fn check_target(&mut self) {
        let (fg, ok) = match self.fake_target {
            Some(ok) => (None, ok),
            None => {
                let fg = focus::foreground();
                let ok = fg.as_ref().is_some_and(|f| self.target.matches(f));
                // PC アプリ (デスクトップアプリ) が前面か。WebView2 の画面は背面になっても blur を受け取らないため、
                // 手動復帰の判定は前面のプロセス名で行う
                if self.desktop {
                    let app = fg.as_ref().is_some_and(|f| f.process.eq_ignore_ascii_case(DESKTOP_PROCESS));
                    self.on_app_focus(app);
                }
                (fg, ok)
            }
        };
        if ok != self.target_ok {
            self.target_ok = ok;
            if self.inject == InjectMode::On {
                self.release_outputs(None);
                self.reset_look();
                // 外れた時も戻った時も、通信中・受信待ちの旧入力と視点を持ち越さない。
                self.advance_epoch();
            }
            // ウィンドウのタイトル (ワールド名など) はログに残さない
            self.log("target_focus", json!({ "ok": ok, "process": fg.as_ref().map(|f| f.process.clone()) }));
            self.target_fg = fg;
            self.push_game();
            self.push_state();
        } else if fg != self.target_fg {
            self.target_fg = fg;
            self.push_state_throttled();
        }
    }

    // ---------- ゲームの一覧・選択・起動 (#54・#93) ----------

    /// 選べるゲーム: 固定の Minecraft・診断用の疑似ゲームと、検出したゲーム
    fn title_known(&self, title: &str) -> bool {
        TITLES.contains(&title) || self.games.iter().any(|g| g.id == title)
    }

    fn game_name(&self) -> String {
        match self.games.iter().find(|g| g.id == self.game.title) {
            Some(g) => g.name.clone(),
            None if self.game.title == "pseudo-game" => "疑似ゲーム画面".into(),
            None => "Minecraft".into(),
        }
    }

    fn select_title(&mut self, title: String) {
        if title == self.game.title {
            return;
        }
        self.game.title = title;
        self.game.host_ready = false;
        self.launch = None;
        self.assigned.clear();
        self.participants.clear();
        // 選び直したら決定をやり直す (元のゲームに戻しても古い決定で起動しない、#109)
        self.lineup = None;
        self.reload_keybinds();
        self.log("select_game", json!({ "title": self.game.title }));
        self.apply_target();
        // ゲームを変えたら全解放してロビー (ホストのリモコン) へ戻る。参加者と役割はそのまま
        if self.game.phase != Phase::Lobby {
            self.set_phase(Phase::Lobby, "game change");
        } else {
            self.push_game();
        }
    }

    /// 入力先を選んだゲームに合わせる。一覧のゲームはインストール先のフォルダ内のプロセスだけを対象にする
    fn apply_target(&mut self) {
        self.target = match self.games.iter().find(|g| g.id == self.game.title) {
            Some(g) if g.source == games::MANUAL_SOURCE => Target::executable(Path::new(&g.launch_uri)),
            Some(g) => Target::install_dir(&g.install_dir),
            None if TITLES.contains(&self.game.title.as_str()) => self.base_target.clone(),
            // 一覧から消えたゲームをMinecraftへ読み替えて送らない。
            None => Target { processes: vec![], title_contains: String::new(), dir: None, executable: None },
        };
        self.check_target();
        self.push_state();
    }

    /// インストール済みのゲームを別スレッドで探す (ディスクの読み取りで視点の刻みを止めない)。
    /// 試験 (dry-run) では RECOOPLAY_FAKE_GAMES のフォルダを Steam・Epic の代わりに読む
    fn roots() -> games::Roots {
        match std::env::var_os("RECOOPLAY_FAKE_GAMES") {
            Some(dir) if dry_run() => games::Roots::fake(Path::new(&dir)),
            _ => games::Roots::system(),
        }
    }

    fn scan_games(&mut self) {
        if self.games_scanning {
            // 探している途中で登録が変わったら、終わった後にもう一度探す
            self.rescan_pending = true;
            return;
        }
        let roots = Self::roots();
        let tx = self.tx.clone();
        let spawned = std::thread::Builder::new().name("games".into()).spawn(move || {
            let _ = tx.send(Event::GamesDetected(games::detect(&roots)));
        });
        self.games_scanning = spawned.is_ok();
        self.push_state();
    }

    // ---------- 手動で登録したアプリ (#49・#56) ----------

    /// PC 画面の「＋ 追加」。PC の前の人が Windows のファイル選択の画面で .exe を選ぶ (場所を画面から受け取らない)。
    /// 試験 (dry-run) では画面を出さず、RECOOPLAY_FAKE_PICK のファイルに書いた場所を選んだことにする (空ならキャンセル)
    fn pick_manual_game(&mut self) {
        if self.picking {
            return;
        }
        self.picking = true;
        let tx = self.tx.clone();
        let fake = if dry_run() { std::env::var_os("RECOOPLAY_FAKE_PICK").map(PathBuf::from) } else { None };
        let spawned = std::thread::Builder::new().name("pick".into()).spawn(move || {
            let picked = if dry_run() {
                fake.and_then(|f| std::fs::read_to_string(f).ok()).map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).map(PathBuf::from)
            } else {
                games::pick_exe()
            };
            let _ = tx.send(Event::ManualPicked(picked));
        });
        if spawned.is_err() {
            self.picking = false;
        }
    }

    fn manual_result(&self, ok: bool, message: &str) {
        self.broadcast_monitors(&json!({ "type": "manual_result", "ok": ok, "message": message }));
    }

    fn on_manual_picked(&mut self, picked: Option<PathBuf>) {
        self.picking = false;
        let Some(exe) = picked else { return };
        let Some(file) = Self::roots().manual else { return self.manual_result(false, "登録先のフォルダが見つかりません") };
        if let Err(e) = games::manual_exe_ok(&exe) {
            return self.manual_result(false, e);
        }
        let mut list = games::load_manual(&file);
        let id = games::manual_id(&exe);
        if list.iter().any(|g| g.id == id) {
            return self.manual_result(false, "このゲームは登録済みです");
        }
        let name = exe.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "ゲーム".into());
        list.push(games::ManualGame { id: id.clone(), name, exe });
        match games::save_manual(&file, &list) {
            Ok(()) => {
                // ゲーム名・場所はログに残さない (ID だけ)
                self.log("manual_game", json!({ "action": "add", "id": format!("manual:{id}") }));
                self.manual_result(true, "登録しました。一覧に「手動登録」として並びます");
                self.scan_games();
            }
            Err(_) => self.manual_result(false, "登録を保存できませんでした"),
        }
    }

    /// 名前の変更・登録の解除 (PC 画面から)。name が None なら解除
    fn edit_manual_game(&mut self, id: &str, name: Option<String>) {
        let Some(key) = id.strip_prefix("manual:") else { return };
        let Some(file) = Self::roots().manual else { return };
        let mut list = games::load_manual(&file);
        let Some(i) = list.iter().position(|g| g.id == key) else { return };
        let action = match name {
            Some(n) => {
                let n: String = n.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(60).collect();
                if n.is_empty() {
                    return;
                }
                list[i].name = n;
                "rename"
            }
            None => {
                list.remove(i);
                "remove"
            }
        };
        if games::save_manual(&file, &list).is_ok() {
            self.log("manual_game", json!({ "action": action, "id": id }));
            self.scan_games();
        }
    }

    fn on_games_detected(&mut self, detected: games::Detected) {
        let list = detected.games;
        // Minecraft のランチャー (#128)。一覧には混ぜず、画面の固定の項目に画像を付けるためだけに使う
        self.minecraft = detected.minecraft.as_ref().map(|m| m.image.is_some());
        self.games_scanning = false;
        if std::mem::take(&mut self.rescan_pending) {
            self.scan_games();
        }
        // ゲーム名・インストール先はログに残さない (件数だけ)
        let count = |src: &str| list.iter().filter(|g| g.source == src).count();
        self.log("games_detected", json!({ "steam": count("steam"), "epic": count("epic"), "registered": count(games::MANUAL_SOURCE) }));
        if let Ok(mut images) = self.images.lock() {
            *images = list.iter().filter_map(|g| g.image.clone().map(|p| (g.id.clone(), p))).collect();
            if let Some(p) = detected.minecraft.and_then(|m| m.image) {
                images.insert("minecraft-java".into(), p);
            }
        }
        let previous = self.games.iter().find(|g| g.id == self.game.title).map(|g| g.install_dir.clone());
        let next = list.iter().find(|g| g.id == self.game.title).map(|g| g.install_dir.clone());
        self.games = list;
        if !TITLES.contains(&self.game.title.as_str()) && previous != next {
            // 再検出で対象が消えたり場所が変わったら、全解放し旧入力・起動待ちを破棄する。
            self.release_outputs(None);
            self.reset_look();
            self.game.auto_resume_until = 0;
            self.launch = None;
            if self.game.phase == Phase::Coop {
                self.set_phase(Phase::Paused, if next.is_none() { "game unavailable" } else { "game target changed" });
            } else {
                self.advance_epoch();
            }
        }
        // 一覧に戻っても自動再開せず、明示操作と現在の入力先を確認する。
        self.apply_target();
        self.push_game();
    }

    /// 一覧の項目を起動する。画面からは id だけを受け取り、起動方法は検出時に確かめた値から組み立てる
    /// 起動はゲームの選択 → メンバー・分担の決定の後だけ (#109)。選んでいるゲームと違う id・決定前の要求は起動しない
    fn launch_game(&mut self, id: &str) {
        let Some(entry) = self.games.iter().find(|g| g.id == id).cloned() else {
            // Minecraft など、一覧のランチャー起動に対応していない項目や未知の id は起動しない
            let message = if TITLES.contains(&id) { "このゲームは自動で起動できません。手動で起動してください" } else { "一覧にないゲームです" };
            self.finish_launch(id, id, "failed", message.into());
            return;
        };
        if !matches!(self.game.phase, Phase::Lobby | Phase::Preparing) {
            self.finish_launch(&entry.id, &entry.name, "failed", "協力プレイ中・一時停止中は起動できません。終了してから起動してください".into());
            return;
        }
        if entry.id != self.game.title || !self.lineup_ok() {
            self.log("launch_reject", json!({ "id": entry.id, "selected": entry.id == self.game.title }));
            self.finish_launch(&entry.id, &entry.name, "failed", "ゲームを選び、メンバーと分担を決定してから起動してください".into());
            return;
        }
        // 起動中の重複要求 (連打) は無視する
        if self.launch.as_ref().is_some_and(|l| l.id == entry.id && l.state == "launching") {
            self.log("launch_duplicate", json!({ "id": entry.id }));
            return;
        }
        // 起動済みの前面化も含め、対象を切り替える前に全解放して旧入力・視点を破棄する。
        self.release_outputs(None);
        self.reset_look();
        self.advance_epoch();
        // すでに起動している (ウィンドウがある) ときは、起動し直さず前面にする
        if !dry_run() && (self.target_ok || focus::exists(&self.target)) {
            let message = match focus::activate(&self.target) {
                Ok(()) => format!("{}はすでに起動しています。前面にしました。準備してReadyを押すと開始します", entry.name),
                Err(reason) => format!("{}はすでに起動しています（{}）。手動で前面にしてください", entry.name, reason),
            };
            self.log("launch_result", json!({ "id": entry.id, "state": "started", "running": true }));
            self.finish_launch(&entry.id, &entry.name, "started", message);
            return;
        }
        self.launch_gen += 1;
        let gen = self.launch_gen;
        let message = if dry_run() { format!("dry-run：{}は起動しません", entry.name) } else { format!("{}を起動しています", entry.name) };
        self.log("launch_game", json!({ "id": entry.id, "source": entry.source }));
        // ランチャーへの要求 (ShellExecuteW) は Steam の起動待ちで数秒かかる (実機で約5秒)。
        // このスレッドで待つと入力・生存確認が止まり切断扱いになるので、別スレッドで行う
        if !dry_run() {
            let tx = self.tx.clone();
            let target = entry.clone();
            let spawned = std::thread::Builder::new().name("launch".into()).spawn(move || {
                let _ = tx.send(Event::Launched { gen, result: games::launch(&target) });
            });
            if spawned.is_err() {
                self.finish_launch(&entry.id, &entry.name, "failed", format!("起動できませんでした。{}を手動で起動してください", entry.name));
                return;
            }
        }
        self.launch = Some(Launch { id: entry.id, name: entry.name, state: "launching", message, gen, deadline: Instant::now() + LAUNCH_TIMEOUT, seen: None });
        self.schedule(Instant::now() + LAUNCH_POLL, Timer::LaunchWatch(gen));
        self.push_game();
        self.push_state();
    }

    fn on_launched(&mut self, gen: u64, result: Result<(), String>) {
        let Some(l) = self.launch.as_ref().filter(|l| l.gen == gen && l.state == "launching") else { return };
        let (id, name) = (l.id.clone(), l.name.clone());
        self.log("launch_request", json!({ "id": id, "ok": result.is_ok() }));
        if let Err(reason) = result {
            self.finish_launch(&id, &name, "failed", format!("{}。{}を手動で起動してください", reason, name));
        }
    }

    fn finish_launch(&mut self, id: &str, name: &str, state: &'static str, message: String) {
        self.launch_gen += 1;
        self.launch = Some(Launch { id: id.into(), name: name.into(), state, message, gen: self.launch_gen, deadline: Instant::now(), seen: None });
        self.push_game();
        self.push_state();
    }

    /// 起動したゲームのウィンドウが現れたら前面にする。期限までに現れなければ手動起動を案内する
    fn watch_launch(&mut self, gen: u64) {
        let Some(l) = self.launch.as_ref().filter(|l| l.gen == gen && l.state == "launching") else { return };
        let (id, name, deadline) = (l.id.clone(), l.name.clone(), l.deadline);
        // 試験 (dry-run) では前面の判定の差し替え (target on) を「ウィンドウが現れた」とみなす
        let appeared = match self.fake_target {
            Some(ok) => ok,
            None => !dry_run() && (self.target_ok || focus::exists(&self.target)),
        };
        let (state, message) = if appeared {
            // 既に前面ならそのまま (ゲームは自分で前面に出ることが多い)。背面なら前面にする。
            // Windows は背面のプログラムからの前面化を拒むことがあるが、直後にゲームやランチャーが自分で前面に出ることが
            // 多い (実機で観測)。拒否されても FOCUS_WAIT の間は待ち、それでも前面にならなければ手動を案内する
            let result = if self.fake_target.is_some() || self.target_ok { Ok(()) } else { focus::activate(&self.target) };
            let seen = *self.launch.as_mut().unwrap().seen.get_or_insert_with(Instant::now);
            match result {
                Ok(()) => ("started", format!("{}を前面にしました。ホストが準備してReadyを押すと開始します", name)),
                Err(_) if seen.elapsed() < FOCUS_WAIT => {
                    self.schedule(Instant::now() + LAUNCH_POLL, Timer::LaunchWatch(gen));
                    return;
                }
                Err(reason) => ("started", format!("{}は起動しましたが、{}。手動で前面にしてください", name, reason)),
            }
        } else if Instant::now() >= deadline {
            ("timeout", format!("{}の起動を確認できませんでした。ランチャーの画面（更新・ログイン・確認）を確かめ、手動で起動してください", name))
        } else {
            self.schedule(Instant::now() + LAUNCH_POLL, Timer::LaunchWatch(gen));
            return;
        };
        self.log("launch_result", json!({ "id": id, "state": state }));
        if let Some(l) = self.launch.as_mut() {
            l.state = state;
            l.message = message;
        }
        self.check_target();
        self.push_game();
        self.push_state();
    }

    fn set_inject_mode(&mut self, mode: InjectMode) {
        if self.inject != mode { self.release_outputs(None); self.reset_look(); self.advance_epoch(); }
        self.inject = mode;
        self.log("inject_mode", json!({ "mode": mode.name() }));
        self.push_game();
        self.push_state();
    }

    fn on_focus_change(&mut self) {
        if !self.can_inject() {
            self.release_outputs(None);
        }
        self.push_state();
    }

    /// PC画面へ手動復帰したら停止する。切断待ちで既にpausedの場合も自動復帰を取り消す。
    fn pause_for_app_return(&mut self) {
        if self.game.phase == Phase::Coop {
            self.game.auto_resume_until = 0;
            self.set_phase(Phase::Paused, "app focus");
        } else if self.game.phase == Phase::Paused
            && self.game.reason.as_deref().is_some_and(|r| r.ends_with("disconnected"))
        {
            self.release_outputs(None);
            self.reset_look();
            self.game.auto_resume_until = 0;
            self.game.reason = Some("app focus".to_string());
            self.advance_epoch();
            self.push_game();
        } else {
            return;
        }
        self.push_state();
    }

    /// デスクトップの前面判定の変化。画面接続ごとのfocus通知とは別に保持する。
    fn on_app_focus(&mut self, f: bool) {
        if f == self.app_focused {
            return;
        }
        self.release_outputs(None); self.reset_look(); self.advance_epoch();
        self.app_focused = f;
        self.push_game();
        self.record("app_focus", json!({ "focused": f }));
        if f {
            self.pause_for_app_return();
        }
    }

    fn mark_disconnected(&mut self, idx: usize, reason: &str) {
        let Some(s) = self.slots[idx].as_mut() else { return };
        if !s.connected {
            return;
        }
        s.connected = false;
        s.conn = None;
        let released: Vec<String> = std::mem::take(&mut s.pressed).into_iter().collect();
        self.release_outputs(Some(SLOT_NAMES[idx]));
        self.log("disconnect", json!({ "slot": SLOT_NAMES[idx], "reason": reason, "released": released }));
        if self.game.phase == Phase::Preparing {
            self.release_outputs(None);
            self.reset_look();
            self.advance_epoch();
        }
        // 協力プレイ中に誰かが切れたら共同入力を止める (ホストの自動交代はしない)
        let paused_by_disconnect = self.game.phase == Phase::Paused
            && self.game.reason.as_deref().is_some_and(|r| r.ends_with("disconnected"));
        // Ready の後に来た (参加していない) 人の切断では止めない
        let participant = self.participants.contains(&idx);
        if participant && (self.game.phase == Phase::Coop || paused_by_disconnect) {
            // 期限は協力プレイから止まった時に始め、期限内に別の人が切れたときだけ延ばす。
            // 期限を過ぎた後の切断や、再接続による接続の置き換え (replaced) では延ばさない (期限後は明示の RESUME まで再開しない)
            let now = now_ms();
            if self.game.phase == Phase::Coop || (reason != "replaced" && now <= self.game.auto_resume_until) {
                self.game.auto_resume_until = now + self.game.auto_resume_ms;
            }
            if self.game.phase == Phase::Coop {
                self.set_phase(Phase::Paused, &format!("{} disconnected", SLOT_NAMES[idx]));
            } else {
                self.push_game();
            }
        } else {
            self.push_game();
        }
        self.push_state();
    }

    // ---------- タイマー ----------

    fn on_timer(&mut self, timer: Timer, at: Instant) {
        match timer {
            Timer::LookTick => {
                self.look_tick();
                let next = (at + LOOK_TICK).max(Instant::now());
                self.schedule(next, Timer::LookTick);
            }
            Timer::LookReport => {
                // 視点の移動量は 100ms ごとにまとめて通知 / 記録
                if self.look.n > 0 {
                    let entry = self.record(
                        "inject_look",
                        json!({ "slot": self.look.slot, "dx": self.look.sum_x, "dy": self.look.sum_y, "n": self.look.n, "smoothMs": self.look.tau.round() }),
                    );
                    self.broadcast_monitors(&json!({ "type": "look", "entry": entry }));
                    self.look.sum_x = 0;
                    self.look.sum_y = 0;
                    self.look.n = 0;
                }
                self.schedule(at + Duration::from_millis(100), Timer::LookReport);
            }
            Timer::FocusCheck => {
                self.check_target();
                self.schedule(at + FOCUS_CHECK, Timer::FocusCheck);
            }
            Timer::Heartbeat => {
                // 協力プレイ中以外は、ゲームのキー設定が変わっていたら読み直す (#99)
                if self.game.phase != Phase::Coop && self.keybinds.changed() {
                    self.release_outputs(None);
                    self.reset_look();
                    self.advance_epoch();
                    self.reload_keybinds();
                    self.push_game();
                }
                // Wi-Fi を切られた場合 TCP の close はすぐ来ないので、アプリ層の ping 途絶で切断を判定する
                let now = now_ms();
                for i in 0..MAX_SLOTS {
                    let stale = self.slots[i]
                        .as_ref()
                        .filter(|s| s.connected && now.saturating_sub(s.last_seen) > HEARTBEAT_TIMEOUT_MS)
                        .map(|s| s.conn);
                    if let Some(conn) = stale {
                        self.mark_disconnected(i, "heartbeat timeout");
                        if let Some(c) = conn.and_then(|id| self.conns.get(&id)) {
                            let _ = c.tx.send(Out::Terminate);
                        }
                    }
                }
                self.update_low_latency();
                self.net_tick += 1;
                if self.net_tick % 10 == 0 {
                    self.report_net();
                }
                self.push_state();
                let _ = self.log_file.flush();
                self.schedule(at + Duration::from_secs(1), Timer::Heartbeat);
            }
            Timer::StateFlush => {
                self.state_pending = false;
                self.push_state();
            }
            Timer::Pump(idx, gen) => {
                let st = &mut self.outputs[idx];
                if st.timer_pending && st.timer_gen == gen {
                    st.timer_pending = false;
                    self.pump(idx);
                }
            }
            Timer::RtcTimeout(idx, gen) => {
                // つながらなければ WebSocket のみで続行 (自動復帰も待たせない)
                let timed_out = self.slots[idx].as_mut().filter(|s| s.rtc_gen == gen && s.rtc_state == "connecting");
                if let Some(s) = timed_out {
                    s.rtc_state = "failed";
                    self.log("rtc", json!({ "slot": SLOT_NAMES[idx], "state": "timeout" }));
                    self.push_state();
                    self.maybe_auto_resume();
                }
            }
            Timer::LaunchWatch(gen) => self.watch_launch(gen),
        }
    }

    // ---------- イベント ----------

    fn on_event(&mut self, ev: Event) {
        match ev {
            Event::WsOpen { id, tx, ip, loopback } => {
                self.conns.insert(id, Conn { tx, ip, loopback, role: Role::Unknown });
            }
            Event::WsText { id, text } => {
                if let Ok(msg) = serde_json::from_str::<Value>(&text) {
                    self.on_ws_message(id, msg);
                }
            }
            Event::WsClosed { id, code } => self.on_ws_closed(id, code),
            Event::RtcDescription { slot, gen, sdp, kind } => {
                if let Some(conn) = self.rtc_owner(slot, gen) {
                    self.send(Some(conn), &json!({ "type": "rtc-answer", "sdp": sdp, "sdpType": kind }));
                }
            }
            Event::RtcCandidate { slot, gen, cand, mid } => {
                if let Some(conn) = self.rtc_owner(slot, gen) {
                    self.send(Some(conn), &json!({ "type": "rtc-cand", "cand": cand, "mid": mid }));
                }
            }
            Event::RtcState { slot, gen, state } => self.on_rtc_state(slot, gen, state),
            Event::RtcMessage { slot, gen, text } => {
                if self.rtc_owner(slot, gen).is_some() {
                    if let Ok(msg) = serde_json::from_str::<Value>(&text) {
                        self.handle_player_message(slot, msg, Via::Rtc);
                    }
                }
            }
            Event::EmergencyStop { source } => self.emergency_stop(source),
            Event::ManualPicked(picked) => self.on_manual_picked(picked),
            Event::BluetoothAudio(on) => {
                if self.bluetooth_audio != on {
                    self.bluetooth_audio = on;
                    self.log("bluetooth_audio", json!({ "on": on }));
                    self.push_state();
                }
            }
            Event::FakeTarget(ok) => {
                if self.fake_target.is_some() {
                    self.fake_target = Some(ok);
                    self.check_target();
                }
            }
            Event::FakeAppWindow(f) => {
                // 試験では、この知らせが来たら PC アプリから起動された扱いにする
                if self.fake_target.is_some() {
                    self.desktop = true;
                    self.on_app_focus(f);
                }
            }
            Event::GamesDetected(list) => self.on_games_detected(list),
            Event::Launched { gen, result } => self.on_launched(gen, result),
            Event::Shutdown => {}
        }
    }

    /// 今も有効な WebRTC 接続ならその持ち主の WebSocket 接続
    fn rtc_owner(&self, slot: usize, gen: u64) -> Option<u64> {
        self.slots[slot].as_ref().filter(|s| s.rtc.is_some() && s.rtc_gen == gen).and_then(|s| s.conn)
    }

    fn on_rtc_state(&mut self, idx: usize, gen: u64, state: RtcSignal) {
        if self.rtc_owner(idx, gen).is_none() {
            return;
        }
        let s = self.slots[idx].as_mut().unwrap();
        let prev = s.rtc_state;
        s.rtc_state = match state {
            RtcSignal::ChannelOpen => "open",
            RtcSignal::ChannelClosed | RtcSignal::Failed | RtcSignal::Closed => "failed",
        };
        if prev != s.rtc_state {
            let st = s.rtc_state;
            self.log("rtc", json!({ "slot": SLOT_NAMES[idx], "state": st }));
            self.push_state();
            self.maybe_auto_resume();
        }
    }

    fn on_ws_closed(&mut self, id: u64, code: u16) {
        let Some(conn) = self.conns.remove(&id) else { return };
        match conn.role {
            Role::Monitor { page: Page::Game, .. } => self.on_focus_change(),
            Role::Player { slot } => {
                if self.slots[slot].as_ref().is_some_and(|s| s.conn == Some(id)) {
                    let s = self.slots[slot].as_mut().unwrap();
                    s.rtc = None;
                    s.rtc_state = "none";
                    self.mark_disconnected(slot, &format!("close {}", code));
                }
            }
            _ => {}
        }
    }

    fn on_ws_message(&mut self, id: u64, msg: Value) {
        let Some(conn) = self.conns.get(&id) else { return };
        let kind = s(&msg, "type").unwrap_or_default();

        if kind == "monitor" {
            if !matches!(conn.role, Role::Unknown) {
                return self.close(Some(id), 4007, "already identified");
            }
            if !conn.loopback {
                return self.close(Some(id), 4003, "monitor only from PC");
            }
            let page = match s(&msg, "page").as_deref() {
                Some("game") => Page::Game,
                Some("app") => Page::App,
                _ => Page::Host,
            };
            self.conns.get_mut(&id).unwrap().role = Role::Monitor { page, focused: false };
            return self.push_state();
        }

        match conn.role {
            Role::Monitor { page, focused } => self.on_monitor_message(id, page, focused, &kind, &msg),
            _ if kind == "hello" => self.on_hello(id, &msg),
            Role::Player { slot } => {
                if self.slots[slot].as_ref().is_some_and(|s| s.conn == Some(id)) {
                    self.handle_player_message(slot, msg, Via::Ws);
                }
            }
            Role::Unknown => {}
        }
    }

    fn on_monitor_message(&mut self, id: u64, page: Page, focused: bool, kind: &str, msg: &Value) {
        match kind {
            "inject_mode" => {
                if let Some(mode) = s(msg, "mode").as_deref().and_then(InjectMode::parse) {
                    self.set_inject_mode(mode);
                }
            }
            "focus" if page == Page::Game => {
                let f = msg.get("focused").and_then(Value::as_bool).unwrap_or(false);
                if f != focused {
                    self.conns.get_mut(&id).unwrap().role = Role::Monitor { page, focused: f };
                    self.record("game_focus", json!({ "focused": f }));
                    self.on_focus_change();
                }
            }
            "focus" if page == Page::App => {
                let f = msg.get("focused").and_then(Value::as_bool).unwrap_or(false);
                if f != focused {
                    self.conns.get_mut(&id).unwrap().role = Role::Monitor { page, focused: f };
                    if !self.desktop { self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game(); }
                    // ブラウザで /app を開いた場合の知らせ。PC アプリから起動されたときは前面のプロセス名で判定する
                    if !self.desktop && f {
                        // ブラウザは接続ごとのfalse→trueを使う。閉じた接続のfocusを新しい画面へ持ち越さない。
                        self.pause_for_app_return();
                    }
                }
            }
            "prepare" => { if self.can_prepare() { self.command(0, "PREPARE"); } }
            "open_game" => { if self.connected_slots().contains(&0) { self.command(0, "OPEN_GAME"); } }
            "select_game" => {
                let Some(t) = s(msg, "title").filter(|t| self.title_known(t)) else { return };
                self.select_title(t);
            }
            "launch_game" => {
                if let Some(id) = s(msg, "id") { self.launch_game(&id); }
            }
            "swap_roles" => {
                let slot = |k: &str| s(msg, k).and_then(|n| SLOT_NAMES.iter().position(|x| *x == n));
                if let (Some(a), Some(b)) = (slot("a"), slot("b")) { self.swap_roles(a, b); }
            }
            "confirm_lineup" => {
                let members = msg.get("members").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
                self.confirm_lineup(s(msg, "title"), members, msg.get("epoch").and_then(Value::as_u64));
            }
            // 分担の画面から戻ったら、決定を取り消す (戻った後の古い決定で起動・準備しない)
            "unconfirm_lineup" => {
                if self.game.phase == Phase::Lobby && self.lineup.take().is_some() {
                    self.log("lineup", json!({ "cancelled": true }));
                    self.push_game();
                }
            }
            "refresh_games" => self.scan_games(),
            // 手動で登録したアプリ (#49・#56)。PC 画面 (PC 本体の接続) からだけ
            "add_game" => self.pick_manual_game(),
            "rename_game" => {
                if let (Some(id), Some(name)) = (s(msg, "id"), s(msg, "name")) { self.edit_manual_game(&id, Some(name)); }
            }
            "remove_game" => {
                if let Some(id) = s(msg, "id") { self.edit_manual_game(&id, None); }
            }
            "observe" => {
                // 疑似ゲーム画面が実際に受け取った入力 (注入との照合結果)
                let events = match msg.get("events") {
                    Some(Value::Array(a)) => a.clone(),
                    Some(v) if !v.is_null() => vec![v.clone()],
                    _ => vec![],
                };
                for o in events {
                    self.record("observe", o);
                }
            }
            "auto_resume" => {
                self.game.auto_resume = msg.get("on").and_then(Value::as_bool).unwrap_or(false);
                self.log("auto_resume", json!({ "on": self.game.auto_resume }));
                self.push_game();
            }
            "phase" => {
                if let Some(p) = s(msg, "phase").as_deref().and_then(Phase::parse) {
                    if p == Phase::Lobby { self.game.host_ready = false; self.set_phase(p, "dashboard"); }
                    else if p == Phase::Paused && self.game.phase == Phase::Coop { self.command(0, "PAUSE"); }
                }
            }
            "reset" => {
                self.release_outputs(None);
                for i in 0..MAX_SLOTS {
                    if let Some(slot) = self.slots[i].take() {
                        self.close(slot.conn, 4001, "reset");
                    }
                }
                for c in self.conns.values_mut() {
                    if matches!(c.role, Role::Player { .. }) {
                        c.role = Role::Unknown;
                    }
                }
                self.game.phase = Phase::Lobby;
                self.game.host_ready = false;
                self.lineup = None;
                self.seats = [0, 1, 2, 3];
                self.role_ack.clear();
                self.advance_epoch();
                self.log("reset", json!({}));
                self.push_game();
                self.push_state();
            }
            _ => {}
        }
    }

    fn on_hello(&mut self, id: u64, msg: &Value) {
        if !matches!(self.conns[&id].role, Role::Unknown) {
            return self.close(Some(id), 4007, "already identified");
        }
        // 版が合わない画面 (古いキャッシュなど) は理由を返して閉じる。枠は割り当てない
        let version = msg.get("protocolVersion").and_then(Value::as_u64);
        if version != Some(PROTOCOL_VERSION) {
            self.send(
                Some(id),
                &json!({ "type": "error", "code": "protocol_version", "protocolVersion": PROTOCOL_VERSION }),
            );
            self.log("reject_version", json!({ "got": version, "expected": PROTOCOL_VERSION }));
            return self.close(Some(id), CLOSE_PROTOCOL_VERSION, "protocol version mismatch");
        }
        let client_id: String = s(msg, "clientId").unwrap_or_default().chars().take(64).collect();
        if client_id.is_empty() {
            return self.close(Some(id), 4002, "no clientId");
        }
        let ip = self.conns[&id].ip.clone();
        let existing = (0..MAX_SLOTS).find(|&i| self.slots[i].as_ref().is_some_and(|s| s.client_id == client_id));
        if let Some(i) = existing {
            // 再接続はサーバーが発行したトークンで照合する。clientId だけ知っている別の端末には枠を渡さない
            let token = s(msg, "token").unwrap_or_default();
            if !token_eq(&token, &self.slots[i].as_ref().unwrap().token) {
                self.send(Some(id), &json!({ "type": "error", "code": "bad_token" }));
                self.log("reject_token", json!({ "slot": SLOT_NAMES[i] }));
                return self.close(Some(id), CLOSE_BAD_TOKEN, "bad token");
            }
        }
        let reconnected = existing.is_some();
        let idx = match existing {
            Some(i) => i,
            None => match (0..MAX_SLOTS).find(|&i| self.slots[i].is_none()) {
                Some(i) => {
                    let Some(token) = new_token() else {
                        // 乱数を得られなければ推測できるトークンを発行せず、参加を断る
                        self.log("token_error", json!({}));
                        return self.close(Some(id), 1011, "token unavailable");
                    };
                    self.slots[i] = Some(Slot::new(client_id.clone(), token));
                    i
                }
                None => {
                    self.send(Some(id), &json!({ "type": "full" }));
                    let device = device_kind(&s(msg, "ua").unwrap_or_default());
                    self.log("reject_full", json!({ "device": device }));
                    return self.close(Some(id), 4004, "room full");
                }
            },
        };
        // 同じ端末の古い接続を置き換え
        let old = self.slots[idx].as_ref().unwrap().conn.filter(|&c| c != id);
        if old.is_some() {
            // 別タブ等による置換も切断として全解放し、旧接続の押下を持ち越さない。
            self.mark_disconnected(idx, "replaced");
        }
        self.close(old, 4000, "replaced");
        let ua: String = s(msg, "ua").unwrap_or_default().chars().take(200).collect();
        let now = now_ms();
        let slot = self.slots[idx].as_mut().unwrap();
        if reconnected {
            slot.reconnects += 1;
        }
        slot.conn = Some(id);
        slot.connected = true;
        slot.ip = Some(ip.clone());
        slot.ua = Some(ua.clone());
        slot.connected_at = Some(now);
        slot.last_seen = now;
        slot.last_seq = 0;
        slot.next_iseq = num(msg, "nextIseq").map(|n| n as i64).filter(|&n| n >= 1).unwrap_or(1);
        slot.look_seq = 0;
        slot.look_cx = 0.0;
        slot.look_cy = 0.0;
        slot.ibuf.clear();
        slot.rtc = None;
        slot.rtc_state = "none";
        let token = slot.token.clone();
        self.conns.get_mut(&id).unwrap().role = Role::Player { slot: idx };
        self.send(
            Some(id),
            &json!({
                "type": "welcome",
                "protocolVersion": PROTOCOL_VERSION,
                "token": token,
                "slot": SLOT_NAMES[idx],
                "role": SLOT_ROLES[idx],
                "isHost": idx == 0,
                "reconnected": reconnected,
            }),
        );
        self.log(
            if reconnected { "reconnect" } else { "join" },
            json!({ "slot": SLOT_NAMES[idx], "device": device_kind(&ua) }),
        );
        self.push_game();
        self.push_state();
        self.maybe_auto_resume();
    }

    // ---------- プレイヤーからのメッセージ (WebSocket / WebRTC 共通) ----------

    fn handle_player_message(&mut self, idx: usize, msg: Value, via: Via) {
        let kind = s(&msg, "type").unwrap_or_default();
        let slot = self.slots[idx].as_mut().unwrap();
        slot.last_seen = now_ms();
        slot.arrivals.observe(slot.last_seen);

        if via == Via::Ws && (kind == "input" || kind == "look") {
            // WebSocket 経路の欠落・順序検知 (WebRTC は再送なしなので対象外)
            if let Some(seq) = num(&msg, "seq").map(|n| n as i64) {
                if seq > slot.last_seq + 1 {
                    slot.lost += (seq - slot.last_seq - 1) as u64;
                }
                if seq <= slot.last_seq {
                    slot.out_of_order += 1;
                } else {
                    slot.last_seq = seq;
                }
            }
        }

        match kind.as_str() {
            "ping" => {
                if let Some(stats) = msg.get("stats") {
                    slot.client_stats = stats.clone();
                }
                let conn = slot.conn;
                self.send(conn, &json!({ "type": "pong", "t": msg.get("t") }));
            }
            "ka" => {
                // WebRTC の生存確認 (スマホの無線を起こしておく役目も兼ねる)
                if let Some(peer) = &slot.rtc {
                    peer.send(&json!({ "type": "kpong", "t": msg.get("t") }).to_string());
                }
            }
            "command" if via == Via::Ws => {
                let cmd = s(&msg, "cmd").unwrap_or_default();
                self.log("command", json!({ "slot": SLOT_NAMES[idx], "cmd": cmd }));
                if matches!(cmd.as_str(), "READY" | "RESUME" | "PREPARE" | "OPEN_GAME")
                    && msg.get("epoch").and_then(Value::as_u64) != Some(self.game.epoch) {
                    self.send(self.slots[idx].as_ref().and_then(|s| s.conn), &json!({"type":"command_result","cmd":cmd,"accepted":false,"reasons":["画面の状態が古くなっています。更新を待ってください"]}));
                    return;
                }
                self.command(idx, &cmd);
            }
            "rtc-offer" => self.start_rtc(idx, &s(&msg, "sdp").unwrap_or_default()),
            "rtc-cand" => {
                if let Some(peer) = slot.rtc.as_mut() {
                    let mid = s(&msg, "mid").unwrap_or_else(|| "0".into());
                    peer.candidate(&s(&msg, "cand").unwrap_or_default(), &mid);
                }
            }
            "release_inputs" if via == Via::Ws => {
                if msg.get("epoch").and_then(Value::as_u64) == Some(self.game.epoch) {
                    self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game();
                }
            }
            "remote" if via == Via::Ws => self.remote_message(idx, &msg),
            // 新しい担当をスマホで確認した (#47)
            "role_ok" if via == Via::Ws => {
                if msg.get("epoch").and_then(Value::as_u64) != Some(self.game.epoch) {
                    return;
                }
                if let Some(k) = self.role_ack.iter().position(|&i| i == idx) {
                    self.role_ack.remove(k);
                    self.log("role_ok", json!({ "slot": SLOT_NAMES[idx] }));
                    self.push_game();
                    self.maybe_auto_resume();
                }
            }
            "input" => self.accept_input(idx, msg, via),
            "look" => self.accept_look(idx, &msg),
            _ => {}
        }
    }

    fn start_rtc(&mut self, idx: usize, sdp: &str) {
        let tx = self.tx.clone();
        let slot = self.slots[idx].as_mut().unwrap();
        slot.rtc = None;
        slot.rtc_gen += 1;
        let gen = slot.rtc_gen;
        match Peer::new(idx, gen, tx).and_then(|mut p| p.offer(sdp).map(|_| p)) {
            Ok(peer) => {
                slot.rtc = Some(peer);
                slot.rtc_state = "connecting";
                self.schedule(Instant::now() + RTC_TIMEOUT, Timer::RtcTimeout(idx, gen));
            }
            Err(e) => {
                slot.rtc_state = "failed";
                self.log("rtc", json!({ "slot": SLOT_NAMES[idx], "state": "error", "error": e }));
                self.push_state();
            }
        }
    }

    /// 入力は同じものが WebSocket と WebRTC の両方から届く。番号順に、先に届いた方で 1 回だけ処理する。
    /// 番号が飛んだら (WebRTC で欠けた) WebSocket の到着を待つので、押下と解放の順番が入れ替わることはない。
    fn accept_input(&mut self, idx: usize, msg: Value, via: Via) {
        let Some(iseq) = num(&msg, "iseq").map(|n| n as i64) else { return };
        let slot = self.slots[idx].as_mut().unwrap();
        if iseq < slot.next_iseq || slot.ibuf.contains_key(&iseq) {
            return;
        }
        if slot.ibuf.len() > 200 {
            slot.ibuf.clear();
        }
        slot.ibuf.insert(iseq, (msg, via));
        loop {
            let slot = self.slots[idx].as_mut().unwrap();
            let Some((m, v)) = slot.ibuf.remove(&slot.next_iseq) else { break };
            slot.next_iseq += 1;
            self.process_input(idx, m, v);
        }
    }

    fn process_input(&mut self, idx: usize, msg: Value, via: Via) {
        let button = s(&msg, "button").unwrap_or_default();
        let state = s(&msg, "state").unwrap_or_default();
        let burst = msg.get("burst").and_then(Value::as_bool).unwrap_or(false);
        let epoch = msg.get("epoch").and_then(Value::as_u64);
        if epoch != Some(self.game.epoch) {
            // 前の進行状態で押された入力 (PAUSE / RESUME の直前に送られて遅れて届いたもの)。
            // 状態の変更時に全出力を解放済みなので、押下も解放も新しい状態では処理しない。番号は消費して ACK だけ返す
            let conn = self.slots[idx].as_ref().unwrap().conn;
            self.send(conn, &json!({ "type": "ack", "iseq": msg.get("iseq"), "t": msg.get("t"), "via": via.name(), "stale": true }));
            let current = self.game.epoch;
            self.record(
                "stale_input",
                json!({ "slot": SLOT_NAMES[idx], "button": button, "state": state, "epoch": epoch, "current": current }),
            );
            return;
        }
        let slot = self.slots[idx].as_mut().unwrap();
        slot.events += 1;
        match via {
            Via::Ws => slot.via_ws += 1,
            Via::Rtc => slot.via_rtc += 1,
        }
        if state == "down" {
            slot.pressed.insert(button.clone());
        } else {
            slot.pressed.remove(&button);
        }
        let conn = slot.conn;
        self.send(conn, &json!({ "type": "ack", "iseq": msg.get("iseq"), "t": msg.get("t"), "via": via.name() }));
        let entry = self.record(
            "input",
            json!({ "slot": SLOT_NAMES[idx], "button": button, "state": state, "iseq": msg.get("iseq"), "via": via.name(), "burst": burst }),
        );
        if !burst {
            self.handle_control(idx, &button, &state);
            self.broadcast_monitors(&json!({ "type": "log", "entry": entry }));
        }
        self.push_state_throttled();
    }

    /// 視点は累積値で届くので、欠けたパケットの分も次のパケットで取り戻せる。古いパケットは捨てる
    fn accept_look(&mut self, idx: usize, msg: &Value) {
        // 別epochの累積値は現在の基準にも混ぜない。
        if msg.get("epoch").and_then(Value::as_u64) != Some(self.game.epoch) {
            return;
        }
        let Some(lseq) = num(msg, "lseq").map(|n| n as i64) else { return };
        let slot = self.slots[idx].as_mut().unwrap();
        if lseq <= slot.look_seq {
            return;
        }
        if lseq > slot.look_seq + 1 {
            slot.look_lost += (lseq - slot.look_seq - 1) as u64;
        }
        slot.look_seq = lseq;
        let cx = num(msg, "cx").unwrap_or(0.0);
        let cy = num(msg, "cy").unwrap_or(0.0);
        let (dx, dy) = (cx - slot.look_cx, cy - slot.look_cy);
        slot.look_cx = cx;
        slot.look_cy = cy;
        slot.events += 1;
        self.handle_look(idx, dx, dy);
    }

    fn advance_epoch(&mut self) {
        self.game.epoch += 1;
        // 送信側と同じくepochごとに累積値と順序番号を0から始める。
        for slot in self.slots.iter_mut().flatten() {
            slot.look_seq = 0;
            slot.remote_seq = 0;
            slot.look_cx = 0.0;
            slot.look_cy = 0.0;
        }
    }
}
