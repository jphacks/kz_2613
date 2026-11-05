// 視点の累積差分・到着間隔・補間・端数。時刻と認可済み差分を受け、OSへの要求量を返す。
// セッション認可、epoch/lseq検証、実際の入力送出、タイマー実行は呼出し側の責務。

use std::collections::VecDeque;
use std::time::{Duration, Instant};

pub(crate) const LOOK_TICK: Duration = Duration::from_millis(4);

/// OS要求のi32と既存診断のi64を別々に保持し、極端な量の整数化も従来と同じにする。
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Movement {
    pub(crate) dx: i32,
    pub(crate) dy: i32,
    sum_x: i64,
    sum_y: i64,
}

pub(crate) struct Look {
    pub(crate) slot: &'static str,
    pub(crate) px: f64,
    pub(crate) py: f64,
    pub(crate) fx: f64,
    pub(crate) fy: f64,
    pub(crate) sum_x: i64,
    pub(crate) sum_y: i64,
    pub(crate) n: u64,
    pub(crate) last_tick: Instant,
    pub(crate) last_arrive: Option<Instant>,
    pub(crate) gaps: VecDeque<(Instant, f64)>,
    pub(crate) tau: f64,
    pub(crate) min_ms: f64,
    pub(crate) max_ms: f64,
}

impl Look {
    pub(crate) fn new(now: Instant, min_ms: f64, max_ms: f64) -> Self {
        Self { slot: "P2", px: 0.0, py: 0.0, fx: 0.0, fy: 0.0, sum_x: 0, sum_y: 0, n: 0,
            last_tick: now, last_arrive: None, gaps: VecDeque::new(), tau: min_ms, min_ms, max_ms }
    }

    pub(crate) fn add(&mut self, slot: &'static str, dx: f64, dy: f64, now: Instant) {
        self.slot = slot;
        if let Some(prev) = self.last_arrive {
            let gap = now.duration_since(prev).as_secs_f64() * 1000.0;
            if gap < 1000.0 { self.gaps.push_back((now, gap)); }
        }
        self.last_arrive = Some(now);
        while self.gaps.front().is_some_and(|(at, _)| now.duration_since(*at) > Duration::from_secs(2)) {
            self.gaps.pop_front();
        }
        let max_gap = self.gaps.iter().map(|(_, g)| *g).fold(0.0, f64::max);
        self.tau = (max_gap * 0.5).clamp(self.min_ms, self.max_ms);
        self.px += dx;
        self.py += dy;
    }

    /// 停止/epoch変更は未処理量と端数のみ破棄する。診断集計と間隔履歴は従来どおり残す。
    pub(crate) fn reset(&mut self) {
        self.px = 0.0; self.py = 0.0; self.fx = 0.0; self.fy = 0.0;
    }

    pub(crate) fn tick(&mut self, now: Instant, allowed: bool) -> Option<Movement> {
        let dt = now.duration_since(self.last_tick).as_secs_f64() * 1000.0;
        self.last_tick = now;
        if self.px == 0.0 && self.py == 0.0 { return None; }
        if !allowed { self.reset(); return None; }
        let k = 1.0 - (-dt / self.tau).exp();
        let small = self.px.abs() < 0.5 && self.py.abs() < 0.5;
        let ox = if small { self.px } else { self.px * k };
        let oy = if small { self.py } else { self.py * k };
        self.px -= ox; self.py -= oy;
        self.fx += ox; self.fy += oy;
        let ix = self.fx.trunc();
        let iy = self.fy.trunc();
        self.fx -= ix; self.fy -= iy;
        (ix != 0.0 || iy != 0.0).then_some(Movement { dx: ix as i32, dy: iy as i32, sum_x: ix as i64, sum_y: iy as i64 })
    }

    /// 送出後に集計する。失敗時も数える既存診断の意味を、この責務移動では変えない。
    pub(crate) fn record_output(&mut self, movement: Movement) {
        self.sum_x += movement.sum_x;
        self.sum_y += movement.sum_y;
        self.n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(look: &mut Look, at: Instant) -> Option<Movement> {
        let movement = look.tick(at, true);
        if let Some(m) = movement { look.record_output(m); }
        movement
    }

    #[test]
    fn four_millisecond_tick_uses_the_existing_exponential_coefficient() {
        assert_eq!(LOOK_TICK, Duration::from_millis(4));
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 100.0, -60.0, now);
        let k = 1.0 - (-4.0_f64 / 30.0).exp();
        let output = apply(&mut look, now + LOOK_TICK).unwrap();
        assert_eq!((output.dx, output.dy), ((100.0*k).trunc() as i32, (-60.0*k).trunc() as i32));
        assert!((look.px - 100.0*(1.0-k)).abs() < 1e-10);
        assert!((look.py + 60.0*(1.0-k)).abs() < 1e-10);
    }

    #[test]
    fn signed_motion_and_fractional_remainders_are_conserved() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P3", 123.75, -52.25, now);
        for n in 1..=100 {
            apply(&mut look, now + LOOK_TICK*n);
            assert!((look.sum_x as f64 + look.px + look.fx - 123.75).abs() < 1e-9);
            assert!((look.sum_y as f64 + look.py + look.fy + 52.25).abs() < 1e-9);
        }
        assert_eq!((look.sum_x, look.sum_y, look.slot), (123, -52, "P3"));
        assert_eq!((look.px, look.py), (0.0, 0.0));
        assert!((look.fx - 0.75).abs() < 1e-9 && (look.fy + 0.25).abs() < 1e-9);
    }

    #[test]
    fn small_pending_amount_flushes_and_fraction_waits_for_later_input() {
        let now = Instant::now();
        let mut boundary = Look::new(now, 30.0, 120.0);
        boundary.add("P2", 0.5, -0.5, now);
        assert_eq!(apply(&mut boundary, now), None);
        assert_eq!((boundary.px, boundary.py), (0.5, -0.5)); // ちょうど0.5pxは全量消費しない。
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 0.4, -0.4, now);
        assert_eq!(apply(&mut look, now), None);
        assert_eq!((look.px, look.py, look.fx, look.fy), (0.0, 0.0, 0.4, -0.4));
        assert_eq!(apply(&mut look, now + LOOK_TICK), None);
        look.add("P2", 0.4, -0.4, now + LOOK_TICK);
        assert_eq!(apply(&mut look, now + LOOK_TICK*2), None);
        look.add("P2", 0.4, -0.4, now + LOOK_TICK*2);
        let output = apply(&mut look, now + LOOK_TICK*3).unwrap();
        assert_eq!((output.dx, output.dy), (1, -1));
    }

    #[test]
    fn smoothing_uses_max_gap_half_and_existing_min_max_limits() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 1.0, 0.0, now);
        look.add("P2", 1.0, 0.0, now + Duration::from_millis(20));
        assert_eq!(look.tau, 30.0);
        look.add("P2", 1.0, 0.0, now + Duration::from_millis(220));
        assert_eq!(look.tau, 100.0);
        look.add("P2", 1.0, 0.0, now + Duration::from_millis(520));
        assert_eq!(look.tau, 120.0);
        look.add("P2", 1.0, 0.0, now + Duration::from_millis(540));
        assert_eq!(look.tau, 120.0); // 平均ではなく直近の最大値。
    }

    #[test]
    fn gap_window_keeps_exact_two_seconds_and_excludes_one_second_idle() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 0.0, 0.0, now);
        look.add("P2", 0.0, 0.0, now + Duration::from_millis(300));
        look.add("P2", 0.0, 0.0, now + Duration::from_millis(2300));
        assert_eq!(look.tau, 120.0); // 300msの履歴はちょうど2秒なので残る。
        look.add("P2", 0.0, 0.0, now + Duration::from_millis(2301));
        assert_eq!(look.tau, 30.0);
        assert!(look.gaps.iter().all(|(_, gap)| *gap < 1000.0));
        let mut idle = Look::new(now, 30.0, 120.0);
        idle.add("P2", 0.0, 0.0, now);
        idle.add("P2", 0.0, 0.0, now + Duration::from_secs(1));
        assert!(idle.gaps.is_empty()); // ちょうど1000msもドラッグ中のgapとして扱わない。
        assert_eq!(idle.tau, 30.0);
    }

    #[test]
    fn reset_discards_pending_and_fractions_but_keeps_existing_report_and_arrival_history() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 10.4, -5.7, now);
        apply(&mut look, now + Duration::from_secs(1));
        look.add("P2", 80.0, -40.0, now + Duration::from_millis(1100));
        let report = (look.sum_x, look.sum_y, look.n);
        let arrive = look.last_arrive;
        look.reset();
        assert_eq!((look.px, look.py, look.fx, look.fy), (0.0, 0.0, 0.0, 0.0));
        assert_eq!((look.sum_x, look.sum_y, look.n), report);
        assert_eq!(look.last_arrive, arrive);
        assert_eq!(apply(&mut look, now + Duration::from_millis(1104)), None);
    }

    #[test]
    fn forbidden_tick_drops_motion_without_output_and_advances_clock() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        look.add("P2", 100.0, -100.0, now);
        assert_eq!(look.tick(now + LOOK_TICK, false), None);
        assert_eq!((look.px, look.py, look.fx, look.fy), (0.0, 0.0, 0.0, 0.0));
        assert_eq!(look.last_tick, now + LOOK_TICK);
        assert_eq!(apply(&mut look, now + LOOK_TICK*2), None);
    }

    #[test]
    fn large_motion_keeps_existing_distinct_os_and_report_integer_casts() {
        let now = Instant::now();
        let mut look = Look::new(now, 30.0, 120.0);
        let amount = i32::MAX as f64 * 4.0;
        look.add("P2", amount, -amount, now);
        let output = apply(&mut look, now + Duration::from_secs(10)).unwrap();
        assert_eq!((output.dx, output.dy), (i32::MAX, i32::MIN));
        assert_eq!((look.sum_x, look.sum_y), (amount as i64, -amount as i64));
    }
}
