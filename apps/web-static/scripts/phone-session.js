// 接続とサーバーから受け取った参加状態。DOM・Pointer・WebRTCの実体は所有しない。
// 入力の最終認可はRustホストが行い、ここでは受信したslot/host/epochを保持する。
export const PHONE_PROTOCOL_VERSION = 4;

export function createPhoneSession({ storage, createClientId, now }) {
  const read = key => { try { return storage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { storage.setItem(key, value); } catch {} };
  let clientId = read('recooplay.clientId');
  if (!clientId) { clientId = createClientId(); write('recooplay.clientId', clientId); }
  let token = read('recooplay.token');
  let socket = null, seq = 0, iseq = 0, retry = 0, stopped = false, lastServerMsg = 0;
  let me = null, isHost = false, game = null, connection = 'connecting', reconnected = false;

  function connecting() { connection = 'connecting'; }
  function attach(next) { socket = next; }
  function current(candidate) { return socket === candidate; }
  function open(ua) {
    retry = 0; seq = 0; lastServerMsg = now();
    return { type: 'hello', protocolVersion: PHONE_PROTOCOL_VERSION, clientId, token, ua, nextIseq: iseq + 1 };
  }
  function received() { lastServerMsg = now(); }
  function authenticate(message) {
    if (message.token && message.token !== token) { token = message.token; write('recooplay.token', token); }
  }
  function welcome(message) {
    me = message.slot; isHost = message.isHost; reconnected = message.reconnected;
    connection = 'connected';
  }
  function updateGame(next) {
    const epochChanged = game?.epoch !== next.epoch;
    game = next;
    return epochChanged;
  }
  function stop(reason) { stopped = true; if (reason) connection = reason; }
  function disconnected(code) {
    if (code === 4000) { stop('replaced'); return null; }
    if (code === 4005) { stop('version'); return null; }
    if (code === 4006) { stop('token'); return null; }
    connection = 'disconnected';
    return Math.min(5000, 250 * 2 ** retry++);
  }
  function detach() { const old = socket; socket = null; return old; }
  function resetRetry() { retry = 0; }
  function isOpen() { return socket?.readyState === 1; }
  function silent() { return isOpen() && now() - lastServerMsg >= 3000; }
  function sequenced(message) { return { ...message, seq: ++seq }; }
  function input(message) { return { type: 'input', ...message, iseq: ++iseq, epoch: game?.epoch, t: now() }; }
  function view() { return { me, isHost, game }; }
  function status() {
    return {
      connecting: ['接続中', 'warn'], connected: [reconnected ? '再接続OK' : '接続OK', 'ok'],
      disconnected: ['切断 — 再接続待ち', 'ng'], replaced: ['別タブで接続中', 'ng'],
      version: ['版が不一致', 'ng'], token: ['参加できません', 'ng'],
    }[connection];
  }
  return {
    connecting, attach, current, open, received, authenticate, welcome, updateGame, stop, disconnected, detach, resetRetry,
    isOpen, silent, sequenced, input, view, status,
    get socket() { return socket; }, get stopped() { return stopped; },
    get me() { return me; }, get isHost() { return isHost; }, get game() { return game; },
  };
}
