import {decodePcMessage,type PcMessage} from './pc-messages.ts';

interface Options {
  page:'overlay'|'host'|'game';
  onMessage(message:PcMessage):void;
  onConnection?(connected:boolean):void;
  onOpen?():void;
  socket?():WebSocket;
}
export type MonitorCommand = {type:'focus';focused:boolean}
  | {type:'phase';phase:'lobby'|'paused'} | {type:'auto_resume';on:boolean}
  | {type:'inject_mode';mode:'off'|'test'|'on'} | {type:'reset'}
  | {type:'observe';events:unknown[]};

// 読み取り側も不正JSONを検証する。旧socket・破棄後の通知と再接続を遮断する。
export function createMonitor(options:Options){
  let current:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  function connect(){
    if(disposed)return;
    const socket=options.socket?.()??new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
    current=socket;
    const active=()=>!disposed&&current===socket;
    socket.onopen=()=>{if(!active())return;socket.send(JSON.stringify({type:'monitor',page:options.page}));options.onConnection?.(true);options.onOpen?.();};
    socket.onmessage=event=>{if(!active())return;const message=decodePcMessage(event.data);if(message)options.onMessage(message);};
    socket.onclose=()=>{if(!active())return;current=undefined;options.onConnection?.(false);timer=setTimeout(connect,1000);};
    socket.onerror=()=>{};
  }
  connect();
  return {
    isOpen:()=>!disposed&&current?.readyState===1,
    send(message:MonitorCommand){if(!disposed&&current?.readyState===1)current.send(JSON.stringify(message));},
    dispose(){if(disposed)return;disposed=true;clearTimeout(timer);const socket=current;current=undefined;if(socket){socket.onopen=socket.onmessage=socket.onclose=socket.onerror=null;socket.close();}},
  };
}
