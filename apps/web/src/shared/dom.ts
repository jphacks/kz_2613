export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`必要な画面要素がありません: ${id}`);
  return element as T;
}
