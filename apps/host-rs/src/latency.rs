//! 押してから実入力までの遅延の計測 (計測用、入力の判断は変えない)。
//! スマホは参加URLに `?latency` を付けたときだけ、押下ごとに「触れてから送信まで」と「送信から ACK までの往復」を送る。
//! ホストは同じ押下について「処理の開始から SendInput まで」を測り、両方がそろったら合計を記録する。
//! スマホと PC の時計は合わないので、片道は往復の半分とみなす (仮定)。
use std::collections::HashMap;
use std::time::Instant;

/// 対応のとれない記録 (計測していない端末の押下、解放で打ち消された押下) を溜めない上限
const LIMIT: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sample {
    pub touch_ms: f64,
    pub rtt_ms: f64,
    pub host_ms: f64,
}

impl Sample {
    /// 触れてから SendInput まで (片道は往復の半分とみなす)
    pub fn total_ms(&self) -> f64 {
        self.touch_ms + self.rtt_ms / 2.0 + self.host_ms
    }
}

#[derive(Debug, Default)]
pub struct Latency {
    /// 処理中の押下 (枠, iseq, 処理の開始)
    probe: Option<(usize, u64, Instant)>,
    /// 出力の予約を待つ押下。(枠, 出力) → (iseq, 処理の開始)
    waiting: HashMap<(usize, usize), (u64, Instant)>,
    host: HashMap<(usize, u64), f64>,
    phone: HashMap<(usize, u64), (f64, f64)>,
}

fn bounded<K, V>(map: &mut HashMap<K, V>) {
    if map.len() >= LIMIT {
        map.clear();
    }
}

impl Latency {
    /// 押下の処理を始めた
    pub fn begin(&mut self, slot: usize, iseq: u64) {
        self.probe = Some((slot, iseq, Instant::now()));
    }
    /// 押下の処理を終えた (出力に結び付かなかった押下は捨てる)
    pub fn end(&mut self) {
        self.probe = None;
    }
    /// 押下が出力に結び付いた。SendInput は最低押下・解放時間のために後になることがある
    pub fn bind(&mut self, slot: usize, output: usize) {
        if let Some((s, iseq, at)) = self.probe.take().filter(|p| p.0 == slot) {
            bounded(&mut self.waiting);
            self.waiting.insert((s, output), (iseq, at));
        }
    }
    /// 処理中の押下をその場で出力した (ホイール)
    pub fn injected_now(&mut self, slot: usize) -> Option<(u64, Sample)> {
        let (s, iseq, at) = self.probe.take().filter(|p| p.0 == slot)?;
        self.host_done(s, iseq, at.elapsed().as_secs_f64() * 1000.0)
    }
    /// 押下を SendInput した
    pub fn injected(&mut self, slot: usize, output: usize) -> Option<(u64, Sample)> {
        let (iseq, at) = self.waiting.remove(&(slot, output))?;
        self.host_done(slot, iseq, at.elapsed().as_secs_f64() * 1000.0)
    }
    fn host_done(&mut self, slot: usize, iseq: u64, host_ms: f64) -> Option<(u64, Sample)> {
        match self.phone.remove(&(slot, iseq)) {
            Some((touch_ms, rtt_ms)) => Some((
                iseq,
                Sample {
                    touch_ms,
                    rtt_ms,
                    host_ms,
                },
            )),
            None => {
                bounded(&mut self.host);
                self.host.insert((slot, iseq), host_ms);
                None
            }
        }
    }
    /// スマホが測った値が届いた。範囲外の値は捨てる
    pub fn phone(&mut self, slot: usize, iseq: u64, touch_ms: f64, rtt_ms: f64) -> Option<Sample> {
        let ok = |v: f64| v.is_finite() && (0.0..10_000.0).contains(&v);
        if !ok(touch_ms) || !ok(rtt_ms) {
            return None;
        }
        match self.host.remove(&(slot, iseq)) {
            Some(host_ms) => Some(Sample {
                touch_ms,
                rtt_ms,
                host_ms,
            }),
            None => {
                bounded(&mut self.phone);
                self.phone.insert((slot, iseq), (touch_ms, rtt_ms));
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_and_phone_parts_meet_in_either_order() {
        let mut l = Latency::default();
        // SendInput が先、スマホの値が後
        l.begin(0, 5);
        l.bind(0, 3);
        l.end();
        assert!(l.injected(0, 3).is_none());
        let s = l.phone(0, 5, 4.0, 40.0).expect("そろった");
        assert_eq!((s.touch_ms, s.rtt_ms), (4.0, 40.0));
        assert!((s.total_ms() - (4.0 + 20.0 + s.host_ms)).abs() < 1e-9);
        // スマホの値が先、SendInput が後
        assert!(l.phone(1, 9, 2.0, 30.0).is_none());
        l.begin(1, 9);
        l.bind(1, 7);
        l.end();
        let (iseq, s) = l.injected(1, 7).expect("そろった");
        assert_eq!(iseq, 9);
        assert_eq!(s.rtt_ms, 30.0);
    }

    #[test]
    fn unbound_presses_and_bad_values_leave_nothing_behind() {
        let mut l = Latency::default();
        l.begin(0, 1);
        l.end(); // 出力に結び付かなかった (担当外・注入できない等)
        assert!(l.injected(0, 3).is_none());
        assert!(l.phone(0, 1, f64::NAN, 10.0).is_none());
        assert!(l.phone(0, 1, 1.0, -1.0).is_none());
        // 別の枠の処理中の押下には結び付けない
        l.begin(0, 2);
        l.bind(1, 3);
        assert!(l.injected(1, 3).is_none());
        // 上限を超えて溜めない
        for i in 0..1000 {
            l.phone(2, i, 1.0, 1.0);
        }
        assert!(l.phone.len() < LIMIT);
    }
}
