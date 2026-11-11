import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fastChannelObserverSource,rtcFallbackInput} from './rtc-fault-observer.mjs';
import {createFaultTimeline} from './fault-timeline.mjs';

class Peer {
  createDataChannel(label,options){ return {label,options}; }
}
const window={RTCPeerConnection:Peer};
vm.runInNewContext(fastChannelObserverSource,{window});
const connection=new Peer();
connection.createDataChannel('other',{});
assert.equal(window.__faultFast,undefined);
const channel=connection.createDataChannel('fast',{ordered:false});
assert.equal(window.__faultFast.connection,connection);
assert.equal(window.__faultFast.channel,channel);

const url='ws://127.0.0.1:19000/ws';
const timeline=createFaultTimeline({wsUrl:url});
const requestId='first';
timeline.cdp({method:'Network.webSocketCreated',params:{requestId,url}});
const frame=(direction,value)=>timeline.cdp({
  method:'Network.webSocketFrame'+direction,params:{requestId,response:{payloadData:JSON.stringify(value)}},
});
timeline.mark('rtc-close-requested');
timeline.rtc({connectionState:'connected',iceConnectionState:'connected',channelState:'closed',hasSelectedLanPair:true});
timeline.mark('rtc-closed');
frame('Sent',{type:'input',state:'down',iseq:4,epoch:7,button:'act:jump'});
frame('Received',{type:'ack',iseq:4,via:'ws'});
frame('Sent',{type:'input',state:'up',iseq:5,epoch:7,button:'act:jump'});
frame('Received',{type:'ack',iseq:5,via:'ws'});
const events=timeline.events(), trial={socket:1,epoch:7};
assert.deepEqual(rtcFallbackInput(events,trial),{downIseq:4,upIseq:5,via:'ws'});
assert.equal(rtcFallbackInput(events,{socket:2,epoch:7}),null);
assert.equal(rtcFallbackInput(events,{socket:1,epoch:8}),null);
assert.equal(rtcFallbackInput([...events,{kind:'ws-created',socket:2}],trial),null);
assert.equal(rtcFallbackInput([...events,{kind:'host-state',phase:'paused',epoch:7}],trial),null);
assert.equal(rtcFallbackInput(events.map(e=>e.kind==='input-ack'?{...e,stale:true}:e),trial),null);
assert.equal(rtcFallbackInput(events.map(e=>e.kind==='input-ack'?{...e,via:'rtc'}:e),trial),null);
assert.doesNotMatch(JSON.stringify(events),/act:jump|127\.0\.0\.1/);
console.log('合格: fastだけを観測し、同一WS・同一epochで新規down/upのWS ACKを要求する');

