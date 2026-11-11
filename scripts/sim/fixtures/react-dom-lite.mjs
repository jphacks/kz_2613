// react-dom/client を Node で動かすための最小限の DOM。レイアウト・CSSは扱わず、
// 要素の木・属性・イベント登録だけを持つ。useLayoutEffect の実行回数や解放を確かめる試験に使う。
class Node {
  constructor(document, nodeType, nodeName) {
    this.ownerDocument = document; this.nodeType = nodeType; this.nodeName = nodeName;
    this.childNodes = []; this.parentNode = null; this.listeners = new Map();
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] ?? null : null; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  appendChild(child) { child.parentNode?.removeChild(child); this.childNodes.push(child); child.parentNode = this; return child; }
  insertBefore(child, before) {
    if (!before) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    this.childNodes.splice(this.childNodes.indexOf(before), 0, child); child.parentNode = this; return child;
  }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child; }
  addEventListener(type, fn) { const list = this.listeners.get(type) ?? []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(f => f !== fn)); }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) { if (this.nodeType === 3) this.nodeValue = String(value); else { this.childNodes = []; if (value !== '') this.appendChild(this.ownerDocument.createTextNode(String(value))); } }
}
class Element extends Node {
  constructor(document, tag) {
    super(document, 1, tag.toUpperCase());
    this.tagName = this.nodeName; this.localName = tag; this.namespaceURI = 'http://www.w3.org/1999/xhtml';
    this.attributes = new Map(); this.style = new Proxy({}, { get: (t, k) => k === 'setProperty' ? (n, v) => { t[n] = v; } : t[k] ?? '', set: (t, k, v) => { t[k] = v; return true; } });
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get className() { return this.getAttribute('class') ?? ''; }
  get classList() { const el = this; return { add() {}, remove() {}, contains: name => el.className.split(/\s+/).includes(name) }; }
  matches(selector) {
    // 試験で使う形だけ: タグ名、.class、[attr]、[attr="v"]
    const m = selector.match(/^([a-z]*)(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
    if (!m) throw Error('未対応のセレクター: ' + selector);
    const [, tag, cls, attr, value] = m;
    return (!tag || this.localName === tag) && (!cls || this.className.split(/\s+/).includes(cls))
      && (!attr || (this.hasAttribute(attr) && (value === undefined || this.getAttribute(attr) === value)));
  }
  querySelectorAll(selector) { const out = []; const walk = n => { for (const c of n.children) { if (c.matches(selector)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600 }; }
  setPointerCapture() {} releasePointerCapture() {}
}
class Text extends Node { constructor(document, value) { super(document, 3, '#text'); this.nodeValue = String(value); } }
class Comment extends Node { constructor(document, value) { super(document, 8, '#comment'); this.nodeValue = String(value); } }
class Document extends Node {
  constructor() { super(null, 9, '#document'); this.ownerDocument = null; this.documentElement = this.createElement('html'); this.body = this.createElement('body'); this.documentElement.appendChild(this.body); this.appendChild(this.documentElement); this.activeElement = this.body; this.defaultView = globalThis; }
  createElement(tag) { return new Element(this, tag); }
  createElementNS(_, tag) { return new Element(this, tag); }
  createTextNode(value) { return new Text(this, value); }
  createComment(value) { return new Comment(this, value); }
  getElementById(id) { return this.documentElement.querySelectorAll('*').find?.(e => e.getAttribute('id') === id) ?? null; }
}
for (const C of [Node, Element, Text, Comment, Document]) C.prototype.ELEMENT_NODE = 1;

/** 新しい document を作って globalThis に置く。react-dom/client はこの後に読み込む */
export function installDom() {
  const document = new Document();
  Object.assign(globalThis, { document, window: globalThis, Node, Element, HTMLElement: Element, HTMLIFrameElement: class {}, Text, Comment, Document });
  globalThis.navigator ??= { userAgent: 'node' };
  globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}
