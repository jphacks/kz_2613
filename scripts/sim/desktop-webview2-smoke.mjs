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
const browserArguments = '--remote-debugging-port=' + debugPort + ' --no-proxy-server --disable-background-networking';
// CIのランナー（WebView2 156）では、環境変数の起動オプションが反映されなかった（保存先の環境変数は反映された）。
// 使い捨てのランナーでだけ、WebView2がexe名ごとに読むレジストリにも同じ起動オプションを書き、試験の最後に消す。
// 開発PCのレジストリは変えない。
const policyKey = 'HKCU\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments';
const usePolicy = process.env.GITHUB_ACTIONS === 'true';
if (usePolicy) execFileSync('reg.exe', ['add', policyKey, '/v', 'recooplay-desktop.exe', '/t', 'REG_SZ', '/d', browserArguments, '/f'], {windowsHide:true, stdio:'ignore'});
const app = spawn(path.join(root,'recooplay-desktop.exe'), [], {
  cwd: root, windowsHide: true, stdio: 'ignore',
  env: {...process.env, PORT:String(hostPort), RECOOPLAY_ROOT:root,
    RECOOPLAY_HOST_EXE:path.join(root,'recooplay-host.exe'),
    RECOOPLAY_DRY_RUN:'1', RECOOPLAY_RUNTIME_MEASURE:'1', RECOOPLAY_NO_CONFIG:'1',
    RECOOPLAY_FAKE_TARGET:'1', RECOOPLAY_LOG_DIR:temp,
    WEBVIEW2_USER_DATA_FOLDER:path.join(temp,'webview2'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:browserArguments},
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
function call(method,params={}) {
  return new Promise((resolve,reject) => {
    const id=++sequence;
    const timer=setTimeout(()=>{socket.removeEventListener('message',receive);reject(Error('CDP応答なし'));},3000);
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
  await until(()=>evaluate("document.body.dataset.view==='join' && !!document.querySelector('#nextBtn')"),
    '参加画面のReact描画が完了しません');
  // 待ち受けのソケットは、Windowsの一覧（Get-NetTCPConnection・netstat）に出ないことがあるため、
  // PCアプリが起動した子プロセスとしてホストを特定する
  const hostId=Number(powershell('-Command',
    `@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${app.pid} and Name='recooplay-host.exe'").ProcessId`));
  assert(Number.isSafeInteger(hostId)&&hostId>0,'ホストのプロセスを特定できません');
  assert.equal(powershell('-Command',`(Get-Process -Id ${hostId} -ErrorAction Stop).ProcessName`),'recooplay-host');
  await evaluate("document.querySelector('#settingsBtn').click()");
  await until(()=>evaluate("document.querySelector('#settings').open && !document.querySelector('#desktopOverlaySetting')?.disabled && !!document.querySelector('#desktopOverlaySetting')"),
    'デスクトップの設定が開きません');
  await evaluate("document.querySelector('#overlayDetails').open=true;document.querySelector('#desktopOverlaySetting').click()");
  await until(async()=> (await targets()).find(target=>target.url.startsWith(hostOrigin+'/overlay')),
    'オーバーレイが開きません');
  await until(()=>evaluate("window.recooplayDesktop?.overlay===true"),'オーバーレイの表示が確定しません');
  const closeScript=fileURLToPath(new URL('./close-desktop-window.ps1',import.meta.url));
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
  if(usePolicy)try{execFileSync('reg.exe',['delete',policyKey,'/v','recooplay-desktop.exe','/f'],{windowsHide:true,stdio:'ignore'});}catch{}
}
