import { useLayoutEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { controllerLayout, type ControlGroup, type ControlPart } from '../controller-layout';
import type { BuildController, InputBindings } from '../contracts';

function Stick({ part, bindings }: { part: Extract<ControlPart, { kind: 'stick' }>; bindings?: InputBindings }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!bindings) return;
    bindings.bindStick(ref.current, Object.fromEntries(part.directions.map(d => [d.name, d.control])));
    return () => bindings.bindStick(null, {});
  }, [part, bindings]);
  return <div className="stick gen-stick" ref={ref}>{part.directions.map(d =>
    <span key={d.name} className={`dir ${d.name}`} data-d={d.name}>{d.mark}<small>{d.label}</small></span>
  )}<div className="knob" /></div>;
}

function Look({ bindings }: { bindings?: InputBindings }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!bindings || !host) return;
    // パッドは入力エンジンが保持する同じノードを使う。再生成・再バインドしない。
    const homes = bindings.lookParts.map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
    host.append(...bindings.lookParts);
    return () => {
      for (const { node, parent, next } of homes) {
        if (parent) parent.insertBefore(node, next?.parentNode === parent ? next : null);
      }
    };
  }, [bindings]);
  if (!bindings) return <>
    <div className="look-pad">ドラッグでマウス移動<div className="dot" /></div>
    <label className="sens">感度 <input type="range" min="0.5" max="6" step="0.1" defaultValue="2" aria-label="感度のプレビュー" /> <span>2.0</span></label>
  </>;
  return <div ref={ref} style={{ display: 'contents' }} />;
}

// bindingsを渡さない編集プレビューは実入力へ接続しない。
export function Controller({ groups, bindings }: { groups: ControlGroup[]; bindings?: InputBindings }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!bindings) return;
    ref.current?.querySelectorAll<HTMLElement>('[data-ctl]').forEach(bindings.bindControl);
    return () => bindings.releaseAll();
  }, [groups, bindings]);
  return <div ref={ref} inert={!bindings} style={{ display: 'contents' }}>{groups.length ? groups.map(group => <div className="gen-group" key={group.id}>
    <div className="gen-label">{group.label}</div>
    {group.parts.filter(p => p.kind === 'stick').map(p => p.kind === 'stick' && <Stick key={p.id} part={p} bindings={bindings} />)}
    {group.parts.some(p => p.kind === 'button') && <div className="gen-grid">{group.parts.map(p => p.kind === 'button' &&
      <button className="key" key={p.id} data-ctl={bindings ? p.control : undefined} aria-disabled={!bindings || undefined}>{p.label}</button>)}</div>}
    {group.parts.some(p => p.kind === 'look') && <Look bindings={bindings} />}
  </div>) : <p className="gen-empty">この人数では担当する操作がありません</p>}</div>;
}

// 呼び出し元はレイアウト変更前に全解放する。Reactの描画完了後にエンジンへ参照を返す。
const roots = new WeakMap<HTMLElement, Root>();
export const buildController: BuildController = (container, game, slot, bindings) => {
  let root = roots.get(container);
  if (!root) { container.replaceChildren(); root = createRoot(container); roots.set(container, root); }
  const groups = controllerLayout(game, slot);
  flushSync(() => root.render(<Controller key={JSON.stringify(groups)} groups={groups} bindings={bindings} />));
  return groups.some(g => g.parts.some(p => p.kind === 'look'));
};
