// スマホとの WebRTC データチャネル (UDP 系)。
// WebSocket (TCP) はパケットが 1 つ欠けると再送まで後続が全部止まる (head-of-line blocking) ため、
// 視点や入力の「速達便」は順序保証・再送なしのデータチャネルで送る。接続の仲介 (シグナリング) は WebSocket を使う。

import ndc from 'node-datachannel';

// インターネットなしのローカル Wi-Fi なので STUN/TURN は使わない
export function createPeer({ id, sendSignal, onMessage, onState }) {
  const pc = new ndc.PeerConnection(id, { iceServers: [] });
  let channel = null;
  let closed = false;

  pc.onLocalDescription((sdp, type) => sendSignal({ type: 'rtc-answer', sdp, sdpType: type }));
  pc.onLocalCandidate((cand, mid) => sendSignal({ type: 'rtc-cand', cand: cand.replace(/^a=/, ''), mid }));
  pc.onStateChange((state) => onState(state));
  pc.onDataChannel((dc) => {
    channel = dc;
    dc.onOpen(() => onState('channel-open'));
    dc.onClosed(() => {
      if (channel === dc) channel = null;
      if (!closed) onState('channel-closed');
    });
    dc.onMessage((m) => {
      if (typeof m !== 'string') return;
      try {
        onMessage(JSON.parse(m));
      } catch {}
    });
  });

  return {
    offer(sdp) {
      pc.setRemoteDescription(sdp, 'offer');
    },
    candidate(cand, mid) {
      try {
        pc.addRemoteCandidate(cand, mid || '0');
      } catch {}
    },
    send(obj) {
      if (!channel?.isOpen()) return false;
      try {
        return channel.sendMessage(JSON.stringify(obj));
      } catch {
        return false;
      }
    },
    isOpen: () => !!channel?.isOpen(),
    close() {
      closed = true;
      try {
        channel?.close();
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
}
