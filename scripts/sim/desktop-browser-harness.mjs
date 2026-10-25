// ブラウザでPC/P1を操作するための、OS入力をしないRust検証環境。
// 起動: node scripts/sim/desktop-browser-harness.mjs --bin <ホスト実行ファイル>
// stdin: add (P2/P3の模擬端末を追加)、target on/off、app focus/blur、stop、quit。
// 実端末・Minecraft・Tauriの合格根拠には使わない。トークンと実IPは出力しない。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const i=process.argv.indexOf('--bin');
if(i<0)throw Error('--binで検証するホストを指定してください');
const port=Number(process.env.PORT||18084);
const host=spawn(process.argv[i+1],[],{env:{...process.env,PORT:String(port),RECOOPLAY_ROOT:root,RECOOPLAY_DRY_RUN:'1',RECOOPLAY_NO_CONFIG:'1',RECOOPLAY_FAKE_TARGET:'1',RECOOPLAY_DESKTOP:'1',RECOOPLAY_STDIN_CONTROL:'1',RECOOPLAY_LOG_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-browser-'))},stdio:['pipe','ignore','inherit']});
const clients=[];
async function add(){
  if(clients.length)return;
  for(let n=2;n<=3;n++)await new Promise((resolve,reject)=>{
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);clients.push(ws);
    const timer=setTimeout(()=>reject(Error('模擬端末が接続できません')),5000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'hello',protocolVersion:4,clientId:`fidelity-p${n}`,ua:'表示検証用の模擬端末',nextIseq:1}));
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='welcome'){clearTimeout(timer);console.log(`模擬端末が接続: ${m.slot}`);resolve();}};
    ws.onerror=reject;
  });
}
const ping=setInterval(()=>{for(const ws of clients)if(ws.readyState===1)ws.send(JSON.stringify({type:'ping',t:0}));},1000);
const lines=readline.createInterface({input:process.stdin});
lines.on('line',async line=>{
  const cmd=line.trim();
  if(cmd==='add'){try{await add();}catch(e){console.error(e.message);}}
  else if(['target on','target off','app focus','app blur','stop'].includes(cmd)){host.stdin.write(cmd+'\n');console.log('検証操作: '+cmd);}
  else if(cmd==='quit'){for(const ws of clients)ws.close();clearInterval(ping);host.stdin.end('quit\n');lines.close();}
});
host.on('error',e=>{console.error(e.message);process.exitCode=1;clearInterval(ping);lines.close();});
host.on('exit',code=>{clearInterval(ping);lines.close();console.log(`検証ホスト終了: ${code}`);process.exit(code||0);});
console.log(`OS入力なし・ブラウザ検証: http://127.0.0.1:${port}/app`);
