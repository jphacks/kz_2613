// 操作定義 (game.profile) と分担 (game.assigned) から、その人の操作画面を作る (#60・#105)。
// Minecraft は実機で確かめた専用の画面を使い、それ以外のゲームでこの画面を使う。
// ボタンは "act:<操作ID>" を送る。ホストは割り当てた操作だけを、ゲームのキー設定に合わせて送る。

// 方向の操作の見分け方 (スティックの上・左・右・下)
const DIRS = [
  ['up', /(^|[/_ -])(forward|up|moveup|accelerate)$/i, '▲'],
  ['left', /(^|[/_ -])(left|moveleft|steer_left)$/i, '◀'],
  ['right', /(^|[/_ -])(right|moveright|steer_right)$/i, '▶'],
  ['down', /(^|[/_ -])(back|down|movedown|brake)$/i, '▼'],
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * この人に割り当てた操作。定義のないゲームと 3人 (P1〜P3) の Minecraft は null = 専用の画面を使う。
 * Minecraft も 2人・4人ではこの画面を使う (#105、ホストの game.fixedControls)
 */
export function myActions(game, me) {
  const p = game?.profile;
  if (!p || (p.id === 'minecraft-java' && game.fixedControls !== false) || !game.assigned || !Object.keys(game.assigned).length) return null;
  return (game.assigned[me] || []).map((id) => p.actions.find((a) => a.id === id)).filter(Boolean);
}

/** 画面を作り直す必要があるかの判定に使う鍵 */
export function generatedKey(game, me) {
  const acts = myActions(game, me);
  return acts ? JSON.stringify([game.profile.id, acts.map((a) => a.id), acts.map((a) => game.keys?.actions?.[a.id]?.label ?? null)]) : '';
}

/** container に操作画面を作る。lookParts は視点のパッドと感度 (担当するときだけ移す) */
export function buildGenerated(container, game, me, { bindControl, bindStick = () => {}, lookParts }) {
  const acts = myActions(game, me) || [];
  const keyOf = (a) => game.keys?.actions?.[a.id]?.label ?? '送らない';
  container.innerHTML = '';
  let stick = null;
  const groups = new Map();
  for (const a of acts) {
    const g = game.profile.groups.find((x) => x.id === a.group);
    if (!groups.has(a.group)) groups.set(a.group, { label: g?.label || a.group, acts: [] });
    groups.get(a.group).acts.push(a);
  }
  for (const { label, acts: list } of groups.values()) {
    const sec = document.createElement('div');
    sec.className = 'gen-group';
    sec.innerHTML = `<div class="gen-label">${esc(label)}</div>`;
    const buttons = list.filter((a) => a.type === 'button');
    // 方向の操作が 2 つ以上あればスティックにする (#139。斜めは 2 方向を同時に押す)。1 人に 1 つまで
    const dir = DIRS.map(([name, rx, mark]) => [name, buttons.find((a) => rx.test(a.id)), mark]).filter(([, a]) => a);
    const used = new Set();
    if (dir.length >= 2 && !stick) {
      stick = { el: document.createElement('div'), codes: {} };
      stick.el.className = 'stick gen-stick';
      for (const [name, a, mark] of dir) {
        used.add(a.id);
        stick.codes[name] = `act:${a.id}`;
        stick.el.insertAdjacentHTML('beforeend', `<span class="dir ${name}" data-d="${name}">${mark}<small>${esc(keyOf(a))}</small></span>`);
      }
      stick.el.insertAdjacentHTML('beforeend', '<div class="knob"></div>');
      sec.append(stick.el);
    }
    const grid = document.createElement('div');
    grid.className = 'gen-grid';
    for (const a of list) {
      if (used.has(a.id)) continue;
      if (a.type === 'button') grid.insertAdjacentHTML('beforeend', `<button class="key" data-ctl="act:${esc(a.id)}">${esc(a.label)}<small>${esc(keyOf(a))}</small></button>`);
      else if (a.type === 'wheel') {
        grid.insertAdjacentHTML('beforeend', `<button class="key" data-ctl="act:${esc(a.id)}:up">◀ ${esc(a.label)}<small>ホイール↑</small></button>`);
        grid.insertAdjacentHTML('beforeend', `<button class="key" data-ctl="act:${esc(a.id)}:down">${esc(a.label)} ▶<small>ホイール↓</small></button>`);
      }
    }
    if (grid.children.length) sec.append(grid);
    if (list.some((a) => a.type === 'mouseDelta') && lookParts?.length) sec.append(...lookParts);
    container.append(sec);
  }
  if (!acts.length) container.innerHTML = '<p class="gen-empty">この人数では担当する操作がありません</p>';
  container.querySelectorAll('[data-ctl]').forEach(bindControl);
  bindStick(stick?.el || null, stick?.codes || {});
  return acts.some((a) => a.type === 'mouseDelta');
}
