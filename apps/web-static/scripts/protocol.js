// 受信JSONの構造境界。接続世代・入力失効・表示・RTT更新は呼出し側の責任。
// 有効なフレームは同じobjectを返し、未知typeは拡張用として副作用なく通す。
/** @typedef {{type:string, [key:string]:unknown}} ServerMessage */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const slot = value => ['P1', 'P2', 'P3', 'P4'].includes(value);
const optional = (value, key, valid) => !(key in value) || valid(value[key]);
const strings = value => Array.isArray(value) && value.every(v => typeof v === 'string');
const slots = value => Array.isArray(value) && value.every(slot);
const finite = Number.isFinite;
const assignment = value => object(value) && Object.entries(value).every(([key, actions]) => slot(key) && strings(actions));
const output = value => value === null || object(value) && typeof value.label === 'string'
  && optional(value, 'out', v => typeof v === 'string');
const outputs = value => object(value) && Object.values(value).every(output);

function game(value) {
  if (!object(value) || !['lobby', 'preparing', 'coop', 'paused'].includes(value.phase)
      || !Number.isSafeInteger(value.epoch) || value.epoch < 0) return false;
  if (!slots(value.connected) || !optional(value, 'participants', slots)
      || !optional(value, 'roleAck', slots) || !optional(value, 'readyReasons', strings)) return false;
  if (!optional(value, 'reason', v => v === null || typeof v === 'string')) return false;
  for (const key of ['title', 'titleName', 'prepareStatus', 'remoteRoute']) {
    if (!optional(value, key, v => typeof v === 'string')) return false;
  }
  for (const key of ['canPrepare', 'canReady', 'canResume', 'inputTarget', 'inputActive', 'autoResume', 'lineupOk', 'hostReady']) {
    if (!optional(value, key, v => typeof v === 'boolean')) return false;
  }
  if (!optional(value, 'assigned', assignment)) return false;
  if (!optional(value, 'roleOf', v => object(v) && Object.entries(v).every(([key, role]) => slot(key) && slot(role)))) return false;
  if (!optional(value, 'keys', v => object(v) && optional(v, 'actions', outputs)
      && optional(v, 'controls', c => outputs(c) && Object.keys(c).every(key => /^[A-Za-z0-9_:-]+$/.test(key))))) return false;
  if (value.phase === 'coop' && !object(value.profile)) return false;
  if (!optional(value, 'profile', p => p === null || object(p)
      && typeof p.id === 'string' && typeof p.name === 'string'
      && optional(p, 'status', v => typeof v === 'string')
      && optional(p, 'controllerSupported', v => typeof v === 'boolean')
      && Array.isArray(p.actions) && p.actions.every(v => object(v) && typeof v.id === 'string' && typeof v.type === 'string')
      && optional(p, 'assignment', assignment)
      && optional(p, 'groups', a => Array.isArray(a) && a.every(v => object(v) && typeof v.id === 'string')))) return false;
  return true;
}

/** @param {string} text @returns {ServerMessage|null} */
export function decodeServerMessage(text) {
  let message;
  try { message = JSON.parse(text); } catch { return null; }
  if (!object(message) || typeof message.type !== 'string') return null;
  switch (message.type) {
    case 'welcome':
      if (!slot(message.slot) || typeof message.isHost !== 'boolean' || typeof message.role !== 'string'
          || !optional(message, 'token', v => typeof v === 'string')
          || !optional(message, 'protocolVersion', v => v === 4)) return null;
      break;
    case 'game': if (!game(message.game)) return null; break;
    case 'command_result':
      if (typeof message.accepted !== 'boolean' || !optional(message, 'reasons', strings)) return null;
      break;
    case 'pong': case 'kpong': if (!finite(message.t)) return null; break;
    case 'ack':
      if (!Number.isSafeInteger(message.iseq) || !['ws', 'rtc'].includes(message.via)) return null;
      break;
    case 'rtc-answer': if (typeof message.sdp !== 'string') return null; break;
    case 'rtc-cand': if (typeof message.cand !== 'string' || !optional(message, 'mid', v => v === null || typeof v === 'string')) return null; break;
  }
  return message;
}
