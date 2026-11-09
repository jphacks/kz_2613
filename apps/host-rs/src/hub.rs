// セッションの中枢。役割・進行・入力の順序制御・キー/マウスの出力キュー・視点の補間を
// 1 本の専用スレッドで処理する (Node 版 server.js と同じ仕様・同じメッセージ形式)。
// すべての状態変更はこのスレッドだけが行うのでロック不要。タイマーもこのスレッドで回す (視点は 4ms 刻み)。

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap, HashMap};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::config::Config;
use crate::protocol::{self, s, num, InputMessage, LookMessage, CommandMessage, RemoteMessage};
use crate::session::{self, Phase, InjectMode, MIN_PLAYERS, SLOT_NAMES};
use crate::controls::{self, Kind, OUTPUTS};
use crate::keybinds::{self, Keybinds};
use crate::profiles::{self, Profile};
use crate::focus::{Foreground, Target};
use crate::game_service::{self, GameService, Launch, Watch, TITLES, LAUNCH_POLL};
use crate::games::{self, Entry};
use crate::input::InputAdapter;
use crate::look::{Look, LOOK_TICK};
use crate::input_manager::{OutputState, PumpStep, MIN_HOLD_MS, MIN_GAP_MS};
#[cfg(test)]
use crate::input_manager::MAX_QUEUE;
use crate::rtc::{Peer, RtcSignal};

// 参加枠は P1〜P4 (#57)。2〜4人で遊び、人数は Ready の時点で接続している人数で決める (#105)
const MAX_SLOTS: usize = 4;
// 枠の既定の表示 (Minecraft を 3〜4人で遊ぶときの担当)。実際の担当は分担 (game.assigned) で決まる
// 枠の呼び名。操作の分担は操作定義から決める (#141。Minecraft の固定の分担はやめた)
const SLOT_ROLES: [&str; MAX_SLOTS] = ["ホスト", "参加者", "参加者", "参加者"];
/// 通信契約の版 (docs/protocol-specification.md)。変えるときは仕様書とシミュレーションも同時に更新する
// PC アプリで選べるゲーム (apps/web/dist/shared/model/presentation.ts の GAMES と同じ id)。P0 は Minecraft Java Edition のみ。
// "pseudo-game" は診断用の疑似ゲーム画面 (/game) で、PC アプリの一覧には出さない (ゲーム変更の試験にも使う)
// PC アプリ (apps/desktop) の実行ファイル名。前面になったら PC アプリへの手動復帰とみなす
const DESKTOP_PROCESS: &str = "recooplay-desktop.exe";
const DEFAULT_TITLE: &str = TITLES[0];
const PROTOCOL_VERSION: u64 = 4;
const CLOSE_PROTOCOL_VERSION: u16 = 4005;
const CLOSE_BAD_TOKEN: u16 = 4006;
/// 接続ごとの送信待ちの上限。健全な接続は溜まらず、読取りが止まった接続だけが達する (#197)
pub const WS_QUEUE_LIMIT: usize = 4096;
const CLOSE_HOST_HANDOVER: u16 = 4008;
const HEARTBEAT_TIMEOUT_MS: u64 = 4000; // この時間メッセージが来なければ切断扱い
const RTC_TIMEOUT: Duration = Duration::from_secs(5);
const FOCUS_CHECK: Duration = Duration::from_millis(100); // 前面のウィンドウを確認する間隔

// ---------- 外部とのやり取り ----------

pub enum Out {
    Text(String),
    Close(u16, String),
    Terminate,
}

pub enum Event {
    WsOpen { id: u64, tx: UnboundedSender<Out>, queued: Arc<SendQueue>, ip: String, loopback: bool },
    WsText { id: u64, text: String, enqueued_at: Option<Instant> },
    WsClosed { id: u64, code: u16 },
    RtcDescription { slot: usize, gen: u64, sdp: String, kind: String },
    RtcCandidate { slot: usize, gen: u64, cand: String, mid: String },
    RtcState { slot: usize, gen: u64, state: RtcSignal },
    RtcMessage { slot: usize, gen: u64, text: String, received_at: Option<Instant> },
    /// 緊急停止 (PC のホットキー / デスクトップアプリ)。全解放して注入を OFF にする
    EmergencyStop { source: &'static str, enqueued_at: Option<Instant> },
    /// 試験用: 前面のウィンドウが入力先かどうかを差し替える (DRY_RUN のときだけ)
    FakeTarget(bool),
    FakeCursor(bool),
    FakeActivate(bool),
    /// 既定の音の出力先が Bluetooth か (#131)。実機では定期的に調べ、試験では標準入力の "bt on/off" で差し替える
    BluetoothAudio(bool),
    /// 試験用: 役割交代の時刻を今にする (dry-run のみ)
    FakeRotationDue,
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
    InputFaultStop(u64),
    ReleaseRetry(u64),
    LaunchWatch(u64),       // 起動の世代
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn dry_run() -> bool {
    std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1")
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
    queued: Arc<SendQueue>, // 送信待ちの本文の数。送信側が減らす (#197)
    ip: String,
    loopback: bool,
    role: Role,
}

/// 接続ごとの送信待ちの数と、上限で本文を落としたかの記録 (#197)
#[derive(Default)]
pub struct SendQueue {
    pub len: AtomicUsize,
    /// 一度でも本文を落としたら立てたままにする。送信側が空きを作っても、落とした接続は必ず切る
    pub overflowed: AtomicBool,
}

impl SendQueue {
    pub fn must_close(&self) -> bool { self.overflowed.load(Ordering::Relaxed) }
}

impl Conn {
    /// 本文を送信待ちへ積む。上限に達した接続は送信側が切断する (#197)。
    /// 切断は通常の経路で全解放し、再接続で最新の状態を受け取るので、落とした本文を補う必要はない
    fn push_text(&self, text: String) {
        if self.queued.len.fetch_add(1, Ordering::Relaxed) >= WS_QUEUE_LIMIT {
            self.queued.len.fetch_sub(1, Ordering::Relaxed);
            self.queued.overflowed.store(true, Ordering::Relaxed);
            return;
        }
        if self.tx.send(Out::Text(text)).is_err() { self.queued.len.fetch_sub(1, Ordering::Relaxed); }
    }
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
    disconnected_at: u64, // ロビーの切断枠の解放に使う (#223)
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
    release_floor: i64, // 本人の release_inputs 以前に送った入力の最大番号。これ以下の押下は解放後に届いても適用しない (#262)
    ibuf: BTreeMap<i64, (InputMessage, Via)>,
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
            disconnected_at: 0,
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
            release_floor: 0,
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

pub struct Hub {
    tx: Sender<Event>,
    input: Box<dyn InputAdapter>,
    game_service: GameService,
    log_file: BufWriter<File>,
    conns: HashMap<u64, Conn>,
    slots: [Option<Slot>; MAX_SLOTS],
    game: Game,
    inject: InjectMode,
    outputs: Vec<OutputState>,
    release_pending: BTreeSet<usize>, // 成功upを確認するまでReset/epoch変更でも消さない。
    input_fault: bool, // 自動回復後もPCの明示再開まで押下・移動・ホイールを禁止。
    fault_stop_gen: u64,
    fault_stop_pending: bool,
    release_retry_gen: u64,
    release_retry_attempts: u8,
    release_retry_active: bool,
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
    /// 公式の Minecraft ランチャーを開く先 (#55)。見つからなければ None
    minecraft_launch: Option<String>,
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
    fake_cursor: bool, // 試験用: マウスカーソルが表示されている (ゲームがマウスを捕捉していない) ことにする
    cursor_free: bool, // 入力先でマウスカーソルが表示されている。マウスを捕捉する定義のゲームではマウス入力を送らない (#261)
    fake_activate: bool,
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
    // 利用者が変えたキー割当 (#50・#53)
    key_overrides_path: Option<std::path::PathBuf>,
    key_overrides: crate::key_overrides::Overrides,
    // 時間制の役割交代 (#161)。既定は OFF
    rotation_secs: u64,
    rotation_at: u64,
    // 担当が変わり、本人がスマホで「確認しました」を押していない枠。押すまで Ready・再開できない
    role_ack: Vec<usize>,
    app_focused: bool,           // PC アプリが前面か (手動復帰の判定に使う)
    // PC アプリ (デスクトップアプリ) から起動されたか。そのときは前面のプロセス名で PC アプリの前面を判定し、
    // 画面 (WebView2 は背面でも focused のまま) の知らせは使わない
    desktop: bool,
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

impl Hub {
    pub fn new(tx: Sender<Event>, config: &Config, input: impl InputAdapter + 'static, log_dir: &Path) -> std::io::Result<Hub> {
        std::fs::create_dir_all(log_dir)?;
        let name = format!("session-{}.jsonl", chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S-%3fZ"));
        let log_file = BufWriter::new(File::options().create(true).append(true).open(log_dir.join(name))?);
        let now = Instant::now();
        let mut hub = Hub {
            tx,
            input: Box::new(input),
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
            game_service: GameService::new(),
            release_pending: BTreeSet::new(), input_fault: false,
            fault_stop_gen: 0, fault_stop_pending: false, release_retry_gen: 0, release_retry_attempts: 0, release_retry_active: false,
            outputs: OUTPUTS.iter().map(|_| OutputState::default()).collect(),
            look: Look::new(now, config.look_smooth_min_ms, config.look_smooth_max_ms),
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
            minecraft_launch: None,
            games_scanning: false,
            launch: None,
            launch_gen: 0,
            target_fg: None,
            target_ok: false,
            fake_activate: true,
            keybinds: Keybinds::none(),
            minecraft_options: keybinds::minecraft_override(config.minecraft_options.as_deref()),
            profiles: Vec::new(),
            profile: None,
            assigned: Vec::new(),
            participants: Vec::new(),
            lineup: None,
            seats: [0, 1, 2, 3],
            key_overrides_path: crate::key_overrides::default_path(),
            key_overrides: crate::key_overrides::load(crate::key_overrides::default_path().as_deref()),
            rotation_secs: 0,
            rotation_at: 0,
            role_ack: Vec::new(),
            fake_target: std::env::var("RECOOPLAY_FAKE_TARGET")
                .ok()
                .filter(|_| std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1"))
                .map(|v| v == "1"),
            fake_cursor: false,
            cursor_free: false,
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
        let mut last_look_tick: Option<Instant> = None;
        loop {
            let now = Instant::now();
            while let Some(Reverse((at, _, timer))) = self.timers.peek().copied() {
                if at > now {
                    break;
                }
                self.timers.pop();
                if timer == Timer::LookTick {
                    if let Some(start) = crate::runtime_measure::start() {
                        if let Some(last) = last_look_tick.replace(start) {
                            crate::runtime_measure::sample("look_tick_interval_us", start.duration_since(last).as_micros() as u64);
                        }
                    }
                }
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
                    let confirmed = self.release_for_shutdown();
                    crate::runtime_measure::finish();
                    crate::input_trace::finish();
                    std::process::exit(if confirmed { 0 } else { 1 });
                }
                Ok(ev) => {
                    let start = crate::runtime_measure::start();
                    let metric = if matches!(ev, Event::EmergencyStop { .. }) { "hub_stop_us" } else { "hub_event_us" };
                    let (queue_metric, total_metric, enqueued_at) = match &ev {
                        Event::WsText { enqueued_at, .. } => ("hub_ws_queue_us", "hub_ws_enqueue_to_end_us", *enqueued_at),
                        Event::EmergencyStop { enqueued_at, .. } => ("hub_stop_queue_us", "hub_stop_enqueue_to_end_us", *enqueued_at),
                        _ => ("", "", None),
                    };
                    if let (Some(enqueued), Some(start)) = (enqueued_at, start) {
                        crate::runtime_measure::sample(queue_metric, start.duration_since(enqueued).as_micros() as u64);
                    }
                    self.on_event(ev);
                    crate::runtime_measure::elapsed(metric, start);
                    crate::runtime_measure::elapsed(total_metric, enqueued_at);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => { self.release_for_shutdown(); break; }
            }
        }
    }

    fn schedule(&mut self, at: Instant, timer: Timer) {
        self.timer_seq += 1;
        self.timers.push(Reverse((at, self.timer_seq, timer)));
    }

    // ---------- ログ ----------

    fn record(&mut self, kind: &str, data: Value) -> Value {
        let start = crate::runtime_measure::start();
        let mut entry = Map::new();
        entry.insert("t".into(), json!(now_ms()));
        entry.insert("kind".into(), json!(kind));
        if let Value::Object(m) = data {
            entry.extend(m);
        }
        let entry = Value::Object(entry);
        let _ = writeln!(self.log_file, "{}", entry);
        crate::runtime_measure::elapsed("log_record_us", start);
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
            c.push_text(msg.to_string());
        }
    }

    fn close(&self, conn: Option<u64>, code: u16, reason: &str) {
        if let Some(c) = conn.and_then(|id| self.conns.get(&id)) {
            let _ = c.tx.send(Out::Close(code, reason.to_string()));
        }
    }

    fn broadcast_monitors(&self, msg: &Value) {
        let start = crate::runtime_measure::start();
        let text = msg.to_string();
        for c in self.conns.values() {
            if matches!(c.role, Role::Monitor { .. }) {
                c.push_text(text.clone());
            }
        }
        crate::runtime_measure::elapsed("notify_monitors_us", start);
    }

    fn broadcast_players(&self, msg: &Value) {
        let text = msg.to_string();
        for slot in self.slots.iter().flatten() {
            if let Some(c) = slot.conn.and_then(|id| self.conns.get(&id)) {
                c.push_text(text.clone());
            }
        }
    }

    // ---------- スナップショット ----------

    fn connected_slots(&self) -> Vec<usize> {
        (0..MAX_SLOTS).filter(|&i| self.slots[i].as_ref().is_some_and(|s| s.connected)).collect()
    }

    fn ready_reasons(&self, require_focus: bool) -> Vec<String> {
        let connected = self.connected_slots();
        let roles = self.role_slots();
        let unacked: Vec<usize> = self.role_ack.iter().copied().filter(|i| roles.contains(i)).collect();
        session::ReadyFacts {
            phase: self.game.phase, connected: &connected, participants: &self.participants, unacked: &unacked,
            has_profile: self.profile.is_some(), lineup_ok: self.lineup_ok(), title_known: self.title_known(&self.game.title),
            controller_supported: self.profile.as_ref().is_none_or(profiles::controller_supported),
            input_available: self.input.available() && !self.input_fault, stop_available: self.hotkey.is_ok() || self.fake_target.is_some(),
            inject: self.inject, can_inject: self.can_inject(),
        }.reasons(require_focus)
    }

    fn can_prepare(&self) -> bool {
        session::can_prepare(self.game.phase, self.connected_slots().contains(&0), self.lineup_ok())
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
            && (self.games.iter().any(|g| g.id == self.game.title) || self.minecraft_entry().is_some_and(|m| m.id == self.game.title))
            && !self.launch.as_ref().is_some_and(|l| l.id == self.game.title && l.state == "launching")
    }

    fn can_ready(&self) -> bool {
        session::can_ready(self.game.phase, self.ready_reasons(false).is_empty())
    }

    fn can_resume(&self) -> bool {
        session::can_resume(self.game.phase, self.game.host_ready, self.ready_reasons(false).is_empty())
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
            // PC 画面で決定したメンバーと分担 (#109)。lineupOk は今の選択・接続と一致しているか
            "lineup": self.lineup.as_ref().map(|l| json!({ "title": l.title, "members": l.members.iter().map(|&i| SLOT_NAMES[i]).collect::<Vec<_>>() })),
            "lineupOk": self.lineup_ok(),
            // 枠 → 席順 (P1〜 で表す。入れ替えた人は入れ替えた先の席、#47。分担は席順で配る)
            "roleOf": self.role_slots().iter().filter_map(|&i| self.role_rank(i).map(|k| (SLOT_NAMES[i].to_string(), json!(SLOT_NAMES[k])))).collect::<Map<String, Value>>(),
            "roleAck": self.role_ack.iter().map(|&i| SLOT_NAMES[i]).collect::<Vec<_>>(),
            "rotationSeconds": self.rotation_secs,
            "canChangePlayers": session::can_change_players(self.game.phase, &self.connected_slots(), &self.participants),
            "canSwap": matches!(self.game.phase, Phase::Lobby | Phase::Preparing) || (self.game.phase == Phase::Paused && !self.participants.is_empty()),
            "canLaunch": self.can_launch(),
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
            "readyReasons": self.ready_reasons(false),
            "prepareStatus": self.game.prepare_status,
            "titleName": self.game_name(),
            "launch": self.launch.as_ref().map(|l| json!({ "id": l.id, "state": l.state, "message": l.message })),
            "remoteRoute": if self.remote_app_active() { "app" } else if self.remote_game_active() { "game" } else { "none" },
            // 入力が PC に届く状態か (注入モード・入力先のウィンドウ)。スマホに「届いていない」ことを知らせる
            "inputActive": self.can_inject(),
            "inputTarget": self.inject == InjectMode::On && !self.target_ok,
            // ゲームがメニュー・持ち物などでマウスを捕捉していないため、マウス操作を止めている (#261)
            "mouseBlocked": self.mouse_blocked(),
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
        self.title_known(&self.game.title) && self.input.available() && !self.input_fault && self.release_pending.is_empty()
            && match self.inject {
                InjectMode::Off => false,
                InjectMode::Test => self.game_focused(),
                // 常時 ON でも、前面のウィンドウが入力先 (Minecraft) のときだけ
                InjectMode::On => self.target_ok,
            }
    }

    /// 入力先がマウスを捕捉していない (メニュー・持ち物を開いている) ため、マウスの押下・ホイール・視点を送らない (#261)。
    /// キーは止めない (Escで戻れるように)。カーソルの表示状態は入力先の前面確認と同じ周期で調べる
    fn mouse_blocked(&self) -> bool {
        self.inject == InjectMode::On && self.target_ok && self.cursor_free && self.profile.as_ref().is_some_and(|p| p.captures_mouse)
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
            "error": if self.input_fault { Some("入力送信に失敗しました。PCで安全を確認してから入力を再開してください") } else { self.input.error() },
            "inputFault": self.input_fault,
            "releaseUnconfirmed": self.release_pending.iter().map(|&i| OUTPUTS[i].id).collect::<Vec<_>>(),
            "releaseRetryAttempts": self.release_retry_attempts,
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
            "minecraft": { "detected": self.minecraft.is_some(), "image": self.minecraft == Some(true), "launchable": self.minecraft_launch.is_some() },
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
        let Some(change) = session::phase_change(self.game.phase, phase) else { return };
        self.release_outputs(None);
        self.reset_look();
        if phase == Phase::Coop && self.input_fault { self.stop_input_failure(); return; }
        self.game.phase = phase;
        if change.clear_lineup { self.assigned.clear(); self.participants.clear(); self.lineup = None; }
        self.game.reason = Some(reason.to_string());
        self.advance_epoch();
        // 協力プレイに入るたびに数え直す。止まっている間は交代しない
        self.rotation_at = if phase == Phase::Coop && self.rotation_secs != 0 { now_ms() + self.rotation_secs * 1000 } else { 0 };
        self.log("phase", json!({ "phase": phase.name(), "reason": reason, "epoch": self.game.epoch }));
        self.update_low_latency();
        self.push_game();
    }

    /// 協力プレイに入るとき (Ready・再開・自動復帰)、対象ゲームが前面でなければ前面にする (#138)。
    /// 切り替えるのは協力プレイに入る瞬間だけで、一時停止中に P1 が PC アプリを操作している間は前面を奪わない。
    /// Windows が拒否したときは、これまでどおり手動で前面にする案内を出す
    fn focus_for_coop(&mut self) -> bool {
        if self.input_fault || !self.release_pending.is_empty() { return false; }
        // Testモードは疑似ゲーム画面のfocusのみで判定し、実ウィンドウを切り替えない。
        if self.inject != InjectMode::On { return self.can_inject(); }
        self.check_target();
        if self.target_ok { return self.can_inject(); }
        self.release_outputs(None);
        self.reset_look();
        if self.input_fault { return false; }
        let simulated = self.fake_target.is_some();
        let result = if simulated {
            if self.fake_activate { self.fake_target = Some(true); Ok(()) }
            else { Err("シミュレーション：前面化を拒否しました".into()) }
        } else if dry_run() {
            Err("dry-run：実ウィンドウは操作しません".into())
        } else { self.game_service.activate(&self.target) };
        self.check_target();
        let ok = result.is_ok() && self.can_inject();
        self.log("auto_focus", json!({ "ok": ok, "simulated": simulated || dry_run() }));
        self.game.prepare_status = if ok { "対象ゲームを前面にしました".into() }
            else { format!("{}。{}を手動で前面にしてください", result.err().unwrap_or("前面を確認できませんでした".into()), self.game_name()) };
        self.push_game();
        ok
    }

    fn maybe_auto_resume(&mut self) {
        // 再接続とPCアプリへの手動復帰が重なっても、前面の観測で復帰解除を先に確定する。
        self.check_target();
        if !session::auto_resume_window(self.game.phase, self.game.reason.as_deref(), self.game.auto_resume,
            now_ms(), self.game.auto_resume_until) { return; }
        // WebRTC の接続中は待つ (つながるか、失敗して WebSocket のみになってから復帰)
        let rtc_settled = self
            .connected_slots()
            .into_iter()
            .all(|i| self.slots[i].as_ref().is_some_and(|s| s.rtc_state != "connecting"));
        if self.can_resume() && rtc_settled {
            if self.focus_for_coop() { self.set_phase(Phase::Coop, "auto resume"); }
            else { self.game.auto_resume_until = 0; self.push_game(); } // 拒否されたら繰り返し前面を奪わず、明示操作を待つ。
        }
    }

    fn command(&mut self, slot: usize, cmd: &str) {
        if !session::is_host(slot) { return; }
        let name = self.game_name();
        let allowed = session::command_allowed(slot, cmd, self.game.phase,
            cmd == "PREPARE" && self.game.phase == Phase::Lobby && self.can_prepare(),
            cmd == "READY" && self.game.phase == Phase::Preparing && self.can_ready(),
            cmd == "RESUME" && self.game.phase == Phase::Paused && self.can_resume());
        let accepted = allowed && match (cmd, self.game.phase) {
            ("OPEN_GAME", Phase::Preparing | Phase::Paused) => {
                self.game.prepare_status = if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
                    "dry-run：実ウィンドウは操作しません".into()
                } else { match self.game_service.activate(&self.target) {
                    Ok(()) => "対象ゲームを前面にしました".into(),
                    Err(reason) => format!("{}。{}を手動で前面にしてください", reason, name),
                }};
                self.push_game(); true
            }
            ("PREPARE", Phase::Lobby) => {
                self.game.host_ready = false;
                self.game.prepare_status = if self.fake_target.is_some() {
                    "シミュレーション：実ゲームは起動していません".into()
                } else if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1") {
                    format!("dry-run：{}を手動で開いてください", name)
                } else {
                    match self.game_service.activate(&self.target) {
                        Ok(()) => format!("{}のウィンドウを前面にしました。プレイ中の画面まで進めてください", name),
                        Err(reason) => format!("{}。{}を手動で開き、プレイ中の画面まで進めてください", reason, name),
                    }
                };
                self.reload_keybinds();
                self.set_phase(Phase::Preparing, "host prepare"); true
            }
            ("READY", Phase::Preparing) if self.focus_for_coop() => {
                self.reload_keybinds();
                self.fix_assignment();
                self.game.host_ready = true;
                self.set_phase(Phase::Coop, "host ready"); self.game.phase == Phase::Coop && !self.input_fault
            }
            // 再開は Ready で決めた参加者・分担のまま (参加者がそろうまで再開できない)
            ("RESUME", Phase::Paused) if self.focus_for_coop() => { self.reload_keybinds(); self.set_phase(Phase::Coop, "host resume"); self.game.phase == Phase::Coop && !self.input_fault }
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
            "reasons": if accepted { vec![] } else { self.ready_reasons(true) },
        }));
    }

    /// その操作を今このスロットが使えるか → 出力の番号
    fn resolve_control(&self, slot: usize, control: &str) -> Option<usize> {
        let id = if self.game.phase == Phase::Coop {
            // どのゲームも操作定義から作った画面で操作する (#60・#141)。分担で割り当てた操作 (act:<ID>) だけを、
            // ゲームのキー設定に合わせて送る。Minecraft の固定の操作名 (FWD など) は受け付けない
            if !control.starts_with("act:") || !self.uses_generated_controls() { return None; }
            self.action_output(slot, control)
        } else if slot == 0 && self.remote_game_active() {
            let default = controls::remote_control(control)?;
            // メニューでの「持ち物」はインベントリのキー (Minecraft の設定に合わせる)
            if control == "REMOTE_E" { self.keybinds.output_for("INV").unwrap_or(Some(default)) } else { Some(default) }
        } else {
            None
        }?;
        OUTPUTS.iter().position(|o| o.id == id)
    }

    /// 選んだゲームの操作定義を引き、ユーザーのキー設定を読み直して重ねる (#97・#99)
    fn reload_keybinds(&mut self) {
        // 定義のない検出したゲームには汎用の定義を当てる (#123)。Minecraft の固定の表を別のゲームへ送らない
        // 診断用の疑似ゲーム画面は Minecraft と同じ操作の定義を使う (#141)
        self.profile = profiles::find(&self.profiles, &self.game.title).cloned().or_else(|| {
            self.games.iter().find(|g| g.id == self.game.title).map(|g| profiles::generic(&g.id, &g.name))
        }).or_else(|| (self.game.title == "pseudo-game").then(profiles::builtin_pseudo));
        self.keybinds = match &self.profile {
            Some(p) => {
                let over = if p.id == "minecraft-java" { self.minecraft_options.as_deref() } else { None };
                Keybinds::build_with(p, over, self.key_overrides.get(&self.game.title))
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
        let edited: Vec<&String> = self.key_overrides.get(&self.game.title).map(|m| m.keys().collect()).unwrap_or_default();
        json!({ "source": self.keybinds.source, "warnings": self.keybinds.warnings, "controls": controls, "actions": actions, "edited": edited })
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
    /// 時間制の役割交代 (#161)。協力プレイを止めて全員の入力を解放し、担当をずらして全員の確認を待つ。
    /// 再開はホストの明示操作だけで、自動復帰しない。ホストの権限は移らない
    fn rotate_roles_if_due(&mut self, now: u64) {
        if !session::rotation_due(self.game.phase, self.rotation_at, now) { return; }
        self.set_phase(Phase::Paused, "role rotation");
        if self.game.phase != Phase::Paused { return; }
        self.seats = session::rotated_seats(self.seats, &self.participants);
        if let Some(p) = self.profile.clone() { self.assigned = self.proposal_for(&p, &self.participants.clone()); }
        self.game.auto_resume_until = 0;
        self.role_ack = self.participants.clone();
        self.advance_epoch();
        self.log("role_rotation", json!({ "epoch": self.game.epoch }));
        self.push_game();
        self.push_state();
    }

    /// キー割当の変更を保存して反映する (#50・#53)。保存に失敗しても今の実行には反映し、PC画面へ知らせる
    fn apply_key_change(&mut self) {
        let saved = crate::key_overrides::save(self.key_overrides_path.as_deref(), &self.key_overrides);
        if let Err(e) = &saved { self.log("key_save_error", json!({ "error": e })); }
        self.broadcast_monitors(&json!({ "type": "key_result", "ok": saved.is_ok() }));
        self.release_outputs(None);
        self.reset_look();
        self.advance_epoch();
        self.reload_keybinds();
        self.push_game();
        self.push_state();
    }

    /// 一時停止中に今の接続で参加者と分担を決め直す (#162)。旧入力を捨て、全員の確認と明示の再開を求める
    fn change_players(&mut self) {
        let connected = self.connected_slots();
        if !session::can_change_players(self.game.phase, &connected, &self.participants) { return; }
        self.release_outputs(None);
        self.reset_look();
        self.seats = [0, 1, 2, 3];
        self.participants = connected.clone();
        if let Some(p) = self.profile.clone() { self.assigned = self.proposal_for(&p, &connected); }
        self.game.auto_resume_until = 0;
        self.role_ack = connected;
        self.advance_epoch();
        let players: Vec<&str> = self.participants.iter().map(|&i| SLOT_NAMES[i]).collect();
        self.log("change_players", json!({ "players": players }));
        self.push_game();
        self.push_state();
    }

    fn swap_roles(&mut self, a: usize, b: usize) {
        if !session::can_swap(self.game.phase, &self.connected_slots(), &self.participants, a, b) { return; }
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

    /// 操作定義から作った画面で操作できるか (分担が決まっている)。Minecraft の 3人用の固定の画面はやめた (#141)
    fn uses_generated_controls(&self) -> bool {
        !self.assigned.is_empty()
    }

    /// この枠に割り当てた操作か
    fn is_assigned(&self, slot: usize, action: &str) -> bool {
        session::is_assigned(&self.assigned, slot, action)
    }

    /// この枠が視点 (マウス移動) を担当しているか。分担で視点を割り当てた人だけ (#141)
    fn owns_look(&self, slot: usize) -> bool {
        self.profile.as_ref().is_some_and(|p| p.actions.iter().any(|a| a.kind == "mouseDelta" && self.is_assigned(slot, &a.id)))
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
        if down && self.input_fault { return; }
        let o = &OUTPUTS[idx];
        let trace_start=crate::input_trace::start();
        let ok = match o.kind {
            Kind::Key { scan, ext } => self.input.key(scan, ext, down),
            Kind::Mouse { left } => self.input.mouse_button(left, down),
            Kind::Wheel { .. } => false,
        };
        if let Some(start)=trace_start {
            crate::input_trace::event("output",json!({"slot":slot,"out":o.id,"state":if down {"down"} else {"up"},"startedUs":crate::input_trace::stamp(start),"ok":ok}));
        }
        if !ok {
            self.release_pending.insert(idx);
            if !self.input_fault {
                self.input_fault = true; self.inject = InjectMode::Off; self.game.auto_resume_until = 0;
                self.fault_stop_pending = true;
                self.fault_stop_gen += 1;
                self.schedule(Instant::now(), Timer::InputFaultStop(self.fault_stop_gen));
            }
        } else if !down { self.release_pending.remove(&idx); }
        let entry = self.record(
            "inject",
            json!({ "slot": slot, "out": o.id, "label": o.label, "state": if down { "down" } else { "up" }, "ok": ok }),
        );
        self.broadcast_monitors(&json!({ "type": "inject", "entry": entry }));
    }

    fn pump(&mut self, idx: usize) {
        loop {
            if self.input_fault { return; }
            match self.outputs[idx].pump_step(Instant::now()) {
                PumpStep::Idle => return,
                PumpStep::Wait { delay, generation } => {
                    self.schedule(Instant::now() + delay, Timer::Pump(idx, generation));
                    return;
                }
                PumpStep::Emit { down, slot } => self.apply_output(idx, down, slot),
            }
        }
    }

    fn set_output(&mut self, idx: usize, slot: &'static str, down: bool) {
        if down && self.input_fault { return; }
        let Some(dropped) = self.outputs[idx].set_holder(slot, down) else { return };
        for _ in 0..dropped {
            self.record("queue_drop", json!({ "out": OUTPUTS[idx].id, "slot": slot }));
        }
        self.pump(idx);
    }

    /// スマホ1台のblur・回転・非表示などで、その端末の押下だけを解放する (#262)。
    /// 解放要求より前に送られた入力が後から届いても押下を適用しないよう、番号の下限を記録する。
    fn release_slot_inputs(&mut self, idx: usize, floor: i64) {
        let name = SLOT_NAMES[idx];
        let Some(slot) = self.slots[idx].as_mut() else { return };
        slot.release_floor = slot.release_floor.max(floor);
        slot.pressed.clear();
        self.release_outputs(Some(name));
        if self.look.owner() == name { self.reset_look(); }
        self.log("release_inputs", json!({ "slot": name, "iseq": floor }));
        self.push_game();
    }

    /// 切断・停止時のup要求は、出力ごとの状態を無効化した直後に順次送る。
    fn release_outputs(&mut self, slot: Option<&'static str>) {
        for idx in 0..OUTPUTS.len() {
            let release = self.outputs[idx].release(slot, Instant::now());
            if release {
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
            if !down || !self.can_inject() || self.mouse_blocked() {
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
        if down && matches!(o.kind, Kind::Mouse { .. }) && self.mouse_blocked() {
            return;
        }
        self.set_output(idx, SLOT_NAMES[slot], down);
    }

    fn remote_app_active(&self) -> bool {
        if self.input_fault { return false; }
        if self.game.phase == Phase::Coop { return false; }
        if self.desktop { return self.app_focused; }
        let page = self.conns.values().any(|c| matches!(c.role, Role::Monitor {page:Page::App,focused:true}));
        page && (self.fake_target.is_some() || self.game_service.foreground().is_some_and(|f|
            ["msedge.exe", "chrome.exe", "firefox.exe"].contains(&f.process.as_str()) && f.title.contains("Re:Cooplay")))
    }

    fn remote_game_active(&self) -> bool {
        matches!(self.game.phase, Phase::Preparing | Phase::Paused) && !self.remote_app_active() && self.can_inject()
            && (self.hotkey.is_ok() || self.fake_target.is_some())
    }

    fn remote_message(&mut self, idx: usize, msg: &Value) {
        let msg = RemoteMessage::decode(msg);
        if idx != 0 || self.game.phase == Phase::Coop || msg.epoch != Some(self.game.epoch) { return; }
        let seq = msg.seq;
        let slot = self.slots[idx].as_mut().unwrap();
        if seq <= slot.remote_seq { return; }
        slot.remote_seq = seq;
        let kind = msg.kind;
        if kind == "release" {
            self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game(); return;
        }
        let x = msg.x;
        let y = msg.y;
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
        self.look.add(SLOT_NAMES[slot], dx, dy, Instant::now());
    }

    fn reset_look(&mut self) {
        self.look.reset();
    }

    fn look_tick(&mut self) {
        let allowed = self.game.phase == Phase::Coop && self.can_inject() && !self.mouse_blocked();
        if let Some(movement) = self.look.tick(Instant::now(), allowed) {
            self.input.mouse_move(movement.dx, movement.dy);
            self.look.record_output(movement);
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
        self.start_release_retry();
        self.push_state();
    }

    /// 前面のウィンドウが入力先かを確認する。外れたら (常時 ON で注入中なら) 全キーを離し、PC 画面とスマホに知らせる
    fn check_target(&mut self) {
        let (fg, ok) = match self.fake_target {
            Some(ok) => (None, ok),
            None => {
                let fg = self.game_service.foreground();
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
        self.check_cursor();
    }

    /// 入力先でマウスカーソルが表示されている (ゲームがマウスを捕捉していない) か (#261)。マウスを捕捉する定義のゲームだけ調べる
    fn check_cursor(&mut self) {
        let captures = self.profile.as_ref().is_some_and(|p| p.captures_mouse);
        let free = self.target_ok && captures && match self.fake_target {
            Some(_) => self.fake_cursor,
            None => crate::focus::cursor_visible().unwrap_or(false),
        };
        if free == self.cursor_free { return; }
        self.cursor_free = free;
        if self.mouse_blocked() {
            // 押したままのマウスボタンと視点の未処理分を捨てる。キーと進行状態(epoch)は変えない
            for idx in 0..OUTPUTS.len() {
                if matches!(OUTPUTS[idx].kind, Kind::Mouse { .. }) && self.outputs[idx].release(None, Instant::now()) {
                    self.apply_output(idx, false, "system");
                }
            }
            self.reset_look();
        }
        self.log("mouse_capture", json!({ "free": free }));
        self.push_game();
        self.push_state();
    }

    // ---------- ゲームの一覧・選択・起動 (#54・#93) ----------

    /// 選べるゲーム: 固定の Minecraft・診断用の疑似ゲームと、検出したゲーム
    fn title_known(&self, title: &str) -> bool {
        game_service::title_known(&self.games, title)
    }

    fn game_name(&self) -> String { game_service::game_name(&self.games, &self.game.title) }

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
        self.target = game_service::target_for(&self.games, &self.game.title, &self.base_target);
        self.check_target();
        self.push_state();
    }

    /// インストール済みのゲームを別スレッドで探す (ディスクの読み取りで視点の刻みを止めない)。
    /// 試験 (dry-run) では RECOOPLAY_FAKE_GAMES のフォルダを Steam・Epic の代わりに読む
    fn scan_games(&mut self) {
        if self.games_scanning {
            // 探している途中で登録が変わったら、終わった後にもう一度探す
            self.rescan_pending = true;
            return;
        }
        let roots = self.game_service.roots();
        let service = self.game_service.clone();
        let tx = self.tx.clone();
        let spawned = std::thread::Builder::new().name("games".into()).spawn(move || {
            let _ = tx.send(Event::GamesDetected(service.detect(&roots)));
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
        let service = self.game_service.clone();
        let spawned = std::thread::Builder::new().name("pick".into()).spawn(move || {
            let picked = service.pick(dry_run(), fake);
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
        match self.game_service.register(exe) {
            Ok(id) => {
                self.log("manual_game", json!({ "action": "add", "id": format!("manual:{id}") }));
                self.manual_result(true, "登録しました。一覧に「手動登録」として並びます");
                self.scan_games();
            }
            Err(reason) => self.manual_result(false, reason),
        }
    }

    fn edit_manual_game(&mut self, id: &str, name: Option<String>) {
        if let Some(action) = self.game_service.edit(id, name) {
            self.log("manual_game", json!({ "action": action, "id": id }));
            self.scan_games();
        }
    }

    fn on_games_detected(&mut self, detected: games::Detected) {
        let list = detected.games;
        // Minecraft のランチャー (#128)。一覧には混ぜず、画面の固定の項目に画像を付けるためだけに使う
        self.minecraft = detected.minecraft.as_ref().map(|m| m.image.is_some());
        self.minecraft_launch = detected.minecraft.as_ref().map(|m| m.launch.clone());
        self.games_scanning = false;
        if std::mem::take(&mut self.rescan_pending) {
            self.scan_games();
        }
        // ゲーム名・インストール先はログに残さない (件数だけ)
        let count = |src: &str| list.iter().filter(|g| g.source == src).count();
        let mut counts = json!({ "steam": count("steam"), "epic": count("epic"), "registered": count(games::MANUAL_SOURCE) });
        if let (Some(m), serde_json::Value::Object(more)) = (counts.as_object_mut(), crate::launchers::counts(&list)) {
            m.extend(more);
        }
        self.log("games_detected", counts);
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
    /// Minecraft を一覧の起動と同じ流れで扱うための項目 (#55)。公式ランチャーを開くだけで、「プレイ」はランチャーで押す
    fn minecraft_entry(&self) -> Option<games::Entry> {
        game_service::minecraft_entry(self.minecraft_launch.as_deref())
    }

    fn launch_game(&mut self, id: &str) {
        let found = self.games.iter().find(|g| g.id == id).cloned().or_else(|| self.minecraft_entry().filter(|m| m.id == id));
        let Some(entry) = found else {
            // ランチャーが見つからない Minecraft・疑似ゲーム画面・未知の id は起動しない
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
        if !dry_run() && (self.target_ok || self.game_service.exists(&self.target)) {
            let message = match self.game_service.activate(&self.target) {
                Ok(()) => format!("{}はすでに起動しています。前面にしました。準備してReadyを押すと開始します", entry.name),
                Err(reason) => format!("{}はすでに起動しています（{}）。手動で前面にしてください", entry.name, reason),
            };
            self.log("launch_result", json!({ "id": entry.id, "state": "started", "running": true }));
            self.finish_launch(&entry.id, &entry.name, "started", message);
            return;
        }
        self.launch_gen += 1;
        let gen = self.launch_gen;
        let minecraft = entry.source == games::MINECRAFT_SOURCE;
        let message = if dry_run() { format!("dry-run：{}は起動しません", entry.name) }
            else if minecraft { "Minecraftのランチャーを開きました。ランチャーで「プレイ」を押してください".into() }
            else { format!("{}を起動しています", entry.name) };
        self.log("launch_game", json!({ "id": entry.id, "source": entry.source }));
        // ランチャーへの要求 (ShellExecuteW) は Steam の起動待ちで数秒かかる (実機で約5秒)。
        // このスレッドで待つと入力・生存確認が止まり切断扱いになるので、別スレッドで行う
        if !dry_run() {
            let tx = self.tx.clone();
            let target = entry.clone();
            let service = self.game_service.clone();
            let spawned = std::thread::Builder::new().name("launch".into()).spawn(move || {
                let _ = tx.send(Event::Launched { gen, result: service.launch(&target) });
            });
            if spawned.is_err() {
                self.finish_launch(&entry.id, &entry.name, "failed", format!("起動できませんでした。{}を手動で起動してください", entry.name));
                return;
            }
        }
        // Minecraft はランチャーで「プレイ」を押す (ログイン・更新もある) ので長めに待つ
        let timeout = game_service::launch_timeout(minecraft);
        self.launch = Some(Launch { id: entry.id, name: entry.name, state: "launching", message, gen, deadline: Instant::now() + timeout, seen: None });
        self.schedule(Instant::now() + LAUNCH_POLL, Timer::LaunchWatch(gen));
        self.push_game();
        self.push_state();
    }

    fn on_launched(&mut self, gen: u64, result: Result<(), String>) {
        let Some(l) = self.launch.as_ref().filter(|l| l.current(gen)) else { return };
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
        let Some(l) = self.launch.as_ref().filter(|l| l.current(gen)) else { return };
        let id = l.id.clone();
        let appeared = match self.fake_target {
            Some(ok) => ok,
            None => !dry_run() && (self.target_ok || self.game_service.exists(&self.target)),
        };
        let activation = if !appeared || self.fake_target.is_some() || self.target_ok { Ok(()) }
            else { self.game_service.activate(&self.target) };
        let (state, message) = match self.launch.as_mut().unwrap().observe(gen, Instant::now(), appeared, activation) {
            Watch::Ignore => return,
            Watch::Wait => { self.schedule(Instant::now() + LAUNCH_POLL, Timer::LaunchWatch(gen)); return; }
            Watch::Complete { state, message } => (state, message),
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
        if mode != InjectMode::Off && (self.fault_stop_pending || !self.release_pending.is_empty()) {
            self.log("inject_mode_rejected", json!({ "reason": "release unconfirmed" }));
            self.push_game(); self.push_state(); return;
        }
        let fault_before = self.input_fault;
        if self.inject != mode { self.release_outputs(None); self.reset_look(); self.advance_epoch(); }
        if mode != InjectMode::Off && self.input_fault {
            if !fault_before || !self.release_pending.is_empty() {
                self.inject = InjectMode::Off; self.push_game(); self.push_state(); return;
            }
            self.input_fault = false; self.release_retry_gen += 1; self.release_retry_active = false;
        }
        self.inject = mode;
        if mode == InjectMode::Off { self.start_release_retry(); }
        self.log("inject_mode", json!({ "mode": mode.name() }));
        self.push_game(); self.push_state();
    }

    // 送出関数から再入させない。専用タイマーで停止効果を1回だけ適用する。
    fn stop_input_failure(&mut self) {
        if !std::mem::take(&mut self.fault_stop_pending) { return; }
        self.inject = InjectMode::Off; self.game.auto_resume_until = 0;
        if self.game.phase == Phase::Coop { self.set_phase(Phase::Paused, "input failure"); }
        else {
            self.release_outputs(None); self.reset_look();
            self.game.reason = Some("input failure".into()); self.advance_epoch(); self.push_game();
        }
        self.retry_pending_outputs();
        self.log("input_failure", json!({ "unconfirmed": self.release_pending.iter().map(|&i| OUTPUTS[i].id).collect::<Vec<_>>() }));
        self.start_release_retry(); self.push_state();
    }

    fn start_release_retry(&mut self) {
        self.release_retry_gen += 1; self.release_retry_attempts = 0;
        self.release_retry_active = !self.release_pending.is_empty();
        if self.release_retry_active {
            self.schedule(Instant::now() + Duration::from_millis(50), Timer::ReleaseRetry(self.release_retry_gen));
        }
    }

    fn retry_pending_outputs(&mut self) {
        for idx in self.release_pending.clone() { self.apply_output(idx, false, "system"); }
    }

    fn retry_releases(&mut self, gen: u64) {
        if !self.release_retry_active || gen != self.release_retry_gen { return; }
        self.release_retry_attempts += 1;
        self.retry_pending_outputs();
        if self.release_pending.is_empty() || self.release_retry_attempts >= 3 {
            self.release_retry_active = false; self.release_retry_gen += 1;
        } else { self.schedule(Instant::now() + Duration::from_millis(50), Timer::ReleaseRetry(gen)); }
        self.push_state();
    }

    fn release_for_shutdown(&mut self) -> bool {
        self.inject = InjectMode::Off; self.game.auto_resume_until = 0;
        self.release_outputs(None); self.reset_look();
        // 終了直前はタイマーが動かないため、ここだけ有限回の同期再解放を行う。
        for _ in 0..3 {
            if self.release_pending.is_empty() { break; }
            std::thread::sleep(Duration::from_millis(50));
            self.retry_pending_outputs();
        }
        let confirmed = self.release_pending.is_empty();
        self.log("shutdown", json!({ "releaseConfirmed": confirmed,
            "unconfirmed": self.release_pending.iter().map(|&i| OUTPUTS[i].id).collect::<Vec<_>>() }));
        let _ = self.log_file.flush(); confirmed
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
        s.disconnected_at = now_ms();
        let released: Vec<String> = std::mem::take(&mut s.pressed).into_iter().collect();
        self.release_outputs(Some(SLOT_NAMES[idx]));
        self.log("disconnect", json!({ "slot": SLOT_NAMES[idx], "reason": reason, "released": released }));
        if self.game.phase == Phase::Preparing {
            self.release_outputs(None);
            self.reset_look();
            self.advance_epoch();
        }
        // 協力プレイ中に誰かが切れたら共同入力を止める (ホストの交代はロビーでだけ行う、#223)
        let now = now_ms();
        let plan = session::disconnect_plan(self.game.phase, self.game.reason.as_deref(), self.participants.contains(&idx),
            reason == "replaced", now, self.game.auto_resume_until);
        if plan.pause_or_wait {
            if plan.extend_deadline { self.game.auto_resume_until = now + self.game.auto_resume_ms; }
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

    /// 移した枠の端末を 4008 で閉じ、同じトークンの再接続で新しい枠へ戻す。welcome と WebRTC を作り直す
    fn reconnect_slot(&mut self, idx: usize, now: u64) {
        let Some(slot) = self.slots[idx].as_mut() else { return };
        let conn = slot.conn.take();
        slot.connected = false;
        slot.disconnected_at = now;
        slot.rtc = None;
        slot.rtc_state = "none";
        slot.rtc_gen += 1;
        slot.ibuf.clear();
        // 閉じる通知で移動前の枠を切断扱いにしない
        if let Some(c) = conn.and_then(|id| self.conns.get_mut(&id)) { c.role = Role::Unknown; }
        self.close(conn, CLOSE_HOST_HANDOVER, "host handover");
    }

    /// 現在のホストが、ロビーで接続中の別の人へホストを譲る (#233)。2 つの枠を入れ替える
    fn transfer_host(&mut self, from: usize, to: usize) {
        if !session::can_transfer_host(self.game.phase, from, to, &self.connected_slots()) { return; }
        self.release_outputs(None);
        self.reset_look();
        self.slots.swap(0, to);
        let now = now_ms();
        self.reconnect_slot(0, now);
        self.reconnect_slot(to, now);
        self.lineup = None;
        self.seats = [0, 1, 2, 3];
        self.role_ack.clear();
        self.advance_epoch();
        self.log("host_transfer", json!({ "to": SLOT_NAMES[to] }));
        self.push_game();
        self.push_state();
    }

    /// ロビーで戻らない枠を解放し、P1 が空いたら接続中で最も若い枠をホストにする (#223)。
    /// P1 = ホストの前提を変えないよう枠ごと P1 へ移し、接続は 4008 で閉じる。スマホは通常の再接続で
    /// 同じトークンのまま P1 として戻り、welcome と WebRTC が作り直される。元のホストは参加者として戻る。
    fn release_lobby_slots(&mut self, now: u64) {
        if self.game.phase != Phase::Lobby { return; }
        let mut changed = false;
        for i in 0..MAX_SLOTS {
            let expired = self.slots[i].as_ref().is_some_and(|s| session::lobby_slot_expired(self.game.phase, s.connected, s.disconnected_at, now));
            if expired {
                self.slots[i] = None;
                self.log("slot_released", json!({ "slot": SLOT_NAMES[i] }));
                changed = true;
            }
        }
        if self.slots[0].is_none() {
            if let Some(from) = session::next_host(&self.connected_slots()) {
                self.release_outputs(None);
                self.reset_look();
                self.slots[0] = self.slots[from].take();
                self.reconnect_slot(0, now);
                self.lineup = None;
                self.seats = [0, 1, 2, 3];
                self.role_ack.clear();
                self.advance_epoch();
                self.log("host_handover", json!({ "from": SLOT_NAMES[from] }));
                changed = true;
            }
        }
        if changed {
            self.push_game();
            self.push_state();
        }
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
                self.release_lobby_slots(now);
                self.rotate_roles_if_due(now);
                self.update_low_latency();
                self.net_tick += 1;
                if self.net_tick % 10 == 0 {
                    self.report_net();
                }
                self.push_state();
                let start = crate::runtime_measure::start();
                let _ = self.log_file.flush();
                crate::runtime_measure::elapsed("log_flush_us", start);
                self.schedule(at + Duration::from_secs(1), Timer::Heartbeat);
            }
            Timer::StateFlush => {
                self.state_pending = false;
                self.push_state();
            }
            Timer::Pump(idx, gen) => {
                if self.outputs[idx].on_timer(gen) {
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
            Timer::InputFaultStop(gen) => { if self.input_fault && gen == self.fault_stop_gen { self.stop_input_failure(); } }
            Timer::ReleaseRetry(gen) => self.retry_releases(gen),
            Timer::LaunchWatch(gen) => self.watch_launch(gen),
        }
    }

    // ---------- イベント ----------

    fn on_event(&mut self, ev: Event) {
        match ev {
            Event::WsOpen { id, tx, queued, ip, loopback } => {
                self.conns.insert(id, Conn { tx, queued, ip, loopback, role: Role::Unknown });
            }
            Event::WsText { id, text, enqueued_at } => {
                if let Some(msg) = protocol::parse_json(&text) {
                    if let Some(Conn { role:Role::Player {slot}, .. })=self.conns.get(&id) {
                        crate::input_trace::received(*slot,"ws",&msg,enqueued_at);
                    }
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
            Event::RtcMessage { slot, gen, text, received_at } => {
                if self.rtc_owner(slot, gen).is_some() {
                    if let Some(msg) = protocol::parse_json(&text) {
                        crate::input_trace::received(slot,"rtc",&msg,received_at);
                        self.handle_player_message(slot, msg, Via::Rtc);
                    }
                }
            }
            Event::EmergencyStop { source, .. } => self.emergency_stop(source),
            Event::ManualPicked(picked) => self.on_manual_picked(picked),
            Event::FakeRotationDue => { if self.rotation_at != 0 { self.rotation_at = 1; self.rotate_roles_if_due(now_ms()); } }
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
            Event::FakeCursor(free) => {
                if self.fake_target.is_some() {
                    self.fake_cursor = free;
                    self.check_target();
                }
            }
            Event::FakeActivate(ok) => {
                if self.fake_target.is_some() { self.fake_activate = ok; }
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
            "rotation" => {
                let secs = msg.get("seconds").and_then(Value::as_u64).unwrap_or(0);
                if self.game.phase != Phase::Coop && session::ROTATION_CHOICES.contains(&secs) {
                    self.rotation_secs = secs;
                    self.log("rotation", json!({ "seconds": secs }));
                    self.push_game();
                }
            }
            "set_key" => {
                // 協力プレイ中は変えない。変えたら旧キーを解放し、epoch を進めてから新しいキーで送る
                if self.game.phase == Phase::Coop { return; }
                let Some(action) = s(msg, "action") else { return };
                let output = match msg.get("output") { Some(Value::Null) => None, Some(Value::String(id)) if crate::key_overrides::assignable(id) => Some(id.clone()), _ => return };
                if !self.profile.as_ref().is_some_and(|p| p.actions.iter().any(|a| a.id == action && a.kind == "button")) { return; }
                self.key_overrides.entry(self.game.title.clone()).or_default().insert(action.clone(), output.clone());
                self.log("set_key", json!({ "action": action, "output": output }));
                self.apply_key_change();
            }
            "reset_keys" => {
                if self.game.phase == Phase::Coop { return; }
                if self.key_overrides.remove(&self.game.title).is_some() {
                    self.log("reset_keys", json!({}));
                    self.apply_key_change();
                }
            }
            "change_players" => {
                if msg.get("epoch").and_then(Value::as_u64) == Some(self.game.epoch) { self.change_players(); }
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
                self.reset_look();
                self.game.phase = Phase::Lobby;
                self.game.host_ready = false;
                self.game.reason = None;
                self.game.auto_resume_until = 0;
                // 前回の協力プレイの参加者・分担を残さない (#212)
                self.assigned.clear();
                self.participants.clear();
                self.lineup = None;
                self.seats = [0, 1, 2, 3];
                self.role_ack.clear();
                self.advance_epoch();
                self.update_low_latency();
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
        slot.release_floor = 0;
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
                let decoded = CommandMessage::decode(&msg);
                let cmd = decoded.cmd;
                self.log("command", json!({ "slot": SLOT_NAMES[idx], "cmd": cmd }));
                if !session::command_epoch_valid(&cmd, decoded.epoch, self.game.epoch) {
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
                    match msg.get("iseq").and_then(Value::as_i64) {
                        // 送信した本人の入力だけを解放する。他の参加者の押しっぱなしと進行状態(epoch)は変えない (#262)
                        Some(floor) => self.release_slot_inputs(idx, floor),
                        // 旧版のスマホ (iseqなし) は従来どおり全参加者を解放してepochを進める
                        None => { self.release_outputs(None); self.reset_look(); self.advance_epoch(); self.push_game(); }
                    }
                }
            }
            "remote" if via == Via::Ws => self.remote_message(idx, &msg),
            // 新しい担当をスマホで確認した (#47)
            "transfer_host" if via == Via::Ws => {
                if msg.get("epoch").and_then(Value::as_u64) != Some(self.game.epoch) { return; }
                let to = s(&msg, "to").and_then(|name| SLOT_NAMES.iter().position(|n| *n == name));
                if let Some(to) = to { self.transfer_host(idx, to); }
            }
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
        let Some(msg) = InputMessage::decode(msg) else { return };
        let iseq = msg.iseq;
        let slot = self.slots[idx].as_mut().unwrap();
        if iseq < slot.next_iseq || slot.ibuf.contains_key(&iseq) {
            return;
        }
        if crate::input_trace::start().is_some() {
            crate::input_trace::event("buffer",json!({"slot":SLOT_NAMES[idx],"epoch":msg.epoch,"iseq":iseq,"via":via.name(),"next":slot.next_iseq}));
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

    fn process_input(&mut self, idx: usize, msg: InputMessage, via: Via) {
        if crate::input_trace::start().is_some() {
            let output=self.resolve_control(idx,&msg.button).map(|i| OUTPUTS[i].id);
            crate::input_trace::event("accepted",json!({"slot":SLOT_NAMES[idx],"epoch":msg.epoch,"iseq":msg.iseq,"via":via.name(),"out":output,"state":msg.state,"stale":msg.epoch!=Some(self.game.epoch)}));
        }
        let button = msg.button;
        let state = msg.state;
        let burst = msg.burst;
        let epoch = msg.epoch;
        if epoch != Some(self.game.epoch) {
            // 前の進行状態で押された入力 (PAUSE / RESUME の直前に送られて遅れて届いたもの)。
            // 状態の変更時に全出力を解放済みなので、押下も解放も新しい状態では処理しない。番号は消費して ACK だけ返す
            let conn = self.slots[idx].as_ref().unwrap().conn;
            self.send(conn, &json!({ "type": "ack", "iseq": msg.raw.get("iseq"), "t": msg.raw.get("t"), "via": via.name(), "stale": true }));
            let current = self.game.epoch;
            self.record(
                "stale_input",
                json!({ "slot": SLOT_NAMES[idx], "button": button, "state": state, "epoch": epoch, "current": current }),
            );
            return;
        }
        // 本人の解放要求より前に送られた押下が、順序待ちの後に届いたもの。解放後に押しっぱなしを復活させない (#262)
        if state == "down" && msg.iseq <= self.slots[idx].as_ref().unwrap().release_floor {
            let conn = self.slots[idx].as_ref().unwrap().conn;
            self.send(conn, &json!({ "type": "ack", "iseq": msg.raw.get("iseq"), "t": msg.raw.get("t"), "via": via.name(), "stale": true }));
            self.record("stale_input", json!({ "slot": SLOT_NAMES[idx], "button": button, "state": state, "reason": "released" }));
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
        self.send(conn, &json!({ "type": "ack", "iseq": msg.raw.get("iseq"), "t": msg.raw.get("t"), "via": via.name() }));
        let entry = self.record(
            "input",
            json!({ "slot": SLOT_NAMES[idx], "button": button, "state": state, "iseq": msg.raw.get("iseq"), "via": via.name(), "burst": burst }),
        );
        if !burst {
            self.handle_control(idx, &button, &state);
            self.broadcast_monitors(&json!({ "type": "log", "entry": entry }));
        }
        self.push_state_throttled();
    }

    /// 視点は累積値で届くので、欠けたパケットの分も次のパケットで取り戻せる。古いパケットは捨てる
    fn accept_look(&mut self, idx: usize, msg: &Value) {
        let Some(msg) = LookMessage::decode(msg) else { return };
        // 別epochの累積値は現在の基準にも混ぜない。
        if msg.epoch != Some(self.game.epoch) {
            return;
        }
        let lseq = msg.lseq;
        let slot = self.slots[idx].as_mut().unwrap();
        if lseq <= slot.look_seq {
            return;
        }
        if lseq > slot.look_seq + 1 {
            slot.look_lost += (lseq - slot.look_seq - 1) as u64;
        }
        slot.look_seq = lseq;
        let cx = msg.cx;
        let cy = msg.cy;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use crate::input::Input;
    use crate::input::testing::{Operation, RecordingInput};
    use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

    mod measurement {
        use super::*;
        include!("hub_measurement.rs");
    }

    // Hub::newはゲーム探索・設定読込みを行うため使わない。
    // ログはOSの破棄先、入力は明示dry-run。環境変数の変更も実時間sleepも不要。
    fn fixture() -> (Hub, UnboundedReceiver<Out>) {
        fixture_with_input(Box::new(Input::for_test()))
    }

    fn fixture_with_input(input: Box<dyn InputAdapter>) -> (Hub, UnboundedReceiver<Out>) {
        let (tx, _rx) = std::sync::mpsc::channel();
        let log_file = BufWriter::new(File::options().write(true)
            .open(if cfg!(windows) { "NUL" } else { "/dev/null" }).unwrap());
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
                auto_resume: false,
                auto_resume_ms: 15000,
                auto_resume_until: 0,
                epoch: 1,
                title: DEFAULT_TITLE.to_string(),
            },
            inject: InjectMode::On,
            game_service: GameService::new(),
            release_pending: BTreeSet::new(), input_fault: false,
            fault_stop_gen: 0, fault_stop_pending: false, release_retry_gen: 0, release_retry_attempts: 0, release_retry_active: false,
            outputs: OUTPUTS.iter().map(|_| OutputState::default()).collect(),
            look: Look::new(now, 30.0, 120.0),
            timers: BinaryHeap::new(),
            timer_seq: 0,
            state_pending: false,
            hotkey: Err("未登録".into()),
            target: Target::default(),
            base_target: Target::default(),
            games: Vec::new(),
            images: games::Images::default(),
            picking: false,
            rescan_pending: false,
            streaming: crate::netwatch::StreamingMode::new(),
            low_latency: true,
            bluetooth_audio: false,
            net_tick: 0,
            minecraft: None,
            minecraft_launch: None,
            games_scanning: false,
            launch: None,
            launch_gen: 0,
            target_fg: None,
            target_ok: true,
            fake_activate: true,
            keybinds: Keybinds::none(),
            minecraft_options: None,
            profiles: Vec::new(),
            profile: None,
            assigned: Vec::new(),
            participants: Vec::new(),
            lineup: None,
            seats: [0, 1, 2, 3],
            key_overrides_path: None,
            key_overrides: Default::default(),
            rotation_secs: 0,
            rotation_at: 0,
            role_ack: Vec::new(),
            fake_target: Some(true),
            fake_cursor: false,
            cursor_free: false,
            app_focused: false,
            desktop: false,
        };
        let (monitor_tx, monitor_rx) = unbounded_channel();
        hub.conns.insert(1, Conn { tx: monitor_tx, queued: Default::default(), ip: String::new(), loopback: true,
            role: Role::Monitor { page: Page::Host, focused: false } });
        hub.game.phase = Phase::Coop;
        hub.profile = Some(profiles::builtin_minecraft());
        hub.assigned = vec![vec!["forward".into()], vec!["look".into()], vec!["attack".into()]];
        hub.slots[0] = Some(Slot::new("test1".into(), "test-token1".into()));
        hub.slots[1] = Some(Slot::new("test2".into(), "test-token2".into()));
        (hub, monitor_rx)
    }

    fn index(id: &str) -> usize { OUTPUTS.iter().position(|o| o.id == id).unwrap() }

    fn injections(rx: &mut UnboundedReceiver<Out>) -> Vec<Value> {
        let mut result = Vec::new();
        while let Ok(Out::Text(t)) = rx.try_recv() {
            let v: Value = serde_json::from_str(&t).unwrap();
            if v["type"] == "inject" { result.push(v["entry"].clone()); }
        }
        result
    }

    // 待ちタイマーを実時間で待たず、前回出力を十分過去へ移して処理する。
    fn finish_wait(hub: &mut Hub, idx: usize) {
        hub.outputs[idx].changed_at = Some(Instant::now() - Duration::from_secs(1));
        let gen = hub.outputs[idx].timer_gen;
        hub.on_timer(Timer::Pump(idx, gen), Instant::now());
    }

    #[test]
    fn shared_key_stays_down_until_the_last_holder_releases() {
        let (mut h, mut rx) = fixture();
        let i = index("KEY_W");
        h.set_output(i, "P1", true);
        h.set_output(i, "P2", true);
        h.set_output(i, "P1", true); // 同一所有者の重複down
        h.set_output(i, "P1", false);
        assert!(h.outputs[i].physical);
        assert_eq!(h.outputs[i].holders, BTreeSet::from(["P2"]));
        assert!(h.outputs[i].queue.is_empty());
        h.set_output(i, "P2", false);
        finish_wait(&mut h, i);
        assert!(!h.outputs[i].physical);
        let out = injections(&mut rx);
        assert_eq!(out.iter().map(|v| v["state"].as_str().unwrap()).collect::<Vec<_>>(), ["down", "up"]);
    }

    #[test]
    fn partial_release_preserves_other_holders_and_full_release_clears_every_output() {
        let (mut h, mut rx) = fixture();
        let key = index("KEY_W");
        let mouse = index("MOUSE_L");
        h.set_output(key, "P1", true);
        h.set_output(key, "P2", true);
        h.set_output(mouse, "P3", true);
        h.release_outputs(Some("P1"));
        assert!(h.outputs[key].physical);
        assert!(h.outputs[mouse].physical);
        h.release_outputs(None);
        assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty() && !s.timer_pending));
        let out = injections(&mut rx);
        assert_eq!(out.iter().filter(|v| v["state"] == "up").count(), 2);
    }

    #[test]
    fn rapid_taps_wait_for_60ms_hold_and_50ms_gap_in_order() {
        assert_eq!(MIN_HOLD_MS, 60);
        assert_eq!(MIN_GAP_MS, 50);
        let (mut h, mut rx) = fixture();
        let i = index("KEY_W");
        h.set_output(i, "P1", true);
        // 未来のchanged_atでelapsedを0に固定し、マシン負荷による時間経過を排除する。
        h.outputs[i].changed_at = Some(Instant::now() + Duration::from_secs(60));
        let before_hold = Instant::now();
        h.set_output(i, "P1", false);
        let after_hold = Instant::now();
        let hold_due = h.timers.iter().find_map(|Reverse((at, _, timer))|
            (*timer == Timer::Pump(i, h.outputs[i].timer_gen)).then_some(*at)).unwrap();
        assert!(hold_due >= before_hold + Duration::from_millis(60));
        assert!(hold_due <= after_hold + Duration::from_millis(60));
        h.set_output(i, "P1", true);
        h.set_output(i, "P1", false);
        assert!(h.outputs[i].physical);
        assert!(h.outputs[i].timer_pending);
        assert_eq!(h.outputs[i].queue.iter().map(|x| x.0).collect::<Vec<_>>(), [false, true, false]);
        finish_wait(&mut h, i); // upの後、次のdownはgap待ち
        assert!(!h.outputs[i].physical);
        assert!(h.outputs[i].timer_pending);
        assert_eq!(h.outputs[i].queue.front().unwrap().0, true);
        let after_gap = Instant::now();
        let gap_due = h.timers.iter().find_map(|Reverse((at, _, timer))|
            (*timer == Timer::Pump(i, h.outputs[i].timer_gen)).then_some(*at)).unwrap();
        assert!(gap_due >= h.outputs[i].changed_at.unwrap() + Duration::from_millis(50));
        assert!(gap_due <= after_gap + Duration::from_millis(50));
        finish_wait(&mut h, i); // downの後、次のupはhold待ち
        assert!(h.outputs[i].physical);
        assert!(h.outputs[i].timer_pending);
        finish_wait(&mut h, i);
        assert!(!h.outputs[i].physical);
        assert!(h.outputs[i].queue.is_empty());
        assert_eq!(injections(&mut rx).iter().map(|v| v["state"].as_str().unwrap()).collect::<Vec<_>>(), ["down", "up", "down", "up"]);
    }

    #[test]
    fn saturated_tap_queue_drops_old_pairs_and_keeps_latest_eight_edges() {
        assert_eq!(MAX_QUEUE, 8);
        let (mut h, _rx) = fixture();
        let i = index("KEY_W");
        h.set_output(i, "P1", true);
        h.outputs[i].changed_at = Some(Instant::now() + Duration::from_secs(60));
        let mut expected = VecDeque::new();
        let mut holder = "P1";
        for next in ["P2", "P3", "P4", "P1", "P2", "P3"] {
            h.set_output(i, holder, false);
            h.set_output(i, next, true);
            expected.push_back((false, holder));
            expected.push_back((true, next));
            holder = next;
        }
        expected.drain(..4);
        assert_eq!(h.outputs[i].queue.len(), 8);
        assert_eq!(h.outputs[i].queue, expected);
        assert_eq!(h.outputs[i].holders, BTreeSet::from(["P3"]));
    }

    #[test]
    fn safety_release_bypasses_minimum_hold_and_invalidates_old_pump_generation() {
        let (mut h, mut rx) = fixture();
        let i = index("KEY_W");
        h.set_output(i, "P1", true);
        h.outputs[i].changed_at = Some(Instant::now() + Duration::from_secs(60));
        h.set_output(i, "P1", false);
        h.set_output(i, "P1", true);
        let old = h.outputs[i].timer_gen;
        h.release_outputs(None);
        assert!(!h.outputs[i].physical);
        assert!(h.outputs[i].queue.is_empty());
        assert!(h.outputs[i].timer_gen > old);
        assert!(!h.outputs[i].timer_pending);
        // 新しい押下がgap待ちになっても、旧世代タイマーでは早期送出しない。
        h.set_output(i, "P1", true);
        let current = h.outputs[i].timer_gen;
        h.outputs[i].changed_at = Some(Instant::now() - Duration::from_secs(1));
        h.on_timer(Timer::Pump(i, old), Instant::now());
        assert!(!h.outputs[i].physical);
        assert!(h.outputs[i].timer_pending);
        assert_eq!(h.outputs[i].timer_gen, current);
        h.on_timer(Timer::Pump(i, current), Instant::now());
        assert!(h.outputs[i].physical);
        assert_eq!(injections(&mut rx).len(), 3);
    }

    #[test]
    fn pause_and_emergency_stop_discard_pending_look_and_taps_without_restoring_them() {
        for emergency in [false, true] {
            let (mut h, _rx) = fixture();
            let i = index("KEY_W");
            h.set_output(i, "P1", true);
            h.outputs[i].changed_at = Some(Instant::now() + Duration::from_secs(60));
            h.set_output(i, "P1", false);
            h.set_output(i, "P1", true);
            h.look.px = 100.0; h.look.py = -50.0; h.look.fx = 0.4; h.look.fy = -0.3;
            let old_epoch = h.game.epoch;
            if emergency { h.emergency_stop("test"); }
            else { h.set_phase(Phase::Paused, "host pause"); }
            assert!(h.game.phase == Phase::Paused);
            assert_eq!(h.game.epoch, old_epoch + 1);
            assert_eq!((h.look.px, h.look.py, h.look.fx, h.look.fy), (0.0, 0.0, 0.0, 0.0));
            assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty()));
            if emergency { assert!(h.inject == InjectMode::Off); }
            // OS設定を呼ぶ状態遷移を増やさず再開後のtickを直接再現する。
            h.game.phase = Phase::Coop;
            h.look_tick();
            assert_eq!((h.look.sum_x, h.look.sum_y, h.look.n), (0, 0, 0));
            assert!(!h.outputs[i].physical);
        }
    }

    #[test]
    fn session_transition_notifies_release_before_new_epoch_and_cannot_restore_old_work() {
        let (mut h, mut rx) = fixture();
        h.set_output(index("KEY_W"), "P1", true);
        h.set_output(index("MOUSE_L"), "P3", true);
        h.look.px = 40.0; h.look.fx = 0.4;
        while rx.try_recv().is_ok() {}
        let old_epoch = h.game.epoch;
        h.set_phase(Phase::Paused, "host pause");
        let mut messages = Vec::new();
        while let Ok(Out::Text(text)) = rx.try_recv() { messages.push(serde_json::from_str::<Value>(&text).unwrap()); }
        let phase = messages.iter().position(|m| m["type"] == "log" && m["entry"]["kind"] == "phase").unwrap();
        let game = messages.iter().position(|m| m["type"] == "game").unwrap();
        let ups: Vec<_> = messages.iter().enumerate().filter(|(_, m)| m["type"] == "inject" && m["entry"]["state"] == "up").collect();
        assert_eq!(ups.len(), 2);
        assert!(ups.iter().all(|(i, _)| *i < phase));
        assert!(phase < game);
        assert_eq!(messages[phase]["entry"]["epoch"], old_epoch + 1);
        assert_eq!(messages[game]["game"]["epoch"], old_epoch + 1);
        assert_eq!(messages[game]["game"]["phase"], "paused");
        assert_eq!((h.look.px, h.look.fx), (0.0, 0.0));
        assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty()));
        h.command(0, "PAUSE");
        assert_eq!(h.game.epoch, old_epoch + 2); // 同phaseのホスト停止も失効処理を省略しない。
        assert_eq!(h.game.auto_resume_until, 0);
    }

    #[test]
    fn decoded_non_finite_look_cannot_poison_the_next_valid_cumulative_input() {
        let (mut h, _rx) = fixture();
        for field in ["lseq", "cx", "cy"] {
            let mut msg = json!({"epoch":1,"lseq":1,"cx":10,"cy":4});
            msg[field] = json!("NaN"); h.accept_look(1, &msg);
            assert_eq!(h.slots[1].as_ref().unwrap().look_seq, 0);
            assert_eq!((h.look.px, h.look.py), (0.0, 0.0));
        }
        h.accept_look(1, &json!({"epoch":1,"lseq":"1.9","cx":"10","cy":4}));
        assert_eq!((h.look.px, h.look.py), (10.0, 4.0));
        h.accept_look(1, &json!({"epoch":0,"lseq":2,"cx":100,"cy":400}));
        assert_eq!((h.look.px, h.look.py), (10.0, 4.0));
    }

    #[test]
    fn decoded_input_keeps_ack_wire_values_and_does_not_consume_invalid_sequence() {
        let (mut h, _rx) = fixture();
        h.keybinds = Keybinds::build(h.profile.as_ref().unwrap(), None);
        let (tx, mut rx) = unbounded_channel();
        h.conns.insert(90, Conn { tx, queued: Default::default(), ip: String::new(), loopback: false, role: Role::Player { slot: 0 } });
        h.slots[0].as_mut().unwrap().conn = Some(90);
        h.accept_input(0, json!({"iseq":"NaN","epoch":1,"button":"act:forward","state":"down"}), Via::Rtc);
        assert_eq!(h.slots[0].as_ref().unwrap().next_iseq, 1);
        assert!(h.slots[0].as_ref().unwrap().ibuf.is_empty());
        h.accept_input(0, json!({"iseq":"1.9","epoch":1,"button":"act:forward","state":"down","t":"wire-time"}), Via::Ws);
        let Out::Text(text) = rx.try_recv().unwrap() else { panic!("ACKが必要") };
        let ack: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(ack["iseq"], "1.9"); assert_eq!(ack["t"], "wire-time");
        assert!(h.outputs[index("KEY_W")].physical);
        h.accept_input(0, json!({"iseq":1,"epoch":1,"button":"act:forward","state":"up"}), Via::Rtc);
        assert!(h.outputs[index("KEY_W")].physical); // 後着重複は解放しない。
        h.release_outputs(None);
    }

    #[test]
    fn unauthenticated_json_cannot_enter_input_or_management_handlers() {
        let recorder = crate::input::testing::RecordingInput::default();
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        let (tx, _rx) = unbounded_channel();
        h.on_event(Event::WsOpen { id: 90, tx, queued: Default::default(), ip: String::new(), loopback: false });
        let epoch = h.game.epoch;
        for msg in [json!({"type":"input","iseq":1,"epoch":epoch,"button":"act:forward","state":"down"}),
            json!({"type":"inject_mode","mode":"off"}), json!({"type":"reset"}), json!({"type":"command","cmd":"PAUSE"})] {
            h.on_event(Event::WsText { id:90, text:msg.to_string(), enqueued_at: None });
        }
        assert!(recorder.calls().is_empty()); assert_eq!(h.game.epoch, epoch); assert!(h.game.phase == Phase::Coop);
    }

    #[test]
    fn stale_launch_completions_and_watchers_cannot_overwrite_a_new_selection() {
        let (mut h, _rx) = fixture();
        h.launch_gen = 7;
        h.launch = Some(Launch { id: "minecraft-java".into(), name: "Minecraft".into(), state: "launching",
            message: "待機".into(), gen: 7, deadline: Instant::now() + Duration::from_secs(300), seen: None });
        h.on_launched(6, Err("旧結果".into())); h.watch_launch(6);
        assert_eq!(h.launch.as_ref().unwrap().message, "待機");
        h.set_output(index("KEY_W"), "P1", true); h.look.px = 20.0;
        let epoch = h.game.epoch;
        h.select_title("pseudo-game".into());
        assert!(h.launch.is_none()); assert!(h.game.phase == Phase::Lobby); assert!(h.game.epoch > epoch);
        assert!(h.outputs.iter().all(|s| !s.physical && s.queue.is_empty())); assert_eq!(h.look.px, 0.0);
        h.on_launched(7, Err("切替前の結果".into())); h.watch_launch(7);
        assert!(h.launch.is_none()); assert_eq!(h.game.title, "pseudo-game");
    }

    #[test]
    fn game_backend_focus_loss_releases_all_outputs_and_invalidates_old_work() {
        struct MissingWindow;
        impl game_service::GameBackend for MissingWindow {
            fn roots(&self) -> games::Roots { panic!("探索しない") }
            fn detect(&self, _: &games::Roots) -> games::Detected { panic!("探索しない") }
            fn foreground(&self) -> Option<Foreground> { None }
            fn exists(&self, _: &Target) -> bool { false }
            fn activate(&self, _: &Target) -> Result<(), String> { Err("拒否".into()) }
            fn launch(&self, _: &Entry) -> Result<(), String> { panic!("起動しない") }
            fn pick_exe(&self) -> Option<PathBuf> { panic!("選択しない") }
        }
        let recorder = crate::input::testing::RecordingInput::default();
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.game_service = GameService::with_backend(std::sync::Arc::new(MissingWindow));
        h.set_output(index("KEY_W"), "P1", true); h.set_output(index("MOUSE_L"), "P3", true);
        h.look.px = 40.0; h.fake_target = None;
        let epoch = h.game.epoch; h.check_target();
        assert!(!h.can_inject()); assert_eq!(h.game.epoch, epoch + 1);
        assert_eq!(h.look.px, 0.0);
        assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty()));
        assert_eq!(recorder.calls().len(), 4);
    }

    #[test]
    fn cumulative_look_recovers_missing_packets_rejects_duplicates_and_old_epoch() {
        let (mut h, _rx) = fixture();
        let epoch = h.game.epoch;
        h.accept_look(1, &json!({"epoch":epoch,"lseq":1,"cx":10.0,"cy":-4.0}));
        h.accept_look(1, &json!({"epoch":epoch,"lseq":3,"cx":25.0,"cy":-10.0}));
        h.accept_look(1, &json!({"epoch":epoch,"lseq":2,"cx":1000.0,"cy":1000.0}));
        h.accept_look(1, &json!({"epoch":epoch,"lseq":3,"cx":2000.0,"cy":2000.0}));
        assert_eq!((h.look.px, h.look.py), (25.0, -10.0));
        assert_eq!(h.slots[1].as_ref().unwrap().look_lost, 1);
        h.reset_look();
        h.advance_epoch();
        h.accept_look(1, &json!({"epoch":epoch,"lseq":99,"cx":9000.0,"cy":9000.0}));
        assert_eq!(h.slots[1].as_ref().unwrap().look_seq, 0);
        assert_eq!(h.slots[1].as_ref().unwrap().look_cx, 0.0);
        h.accept_look(1, &json!({"epoch":h.game.epoch,"lseq":1,"cx":2.0,"cy":-3.0}));
        assert_eq!((h.look.px, h.look.py), (2.0, -3.0));
    }

    #[test]
    fn look_interpolation_conserves_signed_motion_including_fractional_remainder() {
        assert_eq!(LOOK_TICK, Duration::from_millis(4));
        let (mut h, _rx) = fixture();
        h.handle_look(1, 123.75, -52.25);
        for _ in 0..100 {
            h.look.last_tick = Instant::now() - LOOK_TICK;
            h.look_tick();
            let x = h.look.sum_x as f64 + h.look.px + h.look.fx;
            let y = h.look.sum_y as f64 + h.look.py + h.look.fy;
            assert!((x - 123.75).abs() < 1e-9);
            assert!((y + 52.25).abs() < 1e-9);
        }
        assert_eq!((h.look.sum_x, h.look.sum_y), (123, -52));
        assert!((h.look.fx - 0.75).abs() < 1e-9);
        assert!((h.look.fy + 0.25).abs() < 1e-9);
        assert_eq!((h.look.px, h.look.py), (0.0, 0.0));
    }

    #[test]
    fn both_transports_process_each_input_once_in_sequence_after_gap_is_filled() {
        for first in [Via::Ws, Via::Rtc] {
            let other = if first == Via::Ws { Via::Rtc } else { Via::Ws };
            let (mut h, _rx) = fixture();
            let msg = |iseq, state| json!({"iseq":iseq,"epoch":1,"button":"act:forward","state":state,"burst":true});
            h.accept_input(0, msg(2, "up"), first);
            h.accept_input(0, msg(2, "up"), other);
            assert_eq!(h.slots[0].as_ref().unwrap().events, 0);
            assert_eq!(h.slots[0].as_ref().unwrap().ibuf.len(), 1);
            h.accept_input(0, msg(1, "down"), other);
            h.accept_input(0, msg(1, "down"), first);
            h.accept_input(0, msg(2, "up"), other);
            let slot = h.slots[0].as_ref().unwrap();
            assert_eq!(slot.next_iseq, 3);
            assert_eq!(slot.events, 2);
            assert_eq!((slot.via_ws, slot.via_rtc), (1, 1));
            assert!(slot.pressed.is_empty());
            assert!(slot.ibuf.is_empty());
        }
    }

    #[test]
    fn stale_input_consumes_sequence_without_changing_pressed_or_output_state() {
        let (mut h, _rx) = fixture();
        h.advance_epoch();
        h.accept_input(0, json!({"iseq":1,"epoch":1,"button":"act:forward","state":"down"}), Via::Rtc);
        let slot = h.slots[0].as_ref().unwrap();
        assert_eq!(slot.next_iseq, 2);
        assert_eq!(slot.events, 0);
        assert!(slot.pressed.is_empty());
        assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty()));
    }
    #[test]
    fn target_loss_and_return_release_all_inputs_and_each_advance_epoch() {
        let (mut h, _rx) = fixture();
        let i = index("MOUSE_L");
        h.set_output(i, "P3", true);
        h.look.px = 25.0;
        h.look.fx = 0.4;
        let epoch = h.game.epoch;
        h.on_event(Event::FakeTarget(false));
        assert!(!h.target_ok);
        assert!(!h.can_inject());
        assert_eq!(h.game.epoch, epoch + 1);
        assert!(h.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty()));
        assert_eq!((h.look.px, h.look.fx), (0.0, 0.0));
        h.on_event(Event::FakeTarget(true));
        assert!(h.target_ok);
        assert_eq!(h.game.epoch, epoch + 2);
        assert!(!h.outputs[i].physical);
    }

    #[test]
    fn look_tick_discards_pending_motion_when_injection_is_off() {
        let (mut h, _rx) = fixture();
        h.look.px = 10.0; h.look.py = -20.0;
        h.look.fx = 0.4; h.look.fy = -0.6;
        h.inject = InjectMode::Off;
        h.look_tick();
        assert_eq!((h.look.px, h.look.py, h.look.fx, h.look.fy), (0.0, 0.0, 0.0, 0.0));
        assert_eq!((h.look.sum_x, h.look.sum_y, h.look.n), (0, 0, 0));
    }

    #[test]
    fn adapter_records_exact_key_button_wheel_and_remote_arguments_in_order() {
        let recorder = RecordingInput::default();
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.apply_output(index("ARROW_UP"), true, "P1");
        h.apply_output(index("ARROW_UP"), false, "P1");
        h.apply_output(index("MOUSE_L"), true, "P1");
        h.apply_output(index("MOUSE_R"), false, "P1");
        h.assigned[0].push("hotbar".into());
        h.handle_control(0, "act:hotbar:up", "down");
        h.handle_control(0, "act:hotbar:down", "down");
        h.handle_control(0, "act:hotbar:down", "up"); // ホイールのupは送出しない。
        h.game.phase = Phase::Paused;
        h.remote_message(0, &json!({"epoch":1,"rseq":1,"kind":"move","dx":3.6,"dy":-2.2}));
        h.remote_message(0, &json!({"epoch":1,"rseq":2,"kind":"scroll","dy":80}));
        let operations: Vec<_> = recorder.calls().into_iter().map(|c| c.operation).collect();
        assert_eq!(operations, [
            Operation::Key { scan: 0x48, ext: true, down: true },
            Operation::Key { scan: 0x48, ext: true, down: false },
            Operation::Button { left: true, down: true },
            Operation::Button { left: false, down: false },
            Operation::Wheel(1), Operation::Wheel(-1),
            Operation::Move { dx: 4, dy: -2 }, Operation::Wheel(-2),
        ]);
    }

    #[test]
    fn adapter_down_failure_is_reported_and_current_state_still_requests_release() {
        let recorder = RecordingInput::with_results([false, true]);
        let (mut h, mut rx) = fixture_with_input(Box::new(recorder.clone()));
        let i = index("KEY_W");
        h.set_output(i, "P1", true);
        // 現行挙動の記録：失敗してもphysicalは先に更新され、後の停止はupを要求する。
        assert!(h.outputs[i].physical);
        h.release_outputs(None);
        assert!(!h.outputs[i].physical);
        let calls = recorder.calls();
        assert_eq!(calls.iter().map(|c| c.ok).collect::<Vec<_>>(), [false, true]);
        assert_eq!(calls[1].operation, Operation::Key { scan: 0x11, ext: false, down: false });
        assert_eq!(injections(&mut rx).iter().map(|v| v["ok"].as_bool().unwrap()).collect::<Vec<_>>(), [false, true]);
    }

    #[test]
    fn adapter_up_failure_is_retained_until_the_fault_stop_retries_it() {
        let recorder = RecordingInput::with_results([true, false]);
        let (mut h, mut rx) = fixture_with_input(Box::new(recorder.clone()));
        let i = index("MOUSE_L");
        h.set_output(i, "P1", true);
        h.release_outputs(None);
        assert!(!h.outputs[i].physical);
        assert!(h.outputs[i].holders.is_empty());
        h.release_outputs(None);
        assert_eq!(recorder.calls().len(), 2);
        h.on_timer(Timer::InputFaultStop(h.fault_stop_gen), Instant::now());
        assert_eq!(recorder.calls().len(), 3);
        assert!(h.release_pending.is_empty());
        assert!(h.input_fault); // 再解放の成功だけでは自動で入力を再開しない。
        let out = injections(&mut rx);
        assert_eq!(out[1]["state"], "up");
        assert_eq!(out[1]["ok"], false);
    }

    #[test]
    fn adapter_partial_release_failure_does_not_skip_other_outputs() {
        let recorder = RecordingInput::with_results([true, true, false, true]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.set_output(index("KEY_W"), "P1", true);
        h.set_output(index("MOUSE_L"), "P2", true);
        h.release_outputs(None);
        let calls = recorder.calls();
        assert_eq!(calls.len(), 4);
        assert_eq!(calls[2].operation, Operation::Key { scan: 0x11, ext: false, down: false });
        assert!(!calls[2].ok);
        assert_eq!(calls[3].operation, Operation::Button { left: true, down: false });
        assert!(calls[3].ok);
        assert!(h.outputs.iter().all(|s| !s.physical && s.queue.is_empty()));
    }

    #[test]
    fn failed_release_stops_every_input_then_retries_without_restoring_old_work() {
        let recorder = RecordingInput::with_results([true, false, false, true]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.set_output(index("KEY_W"), "P1", true); h.look.px = 50.0;
        h.release_outputs(None);
        assert!(h.input_fault); assert!(!h.can_inject()); assert!(h.inject == InjectMode::Off);
        assert!(h.release_pending.contains(&index("KEY_W")));
        h.set_output(index("MOUSE_L"), "P3", true);
        h.handle_look(1, 20.0, 10.0); h.handle_control(0, "REMOTE_WHEEL_UP", "down");
        assert_eq!(recorder.calls().len(), 2);
        let epoch = h.game.epoch;
        h.on_timer(Timer::InputFaultStop(h.fault_stop_gen), Instant::now());
        assert!(h.game.phase == Phase::Paused); assert_eq!(h.game.epoch, epoch + 1);
        assert_eq!(h.game.reason.as_deref(), Some("input failure")); assert_eq!(h.game.auto_resume_until, 0);
        assert_eq!((h.look.px, h.look.py, h.look.fx, h.look.fy), (0.0, 0.0, 0.0, 0.0));
        assert!(h.outputs.iter().all(|s| !s.physical && s.queue.is_empty() && s.holders.is_empty()));
        let old_retry = h.release_retry_gen;
        h.on_timer(Timer::ReleaseRetry(old_retry), Instant::now());
        assert!(h.release_pending.is_empty()); assert!(h.input_fault); assert!(!h.can_resume());
        assert_eq!(recorder.calls().len(), 4);
        h.desktop = true;
        h.app_focused = true;
        assert!(!h.remote_app_active());
        h.set_inject_mode(InjectMode::On);
        assert!(!h.input_fault); assert!(h.can_inject());
        assert!(h.remote_app_active());
        h.on_timer(Timer::ReleaseRetry(old_retry), Instant::now());
        assert_eq!(recorder.calls().len(), 4);
    }

    #[test]
    fn repeated_release_failure_has_three_timer_passes_and_retains_uncertainty_after_reset() {
        let recorder = RecordingInput::with_results(std::iter::once(true).chain(std::iter::repeat(false).take(50)));
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.set_output(index("MOUSE_L"), "P1", true); h.release_outputs(None);
        h.on_timer(Timer::InputFaultStop(h.fault_stop_gen), Instant::now());
        let gen = h.release_retry_gen;
        for _ in 0..10 { h.on_timer(Timer::ReleaseRetry(gen), Instant::now()); }
        assert_eq!(h.release_retry_attempts, 3); assert!(!h.release_retry_active);
        assert_eq!(recorder.calls().len(), 6); // down + 最初のup + 停止時up + タイマー3回。
        for mode in [InjectMode::On, InjectMode::Test] { h.set_inject_mode(mode); assert!(h.inject == InjectMode::Off); }
        let before = recorder.calls().len();
        for _ in 0..10 { h.release_outputs(None); }
        h.on_ws_message(1, json!({"type":"reset"}));
        assert!(h.input_fault); assert!(!h.release_pending.is_empty()); assert!(!h.can_inject());
        h.set_phase(Phase::Coop, "拒否すべき再開"); assert!(h.game.phase != Phase::Coop);
        h.on_timer(Timer::ReleaseRetry(gen), Instant::now());
        assert_eq!(recorder.calls().len(), before); assert_eq!(h.release_retry_attempts, 3);
        h.emergency_stop("test");
        assert!(h.release_retry_active); assert_ne!(h.release_retry_gen, gen);
    }

    fn lobby_with(slots: &[(usize, bool)], disconnected_at: u64) -> Hub {
        let (mut h, _rx) = fixture_with_input(Box::new(RecordingInput::with_results(std::iter::repeat(true).take(50))));
        h.game.phase = Phase::Lobby; // 共通のフィクスチャは協力プレイ中で始まる
        h.slots = Default::default();
        for &(i, connected) in slots {
            let mut s = Slot::new(format!("client{i}"), format!("token{i}"));
            s.connected = connected;
            s.disconnected_at = disconnected_at;
            h.slots[i] = Some(s);
        }
        h
    }

    #[test]
    fn lobby_host_that_does_not_return_moves_to_the_youngest_connected_slot() {
        let mut h = lobby_with(&[(0, false), (1, true), (2, true)], 1_000);
        let epoch = h.game.epoch;
        h.release_lobby_slots(1_000 + session::LOBBY_SLOT_HOLD_MS - 1);
        assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client0"); // 期限までは元のホストの枠を保つ
        h.release_lobby_slots(1_000 + session::LOBBY_SLOT_HOLD_MS);
        let host = h.slots[0].as_ref().unwrap();
        assert_eq!((host.client_id.as_str(), host.token.as_str(), host.connected), ("client1", "token1", false));
        assert!(h.slots[1].is_none() && h.slots[2].is_some());
        assert_eq!(h.game.epoch, epoch + 1);
    }

    #[test]
    fn lobby_slots_are_kept_outside_the_lobby_and_while_nobody_can_host() {
        let later = 1_000 + session::LOBBY_SLOT_HOLD_MS;
        for phase in [Phase::Preparing, Phase::Coop, Phase::Paused] {
            let mut h = lobby_with(&[(0, false), (1, true)], 1_000);
            h.game.phase = phase;
            h.release_lobby_slots(later);
            assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client0"); // 協力プレイの開始後は権限を移さない
        }
        let mut h = lobby_with(&[(0, false), (1, false)], 1_000);
        h.release_lobby_slots(later);
        assert!(h.slots.iter().all(Option::is_none)); // 全員いなければ次の参加者が P1 になる
    }

    #[test]
    fn participant_slot_is_released_and_a_late_host_slot_gap_is_filled() {
        let later = 1_000 + session::LOBBY_SLOT_HOLD_MS;
        let mut h = lobby_with(&[(0, true), (3, false)], 1_000);
        let epoch = h.game.epoch;
        h.release_lobby_slots(later);
        assert!(h.slots[3].is_none() && h.slots[0].is_some());
        assert_eq!(h.game.epoch, epoch); // 参加者の枠の解放ではホストも epoch も変わらない
        // P1 の解放後に戻った枠だけが接続中でも、ホスト不在のままにしない
        let mut h = lobby_with(&[(2, true)], 1_000);
        h.release_lobby_slots(later);
        assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client2");
    }

    #[test]
    fn host_transfer_swaps_slots_and_only_the_current_host_can_do_it() {
        let mut h = lobby_with(&[(0, true), (1, true), (2, true)], 1_000);
        let epoch = h.game.epoch;
        h.transfer_host(1, 2);
        assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client0"); // ホスト以外は譲れない
        assert_eq!(h.game.epoch, epoch);
        h.transfer_host(0, 3);
        assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client0"); // 接続していない枠へは譲れない
        h.transfer_host(0, 2);
        let (host, old) = (h.slots[0].as_ref().unwrap(), h.slots[2].as_ref().unwrap());
        assert_eq!((host.client_id.as_str(), host.token.as_str()), ("client2", "token2"));
        assert_eq!((old.client_id.as_str(), old.token.as_str()), ("client0", "token0"));
        assert_eq!(h.slots[1].as_ref().unwrap().client_id, "client1"); // 他の人は変わらない
        assert!(!host.connected && !old.connected); // 同じトークンの再接続で新しい枠へ戻る
        assert_eq!(h.game.epoch, epoch + 1);
    }

    #[test]
    fn host_transfer_is_rejected_after_the_lobby() {
        for phase in [Phase::Preparing, Phase::Coop, Phase::Paused] {
            let mut h = lobby_with(&[(0, true), (1, true)], 1_000);
            h.game.phase = phase;
            h.transfer_host(0, 1);
            assert_eq!(h.slots[0].as_ref().unwrap().client_id, "client0");
        }
    }

    #[test]
    fn changing_players_releases_input_and_asks_everyone_to_confirm() {
        let mut h = lobby_with(&[(0, true), (1, true)], 1_000);
        h.game.phase = Phase::Paused;
        h.participants = vec![0, 1, 2];
        h.game.auto_resume_until = 99;
        let epoch = h.game.epoch;
        h.change_players();
        assert_eq!(h.participants, vec![0, 1]);
        assert_eq!(h.role_ack, vec![0, 1]);
        assert_eq!(h.game.auto_resume_until, 0); // 明示の再開だけで戻る
        assert_eq!(h.game.epoch, epoch + 1);
        assert!(h.game.phase == Phase::Paused);
        h.game.phase = Phase::Coop;
        h.participants = vec![0, 1, 2];
        h.change_players();
        assert_eq!(h.participants, vec![0, 1, 2]); // 協力プレイ中は変えない
    }

    #[test]
    fn role_rotation_stops_input_moves_roles_and_waits_for_everyone() {
        let (mut h, _rx) = fixture();
        h.participants = vec![0, 1];
        h.rotation_secs = 60;
        h.rotation_at = 1_000;
        h.set_output(index("KEY_W"), "P1", true);
        let epoch = h.game.epoch;
        h.rotate_roles_if_due(999);
        assert!(h.game.phase == Phase::Coop); // 時刻の前は何もしない
        h.rotate_roles_if_due(1_000);
        assert!(h.game.phase == Phase::Paused);
        assert_eq!(h.game.reason.as_deref(), Some("role rotation"));
        assert!(h.outputs.iter().all(|o| !o.physical)); // 全員の入力を解放する
        assert_eq!(h.seats, [1, 0, 2, 3]);
        assert_eq!(h.role_ack, vec![0, 1]); // 全員の確認が要る
        assert_eq!((h.rotation_at, h.game.auto_resume_until), (0, 0)); // 止まっている間は数えず、自動で再開しない
        assert!(h.game.epoch > epoch);
    }

    #[test]
    fn reset_clears_the_previous_session_lineup_and_reason() {
        let (mut h, _rx) = fixture_with_input(Box::new(RecordingInput::with_results(std::iter::repeat(true).take(50))));
        h.participants = vec![0, 1, 2];
        h.assigned = vec![vec!["a".into()], vec!["b".into()], vec!["c".into()]];
        h.game.phase = Phase::Coop;
        h.game.reason = Some("host ready".into());
        h.game.auto_resume_until = 99;
        h.on_ws_message(1, json!({"type":"reset"}));
        assert!(h.participants.is_empty() && h.assigned.is_empty());
        assert!(h.game.phase == Phase::Lobby && h.game.reason.is_none() && h.game.auto_resume_until == 0);
    }

    #[test]
    fn stalled_connection_queue_stops_at_the_limit_but_close_still_goes_out() {
        let (tx, mut rx) = unbounded_channel();
        let conn = Conn { tx, queued: Default::default(), ip: String::new(), loopback: true, role: Role::Unknown };
        for _ in 0..WS_QUEUE_LIMIT + 100 { conn.push_text("x".into()); }
        assert_eq!(conn.queued.len.load(Ordering::Relaxed), WS_QUEUE_LIMIT);
        assert!(conn.queued.must_close());
        conn.tx.send(Out::Close(4001, "reset".into())).unwrap();
        let mut texts = 0;
        let mut closed = false;
        while let Ok(out) = rx.try_recv() {
            match out { Out::Text(_) => texts += 1, Out::Close(..) => closed = true, Out::Terminate => {} }
        }
        assert_eq!(texts, WS_QUEUE_LIMIT);
        assert!(closed);
    }

    #[test]
    fn failure_during_mode_change_cannot_reenable_or_skip_the_fault_stop() {
        let recorder = RecordingInput::with_results(std::iter::once(true).chain(std::iter::repeat(false).take(20)));
        let (mut h, _rx) = fixture_with_input(Box::new(recorder));
        h.set_output(index("KEY_W"), "P1", true);
        h.set_inject_mode(InjectMode::Off);
        assert!(h.input_fault); let stop = h.fault_stop_gen;
        h.on_timer(Timer::InputFaultStop(stop), Instant::now());
        assert!(h.game.phase == Phase::Paused);
        h.set_inject_mode(InjectMode::On); assert!(h.inject == InjectMode::Off);
        h.game.phase = Phase::Preparing;
        h.set_phase(Phase::Coop, "ready"); assert!(h.game.phase != Phase::Coop);
    }

    #[test]
    fn synchronous_fault_stop_consumes_its_queued_timer_once() {
        let recorder = RecordingInput::with_results([true, false, true]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.game.phase = Phase::Preparing;
        h.set_output(index("KEY_W"), "P1", true);
        let epoch = h.game.epoch;
        h.set_phase(Phase::Coop, "ready");
        assert_eq!(h.game.epoch, epoch + 1);
        assert!(!h.fault_stop_pending);
        h.on_timer(Timer::InputFaultStop(h.fault_stop_gen), Instant::now());
        assert_eq!(h.game.epoch, epoch + 1);
        assert_eq!(recorder.calls().len(), 3);
    }

    #[test]
    fn failed_down_is_also_released_and_stale_pump_cannot_emit_more_presses() {
        let recorder = RecordingInput::with_results([false, true]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        let i = index("KEY_W"); h.set_output(i, "P1", true);
        let pump = h.outputs[i].timer_gen;
        h.set_output(i, "P1", false); h.set_output(i, "P1", true);
        h.on_timer(Timer::InputFaultStop(h.fault_stop_gen), Instant::now());
        h.on_timer(Timer::Pump(i, pump), Instant::now());
        assert!(h.release_pending.is_empty()); assert!(h.input_fault);
        assert_eq!(recorder.calls().iter().map(|c| c.operation.clone()).collect::<Vec<_>>(), [
            Operation::Key { scan: 0x11, ext: false, down: true }, Operation::Key { scan: 0x11, ext: false, down: false }]);
    }

    #[test]
    fn shutdown_has_finite_release_retries_and_reports_unconfirmed_failure() {
        for recovers in [true, false] {
            let results = if recovers { vec![true, false, false, true] } else { vec![true, false, false, false, false] };
            let recorder = RecordingInput::with_results(results);
            let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
            h.set_output(index("KEY_W"), "P1", true); h.look.px = 50.0;
            assert_eq!(h.release_for_shutdown(), recovers);
            assert_eq!(h.release_pending.is_empty(), recovers);
            assert_eq!(h.look.px, 0.0); assert!(h.inject == InjectMode::Off);
            assert!(recorder.calls().len() <= 5);
        }
    }

    #[test]
    fn adapter_move_failure_currently_consumes_motion_and_updates_diagnostics() {
        let recorder = RecordingInput::with_results([false]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.look.px = 1.25;
        h.look.py = -2.5;
        h.look.last_tick = Instant::now() - Duration::from_secs(1);
        h.look_tick();
        let calls = recorder.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].operation, Operation::Move { dx: 1, dy: -2 });
        assert!(!calls[0].ok);
        assert_eq!((h.look.sum_x, h.look.sum_y, h.look.n), (1, -2, 1));
        assert!(h.look.px.abs() < 1e-9 && h.look.py.abs() < 1e-9);
        assert!((h.look.fx - 0.25).abs() < 1e-9 && (h.look.fy + 0.5).abs() < 1e-9);
    }

    #[test]
    fn adapter_wheel_and_remote_failures_keep_current_sequence_and_log_results() {
        let recorder = RecordingInput::with_results([false, false]);
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.assigned[0].push("hotbar".into());
        h.handle_control(0, "act:hotbar:up", "down");
        h.game.phase = Phase::Paused;
        let movement = json!({"epoch":1,"rseq":1,"kind":"move","dx":5,"dy":-7});
        h.remote_message(0, &movement);
        h.remote_message(0, &movement);
        assert_eq!(h.slots[0].as_ref().unwrap().remote_seq, 1);
        let calls = recorder.calls();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].operation, Operation::Wheel(1));
        assert_eq!(calls[1].operation, Operation::Move { dx: 5, dy: -7 });
        assert!(calls.iter().all(|c| !c.ok));
    }

    #[test]
    fn unavailable_adapter_blocks_new_input_and_exposes_reason() {
        let recorder = RecordingInput::unavailable("試験用の利用不可");
        let (mut h, _rx) = fixture_with_input(Box::new(recorder.clone()));
        h.keybinds.actions.push(("forward".into(), Some("KEY_W")));
        assert!(!h.can_inject());
        assert!(h.ready_reasons(true).iter().any(|r| r == "入力ドライバーが利用できません"));
        h.handle_control(0, "act:forward", "down");
        assert!(recorder.calls().is_empty());
        let snapshot = h.inject_snapshot();
        assert_eq!(snapshot["available"], false);
        assert_eq!(snapshot["error"], "試験用の利用不可");
    }

}
