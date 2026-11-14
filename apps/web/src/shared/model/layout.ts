import type { ControllerGame, Slot } from '../contracts.ts';
import { controllerLayout, type ControlPart } from '../controller-layout.ts';
import type { StoragePort } from '../transport/messages.ts';

// スマホコントローラーの個人レイアウト (#271)。編集UI (#50)・プレビュー・プレイが同じデータを使う。
// 4つの関心事を混同しない:
//   操作定義 (どの操作IDがあるか) … ホストのゲーム定義
//   担当割当 (誰がどの操作IDを使えるか) … ホストが決め、担当外の入力はホストが拒否する
//   物理キー割当 (PCへ何を送るか) … PCだけ (key_overrides)
//   UIレイアウト (部品の位置・大きさ・表示) … このファイル。スマホの中だけに保存し、ホストへは送らない
// そのため、レイアウトを変えても担当権限・送信先のキー・epoch は変わらない。
//
// 座標は「スマホ本体」基準: 自然な向き (縦) に持ったときの操作領域の左上を (0,0)、右下を (1,1) とし、部品の中心を置く。
// 幅 w は短辺、高さ h は長辺に対する比 (版2)。縦持ちでは w=1 が領域の幅、h=1 が領域の高さちょうどになる。
// ボタンと視点パッドは縦横自由、スティックは正方形 (短い方にそろえる)。端末を回しても同じ物理的な場所に留まる (Q08)。
// プレイと編集は同じ領域・同じ計算で描くので、同じ端末・向きなら保存の前後で位置・幅・高さが一致する (操作画面の仕様 1-1)。
// 部品は回転させずに置くので、ラベルは正立し (Q09)、スティックの方向は表示中の画面の上=前・右=右になる (Q10)。

export const LAYOUT_SCHEMA = 'recooplay.phone-layout';
export const LAYOUT_VERSION = 2;
export type LayoutKind = 'button' | 'stick' | 'look';
export interface LayoutPart {
  id: string;
  kind: LayoutKind;
  /** 部品が扱う操作。ボタン/スティックは送信用の act:...、視点パッドは担当判定用の look:<操作ID> */
  controls: string[];
  x: number; y: number; w: number; h: number;
  /** 非表示 (画面上の削除を含む)。操作定義は消さない (Q05)。定義が変わっても「新しい操作」として復活させない */
  hidden: boolean;
}
export interface PhoneLayout { schema: typeof LAYOUT_SCHEMA; version: typeof LAYOUT_VERSION; game: string; parts: LayoutPart[] }

export const LIMITS = { parts: 64, controls: 8, id: 64, minW: 0.1, minH: 0.04, maxW: 1, maxH: 1 };
const ID = /^[\w:.\-/~]+$/; // ~ は複製した部品 (jump~2)
const CONTROL = /^(act|look):[\w:.\-/]+$/;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ---- 標準生成 ------------------------------------------------------------

// 視点パッドは1枚だけ (現行の視点エンジンが1枚を所有する) なので、すべての視点操作をまとめて持つ
function partControls(part: ControlPart, game: ControllerGame): string[] {
  if (part.kind === 'button') return [part.control];
  if (part.kind === 'stick') return part.directions.map(d => d.control);
  return game.profile.actions.filter(a => a.type === 'mouseDelta').map(a => `look:${a.id}`);
}

/**
 * ゲーム定義の全操作から部品の一覧と初期位置を作る。担当による表示は visibleParts で絞る。
 * allowed (その人の担当) を渡すと、担当の部品だけで操作領域をいっぱいに使うように並べる。
 * 担当外の部品は、それだけで別に並べておく (担当が変わったときの初期位置。同時には表示しない)
 */
export function standardLayout(game: ControllerGame, allowed?: Set<string>): PhoneLayout {
  const all = game.profile.actions.map(a => a.id);
  const groups = controllerLayout({ ...game, assigned: { P1: all } }, 'P1');
  const parts: LayoutPart[] = [];
  for (const group of groups) for (const part of group.parts) {
    parts.push({ id: part.id, kind: part.kind, controls: partControls(part, game), x: 0.5, y: 0.5, w: 0.2, h: 0.1, hidden: false });
  }
  const mine = allowed ? parts.filter(p => p.controls.some(c => allowed.has(c))) : parts;
  fillArea(mine);
  if (allowed) fillArea(parts.filter(p => !mine.includes(p)));
  return { schema: LAYOUT_SCHEMA, version: LAYOUT_VERSION, game: game.profile.id, parts };
}

// 初期配置の余白と間隔 (幅は短辺、高さは長辺に対する比)
const MARGIN_X = 0.035, MARGIN_Y = 0.012, GAP_X = 0.035, GAP_Y = 0.016;

/**
 * 縦持ちの操作領域いっぱいに、上から 視点パッド → ボタン → スティック の帯で並べる。
 * スティックは下 (親指)、ボタンは格子で敷き詰め、最初の段は大きく (端数があれば横長に) する
 */
function fillArea(parts: LayoutPart[]) {
  if (!parts.length) return;
  const sticks = parts.filter(p => p.kind === 'stick'), looks = parts.filter(p => p.kind === 'look'), buttons = parts.filter(p => p.kind === 'button');
  const bands = [looks.length > 0, buttons.length > 0, sticks.length > 0].filter(Boolean).length;
  const avail = 1 - 2 * MARGIN_Y - GAP_Y * (bands - 1);
  const cols = gridColumns(buttons.length), rows = Math.ceil(buttons.length / Math.max(cols, 1));
  const stickH = sticks.length ? (bands > 1 ? Math.min(0.46, avail * 0.55) : avail) : 0;
  let buttonH = 0, lookH = 0;
  if (looks.length) { buttonH = buttons.length ? Math.min(0.42, rows * 0.11 + 0.03) : 0; lookH = avail - stickH - buttonH; }
  else buttonH = avail - stickH;
  const x0 = MARGIN_X, width = 1 - 2 * MARGIN_X;
  let y = MARGIN_Y;
  if (looks.length) { stackRow(looks, x0, y, width, lookH); y += lookH + GAP_Y; }
  if (buttons.length) { grid(buttons, cols, x0, y, width, buttonH); y += buttonH + GAP_Y; }
  if (sticks.length) stackRow(sticks, x0, y, width, stickH);
}

const gridColumns = (n: number) => n <= 1 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;

/** 帯の中に、同じ種類の部品を横に等分して置く (スティック・視点パッドはふつう1つ) */
function stackRow(parts: LayoutPart[], x0: number, y0: number, width: number, height: number) {
  const w = (width - GAP_X * (parts.length - 1)) / parts.length;
  parts.forEach((part, i) => Object.assign(part, { x: x0 + i * (w + GAP_X) + w / 2, y: y0 + height / 2, w, h: height }));
}

/** ボタンの格子。端数は最初の段に回して横長にし、最初の段は他の段より高くする */
function grid(parts: LayoutPart[], cols: number, x0: number, y0: number, width: number, height: number) {
  const rows = Math.ceil(parts.length / cols);
  const first = parts.length - cols * (rows - 1);
  const weights = Array.from({ length: rows }, (_, r) => r === 0 && rows > 1 ? 1.3 : 1);
  const unit = (height - GAP_Y * (rows - 1)) / weights.reduce((a, b) => a + b, 0);
  let index = 0, y = y0;
  for (let r = 0; r < rows; r++) {
    const count = r === 0 ? first : cols, h = unit * weights[r];
    const w = (width - GAP_X * (count - 1)) / count;
    for (let c = 0; c < count; c++, index++) Object.assign(parts[index], { x: x0 + c * (w + GAP_X) + w / 2, y: y + h / 2, w, h });
    y += h + GAP_Y;
  }
}

// ---- 検証と無害化 --------------------------------------------------------

/** 保存値を検証する。構造・版・ゲームが違えば null (標準に戻す)。個々の不正な部品は捨て、数値は範囲に収める */
export function parseLayout(value: unknown, game: string): PhoneLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== LAYOUT_SCHEMA || v.version !== LAYOUT_VERSION || v.game !== game || !Array.isArray(v.parts)) return null;
  const seen = new Set<string>();
  const parts: LayoutPart[] = [];
  for (const raw of v.parts.slice(0, LIMITS.parts)) {
    const part = parsePart(raw);
    if (!part || seen.has(part.id)) continue;
    seen.add(part.id);
    parts.push(part);
  }
  return { schema: LAYOUT_SCHEMA, version: LAYOUT_VERSION, game, parts };
}

function parsePart(raw: unknown): LayoutPart | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length > LIMITS.id || !ID.test(p.id)) return null;
  if (p.kind !== 'button' && p.kind !== 'stick' && p.kind !== 'look') return null;
  if (!Array.isArray(p.controls) || p.controls.length > LIMITS.controls) return null;
  const controls = p.controls.filter((c): c is string => typeof c === 'string' && c.length <= LIMITS.id * 2 && CONTROL.test(c));
  if (controls.length !== p.controls.length || new Set(controls).size !== controls.length) return null;
  const prefix = p.kind === 'look' ? 'look:' : 'act:';
  if (!controls.length || controls.some(c => !c.startsWith(prefix)) || (p.kind === 'button' && controls.length !== 1)) return null;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : null;
  const x = num(p.x), y = num(p.y), w = num(p.w), h = num(p.h);
  if (x === null || y === null || w === null || h === null) return null;
  return {
    id: p.id, kind: p.kind, controls,
    x: clamp(x, 0, 1), y: clamp(y, 0, 1), w: clamp(w, LIMITS.minW, LIMITS.maxW), h: clamp(h, LIMITS.minH, LIMITS.maxH),
    hidden: p.hidden === true,
  };
}

// ---- 定義変更との合成 (Q04) ------------------------------------------------

/**
 * 保存済みのレイアウトを、今のゲーム定義から作った標準と合わせる。
 * - 保存済みの部品は位置・大きさ・表示・操作の割当を保つ (操作の重複割当も可、Q05)
 * - 今の定義にない操作を扱う部品は捨てる (削除・不正な操作を復活させない)
 * - 標準にあって保存にない部品 (新しく増えた操作) だけを初期位置で足す
 */
export function reconcile(saved: PhoneLayout | null, standard: PhoneLayout): PhoneLayout {
  if (!saved || saved.game !== standard.game) return standard;
  const known = new Map<string, LayoutKind>();
  for (const part of standard.parts) for (const control of part.controls) known.set(control, part.kind === 'stick' ? 'button' : part.kind);
  // 今も使える操作だけを残す。スティックの方向が1つ減っても、利用者が置いた位置は保つ
  const kept = saved.parts.map(part => ({ ...part, controls: part.controls.filter(c => {
    const kind = known.get(c);
    return kind !== undefined && (part.kind === 'look' ? kind === 'look' : kind === 'button');
  }) })).filter(part => part.controls.length > 0);
  const ids = new Set(kept.map(p => p.id));
  const added = standard.parts.filter(p => !ids.has(p.id));
  return { ...standard, parts: [...kept, ...added.map(p => ({ ...p, controls: [...p.controls] }))] };
}

// ---- 担当による表示 (Q03) --------------------------------------------------

/** その担当で使える操作。ホストの assigned から作る (表示用。送信の可否はホストが改めて判定する) */
export function allowedControls(game: ControllerGame, slot: Slot): Set<string> {
  const allowed = new Set<string>();
  for (const id of game.assigned?.[slot] ?? []) {
    const action = game.profile.actions.find(a => a.id === id);
    if (!action) continue;
    if (action.type === 'button') allowed.add(`act:${id}`);
    else if (action.type === 'wheel') { allowed.add(`act:${id}:up`); allowed.add(`act:${id}:down`); }
    else if (action.type === 'mouseDelta') allowed.add(`look:${id}`);
  }
  return allowed;
}

/** 担当外の部品を隠す。保存データの位置は変えないので、元の担当に戻れば同じ場所に出る。スティックは担当の方向だけを残す */
export function visibleParts(layout: PhoneLayout, allowed: Set<string>): LayoutPart[] {
  return layout.parts.flatMap(part => {
    if (part.hidden) return [];
    const controls = part.controls.filter(c => allowed.has(c));
    if (!controls.length) return [];
    return [{ ...part, controls }];
  });
}

// ---- 本体座標 → 画面 (縦横の変換と、表示だけの一時補正) ---------------------

export interface Viewport {
  width: number; height: number;
  /** screen.orientation.angle (0/90/180/270)。端末を反時計回りに90度回すと 90 */
  angle: number;
  safe?: { top: number; right: number; bottom: number; left: number };
}
export interface Rect { left: number; top: number; width: number; height: number }
export interface PlacedPart extends Rect { id: string; adjusted: boolean; conflict: boolean }

/** 角度を 0/90/180/270 にそろえる。iOS の旧 window.orientation (-90) も受け付ける */
export function normalizeAngle(angle: number): 0 | 90 | 180 | 270 {
  const a = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return a as 0 | 90 | 180 | 270;
}

/** 本体座標の点を、今の向きの画面座標 (0〜1) へ移す */
export function bodyToScreen(x: number, y: number, angle: number): [number, number] {
  switch (normalizeAngle(angle)) {
    case 90: return [y, 1 - x];   // 本体の上端が画面の左、本体の左端が画面の下
    case 180: return [1 - x, 1 - y];
    case 270: return [1 - y, x];  // 本体の上端が画面の右、本体の左端が画面の上
    default: return [x, y];
  }
}
/** bodyToScreen の逆 */
export function screenToBody(x: number, y: number, angle: number): [number, number] {
  switch (normalizeAngle(angle)) {
    case 90: return [1 - y, x];
    case 180: return [1 - x, 1 - y];
    case 270: return [y, 1 - x];
    default: return [x, y];
  }
}

/** 部品の画面上の大きさ (px)。スティックは短い方にそろえて正方形にする */
function partSize(part: LayoutPart, view: Viewport): [number, number] {
  const short = Math.min(view.width, view.height), long = Math.max(view.width, view.height);
  const w = part.w * short, h = part.h * long;
  return part.kind === 'stick' ? [Math.min(w, h), Math.min(w, h)] : [w, h];
}

/**
 * 表示位置 (px) を決める。保存した位置・幅・高さをそのまま画面に写す。
 * correct が真 (プレイ) のときだけ、safe area からはみ出す部品と、重なって押せない部品を最小限ずらす (Q11)。
 * 編集で作ったレイアウトは重ならないので、同じ表示条件では補正は起きない。補正は表示だけで保存データは変えない (Q38)。
 * 解消できない重なりは conflict にする。編集画面 (correct=false) は保存した場所のまま描き、他の部品を勝手に動かさない (仕様 1-4)
 */
export function placeParts(parts: LayoutPart[], view: Viewport, correct = true): PlacedPart[] {
  const safe = view.safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const minX = safe.left, minY = safe.top, maxX = view.width - safe.right, maxY = view.height - safe.bottom;
  const placed = parts.map(part => {
    let [width, height] = partSize(part, view);
    width = Math.min(width, maxX - minX); height = Math.min(height, maxY - minY);
    if (part.kind === 'stick') width = height = Math.min(width, height);
    const [sx, sy] = bodyToScreen(part.x, part.y, view.angle);
    const left = sx * view.width - width / 2, top = sy * view.height - height / 2;
    return { id: part.id, left, top, width, height, original: [left, top] as const, adjusted: false, conflict: false };
  });
  const fit = (p: typeof placed[number]) => {
    p.left = clamp(p.left, minX, maxX - p.width);
    p.top = clamp(p.top, minY, maxY - p.height);
  };
  placed.forEach(fit);
  const overlap = (a: Rect, b: Rect) => {
    const dx = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    const dy = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
    return dx > 0.5 && dy > 0.5 ? [dx, dy] as const : null;
  };
  // 後ろの部品を、重なりの少ない方向へ押し出す。数回で収まらなければ衝突として残す
  for (let round = 0; correct && round < 8; round++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j], o = overlap(a, b);
      if (!o) continue;
      const [dx, dy] = o;
      if (dx <= dy) b.left += b.left + b.width / 2 >= a.left + a.width / 2 ? dx : -dx;
      else b.top += b.top + b.height / 2 >= a.top + a.height / 2 ? dy : -dy;
      fit(b);
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    if (overlap(placed[i], placed[j])) placed[i].conflict = placed[j].conflict = true;
  }
  return placed.map(({ original, ...p }) => ({
    ...p, adjusted: Math.abs(p.left - original[0]) > 0.5 || Math.abs(p.top - original[1]) > 0.5,
  }));
}

// ---- 編集の幾何 (#50・操作画面の仕様 1-4) ------------------------------------
// ほかの部品は石のように固定し、動かしている部品だけを補正する。

/** 2つの長方形が gap 未満まで近づいている (重なっている) か */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.left + b.width + gap - 0.01 && b.left < a.left + a.width + gap - 0.01
    && a.top < b.top + b.height + gap - 0.01 && b.top < a.top + a.height + gap - 0.01;
}
const inside = (r: Rect, bounds: Rect) => r.left >= bounds.left - 0.01 && r.top >= bounds.top - 0.01
  && r.left + r.width <= bounds.left + bounds.width + 0.01 && r.top + r.height <= bounds.top + bounds.height + 0.01;

/**
 * 動かした部品の、いちばん近い置ける場所 (どの部品とも gap 以上離れ、領域の中)。
 * 候補は「指の位置」「領域の端」「ほかの部品の上下左右に接する位置」の組み合わせ。見つからなければ null
 */
export function findFreeSpot(rect: Rect, others: Rect[], bounds: Rect, gap = 0): Rect | null {
  const xs = new Set([rect.left, bounds.left, bounds.left + bounds.width - rect.width]);
  const ys = new Set([rect.top, bounds.top, bounds.top + bounds.height - rect.height]);
  for (const o of others) {
    xs.add(o.left - gap - rect.width); xs.add(o.left + o.width + gap); xs.add(o.left);
    ys.add(o.top - gap - rect.height); ys.add(o.top + o.height + gap); ys.add(o.top);
  }
  let best: Rect | null = null, bestDistance = Infinity;
  for (const raw of xs) for (const rawTop of ys) {
    const left = clamp(raw, bounds.left, bounds.left + bounds.width - rect.width);
    const top = clamp(rawTop, bounds.top, bounds.top + bounds.height - rect.height);
    const candidate = { left, top, width: rect.width, height: rect.height };
    const distance = Math.hypot(left - rect.left, top - rect.top);
    if (distance >= bestDistance || !inside(candidate, bounds) || others.some(o => rectsOverlap(candidate, o, gap))) continue;
    best = candidate; bestDistance = distance;
  }
  return best;
}

/**
 * ハンドルで大きさを変える。ほかの部品にぶつかる直前・領域の端で止め、ほかの部品は動かさない (仕様 1-4)。
 * 横と縦は別々に止めるので、片方が限界でももう片方は変えられる
 */
export function limitResize(from: Rect, to: Rect, others: Rect[], bounds: Rect, gap = 0): Rect {
  const ok = (r: Rect) => inside(r, bounds) && !others.some(o => rectsOverlap(r, o, gap));
  const mix = (a: Rect, b: Rect, t: number, axis: 'x' | 'y'): Rect => axis === 'x'
    ? { ...a, left: a.left + (b.left - a.left) * t, width: a.width + (b.width - a.width) * t }
    : { ...a, top: a.top + (b.top - a.top) * t, height: a.height + (b.height - a.height) * t };
  const bounded = { ...to };
  // 領域の外へ出る辺は、先に端で止める
  if (bounded.left < bounds.left) { bounded.width -= bounds.left - bounded.left; bounded.left = bounds.left; }
  if (bounded.top < bounds.top) { bounded.height -= bounds.top - bounded.top; bounded.top = bounds.top; }
  bounded.width = Math.min(bounded.width, bounds.left + bounds.width - bounded.left);
  bounded.height = Math.min(bounded.height, bounds.top + bounds.height - bounded.top);
  let result = { ...from };
  for (const axis of ['x', 'y'] as const) {
    const target = mix(result, bounded, 1, axis);
    if (ok(target)) { result = target; continue; }
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (ok(mix(result, bounded, mid, axis))) lo = mid; else hi = mid; }
    result = mix(result, bounded, lo, axis);
  }
  return result;
}

/** 画面上の長方形 (px) を、部品の本体座標・幅・高さへ戻す (placeParts の逆。補正はしない) */
export function rectToPart(part: LayoutPart, rect: Rect, view: Viewport): LayoutPart {
  const short = Math.min(view.width, view.height), long = Math.max(view.width, view.height);
  const [x, y] = screenToBody((rect.left + rect.width / 2) / view.width, (rect.top + rect.height / 2) / view.height, view.angle);
  return { ...part, x: clamp(x, 0, 1), y: clamp(y, 0, 1),
    w: clamp(rect.width / short, LIMITS.minW, LIMITS.maxW), h: clamp(rect.height / long, LIMITS.minH, LIMITS.maxH) };
}

// ---- 端末内の保存 (Q03/Q33): ゲームごとに1件 ----------------------------------

export type LayoutStorage = StoragePort & Partial<Pick<Storage, 'removeItem'>>;
const storageKey = (game: string) => `recooplay.layout.${encodeURIComponent(game)}`;

export function createLayoutStore(storage: LayoutStorage) {
  /** 保存済みのレイアウトを今の定義と合わせて返す。未保存・破損・読めないときは標準 */
  function load(game: ControllerGame, slot?: Slot): { layout: PhoneLayout; source: 'saved' | 'standard' | 'invalid' } {
    const standard = standardLayout(game, slot ? allowedControls(game, slot) : undefined);
    let text: string | null = null;
    try { text = storage.getItem(storageKey(standard.game)); } catch { return { layout: standard, source: 'standard' }; }
    if (!text) return { layout: standard, source: 'standard' };
    let value: unknown;
    try { value = JSON.parse(text); } catch { return { layout: standard, source: 'invalid' }; }
    const saved = parseLayout(value, standard.game);
    return saved ? { layout: reconcile(saved, standard), source: 'saved' } : { layout: standard, source: 'invalid' };
  }
  /** 明示的な保存のときだけ呼ぶ (Q13)。検証を通した値だけを書く */
  function save(layout: PhoneLayout): boolean {
    const valid = parseLayout(JSON.parse(JSON.stringify(layout)), layout.game);
    if (!valid || !layout.game) return false;
    try { storage.setItem(storageKey(layout.game), JSON.stringify(valid)); return true; } catch { return false; }
  }
  /** 初期配置に戻す */
  function reset(game: string): boolean {
    try {
      if (storage.removeItem) storage.removeItem(storageKey(game));
      else storage.setItem(storageKey(game), '');
      return true;
    } catch { return false; }
  }
  return { load, save, reset };
}

// ---- 編集の操作 (#50) -------------------------------------------------------
// どれも新しいレイアウトを返し、元を書き換えない。保存は createLayoutStore().save を明示的に呼んだときだけ。

/** 画面上の動き (画面の幅・高さに対する比) を、本体座標の動きへ戻す (bodyToScreen の逆) */
export function screenToBodyDelta(dx: number, dy: number, angle: number): [number, number] {
  switch (normalizeAngle(angle)) {
    case 90: return [-dy, dx];
    case 180: return [-dx, -dy];
    case 270: return [dy, -dx];
    default: return [dx, dy];
  }
}

const update = (layout: PhoneLayout, id: string, change: (part: LayoutPart) => LayoutPart): PhoneLayout =>
  ({ ...layout, parts: layout.parts.map(part => part.id === id ? change(part) : part) });

/** 指で動かした量だけ部品を動かす。本体の外へは出さない */
export function movePart(layout: PhoneLayout, id: string, dx: number, dy: number, angle: number): PhoneLayout {
  const [bx, by] = screenToBodyDelta(dx, dy, angle);
  return update(layout, id, part => ({ ...part, x: clamp(part.x + bx, 0, 1), y: clamp(part.y + by, 0, 1) }));
}
/** 編集で決めた位置・幅・高さで部品を置き換える (rectToPart で作った値) */
export function replacePart(layout: PhoneLayout, next: LayoutPart): PhoneLayout {
  return update(layout, next.id, () => ({ ...next, controls: [...next.controls] }));
}
/** 画面からの削除・再表示。操作定義は消さない (Q05) */
export function setPartHidden(layout: PhoneLayout, id: string, hidden: boolean): PhoneLayout {
  return update(layout, id, part => ({ ...part, hidden }));
}
/**
 * 同じ操作のボタンを足す (重複割当は可、Q05)。上限を超えるときは変えない。
 * スティック・視点パッドは入力エンジンが1つずつしか持てないので複製しない (2つ目は反応しない部品になるため)
 */
export function duplicatePart(layout: PhoneLayout, id: string): PhoneLayout {
  const source = layout.parts.find(part => part.id === id);
  if (!source || source.kind !== 'button' || layout.parts.length >= LIMITS.parts) return layout;
  const base = `${id.slice(0, LIMITS.id - 4)}~`;
  let n = 2;
  while (layout.parts.some(part => part.id === `${base}${n}`)) n++;
  const copy = { ...source, id: `${base}${n}`, controls: [...source.controls], hidden: false, x: clamp(source.x + 0.08, 0, 1), y: clamp(source.y - 0.08, 0, 1) };
  return { ...layout, parts: [...layout.parts, copy] };
}
/** ボタンの操作を付け替える。今の定義にあるボタン用の操作だけを受け付ける */
export function assignButton(layout: PhoneLayout, id: string, control: string, standard: PhoneLayout): PhoneLayout {
  const known = standard.parts.some(part => part.kind !== 'look' && part.controls.includes(control));
  if (!known) return layout;
  return update(layout, id, part => part.kind === 'button' ? { ...part, controls: [control] } : part);
}

// ---- 表示用の名前 ------------------------------------------------------------

export interface ControlFace { label: string; name?: string; direction?: 'up' | 'left' | 'right' | 'down' }
/** 操作 (act:...) ごとの表示名。スティックの方向も持つ。標準の描画 (controllerLayout) と同じ名前を使う */
export function controlFaces(game: ControllerGame): Map<string, ControlFace> {
  const all = game.profile.actions.map(a => a.id);
  const faces = new Map<string, ControlFace>();
  for (const group of controllerLayout({ ...game, assigned: { P1: all } }, 'P1')) for (const part of group.parts) {
    if (part.kind === 'button') faces.set(part.control, { label: part.label, name: actionName(game, part.control) });
    else if (part.kind === 'stick') for (const d of part.directions) faces.set(d.control, { label: d.label, direction: d.name });
  }
  return faces;
}

/** 操作の名前 (ジャンプ・攻撃など)。キー名の下に小さく添える。キー名と同じなら出さない */
function actionName(game: ControllerGame, control: string): string | undefined {
  const id = control.slice(4).replace(/:(up|down)$/, '');
  return game.profile.actions.find(a => a.id === id)?.label || undefined;
}
