// スマホとの WebRTC データチャネル (UDP 系)。
// WebSocket (TCP) はパケットが 1 つ欠けると再送まで後続が全部止まる (head-of-line blocking) ため、
// 視点や入力の「速達便」は順序保証・再送なしのデータチャネルで送る。接続の仲介 (シグナリング) は WebSocket を使う。
// libdatachannel のコールバックは別スレッドで呼ばれるので、すべて Event としてハブに渡す。

use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use datachannel::{
    ConnectionState, DataChannelHandler, DataChannelInfo, IceCandidate, PeerConnectionHandler, RtcConfig,
    RtcDataChannel, RtcPeerConnection, SdpType, SessionDescription,
};

use crate::hub::Event;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RtcSignal {
    ChannelOpen,
    ChannelClosed,
    Failed,
    Closed,
}

type Channel = Arc<Mutex<Option<Box<RtcDataChannel<DcHandler>>>>>;

pub struct DcHandler {
    slot: usize,
    gen: u64,
    tx: Sender<Event>,
}

impl DataChannelHandler for DcHandler {
    fn on_open(&mut self) {
        let _ = self.tx.send(Event::RtcState { slot: self.slot, gen: self.gen, state: RtcSignal::ChannelOpen });
    }
    fn on_closed(&mut self) {
        let _ = self.tx.send(Event::RtcState { slot: self.slot, gen: self.gen, state: RtcSignal::ChannelClosed });
    }
    fn on_message(&mut self, msg: &[u8]) {
        if let Ok(text) = std::str::from_utf8(msg) {
            let _ = self.tx.send(Event::RtcMessage { slot: self.slot, gen: self.gen, text: text.to_string() });
        }
    }
}

pub struct PcHandler {
    slot: usize,
    gen: u64,
    tx: Sender<Event>,
    channel: Channel,
}

impl PeerConnectionHandler for PcHandler {
    type DCH = DcHandler;

    fn data_channel_handler(&mut self, _info: DataChannelInfo) -> DcHandler {
        DcHandler { slot: self.slot, gen: self.gen, tx: self.tx.clone() }
    }

    fn on_description(&mut self, desc: SessionDescription) {
        let kind = match desc.sdp_type {
            SdpType::Answer => "answer",
            SdpType::Offer => "offer",
            SdpType::Pranswer => "pranswer",
            SdpType::Rollback => "rollback",
        };
        let _ = self.tx.send(Event::RtcDescription {
            slot: self.slot,
            gen: self.gen,
            sdp: desc.sdp.to_string(),
            kind: kind.to_string(),
        });
    }

    fn on_candidate(&mut self, cand: IceCandidate) {
        let candidate = cand.candidate.strip_prefix("a=").unwrap_or(&cand.candidate).to_string();
        let _ = self.tx.send(Event::RtcCandidate { slot: self.slot, gen: self.gen, cand: candidate, mid: cand.mid });
    }

    fn on_connection_state_change(&mut self, state: ConnectionState) {
        let signal = match state {
            ConnectionState::Failed => RtcSignal::Failed,
            ConnectionState::Closed => RtcSignal::Closed,
            _ => return,
        };
        let _ = self.tx.send(Event::RtcState { slot: self.slot, gen: self.gen, state: signal });
    }

    fn on_data_channel(&mut self, dc: Box<RtcDataChannel<DcHandler>>) {
        if let Ok(mut slot) = self.channel.lock() {
            *slot = Some(dc);
        }
    }
}

pub struct Peer {
    // フィールドは宣言順に破棄される: データチャネル → ピア接続 の順で閉じる
    channel: Channel,
    pc: Box<RtcPeerConnection<PcHandler>>,
}

impl Peer {
    /// インターネットなしのローカル Wi-Fi なので STUN/TURN は使わない
    pub fn new(slot: usize, gen: u64, tx: Sender<Event>) -> Result<Peer, String> {
        let channel: Channel = Arc::new(Mutex::new(None));
        let config = RtcConfig::new::<&str>(&[]);
        let handler = PcHandler { slot, gen, tx, channel: channel.clone() };
        let pc = RtcPeerConnection::new(&config, handler).map_err(|e| e.to_string())?;
        Ok(Peer { channel, pc })
    }

    /// ブラウザからの offer を受け取る。answer は自動生成され on_description で届く
    pub fn offer(&mut self, sdp: &str) -> Result<(), String> {
        let session = datachannel::sdp::parse_sdp(sdp, false).map_err(|e| e.to_string())?;
        self.pc
            .set_remote_description(&SessionDescription { sdp: session, sdp_type: SdpType::Offer })
            .map_err(|e| e.to_string())
    }

    pub fn candidate(&mut self, cand: &str, mid: &str) {
        let _ = self.pc.add_remote_candidate(&IceCandidate { candidate: cand.to_string(), mid: mid.to_string() });
    }

    pub fn send(&self, text: &str) -> bool {
        match self.channel.lock() {
            Ok(mut guard) => match guard.as_mut() {
                Some(dc) => dc.send(text.as_bytes()).is_ok(),
                None => false,
            },
            Err(_) => false,
        }
    }
}

impl Drop for Peer {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.channel.lock() {
            guard.take();
        }
    }
}
