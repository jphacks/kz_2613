// #277の記録アダプター。CDPと監視WSの観測を、受信時のPC単調時計に揃える。
export function createFaultTimeline({wsUrl, now = () => performance.now()}) {
  const activeSockets = new Map();
  let socketNumber = 0;
  const events = [];
  let hostState = '';
  const add = (kind, data = {}) => events.push({at:now(), kind, ...data});
  return {
    mark(kind) { add(kind); },
    cdp({method,params = {}}) {
      const {requestId} = params;
      if (method === 'Network.webSocketCreated' && params.url === wsUrl) {
        activeSockets.set(requestId, ++socketNumber);
        add('ws-created',{socket:socketNumber});
      }
      const socket = activeSockets.get(requestId);
      if (socket === undefined) return;
      if (method === 'Network.webSocketClosed') {
        activeSockets.delete(requestId);
        add('ws-closed',{socket});
      }
      if (method === 'Network.webSocketHandshakeResponseReceived') {
        add('ws-handshake',{socket,status:params.response?.status ?? null});
      }
      const sent = method === 'Network.webSocketFrameSent';
      if (!sent && method !== 'Network.webSocketFrameReceived') return;
      let frame;
      try { frame = JSON.parse(params.response.payloadData); } catch { return; }
      if (sent) {
        if (frame?.type === 'input' && Number.isSafeInteger(frame.iseq) && Number.isSafeInteger(frame.epoch)
          && ['down','up'].includes(frame.state)) {
          add('input-sent',{socket,iseq:frame.iseq,epoch:frame.epoch,state:frame.state});
        }
        return;
      }
      if (frame?.type === 'welcome' && ['P1','P2','P3','P4'].includes(frame.slot)) {
        add('welcome',{socket,slot:frame.slot,isHost:frame.isHost === true,reconnected:frame.reconnected === true});
      }
      if (frame?.type === 'ack' && ['ws','rtc'].includes(frame.via) && Number.isSafeInteger(frame.iseq)) {
        add('input-ack',{socket,via:frame.via,iseq:frame.iseq,stale:frame.stale === true});
      }
    },
    monitor(message) {
      if (message.type !== 'state' || !message.game || !Array.isArray(message.inject?.down)) return;
      const {phase,epoch} = message.game;
      const snapshot = {phase,epoch,down:message.inject.down.length};
      const next = JSON.stringify(snapshot);
      if (next !== hostState) {
        hostState = next;
        add('host-state',snapshot);
      }
    },
    rtc({connectionState,iceConnectionState,channelState,hasSelectedLanPair}) {
      add('rtc-snapshot',{
        connectionState,iceConnectionState,channelState,hasSelectedLanPair:hasSelectedLanPair===true,
      });
    },
    events: () => events.map(event => ({...event})),
  };
}

