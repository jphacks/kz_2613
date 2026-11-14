// DOMの入力境界・キャンセル・RTC形式を、OS入力なしで検証する。
import assert from 'node:assert/strict';
const {bindTouchpad, bindTouchpadSensitivity} = await import('../../apps/web/src/shared/input/touchpad.ts');
const {createLifetime} = await import('../../apps/web/src/shared/input/lifetime.ts');
const {bindCooperativeInput: createCooperativeInput} = await import('../../apps/web/src/shared/input/cooperative.ts');
const {stickDirections} = await import('../../apps/web/src/shared/input/stick.ts');
const {rotateForHold,createHoldStore,parseHold,holdRotation} = await import('../../apps/web/src/shared/input/hold.ts');
const {createFastChannel} = await import('../../apps/web/src/shared/transport/fast-channel.ts');
const {createVirtualCursor}=await import('../../apps/web/src/shared/input/virtual-cursor.ts');
const {usableControls,moveRemoteFocus,stepRemoteSelect,REMOTE_FOCUSABLE}=await import('../../apps/web/src/shared/input/remote-focus.ts');
globalThis.HTMLElement=class {constructor(properties){Object.assign(this,properties)}};
import {myActions,generatedKey} from '../../apps/web/src/shared/model/actions.ts';
import {controllerLayout} from '../../apps/web/src/shared/controller-layout.ts';
import {loadComponent,createElement,renderToStaticMarkup} from './fixtures/react-render.mjs';
const {Controller}=await loadComponent(new URL('../../apps/web/src/phone/Controller.tsx',import.meta.url));
const render=groups=>renderToStaticMarkup(createElement(Controller,{groups,bindings:{}}));
const bindCooperativeInput=options=>{const input=createCooperativeInput(options);input.bindLook(document.getElementById('pad'),document.getElementById('sens'),document.getElementById('sensVal'));return input;};
const intervals = [];
const originalInterval = globalThis.setInterval;
globalThis.setInterval = (fn,ms) => { intervals.push({fn,ms}); return intervals.length; };
class Element {
  constructor() { this.handlers = new Map(); this.style = {}; this.value = '2'; this.classList = {add(){},remove(){},toggle(){}}; }
  addEventListener(name,fn) { const list = this.handlers.get(name)||[]; list.push(fn);this.handlers.set(name,list); }
  removeEventListener(name,fn) { this.handlers.set(name,(this.handlers.get(name)||[]).filter(value=>value!==fn)); }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0,top:0,width:200,height:200}; }
  fire(name,extra={}) { for (const fn of this.handlers.get(name)||[]) fn({type:name,pointerId:1,clientX:100,clientY:100,timeStamp:performance.now(),preventDefault(){},...extra}); }
}
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
    const layout=controllerLayout(GAME,'P1'),parts=layout.flatMap(g=>g.parts);
    assert.equal(parts.some(p=>p.kind==='look'),true);
    assert.deepEqual(parts.filter(p=>p.kind==='button').map(p=>p.control),['act:action','act:zoom:up','act:zoom:down']);
    assert.deepEqual(parts.find(p=>p.kind==='stick').directions.map(d=>[d.name,d.control]),[['left','act:left'],['right','act:right']]);
    const html=render(layout);
    assert.match(html,/gen-stick/);assert.match(html,/送らない/);assert.match(html,/>Dキー</);
    assert.match(html,/class="look-pad"/,'視点パッドを実React部品で描く');
    const empty=controllerLayout(GAME,'P3');
    assert.deepEqual(empty,[],'担当がなければスティックを描かない');
    assert.match(render(empty),/担当する操作がありません/);
    assert.notEqual(generatedKey(GAME,'P1'),generatedKey({...GAME,keys:{actions:{left:{label:'Z'}}}},'P1'));
  });
  await test('操作の主表示: Minecraftも別ゲームも実キー・クリック・ホイールを示し、ゲーム内の意味を流用しない (#150)',()=>{
    for(const id of ['minecraft-java','generic']){
      const game={...GAME,profile:{...GAME.profile,id,groups:[{id:'gameplay',label:'攻撃・持ち物'}],actions:[
        {id:'use',label:'置く',group:'gameplay',type:'button'},
        {id:'inventory',label:'インベントリ',group:'gameplay',type:'button'},
        {id:'wheel',label:'持ち物の切り替え',group:'gameplay',type:'wheel'}]},
        assigned:{P1:['use','inventory','wheel']},keys:{actions:{use:{label:'右クリック'},inventory:{label:'R'}}}};
      const groups=controllerLayout(game,'P1'),html=render(groups);
      assert.deepEqual(groups.flatMap(g=>g.parts).map(p=>p.control),['act:use','act:inventory','act:wheel:up','act:wheel:down']);
      assert.match(html,/act:use">右クリック<\/button>/);
      assert.match(html,/act:inventory">Rキー<\/button>/);
      assert.match(html,/ホイール上/);assert.match(html,/ホイール下/);
      assert.doesNotMatch(html,/攻撃|持ち物|置く|インベントリ/);
    }
  });
  await test('視点: 操作定義の分担があれば、視点を割り当てた人だけが look を送る', () => {
    const pad = new Element(), sent = [];
    let role = 'P1', look = true;
    globalThis.document = {getElementById: (id) => (id === 'pad' ? pad : new Element())};
    bindCooperativeInput({ getGame: () => ({ phase: 'coop', epoch: 1 }), getRole: () => role, canLook: () => look, isOpen: () => true, ctlDown() {}, ctlUp() {}, sendLook: (m) => sent.push(m) });
    const tick = intervals.at(-1).fn;
    pad.fire('pointerdown'); pad.fire('pointermove', { clientX: 130 }); tick();
    assert.equal(sent.length, 1, 'P1 (視点の担当) の look を送らない');
    look = false; pad.fire('pointermove', { clientX: 160 }); tick();
    assert.equal(sent.length, 1, '担当でないのに look を送った');
  });
  await test('タッチパッド: カーソル感度を保存・復元し、倍率を適用してから送信上限を守る (#377)', () => {
    const previous = globalThis.localStorage;
    const saved = new Map([['recooplay.sens', '2.5']]);
    globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
    const lifetime = createLifetime();
    try {
      const pad = new Element(), slider = new Element(), value = new Element(), messages = [];
      const sensitivity = bindTouchpadSensitivity(lifetime, slider, value);
      bindTouchpad(pad, { enabled: () => true, send: message => messages.push(message), tap() {}, sensitivity });
      const tick = intervals.at(-1).fn;
      assert.equal(slider.value, '1');
      for (const [scale, dx, dy] of [['1', 30, -30], ['0.5', 15, -15], ['6', 120, -120]]) {
        slider.value = scale;
        slider.fire('input');
        pad.fire('pointerdown');
        pad.fire('pointermove', { clientX: 130, clientY: 70 });
        tick();
        pad.fire('pointerup');
        assert.deepEqual([messages.at(-1).dx, messages.at(-1).dy], [dx, dy]);
      }
      const restored = new Element();
      assert.equal(bindTouchpadSensitivity(lifetime, restored, value)(), 6);
      assert.equal(restored.value, '6');
      assert.equal(value.textContent, '6.0倍');
      assert.equal(saved.get('recooplay.sens'), '2.5');
    } finally {
      lifetime.dispose();
      globalThis.localStorage = previous;
    }
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
  await test('タッチパッド: 操作先がない間に置いた指も、操作先ができた後の動きは送る。一瞬の無効化でスワイプを捨てない (#345)',()=>{
    const pad = new Element(), messages=[]; let enabled=false;
    bindTouchpad(pad,{enabled:()=>enabled,send:m=>messages.push(m),tap:()=>{}});
    const tick=intervals.at(-1).fn;
    pad.fire('pointerdown',{clientX:100});pad.fire('pointermove',{clientX:140});tick();
    assert.equal(messages.length,0,'操作先がない間の動きは送らない');
    enabled=true;pad.fire('pointermove',{clientX:150});tick();
    assert.deepEqual(messages.map(m=>[m.kind,m.dx]),[['move',10]],'操作先ができた後の動きだけを送る');
    enabled=false;pad.fire('pointermove',{clientX:170});tick();enabled=true;pad.fire('pointermove',{clientX:175});tick();
    assert.deepEqual(messages.map(m=>[m.kind,m.dx]),[['move',10],['move',5]],'一瞬の無効化の後も同じ指の動きを送り、無効中の動きは捨てる');
    enabled=false;pad.fire('pointercancel');tick();
    assert.equal(messages.length,2,'操作先がない間の取り消しでは、ホストへ解放を送らない');
  });
  await test('タッチパッド: 操作先がない間に大きく動かした指を、操作先ができた直後に離してもクリックにしない (#345)',()=>{
    const pad = new Element(); let enabled=false, taps=0;
    bindTouchpad(pad,{enabled:()=>enabled,send:()=>{},tap:()=>taps++});
    pad.fire('pointerdown',{clientX:100});pad.fire('pointermove',{clientX:200});
    enabled=true;pad.fire('pointermove',{clientX:202});pad.fire('pointerup',{clientX:202});
    assert.equal(taps,0);
  });
  await test('タッチパッド: 2本指でナチュラルな向きにスクロールし、カーソルは動かさない。2本指のタップは右クリック (#122)',()=>{
    const pad = new Element(), messages=[]; let taps=0,rights=0;
    bindTouchpad(pad,{enabled:()=>true,send:m=>messages.push(m),tap:()=>taps++,rightTap:()=>rights++,sensitivity:()=>6});
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
  await test('横持ち (#514): 回転ロックのまま横に持つと、指から見た上下左右でスティック・視点を読む',()=>{
    // 左に90度 (端末の上端が左): 指から見た上 = 画面の右、指から見た右 = 画面の下
    assert.deepEqual(rotateForHold(1,0,90),[0,-1]);assert.deepEqual(rotateForHold(0,1,90),[1,0]);
    assert.deepEqual(rotateForHold(-1,0,270),[0,-1]);assert.deepEqual(rotateForHold(0,-1,270),[1,0]);
    assert.deepEqual(rotateForHold(0.3,-0.4,0),[0.3,-0.4]);
    assert.equal(holdRotation(90),90);assert.equal(holdRotation(270),-90);assert.equal(holdRotation(0),0);
    assert.equal(parseHold('90'),90);assert.equal(parseHold('180'),0);assert.equal(parseHold(null),0);
    const elements=Object.fromEntries(['pad','sens','sensVal'].map(id=>[id,new Element()]));
    globalThis.document={getElementById:id=>elements[id]};globalThis.localStorage={getItem:()=>null,setItem(){}};
    let hold=90;const down=[],up=[],packets=[];
    const input=bindCooperativeInput({getGame:()=>({phase:'coop',epoch:3}),getRole:()=>'P2',isOpen:()=>true,getHold:()=>hold,ctlDown:c=>down.push(c),ctlUp:c=>up.push(c),sendLook:m=>packets.push(m)});
    const timer=intervals.at(-1);
    const stick=new Element();input.setGeneratedStick(stick,{up:'act:forward',down:'act:back',left:'act:left',right:'act:right'});
    stick.fire('pointerdown',{clientX:195,clientY:100}); // 画面の右端 = 左に90度持った指から見た上
    assert.deepEqual(down,['act:forward'],'横持ちで指から見て上に倒すと前進');
    stick.fire('pointerup');
    hold=270;stick.fire('pointerdown',{clientX:195,clientY:100}); // 右に90度では画面の右は指から見た下
    assert.equal(down.at(-1),'act:back');stick.fire('pointerup');
    hold=90;
    elements.pad.fire('pointerdown');elements.pad.fire('pointermove',{clientY:110});timer.fn(); // 画面の下へ10px = 指から見て右へ
    assert.equal(packets.at(-1).cx,20);assert.equal(packets.at(-1).cy,0,'横持ちで指から見て右へ動かすと視点が右へ回る');
    elements.pad.fire('pointerup');
    // 持ち方を変えると知らせ、保存する。読めない・書けない環境では縦持ち
    const saved=new Map();const store=createHoldStore({getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)});
    let changed=0;const off=store.subscribe(()=>changed++);
    assert.equal(store.get(),0);store.set(90);store.set(90);assert.equal(changed,1);assert.equal(saved.get('recooplay.hold'),'90');
    assert.equal(createHoldStore({getItem:k=>saved.get(k)??null,setItem(){}}).get(),90);
    off();store.set(0);assert.equal(changed,1);
    assert.equal(createHoldStore({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}).get(),0);
    const broken=createHoldStore({getItem:()=>null,setItem(){throw new Error('quota');}});broken.set(270);assert.equal(broken.get(),270);
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
    let clicks=0,scrolled=0;const button=new HTMLElement({disabled:true,click(){clicks++;}});
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
    globalThis.document={createElement:()=>marker,body,querySelector:()=>opened?dialog:null,elementFromPoint:()=>({closest(selector){assert(selector.includes('summary'));return new HTMLElement({disabled:false,click(){clicked++;}});}})};
    const cursor=createVirtualCursor();
    cursor.handle({kind:'move',dx:0,dy:0});assert.equal(marker.parentElement,body);
    opened=true;cursor.handle({kind:'move',dx:1,dy:1});assert.equal(marker.parentElement,dialog);
    cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(clicked,1);
    opened=false;cursor.handle({kind:'move',dx:1,dy:1});assert.equal(marker.parentElement,body);
  });
  await test('PC仮想カーソル: 使っていないときは隠し、動かす・押すとまた出す (#308)',()=>{
    const timers=[],realTimeout=globalThis.setTimeout,realClear=globalThis.clearTimeout;
    globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms,live:true});return timers.length;};globalThis.clearTimeout=id=>{if(timers[id-1])timers[id-1].live=false;};
    try{
      const marker={style:{},setAttribute(){},remove(){}};
      globalThis.document={createElement:()=>marker,body:{append(){}},querySelector:()=>null,elementFromPoint:()=>null};
      const cursor=createVirtualCursor();
      cursor.handle({kind:'move',dx:5,dy:5});assert.equal(marker.style.display,'block');
      cursor.handle({kind:'move',dx:5,dy:5});assert.equal(timers.filter(t=>t.live).length,1,'動かすたびに隠す時刻を延ばす');
      const t=timers.find(t=>t.live);assert(t.ms>=3000);t.fn();assert.equal(marker.style.display,'none');
      cursor.handle({control:'REMOTE_LEFT',state:'down'});assert.equal(marker.style.display,'block','押した位置を見せる');
      cursor.dispose();assert.equal(timers.filter(t=>t.live).length,0,'破棄で隠す予約も消す');
    }finally{globalThis.setTimeout=realTimeout;globalThis.clearTimeout=realClear;}
  });
  await test('PC仮想カーソル: 枠の端を越えたら、ホストが許すときだけOSのカーソルへ引き継ぐ (#405)',()=>{
    globalThis.innerWidth=800;globalThis.innerHeight=560;
    const marker={style:{},setAttribute(){},remove(){}};const listeners={};
    globalThis.document={createElement:()=>marker,body:{append(){}},querySelector:()=>null,elementFromPoint:()=>null,
      addEventListener(type,fn){listeners[type]=fn;},removeEventListener(type,fn){if(listeners[type]===fn)delete listeners[type];}};
    let allowed=false;const left=[];
    const cursor=createVirtualCursor({canLeave:()=>allowed,leave:at=>left.push(at)});
    cursor.handle({kind:'move',dx:1000,dy:0});
    assert.equal(left.length,0,'許されていなければ枠の中で止める');
    assert.match(marker.style.transform,/translate\(781px/);
    allowed=true;
    cursor.handle({kind:'move',dx:5,dy:0});assert.equal(left.length,0,'枠の中の移動では引き継がない');
    cursor.handle({kind:'move',dx:60,dy:-20});
    assert.deepEqual(left,[{x:800,y:260,w:800,h:560}],'越えた辺の上の位置を知らせる');
    assert.equal(marker.style.display,'none','引き継いだら丸を消す');
    cursor.handle({kind:'move',dx:60,dy:0});assert.equal(left.length,1,'操作先が変わるまでに届いた移動で二重に知らせない');
    // 実際のマウスで PC アプリへ戻ったら、その位置から始める
    listeners.mousemove({clientX:100,clientY:200});
    cursor.handle({kind:'move',dx:-150,dy:0});
    assert.deepEqual(left.at(-1),{x:0,y:200,w:800,h:560},'左の辺からも引き継ぐ');
    cursor.dispose();assert.equal(listeners.mousemove,undefined,'破棄でマウスの監視も外す');
  });
  await test('PC仮想カーソル: スマホの左クリックで役割交換の列を押せる',()=>{
    let clicks=0;
    const seat=new HTMLElement({click(){clicks++;}});
    const body={append(el){el.parentElement=this;}};
    globalThis.document={createElement:()=>({style:{},setAttribute(){}}),body,querySelector:()=>null,
      elementFromPoint:()=>({closest:selector=>selector.split(',').includes('[data-swap]')?seat:null})};
    const cursor=createVirtualCursor();
    cursor.handle({control:'REMOTE_LEFT',state:'down'});
    assert.equal(clicks,1,'articleで描いた交換列にも仮想カーソルからクリックを届ける');
  });
  await test('PC仮想カーソル: プルダウンはクリックせずフォーカスだけ移す (#294)',()=>{
    let focused=0,clicked=0;
    const select=new HTMLElement({tagName:'SELECT',disabled:false,focus(){focused++;},click(){clicked++;}});
    globalThis.document={createElement:()=>({style:{},setAttribute(){}}),body:{append(){}},querySelector:()=>null,
      elementFromPoint:()=>({closest:selector=>selector.split(',').includes('select')?select:null})};
    createVirtualCursor().handle({control:'REMOTE_LEFT',state:'down'});
    assert.equal(focused,1);assert.equal(clicked,0);
  });
  await test('リモコンの矢印: 見えて押せるものだけを順に選び、端で回る (#294)',()=>{
    let last=null;
    const el=(name,props={})=>({name,disabled:false,getClientRects:()=>[1],focus(){last=name;},...props});
    const controls=usableControls([el('決定'),el('隠れた',{getClientRects:()=>[]}),el('押せない',{disabled:true}),el('P1の列'),el('キー設定')]);
    assert.deepEqual(controls.map(c=>c.name),['決定','P1の列','キー設定']);
    assert.equal(moveRemoteFocus(controls,null,'DOWN'),true);assert.equal(last,'決定','未選択の▼は先頭から');
    moveRemoteFocus(controls,null,'UP');assert.equal(last,'キー設定','未選択の▲は末尾から');
    moveRemoteFocus(controls,controls[0],'RIGHT');assert.equal(last,'P1の列');
    moveRemoteFocus(controls,controls[2],'DOWN');assert.equal(last,'決定','末尾の次は先頭');
    assert.equal(moveRemoteFocus(controls,controls[0],'ENTER'),false,'Enterは移動しない');
    assert.equal(moveRemoteFocus([],null,'DOWN'),false);
    assert(REMOTE_FOCUSABLE.split(',').includes('select'),'キー割当のプルダウンも選べる');
  });
  await test('リモコンの◀▶: プルダウンの選択肢を1つずつ切り替え、端で止まり、changeを送る (#294)',()=>{
    const events=[];
    const select={tagName:'SELECT',disabled:false,selectedIndex:0,options:[{},{disabled:true},{},{}],dispatchEvent(e){events.push([e.type,e.bubbles,this.selectedIndex]);return true;}};
    assert.equal(stepRemoteSelect(select,'LEFT'),true);assert.equal(events.length,0,'先頭の◀は変えない');
    stepRemoteSelect(select,'RIGHT');assert.deepEqual(events.pop(),['change',true,2],'選べない選択肢は飛ばす');
    stepRemoteSelect(select,'RIGHT');stepRemoteSelect(select,'RIGHT');assert.equal(select.selectedIndex,3);assert.equal(events.length,1,'末尾の▶は変えない');
    assert.equal(stepRemoteSelect(select,'UP'),false,'▲▼は次の項目への移動に使う');
    assert.equal(stepRemoteSelect({tagName:'BUTTON'},'RIGHT'),false);
    const locked={...select,disabled:true,selectedIndex:0};assert.equal(stepRemoteSelect(locked,'RIGHT'),true);assert.equal(locked.selectedIndex,0,'協力プレイ中の固定は変えない');
  });
  console.log(`${passed}/${passed} 合格（UI入力、OS入力なし）`);
} finally { globalThis.setInterval=originalInterval; }
