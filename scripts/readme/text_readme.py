"""画像が表示されないとき用の、文字だけのREADME（README-text.md）を README.md から作る。

README.md の文章はそのまま使い、画像（<picture>）だけを、同じ内容の見出し・表・箇条書きに置き換える。
図の中身は showcase.py・build_art.py と同じデータから書くので、図と文字の内容がずれない。
README.md 自体は読むだけで変えない。

    python scripts/readme/text_readme.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402
import showcase as sc  # noqa: E402

ROOT = art.ROOT
SRC = ROOT / "README.md"
OUT = ROOT / "README-text.md"
VIDEO = "https://youtu.be/FlAFLxX7QEQ"


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + "|".join("---" for _ in head) + "|"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


def awards():
    out = ["### 受賞結果（JPHACKS 2026）", ""]
    for title, sub, items in art.AWARDS:
        out.append(f"- **{title}**{'（' + sub + '）' if sub else ''}：" + "、".join(n + (f"（{note}）" if note else "") for _, n, note in items))
    return "\n".join(out)


def flow():
    return "\n".join([
        "遊ぶまでの4ステップ：",
        "",
        "1. **スマホでQR参加：** ブラウザで読み取るだけ。P1のスマホはPCのリモコンになる",
        "2. **ゲームを選ぶ：** インストール済みから選択。操作とキーを自動で読み取る",
        "3. **AIが操作を分担：** 独自AIが2〜4人へ配分。担当を確かめて起動",
        "4. **開始ボタンでプレイ：** ホストが「分担操作開始」。各スマホが担当の操作画面になる"])


def controllers():
    rows = [[f"**{p}**（{role}{'・' + sub if sub else ''}）", ops, ui] for _, p, role, sub, _, ops, ui in sc.ROLES]
    return "例：3人で『Minecraft』を遊ぶ場合\n\n" + table(["プレイヤー", "担当する操作", "スマホに表示されるコントローラー"], rows)


def features():
    return "\n".join(f"{k + 1}. **{title.replace(chr(10), '')}：** {body}" for k, (_, _, title, body) in enumerate(sc.FEATURES))


def genres():
    rows = [[f"**{name}**" + (f"<br>{ex}" if ex else ""), "／".join(split), exp] for _, _, name, ex, split, exp in sc.GENRES]
    return table(["ジャンル", "分担の例", "生まれる体験"], rows)


def stats():
    rows = [[q.replace("\n", ""), f"**{label}**（{sub}）"] for _, label, q, sub in sc.STATS]
    return table(["質問", "結果"], rows)


def roadmap():
    return table(["段階", "目指すこと"], [[f"**{jp}**", f"**{title.replace(chr(10), '')}。** {body}"] for _, jp, title, body in sc.ROADMAP])


def focus():
    return ""  # 3つのこだわりは、すぐ後の小見出しと文章に同じ内容がある


def architecture():
    return "\n".join([
        "- **スマホ（ブラウザ）2〜4台：** P1 移動・P2 視点・P3 アクション",
        "- **スマホ → PC：** 操作を WebSocket と WebRTC で Rustホストへ送る",
        "- **PC → スマホ：** Rustホストが役割と準備状況を返す",
        "- **Rustホスト（役割・入力の統合） ⇄ PCアプリ（Tauri）：** 参加・準備状況を表示し、ゲーム選択・開始・停止を受け取る",
        "- **Rustホスト → Windows API（SendInput）：** 統合した入力を渡す",
        "- **Windows API → 既存のPCゲーム（Minecraftなど）：** キーボード・マウス操作として入力する"])


def techstack():
    out = []
    for _, _, title, sub, items in sc.TECH:
        out += [f"**{title}**：{sub}", "", table(["技術", "役割"], [[n, d] for n, d in items]), ""]
    return "\n".join(out).rstrip()


def pipeline():
    return "\n".join([
        "分担AIの流れ：",
        "",
        "1. **ゲームのファイルから自動検出：** MoveForward:W、Jump:Space、Look:Mouse、Fire:MouseL などの操作を19系統で読み取る",
        "2. **分担AIが意味と関係を推論：** 多言語エンコーダ MiniLM と独自の2層Transformerで、カテゴリ・同じ人が持つ確率・方向軸を推論",
        "3. **スマホ画面へ自動で配分：** P1に移動（WASD＋Space）、P2に視点（Mouse）、P3にアクション（左右クリック・Rキー・ホイール）"])


def evaluation():
    rows = [[f"{title}（{sub}）"] + [f"{v:.1f}%" for v in vals] for title, sub, vals in sc.EVAL_SETS]
    return table(["評価に使ったゲーム"] + sc.EVAL_METRICS, rows)


def message():
    head, body = sc.MESSAGE
    return f"> **{head.replace(chr(10), '')}**\n> {body}"


FIGS = {"flow": flow, "controllers": controllers, "features": features, "genres": genres, "stats": stats, "roadmap": roadmap,
        "focus": focus, "architecture": architecture, "techstack": techstack, "pipeline": pipeline, "evaluation": evaluation,
        "message": message, "awards": awards}


def convert(s):
    pic = r"<picture>.*?</picture>"
    alt_of = lambda block: re.search(r'alt="([^"]*)"', block).group(1)  # noqa: E731

    # 作品名
    s = re.sub(r"<h1>" + pic + r"</h1>",
               "# Re:Cooplay（リコープレイ）\n\n**ゲームはそのまま。1キャラを、みんなで操作。**\n\n"
               "<sub>※JPHACKS 2026 Award Dayでの内容です</sub>", s, count=1, flags=re.S)
    # 紹介動画（サムネイルと誘導の2行）
    s = re.sub(r'<a href="https://youtu\.be/[^"]+"><img [^>]*></a>\n<a href="https://youtu\.be/[^"]+">' + pic + r"</a>",
               f"▶ **[プロダクト紹介動画を見る（YouTube）]({VIDEO})**", s, count=1, flags=re.S)
    # 目次（見出しの画像と、2列の画像のリンク）
    toc_items = re.findall(r'<a href="(#[^"]+)">' + r"<picture>.*?alt=\"([^\"]*)\".*?</picture></a>", s, flags=re.S)
    part = {"#製品概要": "製品概要", "#開発技術": "開発技術"}
    lines = ["### 目次", ""]
    items = [(h, a) for h, a in toc_items]
    first = [(h, a) for h, a in items if h not in part and a[:2] <= "07"]
    second = [(h, a) for h, a in items if h not in part and a[:2] >= "08"]
    lines.append("- [PART 1 製品概要](#製品概要)")
    lines += [f"  - [{a}]({h})" for h, a in first]
    lines.append("- [PART 2 開発技術](#開発技術)")
    lines += [f"  - [{a}]({h})" for h, a in second]
    s = re.sub(r"<picture>(?:(?!</picture>).)*toc-title-light.*?</picture>\n\n<p>.*?</p>", "\n".join(lines), s, count=1, flags=re.S)
    # 大見出しと項目の見出し（アンカーはそのまま残す）
    s = re.sub(r'(#{2,3} <a id="[^"]+"></a>)(' + pic + ")",
               lambda m: m.group(1) + re.sub(r"[（(].*", "", alt_of(m.group(2))) if "part-" in m.group(2)
               else m.group(1) + head_text(m.group(2), alt_of(m.group(2))), s, flags=re.S)
    # 図
    def fig(m):
        block = m.group(0)
        name = re.search(r'src="assets/readme/([a-z-]+?)-light\.(?:svg|webp)"', block).group(1)
        if name == "footer":
            return "---\n\n**さあ、みんなで遊ぼう！** PCのゲームはそのままに、友達と集まったその場で協力プレイ。\n\n<sub>COMING SOON：一般公開に向けて準備中です。</sub>"
        if name not in FIGS:
            raise SystemExit(f"文字に置き換える方法がない画像：{name}")
        return FIGS[name]()
    s = re.sub(pic, fig, s, flags=re.S)
    s = re.sub(r"\n<br>\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s


def head_text(block, alt):
    num = re.search(r"play-(\d\d)-light", block).group(1)
    return f"{num} {alt}"


def main():
    body = convert(SRC.read_text(encoding="utf-8"))
    intro = ("<!-- このファイルは scripts/readme/text_readme.py で README.md から生成する。直接編集しない。 -->\n\n"
             "> [!NOTE]\n> 画像を使わず、文字だけで読める版のREADMEです。図・表・アニメーション入りの通常版は [README.md](README.md) です。\n\n")
    if "<img" in body or "<picture" in body:
        raise SystemExit("画像が残っている")
    OUT.write_text(intro + body.lstrip(), encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
