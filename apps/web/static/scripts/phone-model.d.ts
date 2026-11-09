import type { PhoneGame, RemoteModel, Slot, Store, WaitModel, PlayerChip } from '../../web/src/contracts';
export function reasonText(reason: string): string;
export function playerChips(game: PhoneGame, me: Slot): PlayerChip[];
export function inputWarnText(input: { isHost: boolean; game: PhoneGame; name: string; notice: string }): string;
export function waitModel(input: { me: Slot; game: PhoneGame; roleTitle: string; joined: boolean; autoWait?: boolean }): WaitModel;
export function remoteModel(input: { me: Slot; isHost: boolean; game: PhoneGame; name: string; autoWait?: boolean }): RemoteModel;
export function createStore<T>(initial: T): Store<T>;
