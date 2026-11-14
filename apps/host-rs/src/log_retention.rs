// ホストの記録 (logs/session-*.jsonl) を残す件数・日数 (#523)。起動のたびに、上限を超えた古い記録だけを消す。
// 既定は「新しい 30 件は必ず残し、それより古いもののうち 30 日を過ぎたものを消す」。実機の受入の証拠として残したい記録は、
// 名前に「keep」を含めれば消さない (例：session-2026-11-13T10-41-54-210Z-keep.jsonl)。
// RECOOPLAY_LOG_KEEP (残す件数) と RECOOPLAY_LOG_KEEP_DAYS (日数。0 なら消さない) で変えられる。
// session-*.jsonl のほかのファイルには触れない。
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const DEFAULT_KEEP: usize = 30;
const DEFAULT_DAYS: u64 = 30;

/// 環境変数の設定 (残す件数, 残す日数。日数が None なら消さない)
pub fn settings() -> (usize, Option<Duration>) {
    let keep = std::env::var("RECOOPLAY_LOG_KEEP")
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(DEFAULT_KEEP);
    let days = std::env::var("RECOOPLAY_LOG_KEEP_DAYS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(DEFAULT_DAYS);
    (
        keep,
        (days > 0).then(|| Duration::from_secs(days * 24 * 60 * 60)),
    )
}

/// 消してよい記録か (名前が session-*.jsonl で、keep を含まない)
fn prunable(name: &str) -> bool {
    name.starts_with("session-")
        && name.ends_with(".jsonl")
        && !name.to_ascii_lowercase().contains("keep")
}

/// 上限を超えた古い記録を消し、消したファイルを返す。新しい keep 件は日数によらず残す
pub fn prune(dir: &Path, keep: usize, max_age: Option<Duration>, now: SystemTime) -> Vec<PathBuf> {
    let Some(max_age) = max_age else {
        return Vec::new();
    };
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    // 名前は session-<UTC の日時>.jsonl なので、名前の順が新しさの順
    let mut logs: Vec<(String, PathBuf)> = rd
        .flatten()
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let name = e.file_name().to_str()?.to_string();
            prunable(&name).then(|| (name, e.path()))
        })
        .collect();
    logs.sort_by(|a, b| b.0.cmp(&a.0));
    let mut removed = Vec::new();
    for (_, path) in logs.into_iter().skip(keep) {
        let old = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > max_age);
        if old && std::fs::remove_file(&path).is_ok() {
            removed.push(path);
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_only_old_session_logs_beyond_the_newest() {
        let dir = std::env::temp_dir().join(format!("recooplay-logs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let names = [
            "session-2026-01-01T00-00-00-000Z.jsonl",
            "session-2026-01-02T00-00-00-000Z.jsonl",
            "session-2026-01-03T00-00-00-000Z-keep.jsonl",
            "session-2026-01-04T00-00-00-000Z.jsonl",
            "session-2026-01-05T00-00-00-000Z.jsonl",
            "latency-2026-01-01.jsonl",
            "notes.txt",
        ];
        for n in names {
            std::fs::write(dir.join(n), b"{}").unwrap();
        }
        // ファイルはどれも今作ったので、「今」を 40 日後にして古いとみなす
        let later = SystemTime::now() + Duration::from_secs(40 * 24 * 60 * 60);
        let removed = prune(&dir, 2, Some(Duration::from_secs(30 * 24 * 60 * 60)), later);
        let mut removed: Vec<String> = removed
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        removed.sort();
        assert_eq!(
            removed,
            [
                "session-2026-01-01T00-00-00-000Z.jsonl",
                "session-2026-01-02T00-00-00-000Z.jsonl"
            ],
            "新しい 2 件・keep の付いたもの・ほかのファイルは残す"
        );
        // 日数の上限に達していなければ消さない
        assert!(prune(
            &dir,
            0,
            Some(Duration::from_secs(30 * 24 * 60 * 60)),
            SystemTime::now()
        )
        .is_empty());
        // 日数なし (0 日) は消さない
        assert!(prune(&dir, 0, None, later).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
