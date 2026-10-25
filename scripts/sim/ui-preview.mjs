// 表示専用のローカル検証器。Rustの認可・実入力の合格根拠には使わない。
// npm ci --prefix apps/node-ref 後: node scripts/sim/ui-preview.mjs
// http://127.0.0.1:18082/ を開く。終了はCtrl+C。OS入力は一切行わない。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from '../../apps/node-ref/node_modules/ws/wrapper.mjs';
const root=fileURLToPath(new URL('../../apps/web-static/',import.meta.url));
const port=Number(process.env.UI_PREVIEW_PORT || 18082);
const generatedFixture=JSON.parse(await fs.readFile(new URL('./fixtures/profiles/test-pseudo.json',import.meta.url),'utf8'));
const sizes=['320×568','360×640','360×780','390×844','402×874','430×932','874×402','1280×720','1920×1080'];
const shell=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Re:Cooplay 表示検証</title>
<style>body{margin:16px;font-family:system-ui}label{margin-right:16px}iframe{display:block;border:1px solid;margin-top:16px}p{max-width:80ch}</style>
<h1>表示だけの検証（OS入力なし）</h1><p>配色・配置・レスポンシブ・障害表示を確認します。接続と状態は模擬データです。Rustの認可・Minecraftの安全性・実機の証拠には使いません。</p>
<label>表示<select id="page"><option value="phone">スマホ</option><option value="pc">PC</option></select></label>
<label>サイズ<select id="size">${sizes.map(s=>`<option ${s==='402×874'?'selected':''}>${s}</option>`).join('')}</select></label>
<label>担当<select id="slot">${['P1','P2','P3'].map(s=>`<option>${s}</option>`).join('')}</select></label>
<label>状態<select id="phase">${['lobby','preparing','coop','paused','full','bad_token','protocol_version'].map(s=>`<option>${s}</option>`).join('')}</select></label>
<iframe id="preview" title="表示確認"></iframe><script>
const frame=document.getElementById('preview');
function update(){const [width,height]=document.getElementById('size').value.split('×');frame.style.width=width+'px';frame.style.height=height+'px';const params=new URLSearchParams({slot:document.getElementById('slot').value,phase:document.getElementById('phase').value});frame.src=(document.getElementById('page').value==='pc'?'/app':'/phone')+'?'+params;}
document.querySelectorAll('select').forEach(s=>s.addEventListener('change',update));update();
</script></html>`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if (url.pathname==='/') {res.setHeader('Content-Type',types['.html']);return res.end(shell);}
  if (url.pathname==='/api/info') {
    const scenario=new URL(req.headers.referer || '/',`http://127.0.0.1:${port}`).searchParams.get('qr');
    if(scenario==='error'){res.statusCode=503;return res.end();}
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({urls:scenario==='missing'?[]:[{url:`http://127.0.0.1:${port}/phone`,ip:'127.0.0.1',address:'127.0.0.1',name:'表示検証',qr:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" fill="white" stroke="black"/><text x="50" y="54" text-anchor="middle" font-size="10">表示用・QRなし</text></svg>'}]}));
  }
  const relative=({ '/phone':'index.html','/app':'app.html' })[url.pathname] || url.pathname.slice(1);
  const resolved=path.resolve(root,relative);
  if (!resolved.startsWith(path.resolve(root)+path.sep)) {res.statusCode=403;return res.end();}
  try {
    let content=await fs.readFile(resolved);
    if (relative==='scripts/controller.js' || relative==='scripts/desktop.js') {
      // 表示検証サーバーに限りクエリをWSへ渡す。製品の認可やソースは変更しない。
      content=Buffer.from(content.toString().replace('ws://${location.host}/ws','ws://${location.host}/ws${location.search}'));
    }
    res.setHeader('Content-Type',types[path.extname(relative)] || 'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(content);
  } catch {res.statusCode=404;res.end();}
});
const wss=new WebSocketServer({server});
wss.on('connection',(ws,req)=>{
  const params=new URL(req.url,`http://127.0.0.1:${port}`).searchParams;
  const slot=['P1','P2','P3'].includes(params.get('slot'))?params.get('slot'):'P1';let phase=params.get('phase')||'lobby';let epoch=1;
  const scenario=params.get('scenario')||'';
  const count=Math.max(0,Math.min(3,Number(params.get('count')??3)));
  const connected=['P1','P2','P3'].slice(0,count);
  let mode=scenario==='off'||scenario==='emergency'?'off':'on';
  const active=()=>mode==='on'&&!['blocked','target'].includes(scenario);
  const canReady=()=>phase==='preparing'&&active()&&count===3;
  const send=m=>{if(ws.readyState===1)ws.send(JSON.stringify(m));};
  const game=()=>({...(scenario.startsWith('generated')?{title:'pseudo-game',profile:{...generatedFixture,status:'reviewed',controllerSupported:true,actions:generatedFixture.actions.map(a=>({...a,type:a.type})),assignment:{P1:['left','action','zoom','aim'],P2:['right'],P3:['jump']}},assigned:{P1:['left','action','zoom','aim'],P2:['right'],P3:['jump']},keys:{actions:Object.fromEntries(generatedFixture.actions.map(a=>[a.id,{label:{KEY_A:'A',KEY_D:'D',SPACE:'Space',KEY_X:'X'}[a.default]||a.default}]))}}:{}),phase,epoch,required:3,connected,title:scenario.startsWith('generated')?'pseudo-game':'minecraft-java',hostReady:phase==='coop'||phase==='paused',canPrepare:phase==='lobby'&&count>0,canReady:canReady(),canStart:canReady(),canResume:phase==='paused'&&active()&&count===3,readyReasons:count<3?['3人全員の接続を待っています']:!active()?['入力を有効にし、対象ゲームを前面にしてください']:[],reason:scenario==='emergency'?'emergency stop':scenario==='lost'?'P3 disconnected':phase==='paused'?'host pause':'',autoResume:false,inputActive:active(),inputTarget:false,remoteRoute:phase==='coop'?'none':'app',prepareStatus:'表示検証：実ゲームは開いていません'});
  const state=()=>({type:'state',game:game(),slots:['P1','P2','P3'].map((name,i)=>({name,assigned:i<count||scenario==='lost',connected:i<count,ua:name==='P2'?'iPhone':'Android'})),inject:{mode,active:active(),available:true,emergencyHotkey:'Ctrl+Alt+F12',target:{ok:active()}}});
  // PCはstate、スマホはgameを描画する。表示検証でも両方の契約を送る。
  const push=()=>{send(state());send({type:'game',game:game()});};
  let monitor=false;
  const periodic=setInterval(()=>{if(monitor)push();},1000);
  ws.on('close',()=>clearInterval(periodic));
  ws.on('message',raw=>{
    const m=JSON.parse(String(raw));
    if(m.type==='hello') {
      if(phase==='full')return send({type:'full'});
      if(phase==='bad_token'||phase==='protocol_version')return send({type:'error',code:phase});
      send({type:'welcome',slot,isHost:slot==='P1',role:{P1:'移動・ホスト',P2:'視点',P3:'アクション'}[slot],token:'表示検証用'});push();
    } else if(m.type==='monitor') {monitor=true;push();if(scenario==='disconnected')ws.close(1011);}
    else if(m.type==='ping')send({type:'pong',t:m.t});
    else if(m.type==='input')send({type:'ack',iseq:m.iseq,via:'ws'});
    else if(m.type==='prepare'&&game().canPrepare){phase='preparing';epoch++;push();}
    else if(m.type==='inject_mode'&&['off','on'].includes(m.mode)){mode=m.mode;epoch++;push();}
    else if(m.type==='open_game')push();
    else if(m.type==='command') {
      if(m.cmd==='PAUSE')phase='paused';if(m.cmd==='READY'||m.cmd==='RESUME')phase='coop';if(m.cmd==='PREPARE')phase='preparing';if(m.cmd==='END')phase='lobby';epoch++;push();
    } else if(m.type==='release_inputs'){epoch++;push();}
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`表示専用・OS入力なし: http://127.0.0.1:${port}/`));
