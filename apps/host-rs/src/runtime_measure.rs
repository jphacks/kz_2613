//! ローカルの非注入計測。通信内容は保存せず、終了時に集計だけを書き出す。
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

static MEASUREMENT: OnceLock<Measurement> = OnceLock::new();
const SAMPLE_LIMIT: usize = 100_000;

struct Measurement {
    destination: PathBuf,
    samples: Mutex<BTreeMap<&'static str, Samples>>,
}

#[derive(Default)]
struct Samples {
    count: u64,
    max: u64,
    first: Vec<u64>,
}

pub fn init(log_dir: &Path) {
    if std::env::var("RECOOPLAY_DRY_RUN").as_deref() == Ok("1")
        && std::env::var("RECOOPLAY_RUNTIME_MEASURE").as_deref() == Ok("1")
    {
        let _ = MEASUREMENT.set(Measurement {
            destination: log_dir.join("runtime-measure.json"),
            samples: Mutex::new(BTreeMap::new()),
        });
    }
}

pub fn enabled() -> bool { MEASUREMENT.get().is_some() }

pub fn start() -> Option<Instant> { enabled().then(Instant::now) }

pub fn elapsed(name: &'static str, start: Option<Instant>) {
    if let Some(start) = start { sample(name, start.elapsed().as_micros() as u64); }
}

pub fn sample(name: &'static str, value: u64) {
    let Some(measurement) = MEASUREMENT.get() else { return };
    let mut samples = measurement.samples.lock().unwrap();
    let samples = samples.entry(name).or_default();
    samples.count += 1;
    samples.max = samples.max.max(value);
    if samples.first.len() < SAMPLE_LIMIT { samples.first.push(value); }
}

pub fn finish() {
    let Some(measurement) = MEASUREMENT.get() else { return };
    let samples = std::mem::take(&mut *measurement.samples.lock().unwrap());
    let summary: BTreeMap<_, _> = samples.into_iter().map(|(name, mut s)| {
        s.first.sort_unstable();
        let n = s.first.len();
        (name, json!({ "count": s.count, "sampled": n, "p50": s.first[n.div_ceil(2) - 1],
            "p95": s.first[(n * 95).div_ceil(100) - 1], "max": s.max }))
    }).collect();
    if let Err(e) = std::fs::write(&measurement.destination, serde_json::to_vec_pretty(&summary).unwrap()) {
        eprintln!("計測結果を書き出せません: {e}");
    }
}
