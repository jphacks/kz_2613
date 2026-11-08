import type {PhoneGame} from '../contracts.ts';
import type {HostState,InjectionState} from '../model/domain.ts';
import {isPhoneGame} from './protocol.ts';

export type RemoteInput = {type:'remote';route:string;epoch:number} & (
  {kind:'move';dx:number;dy:number} | {kind:'scroll';dy:number} | {kind:'release'}
  | {kind?:undefined;control:string;state:'down'|'up'});
export type PcMessage = {type:'state';game:PhoneGame;inject:InjectionState} & HostState
  | {type:'game';game:PhoneGame} | {type:'key_result';ok:boolean}
  | {type:'manual_result';message:string} | RemoteInput | {type:'unknown'};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const optional=(v:Record<string,unknown>,key:string,valid:(v:unknown)=>boolean)=>!(key in v)||valid(v[key]);
const string=(v:unknown)=>typeof v==='string';
const boolean=(v:unknown)=>typeof v==='boolean';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(string);
const stats=(v:unknown)=>object(v)&&['avg','p95','max','unacked'].every(k=>optional(v,k,finite))&&optional(v,'path',string);
const slot=(v:unknown)=>object(v)&&typeof v.name==='string'&&['P1','P2','P3','P4'].includes(v.name)&&optional(v,'connected',boolean)
  &&['assigned'].every(k=>optional(v,k,boolean))&&optional(v,'ua',string)&&optional(v,'pressed',strings)
  &&optional(v,'clientStats',v=>v===null||stats(v))&&optional(v,'net',v=>object(v)&&optional(v,'stalls',finite))
  &&optional(v,'reconnects',finite)&&optional(v,'rtcState',string);
const inject=(v:unknown)=>object(v)&&string(v.mode)&&boolean(v.active)
  &&optional(v,'emergencyHotkey',string)&&optional(v,'emergencyHotkeyError',v=>v===null||string(v))
  &&optional(v,'outputs',v=>object(v)&&Object.values(v).every(v=>object(v)&&string(v.kind)&&string(v.label)));

export function decodePcMessage(text:string):PcMessage|null {
  let v:unknown;try{v=JSON.parse(text)}catch{return null}
  if(!object(v)||!string(v.type))return null;
  switch(v.type){
    case 'state':
      if(!isPhoneGame(v.game)||!inject(v.inject)||!optional(v,'slots',v=>Array.isArray(v)&&v.every(slot))
        ||!optional(v,'games',v=>Array.isArray(v)&&v.every(v=>object(v)&&string(v.id)&&string(v.source)
          &&optional(v,'name',string)&&['verified','launchable','image'].every(k=>optional(v,k,boolean))))
        ||!optional(v,'minecraft',v=>v===null||object(v)&&['launchable','image'].every(k=>optional(v,k,boolean)))
        ||!optional(v,'network',v=>object(v)&&optional(v,'bluetoothAudio',boolean))||!optional(v,'gamesScanning',boolean))return null;
      break;
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
