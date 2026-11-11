import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ControllerGame, InputBindings, Slot } from '../shared/contracts';
import {
  allowedControls, assignButton, controlFaces, duplicatePart, LIMITS, movePart, placeParts, resizePart, setPartHidden,
  standardLayout, visibleParts, type ControlFace, type LayoutPart, type PhoneLayout, type PlacedPart, type Viewport,
} from '../shared/model/layout.ts';
import { Look, Stick } from './Controller';

// 個人レイアウト (#271) で描くコントローラーと、その編集画面 (#50)。
// プレイと編集プレビューは同じ PartFace で描く。編集中は bindings を渡さないので、実入力へ一切つながない。

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

function PartFace({ part, faces, bindings }: { part: LayoutPart; faces: Map<string, ControlFace>; bindings?: InputBindings }) {
  if (part.kind === 'look') return <Look bindings={bindings} />;
  if (part.kind === 'stick') {
    const directions = part.controls.flatMap(control => {
      const face = faces.get(control);
      return face?.direction ? [{ name: face.direction, control, label: face.label, mark: face.mark ?? '' }] : [];
    });
    return <Stick part={{ kind: 'stick', id: part.id, directions }} bindings={bindings} />;
  }
  const control = part.controls[0];
  return <button className="key" data-ctl={bindings ? control : undefined} aria-disabled={!bindings || undefined}>{faces.get(control)?.label ?? control}</button>;
}

const style = (placed: PlacedPart | undefined) => placed
  ? { left: placed.left, top: placed.top, width: placed.size, height: placed.size }
  : { visibility: 'hidden' as const };

/** プレイ画面。担当の部品だけを、本体基準の位置に置いて実入力へつなぐ */
export function LayoutController({ layout, game, slot, bindings, viewport }:
  { layout: PhoneLayout; game: ControllerGame; slot: Slot; bindings?: InputBindings; viewport?: Viewport }) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewport(ref, viewport);
  const faces = useMemo(() => controlFaces(game), [game]);
  const parts = useMemo(() => visibleParts(layout, allowedControls(game, slot)), [layout, game, slot]);
  const placed = useMemo(() => new Map((view ? placeParts(parts, view) : []).map(p => [p.id, p])), [parts, view]);
  // 部品の組み合わせが変わったときだけつなぎ直す。外すときは本人の押下をすべて離す
  const controls = parts.map(p => `${p.id}=${p.controls.join(',')}`).join('|');
  useLayoutEffect(() => {
    if (!bindings || !ref.current) return;
    const cleanup = [...ref.current.querySelectorAll<HTMLElement>('[data-ctl]')].map(element => bindings.bindControl(element));
    return () => { bindings.releaseAll(); for (const dispose of cleanup) dispose?.(); };
  }, [controls, bindings]);
  return <div ref={ref} className="layout-area" inert={!bindings}>
    {parts.length ? parts.map(part => <div key={part.id} className={`layout-part layout-${part.kind}`} style={style(placed.get(part.id))}>
      <PartFace part={part} faces={faces} bindings={bindings} />
    </div>) : <p className="gen-empty">この人数では担当する操作がありません</p>}
  </div>;
}

/**
 * 編集画面。部品をドラッグで動かし、選んだ部品の大きさ・表示・複製・ボタンの操作を変える。
 * 「保存して適用」までは正式の表示にも保存にも反映しない (Q13)。ここでは何も送信しない (Q12)。
 */
export function LayoutEditor({ initial, game, slot, viewport, onSave, onCancel, onReset }: {
  initial: PhoneLayout; game: ControllerGame; slot: Slot; viewport?: Viewport;
  onSave(layout: PhoneLayout): boolean; onCancel(): void; onReset(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewport(ref, viewport);
  const [draft, setDraft] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const faces = useMemo(() => controlFaces(game), [game]);
  const standard = useMemo(() => standardLayout(game), [game]);
  const allowed = useMemo(() => allowedControls(game, slot), [game, slot]);
  const parts = visibleParts(draft, allowed);
  const placed = new Map((view ? placeParts(parts, view) : []).map(p => [p.id, p]));
  const hidden = draft.parts.filter(p => p.hidden && p.controls.some(c => allowed.has(c)));
  const current = draft.parts.find(p => p.id === selected && !p.hidden);
  // 割り当てられるのは、自分の担当で、今の定義にあるボタン・スティックの操作だけ
  const buttonChoices = [...allowed].filter(c => c.startsWith('act:') && standard.parts.some(p => p.kind !== 'look' && p.controls.includes(c)));
  const drag = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);

  const down = (id: string) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setSelected(id);
    if (drag.current) return; // 2本目の指では動かさない
    drag.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId || !view) return;
    const dx = (event.clientX - d.x) / view.width, dy = (event.clientY - d.y) / view.height;
    d.x = event.clientX; d.y = event.clientY;
    setDraft(layout => movePart(layout, d.id, dx, dy, view.angle));
  };
  const up = (event: React.PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) drag.current = null; };

  return <div className="layout-editor" id="layoutEditor">
    <p className="layout-editor-note" role="status">{error || '配置の編集中です。この間、あなたの操作はゲームに送られません。'}</p>
    <div ref={ref} className="layout-area editing" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {parts.map(part => <div key={part.id} data-part={part.id}
        className={`layout-part layout-${part.kind}${part.id === selected ? ' selected' : ''}${placed.get(part.id)?.conflict ? ' conflict' : ''}`}
        style={style(placed.get(part.id))} onPointerDown={down(part.id)}>
        <div className="layout-face" inert><PartFace part={part} faces={faces} /></div>
      </div>)}
    </div>
    <div className="layout-tools">
      {current ? <>
        <label>大きさ <input type="range" aria-label="大きさ" min={LIMITS.minSize} max={LIMITS.maxSize} step="0.01" value={current.size}
          onChange={e => setDraft(layout => resizePart(layout, current.id, Number(e.target.value)))} /></label>
        {current.kind === 'button' && <label>操作 <select aria-label="操作" value={current.controls[0]}
          onChange={e => setDraft(layout => assignButton(layout, current.id, e.target.value, standard))}>
          {buttonChoices.map(c => <option key={c} value={c}>{faces.get(c)?.label ?? c}</option>)}
        </select></label>}
        <button onClick={() => setDraft(layout => duplicatePart(layout, current.id))}>複製</button>
        <button onClick={() => { setDraft(layout => setPartHidden(layout, current.id, true)); setSelected(null); }}>画面から外す</button>
      </> : <span>部品をタップして選ぶと、大きさや操作を変えられます。ドラッグで移動します。</span>}
      {hidden.length > 0 && <select aria-label="外した部品を戻す" value="" onChange={e => e.target.value && setDraft(layout => setPartHidden(layout, e.target.value, false))}>
        <option value="">外した部品を戻す…</option>
        {hidden.map(p => <option key={p.id} value={p.id}>{p.kind === 'look' ? '視点パッド' : p.kind === 'stick' ? 'スティック' : faces.get(p.controls[0])?.label ?? p.id}</option>)}
      </select>}
    </div>
    <div className="layout-actions">
      <button className="cmd" id="layoutSave" onClick={() => setError(onSave(draft) ? '' : 'この端末に保存できませんでした。ブラウザーの保存の設定を確認してください。')}>保存して適用</button>
      <button id="layoutCancel" onClick={onCancel}>変更を破棄</button>
      <button id="layoutReset" onClick={onReset}>初期配置に戻す</button>
    </div>
  </div>;
}
