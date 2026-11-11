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
// 座標は「スマホ本体」基準: 自然な向き (縦) に持ったときの本体の左上を (0,0)、右下を (1,1) とし、部品の中心を置く。
// 大きさは本体の短辺に対する比 (縦横で指に対する大きさが変わらない)。端末を回しても同じ物理的な場所に留まる (Q08)。
// 部品は回転させずに置くので、ラベルは正立し (Q09)、スティックの方向は表示中の画面の上=前・右=右になる (Q10)。

export const LAYOUT_SCHEMA = 'recooplay.phone-layout';
export const LAYOUT_VERSION = 1;
export type LayoutKind = 'button' | 'stick' | 'look';
export interface LayoutPart {
  id: string;
  kind: LayoutKind;
  /** 部品が扱う操作。ボタン/スティックは送信用の act:...、視点パッドは担当判定用の look:<操作ID> */
  controls: string[];
  x: number; y: number; size: number;
  /** 非表示 (画面上の削除を含む)。操作定義は消さない (Q05)。定義が変わっても「新しい操作」として復活させない */
  hidden: boolean;
}
export interface PhoneLayout { schema: typeof LAYOUT_SCHEMA; version: typeof LAYOUT_VERSION; game: string; parts: LayoutPart[] }

export const LIMITS = { parts: 64, controls: 8, id: 64, minSize: 0.08, maxSize: 0.6 };
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

/** ゲーム定義の全操作から、誰がどの担当でも使える部品の一覧と初期位置を作る。担当による表示は visibleParts で絞る */
export function standardLayout(game: ControllerGame): PhoneLayout {
  const all = game.profile.actions.map(a => a.id);
  const groups = controllerLayout({ ...game, assigned: { P1: all } }, 'P1');
  const parts: LayoutPart[] = [];
  for (const group of groups) for (const part of group.parts) {
    parts.push({ id: part.id, kind: part.kind, controls: partControls(part, game), x: 0.5, y: 0.5, size: 0.2, hidden: false });
  }
  placeDefaults(parts);
  return { schema: LAYOUT_SCHEMA, version: LAYOUT_VERSION, game: game.profile.id, parts };
}

/** 縦持ちを基準に、スティックは左下、視点パッドは上、ボタンは右下 (スティックがなければ下全体) に並べる */
function placeDefaults(parts: LayoutPart[]) {
  const stick = parts.some(p => p.kind === 'stick');
  const columns = stick ? [0.64, 0.86] : [0.2, 0.5, 0.8];
  let button = 0;
  for (const part of parts) {
    if (part.kind === 'stick') Object.assign(part, { x: 0.27, y: 0.8, size: 0.4 });
    else if (part.kind === 'look') Object.assign(part, { x: 0.5, y: 0.3, size: 0.55 });
    else {
      const row = Math.floor(button / columns.length);
      Object.assign(part, { x: columns[button % columns.length], y: clamp(0.92 - row * 0.13, 0.08, 0.92), size: 0.2 });
      button++;
    }
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
  const x = num(p.x), y = num(p.y), size = num(p.size);
  if (x === null || y === null || size === null) return null;
  return {
    id: p.id, kind: p.kind, controls,
    x: clamp(x, 0, 1), y: clamp(y, 0, 1), size: clamp(size, LIMITS.minSize, LIMITS.maxSize),
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
export interface PlacedPart { id: string; left: number; top: number; size: number; adjusted: boolean; conflict: boolean }

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

/**
 * 表示位置 (px) を決める。safe area からはみ出す部品と、重なって押せない部品だけを最小限ずらす (Q11)。
 * 補正は表示だけの一時値で、レイアウト (保存データ) は変えない (Q38)。解消できない重なりは conflict にする。
 */
export function placeParts(parts: LayoutPart[], view: Viewport): PlacedPart[] {
  const safe = view.safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const short = Math.min(view.width, view.height);
  const minX = safe.left, minY = safe.top, maxX = view.width - safe.right, maxY = view.height - safe.bottom;
  const placed = parts.map(part => {
    const size = Math.min(part.size * short, maxX - minX, maxY - minY);
    const [sx, sy] = bodyToScreen(part.x, part.y, view.angle);
    const left = sx * view.width - size / 2, top = sy * view.height - size / 2;
    return { id: part.id, left, top, size, original: [left, top] as const, adjusted: false, conflict: false };
  });
  const fit = (p: typeof placed[number]) => {
    p.left = clamp(p.left, minX, maxX - p.size);
    p.top = clamp(p.top, minY, maxY - p.size);
  };
  placed.forEach(fit);
  const overlap = (a: typeof placed[number], b: typeof placed[number]) => {
    const dx = Math.min(a.left + a.size, b.left + b.size) - Math.max(a.left, b.left);
    const dy = Math.min(a.top + a.size, b.top + b.size) - Math.max(a.top, b.top);
    return dx > 0.5 && dy > 0.5 ? [dx, dy] as const : null;
  };
  // 後ろの部品を、重なりの少ない方向へ押し出す。数回で収まらなければ衝突として残す
  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j], o = overlap(a, b);
      if (!o) continue;
      const [dx, dy] = o;
      if (dx <= dy) b.left += b.left + b.size / 2 >= a.left + a.size / 2 ? dx : -dx;
      else b.top += b.top + b.size / 2 >= a.top + a.size / 2 ? dy : -dy;
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

// ---- 端末内の保存 (Q03/Q33): ゲームごとに1件 ----------------------------------

export type LayoutStorage = StoragePort & Partial<Pick<Storage, 'removeItem'>>;
const storageKey = (game: string) => `recooplay.layout.${encodeURIComponent(game)}`;

export function createLayoutStore(storage: LayoutStorage) {
  /** 保存済みのレイアウトを今の定義と合わせて返す。未保存・破損・読めないときは標準 */
  function load(game: ControllerGame): { layout: PhoneLayout; source: 'saved' | 'standard' | 'invalid' } {
    const standard = standardLayout(game);
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
export function resizePart(layout: PhoneLayout, id: string, size: number): PhoneLayout {
  return update(layout, id, part => ({ ...part, size: clamp(size, LIMITS.minSize, LIMITS.maxSize) }));
}
/** 画面からの削除・再表示。操作定義は消さない (Q05) */
export function setPartHidden(layout: PhoneLayout, id: string, hidden: boolean): PhoneLayout {
  return update(layout, id, part => ({ ...part, hidden }));
}
/** 同じ操作の部品を足す (重複割当は可、Q05)。上限を超えるときは変えない */
export function duplicatePart(layout: PhoneLayout, id: string): PhoneLayout {
  const source = layout.parts.find(part => part.id === id);
  if (!source || layout.parts.length >= LIMITS.parts) return layout;
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

export interface ControlFace { label: string; direction?: 'up' | 'left' | 'right' | 'down'; mark?: string }
/** 操作 (act:...) ごとの表示名。スティックの方向も持つ。標準の描画 (controllerLayout) と同じ名前を使う */
export function controlFaces(game: ControllerGame): Map<string, ControlFace> {
  const all = game.profile.actions.map(a => a.id);
  const faces = new Map<string, ControlFace>();
  for (const group of controllerLayout({ ...game, assigned: { P1: all } }, 'P1')) for (const part of group.parts) {
    if (part.kind === 'button') faces.set(part.control, { label: part.label });
    else if (part.kind === 'stick') for (const d of part.directions) faces.set(d.control, { label: d.label, direction: d.name, mark: d.mark });
  }
  return faces;
}
