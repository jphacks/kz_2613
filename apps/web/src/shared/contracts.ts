// UIと既存入力エンジンの境界。OSキーや任意の役割を送るAPIを公開しない。
export type Slot = 'P1' | 'P2' | 'P3' | 'P4';
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}
export interface PlayerChip { name: Slot; on: boolean; label: string }
export interface WaitModel { character: string; heading: string; role: string; title: string; players: PlayerChip[] }
export interface RemoteModel {
  players: PlayerChip[]; route: string; startLabel: string; startDisabled: boolean;
  openGameLabel: string; openGameHidden: boolean; endVisible: boolean; endLabel: string; transferTo: Slot[]; note: string;
  routeBlocked: boolean; notice: string; openAppHidden: boolean; appReturnHint: string;
}
export interface PlayerCardModel { slot: Slot; index: number; className: string; badge: string; name: string; role: string; device: string }
export interface RoleColumnModel { slot: Slot; index: number; picked: boolean; swap: boolean; title: string; line: string; ack: boolean }
export interface Action { id: string; type: string; group?: string; label?: string; weight?: number }
export interface Profile {
  id: string; name: string; actions: Action[]; status?: string; controllerSupported?: boolean;
  assignment?: Partial<Record<Slot,string[]>>;
  assignments?: Record<number,Partial<Record<Slot,string[]>>>;
  groups?: {id:string;label?:string}[];
  /** 分担の作り方 (#432)。model はモデルの分担 (画面では「独自AI」、未検証)、rule は規則の分担 (画面では「定型ルール」) */
  presetSource?: string; modelPresetAvailable?: boolean; presetChoosable?: boolean;
}
export interface ControllerGame {
  profile: Profile;
  assigned?: Partial<Record<Slot, string[]>>;
  keys?: { actions?: Record<string, { label: string; out?: string } | null>; controls?: Record<string, {label: string; out?: string} | null>; warnings?: string[]; edited?: string[] };
}
export interface PhoneGame extends Omit<ControllerGame, 'profile'> {
  profile?: ControllerGame['profile'] | null;
  phase: 'lobby' | 'preparing' | 'coop' | 'paused'; epoch: number; title?: string; titleName?:string;
  connected: Slot[]; participants?: Slot[]; roleAck?: Slot[]; roleOf?: Partial<Record<Slot, Slot>>;
  reason?: string | null; autoResume?: boolean; inputTarget?: boolean; prepareStatus?: string;
  canReady?: boolean; canPrepare?: boolean; canResume?: boolean; lineupOk?: boolean; lineupDisconnected?: Slot[];
  readyReasons?: string[]; remoteRoute?: string; remoteLeave?: boolean;
  canSwap?: boolean; canChangePlayers?: boolean; canLaunch?:boolean; canOpenApp?: boolean; rotationSeconds?: number; rotationSoon?: boolean; rotationNext?: Partial<Record<Slot, string[]>> | null; rotationCount?: number; launch?: LaunchState|null;
  required?:number; autoResumeMs?:number;
}
export interface LaunchState {id?:string;state:string;title?:string;message?:string}
export interface PhoneSnapshot { me: Slot | null; isHost: boolean; game: PhoneGame | null }
export interface PhoneViewBindings extends InputBindings {
  releaseAll(): void; onDiagnosticsOpen(): void; onRoleOk(): void; onTransferHost(slot: Slot): void; onLeave(): void;
}
export interface PhoneTelemetry {rtt:string;rttAvg:string;sent:number;unacked:number;path:string;advice:string;inputMetrics:string;burstBusy:boolean}
export type PhoneView = ((snapshot: PhoneSnapshot) => void) & {
  note(text: string): void; dispose():void;
  connection(text:string,kind:string):void;
  telemetry(patch:Partial<PhoneTelemetry>):void;
  blocked(message?:string):void;
  liftHint(visible:boolean):void;
  /** PC のアプリと一定時間つながらないとき、画面全体を覆って操作を止める (#302) */
  offline(visible:boolean):void;
  confirm(request:ConfirmRequest):void;
};
// ページ内の確認。confirm() はJSを止めてハートビートが途切れるため使わない (#289)
export interface ConfirmRequest {message:string;ok:string;valid(remote:RemoteModel):boolean;run():void}
export type Direction = 'up' | 'left' | 'right' | 'down';
export interface InputBindings {
  releaseAll(): void;
  bindControl(element: HTMLElement): (()=>void) | void;
  bindStick(element: HTMLElement | null, codes: Partial<Record<Direction, string>>): void;
  bindLook(pad:HTMLElement, sensitivity:HTMLInputElement, value:HTMLElement):()=>void;
}
