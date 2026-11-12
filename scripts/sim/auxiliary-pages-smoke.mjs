// 新画面を実ブラウザで起動し受信境界・再接続・pagehide破棄を確認する。OS入力なし。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const bin=arg('--bin',path.join(root,'apps/host-rs/target/release/recooplay-host.exe'));
const chrome=arg('--chrome',['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p)));
assert(chrome,'ChromeまたはEdgeが必要です');
const pages=arg('--pages','overlay').split(',');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-auxiliary-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label,tries=100)=>{for(let n=0;n<tries;n++){if(await fn())return;await sleep(100);}throw Error('待機失敗: '+label);};
let port,host,child,cdp;
let stage='ホスト起動', hostOutput='', browserOutput='', browserError;
const started=performance.now();
const appendOutput=(previous,chunk)=>(previous+chunk).slice(-8192);
const requests=new Map();let seq=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{requests.delete(id);reject(Error('CDP timeout: '+method));},10000);requests.set(id,{resolve,reject,timer});cdp.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!value.exceptionDetails,'ブラウザ内の試験式が失敗');return value.result.value;};
try{
 host=spawn(bin,[],{cwd:root,windowsHide:true,env:{...process.env,PORT:'0',RECOOPLAY_ROOT:root,RECOOPLAY_DRY_RUN:'1',RECOOPLAY_NO_CONFIG:'1',RECOOPLAY_RUNTIME_MEASURE:'1',RECOOPLAY_FAKE_TARGET:'1',RECOOPLAY_STDIN_CONTROL:'1',RECOOPLAY_LOG_DIR:temp},stdio:['pipe','pipe','pipe']});
 let hostError, hostStart='';
 host.stdout.on('data',data=>{
   hostOutput=appendOutput(hostOutput,data);
   if(!port){
     hostStart=appendOutput(hostStart,data);
     const m=hostStart.match(/server_start \{"port":(\d+)\}/);
     if(m)port=Number(m[1]);
   }
 });
 host.stderr.on('data',data=>{hostOutput=appendOutput(hostOutput,data);});
 host.on('error',error=>{hostError=error;});host.stdin.on('error',()=>{});
 await until(()=>{if(hostError)throw hostError;assert(host.exitCode===null,'dry-runホスト起動失敗');return !!port;},'host');
 stage='Chrome起動';
 const profile=path.join(temp,'browser');
 child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--no-proxy-server','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.on('error',error=>{browserError=error;});
 for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{browserOutput=appendOutput(browserOutput,data);});
 // CIのWindowsではヘッドレスChromeの初回起動が10秒を超えることがある (2026-11-10に3回)。起動待ちだけ30秒にする
 const browserStarted=performance.now();
 let debugPort;
 await until(()=>{
   if(browserError)throw browserError;
   assert(child.exitCode===null&&child.signalCode===null,`Chromeが終了: ${child.exitCode ?? child.signalCode}`);
   try{
     const candidate=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
     if(Number.isInteger(candidate)&&candidate>0&&candidate<=65535)debugPort=candidate;
   }catch(error){
     if(!['ENOENT','EBUSY'].includes(error.code))throw error;
   }
   return !!debugPort;
 },'Chromeのデバッグポート',300);
 console.log(`Chromeのデバッグポートを確認 (${Math.round(performance.now()-browserStarted)}ms)`);
 stage='ChromeのCDP接続';
 const response=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT',signal:AbortSignal.timeout(10000)});
 assert(response.ok,`Chromeのタブ作成: HTTP ${response.status}`);
 const target=await response.json();
 cdp=new WebSocket(target.webSocketDebuggerUrl);await until(()=>cdp.readyState===1,'CDP');
 cdp.onmessage=event=>{const message=JSON.parse(event.data),pending=requests.get(message.id);if(!pending)return;requests.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result);};
 await call('Page.enable');await call('Runtime.enable');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__pageTest={sockets:[],sent:[],errors:[]};window.addEventListener('error',()=>__pageTest.errors.push('error'));window.addEventListener('unhandledrejection',()=>__pageTest.errors.push('rejection'));const Original=WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);__pageTest.sockets.push(this);}send(raw){__pageTest.sent.push(JSON.parse(raw).type);super.send(raw);}};`});
 for(const page of pages){
   stage=`画面検査 (${page})`;
   const route={overlay:'/overlay?position=top',diagnostics:'/host','pseudo-game':'/game'}[page];assert(route);
   await call('Page.navigate',{url:`http://127.0.0.1:${port}${route}`});
   await until(()=>evaluate(`!!window.__pageTest&&__pageTest.sockets[0]?.readyState===1&&document.querySelector(${JSON.stringify(page==='overlay'?'#status':page==='diagnostics'?'#slots':'#cv')})!==null`),page);
   await until(()=>evaluate(page==='overlay'?`document.getElementById('status').textContent==='参加受付中'`:page==='diagnostics'?`document.getElementById('slots').children.length===4`:`document.getElementById('players').children.length===4`),'state');
   assert(await evaluate(`document.styleSheets.length>0`),'CSSが読み込まれる');
   if(page==='overlay')assert.equal(await evaluate(`document.body.dataset.position`),'top');
   await evaluate(`for(const data of ['壊れたJSON','null','[]','{"type":"state"}'])__pageTest.sockets[0].onmessage({data});`);
   assert.equal(await evaluate(`__pageTest.errors.length`),0,'不正受信で例外を起こさない');
   if(page==='overlay')assert.deepEqual(await evaluate(`__pageTest.sent`),['monitor'],'観客表示は操作を送らない');
   if(page==='pseudo-game'){
     assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()`),'#161b22','疑似ゲームの旧配色を共通CSSが上書きしない');
     assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`),'#0b0e12');
     assert(await evaluate(`document.getElementById('cv').width>0&&document.getElementById('cv').height>0`),'canvasを描画する');
   }
   if(page==='diagnostics'){
     await evaluate(`document.getElementById('clear').click();`);
     await evaluate(`for(let i=0;i<1005;i++)__pageTest.sockets[0].onmessage({data:JSON.stringify({type:'log',entry:{t:1000+i,kind:'fixture',value:i,text:'<img onerror=bad()>'}})});`);
     await until(()=>evaluate(`document.getElementById('log').children.length===1000`),'bounded log');
     assert(await evaluate(`document.getElementById('log').firstChild.textContent.includes('value=5')`),'先頭の古いログだけを除去する');
     assert.equal(await evaluate(`document.querySelectorAll('#log img').length`),0,'ログをHTMLとして解釈しない');
     await evaluate(`document.querySelector('[data-phase="paused"]').click();`);
     await until(()=>evaluate(`__pageTest.sent.includes('phase')`),'phase command');
     const before=await evaluate(`__pageTest.sent.length`);
     await evaluate(`window.confirm=()=>false;document.querySelector('[data-mode="on"]').click();document.getElementById('reset').click();`);
     assert.equal(await evaluate(`__pageTest.sent.length`),before,'確認を取り消した管理操作は送信しない');
     await evaluate(`document.getElementById('clear').click();`);
     await until(()=>evaluate(`document.getElementById('log').children.length===0`),'clear log');
   }
   await evaluate(`__pageTest.sockets[0].close()`);
   await until(()=>evaluate(`__pageTest.sockets.length===2&&__pageTest.sockets[1].readyState===1`),'reconnect');
   await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
   await until(()=>evaluate(`__pageTest.sockets.every(s=>s.readyState>=2)`),'dispose');
   await sleep(1200);assert.equal(await evaluate(`__pageTest.sockets.length`),2,'破棄後は再接続しない');
   assert.equal(await evaluate(`__pageTest.errors.length`),0,'起動・受信・破棄に例外なし');
   console.log(`合格: ${page}の起動・描画・不正受信拒否・再接続・破棄`);
 }
}catch(error){
 const safeHostOutput=hostOutput.split(/\r?\n/).filter(line=>!line.includes('スマホ用 URL')).join('\n');
 const diagnostics=`失敗段階: ${stage} (${Math.round(performance.now()-started)}ms)\n${error.stack}\nホスト出力（末尾）:\n${safeHostOutput}\nChrome出力（末尾）:\n${browserOutput}\n`;
 console.error(diagnostics);
 if(process.env.RECOOPLAY_SMOKE_DIAGNOSTICS){
   const destination=process.env.RECOOPLAY_SMOKE_DIAGNOSTICS;
   fs.mkdirSync(destination,{recursive:true});
   fs.writeFileSync(path.join(destination,'auxiliary-pages.txt'),diagnostics);
 }
 process.exitCode=1;
}finally{
 for(const pending of requests.values())clearTimeout(pending.timer);cdp?.close();
 if(child&&child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('close',r)),sleep(3000)]);}
 if(host&&host.exitCode===null){host.stdin.end('quit\n');await Promise.race([new Promise(r=>host.once('close',r)),sleep(3000)]);if(host.exitCode===null)host.kill();}
 assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('recooplay-auxiliary-'));
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
