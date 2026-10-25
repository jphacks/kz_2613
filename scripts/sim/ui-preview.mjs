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
  if (url.pathname==='/api/info') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({urls:[{url:`http://127.0.0.1:${port}/phone`,ip:'127.0.0.1',name:'表示検証',qr:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" fill="white" stroke="black"/><text x="50" y="54" text-anchor="middle" font-size="12">表示用・QRなし</text></svg>'}]}));}
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
  const send=m=>{if(ws.readyState===1)ws.send(JSON.stringify(m));};
  const game=()=>({phase,epoch,required:3,connected:['P1','P2','P3'],title:'minecraft-java',hostReady:phase==='coop'||phase==='paused',canPrepare:phase==='lobby',canReady:phase==='preparing',canStart:phase==='preparing',canResume:phase==='paused',readyReasons:[],autoResume:false,inputActive:true,inputTarget:false,remoteRoute:phase==='coop'?'none':'app',prepareStatus:'表示検証：実ゲームは開いていません'});
  const state=()=>({type:'state',game:game(),slots:['P1','P2','P3'].map(name=>({name,assigned:true,connected:true,ua:name==='P2'?'iPhone':'Android'})),inject:{mode:'on',active:true,available:true,emergencyHotkey:'Ctrl+Alt+F12',target:{ok:true}}});
  const push=()=>send({type:'game',game:game()});
  ws.on('message',raw=>{
    const m=JSON.parse(String(raw));
    if(m.type==='hello') {
      if(phase==='full')return send({type:'full'});
      if(phase==='bad_token'||phase==='protocol_version')return send({type:'error',code:phase});
      send({type:'welcome',slot,isHost:slot==='P1',role:{P1:'移動・ホスト',P2:'視点',P3:'アクション'}[slot],token:'表示検証用'});push();
    } else if(m.type==='monitor') {send(state());push();}
    else if(m.type==='ping')send({type:'pong',t:m.t});
    else if(m.type==='input')send({type:'ack',iseq:m.iseq,via:'ws'});
    else if(m.type==='command') {
      if(m.cmd==='PAUSE')phase='paused';if(m.cmd==='READY'||m.cmd==='RESUME')phase='coop';if(m.cmd==='PREPARE')phase='preparing';if(m.cmd==='END')phase='lobby';epoch++;push();
    } else if(m.type==='release_inputs'){epoch++;push();}
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`表示専用・OS入力なし: http://127.0.0.1:${port}/`));
