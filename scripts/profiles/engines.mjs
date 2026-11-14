// ゲームエンジンごとの操作の読み取り (#481)。ホストの apps/host-rs/src/engines/ と同じ範囲・同じ規則。
// 読むだけで書き換えない。ゲームのコードは実行しない。暗号化されたデータは読まない。
//   - RPGツクール MV・MZ の Input.keyMapper と有効なプラグインの追加、RGSS・2000/2003 の既定のキー (#480)
//   - WOLF RPG エディターの既定のキー (#488)
//   - Source 2 の利用者の .vcfg (#487)
//   - Creation Engine の ControlMap_Custom.txt、Skyrim の既定の割当 (#486)
//   - Quake 系と Source 1 の cfg (#491)
//   - Godot 3・4 の project.binary の InputMap (#485)
//   - Unreal Engine 4・5 の DefaultInput.ini (pak の中) と利用者の Input.ini (#482)
//   - CryEngine の actionmaps (pak = zip の中、#489)
//   - Unity の旧 Input Manager の軸 (#483)
// Unity の PlayerPrefs の上書き (#484) は extract.mjs の unityInputActions で反映する (prefsOverrides)。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const MAX_TEXT = 20e6;

// ---------- 共通 ----------
export function readText(file) {
  try {
    if (fs.statSync(file).size > MAX_TEXT) return null;
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch { return null; }
}
/** 大文字と小文字を区別せずに、子の名前を探す */
export function childCi(dir, name) {
  try {
    const n = fs.readdirSync(dir).find((x) => x.toLowerCase() === name.toLowerCase());
    return n ? path.join(dir, n) : null;
  } catch { return null; }
}
const isDir = (p) => { try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };
const button = (id, label, def, group) => ({ id, label, group: group || 'other', type: 'button', def: def || null, bind: id });
const look = (id, label) => ({ id, label, group: 'look', type: 'mouseDelta' });

// キー名 → 出力 ID (apps/host-rs/src/keybinds.rs の name_key と engines::key_name と同じ規則)
const NAMED = {
  space: 'SPACE', spacebar: 'SPACE', enter: 'ENTER', return: 'ENTER', escape: 'ESC', esc: 'ESC', tab: 'TAB', backspace: 'BACKSPACE',
  capslock: 'CAPS_LOCK', capital: 'CAPS_LOCK', leftshift: 'LSHIFT', lshift: 'LSHIFT', shift: 'LSHIFT', rightshift: 'RSHIFT', rshift: 'RSHIFT',
  leftcontrol: 'LCTRL', leftctrl: 'LCTRL', lctrl: 'LCTRL', ctrl: 'LCTRL', control: 'LCTRL', rightcontrol: 'RCTRL', rightctrl: 'RCTRL', rctrl: 'RCTRL',
  leftalt: 'LALT', lalt: 'LALT', alt: 'LALT', rightalt: 'RALT', ralt: 'RALT',
  up: 'ARROW_UP', uparrow: 'ARROW_UP', down: 'ARROW_DOWN', downarrow: 'ARROW_DOWN', left: 'ARROW_LEFT', leftarrow: 'ARROW_LEFT', right: 'ARROW_RIGHT', rightarrow: 'ARROW_RIGHT',
  mouse1: 'MOUSE_L', leftmousebutton: 'MOUSE_L', leftbutton: 'MOUSE_L', mouseleft: 'MOUSE_L', mouse2: 'MOUSE_R', rightmousebutton: 'MOUSE_R', rightbutton: 'MOUSE_R', mouseright: 'MOUSE_R',
  insert: 'INSERT', ins: 'INSERT', delete: 'DELETE', del: 'DELETE', home: 'HOME', end: 'END', pageup: 'PAGE_UP', pgup: 'PAGE_UP', pagedown: 'PAGE_DOWN', pgdn: 'PAGE_DOWN',
  tilde: 'GRAVE', grave: 'GRAVE', backquote: 'GRAVE', minus: 'MINUS', equals: 'EQUAL', equal: 'EQUAL', leftbracket: 'LBRACKET', rightbracket: 'RBRACKET',
  semicolon: 'SEMICOLON', apostrophe: 'APOSTROPHE', quote: 'APOSTROPHE', comma: 'COMMA', period: 'PERIOD', slash: 'SLASH', backslash: 'BACKSLASH',
};
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export function keyName(name) {
  if (name == null) return null;
  const raw = String(name).trim().toLowerCase();
  // Unity の旧 Input Manager は 0 始まり (mouse 0 = 左)。mouse 2 以降は送れない
  if (raw === 'mouse 0' || raw === 'lmb') return 'MOUSE_L';
  if (raw === 'mouse 1' || raw === 'rmb') return 'MOUSE_R';
  if (raw.startsWith('mouse ')) return null;
  const n = raw.replace(/[ _-]/g, '');
  if (NAMED[n]) return NAMED[n];
  const d = n.match(/^(?:alpha|digit|d)?([0-9])$/)?.[1] ?? (WORDS.includes(n) ? String(WORDS.indexOf(n)) : null);
  if (d !== null) return `DIGIT_${d}`;
  if (/^[a-z]$/.test(n)) return `KEY_${n.toUpperCase()}`;
  if (/^f([1-9]|1[0-2])$/.test(n)) return n.toUpperCase();
  return null;
}
/** 仮想キーコード (keyCode) → 出力 ID */
export function vkKey(code) {
  const named = { 8: 'BACKSPACE', 9: 'TAB', 13: 'ENTER', 16: 'LSHIFT', 17: 'LCTRL', 18: 'LALT', 20: 'CAPS_LOCK', 27: 'ESC', 32: 'SPACE', 33: 'PAGE_UP', 34: 'PAGE_DOWN', 35: 'END', 36: 'HOME', 37: 'ARROW_LEFT', 38: 'ARROW_UP', 39: 'ARROW_RIGHT', 40: 'ARROW_DOWN', 45: 'INSERT', 46: 'DELETE' };
  if (named[code]) return named[code];
  if (code >= 48 && code <= 57) return `DIGIT_${code - 48}`;
  if (code >= 65 && code <= 90) return `KEY_${String.fromCharCode(code)}`;
  if (code >= 112 && code <= 123) return `F${code - 111}`;
  return null;
}
// DirectInput のキーコード → 出力 ID (apps/host-rs/src/controls.rs のスキャンコードと同じ。0x80 以上は拡張キー)
const SCAN = {
  0x01: 'ESC', 0x0e: 'BACKSPACE', 0x0f: 'TAB', 0x1c: 'ENTER', 0x1d: 'LCTRL', 0x2a: 'LSHIFT', 0x36: 'RSHIFT', 0x38: 'LALT', 0x39: 'SPACE', 0x3a: 'CAPS_LOCK',
  0x29: 'GRAVE', 0x0c: 'MINUS', 0x0d: 'EQUAL', 0x1a: 'LBRACKET', 0x1b: 'RBRACKET', 0x27: 'SEMICOLON', 0x28: 'APOSTROPHE', 0x33: 'COMMA', 0x34: 'PERIOD', 0x35: 'SLASH', 0x2b: 'BACKSLASH',
  0x9d: 'RCTRL', 0xb8: 'RALT', 0xc8: 'ARROW_UP', 0xd0: 'ARROW_DOWN', 0xcb: 'ARROW_LEFT', 0xcd: 'ARROW_RIGHT', 0xd2: 'INSERT', 0xd3: 'DELETE', 0xc7: 'HOME', 0xcf: 'END', 0xc9: 'PAGE_UP', 0xd1: 'PAGE_DOWN',
  0x3b: 'F1', 0x3c: 'F2', 0x3d: 'F3', 0x3e: 'F4', 0x3f: 'F5', 0x40: 'F6', 0x41: 'F7', 0x42: 'F8', 0x43: 'F9', 0x44: 'F10', 0x57: 'F11', 0x58: 'F12',
};
'1234567890'.split('').forEach((d, i) => { SCAN[0x02 + i] = `DIGIT_${d}`; });
'QWERTYUIOP'.split('').forEach((c, i) => { SCAN[0x10 + i] = `KEY_${c}`; });
'ASDFGHJKL'.split('').forEach((c, i) => { SCAN[0x1e + i] = `KEY_${c}`; });
'ZXCVBNM'.split('').forEach((c, i) => { SCAN[0x2c + i] = `KEY_${c}`; });
export const dikKey = (code) => SCAN[code] || null;

// ---------- RPGツクール ----------
const RM_LABEL = { ok: '決定', escape: 'キャンセル・メニュー', cancel: 'キャンセル・メニュー', menu: 'キャンセル・メニュー', shift: 'ダッシュ', pageup: '前のページ', pagedown: '次のページ', up: '上へ移動', down: '下へ移動', left: '左へ移動', right: '右へ移動' };
const RM_SKIP = new Set(['control', 'debug', 'tab']);
const quotedSym = (v) => v.trim().match(/^['"]([A-Za-z0-9_]+)['"]/)?.[1] || null;
export function keyMapper(text) {
  const start = text.search(/Input\.keyMapper\s*=\s*\{/);
  if (start < 0) return [];
  const open = text.indexOf('{', start), close = text.indexOf('}', open);
  if (close < 0) return [];
  const out = [];
  for (const raw of text.slice(open + 1, close).split(/[,\n]/)) {
    const line = raw.split('//')[0];
    const i = line.indexOf(':');
    if (i < 0) continue;
    const code = Number(line.slice(0, i).trim()), sym = quotedSym(line.slice(i + 1));
    if (Number.isInteger(code) && line.slice(0, i).trim() !== '' && sym) out.push([code, sym]);
  }
  return out;
}
export function enabledPlugins(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s < 0 || e < s) return [];
  try { return JSON.parse(text.slice(s, e + 1)).filter((p) => p.status === true && typeof p.name === 'string').map((p) => p.name); } catch { return []; }
}
export function mapperAssignments(text) {
  const out = [];
  for (const m of text.matchAll(/keyMapper\[\s*(\d+)\s*\]\s*=(?!=)\s*(['"][A-Za-z0-9_]+['"])/g)) out.push([Number(m[1]), quotedSym(m[2])]);
  return out;
}
export function actionsFromMapper(mapper) {
  const out = [];
  for (const [code, sym] of mapper) {
    if (RM_SKIP.has(sym)) continue;
    const id = `rpgmaker/${sym}`, key = vkKey(code);
    const a = out.find((x) => x.id === id);
    if (a) { if (!a.def) a.def = key; } else out.push(button(id, RM_LABEL[sym] || sym, key));
  }
  return out;
}
const rmMoves = () => [['up', '上へ移動', 'ARROW_UP'], ['down', '下へ移動', 'ARROW_DOWN'], ['left', '左へ移動', 'ARROW_LEFT'], ['right', '右へ移動', 'ARROW_RIGHT']].map(([i, l, k]) => button(`rpgmaker/${i}`, l, k));
export function rgssActions(version) {
  return [...rmMoves(), button('rpgmaker/ok', '決定', 'ENTER'), button('rpgmaker/escape', 'キャンセル・メニュー', 'ESC'),
    button('rpgmaker/shift', version >= 2 ? 'ダッシュ' : 'A ボタン', 'LSHIFT'), button('rpgmaker/pageup', '前のページ', 'KEY_Q'), button('rpgmaker/pagedown', '次のページ', 'KEY_W')];
}
export const rpg2kActions = () => [...rmMoves(), button('rpgmaker/ok', '決定', 'ENTER'), button('rpgmaker/escape', 'キャンセル・メニュー', 'ESC')];
export function rpgmaker(dir) {
  for (const base of [path.join(dir, 'www'), dir]) {
    const js = path.join(base, 'js');
    const core = isFile(path.join(js, 'rmmz_core.js')) ? ['rmmz_core.js', 'RPGツクール MZ の Input.keyMapper'] : isFile(path.join(js, 'rpg_core.js')) ? ['rpg_core.js', 'RPGツクール MV の Input.keyMapper'] : null;
    if (!core) continue;
    const text = readText(path.join(js, core[0]));
    let mapper = text ? keyMapper(text) : [];
    if (!mapper.length) return null;
    for (const name of enabledPlugins(readText(path.join(js, 'plugins.js')) || '')) {
      if (/[\\/]|\.\./.test(name)) continue;
      for (const [code, sym] of mapperAssignments(readText(path.join(js, 'plugins', `${name}.js`)) || '')) {
        mapper = mapper.filter(([c]) => c !== code); mapper.push([code, sym]);
      }
    }
    return { source: core[1], actions: actionsFromMapper(mapper) };
  }
  const ini = childCi(dir, 'Game.ini');
  const lib = ini && (readText(ini) || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('Library='));
  const v = lib?.toLowerCase().match(/rgss(\d)/)?.[1];
  if (v) return { source: 'RPGツクール（RGSS）の既定のキー', actions: rgssActions(Number(v)) };
  if (childCi(dir, 'RPG_RT.exe') || childCi(dir, 'RPG_RT.ini')) return { source: 'RPGツクール 2000/2003 の既定のキー', actions: rpg2kActions() };
  return null;
}

// ---------- ウディタ ----------
export function wolf(dir) {
  if (!childCi(dir, 'Game.exe')) return null;
  const data = childCi(dir, 'Data');
  if (!childCi(dir, 'Data.wolf') && !(data && isDir(childCi(data, 'BasicData')))) return null;
  return { source: 'WOLF RPG エディターの既定のキー', actions: [
    button('wolf/up', '上へ移動', 'ARROW_UP'), button('wolf/down', '下へ移動', 'ARROW_DOWN'), button('wolf/left', '左へ移動', 'ARROW_LEFT'), button('wolf/right', '右へ移動', 'ARROW_RIGHT'),
    button('wolf/ok', '決定', 'KEY_Z'), button('wolf/cancel', 'キャンセル・メニュー', 'KEY_X'), button('wolf/sub', 'サブキー（ダッシュなど）', 'LSHIFT'),
  ] };
}

// ---------- Quake 系・Source 1・Source 2 の命令 ----------
const CMD_LABEL = {
  '+forward': '前進', '+back': '後退', '+moveleft': '左へ移動', '+moveright': '右へ移動', '+left': '左を向く', '+right': '右を向く', '+jump': 'ジャンプ', '+moveup': 'ジャンプ',
  '+duck': 'しゃがむ', '+movedown': 'しゃがむ', '+speed': '走る', '+sprint': '走る', '+walk': '歩く', '+attack': '攻撃', '+attack2': '攻撃2・狙う', '+attack3': '攻撃3',
  '+reload': 'リロード', '+use': '使う・調べる', '+activate': '使う・調べる', '+zoom': 'ズーム', invnext: '次の武器', weapnext: '次の武器', invprev: '前の武器', weapprev: '前の武器',
  lastinv: '直前の武器', drop: '捨てる', phys_swap: '物理ガン', 'impulse 100': 'ライト', 'impulse 201': 'スプレー', '+lookatweapon': '武器を見る', '+inspect': '調べる', buymenu: '購入メニュー',
};
const CMD_SKIP = new Set(['+showscores', '+score', '+voicerecord', 'toggleconsole', 'screenshot', 'jpeg', 'messagemode', 'messagemode2', 'pause', 'quit', 'save quick', 'load quick', 'cancelselect', '+graph']);
const CMD_ORDER = ['+forward', '+back', '+moveleft', '+moveright', '+jump', '+duck', '+speed', '+sprint', '+walk', '+attack', '+attack2', '+reload'];
export function commandLabel(cmd) {
  const c = cmd.trim().toLowerCase();
  const slot = c.match(/^slot(\d+)$/);
  if (slot) return `武器・持ち物 ${slot[1]}`;
  if (CMD_SKIP.has(c)) return null;
  if (CMD_LABEL[c]) return CMD_LABEL[c];
  return c.startsWith('+') ? cmd : null;
}
const groupOfCmd = (c) => /^\+(forward|back|move|jump|duck|speed|sprint|walk)/.test(c) ? 'movement' : /slot|inv|weap|drop/.test(c) ? 'inventory' : 'action';
export function actionsFromBindings(binds, prefix) {
  const ord = (c) => { const i = CMD_ORDER.indexOf(c.toLowerCase()); return i < 0 ? CMD_ORDER.length : i; };
  const sorted = [...binds].sort((a, b) => ord(a[0]) - ord(b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = [];
  for (const [cmd, key] of sorted) {
    const label = commandLabel(cmd);
    if (!label) continue;
    const id = `${prefix}/${cmd.toLowerCase()}`;
    if (!out.some((a) => a.id === id)) out.push(button(id, label, key, groupOfCmd(cmd.toLowerCase())));
  }
  if (out.some((a) => a.id.endsWith('/+forward') || a.id.endsWith('/+moveleft'))) out.push(look(`${prefix}/look`, '視点'));
  return out;
}
/** cfg の bind / unbind / unbindall を、keybinds.rs の source_cfg と同じ規則で (命令 → キー) にする */
export function cfgBindings(text) {
  const commands = [];
  let parts = [], token = '', quoted = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/' && !quoted) {
      while (i < text.length && text[i] !== '\n') i++;
      if (started) { parts.push(token); token = ''; started = false; }
      commands.push(parts); parts = []; continue;
    }
    if (c === '"') { quoted = !quoted; started = true; } else if (!quoted && (/\s/.test(c) || c === ';')) {
      if (started) { parts.push(token); token = ''; started = false; }
      if (c === ';' || c === '\n') { commands.push(parts); parts = []; }
    } else { token += c; started = true; }
  }
  if (started) parts.push(token);
  commands.push(parts);
  const bound = new Map();
  for (const p of commands) {
    if (p[0] === 'bind' && p.length >= 3) { if (p[2] === '') bound.delete(p[1].toLowerCase()); else bound.set(p[1].toLowerCase(), p[2]); }
    else if (p[0] === 'unbind' && p.length >= 2) bound.delete(p[1].toLowerCase());
    else if (p[0] === 'unbindall') bound.clear();
  }
  const byCmd = new Map();
  for (const [key, cmd] of [...bound].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // keybinds.rs と同じく、命令ごとにキー名の順で最初のキーを使う (送れないキーなら、その命令は出さない)
    if (!byCmd.has(cmd)) byCmd.set(cmd, keyName(key));
  }
  return [...byCmd].filter(([, k]) => k);
}
export function quake(dir) {
  for (const [sub, file, source] of [['id1', 'config.cfg', 'Quake の config.cfg'], ['baseq2', 'config.cfg', 'Quake II の config.cfg'], ['baseq3', 'q3config.cfg', 'Quake III の q3config.cfg']]) {
    const d = childCi(dir, sub), f = d && childCi(d, file);
    if (f) { const a = actionsFromBindings(cfgBindings(readText(f) || ''), 'cfg'); return a.length ? { source, actions: a } : null; }
  }
  let mods = [];
  try { mods = fs.readdirSync(dir).map((n) => path.join(dir, n)).filter((p) => isDir(p) && childCi(p, 'gameinfo.txt')).sort(); } catch {}
  for (const m of mods) {
    const c = childCi(m, 'cfg'), f = c && childCi(c, 'config.cfg');
    if (f) { const a = actionsFromBindings(cfgBindings(readText(f) || ''), 'cfg'); return a.length ? { source: 'Source の config.cfg', actions: a } : null; }
  }
  return null;
}
function kvTokens(text) {
  const out = [];
  for (const m of text.replace(/\/\/[^\n]*/g, '').matchAll(/"([^"]*)"|([{}])|([^\s"{}]+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
export function vcfgBindings(text) {
  const t = kvTokens(text);
  const s = t.findIndex((x, i) => x.toLowerCase() === 'bindings' && t[i + 1] === '{');
  if (s < 0) return [];
  const out = [];
  for (let i = s + 2; i + 1 < t.length && t[i] !== '}';) {
    if (t[i + 1] === '{') { let depth = 0; for (; i < t.length; i++) { if (t[i] === '{') depth++; else if (t[i] === '}' && --depth === 0) break; } i++; continue; }
    out.push([t[i], t[i + 1]]); i += 2;
  }
  return out;
}
export function actionsFromVcfg(text) {
  const binds = [];
  for (const [key, raw] of vcfgBindings(text)) {
    let cmd = raw.split(';')[0].trim();
    if (!cmd) continue;
    // CS2 の +left・+right は横移動
    cmd = { '+left': '+moveleft', '+right': '+moveright' }[cmd.toLowerCase()] || cmd;
    const k = keyName(key);
    const b = binds.find(([c]) => c.toLowerCase() === cmd.toLowerCase());
    if (b) { if (!b[1]) b[1] = k; } else binds.push([cmd, k]);
  }
  return actionsFromBindings(binds, 'source2');
}
export function source2(dir) {
  if (!isDir(path.join(dir, 'game', 'bin', 'win64'))) return null;
  const steamapps = path.dirname(path.dirname(dir)), install = path.basename(dir).toLowerCase();
  let appId = null;
  try {
    for (const n of fs.readdirSync(steamapps)) {
      const m = n.match(/^appmanifest_(\d+)\.acf$/); if (!m) continue;
      const t = kvTokens(readText(path.join(steamapps, n)) || '');
      const i = t.findIndex((x) => x.toLowerCase() === 'installdir');
      if (i >= 0 && (t[i + 1] || '').toLowerCase() === install) { appId = m[1]; break; }
    }
  } catch {}
  if (!appId) return null;
  let best = null;
  try {
    const ud = path.join(path.dirname(steamapps), 'userdata');
    for (const u of fs.readdirSync(ud)) {
      const cfg = path.join(ud, u, appId, 'local', 'cfg');
      let names = []; try { names = fs.readdirSync(cfg); } catch { continue; }
      for (const n of names) if (/keys.*\.vcfg$/i.test(n) || /\.vcfg$/i.test(n) && /keys/i.test(n)) {
        const f = path.join(cfg, n), t = fs.statSync(f).mtimeMs;
        if (!best || t > best.t) best = { f, t };
      }
    }
  } catch {}
  if (!best) return null;
  const a = actionsFromVcfg(readText(best.f) || '');
  return a.length ? { source: 'Source 2 の利用者のキー設定（.vcfg）', actions: a } : null;
}

// ---------- Creation Engine ----------
const CE_LABEL = {
  Forward: '前進', Back: '後退', 'Strafe Left': '左へ移動', 'Strafe Right': '右へ移動', 'Left Attack/Block': '左手・防御', 'Right Attack/Block': '右手・攻撃', 'Primary Attack': '攻撃', 'Secondary Attack': '狙う・防御',
  Activate: '使う・調べる', 'Ready Weapon': '武器を構える', 'Tween Menu': 'メニュー', 'Toggle POV': '視点の切り替え', Jump: 'ジャンプ', Sprint: '走る', Shout: 'シャウト', Sneak: 'しゃがむ・隠れる',
  Run: '走る・歩くの切り替え', 'Auto-Move': '自動で進む', Favorites: 'お気に入り', Wait: '待機', 'Quick Inventory': '持ち物', 'Quick Magic': '魔法', 'Quick Stats': 'スキル', 'Quick Map': '地図',
  Reload: 'リロード', VATS: 'V.A.T.S.', Pipboy: 'Pip-Boy', Grenade: '投げる', Throw: '投げる', Melee: '近接攻撃', Bash: '近接攻撃',
};
for (let i = 1; i <= 8; i++) CE_LABEL[`Hotkey${i}`] = 'ホットキー';
const firstCode = (field) => (field || '').split(',').map((v) => parseInt(v.trim().replace(/^0x/i, ''), 16)).find((v) => Number.isFinite(v) && v !== 0xff && v !== 0xffffffff);
export function actionsFromControlMap(text) {
  const out = [];
  let started = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('//')) { if (started) break; continue; }
    started = true;
    const cols = raw.split('\t').filter(Boolean);
    const name = (cols[0] || '').trim(), label = CE_LABEL[name];
    if (!label) continue;
    const kb = firstCode(cols[1]), ms = firstCode(cols[2]);
    const key = (kb != null && dikKey(kb)) || (ms === 0 ? 'MOUSE_L' : ms === 1 ? 'MOUSE_R' : null);
    const id = `creation/${name}`;
    if (!out.some((a) => a.id === id)) out.push(button(id, label, key));
  }
  if (out.length) out.push(look('creation/look', '視点'));
  return out;
}
export const skyrimDefaults = () => [
  ['Forward', '前進', 'KEY_W'], ['Back', '後退', 'KEY_S'], ['Strafe Left', '左へ移動', 'KEY_A'], ['Strafe Right', '右へ移動', 'KEY_D'], ['Right Attack/Block', '右手・攻撃', 'MOUSE_L'],
  ['Left Attack/Block', '左手・防御', 'MOUSE_R'], ['Activate', '使う・調べる', 'KEY_E'], ['Ready Weapon', '武器を構える', 'KEY_R'], ['Jump', 'ジャンプ', 'SPACE'], ['Sprint', '走る', 'LALT'],
  ['Sneak', 'しゃがむ・隠れる', 'LCTRL'], ['Shout', 'シャウト', 'KEY_Z'], ['Tween Menu', 'メニュー', 'TAB'], ['Favorites', 'お気に入り', 'KEY_Q'], ['Toggle POV', '視点の切り替え', 'KEY_F'], ['Wait', '待機', 'KEY_T'],
].map(([i, l, k]) => button(`creation/${i}`, l, k)).concat([look('creation/look', '視点')]);
export function creation(dir, documents = path.join(os.homedir(), 'Documents')) {
  const data = childCi(dir, 'Data') || dir;
  const hasEsm = (d) => { try { return fs.readdirSync(d).some((n) => /\.esm$/i.test(n)); } catch { return false; } };
  if (!hasEsm(data) && !hasEsm(dir)) return null;
  const game = childCi(dir, 'SkyrimSE.exe') ? 'Skyrim Special Edition' : childCi(dir, 'Fallout4.exe') ? 'Fallout4' : childCi(dir, 'Starfield.exe') ? 'Starfield' : null;
  if (!game) return null;
  const text = readText(path.join(documents, 'My Games', game, 'ControlMap_Custom.txt'));
  const a = text ? actionsFromControlMap(text) : [];
  if (a.length) return { source: 'Creation Engine の ControlMap_Custom.txt', actions: a };
  return game === 'Skyrim Special Edition' ? { source: 'Skyrim の既定の割当', actions: skyrimDefaults() } : null;
}

// ---------- zip (CryEngine の pak など。保存と Deflate だけ、暗号化は読まない) ----------
export function zipEntries(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdOffset = b.readUInt32LE(eocd + 16);
  const cd = eocd - cdSize, base = cd - cdOffset;
  if (cd < 0 || base < 0) return [];
  const out = [];
  for (let i = 0, o = cd; i < count && o + 46 <= b.length && b.readUInt32LE(o) === 0x02014b50; i++) {
    const nlen = b.readUInt16LE(o + 28), xlen = b.readUInt16LE(o + 30), clen = b.readUInt16LE(o + 32);
    out.push({ name: b.subarray(o + 46, o + 46 + nlen).toString('utf8').replace(/\\/g, '/'), flags: b.readUInt16LE(o + 8), method: b.readUInt16LE(o + 10),
      compressed: b.readUInt32LE(o + 20), size: b.readUInt32LE(o + 24), local: base + b.readUInt32LE(o + 42) });
    o += 46 + nlen + xlen + clen;
  }
  return out;
}
export function zipRead(b, e) {
  if (e.flags & 1 || e.size > 16 * 1024 * 1024 || e.local + 30 > b.length || b.readUInt32LE(e.local) !== 0x04034b50) return null;
  const at = e.local + 30 + b.readUInt16LE(e.local + 26) + b.readUInt16LE(e.local + 28);
  const data = b.subarray(at, at + e.compressed);
  try { return e.method === 0 ? Buffer.from(data) : e.method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 16 * 1024 * 1024 }) : null; } catch { return null; }
}

// ---------- Godot ----------
export function godotKey(code) {
  const special = code & (1 << 24) ? code - (1 << 24) : code & (1 << 22) ? code - (1 << 22) : null;
  if (special !== null) {
    const names = { 0x01: 'escape', 0x02: 'tab', 0x04: 'backspace', 0x05: 'enter', 0x07: 'insert', 0x08: 'delete', 0x0d: 'home', 0x0e: 'end', 0x0f: 'left', 0x10: 'up', 0x11: 'right', 0x12: 'down', 0x13: 'pageup', 0x14: 'pagedown', 0x15: 'shift', 0x16: 'ctrl', 0x18: 'alt', 0x19: 'capslock' };
    if (special >= 0x1c && special <= 0x27) return keyName(`f${special - 0x1b}`);
    return names[special] ? keyName(names[special]) : null;
  }
  const punct = { 32: 'space', 39: 'apostrophe', 44: 'comma', 45: 'minus', 46: 'period', 47: 'slash', 59: 'semicolon', 61: 'equals', 91: 'leftbracket', 92: 'backslash', 93: 'rightbracket', 96: 'grave' };
  if (punct[code]) return keyName(punct[code]);
  if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return keyName(String.fromCharCode(code).toLowerCase());
  return null;
}
export function godotProjectEntries(b) {
  for (let pos = b.indexOf('ECFG'); pos >= 0; pos = b.indexOf('ECFG', pos + 4)) {
    if (pos + 8 > b.length) break;
    const count = b.readUInt32LE(pos + 4);
    if (!count || count > 100000) continue;
    let o = pos + 8; const out = []; let ok = true;
    for (let i = 0; i < count; i++) {
      if (o + 4 > b.length) { ok = false; break; }
      const kl = b.readUInt32LE(o); if (!kl || kl > 1024 || o + 4 + kl + 4 > b.length) { ok = false; break; }
      const key = b.subarray(o + 4, o + 4 + kl).toString('utf8'); o += 4 + kl;
      const vl = b.readUInt32LE(o); if (o + 4 + vl > b.length) { ok = false; break; }
      out.push([key, b.subarray(o + 4, o + 4 + vl)]); o += 4 + vl;
    }
    if (ok && out.some(([k]) => k.includes('/'))) return out;
  }
  return [];
}
function intAfter(v, at, name) {
  if (at < 4 || v.readUInt32LE(at - 4) !== name.length) return null;
  const after = (at + name.length + 3) & ~3;
  if (after + 8 > v.length) return null;
  const h = v.readUInt32LE(after);
  if ((h & 0xffff) !== 2) return null;
  if (h & (1 << 16)) return after + 12 <= v.length ? Number(v.readBigInt64LE(after + 4)) : null;
  return v.readInt32LE(after + 4);
}
const findAll = (hay, needle) => { const out = []; for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i); return out; };
export function godotEvents(v) {
  const marks = [];
  for (const cls of ['InputEventKey', 'InputEventMouseButton', 'InputEventJoypadButton', 'InputEventJoypadMotion']) {
    for (const at of findAll(v, cls)) { const next = v[at + cls.length]; if (next !== undefined && /[A-Za-z]/.test(String.fromCharCode(next))) continue; marks.push([at, cls]); }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  marks.forEach(([at, cls], i) => {
    const end = i + 1 < marks.length ? marks[i + 1][0] : v.length;
    const seg = v.subarray(0, end);
    const prop = (name) => { for (const p of findAll(seg.subarray(at), name)) { const x = intAfter(seg, at + p, name); if (x !== null) return x || null; } return null; };
    if (cls === 'InputEventKey') { const c = prop('physical_keycode') ?? prop('keycode') ?? prop('physical_scancode') ?? prop('scancode'); out.push(c ? godotKey(c) : null); }
    else if (cls === 'InputEventMouseButton') { const bi = prop('button_index'); out.push(bi === 1 ? 'MOUSE_L' : bi === 2 ? 'MOUSE_R' : null); }
  });
  return out;
}
export function actionsFromGodotProject(b) {
  const out = [];
  for (const [key, value] of godotProjectEntries(b)) {
    if (!key.startsWith('input/')) continue;
    const name = key.slice(6);
    if (!name || name.startsWith('ui_')) continue;
    const evs = godotEvents(value);
    if (!evs.length) continue;
    out.push(button(`godot/${name}`, name.replace(/_/g, ' '), evs.find(Boolean) || null));
  }
  return out;
}
function pckMarker(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0); if (buf.toString('latin1') === 'GDPC') return true;
    if (size >= 4) { fs.readSync(fd, buf, 0, 4, size - 4); return buf.toString('latin1') === 'GDPC'; }
    return false;
  } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function godot(dir) {
  let names = []; try { names = fs.readdirSync(dir).sort(); } catch { return null; }
  const pcks = names.filter((n) => /\.pck$/i.test(n)), exes = names.filter((n) => /\.exe$/i.test(n));
  for (const n of pcks.length ? pcks : exes) {
    const f = path.join(dir, n);
    try { if (fs.statSync(f).size > 300e6 || !pckMarker(f)) continue; } catch { continue; }
    const a = actionsFromGodotProject(fs.readFileSync(f));
    if (a.length) return { source: 'Godot の project.binary の InputMap', actions: a };
  }
  return null;
}

// ---------- Unreal Engine ----------
/** keybinds.rs の ue_input_ini と同じ規則で、ActionMappings・AxisMappings を (名前 → キー) にする */
export function ueInputIni(text) {
  const map = new Map(); let active = [];
  const field = (line, k) => { const i = line.indexOf(`${k}=`); if (i < 0) return null; return line.slice(i + k.length + 1).replace(/^"/, '').match(/^[^",)]*/)[0]; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), op = line[0] || ' ', l = line.replace(/^[+\-.!]+/, '');
    const eq = l.indexOf('='); if (eq < 0) continue;
    const array = l.slice(0, eq), row = l.slice(eq + 1);
    if (array !== 'ActionMappings' && array !== 'AxisMappings') continue;
    if (op === '!') { active = active.filter((a) => a.array !== array); map.set(`${array}/*`, 'unbound'); continue; }
    const key = field(l, 'Key'); if (key === null || /^(Gamepad|MotionController)/.test(key)) continue;
    let name = null;
    if (array === 'ActionMappings') name = field(l, 'ActionName');
    else { const sc = parseFloat(field(l, 'Scale') ?? '1'); const an = field(l, 'AxisName'); name = an === null ? null : `${an}/${(Number.isFinite(sc) ? sc : 1) < 0 ? '-' : '+'}`; }
    if (name === null) continue;
    map.set(name, 'unbound');
    if (op === '-') { active = active.filter((a) => a.array !== array || a.row !== row); continue; }
    if (op !== '+' && op !== '.') { active = active.filter((a) => a.array !== array); map.set(`${array}/*`, 'unbound'); }
    const modified = ['bShift', 'bCtrl', 'bAlt', 'bCmd'].some((f) => (field(l, f) || '').toLowerCase() === 'true');
    const out = modified ? { unsupported: `修飾キー付きの${key}` } : keyName(key) ? { key: keyName(key) } : { unsupported: key };
    if (op !== '+' || !active.some((a) => a.array === array && a.row === row)) active.push({ array, row, name, out });
  }
  for (const a of active) if (map.get(a.name) === 'unbound') map.set(a.name, a.out);
  return map;
}
function axisLabel(name) {
  const i = name.lastIndexOf('/'); if (i < 0) return name;
  const axis = name.slice(0, i), sign = name.slice(i + 1), l = axis.toLowerCase();
  const [minus, plus] = l.includes('forward') ? ['back', 'forward'] : l.includes('right') ? ['left', 'right'] : l.includes('up') ? ['down', 'up'] : ['negative', 'positive'];
  return `${axis} ${sign === '-' ? minus : plus}`;
}
export function actionsFromUeIni(text) {
  const map = ueInputIni(text), out = []; let hasLook = false;
  for (const name of [...map.keys()].filter((k) => !k.endsWith('/*')).sort()) {
    const v = map.get(name);
    if (v?.key) out.push(button(`unreal/${name}`, axisLabel(name), v.key));
    else if (v?.unsupported && /^mouse[xy]$/i.test(v.unsupported)) hasLook = true;
  }
  if (hasLook) out.push(look('unreal/look', '視点'));
  return out;
}
function ueSection(file) {
  const SECTION = Buffer.from('[/Script/Engine.InputSettings]');
  let fd;
  try {
    if (fs.statSync(file).size > 1.5e9) return null;
    fd = fs.openSync(file, 'r');
    const chunk = Buffer.alloc(8 * 1024 * 1024); let carry = Buffer.alloc(0), pos = 0;
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos); if (!n) return null; pos += n;
      carry = Buffer.concat([carry, chunk.subarray(0, n)]);
      const at = carry.indexOf(SECTION);
      if (at >= 0) {
        while (carry.length < at + 65536) { const m = fs.readSync(fd, chunk, 0, chunk.length, pos); if (!m) break; pos += m; carry = Buffer.concat([carry, chunk.subarray(0, m)]); }
        const lines = []; let first = true;
        for (const line of carry.subarray(at, at + 65536).toString('utf8').split('\n')) {
          const l = line.replace(/\r$/, '');
          if ((!first && l.startsWith('[')) || l.includes('\0')) break;
          lines.push(l); first = false;
        }
        return lines.join('\n') + '\n';
      }
      carry = carry.subarray(Math.max(0, carry.length - SECTION.length));
    }
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function unreal(dir, localAppData = process.env.LOCALAPPDATA) {
  let project = null;
  try { project = fs.readdirSync(dir).sort().map((n) => path.join(dir, n)).find((p) => path.basename(p) !== 'Engine' && isDir(path.join(p, 'Binaries', 'Win64')) && isDir(path.join(p, 'Content', 'Paks'))); } catch {}
  if (!project) return null;
  let defaults = null;
  try {
    const paks = fs.readdirSync(path.join(project, 'Content', 'Paks')).filter((n) => /\.pak$/i.test(n))
      .sort((a, b) => (/chunk0/i.test(a) ? 0 : 1) - (/chunk0/i.test(b) ? 0 : 1) || (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
    for (const p of paks) { defaults = ueSection(path.join(project, 'Content', 'Paks', p)); if (defaults) break; }
  } catch {}
  let user = null;
  if (localAppData) for (const plat of ['Windows', 'WindowsNoEditor']) {
    const t = readText(path.join(localAppData, path.basename(project), 'Saved', 'Config', plat, 'Input.ini'));
    if (t && t.includes('Mappings')) { user = t; break; }
  }
  if (!defaults && !user) return null;
  const a = actionsFromUeIni(`${defaults || ''}\n${user || ''}`);
  const source = defaults && user ? 'Unreal Engine の DefaultInput.ini と利用者の Input.ini' : defaults ? 'Unreal Engine の DefaultInput.ini（pak の中）' : 'Unreal Engine の利用者の Input.ini';
  return a.length ? { source, actions: a } : null;
}

// ---------- CryEngine ----------
const xmlAttr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`))?.[2] ?? null;
const cryKey = (n) => ({ lshift: 'LSHIFT', rshift: 'RSHIFT', lctrl: 'LCTRL', rctrl: 'RCTRL', lalt: 'LALT', ralt: 'RALT', enter: 'ENTER', np_enter: 'ENTER' })[n.trim().toLowerCase()] || keyName(n);
export function actionsFromCryXml(xml) {
  const out = []; let hasLook = false;
  const re = /<action\b([^>]*)>/g; let m;
  while ((m = re.exec(xml))) {
    const tag = m[1];
    const name = xmlAttr(tag, 'name'); if (!name) continue;
    let kb = xmlAttr(tag, 'keyboard');
    if (kb === null && !tag.trim().endsWith('/')) {
      const close = xml.indexOf('</action>', re.lastIndex);
      if (close >= 0) { const inner = xml.slice(re.lastIndex, close); const k = inner.match(/<keyboard\b([^>]*)>/); kb = k ? xmlAttr(k[1], 'input') : null; re.lastIndex = close; }
    }
    if (!kb) continue;
    if (/^maxis_|^mouse_[xy]$/i.test(kb)) { hasLook = true; continue; }
    const id = `cryengine/${name}`;
    if (!out.some((a) => a.id === id)) out.push(button(id, name.replace(/_/g, ' '), cryKey(kb)));
  }
  if (hasLook) out.push(look('cryengine/look', '視点'));
  return out;
}
export function cryengine(dir) {
  if (!isDir(path.join(dir, 'Bin64')) && !isDir(path.join(dir, 'bin', 'win_x64'))) return null;
  const paks = [];
  for (const sub of [dir, path.join(dir, 'GameData'), path.join(dir, 'Data'), path.join(dir, 'Engine')]) {
    try { for (const n of fs.readdirSync(sub)) if (/\.pak$/i.test(n)) { const f = path.join(sub, n); paks.push([fs.statSync(f).size, f]); } } catch {}
  }
  paks.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  for (const [size, f] of paks) {
    if (size > 300e6) continue;
    let b; try { b = fs.readFileSync(f); } catch { continue; }
    for (const e of zipEntries(b)) {
      const n = e.name.toLowerCase();
      if (!(n.endsWith('defaultprofile.xml') || (n.includes('actionmap') && n.endsWith('.xml')))) continue;
      const x = zipRead(b, e); if (!x) continue;
      const a = actionsFromCryXml(x.toString('utf8'));
      if (a.length) return { source: 'CryEngine の actionmaps（pak の中）', actions: a };
    }
  }
  return null;
}

// ---------- 2D 向けの汎用の割当 (GameMaker #490・LÖVE #494・HTML5 系 #495。読み取りなし) ----------
// 利用者の判断 (2026-11-14「汎用定義メイン」)。XNA・FNA・MonoGame は WASD とマウスの作品が多いので従来の汎用定義 (#493)
export const generic2dActions = () => [
  button('2d/up', '上へ移動', 'ARROW_UP', 'movement'), button('2d/down', '下へ移動', 'ARROW_DOWN', 'movement'),
  button('2d/left', '左へ移動', 'ARROW_LEFT', 'movement'), button('2d/right', '右へ移動', 'ARROW_RIGHT', 'movement'),
  button('2d/z', 'Z（決定・行動）', 'KEY_Z', 'action'), button('2d/x', 'X（キャンセル・行動）', 'KEY_X', 'action'), button('2d/c', 'C（行動）', 'KEY_C', 'action'),
  button('2d/shift', 'Shift（ダッシュなど）', 'LSHIFT', 'movement'), button('2d/enter', 'Enter（決定・開始）', 'ENTER', 'menu'), button('2d/esc', 'Esc（メニュー・ポーズ）', 'ESC', 'menu'),
];
export function generic2d(dir) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return null; }
  const has = (rx) => names.some((n) => rx.test(n));
  const res = childCi(dir, 'resources');
  const source = has(/^data\.win$/i) ? 'GameMaker（読み取りなし・2D 向けの汎用の割当）'
    : has(/^love\.dll$/i) && has(/^lua5.*\.dll$/i) ? 'LÖVE（読み取りなし・2D 向けの汎用の割当）'
      : has(/^nw\.dll$/i) || has(/^package\.nw$/i) || (res && childCi(res, 'app.asar')) ? 'HTML5（NW.js・Electron、読み取りなし・2D 向けの汎用の割当）' : null;
  return source ? { source, actions: generic2dActions() } : null;
}

// ---------- Unity の旧 Input Manager ----------
function parseAxis(b, o) {
  const str = () => {
    if (o + 4 > b.length) return null;
    const n = b.readInt32LE(o);
    if (n < 0 || n > 64 || o + 4 + n > b.length) return null;
    const s = b.subarray(o + 4, o + 4 + n);
    if (!s.every((c) => c >= 0x20 && c < 0x7f)) return null;
    o = (o + 4 + n + 3) & ~3;
    return s.toString('latin1');
  };
  const s = [];
  for (let i = 0; i < 7; i++) { const v = str(); if (v === null || (i === 0 && !v)) return null; s.push(v); }
  if (o + 28 > b.length) return null;
  for (let i = 0; i < 3; i++) { const f = b.readFloatLE(o); if (!Number.isFinite(f) || f < 0 || f > 1e6) return null; o += 4; }
  if (b[o] > 1 || b[o + 1] > 1 || b[o + 2] || b[o + 3]) return null;
  o += 4;
  const kind = b.readInt32LE(o), axis = b.readInt32LE(o + 4), joy = b.readInt32LE(o + 8);
  if (kind < 0 || kind > 2 || axis < 0 || axis > 63 || joy < 0 || joy > 16) return null;
  return [{ name: s[0], negative: s[3], positive: s[4], altNegative: s[5], altPositive: s[6], kind, axis }, o + 12];
}
export function findAxes(b) {
  const all = [];
  for (let o = 0; o + 8 < b.length;) {
    const run = []; let p = o, r;
    while ((r = parseAxis(b, p))) { run.push(r[0]); p = r[1]; }
    if (run.length >= 2) { all.push(...run); o = p; continue; }
    o += 4;
  }
  return all;
}
const UNITY_DEFAULTS = ['Horizontal', 'Vertical', 'Fire1', 'Fire2', 'Fire3', 'Jump', 'Mouse X', 'Mouse Y', 'Mouse ScrollWheel'];
const engineDebug = (n) => n.startsWith('Debug ') || n.startsWith('Enable Debug');
const untouched = (a) => ['Fire1|left ctrl|mouse 0', 'Fire2|left alt|mouse 1', 'Fire3|left shift|mouse 2', 'Submit|return|joystick button 0', 'Cancel|escape|joystick button 1'].includes(`${a.name}|${a.positive}|${a.altPositive}`);
export const hasCustomAxes = (axes) => axes.some((a) => a.kind === 0 && !UNITY_DEFAULTS.includes(a.name) && a.name !== 'Submit' && a.name !== 'Cancel' && !engineDebug(a.name));
export function actionsFromAxes(axes) {
  const custom = hasCustomAxes(axes), out = [], seen = new Set();
  const first = (names) => names.filter(Boolean).map(keyName).find(Boolean) || null;
  for (const a of axes) {
    if (a.kind === 1) { if (a.axis <= 1 && !out.some((x) => x.type === 'mouseDelta')) out.push(look('unity/look', '視点')); continue; }
    if (a.kind !== 0 || seen.has(a.name) || (custom && untouched(a)) || engineDebug(a.name)) continue;
    const pos = first([a.positive, a.altPositive]), neg = first([a.negative, a.altNegative]);
    if (!pos && !neg) continue;
    seen.add(a.name);
    const l = a.name.toLowerCase();
    const [nw, pw] = l.includes('horiz') ? ['left', 'right'] : l.includes('vert') ? ['down', 'up'] : ['negative', 'positive'];
    const group = l.includes('horiz') || l.includes('vert') ? 'movement' : 'other';
    if (neg) { out.push(button(`unity/${a.name}/${nw}`, `${a.name} ${nw}`, neg, group), button(`unity/${a.name}/${pw}`, `${a.name} ${pw}`, pos, group)); }
    else if (!out.some((x) => x.def && x.def === pos)) out.push(button(`unity/${a.name}`, a.name, pos, group));
  }
  return out;
}
export function unityLegacy(dir) {
  let dd = null;
  try { const n = fs.readdirSync(dir).find((x) => /_Data$/.test(x)); dd = n && path.join(dir, n); } catch {}
  const f = dd && path.join(dd, 'globalgamemanagers');
  let b;
  try { if (!f || fs.statSync(f).size > 64e6) return null; b = fs.readFileSync(f); } catch { return null; }
  const axes = findAxes(b);
  if (!hasCustomAxes(axes)) return null;
  const a = actionsFromAxes(axes);
  return a.length ? { source: 'Unity の旧 Input Manager の軸', actions: a } : null;
}

// ---------- Unity の PlayerPrefs (#484) ----------
export function parseOverrides(text) {
  const t = String(text || '').replace(/\0+$/, '').trim();
  if (!t.startsWith('{') || !t.includes('"bindings"')) return [];
  try { return (JSON.parse(t).bindings || []).filter((b) => b.id && typeof b.path === 'string').map((b) => [b.id, b.path]); } catch { return []; }
}
export function applyOverrides(assets, ov) {
  if (!ov.length) return;
  for (const a of assets) for (const mp of a.maps || []) for (const b of mp.bindings || []) {
    const hit = ov.find(([id]) => id === b.id);
    if (hit) b.path = hit[1];
  }
}
/** <Game>_Data の app.info からレジストリの場所を決め、reg.exe で読み取り専用で読む (Windows だけ) */
export function prefsOverrides(dataDir) {
  if (process.platform !== 'win32') return [];
  const lines = (readText(path.join(dataDir, 'app.info')) || '').split(/\r?\n/).map((s) => s.trim());
  const [company, product] = lines;
  if (!company || !product || /[\\/]/.test(company + product)) return [];
  let out = '';
  try { out = execFileSync('reg', ['query', `HKCU\\Software\\${company}\\${product}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 }); } catch { return []; }
  const ov = [];
  for (const m of out.matchAll(/REG_BINARY\s+([0-9A-Fa-f]+)/g)) {
    const s = Buffer.from(m[1], 'hex').toString('utf8');
    if (s.includes('"bindings"')) ov.push(...parseOverrides(s));
  }
  return ov;
}

/** Unity 以外のエンジンを、見分けのつきやすい順に試す (ホストの engines::read と同じ順)。
 * Unity の旧 Input Manager (unityLegacy) は、extract.mjs が .NET の読み取りとの順番を決めて呼ぶ */
export function engineActions(dir) {
  for (const r of [rpgmaker, wolf, source2, creation, godot, unreal, cryengine, quake, generic2d]) {
    let found = null;
    try { found = r(dir); } catch { found = null; }
    if (found?.actions?.length) return { ...found, actions: found.actions.slice(0, 160) };
  }
  return null;
}
