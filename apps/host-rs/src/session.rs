// セッションの判定だけを扱う。OS・通信・ログ・時計の読取りを行わない。
// Hubが観測した事実と明示時刻から、許可・拒否理由・遷移案を返す。
pub(crate) const MIN_PLAYERS: usize = 2;
pub(crate) const SLOT_NAMES: [&str; 4] = ["P1", "P2", "P3", "P4"];
#[derive(PartialEq, Eq, Clone, Copy)]
pub(crate) enum Phase {
    Lobby,
    Preparing,
    Coop,
    Paused,
}

impl Phase {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Phase::Lobby => "lobby",
            Phase::Preparing => "preparing",
            Phase::Coop => "coop",
            Phase::Paused => "paused",
        }
    }
    pub(crate) fn parse(s: &str) -> Option<Phase> {
        match s {
            "lobby" => Some(Phase::Lobby),
            "preparing" => Some(Phase::Preparing),
            "coop" => Some(Phase::Coop),
            "paused" => Some(Phase::Paused),
            _ => None,
        }
    }
}

#[derive(PartialEq, Eq, Clone, Copy)]
pub(crate) enum InjectMode {
    Off,
    Test,
    On,
}

impl InjectMode {
    pub(crate) fn name(self) -> &'static str {
        match self {
            InjectMode::Off => "off",
            InjectMode::Test => "test",
            InjectMode::On => "on",
        }
    }
    pub(crate) fn parse(s: &str) -> Option<InjectMode> {
        match s {
            "off" => Some(InjectMode::Off),
            "test" => Some(InjectMode::Test),
            "on" => Some(InjectMode::On),
            _ => None,
        }
    }
}


pub(crate) struct ReadyFacts<'a> {
    pub phase: Phase,
    pub connected: &'a [usize],
    pub participants: &'a [usize],
    pub unacked: &'a [usize],
    pub has_profile: bool,
    pub lineup_ok: bool,
    pub title_known: bool,
    pub controller_supported: bool,
    pub input_available: bool,
    pub stop_available: bool,
    pub inject: InjectMode,
    pub can_inject: bool,
}
impl ReadyFacts<'_> {
    pub(crate) fn reasons(&self, require_focus: bool) -> Vec<String> {
        let mut reasons: Vec<String> = Vec::new();
        if self.phase == Phase::Paused && !self.participants.is_empty() {
            // 再開は Ready で決めた参加者で行う。人数を変えるときは終了して組み直す (勝手に組み直さない)
            let missing: Vec<&str> = self.participants.iter().filter(|i| !self.connected.contains(i)).map(|&i| SLOT_NAMES[i]).collect();
            if !missing.is_empty() {
                reasons.push(format!("{}の再接続を待っています。人数を変えるときは終了して組み直してください", missing.join("・")));
            }
        } else {
            if !self.connected.contains(&0) { reasons.push("ホスト（P1）の接続が必要です".into()); }
            if self.connected.len() < MIN_PLAYERS { reasons.push(format!("{}人以上の接続が必要です", MIN_PLAYERS)); }
            if !self.has_profile {
                reasons.push("このゲームの操作定義がありません".into());
            }
        }
        let unacked: Vec<&str> = self.unacked.iter().map(|&i| SLOT_NAMES[i]).collect();
        if !unacked.is_empty() {
            reasons.push(format!("{}が新しい担当をスマホで確認していません", unacked.join("・")));
        }
        if self.phase != Phase::Paused && !self.lineup_ok {
            reasons.push("PCの画面でメンバーと分担を決定してください（参加者やゲームが変わった場合は決定し直してください）".into());
        }
        if !self.title_known { reasons.push("ゲームを選択してください".into()); }
        if !self.controller_supported {
            reasons.push("このゲームはマウス操作が中心のため、スマホで分担できる操作がありません".into());
        }
        if !self.input_available { reasons.push("入力ドライバーが利用できません".into()); }
        if !self.stop_available { reasons.push("PCの緊急停止キーを登録してください".into()); }
        // 入力が OFF なのは緊急停止の後か、診断で切り替えたとき。PC の前で確かめてから再開させる (#114)
        if self.inject == InjectMode::Off { reasons.push("入力が止まっています（緊急停止など）。PCの画面で「入力を再開する」を押してください".into()); }
        else if !self.can_inject && (require_focus || self.inject != InjectMode::On) { reasons.push("対象のゲームを前面にしてください".into()); }
        reasons
    }
}

pub(crate) fn is_host(slot: usize) -> bool { slot == 0 }
pub(crate) fn can_prepare(phase: Phase, host_connected: bool, lineup_ok: bool) -> bool {
    phase == Phase::Lobby && host_connected && lineup_ok
}
pub(crate) fn can_ready(phase: Phase, no_reasons: bool) -> bool { phase == Phase::Preparing && no_reasons }
pub(crate) fn can_resume(phase: Phase, host_ready: bool, no_reasons: bool) -> bool {
    phase == Phase::Paused && host_ready && no_reasons
}
pub(crate) fn command_allowed(slot: usize, cmd: &str, phase: Phase, prepare: bool, ready: bool, resume: bool) -> bool {
    is_host(slot) && match cmd {
        "PREPARE" => phase == Phase::Lobby && prepare,
        "READY" => phase == Phase::Preparing && ready,
        "RESUME" => phase == Phase::Paused && resume,
        "PAUSE" => matches!(phase, Phase::Coop | Phase::Paused),
        "OPEN_GAME" => matches!(phase, Phase::Preparing | Phase::Paused),
        "END" => phase != Phase::Lobby,
        _ => false,
    }
}
pub(crate) fn command_epoch_valid(cmd: &str, epoch: Option<u64>, current: u64) -> bool {
    !matches!(cmd, "PREPARE" | "READY" | "RESUME" | "OPEN_GAME") || epoch == Some(current)
}
pub(crate) struct PhaseChange { pub clear_lineup: bool }
pub(crate) fn phase_change(from: Phase, to: Phase) -> Option<PhaseChange> {
    (from != to).then_some(PhaseChange { clear_lineup: to == Phase::Lobby })
}
pub(crate) fn can_swap(phase: Phase, connected: &[usize], participants: &[usize], a: usize, b: usize) -> bool {
    let set = match phase {
        Phase::Lobby | Phase::Preparing => connected,
        Phase::Paused if !participants.is_empty() => participants,
        _ => return false,
    };
    a != b && set.contains(&a) && set.contains(&b)
}
pub(crate) fn is_assigned(assigned: &[Vec<String>], slot: usize, action: &str) -> bool {
    assigned.get(slot).is_some_and(|a| a.iter().any(|x| x == action))
}
pub(crate) fn auto_resume_window(phase: Phase, reason: Option<&str>, enabled: bool, now: u64, until: u64) -> bool {
    phase == Phase::Paused && reason.is_some_and(|r| r.ends_with("disconnected")) && enabled && now <= until
}
pub(crate) struct DisconnectPlan { pub pause_or_wait: bool, pub extend_deadline: bool }
pub(crate) fn disconnect_plan(phase: Phase, reason: Option<&str>, participant: bool, replaced: bool, now: u64, until: u64) -> DisconnectPlan {
    let pause_or_wait = participant && (phase == Phase::Coop || phase == Phase::Paused && reason.is_some_and(|r| r.ends_with("disconnected")));
    DisconnectPlan { pause_or_wait, extend_deadline: pause_or_wait && (phase == Phase::Coop || !replaced && now <= until) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready() -> ReadyFacts<'static> {
        ReadyFacts { phase: Phase::Preparing, connected: &[0, 1, 2], participants: &[], unacked: &[],
            has_profile: true, lineup_ok: true, title_known: true, controller_supported: true,
            input_available: true, stop_available: true, inject: InjectMode::On, can_inject: true }
    }

    #[test]
    fn commands_require_the_host_and_the_existing_phase_for_every_transition() {
        let cases = [
            (Phase::Lobby, vec!["PREPARE"]),
            (Phase::Preparing, vec!["READY", "OPEN_GAME", "END"]),
            (Phase::Coop, vec!["PAUSE", "END"]),
            (Phase::Paused, vec!["RESUME", "PAUSE", "OPEN_GAME", "END"]),
        ];
        for (phase, allowed) in cases {
            for cmd in ["PREPARE", "READY", "RESUME", "PAUSE", "OPEN_GAME", "END", "START", "unknown"] {
                assert_eq!(command_allowed(0, cmd, phase, true, true, true), allowed.contains(&cmd));
                for slot in 1..4 { assert!(!command_allowed(slot, cmd, phase, true, true, true)); }
            }
        }
        assert!(!command_allowed(0, "PREPARE", Phase::Lobby, false, true, true));
        assert!(!command_allowed(0, "READY", Phase::Preparing, true, false, true));
        assert!(!command_allowed(0, "RESUME", Phase::Paused, true, true, false));
    }

    #[test]
    fn prepare_ready_and_resume_have_distinct_conditions_for_two_three_and_four_people() {
        for connected in [&[0, 1][..], &[0, 1, 2][..], &[0, 1, 2, 3][..]] {
            let mut f = ready(); f.connected = connected;
            assert!(f.reasons(false).is_empty());
            assert!(can_prepare(Phase::Lobby, true, true));
            assert!(can_ready(f.phase, f.reasons(false).is_empty()));
            assert!(!can_resume(f.phase, true, true));
            f.phase = Phase::Paused; f.participants = connected;
            assert!(can_resume(f.phase, true, f.reasons(false).is_empty()));
            assert!(!can_resume(f.phase, false, true));
        }
        assert!(!can_prepare(Phase::Lobby, false, true));
        assert!(!can_prepare(Phase::Lobby, true, false));
        assert!(!can_prepare(Phase::Preparing, true, true));
    }

    #[test]
    fn rejection_reasons_keep_their_exact_order_and_wording() {
        let f = ReadyFacts { connected: &[], unacked: &[1, 3], has_profile: false, lineup_ok: false,
            title_known: false, controller_supported: false, input_available: false, stop_available: false,
            inject: InjectMode::Off, can_inject: false, ..ready() };
        assert_eq!(f.reasons(false), [
            "ホスト（P1）の接続が必要です", "2人以上の接続が必要です", "このゲームの操作定義がありません",
            "P2・P4が新しい担当をスマホで確認していません",
            "PCの画面でメンバーと分担を決定してください（参加者やゲームが変わった場合は決定し直してください）",
            "ゲームを選択してください", "このゲームはマウス操作が中心のため、スマホで分担できる操作がありません",
            "入力ドライバーが利用できません", "PCの緊急停止キーを登録してください",
            "入力が止まっています（緊急停止など）。PCの画面で「入力を再開する」を押してください",
        ]);
    }

    #[test]
    fn resume_keeps_fixed_participants_and_does_not_rebuild_the_lineup() {
        let f = ReadyFacts { phase: Phase::Paused, participants: &[0, 1, 2], connected: &[0, 2, 3],
            lineup_ok: false, has_profile: false, ..ready() };
        assert_eq!(f.reasons(false), ["P2の再接続を待っています。人数を変えるときは終了して組み直してください"]);
        let mut reconnected = f; reconnected.connected = &[0, 1, 2, 3];
        assert!(reconnected.reasons(false).is_empty());
    }

    #[test]
    fn on_mode_allows_a_focus_request_but_test_mode_requires_current_focus() {
        let mut f = ReadyFacts { can_inject: false, ..ready() };
        assert!(f.reasons(false).is_empty());
        assert_eq!(f.reasons(true), ["対象のゲームを前面にしてください"]);
        f.inject = InjectMode::Test;
        assert_eq!(f.reasons(false), ["対象のゲームを前面にしてください"]);
    }

    #[test]
    fn epoch_rejects_old_start_requests_but_always_preserves_stop_priority() {
        for cmd in ["PREPARE", "READY", "RESUME", "OPEN_GAME"] {
            assert!(command_epoch_valid(cmd, Some(7), 7));
            for epoch in [None, Some(6), Some(8)] { assert!(!command_epoch_valid(cmd, epoch, 7)); }
        }
        for cmd in ["PAUSE", "END"] {
            assert!(command_epoch_valid(cmd, None, 7));
            assert!(command_epoch_valid(cmd, Some(6), 7));
        }
    }

    #[test]
    fn role_swaps_require_two_distinct_eligible_members_and_keep_host_identity() {
        for phase in [Phase::Lobby, Phase::Preparing] {
            assert!(can_swap(phase, &[0, 2], &[], 0, 2));
            assert!(!can_swap(phase, &[0, 2], &[], 0, 1));
            assert!(!can_swap(phase, &[0, 2], &[], 0, 0));
        }
        assert!(can_swap(Phase::Paused, &[0, 2, 3], &[0, 1, 2], 0, 1));
        assert!(!can_swap(Phase::Paused, &[0, 2, 3], &[0, 1, 2], 0, 3));
        assert!(!can_swap(Phase::Paused, &[0, 1], &[], 0, 1));
        assert!(!can_swap(Phase::Coop, &[0, 1], &[0, 1], 0, 1));
        assert!(is_host(0)); assert!(!is_host(1));
        let assigned = vec![vec!["move".into()], vec!["look".into()]];
        assert!(is_assigned(&assigned, 1, "look"));
        assert!(!is_assigned(&assigned, 0, "look"));
        assert!(!is_assigned(&assigned, 3, "move"));
    }

    #[test]
    fn disconnect_and_auto_resume_use_the_same_inclusive_deadline_without_extending_replacements() {
        for now in [99, 100, 101] {
            assert!(disconnect_plan(Phase::Coop, None, true, true, now, 100).extend_deadline);
            let p = disconnect_plan(Phase::Paused, Some("P2 disconnected"), true, false, now, 100);
            assert!(p.pause_or_wait); assert_eq!(p.extend_deadline, now <= 100);
            assert!(!disconnect_plan(Phase::Paused, Some("P2 disconnected"), true, true, now, 100).extend_deadline);
            assert_eq!(auto_resume_window(Phase::Paused, Some("P2 disconnected"), true, now, 100), now <= 100);
        }
        for reason in [None, Some("host pause"), Some("emergency stop"), Some("app return")] {
            assert!(!auto_resume_window(Phase::Paused, reason, true, 99, 100));
            assert!(!disconnect_plan(Phase::Paused, reason, true, false, 99, 100).pause_or_wait);
        }
        assert!(!auto_resume_window(Phase::Paused, Some("P2 disconnected"), false, 99, 100));
        assert!(!auto_resume_window(Phase::Coop, Some("P2 disconnected"), true, 99, 100));
        assert!(!disconnect_plan(Phase::Coop, None, false, false, 99, 100).pause_or_wait);
    }

    #[test]
    fn ordinary_phase_changes_are_idempotent_and_only_lobby_discards_the_lineup() {
        for from in [Phase::Lobby, Phase::Preparing, Phase::Coop, Phase::Paused] {
            for to in [Phase::Lobby, Phase::Preparing, Phase::Coop, Phase::Paused] {
                let change = phase_change(from, to);
                assert_eq!(change.is_none(), from == to);
                if let Some(change) = change { assert_eq!(change.clear_lineup, to == Phase::Lobby); }
            }
        }
        // PAUSE再要求はcommand側の明示的な全解放であり、通常遷移の冪等性へ統合しない。
        assert!(command_allowed(0, "PAUSE", Phase::Paused, false, false, false));
    }
}
