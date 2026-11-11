// ホストのリモコンの▲▼◀▶・Enterで、PC画面のボタンやプルダウンを順に選んで操作する (#294)。
// PCのキーボードの矢印も同じ規則で動かす。DOMの型だけに依存し、Nodeの試験から呼べるようにする。
export const REMOTE_FOCUSABLE = 'button,a,summary,select,input,[data-swap]';
const ARROWS = ['LEFT', 'RIGHT', 'UP', 'DOWN'];

type Focusable = {focus(): void; disabled?: boolean; getClientRects(): ArrayLike<unknown>};
type SelectLike = {tagName: string; disabled?: boolean; selectedIndex: number; options: ArrayLike<{disabled?: boolean}>; dispatchEvent(event: Event): boolean};

/** 見えていて押せるものだけを、画面に出ている順に残す */
export function usableControls<T extends Focusable>(list: Iterable<T>) {
  return [...list].filter((el) => el.getClientRects().length && !el.disabled);
}

/** 矢印で次・前へフォーカスを移す。端では反対側へ回る。動かしたら true */
export function moveRemoteFocus<T extends Focusable>(controls: T[], active: unknown, control: string) {
  if (!ARROWS.includes(control) || !controls.length) return false;
  const i = controls.indexOf(active as T);
  const step = control === 'LEFT' || control === 'UP' ? -1 : 1;
  // まだ何も選んでいないときは、下・右なら先頭、上・左なら末尾から始める
  const next = i < 0 ? (step > 0 ? 0 : controls.length - 1) : (i + step + controls.length) % controls.length;
  controls[next].focus();
  return true;
}

const isSelect = (el: unknown): el is SelectLike => !!el && typeof el === 'object' && (el as {tagName?: string}).tagName === 'SELECT';

/**
 * プルダウンにフォーカスがあるときの◀▶。リモコンからはプルダウンの一覧を開けないので、選択肢を1つずつ切り替える。
 * 端では止まる (「送らない」⇔最後のキーを誤って行き来しない)。値が変わったら change を送り、画面の onChange に任せる
 */
export function stepRemoteSelect(active: unknown, control: string) {
  if (!isSelect(active) || (control !== 'LEFT' && control !== 'RIGHT')) return false;
  if (active.disabled) return true;
  const step = control === 'LEFT' ? -1 : 1;
  let j = active.selectedIndex + step;
  while (j >= 0 && j < active.options.length && active.options[j].disabled) j += step;
  if (j < 0 || j >= active.options.length) return true;
  active.selectedIndex = j;
  active.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
}

export {isSelect as isRemoteSelect};
