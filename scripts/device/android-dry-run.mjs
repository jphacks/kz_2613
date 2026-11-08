// 認可済みAndroid 1台とRust dry-runホストのUSB smoke。OS入力は送らない。
// 実行条件・限界は docs/develop/acceptance/README.md を参照。
import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const options = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(['--bin', '--adb', '--sha256', '--host-only', '--react'].includes(key), '不明な引数');
  assert(!options.has(key), '重複した引数');
  const value = ['--host-only', '--react'].includes(key) ? true : process.argv[++i];
  assert(value && (value === true || !value.startsWith('--')), '引数の値が必要です');
  options.set(key, value);
}
const BIN = options.get('--bin'), ADB = options.get('--adb') ?? 'adb';
const EXPECTED = options.get('--sha256');
assert(BIN && /^[0-9a-f]{64}$/i.test(EXPECTED), '--bin と64桁の --sha256 が必要です');
const hash = crypto.createHash('sha256').update(fs.readFileSync(BIN)).digest('hex');
assert.equal(hash, EXPECTED.toLowerCase(), 'exeが指定ハッシュと異なります');
const hostOnly = options.has('--host-only');
fs.mkdirSync(path.join(ROOT, 'data/local/device-acceptance'), {recursive:true});
const OUT = fs.mkdtempSync(path.join(ROOT, 'data/local/device-acceptance/run-'));
const adb = (...args) => {
  try {
    return execFileSync(ADB, serial ? ['-s', serial, ...args] : args, {encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  } catch {
    throw Error('ADBコマンド失敗: ' + args[0]);
  }
};
const http = async url => {
  const response = await fetch(url, {signal:AbortSignal.timeout(2500),redirect:'error'});
  assert(response.ok, 'HTTP ' + response.status);
  return response;
};
let port, cdpPort, base, testUrl, hostClosed, serial;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(100);}throw Error(`待機失敗: ${label}`);};
const report={date:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim().length>0,binarySha256:hash,
  uiAssets:options.has('--react')?Object.fromEntries(fs.readdirSync(path.join(ROOT,'apps/web-static/react')).filter(f=>f.endsWith('.js')).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'apps/web-static/react',f))).digest('hex')])):undefined,
  safety:{dryRun:true,noConfig:true,fakeTarget:true,osInput:false},ui: options.has('--react') ? 'React + TypeScript' : '従来版',connection:hostOnly ? 'PCループバック' : 'ADB reverse TCP / WebSocket',tests:[],limitations:['実指・iPhone・3実端末・Wi-Fi断・実Windows入力・Minecraft・別PCは未検証。WebRTCはUSB経路の成立確認']};
let host, mon, browser, tabId, forwarded=false,reversed=false, ping;
const clients=[];
const pageErrors=[];
let savedRotation;
const check=async(id,fn)=>{try{const observed=await fn();report.tests.push({id,result:'合格',observed});console.log(`${id}: 合格`);}catch(e){report.tests.push({id,result:'不合格',reason:e.message});throw e;}};
function client(){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),messages=[];
  ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));
  const c={ws,messages,send:m=>ws.send(JSON.stringify(m)),game:()=>messages.findLast(m=>m.type==='game')?.game,
    state:()=>messages.findLast(m=>m.type==='state'),close:()=>ws.close()};clients.push(c);return c;
}
async function open(c){await until(()=>c.ws.readyState===1,'WebSocket');return c;}
async function cdp(url){
  const ws=new WebSocket(url),pending=new Map();let n=0;
  try {
    await until(() => {
      if (ws.readyState >= WebSocket.CLOSING) throw Error('CDP接続が終了しました');
      return ws.readyState === WebSocket.OPEN;
    }, 'CDP接続', 3000);
  } catch (error) {
    ws.close();
    throw error;
  }
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id){if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')pageErrors.push(m.params.args.map(a=>a.value??a.description).join(' '));return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
  return {close:()=>ws.close(),call:(method,params={})=>new Promise((resolve,reject)=>{const id=++n;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));})};
}
let page;
async function evaluate(expression){const r=await page.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function click(selector){assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return false;e.click();return true;})()`),`操作不可: ${selector}`);await sleep(350);}
async function touchStart(selector){
  const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await page.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...r,id:1}]});
  return r;
}
async function touch(selector,move=false){
  const r=await touchStart(selector);
  if(move)await page.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+55,y:r.y,id:1}]});
  await sleep(180);await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
}
async function shot(name){const {data}=await page.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,`${name}.png`),Buffer.from(data,'base64'));}

try{
  if (!hostOnly) {
    const devices = adb('devices').split(/\r?\n/).slice(1).filter(Boolean);
    assert.equal(devices.length, 1, '接続端末は1台だけにしてください');
    assert(/\sdevice$/.test(devices[0]), '端末は未認可またはofflineです');
    serial = devices[0].split(/\s+/)[0];
    const lock = adb('shell', 'dumpsys', 'window', 'policy');
    assert(/showing=false/.test(lock) && /inputRestricted=false/.test(lock), 'ロック状態を確認できません');
    report.device = {
      android:adb('shell','getprop','ro.build.version.release'),
      sdk:adb('shell','getprop','ro.build.version.sdk'),
      size:adb('shell','wm','size'),
      density:adb('shell','wm','density'),
    };
  }
  const fake = path.join(OUT, 'fake-games');
  fs.mkdirSync(fake);
  // ホスト自身にループバックの空きポートを割り当てさせ、他のホストへの誤接続を防ぐ。
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.toUpperCase().startsWith('RECOOPLAY_') && key.toUpperCase() !== 'PORT'));
  Object.assign(env, {
    PORT:'0', RECOOPLAY_ROOT:ROOT, RECOOPLAY_DRY_RUN:'1', RECOOPLAY_NO_CONFIG:'1',
    RECOOPLAY_RUNTIME_MEASURE:'1', RECOOPLAY_FAKE_TARGET:'1', RECOOPLAY_FAKE_GAMES:fake,
    RECOOPLAY_MINECRAFT_OPTIONS:path.join(ROOT,'scripts/sim/fixtures/minecraft-options.txt'),
    RECOOPLAY_LOG_DIR:path.join(OUT,'host-logs'), RECOOPLAY_STDIN_CONTROL:'1',
  });
  try {
    host = spawn(path.resolve(BIN), [], {cwd:ROOT,windowsHide:true,env,stdio:['pipe','pipe','ignore']});
  } catch {
    throw Error('dry-runホスト起動失敗');
  }
  host.stdin.on('error', () => {}); // 先に終了した場合のEPIPEは終了コードで判定する。
  let output = '';
  let launchError;
  host.on('error', error => { launchError = error.code; });
  hostClosed = new Promise(resolve => host.once('close', (code, signal) => resolve({code, signal})));
  host.stdout.on('data', chunk => {
    output = (output + chunk).slice(-8192);
    const match = output.match(/server_start \{"port":([1-9]\d{0,4})\}/);
    if (match) port = Number(match[1]);
  });
  await until(() => {
    if (launchError || host.exitCode !== null) throw Error('dry-runホスト起動失敗');
    return port > 0 && port <= 65535;
  }, '起動したホストのポート通知');
  report.hostPort = port;
  console.log('試験ホストのポート: ' + port);
  base = 'http://127.0.0.1:' + port;
  testUrl = base + (options.has('--react') ? '/phone-react.html?acceptance=' : '/?acceptance=') + crypto.randomUUID();
  await http(base);
  mon=await open(client());mon.send({type:'monitor',page:'host'});
  await until(()=>mon.state(),'monitor');
  assert.equal(mon.state().inject.target.fake,true,'疑似対象が有効ではありません');
  mon.send({type:'auto_resume',on:false});
  report.safety.initialDown=mon.state().inject.down;assert.deepEqual(report.safety.initialDown,[]);
  report.tests.push({id:'dry-runホストのHTTPと監視接続',result:'合格'});
  if (!hostOnly) {
    adb('reverse','--no-rebind','tcp:' + port,'tcp:' + port);
    reversed = true;
    adb('shell','am','start','-a','android.intent.action.VIEW','-d',testUrl,'-p','com.android.chrome','--es','com.android.browser.application_id','recooplay-acceptance');
    await sleep(1800);
    cdpPort = Number(adb('forward','tcp:0','localabstract:chrome_devtools_remote'));
    assert(Number.isInteger(cdpPort) && cdpPort > 0 && cdpPort <= 65535, 'CDP転送ポートの割当失敗');
    forwarded = true;
    report.cdpPort = cdpPort;
    console.log('試験CDP転送のポート: ' + cdpPort);
    let targets;
    try {
      targets = await (await http('http://127.0.0.1:' + cdpPort + '/json/list')).json();
    } catch {
      report.tests.push({id:'Android-CDP',result:'未実施',reason:'ChromeのCDPを利用できません。端末上で試験タブを閉じてください'});
      throw Error('CDP未利用のため操作試験を保留');
    }
    const target=targets.find(t=>t.type==='page'&&t.url===testUrl);assert(target,'テスト専用タブが見つかりません');tabId=target.id;
    assert(/^[a-zA-Z0-9_-]+$/.test(tabId), 'CDPタブIDが不正です');
    page = await cdp('ws://127.0.0.1:' + cdpPort + '/devtools/page/' + tabId);
    browser = page;
    await page.call('Runtime.enable');await page.call('Page.enable');
    report.device.chrome=(await (await http('http://127.0.0.1:' + cdpPort + '/json/version')).json()).Browser;
    await check('Android初期表示・P1参加',async()=>{await until(async()=>await evaluate(`document.getElementById('slot').textContent==='P1'&&document.getElementById('status').textContent==='接続OK'`),'P1');await shot('01-p1-lobby');const view=await evaluate(`({slot:document.getElementById('slot').textContent,status:document.getElementById('status').textContent,path:document.getElementById('path').textContent,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth})`);assert.equal(view.overflow,false);return view;});
    // PC上の模擬参加者を補助として使う。3台の実機受入ではない。
    for(const slot of ['P2','P3']){const c=await open(client());c.send({type:'hello',protocolVersion:4,clientId:`acceptance-${slot}`,ua:'simulation'});await until(()=>c.messages.some(m=>m.type==='welcome'),'模擬参加');}
    ping=setInterval(()=>{for(const c of clients)if(c.ws.readyState===1)c.send({type:'ping',t:Date.now()});},1000);
    await until(()=>mon.state().game.connected.length===3,'3参加者');
    const g=mon.state().game;mon.send({type:'confirm_lineup',title:g.title,members:g.connected,epoch:g.epoch});
    await until(()=>mon.state().game.lineupOk,'分担確定');
    await click('#startBtn');await until(()=>mon.state().game.phase==='preparing','preparing');
    await click('#startBtn');await until(()=>mon.state().game.phase==='coop','coop');
    await check('Android生成操作面・単指ボタン',async()=>{await shot('02-p1-coop');const mark=mon.messages.length;await touch('[data-ctl="act:jump"]');const ev=mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.state);assert.deepEqual(ev,['down','up']);return {input:ev,via:mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.via)};});
    await check('Android同一ボタンの2接点保持',async()=>{
      const mark=mon.messages.length;
      const point=await touchStart('[data-ctl="act:jump"]');
      await page.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1},{x:point.x+18,y:point.y,id:2}]});
      await sleep(100);
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:point.x+18,y:point.y,id:2}]});
      await sleep(100);
      const held=mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.state);
      assert.deepEqual(held,['down'],'最初の接点の解放でupしてはならない');
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await sleep(180);
      const input=mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.state);
      assert.deepEqual(input,['down','up']);return {input,method:'Android Chrome CDPの2接点タッチ（実指ではない）'};
    });
    await check('Androidスティック右・解放',async()=>{const mark=mon.messages.length;await touch('.gen-stick',true);const ev=mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:right').map(m=>m.entry.state);assert.deepEqual(ev,['down','up']);await until(()=>mon.state().inject.down.length===0,'スティック解放');return {input:ev,down:[]};});
    await check('Android診断表示',async()=>{await click('#phoneSettingsBtn');assert(await evaluate(`document.getElementById('phoneDiagnostics').open`));await shot('03-diagnostics');await click('#closePhoneDiagnostics');return '診断ダイアログの開閉';});
    await check('Androidタッチ領域と入力処理時間',async()=>{
      await until(async()=>await evaluate(`!!JSON.parse(document.getElementById('inputMetrics').textContent||'{}').pointerdown?.n`),'端末内入力計測');
      const observed=await evaluate(`({areas:[...document.querySelectorAll('#genControls button.key')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}}),metrics:JSON.parse(document.getElementById('inputMetrics').textContent),rtt:document.getElementById('rttAvg').textContent})`);
      assert(observed.areas.every(r=>r.width>=44&&r.height>=44),'最低44pxのタッチ領域');
      assert(observed.metrics.pointerdown.n>0);return observed;
    });
    await check('Android保持中のホストPause・全解放', async () => {
      await touchStart('[data-ctl="act:jump"]');
      try {
        await until(() => mon.state().inject.down.length > 0, '保持中の論理押下');
        await click('#genPause');
        await until(() => mon.state().game.phase === 'paused' && mon.state().inject.down.length === 0, 'Pause解放');
        await shot('04-paused');
        return {phase:'paused',down:[]};
      } finally {
        await page.call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      }
    });
    await check('Android再開と実回転時の全解放',async()=>{
      await click('#startBtn');await until(()=>mon.state().game.phase==='coop','再開');
      await until(async()=>await evaluate(`document.body.dataset.view==='v-gen'&&!document.getElementById('viewFx').classList.contains('run')`),'再開表示');
      savedRotation=adb('shell','wm','user-rotation');
      assert(/^(free|lock [0-3])$/.test(savedRotation),'元の回転モードを確認できません');
      await touchStart('[data-ctl="act:jump"]');
      await until(()=>mon.state().inject.down.length>0,'回転前保持');
      try {
        adb('shell','wm','user-rotation','lock','1');
        await until(async()=>await evaluate(`!matchMedia('(orientation: portrait)').matches`),'実回転');
        await until(()=>mon.state().inject.down.length===0,'回転解放');
        assert(await evaluate(`getComputedStyle(document.getElementById('rotatePrompt')).display!=='none'`));
        await shot('05-landscape');
      } finally {
        await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        adb('shell','wm','user-rotation','lock','0');
      }
      await until(async()=>await evaluate(`matchMedia('(orientation: portrait)').matches`),'縦復帰');
      await sleep(200);assert.deepEqual(mon.state().inject.down,[]);
      adb('shell','wm','user-rotation',...savedRotation.split(' '));savedRotation=undefined;
      return {down:[],rotation:'横向きで停止し縦復帰後も旧押下を復元しない'};
    });
    await check('Androidバックグラウンド時の全解放',async()=>{
      await touchStart('[data-ctl="act:jump"]');
      await until(()=>mon.state().inject.down.length>0,'非表示前保持');
      try {
        adb('shell','input','keyevent','KEYCODE_HOME');
        await until(async()=>await evaluate(`document.hidden`),'Chrome非表示');
        await until(()=>mon.state().inject.down.length===0,'非表示解放');
      } finally {
        adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
        await until(async()=>await evaluate(`!document.hidden`),'Chrome復帰');
        await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }
      await until(async()=>await evaluate(`!document.hidden`),'Chrome復帰');
      await sleep(250);assert.deepEqual(mon.state().inject.down,[]);
      await click('#genPause');await until(()=>mon.state().game.phase==='paused','再停止');
      return {down:[],method:'ADB HOMEで非表示にしてChromeへ復帰'};
    });
    await check('Android保持中の通信切断・同じ枠への再接続',async()=>{
      const reconnects=mon.state().slots[0].reconnects;
      await evaluate(`(()=>{const original=WebSocket.prototype.send;WebSocket.prototype.send=function(data){if(this.url.endsWith('/ws'))window.__acceptanceSocket=this;return original.call(this,data)};return true})()`);
      await until(async()=>await evaluate(`window.__acceptanceSocket?.readyState===WebSocket.OPEN`),'試験対象Socket');
      await click('#startBtn');await until(()=>mon.state().game.phase==='coop','切断前再開');
      await until(async()=>await evaluate(`document.body.dataset.view==='v-gen'&&!document.getElementById('viewFx').classList.contains('run')`),'切断前操作画面');
      await touchStart('[data-ctl="act:jump"]');
      await until(()=>mon.state().inject.down.length>0,'切断前保持');
      await evaluate(`window.__acceptanceSocket.close();true`);
      await until(()=>mon.state().game.phase==='paused'&&mon.state().inject.down.length===0,'切断時の全解放');
      await until(async()=>mon.state().slots[0].connected&&mon.state().slots[0].reconnects>reconnects&&await evaluate(`document.getElementById('slot').textContent==='P1'&&document.getElementById('status').textContent==='再接続OK'`),'同じP1へ再接続');
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await sleep(250);assert.deepEqual(mon.state().inject.down,[]);assert.equal(mon.state().game.phase,'paused');
      return {slot:'P1',phase:'paused',down:[],reconnects:mon.state().slots[0].reconnects,method:'試験タブの実WebSocketを閉じる（Wi-Fi断ではない）'};
    });
    await check('Android再読み込み・元の管理権',async()=>{const reconnects=mon.state().slots[0].reconnects;const loader=(await page.call('Page.getFrameTree')).frameTree.frame.loaderId;await page.call('Page.reload',{ignoreCache:true});await until(async()=>{const next=(await page.call('Page.getFrameTree')).frameTree.frame.loaderId;return next!==loader&&mon.state().slots[0].connected&&mon.state().slots[0].reconnects>reconnects&&await evaluate(`document.getElementById('slot').textContent==='P1'&&document.getElementById('status').textContent==='再接続OK'&&!document.getElementById('startBtn').disabled`);},'新しい文書でP1再接続');assert.equal(mon.state().game.phase,'paused');return {slot:'P1',phase:'paused',reconnects:mon.state().slots[0].reconnects};});
    await check('Android担当変更後の視点パッド・送信周期',async()=>{
      mon.send({type:'swap_roles',a:'P1',b:'P2'});
      await until(()=>mon.state().game.roleOf.P1==='P2','視点担当へ変更');
      await until(async()=>await evaluate(`!document.getElementById('roleNotice').hidden`),'担当確認表示');
      await click('#roleOkBtn');
      clients[1].send({type:'role_ok',epoch:mon.state().game.epoch});
      await until(()=>mon.state().game.roleAck.length===0&&mon.state().game.canResume,'担当確認完了');
      await click('#startBtn');
      await until(async()=>await evaluate(`document.body.dataset.view==='v-gen'&&!!document.querySelector('#v-gen #pad')&&!document.getElementById('viewFx').classList.contains('run')`),'視点パッド表示');
      await evaluate(`window.__lookTimes=[];for(const proto of [WebSocket.prototype,RTCDataChannel.prototype]){const original=proto.send;proto.send=function(data){if(typeof data==='string'&&data.includes('"look"'))window.__lookTimes.push(performance.now());return original.call(this,data)}};true`);
      const point=await touchStart('#v-gen #pad');
      const started=Date.now();let i=0;
      while(Date.now()-started<1500){await page.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+(i++%30)-15,y:point.y,id:1}]});await sleep(12);}
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
      const times=await evaluate(`window.__lookTimes`);assert(times.length>=10,'視点の送信が不足');
      const gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);
      await touchStart('#v-gen #pad');
      await click('#genPause');await until(()=>mon.state().game.phase==='paused','視点停止');
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const count=await evaluate(`window.__lookTimes.length`);await sleep(200);assert.equal(await evaluate(`window.__lookTimes.length`),count,'停止後に視点を送らない');
      await shot('06-look-paused');
      return {count:times.length,medianMs:Math.round(gaps[Math.floor(gaps.length*.5)]*10)/10,p95Ms:Math.round(gaps[Math.floor(gaps.length*.95)]*10)/10,transport:await evaluate(`document.getElementById('path').textContent`)};
    });
    await check('Android JavaScriptエラー',async()=>{assert.deepEqual(pageErrors,[]);return {errors:[]};});
  }
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const cleanup = async (name, action) => {
    try {
      await action();
    } catch {
      (report.cleanupFailures ??= []).push(name);
      process.exitCode = 1;
    }
  };
  if(savedRotation)await cleanup('回転設定復元',()=>adb('shell','wm','user-rotation',...savedRotation.split(' ')));
  clearInterval(ping);
  for (const c of clients) await cleanup('監視・模擬接続の終了', () => c.close());
  if (host) await cleanup('ホスト終了', async () => {
    host.stdin.end('quit\n');
    let result = await Promise.race([hostClosed, sleep(2500).then(() => null)]);
    if (!result) {
      host.kill();
      result = await Promise.race([hostClosed, sleep(2500).then(() => null)]);
    }
    report.hostExit = result;
    assert.equal(result?.code, 0, '正常終了を確認できません');
  });
  if (tabId && /^[a-zA-Z0-9_-]+$/.test(tabId)) {
    await cleanup('試験タブを閉じる', () => http('http://127.0.0.1:' + cdpPort + '/json/close/' + tabId));
  }
  if (browser) await cleanup('CDP切断', () => browser.close());
  if (reversed) await cleanup('reverse解除', () => adb('reverse','--remove','tcp:' + port));
  if (forwarded) await cleanup('forward解除', () => adb('forward','--remove','tcp:' + cdpPort));
  fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(report,null,2)+'\n');
  console.log('記録: ' + path.relative(ROOT,OUT) + '/summary.json');
}
