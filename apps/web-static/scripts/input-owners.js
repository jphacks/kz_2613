// 入力の保持元とcontrolを対応させる。通信・epoch・DOMは呼出し側が管理する。
// 最初の保持元だけdownし、最後の保持元が離れたときだけupする。
export function createInputOwners({ down, up }) {
  const byOwner = new Map(), byControl = new Map();
  function press(owner, control, at) {
    if (byOwner.get(owner)?.has(control)) return false;
    const owners = byControl.get(control);
    // 送信できない押下は保持済みと扱わず、後から片割れのupを送らない。
    if (!owners && !down(control, at)) return false;
    const controls = byOwner.get(owner) || new Set();
    controls.add(control); byOwner.set(owner, controls);
    const next = owners || new Set();
    next.add(owner); byControl.set(control, next);
    return true;
  }
  function release(owner, control) {
    const controls = byOwner.get(owner);
    if (!controls?.delete(control)) return false;
    if (!controls.size) byOwner.delete(owner);
    const owners = byControl.get(control);
    owners.delete(owner);
    if (!owners.size) { byControl.delete(control); up(control); }
    return true;
  }
  function releaseOwner(owner) {
    for (const control of [...(byOwner.get(owner) || [])]) release(owner, control);
  }
  function releaseAll() {
    const controls = [...byControl.keys()];
    byOwner.clear(); byControl.clear();
    for (const control of controls) up(control);
  }
  return { press, release, releaseOwner, releaseAll, isHeld: control => byControl.has(control) };
}
