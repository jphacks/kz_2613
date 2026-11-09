import type {PhoneTelemetry} from '../contracts.ts';

interface FrameClock {
  request(callback: () => void): number;
  cancel(id: number): void;
}

// 診断値をACK/input callbackから直接Reactへ通知しない。同一frameの更新をまとめる。
export function createTelemetryPublisher(initial: PhoneTelemetry, publish: (value: PhoneTelemetry) => void,
  clock: FrameClock = {request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id)}) {
  let latest = initial;
  let pending: number | undefined;
  let disposed = false;
  function patch(value: Partial<PhoneTelemetry>) {
    if (disposed) return;
    latest = {...latest, ...value};
    if (pending !== undefined) return;
    pending = clock.request(() => {
      pending = undefined;
      if (!disposed) publish(latest);
    });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (pending !== undefined) clock.cancel(pending);
    pending = undefined;
  }
  return {patch, dispose};
}
