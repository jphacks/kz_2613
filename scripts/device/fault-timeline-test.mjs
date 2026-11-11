import assert from 'node:assert/strict';
import {createFaultTimeline} from './fault-timeline.mjs';

{
  let at = 0;
  const wsUrl='ws://127.0.0.1:19000/ws';
  const timeline=createFaultTimeline({wsUrl,now:()=>++at});
  const push=(method,params)=>timeline.cdp({method,params});
  push('Network.webSocketCreated',{requestId:'devtools',url:'ws://127.0.0.1:19000/other'});
  push('Network.webSocketCreated',{requestId:'first',url:wsUrl});
  push('Network.webSocketHandshakeResponseReceived',{requestId:'first',response:{status:101}});
  timeline.monitor({type:'state',game:{phase:'coop',epoch:7},inject:{down:['KEY_W','MOUSE_R']}});
  timeline.mark('fault-requested');
  push('Network.webSocketClosed',{requestId:'first'});
  push('Network.webSocketClosed',{requestId:'devtools'});
  const paused={type:'state',game:{phase:'paused',epoch:8},inject:{down:[]}};
  timeline.monitor(paused);
  timeline.monitor(paused);
  timeline.rtc({connectionState:'disconnected',iceConnectionState:'checking',channelState:'closing'});
  push('Network.webSocketCreated',{requestId:'replacement',url:wsUrl});
  push('Network.webSocketFrameReceived',{requestId:'replacement',response:{payloadData:'malformed'}});
  push('Network.webSocketFrameReceived',{requestId:'replacement',response:{payloadData:JSON.stringify({type:'welcome',slot:'P1',isHost:true,reconnected:true,token:'secret-token'})}});
  push('Network.webSocketFrameReceived',{requestId:'replacement',response:{payloadData:JSON.stringify({type:'ack',via:'ws',iseq:8,stale:true})}});
  const events=timeline.events();
  assert.deepEqual(events.map(e=>e.kind),['ws-created','ws-handshake','host-state','fault-requested','ws-closed',
    'host-state','rtc-snapshot','ws-created','welcome','input-ack']);
  assert.deepEqual(events.filter(e=>e.kind==='host-state').map(e=>[e.phase,e.epoch,e.down]),[['coop',7,2],['paused',8,0]]);
  assert.equal(events.find(e=>e.kind==='rtc-snapshot').hasSelectedLanPair,false);
  assert.equal(events.at(-1).via,'ws');
  assert.equal(events.at(-1).stale,true);
  assert.equal(events.find(e=>e.kind==='ws-closed').socket,1);
  assert.equal(events.find(e=>e.kind==='welcome').socket,2);
  assert.equal(events.every((event,index)=>event.at===index+1),true);
  assert.doesNotMatch(JSON.stringify(events),/secret-token|127\.0\.0\.1|KEY_W|devtools/);
  console.log('合格: CDPの対象WS・再接続・ホストの停止・RTC状態を共通時計で記録し、トークンとアドレスを出力しない（合成イベントのみ）');
}
