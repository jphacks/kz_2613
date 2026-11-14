// Windowsの配布アプリをdry-runで起動し、WebView2と終了経路を確認する。OS入力は送らない。
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.platform, 'win32');
assert(process.argv[2], '展開済み配布フォルダーを指定してください');
const root = path.resolve(process.argv[2]);
const temp = mkdtempSync(path.join(tmpdir(), 'recooplay-webview-ci-'));
async function freePort() {
  const listener = createServer();
  await new Promise((resolve,reject) => listener.once('error',reject).listen(0,'127.0.0.1',resolve));
  const {port} = listener.address();
  await new Promise((resolve,reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}
const hostPort = await freePort();
let debugPort = await freePort();
while(debugPort === hostPort) debugPort = await freePort();
const hostOrigin = 'http://127.0.0.1:' + hostPort;
const debugOrigin = 'http://127.0.0.1:' + debugPort;
const app = spawn(path.join(root,'recooplay-desktop.exe'), [], {
  cwd: root, windowsHide: true, stdio: 'ignore',
  env: {...process.env, PORT:String(hostPort), RECOOPLAY_ROOT:root,
    RECOOPLAY_HOST_EXE:path.join(root,'recooplay-host.exe'),
    RECOOPLAY_DRY_RUN:'1', RECOOPLAY_RUNTIME_MEASURE:'1', RECOOPLAY_NO_CONFIG:'1',
    RECOOPLAY_FAKE_TARGET:'1', RECOOPLAY_LOG_DIR:temp,
    WEBVIEW2_USER_DATA_FOLDER:path.join(temp,'webview2'),
    // デバッグ接続はPCアプリ自身がWebView2へ渡す（dry-runのときだけ有効。CIのWebView2では環境変数の起動オプションが反映されないため）
    RECOOPLAY_WEBVIEW2_DEBUG_PORT:String(debugPort)},
});
let exited, spawnError, socket;
app.once('exit', (code,signal) => {exited={code,signal};});
app.once('error', error => {spawnError=error;});
const started = performance.now();
async function until(read,label,seconds=15) {
  const deadline=performance.now()+seconds*1000;
  while(performance.now()<deadline) {
    if(spawnError) throw spawnError;
    const result=await read();
    if(result) return result;
    await delay(100);
  }
  throw Error(`${label}: ${Math.round(performance.now()-started)}ms`);
}
async function targets() {
  try {
    const response=await fetch(debugOrigin+'/json/list',{signal:AbortSignal.timeout(1000)});
    return response.ok ? await response.json() : [];
  } catch {return [];}
}
let sequence=0;
class CdpTimeout extends Error {}
function call(method,params={}) {
  return new Promise((resolve,reject) => {
    const id=++sequence;
    const timer=setTimeout(()=>{socket.removeEventListener('message',receive);reject(new CdpTimeout(`CDP応答なし: ${method} (${params.expression ?? ''})`));},3000);
    function receive(event) {
      const message=JSON.parse(event.data);
      if(message.id!==id)return;
      clearTimeout(timer);
      socket.removeEventListener('message',receive);
      if(message.error||message.result.exceptionDetails)reject(Error('CDPの画面確認に失敗: '+method));
      else resolve(message.result);
    }
    socket.addEventListener('message',receive);
    socket.send(JSON.stringify({id,method,params}));
  });
}
const evaluate = async expression => (await call('Runtime.evaluate',{expression,returnByValue:true})).result.value;
const powershell = (...args) => execFileSync('pwsh',['-NoProfile','-NonInteractive',...args],
  {encoding:'utf8',windowsHide:true,timeout:10000}).trim();
try {
  // ホストの起動（ゲーム一覧の読み込みを含む）と画面の表示を分けて待つ。手元でも応答まで10〜20秒かかり、CIではさらに遅い
  await until(async()=>{
    assert(!exited,'Tauriが起動中に終了した');
    try {return (await fetch(hostOrigin+'/api/info',{signal:AbortSignal.timeout(1000)})).ok;} catch {return false;}
  },'ホストが応答しません',90);
  console.log(`ホストの応答を確認 (${Math.round(performance.now()-started)}ms)`);
  const main=await until(async()=>{
    assert(!exited,'Tauriが起動中に終了した');
    return (await targets()).find(target=>target.url===hostOrigin+'/app'&&target.webSocketDebuggerUrl);
  },'WebView2の参加画面が見つかりません',30).catch(async error=>{
    const seen=(await targets()).map(target=>`${target.type} ${target.url.replace(hostOrigin,'<host>')}`);
    // CDPから画面が返らないときの切り分け: デバッグ用ポートへの接続、WebView2のランタイムとプロセス、ウィンドウ
    const cdp=await fetch(debugOrigin+'/json/version',{signal:AbortSignal.timeout(2000)})
      .then(response=>`HTTP ${response.status}`).catch(failure=>`${failure.name}: ${failure.cause?.code ?? failure.message}`);
    let system='';
    try {
      system=powershell('-Command',[
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
        "$k='HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'",
        "$v=(Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).pv",
        `$w=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'")`,
        `$mine=@($w | Where-Object { $_.CommandLine -match '${debugPort}' })`,
        `$app=Get-Process -Id ${app.pid} -ErrorAction SilentlyContinue`,
        "\"WebView2ランタイム=$v WebView2プロセス=$($w.Count) うちこのポート=$($mine.Count) アプリのウィンドウ='$($app.MainWindowTitle)' セッション=$($app.SessionId) 対話=$([Environment]::UserInteractive)\"",
        // 起動オプションが効いているかを見るため、ブラウザー本体（--type なし）の親と起動引数を出す
        `$w | Where-Object { $_.CommandLine -notmatch '--type=' } | ForEach-Object { " 本体 pid=$($_.ProcessId) 親=$($_.ParentProcessId) 引数=" + ($_.CommandLine -replace '^.*?msedgewebview2\\.exe\\"?\\s*','').Substring(0,[Math]::Min(400,($_.CommandLine -replace '^.*?msedgewebview2\\.exe\\"?\\s*','').Length)) }`,
        `" アプリpid=${app.pid}"`,
        "$p=Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2','HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2' -ErrorAction SilentlyContinue",
        "\" ポリシー=$(if ($p) { ($p | Out-String).Trim() -replace '\\s+',' ' } else { 'なし' })\"",
        "\" 環境変数=$([Environment]::GetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS','Machine'))\"",
      ].join('; '));
    } catch (failure) {system=`取得失敗: ${failure.message}`;}
    throw Error(`${error.message} 開いている画面: ${JSON.stringify(seen)} CDP: ${cdp} ${system}`);
  });
  console.log(`WebView2の参加画面を確認 (${Math.round(performance.now()-started)}ms)`);
  socket=new WebSocket(main.webSocketDebuggerUrl);
  await until(()=>socket.readyState===WebSocket.OPEN,'WebView2のCDPへ接続できません');
  let initialCdpTimeout;
  try {
    await until(async()=>{
      try {
        return await evaluate("document.body.dataset.view==='join' && !!document.querySelector('#nextBtn')");
      } catch (error) {
        if (!(error instanceof CdpTimeout) || socket.readyState !== WebSocket.OPEN) throw error;
        initialCdpTimeout = error;
        return false;
      }
    }, '参加画面のReact描画が完了しません');
  } catch (error) {
    throw new Error(initialCdpTimeout ? `${error.message} / ${initialCdpTimeout.message}` : error.message, {cause: error});
  }
  console.log('参加画面のReact描画を確認');
  // 待ち受けのソケットは、Windowsの一覧（Get-NetTCPConnection・netstat）に出ないことがあるため、
  // PCアプリが起動した子プロセスとしてホストを特定する
  const hostId=Number(powershell('-Command',
    `@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${app.pid} and Name='recooplay-host.exe'").ProcessId`));
  assert(Number.isSafeInteger(hostId)&&hostId>0,'ホストのプロセスを特定できません');
  assert.equal(powershell('-Command',`(Get-Process -Id ${hostId} -ErrorAction Stop).ProcessName`),'recooplay-host');
  const closeScript=fileURLToPath(new URL('./close-desktop-window.ps1',import.meta.url));
  const viewport = "({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})";
  const beforeResize = await evaluate(viewport);
  powershell('-File',closeScript,'-ProcessId',String(app.pid),'-MinimumSize');
  const compact = await until(async () => {
    const current = await evaluate(viewport);
    return current.width < beforeResize.width && current.height < beforeResize.height
      && current.width <= 850 && current.height <= 620 && current;
  }, 'WebView2が最小ウィンドウ付近まで縮みません');
  console.log('WebView2の最小ウィンドウ: '+JSON.stringify({before:beforeResize,after:compact}));
  await until(() => evaluate(`(() => {
    const nodes = ['#qr svg', '#nextBtn', '#settingsBtn', '#joinTroubleshootingBtn'].map(selector => document.querySelector(selector));
    return nodes.every(node => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    }) && nodes[0].getBoundingClientRect().bottom <= nodes[3].getBoundingClientRect().top;
  })()`), '最小ウィンドウで参加画面のQRや操作が表示領域を外れています');
  await evaluate("document.querySelector('#joinTroubleshootingBtn').click()");
  await until(()=>evaluate("document.querySelector('#joinTroubleshooting').open && document.activeElement?.id==='closeJoinTroubleshooting'"),
    '参加の案内が開きません');
  await evaluate("document.querySelector('#closeJoinTroubleshooting').click()");
  await until(()=>evaluate("!document.querySelector('#joinTroubleshooting').open"), '参加の案内が閉じません');
  await evaluate("document.querySelector('#connectionHelpBtn').focus(); document.querySelector('#connectionHelpBtn').click()");
  await until(()=>evaluate("document.querySelector('#connectionHelp').open"), '接続案内が開きません');
  await evaluate("document.querySelector('#closeConnectionHelp').click()");
  await until(()=>evaluate("!document.querySelector('#connectionHelp').open && document.activeElement?.id==='connectionHelpBtn'"),
    '接続案内を閉じた後に起点へフォーカスが戻りません');
  console.log('接続案内を閉じた後のフォーカス復帰を確認');
  await evaluate("document.querySelector('#settingsBtn').focus(); document.querySelector('#settingsBtn').click()");
  await until(()=>evaluate("document.querySelector('#settings').open && !document.querySelector('#desktopOverlaySetting')?.disabled && !!document.querySelector('#desktopOverlaySetting')"),
    'デスクトップの設定が開きません');
  assert(await evaluate(`(() => {
    const rect = document.querySelector('#settings').getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1
      && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  })()`),'最小ウィンドウで設定が表示領域を外れています');
  await evaluate("document.querySelector('#closeSettings').click()");
  await until(()=>evaluate("!document.querySelector('#settings').open && document.activeElement?.id==='settingsBtn'"),
    '操作設定を閉じた後に起点へフォーカスが戻りません');
  await evaluate("document.querySelector('#settingsBtn').click()");
  await until(()=>evaluate("document.querySelector('#settings').open"), '操作設定を開き直せません');
  // 全員の接続のリセット (#412)：設定から確認の画面を開き、やめると送らず、確かめると送る
  const monitor=new WebSocket(hostOrigin.replace('http','ws')+'/ws');const logs=[];
  monitor.onmessage=event=>{try{const m=JSON.parse(event.data);if(m.type==='log')logs.push(m.entry.kind);}catch{}};
  await until(()=>monitor.readyState===WebSocket.OPEN,'リセットの確認用にホストへ接続できません');
  monitor.send(JSON.stringify({type:'monitor',page:'host'}));
  await evaluate("document.querySelector('#resetAllBtn').click()");
  await until(()=>evaluate("document.querySelector('#resetConfirm').open && !document.querySelector('#settings').open && document.activeElement?.id==='resetCancel'"),
    'リセットの確認が開かない、または既定の選択が「やめる」ではありません');
  await evaluate("document.querySelector('#resetCancel').click()");
  await until(()=>evaluate("!document.querySelector('#resetConfirm').open"),'「やめる」で確認が閉じません');
  await new Promise(resolve=>setTimeout(resolve,500));
  assert(!logs.includes('reset'),'「やめる」なのにリセットを送りました');
  await evaluate("document.querySelector('#settingsBtn').click()");
  await evaluate("document.querySelector('#resetAllBtn').click()");
  await until(()=>evaluate("document.querySelector('#resetConfirm').open"),'リセットの確認が開きません');
  await evaluate("document.querySelector('#resetConfirmBtn').click()");
  await until(()=>logs.includes('reset'),'確かめてもリセットがホストへ届きません');
  assert(await evaluate("!document.querySelector('#resetConfirm').open"),'リセットの後も確認が開いたままです');
  monitor.close();
  console.log('WebView2のPCアプリから、確認してリセットできることを確認');
  await evaluate("document.querySelector('#settingsBtn').click()");
  await until(()=>evaluate("document.querySelector('#settings').open"),'デスクトップの設定が開き直せません');
  await evaluate("document.querySelector('#overlayDetails').open=true;document.querySelector('#desktopOverlaySetting').click()");
  await until(async()=> (await targets()).find(target=>target.url.startsWith(hostOrigin+'/overlay')),
    'オーバーレイが開きません');
  await until(()=>evaluate("window.recooplayDesktop?.overlay===true"),'オーバーレイの表示が確定しません');
  powershell('-File',closeScript,'-ProcessId',String(app.pid));
  const exit=await until(()=>exited,'オーバーレイ表示中にTauriが終了しません');
  assert.equal(exit.code,0);
  await until(async()=>{
    try {await fetch(hostOrigin+'/api/info',{signal:AbortSignal.timeout(1000)});return false;}
    catch(error){return error.cause?.code==='ECONNREFUSED';}
  },'Tauri終了後もホストが待ち受けています');
  assert.equal(powershell('-Command',`[bool](Get-Process -Id ${hostId} -ErrorAction SilentlyContinue)`),'False',
    'Tauri終了後もホストプロセスが残っています');
  console.log('合格: WebView2参加画面、オーバーレイ、アプリとホストの終了');
} finally {
  socket?.close();
  if(!exited&&app.pid)app.kill();
}
