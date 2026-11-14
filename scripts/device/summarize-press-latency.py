"""計測用ホストのJSONLから押下遅延と遅延破棄数を集計する。"""

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
from statistics import fmean, median


METRICS = ("touchMs", "rttMs", "hostMs", "totalMs")
SLOTS = ("P1", "P2", "P3", "P4")


def summarize(path: Path) -> dict:
    samples = defaultdict(list)
    late_downs = defaultdict(int)
    with path.open(encoding="utf-8") as stream:
        for number, line in enumerate(stream, 1):
            try:
                event = json.loads(line)
                if not isinstance(event, dict):
                    raise ValueError("JSONオブジェクトが必要です")
                if event.get("kind") == "latency":
                    row = [event.get(metric) for metric in METRICS]
                    if event.get("slot") not in SLOTS or any(
                        type(value) not in (float, int) or not math.isfinite(value) or value < 0
                        for value in row
                    ):
                        raise ValueError("押下遅延の計測値が不正です")
                    samples[event["slot"]].append(row)
                elif (event.get("kind"), event.get("state"), event.get("reason")) == (
                    "stale_input", "down", "late"
                ):
                    if event.get("slot") not in SLOTS:
                        raise ValueError("遅延破棄の参加枠が不正です")
                    late_downs[event["slot"]] += 1
            except (ValueError, OverflowError) as error:
                raise ValueError(f"{path.name}:{number}: {error}") from error

    if not samples:
        raise ValueError(f"{path.name}: 押下遅延の計測値がありません")

    result = {}
    for slot in SLOTS:
        rows = samples[slot]
        if not rows and not late_downs[slot]:
            continue
        distribution = {}
        for metric, column in zip(METRICS, zip(*rows)):
            values = sorted(column)
            distribution[metric] = {
                "mean": round(fmean(values), 3),
                "median": median(values),
                "p95": values[math.ceil(len(values) * 0.95) - 1],
                "p99": values[math.ceil(len(values) * 0.99) - 1],
                "max": values[-1],
            }
        result[slot] = {
            "matchedPresses": len(rows),
            "latePresses": late_downs[slot],
            "distributionMs": distribution,
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path, help="変更前のセッションJSONL")
    parser.add_argument("after", type=Path, help="変更後のセッションJSONL")
    args = parser.parse_args()
    try:
        report = {"before": summarize(args.before), "after": summarize(args.after)}
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
