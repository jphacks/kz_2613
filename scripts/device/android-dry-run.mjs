// 認可済みAndroid 1台とRust dry-runホストのUSB smoke。OS入力は送らない。
// 実行条件・限界は docs/develop/acceptance/README.md を参照。
import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {beginPerformance, finishPerformance, summarize} from './android-performance.mjs';
import {readWifiNetwork,freeLanPort,hostSocketProof,rtcObserverSource,rtcStatsExpression,validateSelectedPairs,validateHttpWs,privateError} from './wifi-route.mjs';
import {analyzeHostInput} from './wifi-host-analysis.mjs';
import {earlyAckSource,ackPhases} from './wifi-ack-observer.mjs';
import {createFaultTimeline} from './fault-timeline.mjs';
import {fastChannelObserverSource, rtcFallbackInput} from './rtc-fault-observer.mjs';

const SCRIPT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const options = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(['--bin', '--adb', '--sha256', '--host-only', '--root', '--benchmark-ms', '--condition', '--trial', '--players', '--ws-only', '--wifi-network', '--ack-observer', '--no-periodic-ice', '--no-host-trace', '--ws-fault-observe', '--rtc-fault-observe'].includes(key), '不明な引数');
  assert(!options.has(key), '重複した引数');
  const value = ['--host-only', '--ws-only', '--ack-observer', '--no-periodic-ice', '--no-host-trace', '--ws-fault-observe', '--rtc-fault-observe'].includes(key) ? true : process.argv[++i];
  assert(value && (value === true || !value.startsWith('--')), '引数の値が必要です');
  options.set(key, value);
}
const playerCount=Number(options.get('--players')??3);
assert([2,3,4].includes(playerCount),'players must be 2, 3 or 4');
const ROOT=path.resolve(options.get('--root') ?? SCRIPT_ROOT);
const benchmarkMs=Number(options.get('--benchmark-ms') ?? 0);
assert(benchmarkMs===0 || Number.isInteger(benchmarkMs)&&benchmarkMs>=1000&&benchmarkMs<=120000,'計測時間が不正です');
const BIN = options.get('--bin'), ADB = options.get('--adb') ?? 'adb';
const EXPECTED = options.get('--sha256');
assert(BIN && /^[0-9a-f]{64}$/i.test(EXPECTED), '--bin と64桁の --sha256 が必要です');
const hash = crypto.createHash('sha256').update(fs.readFileSync(BIN)).digest('hex');
assert.equal(hash, EXPECTED.toLowerCase(), 'exeが指定ハッシュと異なります');
const hostOnly = options.has('--host-only');
const wifi=options.has('--wifi-network');
assert(!(wifi&&hostOnly),'Wi-Fi試験では実Androidが必要です');
const observeWsFault=options.has('--ws-fault-observe');
const observeRtcFault=options.has('--rtc-fault-observe');
assert(!observeRtcFault||wifi&&!options.has('--ws-only')&&!observeWsFault&&benchmarkMs===0,
  '--rtc-fault-observe は実Wi-Fi、RTCあり、WS切断と併用しない非ベンチマーク試行で使用してください');
assert(!observeWsFault||wifi&&!options.has('--ws-only')&&benchmarkMs===0,
  '--ws-fault-observe は実Wi-FiとRTCありの非ベンチマーク試行で使用してください');
assert(!options.has('--ack-observer')||wifi&&benchmarkMs>0,'先行ACK診断はWi-Fi性能試行だけで使用する');
const periodicIce = !options.has('--no-periodic-ice');
assert(periodicIce || wifi && benchmarkMs > 0 && !options.has('--ws-only'),
  '--no-periodic-ice はRTCありのWi-Fi性能試行だけで使用する');
const noHostTrace = options.has('--no-host-trace');
assert(!noHostTrace || wifi && benchmarkMs > 0, '--no-host-trace はWi-Fi性能試行だけで使用する');
const hostTrace = wifi && !noHostTrace;
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
const report={players:playerCount,wsOnly:options.has('--ws-only'),condition:options.get('--condition'),trial:options.get('--trial'),benchmarkMs,date:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim().length>0,binarySha256:hash,
  uiAssets:Object.fromEntries(fs.readdirSync(path.join(ROOT,'apps/web/dist/assets')).filter(f=>f.endsWith('.js')).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'apps/web/dist/assets',f))).digest('hex')])),
  safety:{dryRun:true,noConfig:true,fakeTarget:true,osInput:false},ui:'React + TypeScript standard',connection:hostOnly ? 'PCループバック' : 'ADB reverse TCP / WebSocket',tests:[],limitations:['実指・iPhone・3実端末・Wi-Fi断・実Windows入力・Minecraft・別PCは未検証。HTTP/WS: ADB reverse TCP; RTC: selected candidate pair not collected']};
if(observeWsFault)report.wsFault={kind:'ws-close',clock:'PC performance.now() at observation',pollMs:100,events:[],
  limitations:['Wi-Fi自体は切断しない','RTCはWS切断に伴い閉じる場合がある','CDP往復と観測待ちを含む']};
if(observeRtcFault)report.rtcFault={kind:'rtc-datachannel-close',clock:'PC performance.now() at observation',pollMs:100,events:[]};
let host, mon, browser, tabId, forwarded=false,reversed=false, ping;
const clients=[];
const pageErrors=[];
let savedRotation;
if(wifi){
  report.ackObserver=options.has('--ack-observer');
  report.periodicIce=periodicIce&&!report.wsOnly;
  report.hostTrace=hostTrace;
}
if(wifi)report.runner={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:SCRIPT_ROOT,encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{cwd:SCRIPT_ROOT,encoding:'utf8'}).trim().length>0,modules:Object.fromEntries(['android-dry-run.mjs','android-performance.mjs','wifi-route.mjs','wifi-host-analysis.mjs','wifi-ack-observer.mjs','fault-timeline.mjs','rtc-fault-observer.mjs'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(new URL(name,import.meta.url))).digest('hex')]))};
let wifiNetwork, faultTimeline;
const networkEvents=[],privateNetworkSamples=[];
const privateNetworkFailures=[];
const safeError=message=>wifi?privateError(message,[serial,wifiNetwork?.pc,wifiNetwork?.android]):message;
const check=async(id,fn)=>{try{const observed=await fn();report.tests.push({id,result:'合格',observed});console.log(`${id}: 合格`);}catch(e){report.tests.push({id,result:'不合格',reason:safeError(e.message)});throw e;}};
function client(){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),messages=[];
  ws.addEventListener('message',e=>{
    const message=JSON.parse(e.data);
    messages.push(message);
    if(ws===mon?.ws) faultTimeline?.monitor(message);
  });
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
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(!m.id){faultTimeline?.cdp(m);if(wifi&&['Network.responseReceived','Network.webSocketCreated'].includes(m.method))networkEvents.push(m);if(m.method==='Runtime.exceptionThrown')pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')pageErrors.push(m.params.args.map(a=>a.value??a.description).join(' '));return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);};
  return {close:()=>ws.close(),call:(method,params={})=>new Promise((resolve,reject)=>{const id=++n;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));})};
}
let page;
async function evaluate(expression){const r=await page.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error((r.exceptionDetails.exception?.description||r.exceptionDetails.text).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address]'));return r.result.value;}
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
function saveWifiPrivate(){fs.writeFileSync(path.join(OUT,'network.private.json'),JSON.stringify({network:wifiNetwork,events:networkEvents,samples:privateNetworkSamples,failedAttempts:privateNetworkFailures},null,2));}
async function collectWifiProof(label) {
  if(!wifi)return;
  const stats=options.has('--ws-only')?[]:await evaluate(rtcStatsExpression);
  const history=await evaluate(`({rows:window.__wifiPathHistory??[],error:!!window.__wifiStatsError})`);
  try {
    assert(!history.error,'ICE統計の定期収集に失敗');
    const pairs=options.has('--ws-only')?[]:validateSelectedPairs(stats,wifiNetwork);
    const sample={label,at:performance.now(),...validateHttpWs(networkEvents,wifiNetwork,port),selectedPairs:pairs,wsOnly:options.has('--ws-only')};
    sample.hostLookLost=mon.state()?.slots?.[0]?.lookLost;
    sample.pathHistory=history.rows.map(h=>({at:h.at,selectedPairs:validateSelectedPairs(h.stats,wifiNetwork)}));
    report.networkProof.samples.push(sample);
    if(faultTimeline && label.startsWith('ws-close-')){
      for(const pair of pairs) faultTimeline.rtc({
        connectionState:pair.connectionState,iceConnectionState:pair.iceState,hasSelectedLanPair:true,
      });
    }
    privateNetworkSamples.push({label,stats,history});
  } catch(error) {
    privateNetworkFailures.push({label,stats,history,reason:safeError(error.message)});
    (report.networkProof.failures??=[]).push({label,reason:safeError(error.message),currentStates:stats.map(s=>({connection:s.connectionState,pair:s.pair.state,nominated:s.pair.nominated})),historyStates:history.rows.map(h=>({at:h.at,states:h.stats.map(s=>({connection:s.connectionState,pair:s.pair.state,nominated:s.pair.nominated}))}))});
    saveWifiPrivate();throw error;
  }
  saveWifiPrivate();
}

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
  if(wifi){
    wifiNetwork=readWifiNetwork(options.get('--wifi-network'),adb);port=await freeLanPort();
    report.connection='Wi-Fi LAN / HTTP+WS (USB CDP control only)';
    report.limitations=['CDP合成タッチ、dry-run。実指・実OS入力・Minecraft・複数実端末は未受入。'];
    report.networkProof={...wifiNetwork.proof,samples:[]};
  }
  // ホスト自身にループバックの空きポートを割り当てさせ、他のホストへの誤接続を防ぐ。
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.toUpperCase().startsWith('RECOOPLAY_') && key.toUpperCase() !== 'PORT'));
  Object.assign(env, {
    PORT:wifi?String(port):'0', RECOOPLAY_ROOT:ROOT, RECOOPLAY_DRY_RUN:'1', RECOOPLAY_NO_CONFIG:'1',
    ...(wifi?{}:{RECOOPLAY_RUNTIME_MEASURE:'1'}), RECOOPLAY_FAKE_TARGET:'1', RECOOPLAY_FAKE_GAMES:fake,
    ...(hostTrace?{RECOOPLAY_INPUT_TRACE:'1'}:{}),
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
  let startupConfirmed=false;
  let launchError;
  host.on('error', error => { launchError = error.code; });
  hostClosed = new Promise(resolve => host.once('close', (code, signal) => resolve({code, signal})));
  host.stdout.on('data', chunk => {
    output = (output + chunk).slice(-8192);
    const match = output.match(/server_start \{"port":([1-9]\d{0,4})\}/);
    if (match) {port = Number(match[1]);startupConfirmed=true;}
    if(wifi&&output.includes(`(port ${port})`))startupConfirmed=true;
  });
  await until(() => {
    if (launchError || host.exitCode !== null) throw Error('dry-runホスト起動失敗');
    return startupConfirmed&&port > 0 && port <= 65535;
  }, '起動したホストのポート通知');
  report.hostPort = port;
  console.log('試験ホストのポート: ' + port);
  base = 'http://127.0.0.1:' + port;
  testUrl = (wifi?`http://${wifiNetwork.pc}:${port}`:base) + '/?acceptance=' + crypto.randomUUID();
  if(observeWsFault||observeRtcFault){
    faultTimeline=createFaultTimeline({wsUrl:`ws://${wifiNetwork.pc}:${port}/ws`});
  }
  await http(base+'/');
  mon=await open(client());mon.send({type:'monitor',page:'host'});
  await until(()=>mon.state(),'monitor');
  assert.equal(mon.state().inject.target.fake,true,'疑似対象が有効ではありません');
  mon.send({type:'auto_resume',on:false});
  report.safety.initialDown=mon.state().inject.down;assert.deepEqual(report.safety.initialDown,[]);
  report.tests.push({id:'dry-runホストのHTTPと監視接続',result:'合格'});
  androidTrial: if (!hostOnly) {
    if(!wifi){adb('reverse','--no-rebind','tcp:' + port,'tcp:' + port);reversed = true;}
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
    if(wifi){
      await page.call('Network.enable');await page.call('Network.setCacheDisabled',{cacheDisabled:true});
      await page.call('Page.addScriptToEvaluateOnNewDocument',{source:rtcObserverSource({periodic:report.periodicIce})});
      if(observeRtcFault)await page.call('Page.addScriptToEvaluateOnNewDocument',{source:fastChannelObserverSource});
      if(options.has('--ack-observer'))await page.call('Page.addScriptToEvaluateOnNewDocument',{source:earlyAckSource});
    }
    if(options.has('--ws-only')){
      await page.call('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(window,"RTCPeerConnection",{value:undefined,configurable:true})'});
      await page.call('Page.reload',{ignoreCache:true});
      await until(async()=>await evaluate(`!!document.getElementById('status')&&document.getElementById('status').textContent.includes('接続')`),'WS-only page');
    }
    else if(wifi){
      await page.call('Page.reload',{ignoreCache:true});
      // reloadの返却は新しい文書の読込完了ではない。破棄中の旧contextへ評価を送らない。
      await until(()=>networkEvents.some(e=>e.method==='Network.responseReceived'&&e.params.type==='Document'&&e.params.response.url===testUrl&&e.params.response.status===200),'LANの新文書HTTP応答',20000);
    }
    report.device.chrome=(await (await http('http://127.0.0.1:' + cdpPort + '/json/version')).json()).Browser;
    await check('Android初期表示・P1参加',async()=>{await until(async()=>await evaluate(`document.getElementById('slot')?.textContent==='P1'&&['接続OK','再接続OK'].includes(document.getElementById('status').textContent)`),'P1');await shot('01-p1-lobby');const view=await evaluate(`({slot:document.getElementById('slot').textContent,status:document.getElementById('status').textContent,path:document.getElementById('path').textContent,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth})`);assert.equal(view.overflow,false);return view;});
    if(wifi)await check('Wi-Fi HTTP/WS/ICE経路と非ループバック認可',async()=>{
      report.networkProof.host=hostSocketProof(host.pid,port,wifiNetwork);
      const statuses=await evaluate(`Promise.all(['/app','/host'].map(async p=>({path:p,status:(await fetch(p)).status})))`);
      assert(statuses.every(s=>s.status===403),'LAN端末はPC専用ページ/APIを取得できてはならない');
      const redactedInfo=await evaluate(`(async()=>{const r=await fetch('/api/info'),v=await r.json();return {status:r.status,wifiRedacted:v.wifi===null,hotspotRedacted:v.hotspot===null,buildRedacted:!Object.hasOwn(v,'build')}})()`);
      assert(redactedInfo.status===200&&redactedInfo.wifiRedacted&&redactedInfo.hotspotRedacted&&redactedInfo.buildRedacted,'LAN用の公開infoにPC限定情報が含まれる');
      if(!options.has('--ws-only'))await until(async()=> (await evaluate(rtcStatsExpression)).length>0,'選択ICE候補対',15000);
      await collectWifiProof('initial');return {host:report.networkProof.host,pcEndpoints:statuses,redactedInfo};
    });
    // PC上の模擬参加者を補助として使う。3台の実機受入ではない。
    for(const slot of ['P2','P3','P4'].slice(0,playerCount-1)){const c=await open(client());c.send({type:'hello',protocolVersion:6,clientId:`acceptance-${slot}`,ua:'simulation'});await until(()=>c.messages.some(m=>m.type==='welcome'),'模擬参加');}
    ping=setInterval(()=>{for(const c of clients)if(c.ws.readyState===1)c.send({type:'ping',t:Date.now()});},1000);
    await until(()=>mon.state().game.connected.length===playerCount,'participants');
    const g=mon.state().game;mon.send({type:'confirm_lineup',title:g.title,members:g.connected,epoch:g.epoch});
    await until(()=>mon.state().game.lineupOk,'分担確定');
    await click('#startBtn');await until(()=>mon.state().game.phase==='coop','coop');
    if(observeRtcFault){
      await check('RTC単独: 同じWSで新規入力を受理',async()=>{
        const {epoch}=mon.state().game;
        const reconnects=mon.state().slots[0].reconnects;
        const socket=faultTimeline.events().findLast(e=>e.kind==='welcome'&&e.slot==='P1')?.socket;
        assert(Number.isSafeInteger(socket),'試験タブのP1 WebSocketを観測できません');
        await collectWifiProof('rtc-close-before');
        await until(async()=>await evaluate("document.body.dataset.view==='v-gen'&&!document.getElementById('viewFx').classList.contains('run')"),'操作画面');
        const status=()=>evaluate(`(()=>{const f=window.__faultFast;if(!f)return null;
          return {connectionState:f.connection.connectionState,iceConnectionState:f.connection.iceConnectionState,channelState:f.channel.readyState};
        })()`);
        const before=await status();
        assert.equal(before?.channelState,'open','fast DataChannelが開いていません');
        faultTimeline.rtc({...before,hasSelectedLanPair:true});
        faultTimeline.mark('rtc-close-requested');
        await evaluate("window.__faultFast.channel.close()");
        await until(async()=> (await status())?.channelState==='closed','fast DataChannelの閉鎖');
        const after=await status();
        const stats=await evaluate(rtcStatsExpression);
        const selectedPairs=stats.length?validateSelectedPairs(stats,wifiNetwork):[];
        faultTimeline.rtc({...after,hasSelectedLanPair:selectedPairs.length>0});
        faultTimeline.mark('rtc-closed');
        await touchStart('[data-ctl="act:jump"]');
        try{
          await until(()=>mon.state().inject.down.includes('SPACE'),'WSからの新しいジャンプ押下');
        }finally{
          await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }
        await until(()=>mon.state().inject.down.length===0,'WSからのジャンプ解放');
        let accepted;
        await until(()=> {
          accepted=rtcFallbackInput(faultTimeline.events(),{socket,epoch});
          return accepted!==null;
        },'同じWSで押下と解放のACK');
        assert.equal(mon.state().game.phase,'coop');
        assert.equal(mon.state().game.epoch,epoch);
        assert.equal(mon.state().slots[0].reconnects,reconnects);
        assert.deepEqual(pageErrors,[]);
        return {slot:'P1',epoch,transportBefore:before,transportAfter:after,selectedPairs,accepted};
      });
      break androidTrial;
    }
    if(benchmarkMs) await check('Android反復入力の独立性能試行',async()=>{
      const mark=mon.messages.length;
      const workload=await beginPerformance({evaluate,page,durationMs:benchmarkMs});
      report.performance=await finishPerformance(evaluate,workload);
      if(options.has('--ack-observer')){
        report.performance.raw.earlyAcks=await evaluate('window.__wifiEarlyAcks');
        report.performance.ackPhases=ackPhases(report.performance.raw,report.performance.raw.earlyAcks);
      }
      if(wifi)report.performance.summary.method='Wi-Fi LAN / CDP合成タッチ。端末内送信時間とACK観測（製品handlerを含む）、ゲーム応答ではない';
      await collectWifiProof('input-end');
      report.performance.hostEvents=mon.messages.slice(mark).filter(m=>['log','inject'].includes(m.type)&&m.entry).map(m=>({type:m.type,entry:m.entry}));
      report.performance.hostSlots=mon.state().slots.map(s=>({name:s.name,events:s.events,lost:s.lost,outOfOrder:s.outOfOrder,via:s.via,lookLost:s.lookLost,reconnects:s.reconnects}));
      assert.deepEqual(mon.state().inject.down,[]);
      return report.performance.summary;
    });
    await check('Android生成操作面・単指ボタン',async()=>{await shot('02-p1-coop');const mark=mon.messages.length;await touch('[data-ctl="act:jump"]');const ev=mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.state);assert.deepEqual(ev,['down','up']);return {input:ev,via:mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.via)};});
    await check('Android同一ボタンの2接点保持',async()=>{
      const mark=mon.messages.length;
      const point=await touchStart('[data-ctl="act:jump"]');
      await page.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1},{x:point.x+18,y:point.y,id:2}]});
      const states=()=>mon.messages.slice(mark).filter(m=>m.type==='log'&&m.entry.button==='act:jump').map(m=>m.entry.state);
      // Wi-Fiでは受信が数百ms遅れることがある（#275）。固定の待ち時間ではなく、ホストに届いたことを待ってから確かめる
      await until(()=>states().includes('down'),'2接点の押下',3000);
      // CDPの非空touchEndは「終了する接点」を指定する（残す接点ではない）。
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...point,id:1}]});
      await sleep(300);
      assert.deepEqual(states(),['down'],'最初の接点の解放でupしてはならない');
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await until(()=>states().includes('up'),'最後の接点の解放',3000);
      await sleep(200);
      const input=states();
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
    if(!wifi)await check('Androidダーク配色の無効ボタン',async()=>{
      await click('#phoneSettingsBtn');await click('#skinPicker [data-skin="dark"]');await click('#closePhoneDiagnostics');
      mon.send({type:'inject_mode',mode:'off'});
      try {
        await until(async()=>await evaluate(`document.getElementById('startBtn').disabled`),'入力OFFの反映');
        const colors=await evaluate(`(()=>{const e=document.getElementById('startBtn'),s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,visible:e.getClientRects().length>0}})()`);
        assert(colors.visible);assert.equal(colors.color,'rgb(174, 180, 194)');assert.equal(colors.background,'rgb(51, 56, 69)');
        await shot('04-dark-disabled');return colors;
      } finally {
        mon.send({type:'inject_mode',mode:'on'});
        await click('#phoneSettingsBtn');await click('#skinPicker [data-skin="standard"]');await click('#closePhoneDiagnostics');
        await until(async()=>await evaluate(`!document.getElementById('startBtn').disabled`),'入力ONの反映');
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
      if(faultTimeline){
        await collectWifiProof('ws-close-before');
        faultTimeline.mark('ws-close-requested');
      }
      const disconnectAt=performance.now();
      await evaluate(`window.__acceptanceSocket.close();true`);
      await until(()=>mon.state().game.phase==='paused'&&mon.state().inject.down.length===0,'切断時の全解放');
      const releaseAfterMs=performance.now()-disconnectAt;
      faultTimeline?.mark('release-observed');
      await until(async()=>mon.state().slots[0].connected&&mon.state().slots[0].reconnects>reconnects&&await evaluate(`document.getElementById('slot').textContent==='P1'&&document.getElementById('status').textContent==='再接続OK'`),'同じP1へ再接続');
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      faultTimeline?.mark('same-slot-reconnected');
      await sleep(250);
      const reconnectAfterMs=performance.now()-disconnectAt;
      assert.deepEqual(mon.state().inject.down,[]);assert.equal(mon.state().game.phase,'paused');
      if(faultTimeline){
        await until(async()=> (await evaluate(rtcStatsExpression)).length>0,'WS復帰後の選択ICE候補対',15000);
        await collectWifiProof('ws-close-after');
        const events=faultTimeline.events();
        const started=events.findIndex(e=>e.kind==='ws-close-requested');
        const closed=events.findIndex((e,i)=>i>started&&e.kind==='ws-closed');
        const priorSocket=events[closed]?.socket;
        const freshSocket=events.find((e,i)=>i>closed&&e.kind==='welcome'&&e.slot==='P1'&&e.reconnected)?.socket;
        assert(started>=0&&closed>started&&freshSocket>priorSocket
          &&events.some(e=>e.kind==='ws-handshake'&&e.socket===freshSocket&&e.status===101),
          '対象WSの閉鎖と新しいWSでの同枠復帰を確認できません');
        faultTimeline.mark('lan-ice-revalidated');
      }
      return {slot:'P1',phase:'paused',down:[],reconnects:mon.state().slots[0].reconnects,releaseAfterMs,reconnectAfterMs,timing:'PC process observation including CDP and 100ms polling',method:'試験タブの実WebSocketを閉じる（Wi-Fi断ではない）'};
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
      const lookMark=mon.messages.length;
      await collectWifiProof('look-start');
      await evaluate(`window.__lookTimes=[];for(const proto of [WebSocket.prototype,RTCDataChannel.prototype]){const original=proto.send;proto.send=function(data){if(typeof data==='string'&&data.includes('"look"'))window.__lookTimes.push(performance.now());return original.call(this,data)}};true`);
      const point=await touchStart('#v-gen #pad');
      const companion=await evaluate(`(()=>{const e=document.querySelector('#genControls [data-ctl]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:2,control:e.dataset.ctl}})()`);
      const started=Date.now();let i=0;
      let companionHeld=false;
      const companionPositions=[];
      report.companionPositions=companionPositions;
      while(benchmarkMs?i<1800:Date.now()-started<1500){
        const padPoint={x:point.x+(i%30)-15,y:point.y,id:1};
        if(benchmarkMs&&companion&&i%180===0){
          const position=await evaluate(`(()=>{const e=[...document.querySelectorAll('#genControls [data-ctl]')].find(e=>e.dataset.ctl===${JSON.stringify(companion.control)});if(!e)return null;const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('[data-ctl]')?.dataset.ctl,scroll:document.getElementById('genControls').scrollTop}})()`);
          assert(position,'同時操作のボタンが存在する');
          companionPositions.push(position);assert.equal(position.hit,companion.control,'同時操作は現在表示されているボタンを狙う');
          companion.x=position.x;companion.y=position.y;
          await page.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[padPoint,{x:companion.x,y:companion.y,id:2}]});companionHeld=true;
        }
        if(companionHeld&&i%180===8){await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:companion.x,y:companion.y,id:2}]});companionHeld=false;}
        await page.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:companionHeld?[padPoint,{x:companion.x,y:companion.y,id:2}]:[padPoint]});i++;
        if(wifi&&i%150===0)await collectWifiProof(`look-${i}`);
        await sleep(benchmarkMs?Math.max(0,started+i*benchmarkMs/1800-Date.now()):12);
      }
      await page.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
      await collectWifiProof('look-end');
      const times=await evaluate(`window.__lookTimes`);assert(times.length>=10,'視点の送信が不足');
      const gaps=times.slice(1).map((t,i)=>t-times[i]);
      if(benchmarkMs)report.lookPerformance={version:2,moves:i,companionTaps:companion?10:0,companionPositions,durationMs:Date.now()-started,times,gaps,summary:summarize(gaps),gaps200ms:gaps.filter(g=>g>=200).length,longestGapMs:Math.max(...gaps),hostLookLost:mon.state().slots[0].lookLost};
      if(benchmarkMs&&companion){
        const inputs=mon.messages.slice(lookMark).filter(m=>m.type==='log'&&m.entry.slot==='P1'&&m.entry.button===companion.control).map(m=>m.entry.state);
        assert.equal(inputs.filter(s=>s==='down').length,10,'look companion down');assert.equal(inputs.filter(s=>s==='up').length,10,'look companion up');
        report.lookPerformance.companionInputs={control:companion.control,states:inputs};
      }
      if(options.has('--ws-only'))assert.equal(await evaluate(`document.getElementById('path').textContent`),'WSのみ');
      gaps.sort((a,b)=>a-b);
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
  report.error = safeError(error.message);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if(wifi){
    saveWifiPrivate();
    if(report.error&&browser){try{await shot('failure');}catch{}}
  }
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
  const runtime=path.join(OUT,'host-logs/runtime-measure.json');
  if(fs.existsSync(runtime))report.hostRuntime=JSON.parse(fs.readFileSync(runtime,'utf8'));
  const trace=path.join(OUT,'host-logs/input-trace.json');
  if(hostTrace&&fs.existsSync(trace))report.hostInputTrace=JSON.parse(fs.readFileSync(trace,'utf8'));
  if(hostTrace&&benchmarkMs&&!report.error){
    try{report.hostAnalysis=analyzeHostInput(report);}
    catch(error){report.error=error.message;process.exitCode=1;console.error(error.message);}
  }
  if(faultTimeline) (observeRtcFault ? report.rtcFault : report.wsFault).events=faultTimeline.events();
  fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(report,null,2)+'\n');
  console.log('記録: ' + path.relative(ROOT,OUT) + '/summary.json');
}
