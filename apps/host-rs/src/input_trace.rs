//! 明示的な無注入LAN試験専用。単調時計の入力別時刻をメモリーへ蓄積する。
//! runtime_measureとは独立し、待受アドレス・通信・入力の判断を変えない。
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const LIMIT: usize = 200_000;
static TRACE: OnceLock<Trace> = OnceLock::new();
struct Trace { origin: Instant, destination: PathBuf, events: Mutex<Vec<Value>> }

fn permitted(values: [&str; 4]) -> bool { values.iter().all(|v| *v == "1") }
pub fn init(directory: &Path) {
    let names=["RECOOPLAY_INPUT_TRACE", "RECOOPLAY_DRY_RUN", "RECOOPLAY_NO_CONFIG", "RECOOPLAY_FAKE_TARGET"];
    let values=names.map(|n| std::env::var(n).unwrap_or_default());
    if permitted(values.each_ref().map(String::as_str)) {
        let _=TRACE.set(Trace { origin:Instant::now(), destination:directory.join("input-trace.json"), events:Mutex::new(Vec::new()) });
    }
}
pub fn start() -> Option<Instant> { TRACE.get().map(|_| Instant::now()) }
pub fn stamp(at: Instant) -> Option<u64> { TRACE.get().map(|t| at.saturating_duration_since(t.origin).as_micros() as u64) }
pub fn event(stage: &str, data: Value) {
    let Some(t)=TRACE.get() else { return };
    let mut rows=t.events.lock().unwrap();
    if rows.len()<LIMIT { rows.push(json!({"stage":stage,"us":t.origin.elapsed().as_micros() as u64,"data":data})); }
}
fn message_fields(slot: usize, via: &str, msg: &Value, received: Option<u64>) -> Option<Value> {
    let kind=msg.get("type")?.as_str()?;
    if !matches!(kind,"input"|"look") { return None; }
    Some(json!({"slot":format!("P{}",slot+1),"via":via,"type":kind,"epoch":msg.get("epoch"),
        "iseq":msg.get("iseq"),"lseq":msg.get("lseq"),"receivedUs":received}))
}
pub fn received(slot: usize, via: &str, msg: &Value, at: Option<Instant>) {
    if TRACE.get().is_none() { return; }
    if let Some(fields)=message_fields(slot,via,msg,at.and_then(stamp)) { event("received",fields); }
}
pub fn finish() {
    let Some(t)=TRACE.get() else { return };
    let events=std::mem::take(&mut *t.events.lock().unwrap());
    let value=json!({"version":1,"clock":"single host process Instant / microseconds","limit":LIMIT,"limitReached":events.len()==LIMIT,"events":events});
    if let Err(e)=std::fs::write(&t.destination,serde_json::to_vec(&value).unwrap()) { eprintln!("入力別計測を書き出せません: {e}"); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn measurement_requires_all_four_safety_flags() {
        assert!(permitted(["1";4]));
        for i in 0..4 { let mut flags=["1";4];flags[i]="0";assert!(!permitted(flags)); }
    }
    #[test]
    fn receipt_selects_only_sequence_fields_and_excludes_identity_and_payload() {
        let msg=json!({"type":"input","epoch":8,"iseq":9,"token":"secret","button":"private","clientId":"identity"});
        let fields=message_fields(0,"rtc",&msg,Some(123)).unwrap();
        assert_eq!(fields["receivedUs"],123);assert_eq!(fields["iseq"],9);
        for name in ["token","button","clientId"] { assert!(fields.get(name).is_none()); }
        assert!(message_fields(0,"ws",&json!({"type":"hello","token":"secret"}),None).is_none());
    }
}
