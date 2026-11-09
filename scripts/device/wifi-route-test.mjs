// 経路が証明できないデータをWi-Fi合格にしない。端末/ネットワーク設定は変更しない。
import assert from 'node:assert/strict';
import {privateIpv4,validateSelectedPairs,validateHttpWs} from './wifi-route.mjs';
const network={pc:'192.168.1.2',android:'192.168.1.3'},port=8080;
assert(privateIpv4(network.pc));
for(const ip of ['127.0.0.1','0.0.0.0','8.8.8.8','::1','192.168.1.999'])assert(!privateIpv4(ip));
const pair={pair:{state:'succeeded',nominated:true,bytesSent:10,bytesReceived:20,currentRoundTripTime:.002},local:{address:network.android,protocol:'udp',candidateType:'host'},remote:{address:network.pc,protocol:'udp',candidateType:'host'}};
const proof=validateSelectedPairs([pair],network);
assert.equal(proof[0].currentRoundTripTimeMs,2);
assert(!JSON.stringify(proof).includes('192.168'));
assert.throws(()=>validateSelectedPairs([],network),/selectedCandidatePairId/);
for(const [key,value]of [['local','127.0.0.1'],['remote','10.0.0.9']]){
  const wrong=structuredClone(pair);wrong[key].address=value;assert.throws(()=>validateSelectedPairs([wrong],network));
}
const notSelected=structuredClone(pair);notSelected.pair.nominated=false;assert.throws(()=>validateSelectedPairs([notSelected],network));
const events=[{method:'Network.responseReceived',params:{type:'Document',response:{remoteIPAddress:network.pc,remotePort:port}}},{method:'Network.webSocketCreated',params:{url:`ws://${network.pc}:${port}/ws`}}];
assert.equal(validateHttpWs(events,network,port).adbReverseUsed,false);
const cached=structuredClone(events);cached[0].params.response.fromDiskCache=true;assert.throws(()=>validateHttpWs(cached,network,port));
const reverse=structuredClone(events);reverse[1].params.url=`ws://127.0.0.1:${port}/ws`;assert.throws(()=>validateHttpWs(reverse,network,port));
assert.throws(()=>validateHttpWs(events.slice(1),network,port));
console.log('合格: LAN/選択ICEの照合、別経路/候補未選択/キャッシュ/USB URLの拒否、公開証拠のアドレス除去');
