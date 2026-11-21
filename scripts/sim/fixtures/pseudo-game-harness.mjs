import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
export function pseudoGameHarness({root=process.cwd()}={}){
 let now=1000,id=0,focused=true;const timers=new Map(),frames=new Map(),sockets=[],elements=new Map(),draws=[];
 class Events{
  constructor(){this.handlers=new Map();}
  addEventListener(type,fn){const all=this.handlers.get(type)??[];all.push(fn);this.handlers.set(type,all);}
  removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)??[]).filter(f=>f!==fn));}
  fire(type,extra={}){for(const fn of this.handlers.get(type)??[])fn({type,preventDefault(){},stopPropagation(){},repeat:false,ctrlKey:false,target:el('cv'),...extra});}
 }
 const window=new Events(),document=new Events();document.hidden=false;document.pointerLockElement=null;document.hasFocus=()=>focused;
 const canvas=new Proxy({},{get:(o,k)=>o[k]??((...args)=>{if(k==='fillText')draws.push(args[0]);}),set:(o,k,v)=>{o[k]=v;return true;}});
 class Element extends Events{
  constructor(){super();this.style={setProperty(){}};this.dataset={};this.children=[];this.textContent='';this.className='';this.clientWidth=800;this.clientHeight=600;this.scrollTop=0;this.scrollHeight=400;this.clientHeight=400;this.classList={toggle(){},remove(){},add(){}};}
  set innerHTML(value){this.html=value;this.children=[...value.matchAll(/<div\b[^>]*>/g)].map(()=>new Element());}
  get innerHTML(){return this.html??'';}
  appendChild(child){child.parent=this;this.children.push(child);}
  get firstChild(){return this.children[0];}
  get childElementCount(){return this.children.length;}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
  querySelector(){return new Element();}
  closest(){return null;}
  getContext(){return canvas;}
  requestPointerLock(){document.pointerLockElement=this;}
  blur(){}
 }
 const el=name=>{if(!elements.has(name))elements.set(name,new Element());return elements.get(name);};
 document.getElementById=el;document.createElement=()=>new Element();document.querySelector=()=>new Element();
 const buttons=['off','test','on'].map(mode=>{const b=new Element();b.dataset.mode=mode;return b;});
 document.querySelectorAll=()=>buttons;
 document.exitPointerLock=()=>{document.pointerLockElement=null;document.fire('pointerlockchange');};
 const schedule=(fn,ms,repeat)=>{const key=++id;timers.set(key,{fn,ms,at:now+ms,repeat});return key;};
 class Socket{constructor(){this.readyState=1;this.sent=[];sockets.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;this.onclose?.();}receive(value){this.onmessage?.({data:JSON.stringify(value)});}}
 const context=vm.createContext({console,window,document,location:{host:'test.invalid',protocol:'http:'},performance:{now:()=>now},devicePixelRatio:1,
  WebSocket:Socket,Date:class extends Date{
   constructor(...args){super(...(args.length?args:[1700000000000+now]));}
   toLocaleTimeString(locale,options){return super.toLocaleTimeString(locale,{...options,timeZone:'Asia/Tokyo'});}
  },
  setInterval:(fn,ms)=>schedule(fn,ms,true),clearInterval:key=>timers.delete(key),setTimeout:(fn,ms)=>schedule(fn,ms,false),clearTimeout:key=>timers.delete(key),
  requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key;},cancelAnimationFrame:key=>frames.delete(key),confirm:()=>true,
 });
 const modules=new Map();
 const load=filename=>{const absolute=[filename,filename+'.ts'].find(fs.existsSync);if(modules.has(absolute))return modules.get(absolute);
  let s=stripTypeScriptTypes(fs.readFileSync(absolute,'utf8'),{mode:'strip'});const imports={},names=[];
  s=s.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,(_,bindings,relative)=>{imports[relative]=load(path.resolve(path.dirname(absolute),relative));return `const {${bindings.replace(/\bas\b/g,':')}}=imports[${JSON.stringify(relative)}];`;});
  s=s.replace(/\bexport\s+(function|const)\s+(\w+)/g,(_,kind,name)=>{names.push(name);return `${kind} ${name}`;});
  const value=new vm.Script(`(function(imports){${s}\nreturn {${names.join(',')}};})`).runInContext(context)(imports);modules.set(absolute,value);return value;
 };
 const dispose=load(path.join(root,'apps/web/src/pseudo-game/runtime.ts')).startPseudoGame();
 sockets[0].onopen();
 const advance=ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [key,t]=next;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(key);t.fn();}now=end;};
 const frame=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);};
 const snapshot=()=>({stats:Object.fromEntries(['sInj','sOk','sMiss','sAvg','sMax','sHold','lookInj','lookRecv','lookRatio','phase','inj','focus','lock'].map(k=>[k,String(el(k).textContent)])),log:el('log').children.map(e=>e.textContent),observations:sockets.flatMap(s=>s.sent).filter(m=>m.type==='observe'),draws:draws.slice(-15)});
 return {el,window,document,sockets,advance,frame,snapshot,dispose,timerCount:()=>timers.size,frameCount:()=>frames.size,focus:value=>{focused=value;window.fire(value?'focus':'blur');}};
}
export function replayPseudoGame(h){
 const snapshots=[];const save=name=>{h.frame();snapshots.push({name,...h.snapshot()});};
 const receive=m=>h.sockets.at(-1).receive(m);
 receive({type:'state',now:1000,slots:[{name:'P1',assigned:true,connected:true,pressed:[]}],game:{phase:'lobby',epoch:0,connected:['P1'],profile:null},inject:{mode:'test',active:true,available:true,outputs:{KEY_W:{kind:'key',label:'W',code:'KeyW'},KEY_A:{kind:'key',label:'A',code:'KeyA'},MOUSE_L:{kind:'mouse',label:'左クリック',code:null},WHEEL_DOWN:{kind:'wheel',label:'ホイール↓',code:null}}}});save('初期状態');
 const notice=(out,state='down',slot='P1',ok=true)=>receive({type:'inject',entry:{out,state,slot,ok,label:out}});
 notice('KEY_W');h.window.fire('keydown',{code:'KeyW'});save('注入通知が先');
 h.advance(80);notice('KEY_W','up');h.window.fire('keyup',{code:'KeyW'});save('解放と保持時間');
 h.window.fire('mousedown',{button:0});h.advance(20);notice('MOUSE_L');save('観測が先');
 h.advance(80);h.window.fire('mouseup',{button:0});notice('MOUSE_L','up');save('マウス解放');
 notice('WHEEL_DOWN');h.window.fire('wheel',{deltaY:1});save('ホイール');
 receive({type:'look',entry:{dx:6,dy:-2,slot:'P2'}});h.window.fire('mousemove',{movementX:6,movementY:-2});save('視点照合');
 h.window.fire('keydown',{code:'KeyA'});h.advance(601);save('物理入力の分類');
 h.focus(false);notice('KEY_W');h.advance(601);save('非選択は未反映に数えない');
 h.focus(true);notice('KEY_W');h.advance(601);save('未反映の分類');
 notice('KEY_W','down','P1',false);save('注入失敗');
 h.window.fire('keydown',{code:'Enter'});h.window.fire('keydown',{code:'Space'});h.advance(16);save('ワールドとジャンプ');
 return snapshots;
}
