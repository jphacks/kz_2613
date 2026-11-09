// 最初の保持元だけdown、最後の保持元だけup。DOM・通信・Reactに依存しない。
export type InputOwner = number | string | symbol;
export interface OwnerCallbacks {
  down(control: string, at: number | undefined): boolean;
  up(control: string): unknown;
}
export function createInputOwners({down, up}: OwnerCallbacks) {
  const byOwner = new Map<InputOwner, Set<string>>();
  const byControl = new Map<string, Set<InputOwner>>();
  function press(owner: InputOwner, control: string, at?: number) {
    if (byOwner.get(owner)?.has(control)) return false;
    const owners = byControl.get(control);
    if (!owners && !down(control, at)) return false;
    const controls = byOwner.get(owner) ?? new Set<string>();
    controls.add(control); byOwner.set(owner, controls);
    const next = owners ?? new Set<InputOwner>();
    next.add(owner); byControl.set(control, next);
    return true;
  }
  function release(owner: InputOwner, control: string) {
    const controls = byOwner.get(owner);
    if (!controls?.delete(control)) return false;
    if (!controls.size) byOwner.delete(owner);
    const owners = byControl.get(control);
    if (!owners) return false;
    owners.delete(owner);
    if (!owners.size) { byControl.delete(control); up(control); }
    return true;
  }
  function releaseOwner(owner: InputOwner) {
    for (const control of [...(byOwner.get(owner) ?? [])]) release(owner, control);
  }
  function releaseAll() {
    const controls = [...byControl.keys()];
    byOwner.clear(); byControl.clear();
    for (const control of controls) up(control);
  }
  return {press, release, releaseOwner, releaseAll, isHeld: (control: string) => byControl.has(control)};
}
