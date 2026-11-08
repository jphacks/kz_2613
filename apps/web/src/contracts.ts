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
  openGameLabel: string; openGameHidden: boolean; endVisible: boolean; transferTo: Slot[]; note: string;
}
export interface PlayerCardModel { slot: Slot; index: number; className: string; badge: string; name: string; role: string; device: string }
export interface RoleColumnModel { slot: Slot; index: number; picked: boolean; swap: boolean; title: string; line: string; ack: boolean }
export interface Action { id: string; type: string; group?: string; label?: string }
export interface ControllerGame {
  profile: { id: string; name: string; actions: Action[] };
  assigned?: Partial<Record<Slot, string[]>>;
  keys?: { actions?: Record<string, { label: string; out?: string } | null>; controls?: Record<string, {label: string; out?: string} | null>; warnings?: string[]; edited?: string[] };
}
export interface PhoneGame extends Omit<ControllerGame, 'profile'> {
  profile: ControllerGame['profile'] | null;
  phase: 'lobby' | 'preparing' | 'coop' | 'paused'; epoch: number; title?: string;
  connected: Slot[]; participants?: Slot[]; roleAck?: Slot[]; roleOf?: Partial<Record<Slot, Slot>>;
  reason?: string; autoResume?: boolean; inputTarget?: boolean; prepareStatus?: string;
  canReady?: boolean; canPrepare?: boolean; canResume?: boolean; lineupOk?: boolean;
  readyReasons?: string[]; remoteRoute?: string;
  canSwap?: boolean; canChangePlayers?: boolean; rotationSeconds?: number; launch?: {state: string; title?: string};
}
export interface PhoneSnapshot { me: Slot | null; isHost: boolean; game: PhoneGame | null }
export interface PhoneViewBindings extends Omit<InputBindings, 'lookParts'> {
  releaseAll(): void; onDiagnosticsOpen(): void; onRoleOk(): void; onTransferHost(slot: Slot): void;
}
export type PhoneView = ((snapshot: PhoneSnapshot) => void) & { note(text: string): void };
export type Direction = 'up' | 'left' | 'right' | 'down';
export interface InputBindings {
  releaseAll(): void;
  bindControl(element: HTMLElement): void;
  bindStick(element: HTMLElement | null, codes: Partial<Record<Direction, string>>): void;
  lookParts: HTMLElement[];
}
export type BuildController = (container: HTMLElement, game: ControllerGame, slot: Slot, bindings: InputBindings) => boolean;
