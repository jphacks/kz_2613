// 経路が証明できないデータをWi-Fi合格にしない。端末/ネットワーク設定は変更しない。
import assert from 'node:assert/strict';
import {privateIpv4,validateSelectedPairs,validateHttpWs,validateUsbIsolation,privateError} from './wifi-route.mjs';
const network={pc:'192.168.1.2',android:'192.168.1.3'},port=8080;
assert(privateIpv4(network.pc));
for(const ip of ['127.0.0.1','0.0.0.0','8.8.8.8','::1','192.168.1.999'])assert(!privateIpv4(ip));
const pair={connectionState:'connected',transport:{type:'transport',selectedCandidatePairId:'pair1',dtlsState:'connected',iceState:'connected'},pair:{id:'pair1',localCandidateId:'local1',remoteCandidateId:'remote1',state:'succeeded',nominated:true,bytesSent:10,bytesReceived:20,currentRoundTripTime:.002},local:{id:'local1',address:network.android,protocol:'udp',candidateType:'host'},remote:{id:'remote1',address:network.pc,protocol:'udp',candidateType:'host'}};
const proof=validateSelectedPairs([pair],network);
assert.equal(proof[0].currentRoundTripTimeMs,2);
assert(!JSON.stringify(proof).includes('192.168'));
assert.throws(()=>validateSelectedPairs([],network),/selectedCandidatePairId/);
for(const [key,value]of [['local','127.0.0.1'],['remote','10.0.0.9']]){
  const wrong=structuredClone(pair);wrong[key].address=value;assert.throws(()=>validateSelectedPairs([wrong],network));
}
const notSelected=structuredClone(pair);notSelected.pair.nominated=false;assert.throws(()=>validateSelectedPairs([notSelected],network));
const wrongId=structuredClone(pair);wrongId.transport.selectedCandidatePairId='other';assert.throws(()=>validateSelectedPairs([wrongId],network),/ID/);
const wrongEndpoint=structuredClone(pair);wrongEndpoint.pair.localCandidateId='other';assert.throws(()=>validateSelectedPairs([wrongEndpoint],network),/ID/);
const checking=structuredClone(pair);checking.pair.state='in-progress';assert.equal(validateSelectedPairs([checking],network)[0].state,'in-progress','チェックリストと実接続を混同しない');
for(const state of ['failed','waiting','frozen']){const bad=structuredClone(checking);bad.pair.state=state;assert.throws(()=>validateSelectedPairs([bad],network));}
const noPayload=structuredClone(checking);noPayload.pair.bytesReceived=0;assert.throws(()=>validateSelectedPairs([noPayload],network),/payload/);
const noDtls=structuredClone(checking);noDtls.transport.dtlsState='connecting';assert.throws(()=>validateSelectedPairs([noDtls],network),/ICE\/DTLS/);
validateUsbIsolation('','mCurrentFunctions=adb');
assert.throws(()=>validateUsbIsolation('','mCurrentFunctions=rndis,adb'),/テザリング/);
try{validateUsbIsolation('sensitive-device tcp:8080 tcp:8080','mCurrentFunctions=adb');assert.fail('reverseを拒否する');}catch(e){assert(!e.message.includes('sensitive-device'));}
assert(!privateError('error '+network.pc+' sensitive-device',['sensitive-device']).includes(network.pc));
const events=[{method:'Network.responseReceived',params:{type:'Document',response:{remoteIPAddress:network.pc,remotePort:port}}},{method:'Network.webSocketCreated',params:{url:`ws://${network.pc}:${port}/ws`}}];
assert.equal(validateHttpWs(events,network,port).adbReverseUsed,false);
const cached=structuredClone(events);cached[0].params.response.fromDiskCache=true;assert.throws(()=>validateHttpWs(cached,network,port));
const reverse=structuredClone(events);reverse[1].params.url=`ws://127.0.0.1:${port}/ws`;assert.throws(()=>validateHttpWs(reverse,network,port));
assert.throws(()=>validateHttpWs(events.slice(1),network,port));
console.log('合格: LAN/選択ICEの照合、別経路/候補未選択/キャッシュ/USB URLの拒否、公開証拠のアドレス除去');
