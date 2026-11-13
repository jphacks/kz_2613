"""交差検証のログ (train.py --cv の COUNTS 行) を集計する。
    python scripts/preset-model/cv_summary.py <ログ...>
全体の合計 (操作の組が多いゲームほど重い) と、ゲームごとの平均 (どのゲームも同じ重み) を、
「このPCで読んだ生データを含むゲーム」と「手作りの定義だけのゲーム」に分けて表示する。
"""

import json
import sys

LOCAL = {"minecraft-java", "steam-105600", "steam-1568590", "steam-3241660", "steam-1621690", "steam-774861"}
KEYS = [("cat", "カテゴリ"), ("play_pair", "遊び:同じ人"), ("play_recall", "遊び:再現率"), ("play_axis", "遊び:軸"),
        ("pair", "全組:同じ人"), ("recall", "全組:再現率"), ("axis", "全組:軸")]


def main():
    games = {}
    for path in sys.argv[1:]:
        for line in open(path, encoding="utf-8"):
            if line.startswith("COUNTS "):
                c = json.loads(line[7:])
                games[c.pop("game")] = c
    groups = [("全ゲーム", list(games)), ("このPCの生データを含む", [g for g in games if g in LOCAL]),
              ("手作りの定義だけ", [g for g in games if g not in LOCAL])]
    print(f"ゲーム {len(games)} 本")
    for name, ids in groups:
        if not ids:
            continue
        pooled, macro = [], []
        for k, label in KEYS:
            n = sum(games[g].get(k + "_n", 0) for g in ids)
            v = sum(games[g].get(k, 0) for g in ids)
            per = [games[g][k] / games[g][k + "_n"] for g in ids if games[g].get(k + "_n")]
            pooled.append(f"{label} {v / n:.3f}" if n else f"{label} -")
            macro.append(f"{label} {sum(per) / len(per):.3f}" if per else f"{label} -")
        print(f"[{name}] {len(ids)} 本")
        print("  合計    : " + " / ".join(pooled))
        print("  1本平均 : " + " / ".join(macro))


if __name__ == "__main__":
    main()
