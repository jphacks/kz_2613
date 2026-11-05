// 製品のES modulesを隔離VMで実行する。DOM/時計/WS/RTCだけを置き換え、OS入力や実通信は使わない。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

class Events {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, fn) { const list = this.handlers.get(type) || []; list.push(fn); this.handlers.set(type, list); }
  fire(type, values = {}) {
    const event = { type, pointerId: 1, clientX: 100, clientY: 100, timeStamp: 1000, preventDefault() {}, ...values };
    for (const fn of this.handlers.get(type) || []) fn(event);
    return event;
  }
}

class Element extends Events {
  constructor(document, tag = 'div', id = '') {
    super(); this.document = document; this.tagName = tag.toUpperCase(); this.id = id;
    this.dataset = {}; this.children = []; this.parentElement = null; this.style = { setProperty() {} };
    this.textContent = ''; this.value = '2'; this.hidden = false; this.open = false; this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, enabled) => { if (enabled) this.classes.add(name); else this.classes.delete(name); },
      contains: name => this.classes.has(name),
    };
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  set innerHTML(html) { this.children = []; this.insertAdjacentHTML('beforeend', html); }
  get innerHTML() { return this.children.map(node => node.textContent).join(''); }
  insertAdjacentHTML(_, html) {
    // この試験ではレイアウトを扱わず、生成された要素の属性とイベントだけを使う。
    for (const match of html.matchAll(/<([a-z]+)\b([^>]*)>/gi)) {
      const element = new Element(this.document, match[1]);
      for (const [, name, value] of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
        if (name === 'class') element.className = value;
        else if (name.startsWith('data-')) element.dataset[name.slice(5)] = value;
        else element[name] = value;
      }
      this.append(element);
    }
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = this; this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  descendants() { return this.children.flatMap(child => [child, ...(child.descendants?.() || [])]); }
  querySelectorAll(selector) { return this.descendants().filter(node => matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 200 }; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  fire(type, values = {}) {
    const event = super.fire(type, values);
    if (type.startsWith('pointer') && values.bubbles !== false) this.document.fire(type, event);
    return event;
  }
}

function matches(element, selector) {
  if (selector.startsWith('.')) return element.classes?.has(selector.slice(1));
  const attribute = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  return !!attribute && Object.hasOwn(element.dataset || {}, attribute[1])
    && (attribute[2] === undefined || element.dataset[attribute[1]] === attribute[2]);
}

export function controllerHarness() {
  let now = 1000, timerId = 0;
  const timers = new Map(), sockets = [], peers = [], storage = new Map();
  const document = new Events(), window = new Events(), portrait = new Events(), elements = new Map();
  portrait.matches = true; document.hidden = false;
  document.body = new Element(document, 'body'); document.body.dataset = {};
  document.documentElement = new Element(document, 'html');
  const el = id => {
    if (!elements.has(id)) { const node = new Element(document, 'div', id); elements.set(id, node); document.body.append(node); }
    return elements.get(id);
  };
  document.getElementById = el;
  document.createElement = tag => new Element(document, tag);
  document.createTextNode = text => ({ textContent: text });
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.querySelector = selector => selector === '#lookHome .sens' ? el('sensArea') : document.querySelectorAll(selector)[0];
  for (const id of ['v-remote', 'v-wait', 'v-gen']) el(id).className = 'view';
  el('lookHome').append(el('pad'), el('sensArea'));
  const dot = document.createElement('span'); dot.className = 'dot'; el('pad').append(dot);
  for (const control of ['REMOTE_LEFT', 'REMOTE_RIGHT', 'UP', 'ENTER']) {
    const node = document.createElement('button'); node.dataset.ctl = control; el('v-remote').append(node);
  }
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(raw) { if (this.readyState !== 1) throw new Error('closed socket'); this.sent.push(JSON.parse(raw)); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    close(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  }
  class Peer {
    constructor(config) { this.config = config; this.closed = false; peers.push(this); }
    createDataChannel(name, options) {
      this.name = name; this.options = options;
      this.channel = { readyState: 'connecting', sent: [], send(raw) { this.sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; } };
      return this.channel;
    }
    async createOffer() { return { type: 'offer', sdp: 'test-only' }; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription(description) { this.remoteDescription = description; }
    async addIceCandidate(candidate) { this.candidate = candidate; }
    close() { this.closed = true; }
  }
  const addTimer = (fn, ms, repeat) => { const id = ++timerId; timers.set(id, { fn, ms, repeat, at: now + ms }); return id; };
  const context = vm.createContext({
    document, window, console, navigator: { userAgent: '自動試験用' }, location: { host: 'test.invalid' },
    performance: { now: () => now, timeOrigin: 0 }, TextDecoder, TextEncoder, ArrayBuffer, Blob,
    WebSocket: Socket, RTCPeerConnection: Peer,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => 'test-client' }, matchMedia: () => portrait,
    setInterval: (fn, ms) => addTimer(fn, ms, true), clearInterval: id => timers.delete(id),
    setTimeout: (fn, ms) => addTimer(fn, ms, false), clearTimeout: id => timers.delete(id),
    alert() {}, confirm: () => true,
  });
  window.RTCPeerConnection = Peer;
  const modules = new Map();
  function load(filename) {
    const absolute = path.resolve(filename);
    if (modules.has(absolute)) return modules.get(absolute);
    const imports = {}, names = [];
    let source = fs.readFileSync(absolute, 'utf8');
    source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, bindings, relative) => {
      imports[relative] = load(path.resolve(path.dirname(absolute), relative));
      return `const {${bindings}} = imports[${JSON.stringify(relative)}];`;
    });
    source = source.replace(/\bexport\s+(function|const)\s+(\w+)/g, (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
    const run = new vm.Script(`(function(imports) {\n${source}\nreturn {${names.join(',')}};\n})`, { filename: absolute }).runInContext(context);
    const exports = run(imports); modules.set(absolute, exports); return exports;
  }
  load(path.join(ROOT, 'apps/web-static/scripts/controller.js'));
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next; now = timer.at;
      if (timer.repeat) timer.at += timer.ms; else timers.delete(id);
      timer.fn();
    }
    now = end;
  }
  const game = (overrides = {}) => ({
    title: 'test', titleName: '試験', phase: 'coop', epoch: 7, connected: ['P1', 'P2'], participants: ['P1', 'P2'],
    remoteRoute: 'game', readyReasons: [], canPrepare: true, canReady: true, canResume: true,
    profile: { id: 'test', name: '試験', controllerSupported: true, groups: [{ id: 'move', label: '移動' }, { id: 'action', label: '操作' }],
      actions: [{ id: 'forward', type: 'button', group: 'move' }, { id: 'right', type: 'button', group: 'move' },
        { id: 'attack', type: 'button', group: 'action' }, { id: 'jump', type: 'button', group: 'action' }, { id: 'look', type: 'mouseDelta', group: 'action' }] },
    assigned: { P1: ['forward', 'right', 'attack', 'jump', 'look'], P2: [] },
    keys: { actions: { attack: { label: '左クリック' }, jump: { label: 'Space' } } }, ...overrides,
  });
  const inputs = () => sockets.flatMap(socket => socket.sent).filter(message => message.type === 'input');
  const messages = () => sockets.flatMap(socket => socket.sent);
  const control = name => document.querySelectorAll('[data-ctl]').find(node => node.dataset.ctl === name);
  async function ready(overrides = {}) {
    sockets[0].open(); sockets[0].receive({ type: 'welcome', slot: 'P1', isHost: true, role: 'ホスト', token: 'test-token' });
    sockets[0].receive({ type: 'game', game: game(overrides) });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  }
  return { document, window, portrait, el, sockets, peers, storage, advance, game, ready, inputs, messages, control };
}
