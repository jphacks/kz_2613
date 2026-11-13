"""プリセット用の小さな BERT 風エンコーダを、実在のゲームの操作データで学習し、Rust ホストが読む重みを書き出す。

使い方 (リポジトリのルートで):
    python scripts/preset-model/build_dataset.py   # このPCのゲームから data/real-games.json を作る (ローカルの情報だけ)
    python scripts/preset-model/train.py           # 学習・評価・書き出し
    python scripts/preset-model/train.py --cv      # 1 ゲームずつ外して学習し、外したゲームで評価する (書き出さない)
    python scripts/preset-model/train.py --cv --synthetic 12000   # 比較: 合成のゲームも混ぜたとき

学習データ (実在のゲームだけ):
    data/real-games.json   このPCで読んだゲームの操作 (名前・キー)
    apps/game-profiles/    手作りの定義 (verification.status が template 以外。tModLoader は Terraria と同じなので除く)
    data/labels.json       注釈 (概念)。定義のラベルは lexicon.py の辞書でも引く
BERT と同じく、操作の名前やキーを伏せて周りから当てる自己教師ありの課題 (キーの予測) を、カテゴリ・まとまりの課題と一緒に学ぶ。

必要なもの: Python 3.10 以上, torch (CPU 版で足りる), numpy。乱数の種は固定している (CPU のスレッド数などで重みがわずかに変わることはある)。
出力:
    apps/host-rs/assets/preset-model.bin          重み (Rust の src/preset_model.rs が読む)
    apps/host-rs/assets/preset-model-parity.json  Rust の推論が Python と一致するかの試験データ
特徴量の作り方 (featurize) は src/preset_model.rs と完全に同じでなければならない。変えるときは両方を直す。
"""

import argparse
import glob
import json
import math
import os
import random
import re
import struct
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lexicon import COARSE, CONCEPTS, FINE, GENRES, REAL_LABELS, sub_of  # noqa: E402

SUBS = sorted({sub_of(c) for c in CONCEPTS})

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "apps", "host-rs", "assets")
NB = 2048          # 文字 n-gram のハッシュの数
D = 32             # 隠れ層の次元 (実在のデータは少ないので小さくする)
HEADS = 4
LAYERS = 2
FFN = 64
PAIR = 16          # 「同じ人が持つか」の射影の次元
DROPOUT = 0.0      # 学習時だけ。推論 (Rust) には影響しない
DEV = torch.device("cpu")  # --device で GPU を使う
TEXT = None        # --text-encoder: 事前学習済みの BERT 系モデルで操作名を読む (比較実験用。Rust では未対応)


class TextEncoder:
    """事前学習済みの BERT 系モデル (Hugging Face) で、操作の名前の文字列を固定のベクトルにする。重みは学習しない。
    同じ文字列は一度だけ計算し、表 (matrix) の行番号で引く"""

    def __init__(self, name, device, vocab=None, int8=False):
        from transformers import AutoModel, AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(name)
        self.model = AutoModel.from_pretrained(name).eval()
        # 配布の大きさを測る比較 (--text-vocab・--text-int8)。語彙の外のトークンは <unk> にし、
        # 重みは行ごと (出力ごと) に8ビットへ丸めてから戻す (保存を8ビットにしたのと同じ値で計算する)
        self.keep = None
        self.name, self.int8, self.kept = name, int8, None
        if vocab:
            keep = set(json.load(open(vocab, encoding="utf-8"))) | set(self.tok.all_special_ids)
            self.keep = torch.zeros(len(self.tok), dtype=torch.bool)
            self.keep[sorted(keep)] = True
            self.kept = sorted(keep)
        if int8:
            with torch.no_grad():
                for p in self.model.parameters():
                    if p.dim() == 2:
                        scale = p.abs().amax(dim=1, keepdim=True).clamp(min=1e-8) / 127
                        p.copy_((p / scale).round().clamp(-127, 127) * scale)
        self.model = self.model.to(device)
        self.device = device
        self.dim = self.model.config.hidden_size
        self.index = {"": 0}
        self.rows = [torch.zeros(self.dim)]
        self.matrix = None

    @staticmethod
    def text_of(action):
        # ラベル・ID・設定名をつなぐ。区切りや大文字小文字の切れ目は空白にして、単語として読ませる
        parts = []
        for k in ("label", "id", "bind"):
            v = action.get(k)
            if v:
                parts.append(" ".join(w for _, w in words(v)) or v)
        return " | ".join(parts)

    def ids(self, texts):
        new = [t for t in dict.fromkeys(texts) if t not in self.index]
        for i in range(0, len(new), 512):
            chunk = new[i:i + 512]
            with torch.no_grad():
                b = self.tok(chunk, padding=True, truncation=True, max_length=48, return_tensors="pt")
                if self.keep is not None:
                    b["input_ids"] = torch.where(self.keep[b["input_ids"]], b["input_ids"], torch.full_like(b["input_ids"], self.tok.unk_token_id))
                b = b.to(self.device)
                h = self.model(**b).last_hidden_state
                m = b["attention_mask"].unsqueeze(-1).float()
                v = (h * m).sum(1) / m.sum(1).clamp(min=1)  # 平均プーリング
            for t, row in zip(chunk, v.float().cpu()):
                self.index[t] = len(self.rows)
                self.rows.append(row)
        if new or self.matrix is None:
            self.matrix = torch.stack(self.rows).to(DEV)
        return [self.index[t] for t in texts]
MAX_LEN = 160      # Core Keeper は操作が 136 件
FMAX = 96          # 1 つの操作の特徴の上限 (添字の小さい順に残す)
TYPES = ["button", "axis2d", "mouseDelta", "wheel", "text"]
JA_SEP = set("・（）、。　「」()/")


# ---------------------------------------------------------------- 特徴量 (Rust と同一)

def key_list():
    """controls.rs の OUTPUTS の ID を順に読む (キーの埋め込みの添字)。0 番は「なし・不明」"""
    src = open(os.path.join(ROOT, "apps", "host-rs", "src", "controls.rs"), encoding="utf-8").read()
    import re
    body = src[src.index("pub static OUTPUTS"):src.index("pub fn output(")]
    ids = re.findall(r'(?:key\(|id:\s*)"([A-Z0-9_]+)"', body)
    return ["<none>"] + ids


def words(s):
    """文字列を (種類, 文字列) の語に分ける。種類は 'a' (英数字) か 'j' (それ以外の文字の連なり)"""
    out, cur, kind, prev = [], [], None, ""
    def flush():
        nonlocal cur, kind
        if cur:
            out.append((kind, "".join(cur)))
        cur, kind = [], None
    for ch in s:
        if ch.isascii():
            if ch.isalnum():
                if kind == "a" and cur and ((prev.islower() and ch.isupper()) or (prev.isalpha() != ch.isalpha())):
                    flush()
                if kind != "a":
                    flush()
                    kind = "a"
                cur.append(ch.lower())
            else:
                flush()
        elif ch in JA_SEP or ch.isspace():
            flush()
        else:
            if kind != "j":
                flush()
                kind = "j"
            cur.append(ch)
        prev = ch
    flush()
    return out


def features(texts):
    """ラベル・ID・設定名の文字列から特徴の集合を作る"""
    fs = set()
    for t in texts:
        if not t:
            continue
        for kind, w in words(t):
            if kind == "a":
                fs.add("w:" + w)
                b = "<" + w + ">"
                for i in range(len(b) - 2):
                    fs.add("t:" + b[i:i + 3])
            else:
                if len(w) <= 8:
                    fs.add("w:" + w)
                for c in w:
                    fs.add("c:" + c)
                for i in range(len(w) - 1):
                    fs.add("b:" + w[i:i + 2])
    return sorted(fs)


def fnv1a(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def featurize(action, keys):
    """1 つの操作 → (ハッシュの添字の列, キーの添字, 種類の添字)"""
    fs = features([action.get("label"), action.get("id"), action.get("bind")])
    hashed = sorted({fnv1a(f) % NB for f in fs})[:FMAX]
    key = action.get("default")
    k = keys.index(key) if key in keys else 0
    t = TYPES.index(action["type"]) if action.get("type") in TYPES else 0
    return hashed, k, t


# ---------------------------------------------------------------- データ

def split_forms(forms):
    """学習用と評価用 (一度も見せない言い回し) に分ける"""
    if len(forms) >= 3:
        return forms[:-1], forms[-1:]
    return forms, []


def camel(words_):
    return "".join(w[:1].upper() + w[1:] for w in words_)


def make_id(en, rng):
    ws = en.lower().split()
    style = rng.random()
    if style < .5:
        return "_".join(ws)
    if style < .8:
        return ws[0] + camel(ws[1:])
    return camel(ws)


def make_bind(en, rng):
    ws = en.lower().split()
    style = rng.randrange(6)
    if style == 0:
        return "key." + ws[0] + camel(ws[1:])
    if style == 1:
        return "IA_" + camel(ws)
    if style == 2:
        return "+" + "".join(ws)
    if style == 3:
        return camel(ws)
    if style == 4:
        return "Input" + camel(ws)
    return " ".join(w.capitalize() for w in ws)


def synth_game(rng, keys, held_out):
    genre = rng.choice(list(GENRES))
    must, opt = GENRES[genre]
    cs = list(must) + [c for c, p in opt if rng.random() < p]
    # 定義の順は移動から始まることが多いが、崩れた順にも慣れさせる
    if rng.random() < 0.3:
        rng.shuffle(cs)
    actions, labels = [], []
    used_ids = set()
    for c in cs:
        coarse, fine, typ, ks, ja, en = CONCEPTS[c]
        ja_tr, ja_te = split_forms(ja)
        en_tr, en_te = split_forms(en)
        ja_pool = ja_te if (held_out and ja_te) else ja_tr
        en_pool = en_te if (held_out and en_te) else en_tr
        e = rng.choice(en_pool)
        r = rng.random()
        if r < 0.75:
            label = rng.choice(ja_pool)
        elif r < 0.9:
            label = " ".join(w.capitalize() for w in e.split())
        else:
            label = None
        aid = make_id(rng.choice(en_pool), rng)
        while aid in used_ids:
            aid += "_2"
        used_ids.add(aid)
        a = {"id": aid, "label": label or aid, "type": typ}
        if rng.random() < 0.45:
            a["bind"] = make_bind(rng.choice(en_pool), rng)
        if typ == "button":
            a["default"] = rng.choice(ks) if rng.random() < 0.85 else rng.choice(keys[1:])
        actions.append(a)
        labels.append((COARSE.index(coarse), FINE.index(fine), SUBS.index(sub_of(c))))
    return {"name": f"synthetic-{genre}", "actions": actions, "labels": labels}


GROUP_COARSE = {"movement": "move", "steering": "move", "throttle": "action", "look": "look", "gameplay": "action",
                "inventory": "item", "menu": "menu", "communication": "social"}


def concept_of(label):
    if label in REAL_LABELS:
        return REAL_LABELS[label]
    for c, (_, _, _, _, ja, _) in CONCEPTS.items():
        if label in ja:
            return c
    return None


def label_of(c):
    return COARSE.index(CONCEPTS[c][0]), FINE.index(CONCEPTS[c][1]), SUBS.index(sub_of(c))


def real_dataset():
    """実在のゲームの操作と注釈。game はゲームの ID (このPCのデータと手作りの定義で同じゲームは同じ ID)"""
    here = os.path.dirname(os.path.abspath(__file__))
    notes = json.load(open(os.path.join(here, "data", "labels.json"), encoding="utf-8"))
    lookup = {}
    for src, by_concept in notes.items():
        if src == "note":
            continue
        for c, ids in by_concept.items():
            if c not in CONCEPTS:
                raise SystemExit(f"labels.json: 未知の概念 {c} ({src})")
            for i in ids:
                lookup[(src, i)] = c
    games = []
    for g in json.load(open(os.path.join(here, "data", "real-games.json"), encoding="utf-8"))["games"]:
        src = "local:" + g["game"]
        missing = [a["id"] for a in g["actions"] if (src, a["id"]) not in lookup]
        if missing:
            raise SystemExit(f"labels.json: {src} に注釈のない操作 {missing}")
        labels = [label_of(lookup[(src, a["id"])]) for a in g["actions"]]
        plain = [{k: v for k, v in a.items() if k != "label_ja"} for a in g["actions"]]
        games.append({"game": g["game"], "name": g["name"] + " (このPC)", "actions": plain, "labels": labels})
        # ゲームの翻訳ファイルに日本語名があれば、日本語名の版も加える (Source の *_japanese.txt など)
        if any(a.get("label_ja") for a in g["actions"]):
            ja = [dict(p, label=a["label_ja"]) if a.get("label_ja") else p for p, a in zip(plain, g["actions"])]
            games.append({"game": g["game"], "name": g["name"] + " (このPC・日本語)", "actions": ja, "labels": labels})
    for f in sorted(glob.glob(os.path.join(ROOT, "apps", "game-profiles", "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        if d["verification"]["status"] == "template" or d["id"] == "steam-1281930":
            continue
        src = "profile:" + d["id"]
        concepts = [lookup.get((src, a["id"])) or concept_of(a["label"]) for a in d["actions"]]
        missing = [a["id"] for a, c in zip(d["actions"], concepts) if not c]
        if missing:
            raise SystemExit(f"labels.json: {src} に注釈のない操作 {missing}")
        games.append({"game": d["id"], "name": d["name"] + " (定義)", "actions": d["actions"], "labels": [label_of(c) for c in concepts]})
    return games


def claude_games():
    """data/claude-games.txt: Claude Code が知識から書いた実在のゲームの初期キー設定 (ネット・ゲームのファイルは使っていない)。
    日本語名のあるゲームは、英語名の版と日本語名の版の 2 件にする"""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "claude-games.txt")
    games, cur = [], None
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line.startswith("## "):
            cur = {"name": line[3:].split("|")[0].strip(), "items": []}
            games.append(cur)
            continue
        if not line or line.startswith("#"):
            continue
        for item in line.split(";"):
            item = item.strip()
            if not item:
                continue
            m = re.match(r"^(.+?)=\s*([A-Z0-9_\-]+)\s*>\s*([a-z0-9_]+)$", item)
            if not m:
                raise SystemExit(f"claude-games.txt: 読めない行 {item!r} ({cur['name']})")
            name, key, concept = m.groups()
            if concept not in CONCEPTS:
                raise SystemExit(f"claude-games.txt: 未知の概念 {concept} ({cur['name']})")
            en, _, ja = name.partition("/")
            cur["items"].append((en.strip(), ja.strip() or None, None if key == "-" else key, concept))
    out = []
    for g in games:
        gid = "claude:" + re.sub(r"[^a-z0-9]+", "-", g["name"].lower()).strip("-")
        used = set()
        actions, labels = [], []
        for en, ja, key, c in g["items"]:
            aid = re.sub(r"[^a-z0-9]+", "_", en.lower()).strip("_") or "action"
            while aid in used:
                aid += "_2"
            used.add(aid)
            typ = "button" if key else CONCEPTS[c][2]
            a = {"id": aid, "label": en, "type": typ}
            if key:
                a["default"] = key
            actions.append((a, ja))
            labels.append(label_of(c))
        out.append({"game": gid, "name": g["name"] + " (Claude)", "actions": [a for a, _ in actions], "labels": labels})
        if any(ja for _, ja in actions):
            out.append({"game": gid, "name": g["name"] + " (Claude・日本語)", "labels": labels,
                        "actions": [dict(a, label=ja) if ja else a for a, ja in actions]})
    return out


def github_games():
    """data/local/preset-model/github-games.json (github_dataset.py が作る。Git の対象外)。
    labels.json の「github:ゲーム」に注釈があれば (注釈付き, …)、なければ注釈なし (キーの予測だけに使う)"""
    path = os.path.join(ROOT, "data", "local", "preset-model", "github-games.json")
    if not os.path.exists(path):
        return [], []
    notes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "labels.json"), encoding="utf-8"))
    labeled, unlabeled = [], []
    for g in json.load(open(path, encoding="utf-8"))["games"]:
        by = notes.get("github:" + g["game"])
        if by:
            lookup = {i: c for c, ids in by.items() for i in ids}
            missing = [a["id"] for a in g["actions"] if a["id"] not in lookup]
            if missing:
                raise SystemExit(f"labels.json: github:{g['game']} に注釈のない操作 {missing[:5]}")
            labeled.append({"game": g["game"], "name": g["name"], "actions": g["actions"],
                            "labels": [label_of(lookup[a["id"]]) for a in g["actions"]]})
        else:
            unlabeled.append({"game": g["game"], "name": g["name"], "actions": g["actions"], "labels": [(-1, -1, -1)] * len(g["actions"])})
    return labeled, unlabeled


def template_games():
    """ジャンルの型から作った定義 (学習には使わず、実際に推論する対象への当てはまりを見る)。
    ラベルが辞書にあれば概念から、なければ定義のグループから粗いカテゴリだけ"""
    games = []
    for f in sorted(glob.glob(os.path.join(ROOT, "apps", "game-profiles", "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        if d["verification"]["status"] != "template" or any(g["id"] == "pointer" for g in d["groups"]):
            continue
        labels = []
        for a in d["actions"]:
            c = concept_of(a["label"])
            labels.append(label_of(c) if c else (COARSE.index(GROUP_COARSE.get(a["group"], "action")), -1, -1))
        games.append({"game": d["id"], "name": d["name"], "actions": d["actions"], "labels": labels})
    return games


WASD_ARROWS = {"KEY_W": "ARROW_UP", "KEY_S": "ARROW_DOWN", "KEY_A": "ARROW_LEFT", "KEY_D": "ARROW_RIGHT"}
STYLE_AUG = False   # --style-aug で有効 (ID の書き方を、ゲームのファイルにある名前の書き方に変える)
MAPS = ["Player", "GameControls", "Gameplay", "Character", "Actions", "Input"]


def restyle(aid, style, prefix):
    """ID の書き方を変える: move_forward → MoveForward / moveForward / GameControls/MoveForward / IA_MoveForward / MOVE_FORWARD"""
    ws = [w for kind, w in words(aid) if kind == "a"]
    if not ws:
        return aid
    camel = "".join(w[:1].upper() + w[1:] for w in ws)
    if style == 0:
        return camel
    if style == 1:
        return ws[0] + camel[len(ws[0]):]
    if style == 2:
        return prefix + "/" + camel
    if style == 3:
        return "IA_" + camel
    if style == 4:
        return "_".join(w.upper() for w in ws)
    return "_".join(ws)


def augment(g, rng):
    """少ない実データを水増しする: 操作の一部を落とし、ラベル・設定名・キーを時々消す"""
    keep = [i for i in range(len(g["actions"])) if rng.random() > rng.uniform(0.0, 0.4)] or [0]
    rng.shuffle(keep)
    keep = keep[:MAX_LEN]
    actions, labels = [], []
    # キーの置き換え: WASD と矢印キーは同じ意味でよく使われる (実データには矢印キーがない)
    arrows = rng.random() < 0.3
    # 名前の書き方: 1 本の中では同じ書き方にそろえる (ゲームごとに命名規則が決まっているため)
    styled = STYLE_AUG and rng.random() < 0.5
    prefix, style = rng.choice(MAPS), rng.randrange(6)
    for i in keep:
        a = dict(g["actions"][i])
        if arrows and a.get("default") in WASD_ARROWS:
            a["default"] = WASD_ARROWS[a["default"]]
        if styled:
            a["id"] = restyle(a["id"], style, prefix)
        r = rng.random()
        if r < 0.2:
            a["label"] = a["id"]        # 日本語名のない抽出データに似せる
        elif r < 0.3:
            a["id"] = a.get("label") or a["id"]
        if rng.random() < 0.3:
            a.pop("bind", None)
        if rng.random() < 0.15:
            a.pop("default", None)
        actions.append(a)
        labels.append(g["labels"][i])
    return {"game": g["game"], "name": g["name"], "actions": actions, "labels": labels}


def encode(games, keys):
    n = len(games)
    feats = np.full((n, MAX_LEN, FMAX), NB, dtype=np.int16)  # NB = 埋めるための添字 (容量を抑えるため int16)
    key = np.zeros((n, MAX_LEN), dtype=np.int64)
    typ = np.zeros((n, MAX_LEN), dtype=np.int64)
    mask = np.zeros((n, MAX_LEN), dtype=bool)
    coarse = np.full((n, MAX_LEN), -1, dtype=np.int64)
    fine = np.full((n, MAX_LEN), -1, dtype=np.int64)
    sub = np.full((n, MAX_LEN), -1, dtype=np.int64)
    tid = np.zeros((n, MAX_LEN), dtype=np.int64)
    if TEXT is not None:
        flat = [TextEncoder.text_of(a) for g in games for a in g["actions"][:MAX_LEN]]
        ids = iter(TEXT.ids(flat))
        for i, g in enumerate(games):
            for j in range(len(g["actions"][:MAX_LEN])):
                tid[i, j] = next(ids)
    for i, g in enumerate(games):
        for j, (a, (c, f, s)) in enumerate(zip(g["actions"][:MAX_LEN], g["labels"][:MAX_LEN])):
            h, k, t = featurize(a, keys)
            feats[i, j, :len(h)] = h
            key[i, j], typ[i, j], mask[i, j], coarse[i, j], fine[i, j], sub[i, j] = k, t, True, c, f, s
    return {k: torch.from_numpy(v) for k, v in
            dict(feats=feats, key=key, typ=typ, mask=mask, coarse=coarse, fine=fine, sub=sub, tid=tid).items()}


# ---------------------------------------------------------------- モデル

class Layer(nn.Module):
    """BERT と同じ post-LN の層 (自己注意 → 残差 → LN → FFN(GELU tanh 近似) → 残差 → LN)"""

    def __init__(self):
        super().__init__()
        self.drop = nn.Dropout(DROPOUT)
        self.qkv = nn.Linear(D, 3 * D)
        self.out = nn.Linear(D, D)
        self.ln1 = nn.LayerNorm(D)
        self.ff1 = nn.Linear(D, FFN)
        self.ff2 = nn.Linear(FFN, D)
        self.ln2 = nn.LayerNorm(D)

    def forward(self, x, mask):
        b, n, _ = x.shape
        q, k, v = self.qkv(x).view(b, n, 3, HEADS, D // HEADS).permute(2, 0, 3, 1, 4)
        att = (q @ k.transpose(-1, -2)) / math.sqrt(D // HEADS)
        att = att.masked_fill(~mask[:, None, None, :], -1e9).softmax(-1)
        y = (att @ v).transpose(1, 2).reshape(b, n, D)
        x = self.ln1(x + self.drop(self.out(y)))
        return self.ln2(x + self.drop(self.ff2(F.gelu(self.ff1(x), approximate="tanh"))))


class PresetBert(nn.Module):
    def __init__(self, n_keys):
        super().__init__()
        self.text = nn.Embedding(NB + 1, D, padding_idx=NB)  # 文字 n-gram の埋め込み (平均) = EmbeddingBag
        # 事前学習済みの BERT 系モデルのベクトルを D 次元へ写す (--text-encoder のとき、n-gram の代わりに使う)
        self.text_proj = nn.Sequential(nn.Linear(TEXT.dim, D), nn.GELU(), nn.Linear(D, D)) if TEXT is not None else None
        self.key = nn.Embedding(n_keys, D)
        self.typ = nn.Embedding(len(TYPES), D)
        self.mask_vec = nn.Parameter(torch.zeros(D))  # 学習時だけ: 名前を伏せた操作 ([MASK])
        self.ln0 = nn.LayerNorm(D)
        self.layers = nn.ModuleList(Layer() for _ in range(LAYERS))
        self.cat = nn.Linear(D, len(COARSE))
        self.pair = nn.Linear(D, PAIR, bias=False)
        self.pair_bias = nn.Parameter(torch.zeros(1))
        # まとまりの中で「同じ側か」(縦横の軸など)。まとまりを分けるときの境目に使う
        self.axis = nn.Linear(D, PAIR, bias=False)
        self.axis_bias = nn.Parameter(torch.zeros(1))
        # 自己教師ありの課題: 伏せたキーを当てる (学習時だけ。書き出さない)
        self.key_head = nn.Linear(D, n_keys)

    def forward(self, feats, key, typ, mask, text_mask=None, tid=None):
        if self.text_proj is not None:
            t = self.text_proj(TEXT.matrix[tid])
        else:
            cnt = (feats < NB).sum(-1, keepdim=True).clamp(min=1)
            t = self.text(feats.long()).sum(-2) / cnt
        if text_mask is not None:
            t = torch.where(text_mask[..., None], self.mask_vec.expand_as(t), t)
        x = self.ln0(t + self.key(key) + self.typ(typ))
        for layer in self.layers:
            x = layer(x, mask)
        p = self.pair(x)
        aff = (p @ p.transpose(-1, -2)) / math.sqrt(PAIR) + self.pair_bias
        q = self.axis(x)
        axis = (q @ q.transpose(-1, -2)) / math.sqrt(PAIR) + self.axis_bias
        return self.cat(x), aff, axis, self.key_head(x)


def losses(model, batch, train):
    mask = batch["mask"]
    tm = (torch.rand(mask.shape, device=mask.device) < 0.15) & mask if train else None
    key = batch["key"]
    km = (torch.rand(mask.shape, device=mask.device) < 0.15) & mask & (key > 0) if train else torch.zeros_like(mask)
    cat, aff, axis, kl = model(batch["feats"], torch.where(km, torch.zeros_like(key), key), batch["typ"], mask, tm, batch["tid"])
    lk = F.cross_entropy(kl[km], key[km]) if km.any() else torch.zeros(())
    # カテゴリは注釈のある操作だけで学ぶ (注釈のない GitHub のデータはキーの予測だけに使う)
    cm = mask & (batch["coarse"] >= 0)
    lc = F.cross_entropy(cat[cm], batch["coarse"][cm]) if cm.any() else torch.zeros(())
    fine = batch["fine"]
    valid = (fine >= 0) & mask
    pm = valid[:, :, None] & valid[:, None, :]
    eye = torch.eye(mask.shape[1], dtype=bool, device=mask.device)[None]
    pm = pm & ~eye
    target = (fine[:, :, None] == fine[:, None, :]).float()
    lp = F.binary_cross_entropy_with_logits(aff[pm], target[pm]) if pm.any() else torch.zeros(())
    # 軸: 同じまとまりの中の組だけで学ぶ
    sub = batch["sub"]
    am = pm & (target == 1) & (sub[:, :, None] >= 0) & (sub[:, None, :] >= 0)
    at = (sub[:, :, None] == sub[:, None, :]).float()
    la = F.binary_cross_entropy_with_logits(axis[am], at[am]) if am.any() else torch.zeros(())
    return lc + lp + 0.5 * la + 0.5 * lk, cat, aff, pm, target


@torch.no_grad()
def counts(model, data):
    """評価の数え上げ (交差検証で足し合わせる)。キーは全部伏せて、名前と周りから当てる"""
    model.eval()
    data = {k: v.to(DEV) for k, v in data.items()}
    _, cat, aff, pm, target = losses(model, data, False)
    mask = data["mask"]
    pred = aff > 0
    pos = pm & (target == 1)
    _, _, axis, _ = model(data["feats"], data["key"], data["typ"], mask, tid=data["tid"])
    am = pos & (data["sub"][:, :, None] >= 0) & (data["sub"][:, None, :] >= 0)
    at = data["sub"][:, :, None] == data["sub"][:, None, :]
    key = data["key"]
    _, _, _, kl = model(data["feats"], torch.zeros_like(key), data["typ"], mask, tid=data["tid"])
    known = mask & (key > 0)
    # 振り分けに使う操作 (移動・視点・行動・持ち物) どうしの組だけ。メニュー・会話は P1 のリモコンのままで配らない
    play = (data["coarse"] >= 0) & (data["coarse"] <= COARSE.index("item"))
    pp = pm & play[:, :, None] & play[:, None, :]
    ppos = pp & (target == 1)
    pam = am & play[:, :, None] & play[:, None, :]
    return {
        "play_pair": ((pred == (target == 1)) & pp).sum().item(), "play_pair_n": pp.sum().item(),
        "play_recall": (pred & ppos).sum().item(), "play_recall_n": ppos.sum().item(),
        "play_axis": (((axis > 0) == at) & pam).sum().item(), "play_axis_n": pam.sum().item(),
        "cat": ((cat.argmax(-1) == data["coarse"]) & mask & (data["coarse"] >= 0)).sum().item(),
        "cat_n": (mask & (data["coarse"] >= 0)).sum().item(),
        "pair": ((pred == (target == 1)) & pm).sum().item(), "pair_n": pm.sum().item(),
        "recall": (pred & pos).sum().item(), "recall_n": pos.sum().item(),
        "axis": (((axis > 0) == at) & am).sum().item(), "axis_n": am.sum().item(),
        "key": ((kl.argmax(-1) == key) & known).sum().item(), "key_n": known.sum().item(),
    }


@torch.no_grad()
def dump_preds(model, g, keys):
    """誤りの分析用: 操作ごとのカテゴリの予測と正解 (PRED 行)"""
    model.eval()
    data = {k: v.to(DEV) for k, v in encode([g], keys).items()}
    cat, _, _, _ = model(data["feats"], data["key"], data["typ"], data["mask"], tid=data["tid"])
    pred = cat[0].argmax(-1).tolist()
    for i, (a, lab) in enumerate(zip(g["actions"], g["labels"])):
        if lab[0] >= 0:
            print("PRED " + json.dumps({"game": g["game"], "id": a["id"], "label": a.get("label"), "default": a.get("default"),
                                        "pred": COARSE[pred[i]], "gold": COARSE[lab[0]]}, ensure_ascii=False), flush=True)


def report(c, name):
    r = lambda k: c[k] / c[k + "_n"] if c[k + "_n"] else float("nan")
    print(f"  {name}: カテゴリ {r('cat'):.3f} / 同じ人の判定 {r('pair'):.3f}・同じまとまりの再現率 {r('recall'):.3f}"
          f" / まとまり内の軸 {r('axis'):.3f} / 伏せたキーの予測 {r('key'):.3f} (操作 {c['cat_n']}件)")
    print(f"    遊びの操作どうしだけ: 同じ人の判定 {r('play_pair'):.3f}・同じまとまりの再現率 {r('play_recall'):.3f}"
          f" / まとまり内の軸 {r('play_axis'):.3f}")


def evaluate(model, data, name):
    c = counts(model, data)
    report(c, name)
    return c


# ---------------------------------------------------------------- 書き出し

def export(model, keys):
    sd = {k: v.detach().cpu().float().contiguous() for k, v in model.state_dict().items()
          if k != "mask_vec" and not k.startswith("key_head.")}
    sd["text.weight"] = sd["text.weight"][:NB].contiguous()  # [NB, D] (埋め用の行は除く)
    tensors = [{"name": k, "shape": list(v.shape)} for k, v in sd.items()]
    header = {"version": 1, "nb": NB, "d": D, "heads": HEADS, "layers": LAYERS, "ffn": FFN, "pair": PAIR,
              "types": TYPES, "coarse": COARSE, "keys": keys, "tensors": tensors}
    hj = json.dumps(header, ensure_ascii=False).encode("utf-8")
    os.makedirs(ASSETS, exist_ok=True)
    path = os.path.join(ASSETS, "preset-model.bin")
    with open(path, "wb") as f:
        f.write(b"RCPM")
        f.write(struct.pack("<I", len(hj)))
        f.write(hj)
        for t in tensors:
            f.write(sd[t["name"]].numpy().astype("<f4").tobytes())
    print(f"書き出し: {os.path.relpath(path, ROOT)} ({os.path.getsize(path) // 1024} KiB)")


def export_parity(model, keys, games):
    model.eval()
    cases = []
    for g in games:
        data = {k: v.to(DEV) for k, v in encode([g], keys).items()}
        with torch.no_grad():
            cat, aff, axis, _ = model(data["feats"], data["key"], data["typ"], data["mask"], tid=data["tid"])
        n = len(g["actions"])
        cases.append({
            "name": g["name"],
            "actions": [{k: a.get(k) for k in ("id", "label", "bind", "type", "default") if a.get(k) is not None} for a in g["actions"]],
            "features": [featurize(a, keys)[0] for a in g["actions"]],
            "category": [[round(float(x), 5) for x in row] for row in cat[0, :n].softmax(-1)],
            "affinity": [[round(float(x), 5) for x in row] for row in torch.sigmoid(aff[0, :n, :n])],
            "axis": [[round(float(x), 5) for x in row] for row in torch.sigmoid(axis[0, :n, :n])],
        })
    path = os.path.join(ASSETS, "preset-model-parity.json")
    json.dump({"cases": cases}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"書き出し: {os.path.relpath(path, ROOT)}")


def quantize_rows(w):
    """行ごと (出力ごと) の8ビット。TextEncoder の --text-int8 と同じ丸め方で、保存値から同じ重みに戻る"""
    scale = w.abs().amax(dim=1, keepdim=True).clamp(min=1e-8) / 127
    return (w / scale).round().clamp(-127, 127).to(torch.int8), scale.squeeze(1).float()


def export_text_encoder(out_dir):
    """MiniLM 小型版 (#429) を書き出す。text-encoder.bin (独自の形式 RCTE) と、元のトークナイザーのファイル。
    語彙の表は残す行だけ。2次元の重みは行ごとの8ビット + 倍率 (float32)、それ以外は float32。
    推論: トークナイザーで ID にし、残す語彙にない ID は <unk> にしてから、vocab の並びで行番号に直す"""
    if TEXT.kept is None or not TEXT.int8:
        raise SystemExit("MiniLM の書き出しには --text-vocab と --text-int8 が要ります")
    os.makedirs(out_dir, exist_ok=True)
    m = TEXT.model.cpu()
    cfg = m.config
    sd = {k: v.detach().float().cpu() for k, v in m.state_dict().items()}
    kept = torch.tensor(TEXT.kept)
    sd["embeddings.word_embeddings.weight"] = sd["embeddings.word_embeddings.weight"][kept]
    tensors, blobs = [], []
    for k, v in sd.items():
        if k.endswith("position_ids"):
            continue
        if v.dim() == 2 and k != "embeddings.position_embeddings.weight" and k != "embeddings.token_type_embeddings.weight":
            q, scale = quantize_rows(v)
            tensors.append({"name": k, "shape": list(v.shape), "dtype": "i8", "scale": "f32"})
            blobs += [q.numpy().tobytes(), scale.numpy().astype("<f4").tobytes()]
        else:
            tensors.append({"name": k, "shape": list(v.shape), "dtype": "f32"})
            blobs.append(v.numpy().astype("<f4").tobytes())
    # 位置の番号の始まり: BERT 型は 0、XLM-R 型は padding_idx + 1 (語彙は XLM-R でも本体が BERT 型のことがある)
    position_start = cfg.pad_token_id + 1 if cfg.model_type in ("xlm-roberta", "roberta") else 0
    header = {"version": 1, "source": TEXT.name, "license": "Apache-2.0", "modelType": cfg.model_type, "positionStart": position_start,
              "layers": cfg.num_hidden_layers, "hidden": cfg.hidden_size, "heads": cfg.num_attention_heads,
              "intermediate": cfg.intermediate_size, "maxPositions": cfg.max_position_embeddings,
              "layerNormEps": cfg.layer_norm_eps, "padTokenId": cfg.pad_token_id, "unkTokenId": TEXT.tok.unk_token_id,
              "maxLength": 48, "pooling": "mean", "vocab": TEXT.kept, "tensors": tensors}
    hj = json.dumps(header, ensure_ascii=False).encode("utf-8")
    path = os.path.join(out_dir, "text-encoder.bin")
    with open(path, "wb") as f:
        f.write(b"RCTE")
        f.write(struct.pack("<I", len(hj)))
        f.write(hj)
        for b in blobs:
            f.write(b)
    TEXT.tok.save_pretrained(out_dir)  # 元のトークナイザー (Apache-2.0) をそのまま同梱する
    print(f"書き出し: {path} ({os.path.getsize(path) // 1024} KiB)")


def export_model_v2(model, keys, out_dir):
    """分担を判断する部分 (RCPM 版2)。操作名は MiniLM のベクトル (text_proj で D 次元へ写す) で読む"""
    sd = {k: v.detach().cpu().float().contiguous() for k, v in model.state_dict().items()
          if k != "mask_vec" and not k.startswith("key_head.") and k != "text.weight"}
    tensors = [{"name": k, "shape": list(v.shape)} for k, v in sd.items()]
    header = {"version": 2, "text": {"encoder": "text-encoder.bin", "dim": TEXT.dim, "input": "label | id | bind (単語に分けて空白でつなぐ)"},
              "d": D, "heads": HEADS, "layers": LAYERS, "ffn": FFN, "pair": PAIR,
              "types": TYPES, "coarse": COARSE, "keys": keys, "tensors": tensors}
    hj = json.dumps(header, ensure_ascii=False).encode("utf-8")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "preset-model.bin")
    with open(path, "wb") as f:
        f.write(b"RCPM")
        f.write(struct.pack("<I", len(hj)))
        f.write(hj)
        for t in tensors:
            f.write(sd[t["name"]].numpy().astype("<f4").tobytes())
    print(f"書き出し: {path} ({os.path.getsize(path) // 1024} KiB)")


def export_parity_v2(model, keys, games, out_dir):
    """Rust の推論 (#430) と照合する基準: 操作名の文字列・MiniLM のベクトル・分担の判断の出力"""
    model.eval()
    cases = []
    for g in games:
        data = {k: v.to(DEV) for k, v in encode([g], keys).items()}
        with torch.no_grad():
            cat, aff, axis, _ = model(data["feats"], data["key"], data["typ"], data["mask"], tid=data["tid"])
        n = len(g["actions"])
        texts = [TextEncoder.text_of(a) for a in g["actions"]]
        vec = TEXT.matrix[torch.tensor(TEXT.ids(texts), device=TEXT.matrix.device)].cpu()
        cases.append({
            "name": g["name"], "texts": texts,
            "actions": [{k: a.get(k) for k in ("id", "label", "bind", "type", "default") if a.get(k) is not None} for a in g["actions"]],
            "textVectors": [[round(float(x), 6) for x in row] for row in vec],
            "category": [[round(float(x), 5) for x in row] for row in cat[0, :n].softmax(-1)],
            "affinity": [[round(float(x), 5) for x in row] for row in torch.sigmoid(aff[0, :n, :n])],
            "axis": [[round(float(x), 5) for x in row] for row in torch.sigmoid(axis[0, :n, :n])],
        })
    path = os.path.join(out_dir, "parity.json")
    json.dump({"cases": cases}, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"書き出し: {path}")


# ---------------------------------------------------------------- 本体

def train(games, keys, args, rng, log=True):
    """実在のゲームを水増しして学習する (--synthetic を付けたときだけ合成のゲームも混ぜる)"""
    samples = [augment(g, rng) for g in games for _ in range(g.get("copies", args.copies))]
    samples += [synth_game(rng, keys, False) for _ in range(args.synthetic)]
    data = encode(samples, keys)
    model = PresetBert(len(keys)).to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    n, bs = len(samples), 32
    steps = args.epochs * (n // bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.1)
    for ep in range(args.epochs):
        model.train()
        perm = torch.randperm(n)
        total = 0.0
        for s in range(n // bs):
            idx = perm[s * bs:(s + 1) * bs]
            batch = {k: v[idx] for k, v in data.items()}
            # 長さを揃えた分の無駄を減らす: このバッチの最長に切る
            L = int(batch["mask"].sum(1).max())
            batch = {k: (v[:, :L] if v.dim() >= 2 else v).to(DEV, non_blocking=True) for k, v in batch.items()}
            loss, *_ = losses(model, batch, True)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            total += loss.item()
        if log and (ep + 1) % 5 == 0:
            print(f"  エポック {ep + 1}/{args.epochs}: 損失 {total / (n // bs):.4f}", flush=True)
    # 学習データに一度も出てこないキーは「キーなし」と同じにする (初期値の乱数のまま推論に混ぜない)
    seen = set(data["key"][data["mask"]].unique().tolist())
    with torch.no_grad():
        for k in range(1, len(keys)):
            if k not in seen:
                model.key.weight[k] = model.key.weight[0]
    if log:
        print(f"  学習に出てきたキー {len(seen - {0})} 種類 / 全 {len(keys) - 1} 種類 (残りは「キーなし」と同じに)", flush=True)
    return model


def main():
    global STYLE_AUG, LAYERS, D, HEADS, FFN, PAIR, NB, DROPOUT, DEV, TEXT
    ap = argparse.ArgumentParser()
    ap.add_argument("--copies", type=int, default=150, help="実在のゲーム 1 本あたりの水増しの数")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--synthetic", type=int, default=0, help="比較用: 合成のゲームも混ぜる数 (既定は 0 = 実在だけ)")
    ap.add_argument("--cv", action="store_true", help="1 ゲームずつ外して評価する (書き出さない)")
    ap.add_argument("--no-claude", action="store_true", help="比較用: Claude が知識から書いたゲーム (data/claude-games.txt) を使わない")
    ap.add_argument("--claude-copies", type=int, default=20, help="Claude が書いたゲーム 1 件あたりの水増しの数 (件数が多いので実在より少なく)")
    ap.add_argument("--cv-game", default=None, help="交差検証でこのゲームだけを外して評価する (並列に回すため)")
    ap.add_argument("--threads", type=int, default=0, help="torch のスレッド数 (0 = CPU の半分)")
    ap.add_argument("--seed", type=int, default=20261108)
    ap.add_argument("--style-aug", action="store_true", help="ID の書き方の水増し (ゲームのファイルにある名前の書き方に慣れさせる)")
    ap.add_argument("--no-github", action="store_true", help="比較用: GitHub から集めたデータ (data/local/) を使わない")
    ap.add_argument("--github-copies", type=int, default=2, help="GitHub の注釈なしのデータ 1 件あたりの水増しの数")
    ap.add_argument("--gh-folds", type=int, default=0,
                    help="GitHub の注釈付きのゲームを K 組に分け、ほかの組で学習して残りの組で評価する (注釈付きの生データの効果を見る)")
    ap.add_argument("--gh-fold-only", type=int, default=None, help="--gh-folds のうちこの組だけを計算する (並列に回すため、0 から)")
    # モデルの大きさ・学習の設定 (生の操作名への汎化を上げる実験用。Rust はヘッダーから読むので、変えても推論の直しは要らない)
    ap.add_argument("--layers", type=int, default=LAYERS)
    ap.add_argument("--dim", type=int, default=D)
    ap.add_argument("--heads", type=int, default=HEADS)
    ap.add_argument("--ffn", type=int, default=0, help="0 = dim の 2 倍")
    ap.add_argument("--pair", type=int, default=PAIR)
    ap.add_argument("--nb", type=int, default=NB, help="文字 n-gram のハッシュの数")
    ap.add_argument("--dropout", type=float, default=0.0)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--device", default="cpu", help="cpu / cuda")
    ap.add_argument("--text-vocab", default=None, help="比較実験: --text-encoder の語彙をこの JSON (トークン ID の一覧) に絞る")
    ap.add_argument("--export-dir", default=None, help="--text-encoder の書き出し先 (既定 data/local/preset-model/export-v2)")
    ap.add_argument("--text-int8", action="store_true", help="比較実験: --text-encoder の重みを8ビットに丸める")
    ap.add_argument("--text-encoder", default=None, help="比較実験: 事前学習済みの BERT 系モデル (Hugging Face の名前) で操作名を読む。書き出しは未対応")
    ap.add_argument("--dump-preds", action="store_true", help="--gh-folds で、評価したゲームの操作ごとの予測を PRED 行で出す")
    ap.add_argument("--gh-eval-ids", default=None, help="--gh-folds で評価に使うゲームIDの一覧 (JSON)。ほかの注釈付きは常に学習側")
    ap.add_argument("--holdout-github", action="store_true",
                    help="GitHub の注釈付きのゲームを学習から外し、初見の生データとして評価する (書き出さない)")
    args = ap.parse_args()
    STYLE_AUG = args.style_aug
    LAYERS, D, HEADS, PAIR, NB, DROPOUT = args.layers, args.dim, args.heads, args.pair, args.nb, args.dropout
    FFN = args.ffn or 2 * D
    DEV = torch.device(args.device)
    if args.text_encoder:
        TEXT = TextEncoder(args.text_encoder, DEV, args.text_vocab, args.text_int8)
        print(f"操作名の読み取り: {args.text_encoder}（{TEXT.dim}次元、重みは固定）", flush=True)
    print(f"モデル: {LAYERS}層・{D}次元・{HEADS}ヘッド・FFN {FFN}・n-gram {NB}・dropout {DROPOUT}・lr {args.lr}・{DEV}", flush=True)
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads or max(1, os.cpu_count() // 2))
    keys = key_list()
    rng = random.Random(args.seed)
    real = real_dataset()
    ids = sorted({g["game"] for g in real})
    extra = [] if args.no_claude else [dict(g, copies=args.claude_copies) for g in claude_games()]
    print(f"実在のゲーム {len(ids)} 本 (データ {len(real)} 件、操作 {sum(len(g['actions']) for g in real)} 件)"
          + (f" + Claude が知識から書いた実在のゲーム {len({g['game'] for g in extra})} 本 (データ {len(extra)} 件、操作 "
             f"{sum(len(g['actions']) for g in extra)} 件)" if extra else "")
          + (f" + 合成 {args.synthetic} 本" if args.synthetic else ""))
    gh_labeled, gh_unlabeled = ([], []) if args.no_github else github_games()
    gh_unlabeled = [dict(g, copies=args.github_copies) for g in gh_unlabeled]
    gh_labeled_train = [dict(g, copies=args.copies) for g in gh_labeled]
    if gh_labeled or gh_unlabeled:
        print(f"GitHub: 注釈付き {len(gh_labeled)} 件 (操作 {sum(len(g['actions']) for g in gh_labeled)} 件)・"
              f"注釈なし {len(gh_unlabeled)} 件 (操作 {sum(len(g['actions']) for g in gh_unlabeled)} 件、キーの予測だけに使う)")
    extra = extra + gh_unlabeled
    templates = encode(template_games(), keys)

    if args.gh_folds:
        order = sorted(gh_labeled, key=lambda g: g["game"])
        # --gh-eval-ids: 評価に使うゲームをこの一覧に固定する (注釈を足しても、比べる評価の組を変えない)
        pool = order
        if args.gh_eval_ids:
            ids = set(json.load(open(args.gh_eval_ids, encoding="utf-8")))
            pool = [g for g in order if g["game"] in ids]
        for k in ([args.gh_fold_only] if args.gh_fold_only is not None else range(args.gh_folds)):
            held = pool[k::args.gh_folds]
            rest = [dict(g, copies=args.copies) for g in order if g not in held]
            model = train(real + extra + rest, keys, args, rng, log=False)
            for g in held:
                print("COUNTS " + json.dumps({"game": g["game"], **counts(model, encode([g], keys))}), flush=True)
                if args.dump_preds:
                    dump_preds(model, g, keys)
            print(f"組 {k + 1}/{args.gh_folds}: 評価 {len(held)} 本", flush=True)
        print("gh-folds 完了", flush=True)
        return

    if args.holdout_github:
        model = train(real + extra, keys, args, rng)
        c = counts(model, encode(gh_labeled, keys))
        report(c, f"GitHub の注釈付き {len(gh_labeled)} 件 (学習に不使用)")
        print("COUNTS " + json.dumps({"game": "github-holdout", **c}), flush=True)
        for g in gh_labeled:
            print("COUNTS " + json.dumps({"game": g["game"], **counts(model, encode([g], keys))}), flush=True)
        return

    if args.cv:
        total = {}
        for gid in ([args.cv_game] if args.cv_game else ids):
            held = [g for g in real if g["game"] == gid]
            # Claude のデータは評価の 14 本を含まないので、常に学習側に置く
            model = train([g for g in real if g["game"] != gid] + extra + gh_labeled_train, keys, args, rng, log=False)
            c = counts(model, encode(held, keys))
            report(c, f"外した {held[0]['name']}")
            print("COUNTS " + json.dumps({"game": gid, **c}), flush=True)
            for k, v in c.items():
                total[k] = total.get(k, 0) + v
        print("交差検証の合計 (1 ゲームずつ外して学習し、外したゲームで評価)")
        report(total, "全ゲーム")
        return

    model = train(real + extra + gh_labeled_train, keys, args, rng)
    if TEXT is not None:
        # MiniLM 小型版 (#429)。apps/host-rs/assets には書かず、別のフォルダへ (Rust の推論は #430)
        out = args.export_dir or os.path.join(ROOT, "data", "local", "preset-model", "export-v2")
        print("評価")
        evaluate(model, encode(real, keys), "学習に使った実在のゲーム (参考)")
        export_text_encoder(out)
        export_model_v2(model, keys, out)
        # 照合の正解は公開済みの手作りの定義だけで作る (このPCで読んだ操作は学習データなので配布物に入れない)
        export_parity_v2(model, keys, [next(g for g in real if g["name"].endswith("(定義)"))], out)
        return
    print("評価")
    evaluate(model, encode(real, keys), "学習に使った実在のゲーム (参考)")
    evaluate(model, templates, "ジャンルの型の定義 (学習に不使用)")
    export(model, keys)
    # 試験データ: このPCの実在 2 本と手作りの定義 1 本
    export_parity(model, keys, [real[0], real[1], next(g for g in real if g["name"].endswith("(定義)"))])


if __name__ == "__main__":
    main()
