// 主要500タイトルの選定と、操作定義 JSON の生成 (#98)。
// 選定: Steam の公開データ (売上上位・全期間の売上上位・最もプレイされている・月ごとのトップリリース) の順位を合算し、ゲームだけを上位から選ぶ。
// 定義: 個別の定義 (scripts/profiles/overrides/*.json) があればそれを使い、なければ Steam のタグからジャンルの型を当てて作る。
//   型から作った定義は status=template (仮)。個別の定義は書いた根拠に応じて extracted / unverified。実機で確かめていないものを確認済みにしない。
//
//   node scripts/profiles/build-catalog.mjs --cache <フォルダ>   # 取得した公開データの置き場 (リポジトリ外)。あれば再取得しない
//
// 出力: apps/game-profiles/steam-<AppID>.json ほか、docs/develop/data/top500-games.md と .json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const CACHE = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : path.join(process.env.TEMP || '.', 'recooplay-500');
const PROFILES = path.join(ROOT, 'apps', 'game-profiles');
const OVERRIDES = path.join(ROOT, 'scripts', 'profiles', 'overrides');
const TARGET = 500;
const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(CACHE, { recursive: true });

async function cached(name, url) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = await fetch(url, { headers: { 'User-Agent': 'Re:Cooplay catalog builder' } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const j = await r.json();
  fs.writeFileSync(f, JSON.stringify(j));
  await new Promise((res) => setTimeout(res, 800));
  return j;
}

// ---------- 選定 ----------
const lists = {};
for (const f of ['topsellers', 'globaltopsellers']) {
  const ids = [];
  for (let s = 0; s < 1000; s += 100) {
    const j = await cached(`${f}_${s}.json`, `https://store.steampowered.com/search/results/?filter=${f}&category1=998&json=1&count=100&start=${s}&cc=us&l=english`);
    for (const it of j.items || []) { const m = it.logo?.match(/\/apps\/(\d+)\//); if (m && !ids.includes(+m[1])) ids.push(+m[1]); }
  }
  lists[f] = ids;
}
lists.mostplayed = (await cached('mostplayed.json', 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/')).response.ranks.map((r) => r.appid);
lists.topreleases = (await cached('topreleases.json', 'https://api.steampowered.com/ISteamChartsService/GetTopReleasesPages/v1/')).response.pages.flatMap((p) => p.item_ids.map((i) => i.appid));
const WEIGHT = { topsellers: 1, globaltopsellers: 1, mostplayed: 1, topreleases: 0.5 };
const score = new Map();
for (const [name, ids] of Object.entries(lists)) ids.forEach((id, i) => score.set(id, (score.get(id) || 0) + WEIGHT[name] * (ids.length - i) / ids.length));
const candidates = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 800);

// タグ・分類・種類 (IStoreBrowseService/GetItems、50 件ずつ)
const tagNames = new Map((await cached('taglist.json', 'https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english')).response.tags.map((t) => [t.tagid, t.name]));
const items = new Map();
for (let i = 0; i < candidates.length; i += 50) {
  const ids = candidates.slice(i, i + 50);
  const input = { ids: ids.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_basic_info: true, include_tag_count: 20 } };
  const j = await cached(`items_${i}.json`, 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input)));
  for (const it of j.response.store_items || []) items.set(it.appid, it);
}
const games = candidates
  .map((id) => items.get(id))
  .filter((it) => it && it.success === 1 && it.type === 0 && it.name)
  .slice(0, TARGET - 2)
  .map((it, i) => {
    const tags = (it.tags || []).map((t) => tagNames.get(t.tagid)).filter(Boolean);
    const cats = new Set([...(it.categories?.supported_player_categoryids || []), ...(it.categories?.feature_categoryids || [])]);
    const sources = Object.entries(lists).filter(([, ids]) => ids.includes(it.appid)).map(([n, ids]) => `${n}#${ids.indexOf(it.appid) + 1}`);
    return { rank: i + 1, appid: it.appid, name: it.name, tags, cats: [...cats], sources };
  });

// ---------- ジャンルの型 ----------
// タグは重みの順に並ぶ。弱いタグに引きずられないよう、上位のタグだけで判断する
const top = (g, n) => g.tags.slice(0, n);
const has = (g, n, ...t) => t.some((x) => top(g, n).includes(x));
const ACTIONISH = ['FPS', 'Shooter', 'Third-Person Shooter', 'Action', 'Platformer', 'Hack and Slash', 'Action RPG', 'Survival'];
const POINTER = ['MOBA', 'RTS', 'Grand Strategy', 'Turn-Based Strategy', 'Turn-Based Tactics', 'Turn-Based Combat', 'Card Game', 'Card Battler', 'Trading Card Game', 'Deckbuilding',
  '4X', 'City Builder', 'Colony Sim', 'Visual Novel', 'Point & Click', 'Auto Battler', 'Idler', 'Clicker', 'Board Game', 'Chess', 'Hidden Object', 'Dating Sim', 'Real Time Tactics', 'JRPG'];
function templateOf(g) {
  if (has(g, 8, ...POINTER) && !has(g, 3, ...ACTIONISH)) return 'pointer';
  if (has(g, 4, 'Racing', 'Driving', 'Automobile Sim')) return 'racing';
  if (has(g, 4, 'Fighting', '2D Fighter', '3D Fighter')) return 'fighting';
  if (has(g, 8, 'FPS') && !has(g, 8, 'Third-Person Shooter')) return 'fps';
  if (has(g, 8, 'Third-Person Shooter', 'Third Person')) return 'action3d';
  if (has(g, 8, '2D Platformer', 'Precision Platformer', 'Metroidvania', 'Side Scroller') || (has(g, 8, 'Platformer') && !has(g, 8, '3D Platformer'))) return 'platformer';
  if (has(g, 8, 'Top-Down', 'Top-Down Shooter', 'Twin Stick Shooter', 'Isometric', 'Bullet Hell') || (has(g, 8, 'Action Roguelike') && has(g, 8, '2D', 'Pixel Graphics'))) return 'topdown';
  if (has(g, 3, 'Strategy', 'Management', 'Simulation', 'Life Sim', 'Puzzle', 'Job Simulator') && !has(g, 8, ...ACTIONISH, 'Open World', 'Sandbox', 'First-Person', 'Farming Sim')) return 'pointer';
  return 'action3d';
}
const B = (id, label, group, def, extra = {}) => ({ id, label, group, type: 'button', default: def, ...extra });
const MOVE_WASD = [B('forward', '前進', 'movement', 'KEY_W'), B('back', '後退', 'movement', 'KEY_S'), B('left', '左', 'movement', 'KEY_A'), B('right', '右', 'movement', 'KEY_D')];
const LOOK = { id: 'look', label: '視点', group: 'look', type: 'mouseDelta' };
const G = (id, label, role, split) => ({ id, label, role, ...(split ? { split } : {}) });
const TEMPLATES = {
  fps: {
    groups: [G('movement', '移動', 'P1'), G('look', '視点', 'P2'), G('gameplay', '攻撃・使う', 'P3'), G('inventory', '持ち物', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [...MOVE_WASD, B('jump', 'ジャンプ', 'movement', 'SPACE'), B('crouch', 'しゃがむ', 'movement', 'LCTRL'), B('sprint', '走る', 'movement', 'LSHIFT'), LOOK,
      B('fire', '撃つ', 'gameplay', 'MOUSE_L'), B('aim', '構える', 'gameplay', 'MOUSE_R'), B('reload', 'リロード', 'gameplay', 'KEY_R'), B('interact', '使う・拾う', 'gameplay', 'KEY_E'),
      B('weapon1', '武器1', 'inventory', 'DIGIT_1'), B('weapon2', '武器2', 'inventory', 'DIGIT_2'), B('weapon3', '武器3', 'inventory', 'DIGIT_3'), { id: 'switch', label: '武器の切り替え', group: 'inventory', type: 'wheel' },
      B('scoreboard', 'スコア', 'menu', 'TAB'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  action3d: {
    groups: [G('movement', '移動', 'P1'), G('look', '視点', 'P2'), G('gameplay', '攻撃・使う', 'P3'), G('inventory', '持ち物', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [...MOVE_WASD, B('jump', 'ジャンプ', 'movement', 'SPACE'), B('sprint', '走る・回避', 'movement', 'LSHIFT'), B('crouch', 'しゃがむ', 'movement', 'LCTRL'), LOOK,
      B('attack', '攻撃', 'gameplay', 'MOUSE_L'), B('aim', '構える・防御', 'gameplay', 'MOUSE_R'), B('interact', '使う・調べる', 'gameplay', 'KEY_E'),
      B('item1', 'アイテム1', 'inventory', 'DIGIT_1'), B('item2', 'アイテム2', 'inventory', 'DIGIT_2'), B('inventory', '持ち物', 'inventory', 'TAB'),
      B('map', 'マップ', 'menu', 'KEY_M'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  platformer: {
    groups: [G('movement', '移動', 'P1', [{ id: 'left', label: '左', actions: ['left'] }, { id: 'right', label: '右', actions: ['right'] }, { id: 'vertical', label: 'ジャンプ・上下', actions: ['jump', 'up', 'down'] }]), G('gameplay', 'アクション', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [B('left', '左', 'movement', 'ARROW_LEFT'), B('right', '右', 'movement', 'ARROW_RIGHT'), B('up', '上', 'movement', 'ARROW_UP'), B('down', '下', 'movement', 'ARROW_DOWN'), B('jump', 'ジャンプ', 'movement', 'KEY_Z'),
      B('action', 'アクション', 'gameplay', 'KEY_X'), B('special', '特殊', 'gameplay', 'KEY_C'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  topdown: {
    groups: [G('movement', '移動', 'P1', [{ id: 'horizontal', label: '左右', actions: ['left', 'right'] }, { id: 'vertical', label: '上下', actions: ['forward', 'back'] }]), G('look', '狙い', 'P2'), G('gameplay', '攻撃・使う', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [...MOVE_WASD, { id: 'aim', label: '狙い', group: 'look', type: 'mouseDelta' }, B('attack', '攻撃', 'gameplay', 'MOUSE_L'), B('secondary', '特殊攻撃', 'gameplay', 'MOUSE_R'),
      B('dash', 'ダッシュ', 'gameplay', 'SPACE'), B('interact', '使う', 'gameplay', 'KEY_E'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  racing: {
    groups: [G('steering', 'ハンドル', 'P1', [{ id: 'left', label: '左', actions: ['steer_left'] }, { id: 'right', label: '右', actions: ['steer_right'] }]), G('throttle', 'アクセル・ブレーキ', 'P2'), G('gameplay', 'サイドブレーキ・ブースト', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [B('steer_left', '左', 'steering', 'KEY_A'), B('steer_right', '右', 'steering', 'KEY_D'), B('accelerate', 'アクセル', 'throttle', 'KEY_W'), B('brake', 'ブレーキ', 'throttle', 'KEY_S'),
      B('handbrake', 'サイドブレーキ', 'gameplay', 'SPACE'), B('boost', 'ブースト', 'gameplay', 'LSHIFT'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  fighting: {
    groups: [G('movement', '移動', 'P1', [{ id: 'horizontal', label: '左右', actions: ['left', 'right'] }, { id: 'vertical', label: 'ジャンプ・しゃがみ', actions: ['up', 'down'] }]), G('gameplay', '攻撃', 'P3'), G('menu', 'メニュー', 'host')],
    actions: [B('left', '左', 'movement', 'KEY_A'), B('right', '右', 'movement', 'KEY_D'), B('up', 'ジャンプ', 'movement', 'KEY_W'), B('down', 'しゃがむ', 'movement', 'KEY_S'),
      B('light', '弱攻撃', 'gameplay', 'KEY_J'), B('heavy', '強攻撃', 'gameplay', 'KEY_K'), B('special', '必殺技', 'gameplay', 'KEY_L'), B('pause', 'メニュー', 'menu', 'ESC')],
  },
  pointer: {
    groups: [G('pointer', 'マウス操作', 'none'), G('menu', 'メニュー', 'host')],
    actions: [B('select', '選ぶ', 'pointer', 'MOUSE_L'), B('context', '別の操作', 'pointer', 'MOUSE_R'), { id: 'scroll', label: 'スクロール', group: 'pointer', type: 'wheel' }, B('pause', 'メニュー', 'menu', 'ESC')],
  },
};
const COOP = [9, 38, 39, 44, 24, 48];
function suitability(g, template) {
  if (template === 'pointer') return 'unsuitable';
  if (template === 'fighting' || has(g, 6, 'Sports', 'VR', 'Rhythm', 'MMORPG')) return 'limited';
  return g.cats.some((c) => COOP.includes(c)) ? 'good' : 'limited';
}

// ---------- 生成 ----------
const overrides = new Map();
for (const f of fs.readdirSync(OVERRIDES)) if (f.endsWith('.json')) { const o = JSON.parse(fs.readFileSync(path.join(OVERRIDES, f), 'utf8')); overrides.set(o.id, o); }
const nonSteam = [
  { rank: null, id: 'minecraft-java', name: 'Minecraft: Java Edition', hand: true, note: 'Steam外。apps/game-profiles/minecraft-java.json（実機で確認済み）' },
  { rank: null, id: 'epic-fortnite', name: 'Fortnite', tags: ['Battle Royale', 'Third-Person Shooter', 'Building'], cats: [1, 9, 38], note: 'Steam外（Epic）' },
];
// 個別の定義があるのに上位に入らなかったゲーム (このPCで抽出したもの等) も加える
const extraIds = [...overrides.keys()].map((id) => +id.replace('steam-', '')).filter((a) => !games.some((g) => g.appid === a));
if (extraIds.length) {
  const input = { ids: extraIds.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_basic_info: true, include_tag_count: 20 } };
  const j = await cached(`items_extra_${extraIds.join('_')}.json`, 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input)));
  for (const it of j.response.store_items || []) {
    if (!it.name) continue;
    const cats = new Set([...(it.categories?.supported_player_categoryids || []), ...(it.categories?.feature_categoryids || [])]);
    games.push({ rank: null, appid: it.appid, name: it.name, tags: (it.tags || []).map((t) => tagNames.get(t.tagid)).filter(Boolean), cats: [...cats], sources: ['override'] });
  }
}
const catalog = [];
for (const g of games) {
  const id = `steam-${g.appid}`;
  const o = overrides.get(id);
  const template = o ? (o.template || 'override') : templateOf(g);
  const base = o ? { groups: o.groups, actions: o.actions } : JSON.parse(JSON.stringify(TEMPLATES[template]));
  const profile = {
    schema: 1, id, name: g.name,
    match: { ids: [`steam:${g.appid}`], steamAppIds: [g.appid], processes: o?.processes || [], titleContains: o?.titleContains || null },
    suitability: o?.suitability || suitability(g, template),
    ...(o?.userBindings ? { userBindings: o.userBindings } : {}),
    groups: base.groups, actions: base.actions,
    verification: o?.verification || { status: 'template', date: today, sources: [`ジャンルの型（${template}）`, `Steamのタグ: ${g.tags.slice(0, 6).join(', ')}`] },
    catalog: { rank: g.rank, template, tags: g.tags.slice(0, 10), controllerFull: g.cats.includes(28), sources: g.sources },
  };
  fs.writeFileSync(path.join(PROFILES, `${id}.json`), JSON.stringify(profile, null, 2) + '\n');
  catalog.push({ rank: g.rank, id, appid: g.appid, name: g.name, template, suitability: profile.suitability, status: profile.verification.status, controllerFull: g.cats.includes(28), sources: g.sources });
}
// Steam 外
{
  const f = nonSteam[1]; const t = 'fps';
  const p = { schema: 1, id: f.id, name: f.name, match: { ids: ['epic:Fortnite', f.id], steamAppIds: [], processes: [], titleContains: null }, suitability: 'good', groups: TEMPLATES.fps.groups, actions: TEMPLATES.fps.actions,
    verification: { status: 'template', date: today, sources: ['ジャンルの型（fps）', 'Steam外（Epic）'] }, catalog: { rank: null, template: t, tags: f.tags, controllerFull: true, sources: ['nonsteam'] } };
  fs.writeFileSync(path.join(PROFILES, `${f.id}.json`), JSON.stringify(p, null, 2) + '\n');
}
catalog.push({ rank: null, id: 'minecraft-java', appid: null, name: 'Minecraft: Java Edition', template: 'override', suitability: 'good', status: 'device', controllerFull: false, sources: ['nonsteam'] });
catalog.push({ rank: null, id: 'epic-fortnite', appid: null, name: 'Fortnite', template: 'fps', suitability: 'good', status: 'template', controllerFull: true, sources: ['nonsteam'] });

fs.mkdirSync(path.join(ROOT, 'docs', 'develop', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'develop', 'data', 'top500-games.json'), JSON.stringify({ generated: today, method: '売上上位・全期間の売上上位・最もプレイ・月ごとのトップリリースの順位を合算（scripts/profiles/build-catalog.mjs）', total: catalog.length, games: catalog }, null, 1) + '\n');
const count = (k, v) => catalog.filter((c) => c[k] === v).length;
const md = [
  `# 主要500タイトルの一覧（#98）`, '',
  `- 作成日：${today}（\`scripts/profiles/build-catalog.mjs\` で生成。手で書き換えない）`,
  `- 選定：Steamの公開データ（売上上位1000・全期間の売上上位1000・最もプレイされている100・月ごとのトップリリース）の順位を合算し、ゲームだけを上位から ${games.filter((g) => g.rank).length} 本。個別の定義があるのに上位に入らなかった ${games.filter((g) => !g.rank).length} 本（このPCで抽出したもの等）と、Steam外の ${nonSteam.length} 本（ゲーム検出で見分けられるもの）を加えた計 ${catalog.length} 本。`,
  `- 定義：個別の定義（\`scripts/profiles/overrides/\`）がなければ、Steamのタグからジャンルの型を当てて作った**仮の定義（template）**。実機で確かめていない定義を確認済みとして扱わない。`,
  '- 本一覧は操作対応済みの一覧ではない。仮・抽出・未検証の定義、または操作画面が未対応の定義はReadyできない。',
  `- 状態：device ${count('status', 'device')}／extracted ${count('status', 'extracted')}／unverified ${count('status', 'unverified')}／template ${count('status', 'template')}`,
  `- 向き：good ${count('suitability', 'good')}／limited ${count('suitability', 'limited')}／unsuitable ${count('suitability', 'unsuitable')}（unsuitable はマウス中心・ターン制等で、分担の対象外）`, '',
  '| 順位 | ゲーム | AppID | 型 | 向き | 状態 | コントローラー完全対応 |', '|---|---|---|---|---|---|---|',
  ...catalog.map((c) => `| ${c.rank ?? '-'} | ${c.name.replace(/\|/g, '/')} | ${c.appid ?? '-'} | ${c.template} | ${c.suitability} | ${c.status} | ${c.controllerFull ? '○' : ''} |`),
];
fs.writeFileSync(path.join(ROOT, 'docs', 'develop', 'data', 'top500-games.md'), md.join('\n') + '\n');
console.log(`生成: ${catalog.length} 本（Steam ${games.length}、overrides ${games.filter((g) => overrides.has('steam-' + g.appid)).length}）`);
