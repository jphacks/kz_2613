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
export interface Navigation {screen:string;game:string|null;swap:boolean}
export interface EffectState {view:string;connected:Slot[];lineupOk:boolean}
export interface UiAction {kind:string;label:string;disabled?:boolean;note?:string;id?:string;alt?:UiAction}
