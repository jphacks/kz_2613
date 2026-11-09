// 全条件で同じCDP操作・観測を使う。端末内の単調時計だけで差を取る。
import assert from 'node:assert/strict';
export const summarize = values => {
  const ordered = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!ordered.length) return {n:0};
  const q = p => ordered[Math.ceil(ordered.length*p)-1];
  return {n:ordered.length,p50:q(.5),p95:q(.95),p99:q(.99),mean:ordered.reduce((a,b)=>a+b,0)/ordered.length,max:ordered.at(-1)};
};

export async function beginPerformance({evaluate, page, durationMs}) {
  await evaluate(`(() => {
    const p = window.__performanceTrial = {events:[], sends:[], acks:[], attached:false, last:null};
    for (const name of ['pointerdown','pointerup','pointermove','pointercancel']) document.addEventListener(name,e => {
      const event={kind:e.type,at:e.timeStamp>1e12?e.timeStamp-performance.timeOrigin:e.timeStamp,observed:performance.now(),control:e.target.closest?.('[data-ctl]')?.dataset.ctl||null};
      p.events.push(event); p.last=event;
    },true);
    for (const [proto,via] of [[WebSocket.prototype,'ws'],[RTCDataChannel.prototype,'rtc']]) {
      const original=proto.send;
      proto.send=function(data){
        if(via==='ws'&&!p.attached&&this.url.endsWith('/ws')){p.attached=true;this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='ack')p.acks.push({at:performance.now(),iseq:m.iseq,via:m.via});}catch{}});}
        try { const m=JSON.parse(data);if(['input','look'].includes(m.type))p.sends.push({at:performance.now(),via,type:m.type,state:m.state,control:m.button,iseq:m.iseq,lseq:m.lseq,epoch:m.epoch,event:p.last}); }catch{}
        return original.call(this,data);
      };
    }
    return true;
  })()`);
  const point=await evaluate(`(()=>{const e=document.querySelector('[data-ctl="act:jump"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1}})()`);
  const dispatch=(type,points)=>page.call('Input.dispatchTouchEvent',{type,touchPoints:points});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // 2秒のウォームアップは別窓。送信/ACKが流れ、RTCが安定してから計測を開始する。
  for(let i=0;i<4;i++){await dispatch('touchStart',[point]);await sleep(100);await dispatch('touchEnd',[]);await sleep(400);}
  await sleep(300);
  await evaluate(`(()=>{const p=window.__performanceTrial;p.events=[];p.sends=[];p.acks=[];p.last=null;p.started=performance.now();return true})()`);
  const other=await evaluate(`(()=>{const e=document.querySelector('[data-ctl="act:sneak"]');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:2}})()`);
  const stick=await evaluate(`(()=>{const r=document.querySelector('.gen-stick').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:Math.min(r.width,r.height)*.43,id:2}})()`);
  const started=performance.now(),cycles=48;
  const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  for(let cycle=0;cycle<cycles;cycle++){
    const n=cycle%6;
    if(n===1){
      for(let i=0;i<3;i++){await dispatch('touchStart',[point]);await sleep(35);await dispatch('touchEnd',[]);await sleep(50);}
    }else{
      await dispatch('touchStart',[point]);
      if(n===3){
        const second={...point,x:point.x+12,id:2};
        await dispatch('touchStart',[point,second]);await sleep(90);await dispatch('touchEnd',[second]);await sleep(100);
      }else if(n===4){
        await dispatch('touchStart',[point,other]);await sleep(100);await dispatch('touchEnd',[other]);await sleep(100);
      }else if(n===5){
        const center={x:stick.x,y:stick.y,id:2};await dispatch('touchStart',[point,center]);
        for(const [x,y] of directions){await dispatch('touchMove',[point,{x:stick.x+x*stick.r,y:stick.y+y*stick.r,id:2}]);await sleep(40);}
      }else await sleep(n===0?80:1200);
      await dispatch('touchEnd',[]);
    }
    // 回数を固定し、同じ60秒の時系列へ配置する。遅れがあれば実時間もそのまま記録する。
    await sleep(Math.max(0,started+(cycle+1)*durationMs/cycles-performance.now()));
  }
  await sleep(300);
  return {version:2,elapsedMs:performance.now()-started,cycles,patterns:{tap:8,rapid3:8,hold1200ms:8,sameButtonTwoContacts:8,differentButtons:8,stickEightDirectionsWithButton:8}};
}

export async function finishPerformance(evaluate, workload) {
  const raw=await evaluate(`(()=>{const p=window.__performanceTrial;return {events:p.events,sends:p.sends,acks:p.acks,started:p.started,ended:performance.now(),path:document.getElementById('path').textContent}})()`);
  const ws=raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
  const ack=new Map(raw.acks.map(a=>[a.iseq,a]));
  const edge=state=>ws.filter(s=>s.state===state&&s.event?.kind===(state==='down'?'pointerdown':'pointerup')).map(s=>s.at-s.event.at);
  const rtts=ws.filter(s=>ack.has(s.iseq)).map(s=>ack.get(s.iseq).at-s.at);
  const unacked=ws.filter(s=>!ack.has(s.iseq)).length;
  assert(ws.length>20,'性能試行の送信サンプルが不足');assert.equal(unacked,0,'性能試行の未ACK');
  return {workload,raw,summary:{downToSendMs:summarize(edge('down')),upToSendMs:summarize(edge('up')),ackRttMs:summarize(rtts),unacked,firstVia:raw.acks.reduce((v,a)=>(v[a.via]=(v[a.via]||0)+1,v),{}),method:'Android Chrome CDP touch / USB reverse、WS送信までの端末内時間とACK RTT。実指・ゲーム応答ではない'}};
}
