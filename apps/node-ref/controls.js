// スマホの操作 (control) と PC への出力 (output) の対応表

// 出力: PC に注入するキー / マウス操作。code はブラウザの KeyboardEvent.code (疑似ゲーム画面での照合用)
export const OUTPUTS = {
  KEY_W: { label: 'W', kind: 'key', scan: 0x11, code: 'KeyW' },
  KEY_A: { label: 'A', kind: 'key', scan: 0x1e, code: 'KeyA' },
  KEY_S: { label: 'S', kind: 'key', scan: 0x1f, code: 'KeyS' },
  KEY_D: { label: 'D', kind: 'key', scan: 0x20, code: 'KeyD' },
  SPACE: { label: 'Space', kind: 'key', scan: 0x39, code: 'Space' },
  LSHIFT: { label: 'Shift', kind: 'key', scan: 0x2a, code: 'ShiftLeft' },
  LCTRL: { label: 'Ctrl', kind: 'key', scan: 0x1d, code: 'ControlLeft' },
  KEY_E: { label: 'E', kind: 'key', scan: 0x12, code: 'KeyE' },
  KEY_Q: { label: 'Q', kind: 'key', scan: 0x10, code: 'KeyQ' },
  ARROW_UP: { label: '↑', kind: 'key', scan: 0x48, ext: true, code: 'ArrowUp' },
  ARROW_DOWN: { label: '↓', kind: 'key', scan: 0x50, ext: true, code: 'ArrowDown' },
  ARROW_LEFT: { label: '←', kind: 'key', scan: 0x4b, ext: true, code: 'ArrowLeft' },
  ARROW_RIGHT: { label: '→', kind: 'key', scan: 0x4d, ext: true, code: 'ArrowRight' },
  ENTER: { label: 'Enter', kind: 'key', scan: 0x1c, code: 'Enter' },
  ESC: { label: 'Esc', kind: 'key', scan: 0x01, code: 'Escape' },
  MOUSE_L: { label: '左クリック', kind: 'mouse', button: 'left' },
  MOUSE_R: { label: '右クリック', kind: 'mouse', button: 'right' },
  WHEEL_UP: { label: 'ホイール↑', kind: 'wheel', notches: 1 },
  WHEEL_DOWN: { label: 'ホイール↓', kind: 'wheel', notches: -1 },
};

// ホストのリモコン (ロビー / 一時停止中に P1 だけが使える)
export const REMOTE_CONTROLS = {
  UP: 'ARROW_UP',
  DOWN: 'ARROW_DOWN',
  LEFT: 'ARROW_LEFT',
  RIGHT: 'ARROW_RIGHT',
  ENTER: 'ENTER',
  ESC: 'ESC',
};

// 協力プレイ中の役割ごとの操作 (P2 の視点は look メッセージでマウス移動)
export const ROLE_CONTROLS = {
  P1: { FWD: 'KEY_W', BACK: 'KEY_S', LEFT: 'KEY_A', RIGHT: 'KEY_D', JUMP: 'SPACE', SNEAK: 'LSHIFT', SPRINT: 'LCTRL' },
  P2: {},
  P3: { ATTACK: 'MOUSE_L', USE: 'MOUSE_R', INV: 'KEY_E', DROP: 'KEY_Q', SLOT_PREV: 'WHEEL_UP', SLOT_NEXT: 'WHEEL_DOWN' },
};
