// #277: 試験タブだけで製品のfast DataChannelを観測する。
export const fastChannelObserverSource = `(() => {
  const prototype=window.RTCPeerConnection?.prototype;
  if(!prototype)return;
  const create=prototype.createDataChannel;
  prototype.createDataChannel=function(...args){
    const channel=Reflect.apply(create,this,args);
    if(channel.label==='fast')window.__faultFast={connection:this,channel};
    return channel;
  };
})()`;

export function rtcFallbackInput(events,{socket,epoch}) {
  const requested=events.findIndex(event=>event.kind==='rtc-close-requested');
  if(requested<0)return null;
  const trial=events.slice(requested+1);
  if(trial.some(event=>['ws-closed','ws-created','welcome'].includes(event.kind)
    ||event.kind==='host-state'&&(event.epoch!==epoch||event.phase!=='coop')))return null;
  const closed=trial.findIndex(event=>event.kind==='rtc-closed');
  if(closed<0)return null;
  const afterClose=trial.slice(closed+1);
  const sent=afterClose.filter(event=>event.kind==='input-sent');
  if(sent.length!==2||sent[0].state!=='down'||sent[1].state!=='up'||sent[0].iseq>=sent[1].iseq
    ||sent.some(event=>event.socket!==socket||event.epoch!==epoch))return null;
  const acked=sent.every(input=>afterClose.slice(afterClose.indexOf(input)+1).some(event=>
    event.kind==='input-ack'&&event.socket===socket&&event.iseq===input.iseq&&event.via==='ws'&&!event.stale));
  return acked ? {downIseq:sent[0].iseq,upIseq:sent[1].iseq,via:'ws'} : null;
}

