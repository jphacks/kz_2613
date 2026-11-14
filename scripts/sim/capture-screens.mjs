// PC画面とスマホ画面の最新の全画面を撮る (docs/screenshots.md 用)。
// 起動: node scripts/sim/capture-screens.mjs --bin <ホスト実行ファイル> [--pc-size 800x560] [--phone-size 390x844] [--assert-layout]
// Rustホストを dry-run・疑似の入力先で起動し、headless Chrome で PC 1台・スマホ3台を開いて画面のボタンを押して進める。
// OS入力・実ゲームの操作はしない。ゲーム一覧は偽のランチャー情報、QR・URLの IP は説明用の 192.0.2.10 に差し替える。
// 実機・Minecraft での合格の根拠には使わない。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const BIN=arg('--bin');
if(!BIN)throw Error('--binで撮影に使うホストを指定してください');
const CHROME=arg('--chrome',['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p)));
const OUT=path.join(ROOT,arg('--out','docs/screenshots'));
const PORT=Number(process.env.PORT||18095),CDP_PORT=Number(process.env.CDP_PORT||9335);
const DEMO_IP='192.0.2.10'; // RFC 5737 の説明用アドレス。実環境の IP を画像に残さない
// --pc-size 800x560 で、Tauriの最小ウィンドウなど別の大きさのPC画面を撮る (#270)
function viewport(flag,fallback,deviceScaleFactor,mobile){
  const value=arg(flag,fallback);
  if(!/^[1-9]\d{1,3}x[1-9]\d{1,3}$/.test(value))throw Error(`${flag} は 幅x高さ で指定してください`);
  const [width,height]=value.split('x').map(Number);
  return {width,height,deviceScaleFactor,mobile};
}
const PC=viewport('--pc-size','1920x1080',1,false);
const PHONE=viewport('--phone-size','402x874',2,true);
const UA={
  iPhone:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  Android:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-capture-'));

// 手元の PC の Steam・Epic を読まないよう、protocol-sim と同じ形の偽のランチャー情報を作る
function fakeGames(){
  const root=path.join(tmp,'games'),steam=path.join(root,'steam','steamapps');
  fs.mkdirSync(path.join(steam,'common','Stardew Valley'),{recursive:true});
  fs.writeFileSync(path.join(steam,'appmanifest_413150.acf'),'"AppState" { "appid" "413150" "name" "Stardew Valley" "StateFlags" "4" "installdir" "Stardew Valley" }');
  fs.mkdirSync(path.join(root,'minecraft'),{recursive:true});
  fs.writeFileSync(path.join(root,'minecraft','Minecraft.exe'),'');
  const gamma=path.join(root,'epic-install','Gamma');
  fs.mkdirSync(gamma,{recursive:true});fs.mkdirSync(path.join(root,'epic'),{recursive:true});
  fs.writeFileSync(path.join(root,'epic','gamma.item'),JSON.stringify({AppName:'Gamma',DisplayName:'Gamma',InstallLocation:gamma,AppCategories:['games']}));
  return root;
}

const logDir=path.join(tmp,'logs');fs.mkdirSync(logDir);
const options=path.join(tmp,'options.txt');
fs.copyFileSync(path.join(ROOT,'scripts/sim/fixtures/minecraft-options.txt'),options);
const host=spawn(BIN,[],{env:{...process.env,PORT:String(PORT),RECOOPLAY_ROOT:ROOT,RECOOPLAY_DRY_RUN:'1',RECOOPLAY_NO_CONFIG:'1',RECOOPLAY_FAKE_TARGET:'1',
  RECOOPLAY_DESKTOP:'1',RECOOPLAY_STDIN_CONTROL:'1',RECOOPLAY_LOG_DIR:logDir,RECOOPLAY_FAKE_GAMES:fakeGames(),RECOOPLAY_MINECRAFT_OPTIONS:options,
  RECOOPLAY_FAKE_HOTSPOT:'ReCooplay-Demo|demo-passphrase|on'},stdio:['pipe','ignore','inherit']});
const hostCmd=c=>host.stdin.write(c+'\n');
const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${path.join(tmp,'chrome')}`,'--no-first-run','--no-default-browser-check',
  '--no-proxy-server','--disable-background-networking','--hide-scrollbars','--mute-audio','--disable-extensions','about:blank'],{stdio:'ignore'});

async function waitHttp(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return r;}catch{}await sleep(200);}throw Error(`応答なし: ${url}`);}

// ---------- CDP (Chrome DevTools Protocol) ----------
let cdp,nextId=1;const pending=new Map(),listeners=[];
function call(method,params={},sessionId){
  const id=nextId++;cdp.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDPの応答なし: ${method}`));},10000);
    pending.set(id,{resolve,reject,method,timer});
  });
}
async function openCdp(){
  const {webSocketDebuggerUrl}=await (await waitHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  cdp=new WebSocket(webSocketDebuggerUrl);
  await new Promise((r,j)=>{cdp.onopen=r;cdp.onerror=j;});
  cdp.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(`${p.method}: ${m.error.message}`)):p.resolve(m.result);}
    else if(m.method)for(const l of listeners)l(m);
  };
}

// 参加案内の IP を説明用のアドレスに差し替える。QR は http://192.0.2.10:8080/ をホストと同じ qrcode クレートで作ったもの
const demoQr=fs.readFileSync(path.join(ROOT,'scripts/sim/fixtures/demo-join-qr.svg'),'utf8');
function maskInfo(body){
  const info=JSON.parse(body);
  info.urls=(info.urls||[]).slice(0,1).map(u=>({...u,address:DEMO_IP,url:`http://${DEMO_IP}:8080/`,qr:demoQr}));
  return JSON.stringify(info);
}

async function page(name,size,ua){
  const {browserContextId}=await call('Target.createBrowserContext');
  const {targetId}=await call('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const s=(m,p)=>call(m,p,sessionId);
  await s('Page.enable');await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride',size);
  if(ua){await s('Emulation.setUserAgentOverride',{userAgent:UA[ua],platform:ua==='iPhone'?'iPhone':'Linux armv8l'});await s('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});}
  await s('Fetch.enable',{patterns:[{urlPattern:'*/api/info*',requestStage:'Response'}]});
  listeners.push(async m=>{
    if(m.sessionId!==sessionId||m.method!=='Fetch.requestPaused')return;
    const {requestId}=m.params;
    try{
      const r=await s('Fetch.getResponseBody',{requestId});
      const body=maskInfo(r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body);
      await s('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(body).toString('base64')});
    }catch(e){console.error(`${name}: /api/info の差し替えに失敗`,e.message);await s('Fetch.failRequest',{requestId,errorReason:'Failed'}).catch(()=>{});}
  });
  const eval_=async(expr)=>{const r=await s('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(`${name}: ${r.exceptionDetails.exception?.description||r.exceptionDetails.text}`);return r.result.value;};
  return {name,s,eval:eval_,
    go:async url=>{await s('Page.navigate',{url});await sleep(1500);},
    click:async(sel,{optional=false}={})=>{const ok=await eval_(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled||!e.getClientRects().length)return false;e.click();return true;})()`);if(!ok&&!optional)throw Error(`${name}: ${sel} を押せません`);await sleep(600);return ok;},
    waitFor:async(expr,what)=>{for(let i=0;i<50;i++){if(await eval_(expr))return;await sleep(200);}
      const now=await eval_(`JSON.stringify({view:document.body.dataset.view,phase:document.body.dataset.phase,status:document.getElementById('gameStatus')?.textContent||document.getElementById('remoteNote')?.textContent})`);
      throw Error(`${name}: 待機タイムアウト ${what} ${now}`);},
    shot:async(file)=>{
      await sleep(500);
      const text=await eval_('document.body.innerText');
      const ips=(text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)||[]).filter(ip=>ip!==DEMO_IP&&ip!=='127.0.0.1');
      if(ips.length)throw Error(`${file}: 画面に IP が残っています`);
      const {data}=await s('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false});
      fs.writeFileSync(path.join(OUT,file),Buffer.from(data,'base64'));
      shots.push(file);console.log(`撮影: ${file}`);
      (name==='PC'?pcAudit:phoneAudit)[file]=await auditLayout(eval_,file,name==='PC');
    }};
}
const shots=[],pcAudit={},phoneAudit={};
// PC画面の監査 (#270)：見えている文字の実際の大きさ (縮小後のpx) と、画面外に出たボタン。
// 文字の下限は --min-text (既定 11px)。数値だけでなく、画像を人が見て読めるかも確かめる
const MIN_TEXT=Number(arg('--min-text','11'));
if(!Number.isFinite(MIN_TEXT)||MIN_TEXT<=0)throw Error('--min-text は正の数で指定してください');
async function auditLayout(eval_,file,desktop){
  const r=await eval_(`(()=>{
    const scale=Number(getComputedStyle(document.body).getPropertyValue('--pc-scale'))||1,min=${MIN_TEXT},small=[],outside=[];
    const visible=e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.visibility!=='hidden'&&s.opacity!=='0';};
    const top=document.querySelector('dialog[open]'),desktop=${desktop};
    for(const e of (top||document.body).querySelectorAll('*')){
      if(!visible(e)||e.closest('svg,[aria-hidden=true]'))continue;
      const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(own){const px=parseFloat(getComputedStyle(e).fontSize)*(e.closest('.desktop-shell')&&!e.closest('dialog')?scale:1);
        if(px<min)small.push({text:e.textContent.trim().slice(0,24),px:Math.round(px*10)/10,decorative:!!e.closest('.brand-message')});}
      // ダイアログの中は内部スクロールで届くので、ダイアログ自体が画面に収まっているかだけを見る
      if(e.matches('button,a,select,input,summary')&&!top){const b=e.getBoundingClientRect();
        if(b.right>innerWidth+1||b.left<-1||(desktop&&(b.bottom>innerHeight+1||b.top<-1)))outside.push(e.textContent.trim().slice(0,24));}
    }
    if(top){const b=top.getBoundingClientRect();if(b.right>innerWidth+1||b.bottom>innerHeight+1||b.left<-1||b.top<-1)outside.push('ダイアログ');}
    const remote=document.querySelector('#v-remote.show');
    if(!desktop&&!top&&remote){
      const start=remote.scrollTop;
      remote.scrollTop=remote.scrollHeight;
      const panel=remote.getBoundingClientRect();
      // 説明は決まった高さの枠の中でスクロールする (#536)。枠が画面内にあり、末尾までスクロールで読めるかを見る
      const notes=remote.querySelector('.host-notes');
      if(notes&&visible(notes)){
        const bounds=notes.getBoundingClientRect();
        const scrollable=['auto','scroll'].includes(getComputedStyle(notes).overflowY);
        if((!scrollable&&notes.scrollHeight>notes.clientHeight+1)||bounds.bottom>Math.min(panel.bottom,innerHeight)+1)outside.push('リモコンの説明の末尾');
      }
      const end=remote.querySelector('#endBtn');
      if(end&&visible(end)){
        end.scrollIntoView({block:'nearest'});
        const bounds=end.getBoundingClientRect();
        if(bounds.top<panel.top-1||bounds.bottom>Math.min(panel.bottom,innerHeight)+1)outside.push('協力プレイの終了');
      }
      remote.scrollTop=start;
    }
    return {scale:Math.round(scale*1000)/1000,small,outside};
  })()`);
  if(r.small.length||r.outside.length)console.log(`  監査 ${file}: ${MIN_TEXT}px未満 ${r.small.length}件${r.small.length?'（'+r.small.slice(0,6).map(x=>x.text+' '+x.px+'px').join('、')+'）':''}、画面外のボタン ${r.outside.length}件${r.outside.length?'（'+r.outside.join('、')+'）':''}`);
  return r;
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  for(const f of fs.readdirSync(OUT))if(/^(pc|phone)-.*\.jpg$/.test(f))fs.rmSync(path.join(OUT,f));
  await waitHttp(`http://127.0.0.1:${PORT}/app`);
  await openCdp();
  const base=`http://127.0.0.1:${PORT}`;
  const pc=await page('PC',PC);
  await pc.go(`${base}/app`);
  await pc.waitFor(`!!document.querySelector('#qr svg')`,'QR');
  await pc.shot('pc-01-join-waiting.jpg');

  // スマホ3台が参加する (P1 がホスト)
  const phones=[];
  for(const [slot,ua] of [['P1','iPhone'],['P2','Android'],['P3','iPhone']]){
    const p=await page(slot,PHONE,ua);await p.go(`${base}/`);
    await p.waitFor(`document.getElementById('slot').textContent.trim()==='${slot}'`,`${slot} の参加`);
    phones.push(p);
  }
  const [p1,p2,p3]=phones;
  await sleep(800);
  await pc.shot('pc-02-join-ready.jpg');
  await p1.shot('phone-p1-01-host-lobby.jpg');
  await p2.shot('phone-p2-01-waiting.jpg');
  await p3.shot('phone-p3-01-waiting.jpg');

  // 参加 → ゲーム選択 → 分担
  await pc.click('#nextBtn');
  await pc.waitFor(`document.body.dataset.view==='game'`,'ゲーム選択');
  await pc.click('[data-game="minecraft-java"]');
  await pc.shot('pc-03-game-select.jpg');
  await pc.click('[data-play-game="minecraft-java"]'); // 選んだタイルの「▶」で分担へ進む (#445)
  await pc.waitFor(`document.body.dataset.view==='roles'`,'分担');
  await pc.shot('pc-04-roles.jpg');
  await pc.click('#nextBtn'); // メンバーと分担を決定
  await pc.waitFor(`document.getElementById('roleHeading').textContent.includes('決定')`,'分担の決定');
  for(const p of phones)await p.click('#roleOkBtn',{optional:true});
  await pc.shot('pc-05-roles-confirmed.jpg');

  // 分担決定後、ロビーから協力プレイへ直接進む (#440)
  await p1.waitFor(`!document.getElementById('startBtn').disabled`,'分担操作開始が有効');
  await p1.shot('phone-p1-02-start-available.jpg');
  await p1.click('#startBtn');
  await pc.waitFor(`document.body.dataset.view==='coop'`,'協力プレイ');
  await sleep(800);
  await pc.shot('pc-07-coop.jpg');
  await p1.shot('phone-p1-03-coop-move.jpg');
  await p2.shot('phone-p2-03-coop-look.jpg');
  await p3.shot('phone-p3-02-coop-action.jpg');

  // 一時停止
  await p1.click('#genPause');
  await pc.waitFor(`document.body.dataset.view==='paused'`,'一時停止');
  await pc.shot('pc-08-paused.jpg');
  await p1.shot('phone-p1-04-host-paused.jpg');
  await p2.shot('phone-p2-04-paused.jpg');

  // 設定・接続方法・スマホの診断
  await pc.click('#settingsBtn');
  await pc.eval(`document.getElementById('keyDetails').open=true`);
  await pc.shot('pc-09-settings.jpg');
  await pc.click('#closeSettings');
  await pc.click('#settingsBtn');await pc.click('#settingsConnectionBtn');
  await pc.shot('pc-10-connection-help.jpg');
  await pc.click('#closeConnectionHelp');
  await p2.click('#phoneSettingsBtn');
  await p2.shot('phone-p2-05-diagnostics.jpg');
  await p2.click('#closePhoneDiagnostics');

  // 再開してから緊急停止 (ホストの stdin の stop は Ctrl+Alt+F12 と同じ経路)
  await p1.click('#startBtn');
  await pc.waitFor(`document.body.dataset.view==='coop'`,'再開');
  hostCmd('stop');
  await pc.waitFor(`document.body.dataset.view==='paused'`,'緊急停止');
  await sleep(800);
  await pc.shot('pc-11-emergency-stop.jpg');
  await p1.shot('phone-p1-05-emergency-stop.jpg');

  // 仮想カーソルと同じDOM clickでは再開せず、PC上のポインター操作でだけ再開する。
  await pc.eval(`document.querySelector('[data-mode="on"]').click(); document.getElementById('nextBtn').click()`);
  await sleep(500);
  if(!await pc.eval(`document.getElementById('nextBtn').classList.contains('resume-input')`))throw Error('合成クリックで入力が再開した');
  const {x,y}=await pc.eval(`(()=>{const r=document.getElementById('nextBtn').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await pc.s('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await pc.s('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  await pc.waitFor(`!document.getElementById('nextBtn').classList.contains('resume-input')`,'PC操作による入力再開');

  fs.writeFileSync(path.join(OUT,'shots.json'),JSON.stringify({captured:new Date().toISOString(),pc:`${PC.width}x${PC.height}`,phone:`${PHONE.width}x${PHONE.height}@${PHONE.deviceScaleFactor}x`,files:shots,pcAudit:{minText:MIN_TEXT,...pcAudit},phoneAudit:{minText:MIN_TEXT,...phoneAudit}},null,2)+'\n');
  if(process.argv.includes('--assert-layout')){
    const failures=Object.entries({...pcAudit,...phoneAudit})
      .filter(([,result])=>result.outside.length||result.small.some(entry=>!entry.decorative));
    if(failures.length)throw Error(`画面寸法の監査に失敗: ${failures.map(([file])=>file).join('、')}`);
  }
  console.log(`${shots.length}枚を ${path.relative(ROOT,OUT)} に保存`);
}

main().then(()=>0,e=>{console.error(e.message);return 1;}).then(code=>{
  try{cdp?.close();}catch{}
  chrome.kill();host.stdin.end('quit\n');
  setTimeout(()=>{host.kill();try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}process.exit(code);},1500);
});
