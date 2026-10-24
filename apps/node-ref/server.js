// Re:Cooplay 通信プロトタイプ
// PC(モバイルホットスポット親機) 上で HTTP + WebSocket を配信し、スマホ3台の入力を受けて
// Windows のキーボード / マウス入力として注入する。インターネットは一切使わない（外部CDNも読まない）。

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { inputAvailable, inputError, sendKey, sendMouseButton, sendMouseMove, sendWheel } from './input.js';
import { OUTPUTS, REMOTE_CONTROLS, ROLE_CONTROLS } from './controls.js';
import { createPeer } from './rtc.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOG_DIR = path.join(ROOT, 'logs');

const config = loadConfig();
const PORT = Number(process.env.PORT || config.port || 8080);
const SLOT_NAMES = ['P1', 'P2', 'P3'];
const SLOT_ROLES = { P1: '移動・ホスト', P2: '視点', P3: 'アクション' };
const HEARTBEAT_TIMEOUT_MS = 4000; // この時間メッセージが来なければ切断扱い
const MIN_HOLD_MS = 60; // 押下は最低この時間続ける (ゲームは 50ms ごとに入力を読む)
const MIN_GAP_MS = 50; // 解放も最低この時間続けてから次を押す (連打を 1 回ずつ認識させる)
const MAX_QUEUE = 8; // 通信が詰まって溜まった連打は 4 回分まで (それ以上は古い方を捨て、遅延が積み上がるのを防ぐ)

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// ---------- ログ (コンソール + JSONL ファイル + モニター) ----------
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = fs.createWriteStream(
  path.join(LOG_DIR, `session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`),
  { flags: 'a' },
);

const monitors = new Set(); // PC 上のダッシュボード / 疑似ゲーム画面

function record(kind, data = {}) {
  const entry = { t: Date.now(), kind, ...data };
  logFile.write(JSON.stringify(entry) + '\n');
  return entry;
}

function log(kind, data = {}) {
  const entry = record(kind, data);
  const time = new Date(entry.t).toLocaleTimeString('ja-JP', { hour12: false });
  console.log(`[${time}] ${kind}`, Object.keys(data).length ? JSON.stringify(data) : '');
  broadcastMonitors({ type: 'log', entry });
}

// ---------- ネットワーク情報 ----------
// ホットスポットの IP (通常 192.168.137.1) はホットスポットを ON にしたタイミングで現れるので毎回取り直す
function getAddresses() {
  const list = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      list.push({ name, address: info.address, hotspot: info.address.startsWith('192.168.137.') });
    }
  }
  return list.sort((a, b) => Number(b.hotspot) - Number(a.hotspot));
}

function escapeWifi(s) {
  return String(s).replace(/([\\;,:"])/g, '\\$1');
}

async function buildInfo() {
  const addresses = getAddresses();
  const urls = await Promise.all(
    addresses.map(async (a) => {
      const url = `http://${a.address}:${PORT}/`;
      return { ...a, url, qr: await QRCode.toString(url, { type: 'svg', margin: 1 }) };
    }),
  );
  let wifi = null;
  if (config.wifi?.ssid) {
    const payload = `WIFI:T:WPA;S:${escapeWifi(config.wifi.ssid)};P:${escapeWifi(config.wifi.password || '')};;`;
    wifi = { ssid: config.wifi.ssid, qr: await QRCode.toString(payload, { type: 'svg', margin: 1 }) };
  }
  return { port: PORT, urls, wifi };
}

// ---------- スロット (P1/P2/P3) 管理 ----------
// 一度割り当てたスロットは clientId に紐づけて保持し、切断中も他人には渡さない（再接続で元の役割に戻す）
const slots = Object.fromEntries(SLOT_NAMES.map((n) => [n, null]));

function newSlotState(clientId) {
  return {
    clientId,
    ws: null,
    connected: false,
    ip: null,
    ua: null,
    connectedAt: null,
    lastSeen: 0,
    reconnects: 0,
    pressed: new Set(),
    lastSeq: 0,
    events: 0,
    lost: 0,
    outOfOrder: 0,
    clientStats: null, // スマホ側で計測した RTT など
    rtc: null, // WebRTC データチャネル (速達便)
    rtcState: 'none',
    nextIseq: 1, // 次に処理する入力番号 (WebSocket / WebRTC のどちらで届いても番号順に 1 回だけ処理する)
    ibuf: new Map(),
    via: { ws: 0, rtc: 0 }, // どちらの経路で先に届いたか
    lookSeq: 0,
    lookCx: 0, // 視点の累積移動量 (パケットが欠けても次のパケットで取り戻せる)
    lookCy: 0,
    lookLost: 0,
  };
}

function findSlotByClient(clientId) {
  return SLOT_NAMES.find((n) => slots[n]?.clientId === clientId) || null;
}

const connectedSlots = () => SLOT_NAMES.filter((n) => slots[n]?.connected);

function slotSnapshot() {
  return SLOT_NAMES.map((name) => {
    const s = slots[name];
    if (!s) return { name, role: SLOT_ROLES[name], assigned: false };
    return {
      name,
      role: SLOT_ROLES[name],
      assigned: true,
      clientId: s.clientId,
      connected: s.connected,
      ip: s.ip,
      ua: s.ua,
      connectedAt: s.connectedAt,
      lastSeen: s.lastSeen,
      reconnects: s.reconnects,
      pressed: [...s.pressed],
      events: s.events,
      lost: s.lost,
      outOfOrder: s.outOfOrder,
      clientStats: s.clientStats,
      rtcState: s.rtcState,
      via: s.via,
      lookLost: s.lookLost,
    };
  });
}

function broadcastMonitors(msg) {
  const data = JSON.stringify(msg);
  for (const m of monitors) if (m.readyState === 1) m.send(data);
}

function broadcastPlayers(msg) {
  const data = JSON.stringify(msg);
  for (const n of SLOT_NAMES) if (slots[n]?.ws?.readyState === 1) slots[n].ws.send(data);
}

function pushState() {
  broadcastMonitors({ type: 'state', slots: slotSnapshot(), now: Date.now(), game: gameSnapshot(), inject: injectSnapshot() });
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ---------- 進行状態 ----------
// lobby: ホストがリモコンで PC を操作 / coop: 3 人の分担操作 / paused: 分担操作を停止しホストにリモコンを戻す
const game = {
  phase: 'lobby',
  required: [1, 2, 3].includes(config.requiredPlayers) ? config.requiredPlayers : 3,
  reason: null,
  // 切断による一時停止は、全員がこの時間内に戻れば自動で協力プレイに復帰する (ホストの PAUSE は対象外)
  autoResume: config.autoResume ?? true,
  autoResumeMs: Number(config.autoResumeMs ?? 15000),
  autoResumeUntil: 0,
};

function maybeAutoResume() {
  if (game.phase !== 'paused' || !game.reason?.endsWith('disconnected') || !game.autoResume) return;
  if (Date.now() > game.autoResumeUntil) return;
  // WebRTC の接続中は待つ (つながるか、失敗して WebSocket のみになってから復帰)
  if (gameSnapshot().canStart && connectedSlots().every((n) => slots[n].rtcState !== 'connecting')) setPhase('coop', 'auto resume');
}

function gameSnapshot() {
  const connected = connectedSlots();
  return { ...game, connected, canStart: connected.includes('P1') && connected.length >= game.required };
}

function pushGame() {
  const snap = gameSnapshot();
  broadcastPlayers({ type: 'game', game: snap });
  broadcastMonitors({ type: 'game', game: snap });
}

function setPhase(phase, reason) {
  if (game.phase === phase) return;
  releaseAllOutputs();
  resetLook();
  game.phase = phase;
  game.reason = reason || null;
  log('phase', { phase, reason });
  pushGame();
}

function command(slot, cmd) {
  if (slot !== 'P1') return;
  const { canStart } = gameSnapshot();
  if (cmd === 'START' && game.phase === 'lobby' && canStart) setPhase('coop', 'host start');
  else if (cmd === 'RESUME' && game.phase === 'paused' && canStart) setPhase('coop', 'host resume');
  else if (cmd === 'PAUSE' && game.phase === 'coop') setPhase('paused', 'host pause');
  else if (cmd === 'END' && game.phase !== 'lobby') setPhase('lobby', 'host end');
}

// その操作を今このスロットが使えるか → 出力 ID
function resolveControl(slot, control) {
  if (game.phase === 'coop') return ROLE_CONTROLS[slot]?.[control] || null;
  if (slot === 'P1') return REMOTE_CONTROLS[control] || null;
  return null;
}

// ---------- 入力注入 ----------
// mode: off = 注入しない / test = PC の疑似ゲーム画面にフォーカスがある時だけ / on = 常に (実ゲーム用)
const inject = { mode: ['off', 'test', 'on'].includes(config.injectMode) ? config.injectMode : 'off' };

const gameFocused = () => [...monitors].some((m) => m.page === 'game' && m.focused);
const canInject = () => inputAvailable() && (inject.mode === 'on' || (inject.mode === 'test' && gameFocused()));

function injectSnapshot() {
  return {
    mode: inject.mode,
    gameFocused: gameFocused(),
    active: canInject(),
    available: inputAvailable(),
    error: inputError(),
    minHoldMs: MIN_HOLD_MS,
    minGapMs: MIN_GAP_MS,
    outputs: Object.fromEntries(Object.entries(OUTPUTS).map(([id, o]) => [id, { label: o.label, kind: o.kind, code: o.code }])),
    down: Object.entries(outputStates).filter(([, s]) => s.physical).map(([id]) => id),
  };
}

function applyOutput(id, down, slot) {
  const o = OUTPUTS[id];
  const ok = o.kind === 'key' ? sendKey(o.scan, !!o.ext, down) : sendMouseButton(o.button, down);
  const entry = record('inject', { slot, out: id, label: o.label, state: down ? 'down' : 'up', ok });
  broadcastMonitors({ type: 'inject', entry });
}

// キー / マウスボタンごとの状態。複数人が同じ出力を押していれば全員離すまで押したまま。
// 押下・解放はキューに積み、最低押下時間・最低解放時間を守って 1 つずつ実行する。
const outputStates = {};

function outputState(id) {
  return (outputStates[id] ??= { holders: new Set(), physical: false, changedAt: 0, queue: [], timer: null });
}

function pump(id) {
  const st = outputState(id);
  if (st.timer) return;
  while (st.queue.length) {
    const next = st.queue[0];
    if (next.down === st.physical) {
      st.queue.shift();
      continue;
    }
    const wait = (st.physical ? MIN_HOLD_MS : MIN_GAP_MS) - (Date.now() - st.changedAt);
    if (wait > 0) {
      st.timer = setTimeout(() => {
        st.timer = null;
        pump(id);
      }, wait);
      return;
    }
    st.queue.shift();
    st.physical = next.down;
    st.changedAt = Date.now();
    applyOutput(id, next.down, next.slot);
  }
}

function setOutput(id, slot, down) {
  const st = outputState(id);
  const before = st.holders.size > 0;
  if (down) st.holders.add(slot);
  else st.holders.delete(slot);
  const after = st.holders.size > 0;
  if (before === after) return;
  // キューは押下/解放が交互に並ぶので、古い方から 1 組ずつ捨てれば整合は崩れない
  while (st.queue.length >= MAX_QUEUE) {
    st.queue.splice(0, 2);
    record('queue_drop', { out: id, slot });
  }
  st.queue.push({ down: after, slot });
  pump(id);
}

function releaseOutputs(slot = null) {
  for (const [id, st] of Object.entries(outputStates)) {
    if (slot) st.holders.delete(slot);
    else st.holders.clear();
    if (st.holders.size > 0) continue;
    clearTimeout(st.timer);
    st.timer = null;
    st.queue.length = 0;
    if (st.physical) {
      st.physical = false;
      st.changedAt = Date.now();
      applyOutput(id, false, slot || 'system');
    }
  }
}
const releaseAllOutputs = () => releaseOutputs(null);

function handleControl(slot, control, state) {
  const id = resolveControl(slot, control);
  const down = state === 'down';
  if (!id) return;
  const o = OUTPUTS[id];
  if (o.kind === 'wheel') {
    if (!down || !canInject()) return;
    const ok = sendWheel(o.notches);
    const entry = record('inject', { slot, out: id, label: o.label, state: 'down', ok });
    broadcastMonitors({ type: 'inject', entry });
    return;
  }
  // 押下は注入可能な時だけ受け付ける。解放は常に通す (押しっぱなしを残さない)
  if (down && !canInject()) return;
  setOutput(id, slot, down);
}

// 視点 (P2): スマホのドラッグ量をマウス相対移動として注入する。
// 届いた量をそのまま一度に動かすと、通信の揺らぎ (まとめて届く / 途切れる) がそのままカクつきになるので、
// 受け取った量を「未消化分」に積み、4ms ごとに未消化分の一定割合を少しずつ流す。
// 流す速さ (時定数) はパケットの到着間隔に合わせて自動調整する: 安定した端末は遅延少なく、途切れがちな端末は滑らかさ優先。
const LOOK_SMOOTH_MIN_MS = Number(config.lookSmoothMinMs ?? 30);
const LOOK_SMOOTH_MAX_MS = Number(config.lookSmoothMaxMs ?? 120);
const LOOK_TICK_MS = 4;
const look = { px: 0, py: 0, fx: 0, fy: 0, sumX: 0, sumY: 0, n: 0, lastTick: Date.now(), lastArrive: 0, gaps: [], tau: LOOK_SMOOTH_MIN_MS };
function handleLook(slot, dx, dy) {
  if (game.phase !== 'coop' || slot !== 'P2' || !canInject()) return;
  const now = Date.now();
  const gap = now - look.lastArrive;
  look.lastArrive = now;
  // 直近 2 秒のドラッグ中で一番長い途切れに合わせる (まとめて届く端末は平均だと間隔が短く見えるため最大値を使う)
  if (gap < 1000) look.gaps.push({ at: now, gap });
  while (look.gaps.length && now - look.gaps[0].at > 2000) look.gaps.shift();
  const maxGap = look.gaps.reduce((m, g) => Math.max(m, g.gap), 0);
  look.tau = Math.min(LOOK_SMOOTH_MAX_MS, Math.max(LOOK_SMOOTH_MIN_MS, maxGap * 0.5));
  look.px += dx;
  look.py += dy;
}
function resetLook() {
  look.px = look.py = look.fx = look.fy = 0;
}
setInterval(() => {
  const now = Date.now();
  const dt = now - look.lastTick;
  look.lastTick = now;
  if (!look.px && !look.py) return;
  if (game.phase !== 'coop' || !canInject()) return resetLook();
  // 未消化分が 0.5px 未満なら残りを全部流して終わらせる
  const k = 1 - Math.exp(-dt / look.tau);
  const small = Math.abs(look.px) < 0.5 && Math.abs(look.py) < 0.5;
  const ox = small ? look.px : look.px * k;
  const oy = small ? look.py : look.py * k;
  look.px -= ox;
  look.py -= oy;
  look.fx += ox;
  look.fy += oy;
  const ix = Math.trunc(look.fx);
  const iy = Math.trunc(look.fy);
  look.fx -= ix;
  look.fy -= iy;
  if (ix || iy) {
    sendMouseMove(ix, iy);
    look.sumX += ix;
    look.sumY += iy;
    look.n++;
  }
}, LOOK_TICK_MS);
// 視点の移動量は 100ms ごとにまとめて通知 / 記録
setInterval(() => {
  if (!look.n) return;
  const entry = record('inject_look', { slot: 'P2', dx: look.sumX, dy: look.sumY, n: look.n, smoothMs: Math.round(look.tau) });
  broadcastMonitors({ type: 'look', entry });
  look.sumX = look.sumY = look.n = 0;
}, 100);

function setInjectMode(mode) {
  const before = canInject();
  inject.mode = mode;
  if (before && !canInject()) releaseAllOutputs();
  log('inject_mode', { mode });
  pushState();
}

function onFocusChange() {
  if (!canInject()) releaseAllOutputs();
  pushState();
}

function markDisconnected(name, reason) {
  const s = slots[name];
  if (!s || !s.connected) return;
  s.connected = false;
  s.ws = null;
  const released = [...s.pressed];
  s.pressed.clear();
  releaseOutputs(name);
  log('disconnect', { slot: name, reason, released });
  // 協力プレイ中に誰かが切れたら共同入力を止める (ホストの自動交代はしない)
  if (game.phase === 'coop' || (game.phase === 'paused' && game.reason?.endsWith('disconnected'))) {
    game.autoResumeUntil = Date.now() + game.autoResumeMs;
    if (game.phase === 'coop') setPhase('paused', `${name} disconnected`);
    else pushGame();
  } else pushGame();
  pushState();
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

const PC_ONLY = new Set(['/host.html', '/game.html']);
const ROUTES = { '/': '/index.html', '/host': '/host.html', '/game': '/game.html' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(await buildInfo()));
    return;
  }

  const file = ROUTES[url.pathname] || url.pathname;
  if (PC_ONLY.has(file) && !isLoopback(req.socket.remoteAddress)) {
    res.writeHead(403).end('this page is only available on the PC');
    return;
  }
  const filePath = path.join(PUBLIC_DIR, path.normalize(file));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(400).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

// ---------- プレイヤーからのメッセージ (WebSocket / WebRTC 共通) ----------
function handlePlayerMessage(slotName, s, msg, via) {
  s.lastSeen = Date.now();

  if (via === 'ws' && (msg.type === 'input' || msg.type === 'look')) {
    // WebSocket 経路の欠落・順序検知 (WebRTC は再送なしなので対象外)
    const seq = Number(msg.seq);
    if (seq > s.lastSeq + 1) s.lost += seq - s.lastSeq - 1;
    if (seq <= s.lastSeq) s.outOfOrder++;
    else s.lastSeq = seq;
  }

  switch (msg.type) {
    case 'ping':
      if (msg.stats) s.clientStats = msg.stats;
      send(s.ws, { type: 'pong', t: msg.t });
      return;
    case 'ka': // WebRTC の生存確認 (スマホの無線を起こしておく役目も兼ねる)
      s.rtc?.send({ type: 'kpong', t: msg.t });
      return;
    case 'command':
      if (via !== 'ws') return;
      log('command', { slot: slotName, cmd: msg.cmd });
      command(slotName, msg.cmd);
      return;
    case 'rtc-offer':
      startRtc(slotName, s, String(msg.sdp || ''));
      return;
    case 'rtc-cand':
      s.rtc?.candidate(String(msg.cand || ''), msg.mid);
      return;
    case 'input':
      acceptInput(slotName, s, msg, via);
      return;
    case 'look':
      acceptLook(slotName, s, msg);
      return;
  }
}

function startRtc(slotName, s, sdp) {
  s.rtc?.close();
  const ws = s.ws;
  const peer = createPeer({
    id: slotName,
    sendSignal: (m) => s.ws === ws && send(ws, m),
    onMessage: (m) => s.ws === ws && s.rtc === peer && handlePlayerMessage(slotName, s, m, 'rtc'),
    onState: (state) => {
      if (s.rtc !== peer) return;
      const prev = s.rtcState;
      if (state === 'channel-open') s.rtcState = 'open';
      else if (state === 'channel-closed' || state === 'failed' || state === 'closed') s.rtcState = 'failed';
      if (prev !== s.rtcState) {
        log('rtc', { slot: slotName, state: s.rtcState });
        pushState();
        maybeAutoResume();
      }
    },
  });
  s.rtc = peer;
  s.rtcState = 'connecting';
  peer.offer(sdp);
  // つながらなければ WebSocket のみで続行 (自動復帰も待たせない)
  setTimeout(() => {
    if (s.rtc === peer && s.rtcState === 'connecting') {
      s.rtcState = 'failed';
      log('rtc', { slot: slotName, state: 'timeout' });
      pushState();
      maybeAutoResume();
    }
  }, 5000);
}

// 入力は同じものが WebSocket と WebRTC の両方から届く。番号順に、先に届いた方で 1 回だけ処理する。
// 番号が飛んだら (WebRTC で欠けた) WebSocket の到着を待つので、押下と解放の順番が入れ替わることはない。
function acceptInput(slotName, s, msg, via) {
  const iseq = Number(msg.iseq);
  if (!(iseq >= s.nextIseq) || s.ibuf.has(iseq)) return;
  if (s.ibuf.size > 200) s.ibuf.clear();
  s.ibuf.set(iseq, { msg, via });
  while (s.ibuf.has(s.nextIseq)) {
    const item = s.ibuf.get(s.nextIseq);
    s.ibuf.delete(s.nextIseq);
    s.nextIseq++;
    processInput(slotName, s, item.msg, item.via);
  }
}

function processInput(slotName, s, msg, via) {
  s.events++;
  s.via[via]++;
  send(s.ws, { type: 'ack', iseq: msg.iseq, t: msg.t, via });
  if (msg.state === 'down') s.pressed.add(msg.button);
  else s.pressed.delete(msg.button);
  const entry = record('input', { slot: slotName, button: msg.button, state: msg.state, iseq: msg.iseq, via, burst: !!msg.burst });
  if (!msg.burst) {
    handleControl(slotName, msg.button, msg.state);
    broadcastMonitors({ type: 'log', entry });
  }
  pushStateThrottled();
}

// 視点は累積値で届くので、欠けたパケットの分も次のパケットで取り戻せる。古いパケットは捨てる
function acceptLook(slotName, s, msg) {
  const lseq = Number(msg.lseq);
  if (!(lseq > s.lookSeq)) return;
  if (lseq > s.lookSeq + 1) s.lookLost += lseq - s.lookSeq - 1;
  s.lookSeq = lseq;
  const cx = Number(msg.cx) || 0;
  const cy = Number(msg.cy) || 0;
  const dx = cx - s.lookCx;
  const dy = cy - s.lookCy;
  s.lookCx = cx;
  s.lookCy = cy;
  s.events++;
  handleLook(slotName, dx, dy);
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress?.replace('::ffff:', '');
  let slotName = null;
  let isMonitor = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'monitor') {
      if (!isLoopback(req.socket.remoteAddress)) return ws.close(4003, 'monitor only from PC');
      isMonitor = true;
      ws.page = msg.page === 'game' ? 'game' : 'host';
      ws.focused = false;
      monitors.add(ws);
      pushState();
      return;
    }

    if (isMonitor) {
      if (msg.type === 'inject_mode' && ['off', 'test', 'on'].includes(msg.mode)) setInjectMode(msg.mode);
      else if (msg.type === 'focus' && ws.page === 'game') {
        if (ws.focused !== !!msg.focused) {
          ws.focused = !!msg.focused;
          record('game_focus', { focused: ws.focused });
          onFocusChange();
        }
      } else if (msg.type === 'observe') {
        // 疑似ゲーム画面が実際に受け取った入力 (注入との照合結果)
        for (const o of [].concat(msg.events || [])) record('observe', o);
      } else if (msg.type === 'required' && [1, 2, 3].includes(msg.required)) {
        game.required = msg.required;
        log('required', { required: msg.required });
        pushGame();
      } else if (msg.type === 'auto_resume') {
        game.autoResume = !!msg.on;
        log('auto_resume', { on: game.autoResume });
        pushGame();
      } else if (msg.type === 'phase' && ['lobby', 'coop', 'paused'].includes(msg.phase)) {
        setPhase(msg.phase, 'dashboard');
      } else if (msg.type === 'reset') {
        releaseAllOutputs();
        for (const n of SLOT_NAMES) {
          slots[n]?.ws?.close(4001, 'reset');
          slots[n] = null;
        }
        game.phase = 'lobby';
        log('reset');
        pushGame();
        pushState();
      }
      return;
    }

    if (msg.type === 'hello') {
      const clientId = String(msg.clientId || '').slice(0, 64);
      if (!clientId) return ws.close(4002, 'no clientId');
      let name = findSlotByClient(clientId);
      const reconnected = !!name;
      if (!name) {
        name = SLOT_NAMES.find((n) => !slots[n]);
        if (!name) {
          send(ws, { type: 'full' });
          log('reject_full', { ip, clientId });
          return ws.close(4004, 'room full');
        }
        slots[name] = newSlotState(clientId);
      }
      const s = slots[name];
      if (s.ws && s.ws !== ws) s.ws.close(4000, 'replaced'); // 同じ端末の古い接続を置き換え
      if (reconnected) s.reconnects++;
      Object.assign(s, {
        ws,
        connected: true,
        ip,
        ua: String(msg.ua || '').slice(0, 200),
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        lastSeq: 0,
        nextIseq: Number(msg.nextIseq) || 1,
        lookSeq: 0,
        lookCx: 0,
        lookCy: 0,
      });
      s.ibuf.clear();
      s.rtc?.close();
      s.rtc = null;
      s.rtcState = 'none';
      slotName = name;
      send(ws, { type: 'welcome', slot: name, role: SLOT_ROLES[name], isHost: name === 'P1', reconnected });
      log(reconnected ? 'reconnect' : 'join', { slot: name, ip, clientId, ua: s.ua });
      pushGame();
      pushState();
      maybeAutoResume();
      return;
    }

    const s = slotName && slots[slotName];
    if (!s || s.ws !== ws) return;
    handlePlayerMessage(slotName, s, msg, 'ws');
  });

  ws.on('close', (code) => {
    if (monitors.delete(ws) && ws.page === 'game') onFocusChange();
    if (slotName && slots[slotName]?.ws === ws) {
      slots[slotName].rtc?.close();
      slots[slotName].rtc = null;
      slots[slotName].rtcState = 'none';
      markDisconnected(slotName, `close ${code}`);
    }
  });
  ws.on('error', () => {});
});

let stateTimer = null;
function pushStateThrottled() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    pushState();
  }, 100);
}

// Wi-Fi を切られた場合 TCP の close はすぐ来ないので、アプリ層の ping 途絶で切断を判定する
setInterval(() => {
  const now = Date.now();
  for (const n of SLOT_NAMES) {
    const s = slots[n];
    if (s?.connected && now - s.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      const ws = s.ws;
      markDisconnected(n, 'heartbeat timeout');
      ws?.terminate();
    }
  }
  pushState();
}, 1000);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\nRe:Cooplay 通信プロトタイプ起動 (port ${PORT})`);
  console.log(`  PC ダッシュボード : http://localhost:${PORT}/host`);
  console.log(`  PC 疑似ゲーム画面 : http://localhost:${PORT}/game`);
  for (const a of getAddresses()) {
    console.log(`  スマホ用 URL      : http://${a.address}:${PORT}/  (${a.name}${a.hotspot ? ', ホットスポット' : ''})`);
  }
  if (!getAddresses().some((a) => a.hotspot)) {
    console.log('  ※ 192.168.137.x が見つかりません。モバイルホットスポットが OFF の可能性があります（ON にした後はダッシュボードを再読込）');
  }
  console.log('');
  log('server_start', { port: PORT });
});
