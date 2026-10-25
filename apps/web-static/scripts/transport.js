// ローカルWebRTCの速達便。入力のiseq/epochとWSの先着1回処理は呼び出し側で維持する。
export function createFastChannel({signal,enabled,getPhase,onRtt,onPath}) {
  let pc = null, channel = null;
  const isOpen = () => channel?.readyState === 'open';
  const path = () => onPath(isOpen() ? 'WebRTC+WS' : pc ? 'WS（RTC接続中）' : 'WSのみ');
  const close = () => {
    try { channel?.close(); } catch {}
    try { pc?.close(); } catch {}
    pc = channel = null; path();
  };
  async function start() {
    close();
    if (!window.RTCPeerConnection) return;
    let connection = null;
    try {
      connection = new RTCPeerConnection({iceServers:[]});
      pc = connection;
      const dc = connection.createDataChannel('fast',{ordered:false,maxRetransmits:0}); channel = dc;
      dc.onopen = dc.onclose = path;
      dc.onmessage = async event => {
        if (channel !== dc) return;
        try {
          // libdatachannelはJSONもバイナリフレームで返す。ブラウザの既定はArrayBuffer。
          const text = typeof event.data === 'string' ? event.data
            : event.data instanceof ArrayBuffer ? new TextDecoder().decode(event.data)
            : await event.data.text();
          if (channel !== dc) return;
          const message = JSON.parse(text);
          if (message.type === 'kpong' && Number.isFinite(message.t)) onRtt(performance.now() - message.t);
        } catch { /* 未知・壊れたフレームは入力や接続状態に反映しない。 */ }
      };
      connection.onicecandidate = event => {
        if (pc === connection && event.candidate && enabled()) signal({type:'rtc-cand',cand:event.candidate.candidate,mid:event.candidate.sdpMid});
      };
      connection.onconnectionstatechange = path;
      await connection.setLocalDescription(await connection.createOffer());
      if (pc === connection && enabled()) signal({type:'rtc-offer',sdp:connection.localDescription.sdp});
    } catch { if (pc === connection) close(); }
    path();
  }
  async function receive(message) {
    const current = pc;
    if (!current) return;
    try {
      if (message.type === 'rtc-answer') await current.setRemoteDescription({type:'answer',sdp:message.sdp});
      else if (message.cand) await current.addIceCandidate({candidate:message.cand,sdpMid:message.mid || '0'});
    } catch {}
  }
  function send(message) {
    if (!isOpen()) return false;
    try { channel.send(JSON.stringify(message)); return true; } catch { return false; }
  }
  setInterval(() => { if (getPhase() === 'coop' && enabled()) send({type:'ka',t:performance.now()}); },50);
  return {start,close,signal:receive,isOpen,send};
}
