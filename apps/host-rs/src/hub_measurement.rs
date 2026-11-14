// #174: 実入力・ソケット・OS設定なしでHub処理と既存の無制限キューを計測する。
// Hub::runを起動する試験ではない。計測ハーネスの待機・処理を本番の上限保証に使わない。
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[derive(Clone, Copy)]
enum Scenario { Normal, Burst, StalledMonitor, Disconnect, LargeLog }

impl Scenario {
    fn name(self) -> &'static str {
        match self {
            Self::Normal => "normal", Self::Burst => "burst", Self::StalledMonitor => "stalled_monitor",
            Self::Disconnect => "disconnect", Self::LargeLog => "large_log",
        }
    }
}

enum Work { Event(Event), Record(Value) }

struct Envelope { queued: Instant, bytes: usize, stop: bool, work: Work }

#[derive(Default)]
struct QueueStats {
    pending: AtomicUsize,
    bytes: AtomicUsize,
    peak: AtomicUsize,
    peak_bytes: AtomicUsize,
}

fn enqueue(tx: &Sender<Envelope>, stats: &QueueStats, work: Work, bytes: usize, stop: bool) {
    let n = stats.pending.fetch_add(1, Ordering::SeqCst) + 1;
    let b = stats.bytes.fetch_add(bytes, Ordering::SeqCst) + bytes;
    stats.peak.fetch_max(n, Ordering::SeqCst);
    stats.peak_bytes.fetch_max(b, Ordering::SeqCst);
    tx.send(Envelope { queued: Instant::now(), bytes, stop, work }).unwrap();
}

fn input(seq: i64) -> Work {
    Work::Event(Event::WsText { id: 10, text: json!({
        "type":"input", "iseq":seq, "epoch":1,
        "button":"act:forward", "state":if seq % 2 == 1 { "down" } else { "up" }
    }).to_string(), enqueued_at: None })
}

fn producer(tx: Sender<Envelope>, stats: Arc<QueueStats>, scenario: Scenario, duration: Duration, burst: usize) {
    if matches!(scenario, Scenario::Burst | Scenario::StalledMonitor | Scenario::LargeLog) {
        for i in 0..burst {
            if i == burst / 2 {
                enqueue(&tx, &stats, Work::Event(Event::EmergencyStop { source:"measurement", enqueued_at: None }), 0, true);
            }
            let work = if matches!(scenario, Scenario::LargeLog) {
                Work::Record(json!({ "payload":"x".repeat(2048), "index":i }))
            } else { input(i as i64 + 1) };
            let bytes = match &work { Work::Event(Event::WsText {text,..}) => text.len(), Work::Record(v) => v.to_string().len(), _ => 0 };
            enqueue(&tx, &stats, work, bytes, false);
        }
        return;
    }
    let start = Instant::now();
    let mut seq = 0;
    let mut lseq = 0;
    let mut next_button = start;
    let mut next_look = start;
    let mut next_ping = start;
    let mut stopped = false;
    while start.elapsed() < duration {
        let now = Instant::now();
        if !stopped && start.elapsed() >= duration / 2 {
            let work = if matches!(scenario, Scenario::Disconnect) {
                Work::Event(Event::WsClosed {
                    id: 11,
                    code: 1006,
                    #[cfg(feature = "latency-measure")]
                    since_last_send_ms: None,
                })
            } else { Work::Event(Event::EmergencyStop { source:"measurement", enqueued_at: None }) };
            enqueue(&tx, &stats, work, 0, true);
            stopped = true;
        }
        if now >= next_button {
            seq += 1;
            let work = input(seq);
            let bytes = match &work { Work::Event(Event::WsText {text,..}) => text.len(), _ => 0 };
            enqueue(&tx, &stats, work, bytes, false);
            next_button += Duration::from_millis(100);
        }
        if now >= next_look {
            lseq += 1;
            let text = json!({"type":"look","epoch":1,"lseq":lseq,"cx":lseq*8,"cy":-lseq*4}).to_string();
            let bytes = text.len();
            enqueue(&tx, &stats, Work::Event(Event::WsText {id:11,text,enqueued_at:None}), bytes, false);
            next_look += Duration::from_millis(33);
        }
        if now >= next_ping {
            for id in [10,11,12] {
                let text = json!({"type":"ping","t":0}).to_string();
                let bytes = text.len();
                enqueue(&tx, &stats, Work::Event(Event::WsText {id,text,enqueued_at:None}), bytes, false);
            }
            next_ping += Duration::from_millis(200);
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    // 非常に短いsmokeでも停止を必ず1回投入する。
    if !stopped {
        enqueue(&tx, &stats, Work::Event(Event::EmergencyStop { source:"measurement", enqueued_at: None }), 0, true);
    }
}

fn distribution(samples: &[u64]) -> Value {
    if samples.is_empty() { return json!({"n":0,"p50":null,"p95":null,"p99":null,"max":null}); }
    let mut v = samples.to_vec();
    v.sort_unstable();
    let percentile = |p: usize| v[(v.len() * p).div_ceil(100).saturating_sub(1).min(v.len()-1)];
    json!({"n":v.len(),"p50":percentile(50),"p95":percentile(95),"p99":percentile(99),"max":v[v.len()-1]})
}

fn micros(d: Duration) -> u64 { d.as_micros().min(u64::MAX as u128) as u64 }

fn drain(rx: &mut UnboundedReceiver<Out>) -> (usize, usize) {
    let mut count = 0;
    let mut bytes = 0;
    while let Ok(out) = rx.try_recv() {
        count += 1;
        if let Out::Text(t) = out { bytes += t.len(); }
    }
    (count, bytes)
}

fn run_scenario(scenario: Scenario, duration: Duration, burst: usize) -> Value {
    let (mut hub, mut monitor) = fixture();
    let mut players = Vec::new();
    for slot in 0..3 {
        let id = slot as u64 + 10;
        let (tx, rx) = unbounded_channel();
        hub.conns.insert(id, Conn { tx, queued:Default::default(), ip:String::new(), loopback:true, role:Role::Player {slot} });
        let s = hub.slots[slot].get_or_insert_with(|| Slot::new(format!("fixture{slot}"), String::new()));
        s.conn = Some(id); s.connected = true; s.last_seen = now_ms();
        players.push(rx);
    }
    hub.participants = vec![0,1,2];
    hub.game.host_ready = true;
    hub.keybinds.actions = vec![("forward".into(), Some("KEY_W")), ("attack".into(), Some("MOUSE_L"))];
    // 最低押下時間より停止を優先し、全参加者の出力と視点を破棄する対照を用意する。
    hub.set_output(index("KEY_W"), "P1", true);
    hub.set_output(index("MOUSE_L"), "P3", true);
    hub.look.px = 100.25; hub.look.py = -50.5; hub.look.fx = 0.25; hub.look.fy = -0.25;
    drain(&mut monitor);
    let start = Instant::now();
    hub.schedule(start + LOOK_TICK, Timer::LookTick);
    hub.schedule(start + Duration::from_millis(100), Timer::LookReport);
    let (tx, rx) = std::sync::mpsc::channel();
    let queue = Arc::new(QueueStats::default());
    let producer_queue = queue.clone();
    let sender = std::thread::spawn(move || producer(tx, producer_queue, scenario, duration, burst));
    let mut waits = Vec::new();
    let mut processing = Vec::new();
    let mut stop_waits = Vec::new();
    let mut stop_processing = Vec::new();
    let mut stop_total = Vec::new();
    let mut tick_lag = Vec::new();
    let mut tick_intervals = Vec::new();
    let mut tick_cost = Vec::new();
    let mut record_cost = Vec::new();
    let mut flush_cost = Vec::new();
    let mut last_tick = None;
    let mut monitor_peak_count = 0;
    let mut monitor_peak_bytes = 0;
    let mut monitor_total_bytes = 0;
    let mut peak_timers = 0;
    let mut count = 0;
    let mut next_flush = start + Duration::from_secs(1);
    let mut detached = false;
    loop {
        // Hub::runと同じ順序: 期限済みタイマー群→受信イベント1件。
        let now = Instant::now();
        while let Some(Reverse((at, _, timer))) = hub.timers.peek().copied() {
            if at > now { break; }
            hub.timers.pop();
            let t0 = Instant::now();
            if timer == Timer::LookTick {
                tick_lag.push(micros(t0.saturating_duration_since(at)));
                if let Some(prev) = last_tick { tick_intervals.push(micros(t0.duration_since(prev))); }
                last_tick = Some(t0);
            }
            hub.on_timer(timer, at);
            if timer == Timer::LookTick { tick_cost.push(micros(t0.elapsed())); }
        }
        if now >= next_flush {
            let t0 = Instant::now(); hub.log_file.flush().unwrap(); flush_cost.push(micros(t0.elapsed()));
            next_flush += Duration::from_secs(1);
        }
        match rx.recv_timeout(Duration::from_millis(1)) {
            Ok(envelope) => {
                queue.pending.fetch_sub(1, Ordering::SeqCst);
                queue.bytes.fetch_sub(envelope.bytes, Ordering::SeqCst);
                let t0 = Instant::now();
                let wait = micros(t0.duration_since(envelope.queued));
                waits.push(wait);
                match envelope.work {
                    Work::Event(ev) => hub.on_event(ev),
                    Work::Record(payload) => {
                        let before = Instant::now(); hub.record("measurement_payload", payload); record_cost.push(micros(before.elapsed()));
                    }
                }
                let cost = micros(t0.elapsed());
                processing.push(cost); count += 1;
                if envelope.stop {
                    stop_waits.push(wait); stop_processing.push(cost); stop_total.push(micros(envelope.queued.elapsed()));
                    assert!(hub.game.phase == Phase::Paused);
                    assert!(hub.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty() && !s.timer_pending));
                    assert_eq!((hub.look.px,hub.look.py,hub.look.fx,hub.look.fy),(0.0,0.0,0.0,0.0));
                }
            }
            Err(RecvTimeoutError::Disconnected) => { detached = true; }
            Err(RecvTimeoutError::Timeout) => {}
        }
        monitor_peak_count = monitor_peak_count.max(monitor.len());
        if !matches!(scenario, Scenario::StalledMonitor) {
            let (_, bytes) = drain(&mut monitor);
            monitor_peak_bytes = monitor_peak_bytes.max(bytes); monitor_total_bytes += bytes;
        }
        for p in &mut players { drain(p); }
        peak_timers = peak_timers.max(hub.timers.len());
        if detached && start.elapsed() >= duration { break; }
        // 切断済みキューは待機しないため、余った期間はtick周期より短く待つ。
        if detached { std::thread::sleep(Duration::from_millis(1)); }
    }
    sender.join().unwrap();
    let (_, bytes) = drain(&mut monitor);
    monitor_peak_bytes = monitor_peak_bytes.max(bytes); monitor_total_bytes += bytes;
    let t0 = Instant::now(); hub.log_file.flush().unwrap(); flush_cost.push(micros(t0.elapsed()));
    assert_eq!(queue.pending.load(Ordering::SeqCst), 0);
    assert_eq!(queue.bytes.load(Ordering::SeqCst), 0);
    assert_eq!(stop_total.len(), 1);
    assert!(!tick_cost.is_empty());
    assert!(hub.outputs.iter().all(|s| !s.physical && s.holders.is_empty() && s.queue.is_empty()));
    json!({
        "scenario":scenario.name(), "durationMs":duration.as_millis(), "elapsedUs":micros(start.elapsed()), "events":count,
        "queueWaitUs":distribution(&waits), "processingUs":distribution(&processing),
        "stopQueueWaitUs":distribution(&stop_waits), "stopProcessingUs":distribution(&stop_processing), "stopTotalUs":distribution(&stop_total),
        "lookTickLagUs":distribution(&tick_lag), "lookTickIntervalUs":distribution(&tick_intervals), "lookTickProcessingUs":distribution(&tick_cost),
        "recordUs":distribution(&record_cost), "flushUs":distribution(&flush_cost),
        "eventQueuePeak":queue.peak.load(Ordering::SeqCst), "eventPayloadBytesPeak":queue.peak_bytes.load(Ordering::SeqCst),
        "monitorQueuePeak":monitor_peak_count, "monitorPayloadBytesPeak":monitor_peak_bytes, "monitorPayloadBytesTotal":monitor_total_bytes,
        "timerHeapPeak":peak_timers, "pendingEventsAtEnd":0, "safeStopVerified":true,
    })
}

#[test]
fn measurement_smoke_preserves_safe_stop_and_drains_work_for_all_loads() {
    for scenario in [Scenario::Normal,Scenario::Burst,Scenario::StalledMonitor,Scenario::Disconnect,Scenario::LargeLog] {
        let result = run_scenario(scenario, Duration::from_millis(40), 64);
        assert_eq!(result["safeStopVerified"], true);
        assert_eq!(result["pendingEventsAtEnd"], 0);
    }
    assert_eq!(distribution(&[1,2,3,4,100])["p95"], 100);
}

#[test]
#[ignore = "opt-inの負荷計測。scripts/sim/host-load-measure.mjsから実行する"]
fn measure_host_load() {
    let duration_ms = std::env::var("RECOOPLAY_MEASURE_MS").ok().and_then(|s|s.parse::<u64>().ok()).unwrap_or(1000).clamp(40,60000);
    let repetitions = std::env::var("RECOOPLAY_MEASURE_REPEATS").ok().and_then(|s|s.parse::<usize>().ok()).unwrap_or(3).clamp(1,10);
    let burst = std::env::var("RECOOPLAY_MEASURE_BURST").ok().and_then(|s|s.parse::<usize>().ok()).unwrap_or(2000).clamp(16,20000);
    let mut results = Vec::new();
    for repetition in 0..repetitions {
        for scenario in [Scenario::Normal,Scenario::Burst,Scenario::StalledMonitor,Scenario::Disconnect,Scenario::LargeLog] {
            let mut result = run_scenario(scenario, Duration::from_millis(duration_ms), burst);
            result["repetition"] = json!(repetition+1); results.push(result);
        }
    }
    println!("RECOOPLAY_MEASUREMENTS={}", json!({
        "schemaVersion":1,"clock":"Instant","unit":"microseconds","os":std::env::consts::OS,"arch":std::env::consts::ARCH,
        "scope":"test-harness/hub-handlers/std-mpsc/tokio-unbounded-monitor", "logSink":"null-device",
        "durationMs":duration_ms,"repetitions":repetitions,"burstSize":burst,"results":results,
    }));
}
