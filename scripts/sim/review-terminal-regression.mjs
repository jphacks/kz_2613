import assert from 'node:assert/strict';
import {controllerHarness} from './fixtures/phone-harness.mjs';
let checks=0;
for (const kind of ['end','transfer','diagnostics','both']) {
 const h=controllerHarness(); await h.ready({phase:kind==='end'?'paused':'lobby',connected:['P1','P2']});
 if(kind==='end') h.el('endBtn').fire('click');
 if(kind==='transfer'||kind==='both') h.transferHost('P2');
 if(kind==='diagnostics'||kind==='both') h.el('phoneSettingsBtn').fire('click');
 h.sockets[0].close(4009); h.advance(10000);
 assert(!h.el('phoneConfirm').open&&!h.el('phoneDiagnostics').open);
 assert.equal(h.confirmation.get(),null); assert.match(h.el('fullMessage').textContent,/PCのアプリが終了しました/);
 h.answerConfirm(true); assert.equal(h.messages().filter(m=>m.type==='transfer_host'||m.type==='command'&&m.cmd==='END').length,0);
 assert.equal(h.sockets.length,1); checks++;
}
for(const kind of ['end','transfer']) {
 const h=controllerHarness();const opts={phase:kind==='end'?'paused':'lobby',connected:['P1','P2']}; await h.ready(opts);
 if(kind==='end') h.el('endBtn').fire('click');else h.transferHost('P2');
 h.sockets[0].close(1006); h.advance(3600);
 assert(h.el('phoneConfirm').open);assert.notEqual(h.confirmation.get(),null);
 h.answerConfirm(true);assert(h.el('phoneConfirm').open);
 const s=h.sockets.at(-1);s.open();s.receive({type:'welcome',slot:'P1',isHost:true,role:'ホスト',token:'new'});
 s.receive({type:'game',game:h.game({...opts,epoch:19})});
 h.answerConfirm(true);assert(!h.el('phoneConfirm').open);
 const sent=s.sent.find(m=>kind==='end'?m.cmd==='END':m.type==='transfer_host'); assert(sent); if(kind==='end')assert.equal(sent.epoch,19);
 checks++;
}
console.log(`独立回帰 ${checks}/6合格: 終端の全モーダル破棄、未実行要求破棄、一時断の確認保持と再接続後送信`);
