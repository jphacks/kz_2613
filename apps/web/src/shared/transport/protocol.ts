import type {ServerMessage} from './messages.ts';
import type {PhoneGame} from '../contracts.ts';
import {PHONE_PROTOCOL_VERSION} from './version.ts';
// 受信JSONの構造境界。接続世代・入力失効・表示・RTT更新は呼出し側の責任。
// 既知のフレームだけを検証済み型で返す。未知typeは適用できない別の型へ隔離する。
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const slot = (value: unknown) => typeof value === 'string' && ['P1', 'P2', 'P3', 'P4'].includes(value);
const optional = (value: Record<string, unknown>, key: string, valid: (value: unknown) => boolean) => !(key in value) || valid(value[key]);
const strings = (value: unknown) => Array.isArray(value) && value.every(v => typeof v === 'string');
const slots = (value: unknown) => Array.isArray(value) && value.every(slot);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const assignment = (value: unknown) => object(value) && Object.entries(value).every(([key, actions]) => slot(key) && strings(actions));
const output = (value: unknown) => value === null || object(value) && typeof value.label === 'string'
  && optional(value, 'out', v => typeof v === 'string');
const outputs = (value: unknown): value is Record<string, unknown> => object(value) && Object.values(value).every(output);

export function isPhoneGame(value: unknown): value is PhoneGame {
  if (!object(value) || !(typeof value.phase === 'string' && ['lobby', 'preparing', 'coop', 'paused'].includes(value.phase))
      || !(typeof value.epoch === 'number' && Number.isSafeInteger(value.epoch)) || value.epoch < 0) return false;
  if (!slots(value.connected) || !optional(value, 'participants', slots)
      || !optional(value, 'lineupDisconnected', slots)
      || !optional(value, 'roleAck', slots) || !optional(value, 'readyReasons', strings)) return false;
  if (!optional(value, 'reason', v => v === null || typeof v === 'string')) return false;
  for (const key of ['title', 'titleName', 'prepareStatus', 'remoteRoute']) {
    if (!optional(value, key, v => typeof v === 'string')) return false;
  }
  for (const key of ['canPrepare', 'canReady', 'canResume', 'inputTarget', 'inputActive', 'autoResume', 'lineupOk', 'hostReady', 'canSwap', 'canChangePlayers', 'canLaunch', 'rotationSoon', 'canOpenApp', 'remoteLeave']) {
    if (!optional(value, key, v => typeof v === 'boolean')) return false;
  }
  if (!optional(value, 'assigned', assignment)) return false;
  if (!optional(value, 'roleOf', v => object(v) && Object.entries(v).every(([key, role]) => slot(key) && slot(role)))) return false;
  if (!optional(value, 'keys', v => object(v) && optional(v, 'actions', outputs)
      && optional(v, 'controls', c => outputs(c) && Object.keys(c).every(key => /^[A-Za-z0-9_:-]+$/.test(key)))
      && optional(v, 'warnings', strings) && optional(v, 'edited', strings))) return false;
  if (!optional(value, 'rotationSeconds', finite) || !optional(value, 'rotationCount', finite)) return false;
  if (!optional(value, 'rotationNext', v => v === null || assignment(v))) return false;
  for(const key of ['required','autoResumeMs'])if(!optional(value,key,finite))return false;
  if (!optional(value, 'launch', v => v===null||object(v) && typeof v.state === 'string' && ['title','id','message'].every(k=>optional(v,k,v=>typeof v==='string')))) return false;
  if (value.phase === 'coop' && !object(value.profile)) return false;
  if (!optional(value, 'profile', p => p === null || object(p)
      && typeof p.id === 'string' && typeof p.name === 'string'
      && optional(p, 'status', v => typeof v === 'string')
      && optional(p, 'controllerSupported', v => typeof v === 'boolean')
      && Array.isArray(p.actions) && p.actions.every(v => object(v) && typeof v.id === 'string' && typeof v.type === 'string'
        && optional(v, 'label', v => typeof v === 'string') && optional(v, 'group', v => typeof v === 'string') && optional(v,'weight',finite))
      && optional(p, 'assignment', assignment)
      && optional(p, 'assignments',v=>object(v)&&Object.values(v).every(assignment))
      && optional(p, 'groups', a => Array.isArray(a) && a.every(v => object(v) && typeof v.id === 'string' && optional(v,'label',v=>typeof v==='string'))))) return false;
  return true;
}

export function decodeServerMessage(text: unknown): ServerMessage | null {
  if(typeof text!=='string')return null;
  let message: unknown;
  try { message = JSON.parse(text); } catch { return null; }
  if (!object(message) || typeof message.type !== 'string') return null;
  switch (message.type) {
    case 'welcome':
      if (!slot(message.slot) || typeof message.isHost !== 'boolean' || typeof message.role !== 'string'
          || !optional(message, 'token', v => typeof v === 'string')
          || !optional(message, 'reconnected', v => typeof v === 'boolean')
          || !optional(message, 'protocolVersion', v => v === PHONE_PROTOCOL_VERSION)) return null;
      break;
    case 'game': if (!isPhoneGame(message.game)) return null; break;
    case 'command_result':
      if (typeof message.cmd !== 'string' || typeof message.accepted !== 'boolean' || !optional(message, 'reasons', strings)) return null;
      break;
    case 'pong': case 'kpong': if (!finite(message.t)) return null; break;
    case 'ack':
      if (!Number.isSafeInteger(message.iseq) || !(message.via === 'ws' || message.via === 'rtc')
          || !optional(message, 'stale', v => typeof v === 'boolean')) return null;
      break;
    case 'rtc-answer': if (typeof message.sdp !== 'string') return null; break;
    case 'rtc-cand': if (typeof message.cand !== 'string' || !optional(message, 'mid', v => v === null || typeof v === 'string')) return null; break;
    case 'full': if (!optional(message, 'retryMs', v => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))) return null; break;
    case 'error': if (typeof message.code !== 'string') return null; break;
    default: return {type:'unknown', originalType:message.type};
  }
  return message as ServerMessage;
}
