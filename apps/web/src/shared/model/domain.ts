import type {PhoneGame,Slot} from '../contracts.ts';
export interface ClientStats {avg?:number;p95?:number;max?:number;unacked?:number;path?:string}
export interface SlotState {
  name:Slot;connected?:boolean;assigned?:boolean;ua?:string;pressed?:string[];
  clientStats?:ClientStats|null;net?:{stalls?:number};reconnects?:number;rtcState?:string;
}
export interface InjectionState {
  mode:string;active:boolean;emergencyHotkeyError?:string|null;emergencyHotkey?:string;
  outputs?:Record<string,{kind:string;label:string}>;
}
export interface DetectedGame {id:string;name?:string;source:string;verified?:boolean;launchable?:boolean;image?:boolean}
export interface GameEntry extends DetectedGame {name:string;verified:boolean;launchable:boolean;image:boolean}
export interface HostState {
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
  urls?: {url: string; qr: string; hotspot?: boolean}[];
}
