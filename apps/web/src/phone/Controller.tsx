import { useLayoutEffect, useRef } from 'react';
import type {ControlGroup,ControlPart} from '../shared/controller-layout';
import type { InputBindings } from '../shared/contracts';

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

function Look({bindings}:{bindings?:InputBindings}) {
  const pad=useRef<HTMLDivElement>(null), sensitivity=useRef<HTMLInputElement>(null), value=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    if(!bindings||!pad.current||!sensitivity.current||!value.current)return;
    return bindings.bindLook(pad.current,sensitivity.current,value.current);
  },[bindings]);
  return <>
    <div ref={pad} id={bindings?'pad':undefined} className="look-pad">ドラッグでマウス移動<div className="dot" /></div>
    <label className="sens">感度 <input ref={sensitivity} type="range" id={bindings?'sens':undefined} min="0.5" max="6" step="0.1" defaultValue="2" aria-label="感度" /> <span ref={value} id={bindings?'sensVal':undefined}>2.0</span></label>
  </>;
}

// bindingsを渡さない編集プレビューは実入力へ接続しない。
export function Controller({ groups, bindings }: { groups: ControlGroup[]; bindings?: InputBindings }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!bindings||!ref.current) return;
    const cleanup=[...ref.current.querySelectorAll<HTMLElement>('[data-ctl]')].map(element=>bindings.bindControl(element));
    return () => {bindings.releaseAll();for(const dispose of cleanup)dispose?.();};
  }, [groups, bindings]);
  return <div ref={ref} inert={!bindings} style={{ display: 'contents' }}>{groups.length ? groups.map(group => <div className="gen-group" key={group.id}>
    <div className="gen-label">{group.label}</div>
    {group.parts.filter(p => p.kind === 'stick').map(p => p.kind === 'stick' && <Stick key={p.id} part={p} bindings={bindings} />)}
    {group.parts.some(p => p.kind === 'button') && <div className="gen-grid">{group.parts.map(p => p.kind === 'button' &&
      <button className="key" key={p.id} data-ctl={bindings ? p.control : undefined} aria-disabled={!bindings || undefined}>{p.label}</button>)}</div>}
    {group.parts.some(p => p.kind === 'look') && <Look bindings={bindings} />}
  </div>) : <p className="gen-empty">この人数では担当する操作がありません</p>}</div>;
}
