// DOMの入力境界・キャンセル・RTC形式を、OS入力なしで検証する。
import assert from 'node:assert/strict';
import {bindTouchpad} from '../../apps/web-static/scripts/touchpad.js';
import {bindCooperativeInput} from '../../apps/web-static/scripts/cooperative-input.js';
import {stickDirections} from '../../apps/web-static/scripts/stick.js';
import {createFastChannel} from '../../apps/web-static/scripts/transport.js';
import {createVirtualCursor} from '../../apps/web-static/scripts/virtual-cursor.js';
import {myActions, generatedKey, buildGenerated} from '../../apps/web-static/scripts/generated-controls.js';
const intervals = [];
const originalInterval = globalThis.setInterval;
globalThis.setInterval = (fn,ms) => { intervals.push({fn,ms}); return intervals.length; };
class Element {
  constructor() { this.handlers = new Map(); this.style = {}; this.value = '2'; this.classList = {add(){},remove(){},toggle(){}}; }
  addEventListener(name,fn) { const list = this.handlers.get(name)||[]; list.push(fn);this.handlers.set(name,list); }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,width:200,height:200}; }
  fire(name,extra={}) { for (const fn of this.handlers.get(name)||[]) fn({type:name,pointerId:1,clientX:100,clientY:100,timeStamp:performance.now(),preventDefault(){},...extra}); }
}
// 操作定義の画面を作る試験用の、最小の DOM (HTML 文字列を集める)
class FakeNode {
  constructor() { this.parts = []; this.className = ''; }
  set innerHTML(v) { this.parts = v ? [v] : []; }
  get innerHTML() { return this.parts.map((p) => (typeof p === 'string' ? p : `<div class="${p.className}">${p.innerHTML}</div>`)).join(''); }
  insertAdjacentHTML(_, html) { this.parts.push(html); }
  append(...nodes) { this.parts.push(...nodes); }
  get children() { return this.parts; }
  querySelectorAll() { return [...this.innerHTML.matchAll(/data-ctl="([^"]+)"/g)].map((m) => ({ ctl: m[1] })); }
}
globalThis.document = { createElement: () => new FakeNode() };
const GAME = {
  phase: 'coop',
  profile: { id: 'test-pseudo', name: '試験', groups: [{ id: 'movement', label: '移動' }, { id: 'gameplay', label: 'アクション' }],
    actions: [{ id: 'left', label: '左', group: 'movement', type: 'button' }, { id: 'right', label: '右', group: 'movement', type: 'button' }, { id: 'jump', label: 'ジャンプ', group: 'movement', type: 'button' },
      { id: 'action', label: 'アクション', group: 'gameplay', type: 'button' }, { id: 'zoom', label: 'ズーム', group: 'gameplay', type: 'wheel' }, { id: 'aim', label: '狙い', group: 'gameplay', type: 'mouseDelta' }] },
  assigned: { P1: ['left', 'right', 'action', 'zoom', 'aim'], P2: ['jump'], P3: [] },
  keys: { actions: { left: { label: 'A' }, right: { label: 'D' }, jump: { label: 'Space' }, action: null } },
};
let passed=0;
async function test(name,fn) { await fn();passed++;console.log(`合格: ${name}`); }
try {
  await test('操作定義の画面: 割り当てた操作だけをボタンにし、方向はスティック、ホイールは前後、視点はパッドを移す。Minecraft も同じ画面 (#141)', () => {
    const minecraft = { ...GAME, profile: { ...GAME.profile, id: 'minecraft-java' } };
    assert.deepEqual(myActions(minecraft, 'P1').map((a) => a.id), ['left', 'right', 'action', 'zoom', 'aim'], 'Minecraftも確定した担当を使う');
    assert.deepEqual(myActions(minecraft, 'P2').map((a) => a.id), ['jump']);
    assert.deepEqual(myActions(minecraft, 'P4'), [], '担当外の枠へ操作を渡さない');
    assert.equal(myActions({ ...GAME, assigned: {} }, 'P1'), null);
    assert.deepEqual(myActions(GAME, 'P2').map((a) => a.id), ['jump']);
    const box = new FakeNode(), bound = [], look = [new FakeNode()];
    const sticks = [];
    const hasLook = buildGenerated(box, GAME, 'P1', { bindControl: (el) => bound.push(el.ctl), bindStick: (el, codes) => sticks.push([el?.className, codes]), lookParts: look });
    assert.equal(hasLook, true);
    assert.deepEqual(bound, ['act:action', 'act:zoom:up', 'act:zoom:down']);
    // 左・右の 2 方向 → スティック (#139)。ボタンとしては付けない
    assert.deepEqual(sticks, [['stick gen-stick', { left: 'act:left', right: 'act:right' }]]);
    const html = box.innerHTML;
    assert.match(html, /gen-stick/);
    assert.match(html, /送らない/); // action は送れないキー
    assert.match(html, />Dキー</); // 実際のキーの表示
    assert.ok(box.parts.some((g) => g.parts?.includes(look[0])), '視点のパッドを移していない');
    const p3 = new FakeNode();
    const none = [];
    buildGenerated(p3, GAME, 'P3', { bindControl() {}, bindStick: (el) => none.push(el), lookParts: [] });
    assert.deepEqual(none, [null], '担当がなければ前のスティックを外す');
    assert.match(p3.innerHTML, /担当する操作がありません/);
    assert.notEqual(generatedKey(GAME, 'P1'), generatedKey({ ...GAME, keys: { actions: { left: { label: 'Z' } } } }, 'P1'), 'キーが変わったら作り直す');
  });
  await test('操作の主表示: Minecraftも別ゲームも実キー・クリック・ホイールを示し、ゲーム内の意味を流用しない (#150)', () => {
    for (const id of ['minecraft-java', 'generic']) {
      const game = { ...GAME, profile: { ...GAME.profile, id,
        groups: [{ id: 'gameplay', label: '攻撃・持ち物' }],
        actions: [{ id: 'use', label: '置く', group: 'gameplay', type: 'button' },
          { id: 'inventory', label: 'インベントリ', group: 'gameplay', type: 'button' },
          { id: 'wheel', label: '持ち物の切り替え', group: 'gameplay', type: 'wheel' }] },
        assigned: { P1: ['use', 'inventory', 'wheel'] },
        keys: { actions: { use: { label: '右クリック' }, inventory: { label: 'R' } } } };
      const box = new FakeNode(), controls = [];
      buildGenerated(box, game, 'P1', { bindControl: el => controls.push(el.ctl) });
      assert.deepEqual(controls, ['act:use', 'act:inventory', 'act:wheel:up', 'act:wheel:down']);
      assert.match(box.innerHTML, /act:use">右クリック<\/button>/);
      assert.match(box.innerHTML, /act:inventory">Rキー<\/button>/);
      assert.match(box.innerHTML, /ホイール↑/);
      assert.doesNotMatch(box.innerHTML, /攻撃|持ち物|置く|インベントリ/);
    }
  });
  await test('視点: 操作定義の分担があれば、視点を割り当てた人だけが look を送る', () => {
    const pad = new Element(), sent = [];
    let role = 'P1', look = true;
    globalThis.document.getElementById = (id) => (id === 'pad' ? pad : new Element());
    bindCooperativeInput({ getGame: () => ({ phase: 'coop', epoch: 1 }), getRole: () => role, canLook: () => look, isOpen: () => true, ctlDown() {}, ctlUp() {}, sendLook: (m) => sent.push(m) });
    const tick = intervals.at(-1).fn;
    pad.fire('pointerdown'); pad.fire('pointermove', { clientX: 130 }); tick();
    assert.equal(sent.length, 1, 'P1 (視点の担当) の look を送らない');
    look = false; pad.fire('pointermove', { clientX: 160 }); tick();
    assert.equal(sent.length, 1, '担当でないのに look を送った');
  });
  await test('タッチパッド: キャンセル・無効化で未送信移動を捨て、解放を1回通知する',()=>{
    const pad = new Element(), messages=[]; let enabled=true,taps=0;
    bindTouchpad(pad,{enabled:()=>enabled,send:m=>messages.push(m),tap:()=>taps++});
    const tick=intervals.at(-1).fn;
    pad.fire('pointerdown');pad.fire('pointermove',{clientX:150});pad.fire('pointercancel');tick();
    assert.deepEqual(messages.map(m=>m.kind),['release']);
    pad.fire('pointerdown');pad.fire('pointerup');assert.equal(taps,1);
    pad.fire('pointerdown');pad.fire('pointermove',{clientX:160}); enabled=false;tick();enabled=true;tick();
    assert.equal(messages.length,1);
  });
  await test('タッチパッド: 2本指でナチュラルな向きにスクロールし、カーソルは動かさない。2本指のタップは右クリック (#122)',()=>{
    const pad = new Element(), messages=[]; let taps=0,rights=0;
    bindTouchpad(pad,{enabled:()=>true,send:m=>messages.push(m),tap:()=>taps++,rightTap:()=>rights++});
    const tick=intervals.at(-1).fn;
    const at=(name,id,y,t=0)=>pad.fire(name,{pointerId:id,clientX:100,clientY:y,timeStamp:t});
    // 1本目でカーソルを少し動かした後、2本目が触れたら未送信の移動は捨ててスクロールにする
    at('pointerdown',1,100);pad.fire('pointermove',{pointerId:1,clientX:110,clientY:100});at('pointerdown',2,100);
    // 2本とも上へ 40px → 平均 40px 上 → ナチュラルなので下へ 40 (dy +40)
    at('pointermove',1,60);at('pointermove',2,60);tick();
    assert.deepEqual(messages.map(m=>[m.kind,m.dy]),[['scroll',40]]);
    // 1本離しても、両方離すまでスクロールのまま (カーソルは動かない)
    at('pointerup',1,60,500);at('pointermove',2,80);tick();
    assert.deepEqual(messages.slice(1).map(m=>[m.kind,m.dy]),[['scroll',-10]]);
    at('pointerup',2,80,600);assert.equal(taps+rights,0,'動かした後はクリックしない');
    // 2本指で軽くタップすると右クリック、1本指なら左クリック
    at('pointerdown',3,100,1000);at('pointerdown',4,100,1010);at('pointerup',3,100,1100);at('pointerup',4,100,1120);
    assert.equal(rights,1);assert.equal(taps,0);
    at('pointerdown',5,100,2000);at('pointerup',5,100,2050);assert.equal(taps,1);
    // 3本目以降の指は無視する
    at('pointerdown',6,100);at('pointerdown',7,100);at('pointerdown',8,100);at('pointermove',8,0);tick();
    assert.equal(messages.length,2);
  });
  await test('タッチパッド: スクロール中の指の置き直しとキャンセルで右クリックしない',()=>{
    const pad=new Element(),messages=[];let clicks=0;
    bindTouchpad(pad,{enabled:()=>true,send:m=>messages.push(m),tap:()=>clicks++,rightTap:()=>clicks++});
    const tick=intervals.at(-1).fn;
    const at=(name,id,y,t)=>pad.fire(name,{pointerId:id,clientX:100,clientY:y,timeStamp:t});
    at('pointerdown',1,100,0);at('pointerdown',2,100,10);
    at('pointermove',1,60,60);at('pointermove',2,60,60);tick();
    at('pointerup',1,60,100);at('pointerdown',3,60,120);
    at('pointerup',2,60,150);at('pointerup',3,60,170);
    assert.equal(clicks,0,'片指を残して置き直しても、既に動かしたスクロールをタップと扱わない');
    assert.deepEqual(messages.map(m=>[m.kind,m.dy]),[['scroll',40]]);
    at('pointerdown',4,100,300);at('pointerdown',5,100,310);
    at('pointercancel',4,100,320);at('pointerup',5,100,330);
    assert.equal(clicks,0);assert.equal(messages.at(-1).kind,'release');
  });
  await test('協力入力: 視点30Hz、epoch変更・キャンセルで累積値と未送信移動を初期化する',()=>{
    const elements=Object.fromEntries(['pad','sens','sensVal'].map(id=>[id,new Element()]));
    globalThis.document={getElementById:id=>elements[id]};globalThis.localStorage={getItem:()=>null,setItem(){}};
    let game={phase:'coop',epoch:8},cancelled=0;const packets=[],down=[],up=[];
    const input=bindCooperativeInput({getGame:()=>game,getRole:()=> 'P2',isOpen:()=>true,ctlDown:c=>down.push(c),ctlUp:c=>up.push(c),sendLook:m=>packets.push(m),onCancel:()=>cancelled++});
    const timer=intervals.at(-1);assert.equal(timer.ms,33);
    elements.pad.fire('pointerdown');elements.pad.fire('pointermove',{clientX:110});timer.fn();
    assert.equal(packets[0].cx,20);assert.equal(packets[0].epoch,8);
    elements.pad.fire('pointermove',{clientX:120});elements.pad.fire('pointercancel');timer.fn();assert.equal(packets.length,1);assert.equal(cancelled,1);
    game={phase:'coop',epoch:9}; input.resetEpoch();
    elements.pad.fire('pointerdown');elements.pad.fire('pointermove',{clientX:105});timer.fn();
    assert.equal(packets[1].cx,10);assert.equal(packets[1].lseq,1);assert.equal(packets[1].epoch,9);
    const stick=new Element();input.setGeneratedStick(stick,{up:'act:forward'});
    stick.fire('pointerdown',{clientY:0});assert(down.includes('act:forward'));stick.fire('lostpointercapture');assert(up.includes('act:forward'));assert.equal(cancelled,2);
  });
  await test('スティック: 操作定義の画面でも斜めは2方向を同時に押し、ない方向には反応せず、作り直し・解放ですべて離す (#139)',()=>{
    const elements=Object.fromEntries(['pad','sens','sensVal'].map(id=>[id,new Element()]));
    globalThis.document={getElementById:id=>elements[id]};
    const down=[],up=[];
    const input=bindCooperativeInput({getGame:()=>({phase:'coop',epoch:1}),getRole:()=>'P1',isOpen:()=>true,ctlDown:c=>down.push(c),ctlUp:c=>up.push(c),sendLook(){}});
    const gen=new Element();
    input.setGeneratedStick(gen,{up:'act:forward',right:'act:right'});
    gen.fire('pointerdown',{clientX:190,clientY:10}); // 右上
    assert.deepEqual(down.sort(),['act:forward','act:right']);
    gen.fire('pointermove',{clientX:10,clientY:190}); // 左下: 定義にない方向は押さない
    assert.deepEqual(up.sort(),['act:forward','act:right']);assert.equal(down.length,2);
    gen.fire('pointermove',{clientX:100,clientY:5}); // 上
    assert.equal(down.at(-1),'act:forward');
    input.setGeneratedStick(new Element(),{up:'act:forward'}); // 画面の作り直し
    assert.equal(up.at(-1),'act:forward','作り直しで押したままにしない');
    assert.deepEqual([...stickDirections(0,0)],[]);assert.deepEqual([...stickDirections(0.7,-0.7)].sort(),['right','up']);
  });
  await test('WebRTC: 再送なし・STUNなしを維持し、文字列／バイナリ／Blobと旧接続を安全に扱う',async()=>{
    const peers=[],signaled=[],rtts=[];
    class Peer {
      constructor(config){this.config=config;peers.push(this);}
      createDataChannel(name,options){this.name=name;this.options=options;this.dc={readyState:'open',send(){},close(){}};return this.dc;}
      async createOffer(){return {type:'offer',sdp:'試験用'};}
      async setLocalDescription(description){this.localDescription=description;}
      close(){}
    }
    globalThis.window={RTCPeerConnection:Peer};globalThis.RTCPeerConnection=Peer;
    const fast=createFastChannel({signal:m=>signaled.push(m),enabled:()=>true,getPhase:()=> 'coop',onRtt:r=>rtts.push(r),onPath(){}});
    await fast.start();const first=peers[0];assert.deepEqual(first.config,{iceServers:[]});assert.deepEqual(first.options,{ordered:false,maxRetransmits:0});
    const response=JSON.stringify({type:'kpong',t:performance.now()});
    await first.dc.onmessage({data:response});await first.dc.onmessage({data:new TextEncoder().encode(response).buffer});await first.dc.onmessage({data:new Blob([response])});
    assert.equal(rtts.length,3);await first.dc.onmessage({data:'不正JSON'});assert.equal(rtts.length,3);
    await fast.start();const count=signaled.length;first.onicecandidate({candidate:{candidate:'古い候補',sdpMid:'0'}});await first.dc.onmessage({data:response});
    assert.equal(signaled.length,count);assert.equal(rtts.length,3);fast.close();assert.equal(fast.send({type:'input'}),false);
  });
  await test('PC仮想カーソル: 無効ボタンは実行せず、クリックと画面移動・スクロールを区別する',()=>{
    let clicks=0,scrolled=0;const button={disabled:true,click(){clicks++;}};
    globalThis.innerWidth=1280;globalThis.innerHeight=720;
    const page={scrollBy({top}){scrolled+=top;}};
    globalThis.document={createElement:()=>({style:{},setAttribute(){}}),body:{append(){}},documentElement:page,elementFromPoint:()=>({closest:()=>button,parentElement:page,scrollHeight:0,clientHeight:0})};
    const cursor=createVirtualCursor();
    assert(cursor.handle({kind:'move',dx:20,dy:30}));
    cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicks,0);
    button.disabled=false;cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicks,1);
    cursor.handle({control:'REMOTE_RIGHT',state:'down'});assert.equal(clicks,1);
    cursor.handle({control:'REMOTE_WHEEL_DOWN',state:'down'});assert.equal(scrolled,120);
    assert.equal(cursor.handle({control:'RIGHT',state:'down'}),false);
  });
  await test('PC仮想カーソル: 設定のトップレイヤーへ移り、summaryを押せて、閉じると本体へ戻る',()=>{
    let opened=false,clicked=0;
    const marker={style:{},setAttribute(){}};
    const body={append(el){el.parentElement=this;}};
    const dialog={append(el){el.parentElement=this;}};
    globalThis.document={createElement:()=>marker,body,querySelector:()=>opened?dialog:null,elementFromPoint:()=>({closest(selector){assert(selector.includes('summary'));return {disabled:false,click(){clicked++;}};}})};
    const cursor=createVirtualCursor();
    cursor.handle({kind:'move',dx:0,dy:0});assert.equal(marker.parentElement,body);
    opened=true;cursor.handle({kind:'move',dx:1,dy:1});assert.equal(marker.parentElement,dialog);
    cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicked,1);
    opened=false;cursor.handle({kind:'move',dx:1,dy:1});assert.equal(marker.parentElement,body);
  });
  await test('PC仮想カーソル: スマホの左クリックで役割交換の列を押せる',()=>{
    let clicks=0;
    const seat={click(){clicks++;}};
    const body={append(el){el.parentElement=this;}};
    globalThis.document={createElement:()=>({style:{},setAttribute(){}}),body,querySelector:()=>null,
      elementFromPoint:()=>({closest:selector=>selector.split(',').includes('[data-swap]')?seat:null})};
    const cursor=createVirtualCursor();
    cursor.handle({control:'REMOTE_LEFT',state:'down'});
    assert.equal(clicks,1,'articleで描いた交換列にも仮想カーソルからクリックを届ける');
  });
  console.log(`${passed}/${passed} 合格（UI入力、OS入力なし）`);
} finally { globalThis.setInterval=originalInterval; }
