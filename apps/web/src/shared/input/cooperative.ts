// 移動スティックと30Hzの協力視点。画面の再描画・通信の再生成から独立させる。
import {attachStick} from './stick.ts';
import {createLifetime} from './lifetime.ts';
import type {PhoneGame, Direction} from '../contracts.ts';
import type {InputOwner} from './owners.ts';
import type {LookInput} from '../transport/messages.ts';
interface CooperativeOptions {getGame():PhoneGame|null;getRole():string|null;canLook?():boolean;isOpen():boolean;ctlDown(control:string,at:number,owner:InputOwner):void;ctlUp(control:string,owner:InputOwner):void;sendLook(message:LookInput,at:number|null):void;onCancel?():void}
export function bindCooperativeInput({getGame,getRole,canLook=()=>getRole()==='P2',isOpen,ctlDown,ctlUp,sendLook,onCancel=()=>{}}:CooperativeOptions) {
  const lifetime = createLifetime();
  // ---- 移動スティック (8 方向 → 前後左右の操作の組み合わせ、#139)。画面を作り直すたびに置き換える ----
  let genStick: ReturnType<typeof attachStick> | null = null;
  function setGeneratedStick(el: HTMLElement | null, codes: Partial<Record<Direction,string>>) {
    genStick?.dispose();
    genStick = el ? attachStick(el, { codes, isOpen, ctlDown, ctlUp, onCancel }) : null;
  }
  function stickRelease() { genStick?.release(); }

  // ---- P2: 視点パッド (ドラッグ量をマウス相対移動として送る) ----
  let pad: HTMLElement | null = null, dot: HTMLElement | null = null;
  let unbindLook: (()=>void) | undefined;
  let moveAt: number | null = null;
  let padId: number | null = null;
  let lastX = 0, lastY = 0, accX = 0, accY = 0;
  function bindLook(element: HTMLElement, sensitivity: HTMLInputElement, sensitivityValue: HTMLElement) {
    unbindLook?.();
    const candidate = element.querySelector<HTMLElement>('.dot');
    if (!candidate) throw new Error('視点パッドの目印がありません');
    const mark: HTMLElement = candidate;
    pad = element; dot = mark;
    const binding = createLifetime();
  const sens = () => Number(sensitivity.value);
  binding.listen(sensitivity, 'input', () => {
    sensitivityValue.textContent = sens().toFixed(1);
    try { localStorage.setItem('recooplay.sens', sensitivity.value); } catch {}
  });
  try { const v = localStorage.getItem('recooplay.sens'); if (v) { sensitivity.value = v; sensitivityValue.textContent = Number(v).toFixed(1); } } catch {}
  binding.listen(element, 'pointerdown', (e) => {
    e.preventDefault();
    if (!isOpen()) return;
    if (padId != null) return;
    padId = e.pointerId;
    element.setPointerCapture?.(e.pointerId);
    lastX = e.clientX; lastY = e.clientY;
    element.classList.add('active');
    moveDot(e);
  });
  binding.listen(element, 'pointermove', (e) => {
    if (e.pointerId !== padId) return;
    moveAt ??= e.timeStamp;
    accX += (e.clientX - lastX) * sens();
    accY += (e.clientY - lastY) * sens();
    lastX = e.clientX; lastY = e.clientY;
    moveDot(e);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) binding.listen(element, t, (e) => {
    if (e.pointerId !== padId) return;
    if (e.type !== 'pointerup') { onCancel(); accX = accY = 0; moveAt = null; }
    padId = null;
    element.classList.remove('active');
    mark.style.display = 'none';
  });
  function moveDot(e: PointerEvent) {
    const r = element.getBoundingClientRect();
    mark.style.display = 'block';
    mark.style.left = (e.clientX - r.left) + 'px';
    mark.style.top = (e.clientY - r.top) + 'px';
  }

    unbindLook = lifetime.own(() => {release();binding.dispose();pad=null;dot=null;});
    return unbindLook;
  }
  // 溜まった移動量を 30Hz で送る。ACK は返さない。滑らかさは PC 側で補間する。
  // 累積値はepochごとに0へ戻す。同じepoch内の欠落だけを次のパケットで取り戻す。
  const look = { seq: 0, cx: 0, cy: 0 };
  lifetime.interval(() => {
    const game = getGame();
    if ((accX || accY) && game?.phase === 'coop' && canLook() && isOpen()) {
      look.cx += accX;
      look.cy += accY;
      const msg: LookInput = { type: 'look', lseq: ++look.seq, epoch: game.epoch, cx: Math.round(look.cx * 100) / 100, cy: Math.round(look.cy * 100) / 100 };
      sendLook(msg, moveAt);
      moveAt = null;
    }
    accX = accY = 0;
  }, 33);


  function release() { stickRelease(); padId = null; accX = accY = 0; moveAt = null; pad?.classList.remove('active'); if(dot)dot.style.display = 'none'; }
  function resetEpoch() { release(); look.seq = look.cx = look.cy = 0; }
  // 今入力に使っている指 (スティック・視点パッド)。強制的に止めたとき、指を離すまで再開しないことを案内する (#285 Q27)
  function activePointers() { return [genStick?.active(), padId].filter((id): id is number => id != null); }
  return {release, resetEpoch, setGeneratedStick, bindLook, activePointers, dispose(){release();genStick?.dispose();genStick=null;lifetime.dispose();}};
}
