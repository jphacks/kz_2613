// 操作定義 JSON の下書きを、PC 内のゲームのファイルから静的に作る (#100)。
// 読むだけで書き換えない。ゲームのコードは実行しない (データファイル・メタデータを読むだけ)。暗号化されたデータは読まない。
// 出力は「自動抽出・未検証」の下書き。人が確認してから apps/game-profiles/ へ入れる (#98)。
//
//   node scripts/profiles/extract.mjs                    # インストール済みの Steam ゲームと Minecraft を調べ、要約を表示する
//   node scripts/profiles/extract.mjs --out <フォルダ>     # 下書きの JSON を書き出す (既定では書き出さない)
//   node scripts/profiles/extract.mjs --only 3241660      # AppID (または minecraft-java) で絞る

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('--out');
const ONLY = opt('--only');
const today = new Date().toISOString().slice(0, 10);

// ---------- キー名 → 出力の ID (apps/host-rs/src/keybinds.rs の name_key と同じ規則) ----------
const NAMED = {
  space: 'SPACE', spacebar: 'SPACE', enter: 'ENTER', return: 'ENTER', escape: 'ESC', esc: 'ESC', tab: 'TAB', backspace: 'BACKSPACE',
  capslock: 'CAPS_LOCK', leftshift: 'LSHIFT', lshift: 'LSHIFT', shift: 'LSHIFT', rightshift: 'RSHIFT', rshift: 'RSHIFT',
  leftcontrol: 'LCTRL', leftctrl: 'LCTRL', lctrl: 'LCTRL', ctrl: 'LCTRL', control: 'LCTRL', rightcontrol: 'RCTRL', rightctrl: 'RCTRL',
  leftalt: 'LALT', lalt: 'LALT', alt: 'LALT', rightalt: 'RALT', up: 'ARROW_UP', uparrow: 'ARROW_UP', down: 'ARROW_DOWN', downarrow: 'ARROW_DOWN',
  left: 'ARROW_LEFT', leftarrow: 'ARROW_LEFT', right: 'ARROW_RIGHT', rightarrow: 'ARROW_RIGHT',
  mouse1: 'MOUSE_L', leftmousebutton: 'MOUSE_L', leftbutton: 'MOUSE_L', mouseleft: 'MOUSE_L', mouse2: 'MOUSE_R', rightmousebutton: 'MOUSE_R', rightbutton: 'MOUSE_R', mouseright: 'MOUSE_R',
  mwheelup: 'WHEEL_UP', mousewheelup: 'WHEEL_UP', wheelup: 'WHEEL_UP', mwheeldown: 'WHEEL_DOWN', mousewheeldown: 'WHEEL_DOWN', wheeldown: 'WHEEL_DOWN',
  insert: 'INSERT', delete: 'DELETE', home: 'HOME', end: 'END', pageup: 'PAGE_UP', pagedown: 'PAGE_DOWN', tilde: 'GRAVE', backquote: 'GRAVE', grave: 'GRAVE',
  minus: 'MINUS', equals: 'EQUAL', equal: 'EQUAL', leftbracket: 'LBRACKET', rightbracket: 'RBRACKET', semicolon: 'SEMICOLON', quote: 'APOSTROPHE', apostrophe: 'APOSTROPHE',
  comma: 'COMMA', period: 'PERIOD', slash: 'SLASH', backslash: 'BACKSLASH',
};
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export function keyId(name) {
  if (!name) return null;
  let n = String(name).trim();
  if (n.startsWith('<Keyboard>/')) n = n.slice(11);
  else if (n === '<Mouse>/leftButton') return 'MOUSE_L';
  else if (n === '<Mouse>/rightButton') return 'MOUSE_R';
  else if (n.startsWith('<')) return null;
  n = n.replace(/[ _-]/g, '').toLowerCase();
  if (n.startsWith('key.keyboard.')) n = n.slice(13).replace(/\./g, '');
  if (n === 'key.mouse.left') return 'MOUSE_L';
  if (n === 'key.mouse.right') return 'MOUSE_R';
  if (NAMED[n]) return NAMED[n];
  const d = n.match(/^(?:alpha|digit|d)?([0-9])$/)?.[1] ?? (WORDS.includes(n) ? String(WORDS.indexOf(n)) : null);
  if (d !== null) return `DIGIT_${d}`;
  if (/^[a-z]$/.test(n)) return `KEY_${n.toUpperCase()}`;
  if (/^f([1-9]|1[0-2])$/.test(n)) return n.toUpperCase();
  return null;
}

// ---------- 操作名 → グループ・分担 (決めきれないものは「未分類」) ----------
const GROUPS = [
  ['communication', /chat|voice|ptt|pushtotalk|talk|mute|deafen|emote|expression|ping|friends|social/i],
  ['menu', /menu|pause|escape|map|settings|option|scoreboard|cancel|confirm|submit|navigate|help|tutorial|leave|spectat|summary/i],
  ['look', /look|camera|mouse ?(x|y|delta)|mousedelta|^aim$|turn|pointer/i],
  ['movement', /^(move|movement|walk|forward|back(ward)?|left|right|up|down|strafe|jump|crouch|sneak|sprint|run|dash|tumble|slide|climb|dodge|roll)/i],
  ['inventory', /inventory|hotbar|slot|item|equip|weapon|drop|swap|quick|hotkey/i],
  ['gameplay', /attack|fire|shoot|use|interact|grab|primary|secondary|tertiary|throw|reload|ability|skill|block|parry|push|pull|rotate|grapple|mouse ?left|mouse ?right|report|action/i],
];
const ROLE = { movement: 'P1', look: 'P2', gameplay: 'P3', inventory: 'P3', menu: 'host', communication: 'none', other: 'none' };
const LABEL = { movement: '移動', look: '視点', gameplay: '攻撃・使う', inventory: '持ち物', menu: 'メニュー', communication: '会話', other: '未分類' };
const groupOf = (name) => (GROUPS.find(([, rx]) => rx.test(name)) || ['other'])[0];

export function draft({ id, name, appid, engine, source, suitability, actions, userBindings }) {
  const used = [...new Set(actions.map((a) => a.group))];
  const groups = used.map((g) => ({ id: g, label: LABEL[g] || g, role: ROLE[g] || 'none' }));
  // 担当の付くグループが少ない (移動だけのゲーム等) ときは、移動を左・右・ジャンプに分けられるようにする
  const roles = new Set(groups.map((g) => g.role).filter((r) => r.startsWith('P')));
  const mv = groups.find((g) => g.id === 'movement');
  if (mv && roles.size < 3) {
    const ids = actions.filter((a) => a.group === 'movement').map((a) => a.id);
    const pick = (rx) => ids.filter((i) => rx.test(i));
    const split = [
      { id: 'left', label: '左', actions: pick(/left/i) },
      { id: 'right', label: '右', actions: pick(/right/i) },
      { id: 'vertical', label: 'ジャンプ・上下', actions: pick(/jump|up|down|forward|back|crouch|climb/i).filter((i) => !/left|right/i.test(i)) },
    ].filter((p) => p.actions.length);
    if (split.length >= 2) mv.split = split;
  }
  return {
    schema: 1, id, name,
    match: { ids: [id], steamAppIds: appid ? [Number(appid)] : [], processes: [], titleContains: null },
    suitability: suitability || 'unknown',
    ...(userBindings ? { userBindings } : {}),
    groups,
    actions: actions.map(({ id: aid, label, group, type, def, bind }) => ({ id: aid, label: label || aid, group, type, ...(def ? { default: def } : {}), ...(bind ? { bind } : {}) })),
    verification: { status: 'extracted', date: today, sources: [`自動抽出（${source}、${engine}）`] },
  };
}

// ---------- Steam: インストール済みのゲームと appinfo.vdf の分類 ----------
function steamPath() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8' });
    return out.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1].trim();
  } catch { return null; }
}
function steamGames(sp) {
  const libs = [sp];
  try {
    const vdf = fs.readFileSync(path.join(sp, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) { const p = m[1].replace(/\\\\/g, '\\'); if (!libs.some((l) => path.resolve(l).toLowerCase() === path.resolve(p).toLowerCase())) libs.push(p); }
  } catch {}
  const games = [];
  for (const lib of libs) {
    let files = [];
    try { files = fs.readdirSync(path.join(lib, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const t = fs.readFileSync(path.join(lib, 'steamapps', f), 'utf8');
      const g = (k) => t.match(new RegExp(`"${k}"\\s+"([^"]*)"`))?.[1];
      games.push({ appid: g('appid'), name: g('name'), dir: path.join(lib, 'steamapps', 'common', g('installdir') || '') });
    }
  }
  return games;
}
// appinfo.vdf (v28/v29) から common の分類を読む
function appinfo(sp, want) {
  const out = {};
  let d;
  try { d = fs.readFileSync(path.join(sp, 'appcache', 'appinfo.vdf')); } catch { return out; }
  const magic = d.readUInt32LE(0); const v29 = magic === 0x07564429; let pos = 8; const strings = [];
  if (v29) {
    const st = Number(d.readBigInt64LE(pos)); pos += 8; const cnt = d.readUInt32LE(st); let q = st + 4;
    for (let i = 0; i < cnt; i++) { const e = d.indexOf(0, q); strings.push(d.toString('utf8', q, e)); q = e + 1; }
  }
  const key = (p) => { if (v29) return [strings[d.readUInt32LE(p)], p + 4]; const e = d.indexOf(0, p); return [d.toString('utf8', p, e), e + 1]; };
  const kv = (p) => {
    const o = {};
    for (;;) {
      const t = d[p++]; if (t === 8) return [o, p];
      let k; [k, p] = key(p);
      if (t === 0) { [o[k], p] = kv(p); } else if (t === 1) { const e = d.indexOf(0, p); o[k] = d.toString('utf8', p, e); p = e + 1; }
      else if (t === 2) { o[k] = d.readInt32LE(p); p += 4; } else if (t === 7) { o[k] = Number(d.readBigUInt64LE(p)); p += 8; } else throw new Error('vdf ' + t);
    }
  };
  while (pos < d.length - 4) {
    const appid = d.readUInt32LE(pos); if (!appid) break;
    const size = d.readUInt32LE(pos + 4); const body = pos + 8 + 4 + 4 + 8 + 20 + 4 + 20;
    if (want.has(String(appid))) { try { const [info] = kv(body); const c = (info.appinfo || info).common || {}; out[appid] = { controller: c.controller_support, categories: Object.keys(c.category || {}).map((k) => Number(k.split('_')[1])) }; } catch {} }
    pos += 8 + size;
  }
  return out;
}
// 9 協力、38 オンライン協力、39 画面共有の協力、44 Remote Play Together、28 コントローラー完全対応
function suitabilityOf(info) {
  if (!info) return 'unknown';
  const c = new Set(info.categories);
  return [9, 38, 39, 44].some((x) => c.has(x)) ? 'good' : c.has(2) ? 'limited' : 'unknown';
}

// ---------- エンジンの見分け ----------
function engineOf(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 'unknown'; }
  const has = (rx) => names.some((n) => rx.test(n));
  if (has(/^UnityPlayer\.dll$/i)) return has(/^GameAssembly\.dll$/i) ? 'unity-il2cpp' : 'unity-mono';
  if (has(/-Shipping\.exe$/i) || has(/^Engine$/)) return 'unreal';
  if (has(/\.pck$/i)) return 'godot';
  if (has(/^data\.win$/i)) return 'gamemaker';
  if (has(/^gameinfo\.txt$/i) || has(/^bin$/) && has(/^platform$/)) return 'source';
  if (has(/Microsoft\.Xna|FNA\.dll|MonoGame/i) || has(/^tModLoader\.dll$/i)) return 'xna-fna';
  return 'unknown';
}
const dataDir = (dir) => { try { const d = fs.readdirSync(dir).find((n) => /_Data$/.test(n)); return d ? path.join(dir, d) : null; } catch { return null; } };

// ---------- Unity Input System: 埋め込まれた .inputactions の JSON ----------
export function unityInputActions(dir) {
  const dd = dataDir(dir); if (!dd) return null;
  const files = [];
  const meta = path.join(dd, 'il2cpp_data', 'Metadata', 'global-metadata.dat');
  if (fs.existsSync(meta)) files.push(meta);
  for (const sub of [dd, path.join(dd, 'Managed')]) { try { for (const f of fs.readdirSync(sub)) if (/\.(assets|dll)$|^globalgamemanagers|^resources/.test(f)) files.push(path.join(sub, f)); } catch {} }
  const assets = [];
  for (const f of files) {
    let d; try { if (fs.statSync(f).size > 300e6) continue; d = fs.readFileSync(f); } catch { continue; }
    const s = d.toString('latin1');
    for (const m of s.matchAll(/\{\s*"version"\s*:\s*\d+,\s*"name"\s*:\s*"[^"]*",\s*"maps"\s*:/g)) {
      let depth = 0, j = m.index;
      for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
      try { const a = JSON.parse(Buffer.from(s.slice(m.index, j + 1), 'latin1').toString('utf8')); if (a.name !== 'DefaultInputActions') assets.push(a); } catch {}
    }
  }
  if (!assets.length) return null;
  const actions = [];
  for (const a of assets) for (const mp of a.maps) for (const ac of mp.actions || []) {
    const bs = (mp.bindings || []).filter((b) => b.action === ac.name);
    const kb = bs.filter((b) => /^<(Keyboard|Mouse)>/.test(b.path || ''));
    const vector = ac.expectedControlType === 'Vector2';
    const mapGroup = /menu|ui/i.test(mp.name) ? 'menu' : null;
    const group = mapGroup || (vector && /look|camera|aim/i.test(ac.name) ? 'look' : vector ? 'movement' : groupOf(ac.name));
    const id = `${mp.name}/${ac.name}`;
    if (actions.some((x) => x.id === id)) continue;
    if (vector) {
      // 2DVector の部分 (up/down/left/right) を別の操作にする
      for (const part of ['up', 'down', 'left', 'right']) {
        const b = kb.find((x) => x.isPartOfComposite && x.name === part);
        if (b) actions.push({ id: `${id}/${part}`, label: `${ac.name} ${part}`, group, type: 'button', def: keyId(b.path), bind: `${id}/${part}` });
      }
      if (group === 'look' || /<(Mouse|Pointer)>\/delta/.test(bs.map((x) => x.path).join())) actions.push({ id, label: ac.name, group: 'look', type: 'mouseDelta' });
    } else {
      actions.push({ id, label: ac.name, group, type: 'button', def: keyId(kb[0]?.path), bind: id });
    }
  }
  return { source: 'Unity Input System の埋め込み定義', actions };
}

// ---------- .NET のメタデータ表から列挙型の名前を読む (コードは実行しない) ----------
function dotnetEnums(file, rx) {
  const d = fs.readFileSync(file);
  const pe = d.readUInt32LE(0x3c); const nsec = d.readUInt16LE(pe + 6); const opt = pe + 24;
  const dd = opt + (d.readUInt16LE(opt) === 0x10b ? 96 : 112); const cliRva = d.readUInt32LE(dd + 14 * 8);
  const optSize = d.readUInt16LE(pe + 20);
  const secs = [...Array(nsec)].map((_, i) => { const o = opt + optSize + i * 40; return { vs: d.readUInt32LE(o + 8), va: d.readUInt32LE(o + 12), rs: d.readUInt32LE(o + 16), raw: d.readUInt32LE(o + 20) }; });
  const off = (rva) => { const s = secs.find((x) => rva >= x.va && rva < x.va + Math.max(x.vs, x.rs)); return rva - s.va + s.raw; };
  const md = off(d.readUInt32LE(off(cliRva) + 8));
  const vlen = d.readUInt32LE(md + 12); let p = md + 16 + vlen + 2; const ns = d.readUInt16LE(p); p += 2; const st = {};
  for (let i = 0; i < ns; i++) { const o = d.readUInt32LE(p), e = d.indexOf(0, p + 8); st[d.toString('ascii', p + 8, e)] = md + o; p = (e + 4) & ~3; }
  const T = st['#~'] ?? st['#-'], S = st['#Strings']; const hs = d[T + 6]; const valid = d.readBigUInt64LE(T + 8); let q = T + 24; const rows = {};
  for (let t = 0; t < 64; t++) if ((valid >> BigInt(t)) & 1n) { rows[t] = d.readUInt32LE(q); q += 4; }
  const si = hs & 1 ? 4 : 2, gi = hs & 2 ? 4 : 2, bi = hs & 4 ? 4 : 2;
  const idx = (t) => ((rows[t] || 0) < 65536 ? 2 : 4);
  const coded = (ts, bits) => (Math.max(...ts.map((t) => rows[t] || 0)) < (1 << (16 - bits)) ? 2 : 4);
  const size = { 0: 2 + si + gi * 3, 1: coded([0, 0x1a, 0x23, 1], 2) + si * 2, 2: 4 + si * 2 + coded([2, 1, 0x1b], 2) + idx(4) + idx(6), 3: idx(4), 4: 2 + si + bi };
  const base = {}; let q2 = q; for (let t = 0; t < 5; t++) { base[t] = q2; q2 += size[t] * (rows[t] || 0); }
  const rd = (o, n) => (n === 2 ? d.readUInt16LE(o) : d.readUInt32LE(o));
  const str = (i) => d.toString('utf8', S + i, d.indexOf(0, S + i));
  const types = [];
  for (let r = 0; r < rows[2]; r++) { let o = base[2] + r * size[2] + 4; const name = str(rd(o, si)); o += si * 2 + coded([2, 1, 0x1b], 2); types.push([name, rd(o, idx(4))]); }
  const out = {};
  types.forEach(([name, fl], i) => {
    if (!rx.test(name)) return;
    const end = i + 1 < types.length ? types[i + 1][1] : rows[4] + 1;
    const fields = []; for (let f = fl; f < end; f++) fields.push(str(rd(base[4] + (f - 1) * size[4] + 2, si)));
    out[name] = fields.filter((f) => f !== 'value__');
  });
  return out;
}

// ---------- 設定ファイル: 「操作名 = キー」の組を探す (補助。誤検出を避けるため設定フォルダだけ) ----------
function configPairs(name) {
  const home = process.env.USERPROFILE;
  const docs = [path.join(home, 'Documents'), path.join(home, 'OneDrive', 'ドキュメント'), path.join(home, 'OneDrive', 'Documents')];
  const roots = [];
  for (const b of [...docs.map((x) => path.join(x, 'My Games')), process.env.APPDATA, process.env.LOCALAPPDATA, path.join(home, 'AppData', 'LocalLow')]) {
    for (const v of new Set([name, name.replace(/\W+/g, ''), name.split(':')[0].trim()])) { roots.push(path.join(b, v)); try { for (const c of fs.readdirSync(b)) roots.push(path.join(b, c, v)); } catch {} }
  }
  const best = [];
  const walk = (dir, depth) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 4 && !/cache|log|locale|lang/i.test(e.name)) walk(p, depth + 1); continue; }
      if (!/\.(json|ini|cfg|txt|xml|es3)$/i.test(e.name) || /licen[cs]e|readme|locale|lang/i.test(e.name)) continue;
      let t; try { if (fs.statSync(p).size > 2e6) continue; t = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const pairs = [...t.matchAll(/"?([A-Za-z][\w .]{1,40}?)"?\s*[:=]\s*\[?\s*"?([A-Za-z0-9<>\/]{1,24})"?\s*[\],}\r\n]/g)]
        .map((m) => [m[1].trim(), keyId(m[2])]).filter(([a, k]) => k && groupOf(a) !== 'other');
      if (pairs.length >= 5) best.push({ file: p, pairs });
    }
  };
  for (const r of new Set(roots)) if (fs.existsSync(r)) walk(r, 0);
  best.sort((a, b) => b.pairs.length - a.pairs.length);
  return best[0] || null;
}

// ---------- Minecraft: jar の Options.class からキーとカテゴリ (グループ) を読む ----------
function zipEntry(file, want) {
  const d = fs.readFileSync(file); let e = d.length - 22;
  while (e >= 0 && d.readUInt32LE(e) !== 0x06054b50) e--;
  let p = d.readUInt32LE(e + 16); const n = d.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = d.readUInt16LE(p + 10), csize = d.readUInt32LE(p + 20), nl = d.readUInt16LE(p + 28), el = d.readUInt16LE(p + 30), cl = d.readUInt16LE(p + 32), lo = d.readUInt32LE(p + 42);
    const name = d.toString('utf8', p + 46, p + 46 + nl);
    if (name === want) { const start = lo + 30 + d.readUInt16LE(lo + 26) + d.readUInt16LE(lo + 28); const raw = d.subarray(start, start + csize); return method === 8 ? zlib.inflateRawSync(raw) : raw; }
    p += 46 + nl + el + cl;
  }
  return null;
}
function minecraftCategories(cls) {
  // 定数表を読み、命令列の ldc (文字列) と getstatic (KeyMapping$Category の定数) の並びからキー → カテゴリを作る
  const d = cls; const n = d.readUInt16LE ? d.readUInt16BE(8) : 0; let i = 10, k = 1; const utf = {}, strs = {}, cls2 = {}, field = {}, nat = {};
  while (k < n) {
    const t = d[i];
    if (t === 1) { const L = d.readUInt16BE(i + 1); utf[k] = d.toString('utf8', i + 3, i + 3 + L); i += 3 + L; }
    else if (t === 8) { strs[k] = d.readUInt16BE(i + 1); i += 3; } else if (t === 7) { cls2[k] = d.readUInt16BE(i + 1); i += 3; }
    else if (t === 16 || t === 19 || t === 20) i += 3; else if (t === 15) i += 4;
    else if (t === 9) { field[k] = [d.readUInt16BE(i + 1), d.readUInt16BE(i + 3)]; i += 5; } else if (t === 12) { nat[k] = [d.readUInt16BE(i + 1), d.readUInt16BE(i + 3)]; i += 5; }
    else if ([3, 4, 10, 11, 17, 18].includes(t)) i += 5; else if (t === 5 || t === 6) { i += 9; k++; } else return {};
    k++;
  }
  const groups = {}; let pending = [];
  for (let j = i; j < d.length - 2; j++) {
    const op = d[j]; let s = null, c = null;
    if (op === 0x12) s = utf[strs[d[j + 1]]]; else if (op === 0x13) s = utf[strs[d.readUInt16BE(j + 1)]];
    else if (op === 0xb2) { const f = field[d.readUInt16BE(j + 1)]; if (f && /Category/.test(utf[cls2[f[0]]] || '')) c = utf[nat[f[1]]?.[0]]; }
    if (s && /^key\.(?!categories)[\w.]+$/.test(s)) pending.push(s);
    else if (c && pending.length) { for (const p of pending) if (!Object.values(groups).flat().includes(p)) (groups[c] ||= []).push(p); pending = []; }
  }
  return groups;
}
function minecraft() {
  const vdir = path.join(process.env.APPDATA, '.minecraft', 'versions');
  let vers = []; try { vers = fs.readdirSync(vdir).filter((v) => fs.existsSync(path.join(vdir, v, v + '.jar'))); } catch { return null; }
  for (const v of vers.reverse()) {
    const cls = zipEntry(path.join(vdir, v, v + '.jar'), 'net/minecraft/client/Options.class');
    if (!cls) continue;
    const cats = minecraftCategories(cls);
    if (!Object.keys(cats).length) continue;
    const map = { MOVEMENT: 'movement', GAMEPLAY: 'gameplay', INVENTORY: 'inventory', MULTIPLAYER: 'communication', MISC: 'menu', CREATIVE: 'other', SPECTATOR: 'other', DEBUG: 'other' };
    const actions = Object.entries(cats).flatMap(([c, keys]) => keys.filter((key) => c !== 'DEBUG').map((key) => ({ id: key.slice(4), label: key, group: map[c] || 'other', type: 'button', bind: key })));
    actions.push({ id: 'look', label: '視点', group: 'look', type: 'mouseDelta' });
    return { version: v, source: `ゲーム本体の Options.class（${v}）`, actions };
  }
  return null;
}

// ---------- 実行 ----------
function main() {
const results = [];
const sp = steamPath();
const games = sp ? steamGames(sp).filter((g) => g.appid !== '228980') : [];
const info = sp ? appinfo(sp, new Set(games.map((g) => g.appid))) : {};
for (const g of games) {
  if (ONLY && ONLY !== g.appid) continue;
  const engine = engineOf(g.dir);
  let found = null;
  if (engine.startsWith('unity')) found = unityInputActions(g.dir);
  if (!found && engine === 'unity-mono') {
    const dll = path.join(dataDir(g.dir) || '', 'Managed', 'Assembly-CSharp.dll');
    try {
      const enums = dotnetEnums(dll, /^(InputKey|InputAction|KeyAction|PlayerAction|GameAction|InputType)$/);
      const [ename, fields] = Object.entries(enums)[0] || [];
      if (fields) found = { source: `.NET の列挙型 ${ename}`, actions: fields.map((f, i) => ({ id: f, label: f, group: groupOf(f), type: /delta|look/i.test(f) ? 'mouseDelta' : /scroll/i.test(f) ? 'wheel' : 'button', bind: String(i) })) };
    } catch {}
  }
  if (!found) {
    const c = configPairs(g.name);
    if (c) found = { source: `設定ファイル ${path.basename(c.file)}`, actions: c.pairs.filter(([a], i, arr) => arr.findIndex(([b]) => b === a) === i).map(([a, k]) => ({ id: a, label: a, group: groupOf(a), type: 'button', def: k, bind: a })) };
  }
  const suit = suitabilityOf(info[g.appid]);
  results.push({ id: `steam:${g.appid}`, name: g.name, engine, suit, controller: info[g.appid]?.controller, found, appid: g.appid });
}
if (!ONLY || ONLY === 'minecraft-java') {
  const mc = minecraft();
  results.push({ id: 'minecraft-java', name: 'Minecraft: Java Edition', engine: 'java', suit: 'good', found: mc });
}
for (const r of results) {
  const n = r.found?.actions.length || 0;
  const groups = r.found ? [...new Set(r.found.actions.map((a) => a.group))].join('・') : '';
  console.log(`${r.id.padEnd(16)} ${r.name.slice(0, 28).padEnd(28)} ${r.engine.padEnd(13)} 向き=${r.suit.padEnd(8)} ${n ? `操作 ${n} 件（${r.found.source}）グループ: ${groups}` : '取れない'}`);
  if (OUT && r.found) {
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, r.id.replace(':', '-') + '.json');
    fs.writeFileSync(file, JSON.stringify(draft({ id: r.id, name: r.name, appid: r.appid, engine: r.engine, source: r.found.source, suitability: r.suit, actions: r.found.actions }), null, 2) + '\n');
  }
}
if (OUT) console.log(`\n下書きを ${OUT} に書き出しました（状態は「自動抽出・未検証」）。人が確認してから apps/game-profiles/ へ入れてください。`);

}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
