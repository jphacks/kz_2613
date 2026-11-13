"""このPCでローカルに読める情報だけから、実在のゲームの操作データセットを作る。

読むだけで書き換えない。ゲームのコードは実行しない。インターネットは使わない。
    python scripts/preset-model/build_dataset.py   # data/real-games.json を作り直す

情報源 (見つかったものだけ使う):
- scripts/profiles/extract.mjs の下書き (Steam のインストール済みゲーム・Minecraft)
- Minecraft: 言語ファイル ja_jp.json (ゲーム公式の日本語名)・options.txt (実際のキー)
- R.E.P.O.: DefaultKeyBindings.es3 (開発者の初期キー。列挙型の番号 → キー)
- Core Keeper: Pug.Other.dll の .NET メタデータから RewiredConsts.Action の定数名
出力にはこのPCのパス・ユーザー名を含めない。正解のラベルは data/labels.json に別に持つ。
"""

import glob
import json
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "data", "real-games.json")

# extract.mjs の keyId と同じ規則 (Python 版)
NAMED = {
    "space": "SPACE", "spacebar": "SPACE", "enter": "ENTER", "return": "ENTER", "escape": "ESC", "esc": "ESC", "tab": "TAB",
    "backspace": "BACKSPACE", "capslock": "CAPS_LOCK", "leftshift": "LSHIFT", "lshift": "LSHIFT", "shift": "LSHIFT",
    "rightshift": "RSHIFT", "leftcontrol": "LCTRL", "leftctrl": "LCTRL", "lctrl": "LCTRL", "ctrl": "LCTRL", "control": "LCTRL",
    "rightcontrol": "RCTRL", "rightctrl": "RCTRL", "leftalt": "LALT", "lalt": "LALT", "alt": "LALT", "rightalt": "RALT",
    "up": "ARROW_UP", "down": "ARROW_DOWN", "left": "ARROW_LEFT", "right": "ARROW_RIGHT",
    "mouse1": "MOUSE_L", "leftbutton": "MOUSE_L", "mouseleft": "MOUSE_L", "mouse2": "MOUSE_R", "rightbutton": "MOUSE_R", "mouseright": "MOUSE_R",
    "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4", "f5": "F5", "f6": "F6", "f7": "F7", "f8": "F8", "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
    "pageup": "PAGE_UP", "pagedown": "PAGE_DOWN", "grave": "GRAVE", "backquote": "GRAVE",
    "mwheelup": "WHEEL_UP", "mousewheelup": "WHEEL_UP", "mwheeldown": "WHEEL_DOWN", "mousewheeldown": "WHEEL_DOWN",
    "leftmousebutton": "MOUSE_L", "rightmousebutton": "MOUSE_R", "uparrow": "ARROW_UP", "downarrow": "ARROW_DOWN",
    "leftarrow": "ARROW_LEFT", "rightarrow": "ARROW_RIGHT", "semicolon": "SEMICOLON", "comma": "COMMA", "period": "PERIOD",
    "slash": "SLASH", "backslash": "BACKSLASH", "minus": "MINUS", "equals": "EQUAL", "lbracket": "LBRACKET", "rbracket": "RBRACKET",
    "del": "DELETE", "delete": "DELETE", "ins": "INSERT", "insert": "INSERT", "home": "HOME", "end": "END", "pgup": "PAGE_UP", "pgdn": "PAGE_DOWN",
    "alt": "LALT", "ralt": "RALT", "rctrl": "RCTRL",
}
# 既存の抽出器の下書きのうち使わないもの (同じ内容・操作ではないデータ)
SKIP_DRAFTS = {"steam:1281930": "tModLoader は Terraria と同じ内容", "steam:238320": "Outlast はライトマップの設定しか取れない"}


def key_id(name):
    if not name:
        return None
    n = str(name).strip().replace("\\/", "/")
    if n.startswith("<Keyboard>/"):
        n = n[len("<Keyboard>/"):]
    elif n == "<Mouse>/leftButton":
        return "MOUSE_L"
    elif n == "<Mouse>/rightButton":
        return "MOUSE_R"
    elif n.startswith("<"):
        return None
    n = re.sub(r"[ _-]", "", n).lower()
    if n == "key.mouse.left":
        return "MOUSE_L"
    if n == "key.mouse.right":
        return "MOUSE_R"
    if n.startswith("key.keyboard."):
        n = n[len("key.keyboard."):].replace(".", "")
    if n in NAMED:
        return NAMED[n]
    m = re.match(r"^(?:alpha|digit|d)?([0-9])$", n)
    if m:
        return "DIGIT_" + m.group(1)
    if re.match(r"^[a-z]$", n):
        return "KEY_" + n.upper()
    return None


def steam_libs():
    try:
        out = subprocess.run(["reg", "query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"], capture_output=True, text=True).stdout
        sp = re.search(r"SteamPath\s+REG_SZ\s+(.+)", out).group(1).strip()
    except Exception:
        return []
    libs = [sp]
    try:
        vdf = open(os.path.join(sp, "steamapps", "libraryfolders.vdf"), encoding="utf-8").read()
        libs += [p.replace("\\\\", "\\") for p in re.findall(r'"path"\s+"([^"]+)"', vdf)]
    except OSError:
        pass
    return libs


def game_dir(name):
    for lib in steam_libs():
        d = os.path.join(lib, "steamapps", "common", name)
        if os.path.isdir(d):
            return d
    return None


def steam_games():
    """インストール済みの Steam ゲーム: [(appid, 名前, フォルダ)]"""
    out = []
    for lib in steam_libs():
        for f in glob.glob(os.path.join(lib, "steamapps", "appmanifest_*.acf")):
            t = open(f, encoding="utf-8", errors="replace").read()
            g = lambda k: (re.search(rf'"{k}"\s+"([^"]*)"', t) or [None, None])[1]
            if g("appid") and g("installdir"):
                out.append((g("appid"), g("name") or g("installdir"), os.path.join(lib, "steamapps", "common", g("installdir"))))
    return out


# ---------------------------------------------------------------- Source / Source 2 / Unreal Engine 3

def read_text(path):
    """UTF-16 (BOM あり) と UTF-8 の両方を読む (Source の翻訳ファイルは UTF-16)"""
    b = open(path, "rb").read()
    if b[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return b.decode("utf-16", errors="replace")
    return b.decode("utf-8", errors="replace")


def vpk_entries(dir_vpk):
    """Valve の VPK (v1・v2) の目録を読む: {ファイルのパス: (読む関数)}。読むだけで展開はしない"""
    out = {}
    with open(dir_vpk, "rb") as f:
        b = f.read()
    sig, ver, tree = struct.unpack_from("<III", b, 0)
    if sig != 0x55AA1234 or ver not in (1, 2):
        return out
    head = 12 if ver == 1 else 28
    p, end = head, head + tree

    def cstr():
        nonlocal p
        e = b.index(b"\0", p)
        s = b[p:e].decode("utf-8", errors="replace")
        p = e + 1
        return s

    base = dir_vpk[: -len("_dir.vpk")]
    while p < end:
        ext = cstr()
        if not ext:
            break
        while True:
            path = cstr()
            if not path:
                break
            while True:
                name = cstr()
                if not name:
                    break
                _crc, pre, arc, off, length, _term = struct.unpack_from("<IHHIIH", b, p)
                p += 18
                preload = b[p:p + pre]
                p += pre
                full = (name + "." + ext) if path.strip() == "" else f"{path}/{name}.{ext}"

                def reader(preload=preload, arc=arc, off=off, length=length):
                    if length == 0:
                        return preload
                    if arc == 0x7FFF:
                        return preload + b[end + off:end + off + length]
                    with open(f"{base}_{arc:03d}.vpk", "rb") as g:
                        g.seek(off)
                        return preload + g.read(length)
                out[full.lower()] = reader
    return out


def game_texts(root, pattern):
    """フォルダの中のファイルと、VPK の中のファイルのうち、パス (小文字・/ 区切り) が正規表現に合うものの [(パス, 文字列)]"""
    rx = re.compile(pattern)
    out = []
    for dp, _dirs, files in os.walk(root):
        for fn in files:
            full = os.path.join(dp, fn)
            rel = os.path.relpath(full, root).replace("\\", "/").lower()
            if rx.search(rel):
                out.append((rel, read_text(full)))
            elif fn.lower().endswith("_dir.vpk"):
                try:
                    for path, rd in vpk_entries(full).items():
                        if rx.search(path):
                            data = rd()
                            text = data.decode("utf-16", errors="replace") if data[:2] in (b"\xff\xfe", b"\xfe\xff") \
                                else data.decode("utf-8", errors="replace")
                            out.append((path, text))
                except (OSError, ValueError, struct.error):
                    pass
    return out


def quoted_pairs(text):
    """「"キー" "値"」の組 (コメント // は除く)"""
    text = re.sub(r"//[^\n]*", "", text)
    return re.findall(r'"([^"\n]*)"\s+"([^"\n]*)"', text)


def source_engine(root):
    """Source の scripts/kb_act.lst (操作と表示名の翻訳キー) + resource/*_{english,japanese}.txt (表示名) +
    cfg/config_default.cfg の bind (初期キー)。Source 2 は .vcfg の "キー" "+操作" から操作とキーだけ"""
    acts = []
    texts = game_texts(root, r"(^|/)scripts/kb_act\.lst$|(^|/)resource/[^/]*_(english|japanese)\.txt$|(^|/)cfg/config_default\.cfg$|\.vcfg$")
    lst = [t for p, t in texts if p.endswith("scripts/kb_act.lst")]
    if lst:
        en, ja = {}, {}
        for p, t in texts:
            if p.endswith("_english.txt"):
                en.update({k.lower(): v for k, v in quoted_pairs(t)})
            elif p.endswith("_japanese.txt"):
                ja.update({k.lower(): v for k, v in quoted_pairs(t)})
        binds = {}
        for p, t in texts:
            if p.endswith("cfg/config_default.cfg"):
                for k, cmd in re.findall(r'bind\s+"?([^"\s]+)"?\s+"([^"]+)"', t, re.I):
                    binds.setdefault(cmd.strip().lower(), key_id(k))
        for cmd, token in quoted_pairs(lst[0]):
            if cmd.lower() == "blank" or not cmd.strip():
                continue
            t = token.lstrip("#").lower()
            a = {"id": cmd, "label": en.get(t, token.lstrip("#")), "bind": cmd, "type": "button"}
            if ja.get(t):
                a["label_ja"] = ja[t]
            if binds.get(cmd.lower()):
                a["default"] = binds[cmd.lower()]
            acts.append(a)
        return acts, "Source の kb_act.lst・翻訳ファイル・config_default.cfg"
    seen = {}
    for _p, t in [(p, t) for p, t in texts if p.endswith(".vcfg")]:
        for k, cmd in quoted_pairs(t):
            if re.match(r"^[+-]?[a-z_][a-z0-9_]*$", cmd) and key_id(k) and cmd not in seen:
                seen[cmd] = key_id(k)
    if len(seen) >= 5:
        return [{"id": c, "label": c, "bind": c, "type": "button", "default": k} for c, k in seen.items()], "Source 2 の .vcfg のキー設定"
    return [], None


def unreal3_input(root):
    """Unreal Engine 3 の Config/*Input.ini: Bindings=(Name="W",Command="GBA_MoveForward") のうち、Name がキーのもの"""
    seen = {}
    for _p, t in game_texts(root, r"(^|/)config/[^/]*input\.ini$"):
        for name, cmd in re.findall(r'Bindings=\(Name="([^"]+)",Command="([^"]+)"', t):
            k = key_id(name)
            if k and re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", cmd) and cmd not in seen:
                seen[cmd] = k
    if len(seen) >= 5:
        return [{"id": c, "label": c, "bind": c, "type": "button", "default": k} for c, k in seen.items()], "Unreal Engine 3 の Input.ini"
    return [], None


# ---------------------------------------------------------------- Godot (project.godot)

# Godot 4 と Godot 3 の特殊キーの番号 → 出力の ID (英字・数字は ASCII の大文字と同じ番号)
GODOT_KEYS = {}
for _base in (4194304, 16777216):   # Godot 4 は 1<<22、Godot 3 は 1<<24 から
    GODOT_KEYS.update({_base + 1: "ESC", _base + 2: "TAB", _base + 4: "BACKSPACE", _base + 5: "ENTER", _base + 6: "ENTER",
                       _base + 15: "ARROW_LEFT", _base + 16: "ARROW_UP", _base + 17: "ARROW_RIGHT", _base + 18: "ARROW_DOWN",
                       _base + 21: "LSHIFT", _base + 22: "LCTRL", _base + 24: "LALT"})
    GODOT_KEYS.update({_base + 28 + i: f"F{i + 1}" for i in range(12)})
GODOT_MOUSE = {1: "MOUSE_L", 2: "MOUSE_R", 4: "WHEEL_UP", 5: "WHEEL_DOWN"}


def godot_key(code):
    if code in GODOT_KEYS:
        return GODOT_KEYS[code]
    if code == 32:
        return "SPACE"
    if 65 <= code <= 90:
        return f"KEY_{chr(code)}"
    if 48 <= code <= 57:
        return f"DIGIT_{chr(code)}"
    return None


def godot_project(path):
    """project.godot の [input] から (ゲーム名, 操作の一覧)。キーは最初のキー・マウスのイベント"""
    text = read_text(path)
    name = (re.search(r'^config/name\s*=\s*"([^"]*)"', text, re.M) or [None, os.path.basename(os.path.dirname(path))])[1]
    m = re.search(r"^\[input\]\s*$(.*?)(?=^\[[^\]]+\]\s*$|\Z)", text, re.M | re.S)
    acts = []
    if not m:
        return name, acts
    for aname, body in re.findall(r"^([A-Za-z0-9_./]+)\s*=\s*\{(.*?)^\}", m.group(1), re.M | re.S):
        key, typ = None, "button"
        # イベントは「Object(種類, …)」。中に Vector2(0, 0) などの括弧があるので、Object( ごとに区切る
        events = [(seg.split(",", 1)[0].strip(), seg) for seg in body.split("Object(")[1:]]
        for ev, fields in events:
            num = lambda k: int((re.search(rf'"{k}":\s*(-?\d+)', fields) or [0, 0])[1])
            if ev == "InputEventKey":
                code = num("keycode") or num("physical_keycode") or num("scancode") or num("physical_scancode")
                key = godot_key(code)
            elif ev == "InputEventMouseButton":
                key = GODOT_MOUSE.get(num("button_index"))
            if key:
                break
        a = {"id": aname, "label": aname, "type": typ}
        if key:
            a["default"] = key
        acts.append(a)
    return name, acts


def godot_projects():
    """ユーザーのフォルダにある Godot のプロジェクト (このリポジトリと、エディタ・ゲームの中身は除く)"""
    home = os.environ.get("USERPROFILE", "")
    found = []
    for base in ("Documents", "Desktop", "Downloads", "Godot", "OneDrive"):
        for dp, dirs, files in os.walk(os.path.join(home, base)):
            dirs[:] = [d for d in dirs if d not in (".godot", ".import", "node_modules", ".git")]
            if "project.godot" in files:
                found.append(os.path.join(dp, "project.godot"))
    return sorted(found)


# ---------------------------------------------------------------- Rewired (Unity のアセットに保存された入力の設定)

# Unity の KeyCode → 出力の ID (英字は小文字の ASCII、数字は ASCII)
UNITY_KEYS = {8: "BACKSPACE", 9: "TAB", 13: "ENTER", 27: "ESC", 32: "SPACE", 39: "APOSTROPHE", 44: "COMMA", 45: "MINUS", 46: "PERIOD",
              47: "SLASH", 59: "SEMICOLON", 61: "EQUAL", 91: "LBRACKET", 92: "BACKSLASH", 93: "RBRACKET", 96: "GRAVE", 127: "DELETE",
              273: "ARROW_UP", 274: "ARROW_DOWN", 275: "ARROW_RIGHT", 276: "ARROW_LEFT", 277: "INSERT", 278: "HOME", 279: "END",
              280: "PAGE_UP", 281: "PAGE_DOWN", 301: "CAPS_LOCK", 303: "RSHIFT", 304: "LSHIFT", 305: "RCTRL", 306: "LCTRL",
              307: "RALT", 308: "LALT", 323: "MOUSE_L", 324: "MOUSE_R"}
UNITY_KEYS.update({48 + i: f"DIGIT_{i}" for i in range(10)})
UNITY_KEYS.update({97 + i: f"KEY_{chr(65 + i)}" for i in range(26)})
UNITY_KEYS.update({282 + i: f"F{i + 1}" for i in range(12)})
# Rewired のマウスの要素: 0 = X 軸、1 = Y 軸、2 = ホイール、3 = 左ボタン、4 = 右ボタン (Project Winter の Use・Aim・持ち物の切り替えで確かめた)
REWIRED_MOUSE_BUTTONS = {3: "MOUSE_L", 4: "MOUSE_R"}


def rewired_actions(ud):
    """Rewired の UserData (dict) → 操作の一覧。軸は正負の表示名で 2 つに分け、マウスの軸は視点にする"""
    cats = {c.get("_id"): c.get("_name") for c in ud.get("actionCategories", [])}
    kb, mouse_btn, mouse_axis, wheel = {}, {}, set(), set()
    for m in ud.get("keyboardMaps", []):
        for e in m.get("actionElementMaps", []):
            k = UNITY_KEYS.get(e.get("_keyboardKeyCode"))
            if k:
                kb.setdefault((e["_actionId"], e.get("_axisContribution", 0)), k)
    for m in ud.get("mouseMaps", []):
        for e in m.get("actionElementMaps", []):
            eid, aid = e.get("_elementIdentifierId"), e["_actionId"]
            if e.get("_elementType") == 0 and eid in (0, 1):
                mouse_axis.add(aid)
            elif eid == 2:
                wheel.add(aid)
            elif eid in REWIRED_MOUSE_BUTTONS:
                mouse_btn.setdefault(aid, REWIRED_MOUSE_BUTTONS[eid])
    acts = []
    for a in sorted(ud.get("actions", []), key=lambda a: (a.get("_categoryId", 0), a.get("_id", 0))):
        cat = cats.get(a.get("_categoryId"))
        pre = "" if cat in (None, "", "Default") else cat + "/"
        name, aid = a.get("_name") or str(a.get("_id")), a.get("_id")
        desc = a.get("_descriptiveName") or name
        if a.get("_type") == 0 and aid in mouse_axis:
            acts.append({"id": pre + name, "label": desc, "type": "mouseDelta"})
        elif a.get("_type") == 0 and (a.get("_positiveDescriptiveName") or a.get("_negativeDescriptiveName")):
            for sign, contrib, field in (("+", 0, "_positiveDescriptiveName"), ("-", 1, "_negativeDescriptiveName")):
                x = {"id": pre + name + sign, "label": a.get(field) or (name + sign), "type": "button"}
                if kb.get((aid, contrib)):
                    x["default"] = kb[(aid, contrib)]
                acts.append(x)
        else:
            x = {"id": pre + name, "label": desc, "type": "wheel" if aid in wheel and (aid, 0) not in kb else "button"}
            k = kb.get((aid, 0)) or mouse_btn.get(aid)
            if k:
                x["default"] = k
            acts.append(x)
    return acts


def rewired_game(data_dir):
    """Unity のゲームの *_Data から Rewired の設定を探す (UnityPy があるときだけ)。シーン・共有アセット → Addressables の順"""
    try:
        import UnityPy  # noqa: F401  (pip install UnityPy。なければ飛ばす)
    except ImportError:
        return [], None
    import UnityPy
    plain = sorted(glob.glob(os.path.join(data_dir, "level*")) + glob.glob(os.path.join(data_dir, "*.assets")))
    plain = [p for p in plain if not p.endswith(".resS")]
    bundles = sorted(glob.glob(os.path.join(data_dir, "StreamingAssets", "**", "*.bundle"), recursive=True),
                     key=lambda p: (not re.search(r"prefab|misc|input|manager|core|global", os.path.basename(p), re.I), p))
    for path in plain + bundles:
        try:
            env = UnityPy.load(path)
            for obj in env.objects:
                if obj.type.name != "MonoBehaviour":
                    continue
                try:
                    t = obj.read_typetree()
                except Exception:
                    continue
                ud = t.get("_userData") if isinstance(t, dict) else None
                if isinstance(ud, dict) and ud.get("actions") and "keyboardMaps" in ud:
                    return rewired_actions(ud), f"Rewired の設定 ({os.path.basename(path)})"
        except Exception:
            continue
    return [], None


# ---------------------------------------------------------------- .NET メタデータ (Core Keeper)

def dotnet_class_fields(path, namespace, cls):
    """ECMA-335 のメタデータから、型 namespace.cls の定数 (フィールド) 名を読む"""
    b = open(path, "rb").read()
    pe = struct.unpack_from("<I", b, 0x3C)[0]
    nsec = struct.unpack_from("<H", b, pe + 6)[0]
    optsz = struct.unpack_from("<H", b, pe + 20)[0]
    opt = pe + 24
    magic = struct.unpack_from("<H", b, opt)[0]
    dd = opt + (96 if magic == 0x10B else 112)
    cli_rva = struct.unpack_from("<I", b, dd + 14 * 8)[0]
    secs = [struct.unpack_from("<IIII", b, opt + optsz + i * 40 + 8) for i in range(nsec)]

    def off(rva):
        for vsz, va, rawsz, raw in secs:
            if va <= rva < va + max(vsz, rawsz):
                return rva - va + raw
        raise ValueError("rva")

    md = off(struct.unpack_from("<I", b, off(cli_rva) + 8)[0])
    vlen = struct.unpack_from("<I", b, md + 12)[0]
    p = md + 16 + vlen + 2
    nstreams = struct.unpack_from("<H", b, p)[0]
    p += 2
    streams = {}
    for _ in range(nstreams):
        o, sz = struct.unpack_from("<II", b, p)
        e = b.index(b"\0", p + 8)
        streams[b[p + 8:e].decode()] = md + o
        p = (e + 4) & ~3
    t = streams["#~"]
    heap = b[t + 6]
    valid = struct.unpack_from("<Q", b, t + 8)[0]
    rows, q = {}, t + 24
    for i in range(64):
        if valid >> i & 1:
            rows[i] = struct.unpack_from("<I", b, q)[0]
            q += 4
    ssz = 4 if heap & 1 else 2
    gsz = 4 if heap & 2 else 2
    bsz = 4 if heap & 4 else 2
    idx = lambda tab: 2 if rows.get(tab, 0) < 65536 else 4
    coded = lambda tabs, bits: 2 if max(rows.get(x, 0) for x in tabs) < (1 << (16 - bits)) else 4
    size = {
        0x00: 2 + ssz + 3 * gsz,
        0x01: coded([0x00, 0x1A, 0x23, 0x01], 2) + 2 * ssz,
        0x02: 4 + 2 * ssz + coded([0x02, 0x01, 0x1B], 2) + idx(0x04) + idx(0x06),
        0x03: idx(0x04),
        0x04: 2 + ssz + bsz,
    }
    start = {}
    for tab in range(0x05):
        start[tab] = q
        q += size[tab] * rows.get(tab, 0)
    rd = lambda o, n: struct.unpack_from("<I" if n == 4 else "<H", b, o)[0]
    strs = streams["#Strings"]
    s = lambda i: b[strs + i:b.index(b"\0", strs + i)].decode("utf-8")
    types = []
    for r in range(rows.get(0x02, 0)):
        o = start[0x02] + r * size[0x02]
        name, ns = s(rd(o + 4, ssz)), s(rd(o + 4 + ssz, ssz))
        flist = rd(o + 4 + 2 * ssz + coded([0x02, 0x01, 0x1B], 2), idx(0x04))
        types.append((ns, name, flist))
    for k, (ns, name, flist) in enumerate(types):
        if ns == namespace and name == cls:
            end = types[k + 1][2] if k + 1 < len(types) else rows[0x04] + 1
            return [s(rd(start[0x04] + (f - 1) * size[0x04] + 2, ssz)) for f in range(flist, end)]
    return []


# ---------------------------------------------------------------- 本体

def extracted_drafts():
    tmp = tempfile.mkdtemp(prefix="recooplay-ds-")
    subprocess.run(["node", os.path.join(ROOT, "scripts", "profiles", "extract.mjs"), "--out", tmp], check=True, capture_output=True)
    return {json.load(open(f, encoding="utf-8"))["id"]: json.load(open(f, encoding="utf-8")) for f in glob.glob(os.path.join(tmp, "*.json"))}


def act(a, **kw):
    out = {k: a.get(k) for k in ("id", "label", "bind", "type", "default") if a.get(k) is not None}
    out.update({k: v for k, v in kw.items() if v is not None})
    return out


def main():
    drafts = extracted_drafts()
    games = []

    # Minecraft: 日本語名 (ja_jp.json) と実際のキー (options.txt)
    mc = drafts.get("minecraft-java")
    mcdir = os.path.join(os.environ.get("APPDATA", ""), ".minecraft")
    if mc:
        ja, keys = {}, {}
        for idx in sorted(glob.glob(os.path.join(mcdir, "assets", "indexes", "*.json"))):
            o = json.load(open(idx, encoding="utf-8"))["objects"].get("minecraft/lang/ja_jp.json")
            if o:
                ja = json.load(open(os.path.join(mcdir, "assets", "objects", o["hash"][:2], o["hash"]), encoding="utf-8"))
        try:
            for line in open(os.path.join(mcdir, "options.txt"), encoding="utf-8"):
                if line.startswith("key_"):
                    k, v = line[4:].strip().split(":", 1)
                    keys[k] = key_id(v)
        except OSError:
            pass
        actions = [act(a, label=ja.get(a.get("bind") or "", a.get("label")), default=keys.get(a.get("bind") or "")) for a in mc["actions"]]
        games.append({"game": "minecraft-java", "name": mc["name"], "source": "Options.class・ja_jp.json・options.txt", "actions": actions})


    # R.E.P.O.: 列挙型 InputKey + DefaultKeyBindings.es3
    if "steam:3241660" in drafts:
        d = drafts["steam:3241660"]
        es3 = os.path.join(os.environ.get("USERPROFILE", ""), "AppData", "LocalLow", "semiwork", "Repo", "DefaultKeyBindings.es3")
        binds = {}
        try:
            body = open(es3, encoding="utf-8").read()
            for num, arr in re.findall(r"(\d+):\[(.*?)\]", body, re.S):
                items = re.findall(r'"([^"]*)"', arr)
                binds[num] = items
        except OSError:
            pass
        actions = []
        for a in d["actions"]:
            items = binds.get(str(a.get("bind")), [])
            typ = a["type"]
            if items and items[0] == "2DVector":
                typ, k = "axis2d", None
            else:
                k = next((key_id(x) for x in items if key_id(x)), None)
            actions.append(act(a, type=typ, default=k))
        games.append({"game": "steam-3241660", "name": d["name"], "source": "InputKey 列挙型・DefaultKeyBindings.es3", "actions": actions})

    # Core Keeper: RewiredConsts.Action
    ck = game_dir("Core Keeper")
    dll = os.path.join(ck, "CoreKeeper_Data", "Managed", "Pug.Other.dll") if ck else None
    ck_acts, ck_src = rewired_game(os.path.join(ck, "CoreKeeper_Data")) if ck else ([], None)
    if ck_acts:
        games.append({"game": "steam-1621690", "name": "Core Keeper", "source": ck_src, "actions": ck_acts})
    elif dll and os.path.exists(dll):
        names = dotnet_class_fields(dll, "RewiredConsts", "Action")
        if names:
            games.append({"game": "steam-1621690", "name": "Core Keeper", "source": "Pug.Other.dll の RewiredConsts.Action",
                          "actions": [{"id": n, "label": n, "type": "button"} for n in names]})

    # 既存の抽出器が読めたほかのゲーム (Terraria・Goose Goose Duck・ほかの Unity Input System・.NET の列挙型・設定ファイル)
    done = {g["game"] for g in games}
    for did, d in sorted(drafts.items()):
        gid = did.replace(":", "-")
        if gid in done or did in SKIP_DRAFTS or not d.get("actions"):
            continue
        src = (d.get("verification") or {}).get("sources") or ["extract.mjs の下書き"]
        games.append({"game": gid, "name": d["name"], "source": src[0], "actions": [act(a) for a in d["actions"]]})
        done.add(gid)

    # 強化した読み取り: Source (kb_act.lst)・Source 2 (.vcfg)・Unreal Engine 3 (Input.ini)
    for appid, name, root in steam_games():
        gid = f"steam-{appid}"
        if gid in done or f"steam:{appid}" in SKIP_DRAFTS or not os.path.isdir(root):
            continue
        data_dirs = [d for d in glob.glob(os.path.join(root, "*_Data")) if os.path.isdir(d)]
        unity = (lambda r: rewired_game(data_dirs[0])) if data_dirs else (lambda r: ([], None))
        for reader in (source_engine, unreal3_input, unity):
            acts, src = reader(root)
            if acts:
                games.append({"game": gid, "name": name, "source": src, "actions": acts})
                done.add(gid)
                break

    # Godot のプロジェクト (公式デモなど)。操作が 3 つ以上あるものだけ
    for p in godot_projects():
        name, acts = godot_project(p)
        if len(acts) < 3:
            continue
        gid = "godot-" + (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "project")
        while gid in done:
            gid += "-2"
        games.append({"game": gid, "name": name, "source": "Godot の project.godot", "actions": acts})
        done.add(gid)

    # 以前に集めたゲームは、アンインストールされていても残す (今回読めたゲームは新しいデータで置き換える)
    try:
        old = json.load(open(OUT, encoding="utf-8"))["games"]
    except (OSError, ValueError, KeyError):
        old = []
    kept = [g for g in old if g["game"] not in done]
    for g in kept:
        g.setdefault("note", "このPCから削除済み。以前に読んだデータを残している")
    games += kept

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"note": "このPCでローカルに読めた実在のゲームの操作 (build_dataset.py が作成)", "games": games},
              open(OUT, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    notes = json.load(open(os.path.join(HERE, "data", "labels.json"), encoding="utf-8"))
    for g in games:
        done_ids = {i for c, ids in notes.get("local:" + g["game"], {}).items() for i in ids}
        missing = sum(1 for a in g["actions"] if a["id"] not in done_ids)
        ja = sum(1 for a in g["actions"] if a.get("label_ja"))
        print(f"{g['game']:16} {g['name']:28} 操作 {len(g['actions']):3}件  キーあり {sum(1 for a in g['actions'] if a.get('default'))}件"
              + (f"  日本語名 {ja}件" if ja else "") + (f"  注釈なし {missing}件" if missing else "") + f"  ({g['source']})")
    print(f"書き出し: {os.path.relpath(OUT, ROOT)}")
    if any(1 for g in games for a in g["actions"]
           if a["id"] not in {i for ids in notes.get("local:" + g["game"], {}).values() for i in ids}):
        print("注釈のない操作があります。data/labels.json の「local:ゲーム」に書き足してから train.py を実行してください。")


if __name__ == "__main__":
    sys.exit(main())
