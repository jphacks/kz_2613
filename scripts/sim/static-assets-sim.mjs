// Rustの実際の静的配信・MIME・ローカル依存をOS入力なしで確認する。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=process.argv.indexOf('--bin');
const bin=option<0?path.join(root,'apps/host-rs/target/release/recooplay-host.exe'):process.argv[option+1];
let port,output='',launchError;
const child=spawn(bin,[],{env:{...process.env,PORT:'0',RECOOPLAY_ROOT:root,RECOOPLAY_DRY_RUN:'1',RECOOPLAY_NO_CONFIG:'1',RECOOPLAY_RUNTIME_MEASURE:'1',RECOOPLAY_STDIN_CONTROL:'1',RECOOPLAY_LOG_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-assets-'))},stdio:['pipe','pipe','ignore'],windowsHide:true});
child.on('error',error=>{launchError=error.code});
child.stdin.on('error',()=>{});
child.stdout.on('data',chunk=>{output=(output+chunk).slice(-8192);const match=output.match(/server_start \{"port":([1-9]\d{0,4})\}/);if(match)port=Number(match[1]);});
const closed=new Promise(resolve=>{child.once('close',resolve);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
try {
  let ready=false;
  for(let i=0;i<100;i++){if(launchError||child.exitCode!==null)break;if(port){try{if((await fetch(`http://127.0.0.1:${port}/api/info`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}} await sleep(100);}
  assert(ready,'ホストが起動しない');
  const base=`http://127.0.0.1:${port}`;
  for(const [route,entry] of [['/','phone'],['/app','pc'],['/overlay','overlay'],['/host','diagnostics'],['/game','pseudo-game']]){
    const response=await fetch(base+route);assert.equal(response.status,200,route);
    const html=await response.text();
    assert.equal(html,fs.readFileSync(path.join(root,'apps/web/dist',entry,'index.html'),'utf8'));
    for(const [,asset]of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))assert.equal((await fetch(base+asset)).status,200,asset);
  }
  for(const route of ['/index.html','/app.html','/phone-react.html','/app-react.html','/scripts/controller.js','/scripts/desktop.js'])assert.equal((await fetch(base+route)).status,404,`旧パス: ${route}`);
  const publicDir=path.join(root,'apps/web/dist');let count=0,bytes=0;
  for(const rel of fs.readdirSync(publicDir,{recursive:true}).filter(p=>types[path.extname(p)])){
    const response=await fetch(base+'/'+rel.replaceAll('\\','/'));
    assert.equal(response.status,200,rel);assert(response.headers.get('content-type')?.startsWith(types[path.extname(rel)]),`MIME: ${rel}`);
    assert.equal(response.headers.get('cache-control'),'no-store',`キャッシュ: ${rel}`);
    const body=Buffer.from(await response.arrayBuffer());assert(body.length>0,rel);bytes+=body.length;count++;
    if(path.extname(rel)==='.png')assert.equal(body.subarray(1,4).toString(),'PNG',rel);
    if(['.html','.js','.css'].includes(path.extname(rel))) {
      const text=body.toString();
      if(rel.endsWith('.html')||rel.endsWith('.css'))assert(!/(?:src|href)=["']https?:\/\/|@import\s+(?:url\()?['"]https?:|url\(['"]?https?:/i.test(text),`外部素材依存: ${rel}`);
      if(rel.endsWith('.css'))for(const [,url]of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))assert(fs.existsSync(url.startsWith('/')?path.join(publicDir,url):path.resolve(publicDir,path.dirname(rel),url)),`背景がない: ${rel}→${url}`);
    }
  }
  console.log(`合格: ${count}ファイルのHTTP・MIME・キャッシュ・ローカル素材 (${bytes} bytes)`);
}finally{
  if(child.exitCode===null&&!launchError)child.stdin.end('quit\n');
  let code=await Promise.race([closed,sleep(3000).then(()=>null)]);
  if(code===null){child.kill();await closed;throw Error('静的配信試験ホストの正常終了を確認できません');}
  assert.equal(code,0,'静的配信試験ホストが正常終了する');
}
