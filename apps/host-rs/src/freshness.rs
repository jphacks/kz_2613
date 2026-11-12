// 遅れて届いた押下 (down) の判定 (#285 Q25)。
// スマホとPCの時計は同期していないので、片道の遅れは直接測れない。
// 接続ごとに「受信時刻 − 送信時刻 (スマホの performance.now)」を集め、その最小値を基準にする。
// 基準との差は「最も速く届いたときより何ms遅れたか」で、時計のずれ (一定) は差し引かれる。

/// 基準より遅れたら押下を破棄する (ms)。
/// 根拠: 実Wi-Fiの主21試行＋修正後6試行 (2026-11-09、docs/develop/acceptance/2026-11-09-react-performance.md) で、
/// 正常時のACK往復の最大は384.0ms (E-ws)。片道の遅れはこの往復を超えないので、正常に届いた押下は破棄しない。
/// バースト損失・通信復旧でまとめて届く数秒遅れの押下だけを破棄する。
pub const STALE_DOWN_MS: f64 = 500.0;
/// 最小値をとる期間。2つの区間の最小を使い、最大でこの2倍の期間を見る。時計の進み方の差 (ppm単位) を溜めない
const BUCKET_MS: f64 = 15_000.0;

#[derive(Debug, Default)]
pub struct ClockBase {
    current: Option<f64>,
    previous: Option<f64>,
    started: f64,
}

impl ClockBase {
    /// スマホの送信時刻 t を受信時刻 now (ホストの単調時計 ms) で観測する。不正な t は使わない
    pub fn observe(&mut self, now: f64, t: Option<f64>) {
        let Some(t) = t.filter(|t| t.is_finite() && *t >= 0.0) else { return };
        if self.current.is_none() && self.previous.is_none() { self.started = now; }
        if now - self.started >= BUCKET_MS {
            self.previous = self.current.take();
            self.started = now;
        }
        let offset = now - t;
        self.current = Some(self.current.map_or(offset, |c| c.min(offset)));
    }

    /// 基準よりどれだけ遅れているか (ms)。基準がない・t が不正なら判定できない (None)
    pub fn delay(&self, now: f64, t: Option<f64>) -> Option<f64> {
        let t = t.filter(|t| t.is_finite() && *t >= 0.0)?;
        let base = match (self.current, self.previous) {
            (Some(a), Some(b)) => a.min(b),
            (a, b) => a.or(b)?,
        };
        Some((now - t - base).max(0.0))
    }

    /// 押下を適用してよいか。判定できないときは、遅れて実行するより安全側 (破棄) に倒す
    #[cfg(test)]
    pub fn fresh_down(&self, now: f64, t: Option<f64>) -> bool {
        self.delay(now, t).is_some_and(|d| d < STALE_DOWN_MS)
    }
}

/// ホストの単調時計 (ms)。壁時計の変更に影響されない
pub fn mono_ms() -> f64 {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed().as_secs_f64() * 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clock_offset_cancels_and_only_late_downs_are_stale() {
        // スマホの時計がPCより 1,000,000ms ずれていても、遅れだけを見る
        let mut c = ClockBase::default();
        let skew = -1_000_000.0;
        c.observe(100.0, Some(100.0 - 20.0 - skew)); // 20ms で届いた ping
        c.observe(1100.0, Some(1100.0 - 15.0 - skew)); // 15ms (最速)
        assert_eq!(c.delay(2000.0, Some(2000.0 - 15.0 - skew)), Some(0.0));
        assert!(c.fresh_down(2000.0, Some(2000.0 - 400.0 - skew)), "正常時の最大級の遅れは破棄しない");
        assert!(!c.fresh_down(5000.0, Some(5000.0 - 2015.0 - skew)), "2秒遅れた押下は破棄する");
        assert!(!c.fresh_down(5000.0, Some(5000.0 - 15.0 - STALE_DOWN_MS - skew)));
    }

    #[test]
    fn unknown_time_or_missing_base_is_treated_as_stale() {
        let mut c = ClockBase::default();
        assert!(!c.fresh_down(10.0, Some(5.0)), "基準がない");
        c.observe(10.0, Some(5.0));
        for t in [None, Some(f64::NAN), Some(f64::INFINITY), Some(-1.0)] { assert!(!c.fresh_down(20.0, t)); }
        c.observe(20.0, Some(f64::NAN));
        assert_eq!(c.delay(20.0, Some(15.0)), Some(0.0), "不正な時刻で基準を汚さない");
    }

    #[test]
    fn base_follows_the_recent_window_instead_of_a_stale_minimum() {
        let mut c = ClockBase::default();
        c.observe(0.0, Some(0.0)); // 基準 0
        // 30秒以上たつと古い最小値は捨て、新しい区間の最小値に追従する (スマホ時計の進み方の差)
        c.observe(16_000.0, Some(15_990.0)); // 10
        c.observe(32_000.0, Some(31_980.0)); // 20
        assert_eq!(c.delay(32_000.0, Some(31_980.0)), Some(10.0));
        c.observe(48_000.0, Some(47_980.0));
        assert_eq!(c.delay(48_000.0, Some(47_980.0)), Some(0.0));
    }
}
