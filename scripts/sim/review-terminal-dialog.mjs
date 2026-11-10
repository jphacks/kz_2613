import assert from 'node:assert/strict';
import {controllerHarness} from './fixtures/phone-harness.mjs';
const h=controllerHarness(); await h.ready({phase:'paused'});
h.el('endBtn').fire('click');
assert(h.el('phoneConfirm').open);
h.sockets[0].close(4009);
assert.match(h.el('fullMessage').textContent,/PCのアプリが終了しました/);
assert.equal(h.el('phoneConfirm').open,false,'再接続しない終了通知では、最前面の確認を閉じて終了案内を見せる');
