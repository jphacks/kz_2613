import type { Action, ControllerGame, Direction, Slot } from './contracts';
import { inputKeyLabel, inputGroupLabel } from './model/presentation.ts';

export type ControlPart =
  | { kind: 'button'; id: string; control: string; label: string }
  | { kind: 'stick'; id: string; directions: { name: Direction; control: string; label: string }[] }
  | { kind: 'look'; id: string };
export interface ControlGroup { id: string; label: string; parts: ControlPart[] }

/** ボタンだけの担当（6個まで）は、親指の届く下側に大きく置く。3個までは1列にする (#301) */
export function buttonLayout(groups: ControlGroup[]): string {
  const parts = groups.flatMap(group => group.parts);
  if (!parts.length || parts.length > 6 || parts.some(part => part.kind !== 'button')) return '';
  return parts.length <= 3 ? 'few-buttons single-column' : 'few-buttons';
}
// 矢印は記号の文字ではなく SVG のアイコンで描く (#515、phone/Controller.tsx の Stick)
const DIRECTIONS: [Direction, RegExp][] = [
  ['up', /(^|[/_ -])(forward|up|moveup|accelerate)$/i],
  ['left', /(^|[/_ -])(left|moveleft|steer_left)$/i],
  ['right', /(^|[/_ -])(right|moveright|steer_right)$/i],
  ['down', /(^|[/_ -])(back|down|movedown|brake)$/i],
];

// 編集プレビューも利用する描画モデル。担当IDの集合との積だけを描く。
export function controllerLayout(game: ControllerGame, slot: Slot): ControlGroup[] {
  const allowed = new Set(game.assigned?.[slot] ?? []);
  const groups = new Map<string, Action[]>();
  for (const id of allowed) {
    const action = game.profile.actions.find(a => a.id === id);
    if (!action) continue;
    const key = action.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }
  let hasStick = false,hasLook=false;
  return [...groups].map(([id, actions]) => {
    const parts: ControlPart[] = [];
    const directions = DIRECTIONS.flatMap(([name, rx]) => {
      const action = actions.find(a => a.type === 'button' && rx.test(a.id));
      return action ? [{ name, control: `act:${action.id}`, label: inputKeyLabel(game, action) }] : [];
    });
    const used = new Set<string>();
    if (directions.length >= 2 && !hasStick) {
      hasStick = true;
      directions.forEach(d => used.add(d.control.slice(4)));
      parts.push({ kind: 'stick', id: `${id}:stick`, directions });
    }
    for (const a of actions) {
      if (used.has(a.id)) continue;
      if (a.type === 'button') parts.push({ kind: 'button', id: a.id, control: `act:${a.id}`, label: inputKeyLabel(game, a) });
      if (a.type === 'wheel') for (const [direction, label] of [['up', 'ホイール上'], ['down', 'ホイール下']]) {
        parts.push({ kind: 'button', id: `${a.id}:${direction}`, control: `act:${a.id}:${direction}`, label });
      }
    }
    // 現行の視点エンジンは1枚のパッドを所有する。複数の操作グループでも重複IDを作らない。
    if (!hasLook&&actions.some(a => a.type === 'mouseDelta')) {hasLook=true;parts.push({ kind: 'look', id: `${id}:look` });}
    return { id, label: inputGroupLabel(game, actions), parts };
  });
}
