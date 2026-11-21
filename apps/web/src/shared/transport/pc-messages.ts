import type {PhoneGame} from '../contracts.ts';
import type {HostState,InjectionState,LogEntry,InjectionNotice,LookNotice} from '../model/domain.ts';
import {isPhoneGame} from './protocol.ts';

export type RemoteInput = {type:'remote';route:string;epoch:number} & (
  {kind:'move';dx:number;dy:number} | {kind:'scroll';dy:number} | {kind:'release'}
  | {kind?:undefined;control:string;state:'down'|'up'});
export type PcMessage = {type:'state';game:PhoneGame;inject:InjectionState} & HostState
  | {type:'game';game:PhoneGame} | {type:'key_result';ok:boolean}
  | {type:'manual_result';message:string} | RemoteInput | {type:'inject';entry:InjectionNotice} | {type:'look';entry:LookNotice} | {type:'log';entry:LogEntry} | {type:'unknown'};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const optional=(v:Record<string,unknown>,key:string,valid:(v:unknown)=>boolean)=>!(key in v)||valid(v[key]);
const string=(v:unknown)=>typeof v==='string';
const boolean=(v:unknown)=>typeof v==='boolean';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(string);
const stats=(v:unknown)=>object(v)&&['avg','p95','max','unacked'].every(k=>optional(v,k,finite))&&optional(v,'path',string)&&optional(v,'rtc',v=>v===null||object(v)&&['avg','p95','max'].every(k=>optional(v,k,finite)));
const slot=(v:unknown)=>object(v)&&typeof v.name==='string'&&['P1','P2','P3','P4'].includes(v.name)&&optional(v,'connected',boolean)
  &&['assigned'].every(k=>optional(v,k,boolean))&&optional(v,'ua',string)&&optional(v,'pressed',strings)
  &&optional(v,'clientStats',v=>v===null||stats(v))&&optional(v,'net',v=>object(v)&&optional(v,'stalls',finite))
  &&['role','ip'].every(k=>optional(v,k,string))&&['lastSeen','events','lost','outOfOrder','lookLost'].every(k=>optional(v,k,finite))
  &&optional(v,'via',v=>object(v)&&['rtc','ws'].every(k=>optional(v,k,finite)))&&optional(v,'reconnects',finite)&&optional(v,'rtcState',string);
const inject=(v:unknown)=>object(v)&&string(v.mode)&&boolean(v.active)
  &&optional(v,'available',boolean)&&optional(v,'error',v=>v===null||string(v))
  &&optional(v,'target',v=>v===null||object(v)&&optional(v,'ok',boolean)&&optional(v,'expect',string)&&optional(v,'process',v=>v===null||string(v)))
  &&optional(v,'emergencyHotkey',string)&&optional(v,'emergencyHotkeyError',v=>v===null||string(v))
  &&optional(v,'outputs',v=>object(v)&&Object.values(v).every(v=>object(v)&&string(v.kind)&&string(v.label)&&optional(v,'code',v=>v===null||string(v))));

export function decodeHotspotResult(v:unknown):{ok:boolean;error?:string|null}|null {
  if(!object(v)||!boolean(v.ok)||!optional(v,'error',v=>v===null||string(v)))return null;
  return {ok:v.ok===true,error:typeof v.error==='string'?v.error:null};
}
export function decodePcMessage(text:unknown):PcMessage|null {
  if(typeof text!=='string')return null;
  let v:unknown;try{v=JSON.parse(text)}catch{return null}
  if(!object(v)||!string(v.type))return null;
  switch(v.type){
    case 'state':
      if(!isPhoneGame(v.game)||!inject(v.inject)||!optional(v,'now',finite)||!optional(v,'slots',v=>Array.isArray(v)&&v.every(slot))
        ||!optional(v,'games',v=>Array.isArray(v)&&v.every(v=>object(v)&&string(v.id)&&string(v.source)
          &&optional(v,'name',string)&&['verified','launchable','image'].every(k=>optional(v,k,boolean))))
        ||!optional(v,'minecraft',v=>v===null||object(v)&&['launchable','image'].every(k=>optional(v,k,boolean)))
        ||!optional(v,'network',v=>object(v)&&optional(v,'bluetoothAudio',boolean))||!optional(v,'gamesScanning',boolean))return null;
      break;
    case 'inject':if(!object(v.entry)||!['out','slot','label'].every(k=>string((v.entry as Record<string,unknown>)[k]))||!(v.entry.state==='down'||v.entry.state==='up')||!boolean(v.entry.ok))return null;break;
    case 'look':if(!object(v.entry)||!finite(v.entry.dx)||!finite(v.entry.dy)||!string(v.entry.slot))return null;break;
    case 'log':if(!object(v.entry)||!finite(v.entry.t)||!string(v.entry.kind)||!optional(v.entry,'burst',boolean)||!['slot','cmd','reason','mode'].every(k=>optional(v.entry as Record<string,unknown>,k,string)))return null;break;
    case 'game':if(!isPhoneGame(v.game))return null;break;
    case 'key_result':if(!boolean(v.ok))return null;break;
    case 'manual_result':if(!string(v.message))return null;break;
    case 'remote':
      if(!finite(v.epoch)||!string(v.route))return null;
      if(v.kind==='move'){if(!finite(v.dx)||!finite(v.dy))return null}
      else if(v.kind==='scroll'){if(!finite(v.dy))return null}
      else if(v.kind!=='release'&&!(v.kind===undefined&&string(v.control)&&(v.state==='down'||v.state==='up')))return null;
      break;
    default:return {type:'unknown'};
  }
  // 上の実行時検証以外で受信JSONを製品の型へ昇格させない。
  return v as PcMessage;
}
