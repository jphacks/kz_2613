import type {PhoneGame, Slot} from '../contracts.ts';
import type {PHONE_PROTOCOL_VERSION} from './version.ts';

export interface Welcome {type:'welcome';slot:Slot;isHost:boolean;role:string;token?:string;protocolVersion?:typeof PHONE_PROTOCOL_VERSION;reconnected?:boolean}
export type RtcSignal = {type:'rtc-answer';sdp:string} | {type:'rtc-cand';cand:string;mid?:string|null};
export type ClientSignal = {type:'rtc-offer';sdp:string} | {type:'rtc-cand';cand:string;mid:string|null};
export type ServerMessage = Welcome | RtcSignal
  | {type:'game';game:PhoneGame}
  | {type:'command_result';accepted:boolean;reasons?:string[]}
  | {type:'pong'|'kpong';t:number}
  | {type:'ack';iseq:number;via:'ws'|'rtc';stale?:boolean}
  | {type:'full';retryMs?:number|null} | {type:'error';code:string}
  | {type:'unknown';originalType:string};
export interface ButtonInput {button:string;state:'down'|'up';burst?:boolean}
export interface LookInput {type:'look';lseq:number;epoch:number;cx:number;cy:number}
export interface SequencedInput extends ButtonInput {type:'input';iseq:number;epoch:number|undefined;t:number}
export type StoragePort = Pick<Storage,'getItem'|'setItem'>;
