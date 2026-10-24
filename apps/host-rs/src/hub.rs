// セッションの中枢。役割・進行・入力の順序制御・キー/マウスの出力キュー・視点の補間を
// 1 本の専用スレッドで処理する (Node 版 server.js と同じ仕様・同じメッセージ形式)。
// すべての状態変更はこのスレッドだけが行うのでロック不要。タイマーもこのスレッドで回す (視点は 4ms 刻み)。

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap, HashMap, VecDeque};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tokio::sync::mpsc::UnboundedSender;

use crate::config::Config;
use crate::controls::{self, Kind, OUTPUTS};
use crate::input::Input;
use crate::rtc::{Peer, RtcSignal};

const SLOT_NAMES: [&str; 3] = ["P1", "P2", "P3"];
const SLOT_ROLES: [&str; 3] = ["移動・ホスト", "視点", "アクション"];
/// 通信契約の版 (docs/architecture/protocol.md)。変えるときは protocol.md とシミュレーションも同時に更新する
const PROTOCOL_VERSION: u64 = 1;
const CLOSE_PROTOCOL_VERSION: u16 = 4005;
const HEARTBEAT_TIMEOUT_MS: u64 = 4000; // この時間メッセージが来なければ切断扱い
const MIN_HOLD_MS: u64 = 60; // 押下は最低この時間続ける (ゲームは 50ms ごとに入力を読む)
const MIN_GAP_MS: u64 = 50; // 解放も最低この時間続けてから次を押す (連打を 1 回ずつ認識させる)
const MAX_QUEUE: usize = 8; // 通信が詰まって溜まった連打は 4 回分まで (それ以上は古い方を捨てる)
const LOOK_TICK: Duration = Duration::from_millis(4);
const RTC_TIMEOUT: Duration = Duration::from_secs(5);

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
    Shutdown,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Timer {
    LookTick,
    LookReport,
    Heartbeat,
    StateFlush,
    Pump(usize, u64),       // (出力の番号, 世代)
    RtcTimeout(usize, u64), // (スロット, 世代)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ---------- 状態 ----------

#[derive(PartialEq, Eq, Clone, Copy)]
enum Page {
    Host,
    Game,
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
    rtc: Option<Peer>,
    rtc_gen: u64,
    rtc_state: &'static str,
    next_iseq: i64, // 次に処理する入力番号 (WebSocket / WebRTC のどちらで届いても番号順に 1 回だけ処理する)
    ibuf: BTreeMap<i64, (Value, Via)>,
    via_ws: u64,
    via_rtc: u64,
    look_seq: i64,
    look_cx: f64, // 視点の累積移動量 (パケットが欠けても次のパケットで取り戻せる)
    look_cy: f64,
    look_lost: u64,
}

impl Slot {
    fn new(client_id: String) -> Self {
        Slot {
            client_id,
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
            rtc: None,
            rtc_gen: 0,
            rtc_state: "none",
            next_iseq: 1,
            ibuf: BTreeMap::new(),
            via_ws: 0,
            via_rtc: 0,
            look_seq: 0,
            look_cx: 0.0,
            look_cy: 0.0,
            look_lost: 0,
        }
    }
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Phase {
    Lobby,
    Coop,
    Paused,
}

impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Lobby => "lobby",
            Phase::Coop => "coop",
            Phase::Paused => "paused",
        }
    }
    fn parse(s: &str) -> Option<Phase> {
        match s {
            "lobby" => Some(Phase::Lobby),
            "coop" => Some(Phase::Coop),
            "paused" => Some(Phase::Paused),
            _ => None,
        }
    }
}

struct Game {
    phase: Phase,
    required: u64,
    reason: Option<String>,
    // 切断による一時停止は、全員がこの時間内に戻れば自動で協力プレイに復帰する (ホストの PAUSE は対象外)
    auto_resume: bool,
    auto_resume_ms: u64,
    auto_resume_until: u64,
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
    slots: [Option<Slot>; 3],
    game: Game,
    inject: InjectMode,
    outputs: Vec<OutputState>,
    look: Look,
    timers: BinaryHeap<Reverse<(Instant, u64, Timer)>>,
    timer_seq: u64,
    state_pending: bool,
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
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
            slots: [None, None, None],
            game: Game {
                phase: Phase::Lobby,
                required: config.required_players,
                reason: None,
                auto_resume: config.auto_resume,
                auto_resume_ms: config.auto_resume_ms,
                auto_resume_until: 0,
            },
            inject: InjectMode::parse(&config.inject_mode).unwrap_or(InjectMode::Off),
            outputs: OUTPUTS.iter().map(|_| OutputState::default()).collect(),
            look: Look {
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
        };
        hub.schedule(now + LOOK_TICK, Timer::LookTick);
        hub.schedule(now + Duration::from_millis(100), Timer::LookReport);
        hub.schedule(now + Duration::from_secs(1), Timer::Heartbeat);
        Ok(hub)
    }

    /// イベントループ。次のタイマーまでイベントを待ち、期限が来たタイマーを処理する
    pub fn run(mut self, rx: Receiver<Event>, port: u16) {
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
        (0..3).filter(|&i| self.slots[i].as_ref().is_some_and(|s| s.connected)).collect()
    }

    fn can_start(&self) -> bool {
        let c = self.connected_slots();
        c.contains(&0) && c.len() as u64 >= self.game.required
    }

    fn game_snapshot(&self) -> Value {
        let connected: Vec<&str> = self.connected_slots().into_iter().map(|i| SLOT_NAMES[i]).collect();
        json!({
            "phase": self.game.phase.name(),
            "required": self.game.required,
            "reason": self.game.reason,
            "autoResume": self.game.auto_resume,
            "autoResumeMs": self.game.auto_resume_ms,
            "autoResumeUntil": self.game.auto_resume_until,
            "connected": connected,
            "canStart": self.can_start(),
        })
    }

    fn slot_snapshot(&self) -> Value {
        Value::Array(
            (0..3)
                .map(|i| match &self.slots[i] {
                    None => json!({ "name": SLOT_NAMES[i], "role": SLOT_ROLES[i], "assigned": false }),
                    Some(s) => json!({
                        "name": SLOT_NAMES[i],
                        "role": SLOT_ROLES[i],
                        "assigned": true,
                        "clientId": s.client_id,
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
                    }),
                })
                .collect(),
        )
    }

    fn game_focused(&self) -> bool {
        self.conns.values().any(|c| matches!(c.role, Role::Monitor { page: Page::Game, focused: true }))
    }

    fn can_inject(&self) -> bool {
        self.input.available()
            && (self.inject == InjectMode::On || (self.inject == InjectMode::Test && self.game_focused()))
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
        self.game.reason = Some(reason.to_string());
        self.log("phase", json!({ "phase": phase.name(), "reason": reason }));
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
        if self.can_start() && rtc_settled {
            self.set_phase(Phase::Coop, "auto resume");
        }
    }

    fn command(&mut self, slot: usize, cmd: &str) {
        if slot != 0 {
            return;
        }
        let can_start = self.can_start();
        match (cmd, self.game.phase) {
            ("START", Phase::Lobby) if can_start => self.set_phase(Phase::Coop, "host start"),
            ("RESUME", Phase::Paused) if can_start => self.set_phase(Phase::Coop, "host resume"),
            ("PAUSE", Phase::Coop) => self.set_phase(Phase::Paused, "host pause"),
            ("END", p) if p != Phase::Lobby => self.set_phase(Phase::Lobby, "host end"),
            _ => {}
        }
    }

    /// その操作を今このスロットが使えるか → 出力の番号
    fn resolve_control(&self, slot: usize, control: &str) -> Option<usize> {
        let id = if self.game.phase == Phase::Coop {
            controls::role_control(SLOT_NAMES[slot], control)
        } else if slot == 0 {
            controls::remote_control(control)
        } else {
            None
        }?;
        OUTPUTS.iter().position(|o| o.id == id)
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

    fn handle_look(&mut self, slot: usize, dx: f64, dy: f64) {
        if self.game.phase != Phase::Coop || slot != 1 || !self.can_inject() {
            return;
        }
        let now = Instant::now();
        let look = &mut self.look;
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

    fn set_inject_mode(&mut self, mode: InjectMode) {
        let before = self.can_inject();
        self.inject = mode;
        if before && !self.can_inject() {
            self.release_outputs(None);
        }
        self.log("inject_mode", json!({ "mode": mode.name() }));
        self.push_state();
    }

    fn on_focus_change(&mut self) {
        if !self.can_inject() {
            self.release_outputs(None);
        }
        self.push_state();
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
        // 協力プレイ中に誰かが切れたら共同入力を止める (ホストの自動交代はしない)
        let paused_by_disconnect = self.game.phase == Phase::Paused
            && self.game.reason.as_deref().is_some_and(|r| r.ends_with("disconnected"));
        if self.game.phase == Phase::Coop || paused_by_disconnect {
            self.game.auto_resume_until = now_ms() + self.game.auto_resume_ms;
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
                        json!({ "slot": "P2", "dx": self.look.sum_x, "dy": self.look.sum_y, "n": self.look.n, "smoothMs": self.look.tau.round() }),
                    );
                    self.broadcast_monitors(&json!({ "type": "look", "entry": entry }));
                    self.look.sum_x = 0;
                    self.look.sum_y = 0;
                    self.look.n = 0;
                }
                self.schedule(at + Duration::from_millis(100), Timer::LookReport);
            }
            Timer::Heartbeat => {
                // Wi-Fi を切られた場合 TCP の close はすぐ来ないので、アプリ層の ping 途絶で切断を判定する
                let now = now_ms();
                for i in 0..3 {
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
            let page = if s(&msg, "page").as_deref() == Some("game") { Page::Game } else { Page::Host };
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
            "required" => {
                if let Some(r) = msg.get("required").and_then(Value::as_u64).filter(|r| (1..=3).contains(r)) {
                    self.game.required = r;
                    self.log("required", json!({ "required": r }));
                    self.push_game();
                }
            }
            "auto_resume" => {
                self.game.auto_resume = msg.get("on").and_then(Value::as_bool).unwrap_or(false);
                self.log("auto_resume", json!({ "on": self.game.auto_resume }));
                self.push_game();
            }
            "phase" => {
                if let Some(p) = s(msg, "phase").as_deref().and_then(Phase::parse) {
                    self.set_phase(p, "dashboard");
                }
            }
            "reset" => {
                self.release_outputs(None);
                for i in 0..3 {
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
        let existing = (0..3).find(|&i| self.slots[i].as_ref().is_some_and(|s| s.client_id == client_id));
        let reconnected = existing.is_some();
        let idx = match existing {
            Some(i) => i,
            None => match (0..3).find(|&i| self.slots[i].is_none()) {
                Some(i) => {
                    self.slots[i] = Some(Slot::new(client_id.clone()));
                    i
                }
                None => {
                    self.send(Some(id), &json!({ "type": "full" }));
                    self.log("reject_full", json!({ "ip": ip, "clientId": client_id }));
                    return self.close(Some(id), 4004, "room full");
                }
            },
        };
        // 同じ端末の古い接続を置き換え
        let old = self.slots[idx].as_ref().unwrap().conn.filter(|&c| c != id);
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
        self.conns.get_mut(&id).unwrap().role = Role::Player { slot: idx };
        self.send(
            Some(id),
            &json!({
                "type": "welcome",
                "protocolVersion": PROTOCOL_VERSION,
                "slot": SLOT_NAMES[idx],
                "role": SLOT_ROLES[idx],
                "isHost": idx == 0,
                "reconnected": reconnected,
            }),
        );
        self.log(
            if reconnected { "reconnect" } else { "join" },
            json!({ "slot": SLOT_NAMES[idx], "ip": ip, "clientId": client_id, "ua": ua }),
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
                self.command(idx, &cmd);
            }
            "rtc-offer" => self.start_rtc(idx, &s(&msg, "sdp").unwrap_or_default()),
            "rtc-cand" => {
                if let Some(peer) = slot.rtc.as_mut() {
                    let mid = s(&msg, "mid").unwrap_or_else(|| "0".into());
                    peer.candidate(&s(&msg, "cand").unwrap_or_default(), &mid);
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
}
