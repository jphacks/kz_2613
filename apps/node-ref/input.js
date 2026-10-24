// Windows の SendInput でキーボード / マウス入力を注入する。
// キーはゲーム (DirectInput / raw input) でも拾えるようスキャンコードで送る。

import koffi from 'koffi';

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;

let sendKbd = null;
let sendMouse = null;
let inputSize = 0;
let loadError = null;

// RECOOPLAY_DRY_RUN=1 なら実際には注入しない (自動テスト用)
const DRY_RUN = process.env.RECOOPLAY_DRY_RUN === '1';

if (DRY_RUN) {
  sendKbd = sendMouse = () => 1;
} else if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll');
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
      dx: 'int32',
      dy: 'int32',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    // INPUT は MOUSEINPUT / KEYBDINPUT の union (x64 で 40 バイト)。種類ごとに別の型として宣言する
    const INPUT_KB = koffi.struct('INPUT_KB', { type: 'uint32', ki: KEYBDINPUT, _pad: koffi.array('uint8', 8) });
    const INPUT_MS = koffi.struct('INPUT_MS', { type: 'uint32', mi: MOUSEINPUT });
    inputSize = koffi.sizeof(INPUT_KB);
    if (koffi.sizeof(INPUT_MS) !== inputSize) throw new Error('INPUT size mismatch');
    sendKbd = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT_KB *pInputs, int cbSize)');
    sendMouse = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT_MS *pInputs, int cbSize)');
  } catch (e) {
    loadError = e.message;
  }
} else {
  loadError = 'Windows 以外では注入できません';
}

// Windows のタイマー分解能は既定 15.6ms。視点の補間を細かく刻めるよう 1ms にする (プロセス終了で自動的に戻る)
if (process.platform === 'win32') {
  try {
    koffi.load('winmm.dll').func('uint32 __stdcall timeBeginPeriod(uint32 uPeriod)')(1);
  } catch {}
}

export const inputAvailable = () => !!sendKbd;
export const inputError = () => loadError;

export function sendKey(scan, ext, down) {
  if (!sendKbd) return false;
  const flags = KEYEVENTF_SCANCODE | (ext ? KEYEVENTF_EXTENDEDKEY : 0) | (down ? 0 : KEYEVENTF_KEYUP);
  return sendKbd(1, { type: INPUT_KEYBOARD, ki: { wVk: 0, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 }, _pad: new Array(8).fill(0) }, inputSize) === 1;
}

function mouse(dx, dy, data, flags) {
  if (!sendMouse) return false;
  return sendMouse(1, { type: INPUT_MOUSE, mi: { dx, dy, mouseData: data >>> 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } }, inputSize) === 1;
}

export const sendMouseMove = (dx, dy) => mouse(dx, dy, 0, MOUSEEVENTF_MOVE);
export const sendMouseButton = (button, down) =>
  mouse(0, 0, 0, button === 'left' ? (down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP) : down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP);
export const sendWheel = (notches) => mouse(0, 0, notches * 120, MOUSEEVENTF_WHEEL);
