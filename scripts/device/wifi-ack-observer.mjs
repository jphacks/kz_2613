import assert from 'node:assert/strict';
import {summarize} from './android-performance.mjs';
// 文書開始前に設定し、製品のonmessageより先にACKを観測する。本文/接続識別子は保存しない。
export const earlyAckSource=`(()=>{window.__wifiEarlyAcks=[];const Original=window.WebSocket;window.WebSocket=new Proxy(Original,{construct(target,args){const socket=new target(...args);if(socket.url.endsWith('/ws'))socket.addEventListener('message',event=>{try{const message=JSON.parse(event.data);if(message.type==='ack')window.__wifiEarlyAcks.push({at:performance.now(),iseq:message.iseq,via:message.via});}catch{}});return socket;}});return true})()`;
export function ackPhases(raw,earlyAcks) {
  const sends=raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
  const first=rows=>{const map=new Map();for(const r of rows)if(!map.has(r.iseq))map.set(r.iseq,r);return map;};
  const early=first(earlyAcks),late=first(raw.acks);
  const rows=sends.map(s=>{
    const e=early.get(s.iseq),l=late.get(s.iseq);assert(e&&l,'先行/従来ACKと送信の対応がない');
    assert(e.at>=s.at&&l.at>=e.at,'同一端末のACK時刻順序が不正');
    return {iseq:s.iseq,sent:s.at,early:e.at,late:l.at,via:l.via,earlyRttMs:e.at-s.at,lateRttMs:l.at-s.at,dispatchMs:l.at-e.at};
  });
  return {n:rows.length,earlyRttMs:summarize(rows.map(r=>r.earlyRttMs)),lateRttMs:summarize(rows.map(r=>r.lateRttMs)),dispatchMs:summarize(rows.map(r=>r.dispatchMs)),rows,
    method:'WebSocket構築時の先行listener→製品onmessage→従来observer。同一renderer時計。間のmicrotask/配送と観測JSON処理も含み、純network RTTや純React CPU時間ではない。'};
}
