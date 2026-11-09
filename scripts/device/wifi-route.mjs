// 製品LAN経路とUSBのCDP制御を分離する。生アドレスはprivate記録だけへ保存する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

export function privateIpv4(address) {
  return net.isIP(address)===4 && (/^10\./.test(address)||/^192\.168\./.test(address)||/^172\.(1[6-9]|2\d|3[01])\./.test(address));
}
export function validateUsbIsolation(reverse,usb) {
  assert(!/mCurrentFunctions=.*(?:rndis|ncm)/i.test(usb),'AndroidのUSBテザリングを検出');
  assert(reverse.trim()==='','Wi-Fi試験ではADB reverse転送がないことを要求する（内容/端末識別子は出力しない）');
}
export function privateError(message,identities=[]) {
  let text=String(message);
  for(const identity of identities)if(identity)text=text.replaceAll(identity,'[private]');
  return text.replace(/https?:\/\/[^\s]+/g,'[private URL]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,ip=>ip.split('.').every(n=>Number(n)<=255)?'[private address]':ip);
}
export function readWifiNetwork(file,adb) {
  const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const pc=data.pc?.IPAddress,android=data.androidAddress;
  assert(privateIpv4(pc)&&privateIpv4(android)&&pc!==android,'private IPv4のPC/Androidアドレスが必要');
  assert(Object.values(os.networkInterfaces()).flat().some(a=>a?.address===pc&&!a.internal),'指定LANアドレスは現在のPCに存在しない');
  const live=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-NetAdapter -InterfaceIndex ${Number(data.pc.InterfaceIndex)} | Select-Object Status,PhysicalMediaType | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}).trim());
  assert(live.Status==='Up'&&live.PhysicalMediaType==='Native 802.11','PC側の有効なWi-Fiアダプターを確認できない');
  const interfaces=JSON.parse(adb('shell','ip','-j','address','show'));
  assert(interfaces.some(i=>i.ifname==='wlan0'&&i.addr_info.some(a=>a.local===android)),'Androidのwlan0アドレスが一致しない');
  const route=adb('shell','ip','route','get',pc);
  assert(route.includes('dev wlan0')&&route.includes(`src ${android}`),'AndroidからPCへの経路はwlan0でなければならない');
  validateUsbIsolation(adb('reverse','--list'),adb('shell','dumpsys','usb'));
  return {pc,android,proof:{pcWifiActive:true,androidWifiActive:true,androidRouteViaWlan:true,usbTethering:false,adbReverseMappings:0,topology:data.adapter?.InterfaceDescription?.includes('Wi-Fi Direct')?'Windows Wi-Fi Direct / mobile hotspot':'Wi-Fi LAN',debugTransport:'USB ADB forward / CDP only'}};
}
export async function freeLanPort() {
  const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',resolve);});
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
export function hostSocketProof(pid,port,network) {
  assert(Number.isInteger(pid)&&Number.isInteger(port));
  const rows=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction Stop | Where-Object LocalPort -eq ${port} | Select-Object LocalAddress,RemoteAddress,@{Name='State';Expression={$_.CimInstanceProperties['State'].Value}}) | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}).trim());
  const sockets=Array.isArray(rows)?rows:[rows];
  // このPCのCIMはRustのwildcard socketをState=0と返す。Listen値を推測せず、
  // 自分のPIDに属する実際のEstablished接続の両端を検証する。
  assert(sockets.some(s=>s.LocalAddress==='0.0.0.0'),'起動したホストのwildcard socketを確認できない');
  assert(sockets.some(s=>s.State===5&&s.LocalAddress===network.pc&&s.RemoteAddress===network.android),'ホスト側の実LAN Established接続の両端が一致しない');
  return {ownedHostWildcardSocket:true,ownedHostEstablishedLanSocket:true,androidNonLoopbackPeer:true};
}
export const rtcStatsExpression=`(async()=>{const out=[];for(const pc of window.__wifiPeers??[]){if(pc.connectionState!=='connected')continue;const all=[...((await pc.getStats()).values())];for(const t of all.filter(s=>s.type==='transport'&&s.selectedCandidatePairId)){const pair=all.find(s=>s.id===t.selectedCandidatePairId);if(pair)out.push({connectionState:pc.connectionState,transport:t,pair,local:all.find(s=>s.id===pair.localCandidateId),remote:all.find(s=>s.id===pair.remoteCandidateId)});}}return out})()`;
export const rtcObserverSource=`(()=>{const Original=window.RTCPeerConnection;window.__wifiPeers=[];window.__wifiPathHistory=[];if(Original)window.RTCPeerConnection=new Proxy(Original,{construct(target,args){const pc=new target(...args);window.__wifiPeers.push(pc);return pc;}});setInterval(async()=>{try{const stats=await ${rtcStatsExpression};if(stats.length)window.__wifiPathHistory.push({at:performance.now(),stats});}catch{window.__wifiStatsError=true}},5000);return true})()`;
export function validateSelectedPairs(stats,network) {
  assert(stats.length>0,'getStatsのtransport.selectedCandidatePairIdを取得できない');
  return stats.map((s,index)=>{
    assert(s.transport?.type==='transport'&&s.transport.selectedCandidatePairId===s.pair.id,'transportと選択候補ペアのIDが一致しない');
    assert(s.pair.localCandidateId===s.local?.id&&s.pair.remoteCandidateId===s.remote?.id,'候補ペアと両端候補IDが一致しない');
    // pair.stateはチェックリスト。選択済みtransportの接続/経路とは分ける（W3C 8.17/8.19）。
    assert(s.connectionState==='connected'&&s.transport.dtlsState==='connected'&&['connected','completed'].includes(s.transport.iceState),'実際のICE/DTLS接続が成立していない');
    assert(s.pair.nominated===true&&['succeeded','in-progress'].includes(s.pair.state),'選択候補ペアが利用できない: '+JSON.stringify({state:s.pair.state,nominated:s.pair.nominated}));
    assert(Number.isFinite(s.pair.bytesSent)&&s.pair.bytesSent>0&&Number.isFinite(s.pair.bytesReceived)&&s.pair.bytesReceived>0,'選択ペアの双方向payloadを確認できない');
    assert(s.local?.address===network.android,'RTC local candidateはAndroid wlan0でなければならない');
    assert(s.remote?.address===network.pc,'RTC remote candidateはPCのWi-Fi LANでなければならない');
    assert.equal(s.local.protocol,'udp');assert.equal(s.remote.protocol,'udp');
    return {pair:`selected-${index+1}`,selectedBy:'transport.selectedCandidatePairId',connectionState:s.connectionState,dtlsState:s.transport.dtlsState,iceState:s.transport.iceState,state:s.pair.state,nominated:s.pair.nominated,local:{endpoint:'Android wlan0',type:s.local.candidateType,protocol:s.local.protocol,networkType:s.local.networkType},remote:{endpoint:'PC Wi-Fi LAN',type:s.remote.candidateType,protocol:s.remote.protocol},bytesSent:s.pair.bytesSent,bytesReceived:s.pair.bytesReceived,currentRoundTripTimeMs:s.pair.currentRoundTripTime===undefined?undefined:s.pair.currentRoundTripTime*1000};
  });
}
export function validateHttpWs(events,network,port) {
  const http=events.find(e=>e.method==='Network.responseReceived'&&e.params.type==='Document'&&e.params.response.remoteIPAddress===network.pc&&e.params.response.remotePort===port&&!e.params.response.fromDiskCache&&!e.params.response.fromServiceWorker);
  const ws=events.find(e=>e.method==='Network.webSocketCreated'&&e.params.url===`ws://${network.pc}:${port}/ws`);
  assert(http,'Chromeの実HTTP responseのLAN remoteIPAddress/portを確認できない');assert(ws,'製品WebSocketのLAN URLを確認できない');
  return {http:{remoteEndpoint:'PC Wi-Fi LAN',networkResponse:true,cache:false},webSocket:{endpoint:'PC Wi-Fi LAN',urlUsesLanAddress:true},adbReverseUsed:false};
}
