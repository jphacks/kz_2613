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
const port=22000+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
const child=spawn(bin,[],{env:{...process.env,PORT:String(port),RECOOPLAY_ROOT:root,RECOOPLAY_DRY_RUN:'1',RECOOPLAY_NO_CONFIG:'1',RECOOPLAY_LOG_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-assets-'))},stdio:'ignore'});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
try {
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/info')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert(ready,'ホストが起動しない');
  const publicDir=path.join(root,'apps/web-static');let count=0,bytes=0;
  for(const rel of fs.readdirSync(publicDir,{recursive:true}).filter(p=>types[path.extname(p)])){
    const response=await fetch(base+'/'+rel.replaceAll('\\','/'));
    assert.equal(response.status,200,rel);assert(response.headers.get('content-type')?.startsWith(types[path.extname(rel)]),`MIME: ${rel}`);
    assert.equal(response.headers.get('cache-control'),'no-store',`キャッシュ: ${rel}`);
    const body=Buffer.from(await response.arrayBuffer());assert(body.length>0,rel);bytes+=body.length;count++;
    if(path.extname(rel)==='.png')assert.equal(body.subarray(1,4).toString(),'PNG',rel);
    if(['.html','.js','.css'].includes(path.extname(rel))) {
      const text=body.toString();
      if(rel==='index.html'||rel==='app.html'||rel.endsWith('.css'))assert(!/(?:src|href)=["']https?:\/\/|@import\s+(?:url\()?['"]https?:|url\(['"]?https?:/i.test(text),`外部素材依存: ${rel}`);
      if(rel.endsWith('.css'))for(const [,url]of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))assert(fs.existsSync(path.resolve(publicDir,path.dirname(rel),url)),`背景がない: ${rel}→${url}`);
    }
  }
  console.log(`合格: ${count}ファイルのHTTP・MIME・キャッシュ・ローカル素材 (${bytes} bytes)`);
}finally{child.kill();}
