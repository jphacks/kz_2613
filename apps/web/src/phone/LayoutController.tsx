import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ControllerGame, InputBindings, Slot } from '../shared/contracts';
import {
  allowedControls, assignButton, controlFaces, duplicatePart, findFreeSpot, limitResize, LIMITS, placeParts, rectsOverlap, rectToPart,
  replacePart, setPartHidden, standardLayout, visibleParts,
  type ControlFace, type LayoutPart, type PhoneLayout, type PlacedPart, type Rect, type Viewport,
} from '../shared/model/layout.ts';
import { Look, Stick } from './Controller';
import { Icon } from '../shared/icons.ts';

// 個人レイアウト (#271) で描くコントローラーと、その編集画面 (#50)。
// プレイと編集は同じ操作領域 (#genControls いっぱい) に、同じ計算 (placeParts) で部品を置く。
// そのため、同じ端末・向きなら、編集中と保存後で位置・幅・高さが一致する (操作画面の仕様 1-1)。
// 編集中は bindings を渡さないので、実入力へ一切つながない (仕様 2-4)。

/** 今の画面の回転角。screen.orientation がなければ iOS の旧 window.orientation */
function currentAngle(): number {
  const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (orientation && typeof orientation.angle === 'number') return orientation.angle;
  const legacy = (globalThis as { orientation?: unknown }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** 部品を置く領域の大きさと回転角。回転・リサイズのたびに測り直す (補正は表示だけで、保存データは変えない) */
function useViewport(ref: React.RefObject<HTMLDivElement | null>, fixed?: Viewport): Viewport | null {
  const [view, setView] = useState<Viewport | null>(fixed ?? null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (fixed || !element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setView(prev => prev && prev.width === rect.width && prev.height === rect.height && prev.angle === currentAngle()
        ? prev : { width: rect.width, height: rect.height, angle: currentAngle() });
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    addEventListener('orientationchange', update);
    screen.orientation?.addEventListener?.('change', update);
    return () => { observer?.disconnect(); removeEventListener('orientationchange', update); screen.orientation?.removeEventListener?.('change', update); };
  }, [ref, fixed]);
  return fixed ?? view;
}

/** 部品の見た目。プレイと編集で同じものを使う。ボタンはキー名を大きく、操作名 (ジャンプなど) を小さく添える */
function PartFace({ part, faces, bindings }: { part: LayoutPart; faces: Map<string, ControlFace>; bindings?: InputBindings }) {
  if (part.kind === 'look') return <Look bindings={bindings} />;
  if (part.kind === 'stick') {
    const directions = part.controls.flatMap(control => {
      const face = faces.get(control);
      return face?.direction ? [{ name: face.direction, control, label: face.label }] : [];
    });
    return <Stick part={{ kind: 'stick', id: part.id, directions }} bindings={bindings} />;
  }
  const control = part.controls[0], face = faces.get(control);
  return <button className="key" data-ctl={bindings ? control : undefined} aria-disabled={!bindings || undefined}>
    {face?.label ?? control}{face?.name && face.name !== face.label && <small>{face.name}</small>}
  </button>;
}

const style = (placed: Rect | undefined) => placed
  ? { left: placed.left, top: placed.top, width: placed.width, height: placed.height }
  : { visibility: 'hidden' as const };

/** プレイ画面。担当の部品だけを、本体基準の位置に置いて実入力へつなぐ */
export function LayoutController({ layout, game, slot, bindings, viewport }:
  { layout: PhoneLayout; game: ControllerGame; slot: Slot; bindings?: InputBindings; viewport?: Viewport }) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewport(ref, viewport);
  const faces = useMemo(() => controlFaces(game), [game]);
  const parts = useMemo(() => visibleParts(layout, allowedControls(game, slot)), [layout, game, slot]);
  const placed = useMemo(() => new Map((view ? placeParts(parts, view) : []).map(p => [p.id, p])), [parts, view]);
  // 入力エンジンはスティック・視点パッドを1つずつしか持たない。2つ目以降は実入力へつながない
  const live = useMemo(() => new Set(['stick', 'look'].flatMap(kind => parts.find(p => p.kind === kind)?.id ?? [])), [parts]);
  // 部品の組み合わせが変わったときだけつなぎ直す。外すときは本人の押下をすべて離す
  const controls = parts.map(p => `${p.id}=${p.controls.join(',')}`).join('|');
  useLayoutEffect(() => {
    if (!bindings || !ref.current) return;
    const cleanup = [...ref.current.querySelectorAll<HTMLElement>('[data-ctl]')].map(element => bindings.bindControl(element));
    return () => { bindings.releaseAll(); for (const dispose of cleanup) dispose?.(); };
  }, [controls, bindings]);
  return <div ref={ref} className="layout-area" inert={!bindings}>
    {parts.length ? parts.map(part => <div key={part.id} data-part={part.id} className={`layout-part layout-${part.kind}`} style={style(placed.get(part.id))}>
      <PartFace part={part} faces={faces} bindings={part.kind === 'button' || live.has(part.id) ? bindings : undefined} />
    </div>) : <p className="gen-empty">この人数では担当する操作がありません</p>}
  </div>;
}

// ---- 編集画面 ------------------------------------------------------------------

/** 部品の間にあける最小のすき間 (px)。くっつけて置けるが、重ねては置けない */
const GAP = 6;
/** 長押しとみなす時間と、ドラッグとみなす指の移動量 (実機で調整する仮の値。仕様 4-3 で未確定) */
const LONG_PRESS_MS = 450, DRAG_PX = 8;
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Gesture =
  | { mode: 'press'; id: string; pointer: number; x: number; y: number; timer: number }
  | { mode: 'drag'; id: string; pointer: number; x: number; y: number; from: Rect; at: Rect; snap: Rect | null }
  | { mode: 'resize'; id: string; pointer: number; x: number; y: number; from: Rect; handle: Handle };

/** ハンドルを動かした量から、新しい長方形を作る。スティックは正方形のまま (仕様 1-3) */
function resized(from: Rect, handle: Handle, dx: number, dy: number, square: boolean): Rect {
  let { left, top, width, height } = from;
  const east = handle.includes('e'), west = handle.includes('w'), north = handle.includes('n'), south = handle.includes('s');
  if (square) {
    // 角を引いた方向の大きい方に合わせ、反対の角を固定する
    const grow = Math.max(east ? dx : west ? -dx : -Infinity, south ? dy : north ? -dy : -Infinity);
    const side = Math.max(1, width + grow);
    return { left: west ? left + width - side : left, top: north ? top + height - side : top, width: side, height: side };
  }
  if (east) width += dx;
  if (west) { left += dx; width -= dx; }
  if (south) height += dy;
  if (north) { top += dy; height -= dy; }
  return { left, top, width, height };
}

/**
 * 編集画面。操作領域はプレイ画面と同じ大きさのまま、上の帯 (破棄・元に戻す・保存) だけを重ねる。
 * - タップで選ぶと、まわりにハンドル (四隅は幅と高さ、上下は高さ、左右は幅) が出る
 * - ドラッグで動かす。ほかの部品と重なる場所では、いちばん近い置ける場所を枠で示し、指を離すとそこへ収める。
 *   置ける場所がなければ元の位置に戻す。ほかの部品は動かさない (仕様 1-4)
 * - 長押しで、その部品のメニュー (操作の付け替え・複製・画面から外す) を出す
 * 「保存」までは正式の表示にも保存にも反映しない (Q13)。ここでは何も送信しない (Q12)。
 */
export function LayoutEditor({ initial, game, slot, viewport, onSave, onCancel }: {
  initial: PhoneLayout; game: ControllerGame; slot: Slot; viewport?: Viewport;
  onSave(layout: PhoneLayout): boolean; onCancel(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewport(ref, viewport);
  const [draft, setDraft] = useState(initial);
  const [history, setHistory] = useState<PhoneLayout[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [message, setMessage] = useState('');
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const faces = useMemo(() => controlFaces(game), [game]);
  const allowed = useMemo(() => allowedControls(game, slot), [game, slot]);
  const standard = useMemo(() => standardLayout(game, allowed), [game, allowed]);
  const parts = visibleParts(draft, allowed);
  const placed = new Map((view ? placeParts(parts, view, false) : []).map(p => [p.id, p]));
  const hidden = draft.parts.filter(p => p.hidden && p.controls.some(c => allowed.has(c)));
  const buttonChoices = [...allowed].filter(c => c.startsWith('act:') && standard.parts.some(p => p.kind !== 'look' && p.controls.includes(c)));
  const bounds: Rect | null = view ? { left: 0, top: 0, width: view.width, height: view.height } : null;
  const others = (id: string) => [...placed.values()].filter(p => p.id !== id);
  const partName = (p: LayoutPart) => p.kind === 'look' ? '視点パッド' : p.kind === 'stick' ? 'スティック' : faces.get(p.controls[0])?.label ?? p.id;

  // 上の帯はヘッダーの真上に同じ高さで重ねる。操作領域の大きさは変えない (仕様 1-1)
  const [barHeight, setBarHeight] = useState(54);
  useLayoutEffect(() => { const h = document.querySelector('body > header, header')?.getBoundingClientRect().height; if (h) setBarHeight(h); }, []);
  useEffect(() => () => { const g = gestureRef.current; if (g?.mode === 'press') clearTimeout(g.timer); }, []);

  const commit = (next: PhoneLayout) => { setHistory(h => [...h.slice(-49), draft]); setDraft(next); };
  const undo = () => { if (!history.length) return; setDraft(history[history.length - 1]); setHistory(history.slice(0, -1)); setMessage(''); };
  const setG = (g: Gesture | null) => { gestureRef.current = g; setGesture(g); };
  const toPart = (id: string, rect: Rect) => {
    const part = draft.parts.find(p => p.id === id);
    return part && view ? rectToPart(part, rect, view) : null;
  };

  const downPart = (id: string) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (gestureRef.current) return; // 2本目の指では動かさない
    setSelected(id); setMenu(null); setMore(false);
    const { pointerId: pointer, clientX: x, clientY: y } = event;
    const timer = window.setTimeout(() => {
      const g = gestureRef.current;
      if (g?.mode === 'press' && g.id === id) { setG(null); setMenu(id); }
    }, LONG_PRESS_MS);
    setG({ mode: 'press', id, pointer, x, y, timer });
    ref.current?.setPointerCapture?.(pointer);
  };
  const downHandle = (id: string, handle: Handle) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    const from = placed.get(id);
    if (gestureRef.current || !from) return;
    setMenu(null);
    setG({ mode: 'resize', id, handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, from: { ...from } });
    ref.current?.setPointerCapture?.(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointer !== event.pointerId || !view || !bounds) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    if (g.mode === 'press') {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      clearTimeout(g.timer);
      const from = placed.get(g.id);
      if (!from) return setG(null);
      return setG({ mode: 'drag', id: g.id, pointer: g.pointer, x: g.x, y: g.y, from: { ...from }, at: { ...from }, snap: { ...from } });
    }
    if (g.mode === 'drag') {
      // 部品は指に付いて動く。重なるときは、いちばん近い置ける場所を候補として示す
      const at = { ...g.from, left: g.from.left + dx, top: g.from.top + dy };
      at.left = Math.min(Math.max(at.left, 0), view.width - at.width);
      at.top = Math.min(Math.max(at.top, 0), view.height - at.height);
      const rest = others(g.id);
      const snap = rest.some(o => rectsOverlap(at, o, GAP)) ? findFreeSpot(at, rest, bounds, GAP) : at;
      return setG({ ...g, at, snap });
    }
    const part = draft.parts.find(p => p.id === g.id);
    if (!part) return;
    const short = Math.min(view.width, view.height), long = Math.max(view.width, view.height);
    const minW = LIMITS.minW * short, minH = part.kind === 'stick' ? LIMITS.minW * short : LIMITS.minH * long;
    let target = resized(g.from, g.handle, dx, dy, part.kind === 'stick');
    // 最小の大きさより小さくしない (反対側の辺を固定したまま)
    if (target.width < minW) { if (g.handle.includes('w')) target.left -= minW - target.width; target.width = minW; }
    if (target.height < minH) { if (g.handle.includes('n')) target.top -= minH - target.height; target.height = minH; }
    let next = limitResize(g.from, target, others(g.id), bounds, GAP);
    if (part.kind === 'stick' && Math.abs(next.width - next.height) > 0.5) {
      // 正方形を保つため、短い方にそろえる
      const side = Math.min(next.width, next.height);
      next = { left: g.handle.includes('w') ? next.left + next.width - side : next.left, top: g.handle.includes('n') ? next.top + next.height - side : next.top, width: side, height: side };
    }
    const updated = toPart(g.id, next);
    if (updated) setDraft(layout => replacePart(layout, updated));
  };
  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointer !== event.pointerId) return;
    setG(null);
    if (g.mode === 'press') { clearTimeout(g.timer); return; }
    if (g.mode === 'drag') {
      if (!g.snap) { setMessage('置ける場所がないので、元の位置に戻しました'); return; }
      if (Math.abs(g.snap.left - g.from.left) < 0.5 && Math.abs(g.snap.top - g.from.top) < 0.5) return;
      const updated = toPart(g.id, g.snap);
      if (updated) { commit(replacePart(draft, updated)); setMessage(''); }
      return;
    }
    // リサイズは動かしている間に下書きを変えているので、始める前の状態を履歴に積む
    const before = toPart(g.id, g.from);
    if (before) setHistory(h => [...h.slice(-49), replacePart(draft, before)]);
  };
  const cancelGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (g.mode === 'press') clearTimeout(g.timer);
    if (g.mode === 'resize') { const before = toPart(g.id, g.from); if (before) setDraft(layout => replacePart(layout, before)); }
    setG(null);
  };

  /** 複製した部品は、元の部品のいちばん近くの空いている場所に置く。空きがなければ複製しない */
  const duplicate = (id: string) => {
    const source = placed.get(id);
    if (!source || !bounds || !view) return;
    const next = duplicatePart(draft, id);
    const copy = next.parts[next.parts.length - 1];
    if (next === draft || !copy) return setMessage('これ以上ボタンを増やせません');
    const spot = findFreeSpot({ ...source }, [...placed.values()], bounds, GAP);
    if (!spot) return setMessage('空いている場所がないので複製できません。どれかを小さくしてください');
    commit(replacePart(next, rectToPart(copy, spot, view)));
    setSelected(copy.id); setMenu(null); setMessage('');
  };
  /** 外した部品を戻す。保存していた場所が空いていなければ、いちばん近い空きに置く */
  const restore = (id: string) => {
    const part = draft.parts.find(p => p.id === id);
    setMore(false);
    if (!part || !view || !bounds) return;
    const [rect] = placeParts([{ ...part, hidden: false }], view, false);
    const spot = [...placed.values()].some(o => rectsOverlap(rect, o, GAP)) ? findFreeSpot(rect, [...placed.values()], bounds, GAP) : rect;
    if (!spot) return setMessage('空いている場所がないので戻せません。どれかを小さくしてください');
    commit(replacePart(draft, rectToPart({ ...part, hidden: false }, spot, view)));
    setSelected(id); setMessage('');
  };

  const menuPart = menu ? draft.parts.find(p => p.id === menu) : undefined;
  const menuRect = menu ? placed.get(menu) : undefined;
  const dragging = gesture?.mode === 'drag' ? gesture : null;

  return <div className="layout-editor" id="layoutEditor">
    <div className="layout-editbar" style={{ height: barHeight }} role="toolbar" aria-label="配置の編集">
      <button id="layoutCancel" onClick={onCancel}>破棄</button>
      <button id="layoutUndo" onClick={undo} disabled={!history.length} aria-label="元に戻す"><Icon name="undo" /></button>
      <p className="layout-editbar-note" role="status">{message || <>編集中<small>ゲームには送りません</small></>}</p>
      <button id="layoutMore" onClick={() => { setMore(m => !m); setMenu(null); }} aria-expanded={more} aria-label="そのほかの操作"><Icon name="more" /></button>
      <button className="save" id="layoutSave" onClick={() => { if (!onSave(draft)) setMessage('この端末に保存できませんでした'); }}>保存</button>
    </div>
    {more && <div className="layout-menu layout-more" role="menu">
      {hidden.map(p => <button key={p.id} role="menuitem" onClick={() => restore(p.id)}>「{partName(p)}」を戻す</button>)}
      <button role="menuitem" id="layoutReset" onClick={() => { commit(standard); setSelected(null); setMore(false); setMessage('初期配置に戻しました (保存するまで確定しません)'); }}>初期配置に戻す</button>
    </div>}
    <div ref={ref} className="layout-area editing" onPointerMove={move} onPointerUp={up} onPointerCancel={cancelGesture}
      onPointerDown={() => { setSelected(null); setMenu(null); setMore(false); }}>
      {parts.map(part => {
        const rect = dragging?.id === part.id ? dragging.at : placed.get(part.id);
        const isSelected = part.id === selected && !dragging;
        return <div key={part.id} data-part={part.id}
          className={`layout-part layout-${part.kind}${part.id === selected ? ' selected' : ''}${dragging?.id === part.id ? ' dragging' : ''}${placed.get(part.id)?.conflict ? ' conflict' : ''}`}
          style={style(rect)} onPointerDown={downPart(part.id)}>
          <div className="layout-face" inert><PartFace part={part} faces={faces} /></div>
          {isSelected && (part.kind === 'stick' ? HANDLES.filter(h => h.length === 2) : HANDLES).map(h =>
            <div key={h} className={`layout-handle ${h}`} data-handle={h} onPointerDown={downHandle(part.id, h)} />)}
        </div>;
      })}
      {dragging?.snap && (Math.abs(dragging.snap.left - dragging.at.left) > 0.5 || Math.abs(dragging.snap.top - dragging.at.top) > 0.5) &&
        <div className="layout-snap" style={style(dragging.snap)} aria-hidden="true" />}
      {menuPart && menuRect && <PartMenu rect={menuRect} view={view} part={menuPart} faces={faces} choices={buttonChoices}
        onAssign={control => { commit(assignButton(draft, menuPart.id, control, standard)); }}
        onDuplicate={() => duplicate(menuPart.id)}
        onHide={() => { commit(setPartHidden(draft, menuPart.id, true)); setSelected(null); setMenu(null); }}
        onClose={() => setMenu(null)} />}
    </div>
  </div>;
}

/** 長押しで出す部品のメニュー。部品は動かさず、メニューだけを操作領域の中に収める */
function PartMenu({ rect, view, part, faces, choices, onAssign, onDuplicate, onHide, onClose }: {
  rect: PlacedPart; view: Viewport | null; part: LayoutPart; faces: Map<string, ControlFace>; choices: string[];
  onAssign(control: string): void; onDuplicate(): void; onHide(): void; onClose(): void;
}) {
  const width = 220, height = part.kind === 'button' ? 176 : 96;
  const areaW = view?.width ?? 0, areaH = view?.height ?? 0;
  const below = rect.top + rect.height + 8 + height <= areaH;
  const top = below ? rect.top + rect.height + 8 : Math.max(0, rect.top - height - 8);
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 0), Math.max(0, areaW - width));
  return <div className="layout-menu" role="menu" style={{ left, top, width }} onPointerDown={e => e.stopPropagation()}>
    {part.kind === 'button' && <label>操作 <select aria-label="操作" value={part.controls[0]} onChange={e => onAssign(e.target.value)}>
      {choices.map(c => <option key={c} value={c}>{faces.get(c)?.label ?? c}{faces.get(c)?.name ? `（${faces.get(c)?.name}）` : ''}</option>)}
    </select></label>}
    {part.kind === 'button' && <button role="menuitem" onClick={onDuplicate}>複製</button>}
    <button role="menuitem" onClick={onHide}>画面から外す</button>
    <button role="menuitem" className="close" onClick={onClose}>閉じる</button>
  </div>;
}
