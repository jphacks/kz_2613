// 認可済みのキー/ボタン入力の所有・連打キュー・時間制約。
// OS入力・セッション・通信・ログ・タイマー実行器には依存しない。

use std::collections::{BTreeSet, VecDeque};
use std::time::{Duration, Instant};

pub(crate) const MIN_HOLD_MS: u64 = 60;
pub(crate) const MIN_GAP_MS: u64 = 50;
pub(crate) const MAX_QUEUE: usize = 8;

/// 出力指示は1件ずつ返す。呼出し側が送出してから次の時刻を渡すため、
/// OSやログが待たせた場合も、まとめた固定時刻で後続の辺を先行消費しない。
#[derive(Debug, PartialEq)]
pub(crate) enum PumpStep {
    Idle,
    Wait { delay: Duration, generation: u64 },
    Emit { down: bool, slot: &'static str },
}

/// 出力ごとの状態。crate可視のフィールドは診断と既存回帰試験の観測用。
/// 製品側の所有/キュー/時間/世代の変更は下のメソッドへ集約する。
#[derive(Default)]
pub(crate) struct OutputState {
    pub(crate) holders: BTreeSet<&'static str>,
    pub(crate) physical: bool,
    pub(crate) changed_at: Option<Instant>,
    pub(crate) queue: VecDeque<(bool, &'static str)>,
    pub(crate) timer_gen: u64,
    pub(crate) timer_pending: bool,
}

impl OutputState {
    /// 集約押下が変わったときだけキューへ積み、破棄した古い辺の組数を返す。
    pub(crate) fn set_holder(&mut self, slot: &'static str, down: bool) -> Option<usize> {
        let before = !self.holders.is_empty();
        if down {
            self.holders.insert(slot);
        } else {
            self.holders.remove(slot);
        }
        let after = !self.holders.is_empty();
        if before == after {
            return None;
        }
        let mut dropped = 0;
        while self.queue.len() >= MAX_QUEUE {
            self.queue.drain(..2);
            dropped += 1;
        }
        self.queue.push_back((after, slot));
        Some(dropped)
    }

    pub(crate) fn pump_step(&mut self, now: Instant) -> PumpStep {
        if self.timer_pending {
            return PumpStep::Idle;
        }
        loop {
            let Some(&(down, slot)) = self.queue.front() else {
                return PumpStep::Idle;
            };
            if down == self.physical {
                self.queue.pop_front();
                continue;
            }
            let min = Duration::from_millis(if self.physical {
                MIN_HOLD_MS
            } else {
                MIN_GAP_MS
            });
            let elapsed = self
                .changed_at
                .map(|t| now.saturating_duration_since(t))
                .unwrap_or(Duration::MAX);
            if elapsed < min {
                self.timer_pending = true;
                self.timer_gen += 1;
                return PumpStep::Wait {
                    delay: min - elapsed,
                    generation: self.timer_gen,
                };
            }
            self.queue.pop_front();
            // 失敗時の巻戻しをここで追加しない。#170で記録した従来の送出前更新を保つ。
            self.physical = down;
            self.changed_at = Some(now);
            return PumpStep::Emit { down, slot };
        }
    }

    pub(crate) fn on_timer(&mut self, generation: u64) -> bool {
        if !self.timer_pending || self.timer_gen != generation {
            return false;
        }
        self.timer_pending = false;
        true
    }

    /// 本人だけの解放で、出力の押下を残すときに使う (#262)。その枠の保留辺 (解放前の連打) を捨て、
    /// 他の枠の辺は残す。最後に集約押下と一致させるので、新しい押下は1回だけ出る (既に押していれば出さない)。
    /// 時間制約の待ちと世代は変えない (60ms/50msは従来どおり pump_step が守る)。
    pub(crate) fn drop_slot_edges(&mut self, slot: &'static str) {
        let mut state = self.physical;
        let mut queue = VecDeque::new();
        for (down, s) in self.queue.drain(..) {
            if s == slot || down == state {
                continue;
            }
            queue.push_back((down, s));
            state = down;
        }
        let target = !self.holders.is_empty();
        if state != target {
            queue.push_back((target, slot));
        }
        self.queue = queue;
    }

    /// 停止は最低時間より優先し、所有者がなくなった出力の保留辺/予約世代を破棄する。
    /// trueのときだけ呼出し側がupを要求する。送出成否による再試行は従来どおり別責務。
    pub(crate) fn release(&mut self, slot: Option<&'static str>, now: Instant) -> bool {
        match slot {
            Some(s) => {
                self.holders.remove(s);
            }
            None => self.holders.clear(),
        }
        if !self.holders.is_empty() {
            return false;
        }
        self.timer_pending = false;
        self.timer_gen += 1;
        self.queue.clear();
        if self.physical {
            self.physical = false;
            self.changed_at = Some(now);
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_holders_emit_only_first_down_and_last_up() {
        let now = Instant::now();
        let mut output = OutputState::default();
        assert_eq!(output.set_holder("P1", true), Some(0));
        assert_eq!(
            output.pump_step(now),
            PumpStep::Emit {
                down: true,
                slot: "P1"
            }
        );
        assert_eq!(output.set_holder("P2", true), None);
        assert_eq!(output.set_holder("P1", false), None);
        assert_eq!(
            output.pump_step(now + Duration::from_secs(1)),
            PumpStep::Idle
        );
        assert_eq!(output.set_holder("P2", false), Some(0));
        assert_eq!(
            output.pump_step(now + Duration::from_secs(1)),
            PumpStep::Emit {
                down: false,
                slot: "P2"
            }
        );
    }

    #[test]
    fn exact_hold_and_gap_boundaries_use_explicit_time_without_sleep() {
        let now = Instant::now();
        let mut output = OutputState::default();
        output.set_holder("P1", true);
        assert!(matches!(
            output.pump_step(now),
            PumpStep::Emit { down: true, .. }
        ));
        output.set_holder("P1", false);
        output.set_holder("P1", true);
        assert_eq!(
            output.pump_step(now + Duration::from_millis(59)),
            PumpStep::Wait {
                delay: Duration::from_millis(1),
                generation: 1
            }
        );
        assert!(output.on_timer(1));
        assert_eq!(
            output.pump_step(now + Duration::from_millis(60)),
            PumpStep::Emit {
                down: false,
                slot: "P1"
            }
        );
        assert_eq!(
            output.pump_step(now + Duration::from_millis(109)),
            PumpStep::Wait {
                delay: Duration::from_millis(1),
                generation: 2
            }
        );
        assert!(output.on_timer(2));
        assert_eq!(
            output.pump_step(now + Duration::from_millis(110)),
            PumpStep::Emit {
                down: true,
                slot: "P1"
            }
        );
    }

    #[test]
    fn stopped_queue_and_old_timer_cannot_restore_a_press() {
        let now = Instant::now();
        let mut output = OutputState::default();
        output.set_holder("P1", true);
        output.pump_step(now);
        output.set_holder("P1", false);
        output.set_holder("P1", true);
        let PumpStep::Wait { generation, .. } = output.pump_step(now) else {
            panic!("待機が必要")
        };
        assert!(output.release(None, now));
        assert!(output.queue.is_empty());
        assert!(!output.on_timer(generation));
        assert_eq!(
            output.pump_step(now + Duration::from_secs(1)),
            PumpStep::Idle
        );
        assert!(!output.physical && output.holders.is_empty());
    }

    #[test]
    fn partial_stop_keeps_other_holder_and_full_stop_is_idempotent() {
        let now = Instant::now();
        let mut output = OutputState::default();
        output.set_holder("P1", true);
        output.set_holder("P2", true);
        output.pump_step(now);
        assert!(!output.release(Some("P1"), now));
        assert!(output.physical);
        assert_eq!(output.holders, BTreeSet::from(["P2"]));
        assert!(output.release(None, now));
        assert!(!output.release(None, now));
        assert!(!output.physical);
    }

    #[test]
    fn queue_keeps_latest_eight_edges_and_reports_pair_drops() {
        let mut output = OutputState::default();
        let mut holder = "P1";
        output.set_holder(holder, true);
        output.pump_step(Instant::now());
        let mut expected = VecDeque::new();
        let mut drops = 0;
        for next in ["P2", "P3", "P4", "P1", "P2", "P3"] {
            drops += output.set_holder(holder, false).unwrap();
            drops += output.set_holder(next, true).unwrap();
            expected.extend([(false, holder), (true, next)]);
            holder = next;
        }
        expected.drain(..4);
        assert_eq!(drops, 2);
        assert_eq!(output.queue, expected);
        assert_eq!(output.queue.len(), MAX_QUEUE);
    }

    #[test]
    fn a_stale_timer_does_not_complete_a_new_wait() {
        let now = Instant::now();
        let mut output = OutputState::default();
        output.set_holder("P1", true);
        output.pump_step(now);
        output.set_holder("P1", false);
        output.pump_step(now);
        let old = output.timer_gen;
        output.release(None, now);
        output.set_holder("P1", true);
        output.pump_step(now);
        let current = output.timer_gen;
        assert!(current > old && output.timer_pending);
        assert!(!output.on_timer(old));
        assert!(output.timer_pending);
        assert!(output.on_timer(current));
        assert_eq!(
            output.pump_step(now + Duration::from_millis(50)),
            PumpStep::Emit {
                down: true,
                slot: "P1"
            }
        );
    }

    #[test]
    fn dropping_own_edges_keeps_the_held_key_without_replaying_old_taps() {
        // 押したまま (物理down) で、本人の旧連打が最低押下待ちに積まれている → 捨てても押しっぱなしのまま、downを出し直さない
        let now = Instant::now();
        let mut output = OutputState {
            holders: BTreeSet::from(["P1"]),
            physical: true,
            changed_at: Some(now),
            ..Default::default()
        };
        output
            .queue
            .extend([(false, "P1"), (true, "P1"), (false, "P1"), (true, "P1")]);
        output.drop_slot_edges("P1");
        assert!(output.queue.is_empty() && output.physical);
        assert_eq!(
            output.pump_step(now + Duration::from_secs(1)),
            PumpStep::Idle
        );
    }

    #[test]
    fn dropping_own_edges_emits_the_new_press_once_after_the_minimum_gap() {
        // 離した直後 (物理up) に旧連打と新しい押下が積まれている → 新しい押下だけを、最低解放50msを守って1回出す
        let now = Instant::now();
        let mut output = OutputState {
            holders: BTreeSet::from(["P1"]),
            physical: false,
            changed_at: Some(now),
            ..Default::default()
        };
        output
            .queue
            .extend([(true, "P1"), (false, "P1"), (true, "P1")]);
        output.drop_slot_edges("P1");
        assert_eq!(output.queue, VecDeque::from([(true, "P1")]));
        assert!(matches!(
            output.pump_step(now + Duration::from_millis(10)),
            PumpStep::Wait { .. }
        ));
        assert!(output.on_timer(output.timer_gen));
        assert_eq!(
            output.pump_step(now + Duration::from_millis(50)),
            PumpStep::Emit {
                down: true,
                slot: "P1"
            }
        );
        assert_eq!(
            output.pump_step(now + Duration::from_secs(1)),
            PumpStep::Idle
        );
    }

    #[test]
    fn dropping_own_edges_keeps_another_slots_edges() {
        // 同じ出力に他の枠の辺が積まれていれば、それは残す。最後は集約押下 (本人の新しい押下) に合わせる
        let now = Instant::now();
        let mut output = OutputState {
            holders: BTreeSet::from(["P1"]),
            physical: true,
            changed_at: Some(now),
            ..Default::default()
        };
        output
            .queue
            .extend([(false, "P1"), (true, "P3"), (false, "P3"), (true, "P1")]);
        output.drop_slot_edges("P1");
        assert_eq!(output.queue, VecDeque::from([(false, "P3"), (true, "P1")]));
    }
}
