import type {PhoneGame,Slot} from '../contracts.ts';
export interface ClientStats {rtc?:ClientStats|null;avg?:number;p95?:number;max?:number;unacked?:number;path?:string}
export interface SlotState {
  role?:string;ip?:string;lastSeen?:number;events?:number;lost?:number;outOfOrder?:number;lookLost?:number;via?:{rtc?:number;ws?:number};
  name:Slot;connected?:boolean;assigned?:boolean;ua?:string;pressed?:string[];
  clientStats?:ClientStats|null;net?:{stalls?:number};reconnects?:number;rtcState?:string;
}
export interface InjectionState {
  available?:boolean;error?:string|null;target?:{ok?:boolean;expect?:string;process?:string|null}|null;
  mode:string;active:boolean;emergencyHotkeyError?:string|null;emergencyHotkey?:string;
  outputs?:Record<string,{kind:string;label:string;code?:string|null}>;
}
export interface DetectedGame {id:string;name?:string;source:string;verified?:boolean;launchable?:boolean;image?:boolean}
export interface GameEntry extends DetectedGame {name:string;verified:boolean;launchable:boolean;image:boolean}
export interface HostState {
  now?:number;
  slots?:SlotState[];games?:DetectedGame[];minecraft?:{launchable?:boolean;image?:boolean}|null;
  network?:{bluetoothAudio?:boolean};gamesScanning?:boolean;game?:PhoneGame;inject?:InjectionState;
}
export type ScreenId='join'|'game'|'roles';
export interface Navigation {screen:ScreenId;game:string|null;swap:boolean}
export interface EffectState {view:string;connected:Slot[];lineupOk:boolean}
export type UiActionKind='none'|'next'|'back'|'confirm'|'prepare'|'launch'|'wait'|'swap';
export interface UiAction {kind:UiActionKind;label:string;disabled?:boolean;note?:string;id?:string;alt?:UiAction}

export interface PcInfo {
  port: number; build?: {version: string; commit?: string|null};
  wifi?: {ssid: string; qr: string}|null; hotspot?: {on: boolean}|null;
  urls?: {url: string; qr: string; hotspot?: boolean;address?:string;name?:string}[];
}

export interface LogEntry {t:number;kind:string;burst?:boolean;slot?:string;cmd?:string;reason?:string;mode?:string;[key:string]:unknown}

export interface InjectionNotice {out:string;state:'down'|'up';slot:string;ok:boolean;label:string}
export interface LookNotice {dx:number;dy:number;slot:string}
