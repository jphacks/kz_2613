// 撮影サイズ・画面網羅・操作領域と採寸アンカーを検証する。見た目の採点や実機試験の代わりにはしない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=path.join(root,'artifacts/improved-ui/final');
const metrics=JSON.parse(fs.readFileSync(path.join(dir,'metrics.json'),'utf8'));
const pc=['join','game','roles','preparing','ready','coop','paused','target','emergency','settings','connection'];
const phone=['host','host-preparing','host-paused','wait-p2','wait-p3','paused-p2','move','look','action','generated-p1','generated-p2','generated-p3'];
const required=[...['1920','1280'].flatMap(w=>pc.map(s=>`pc-${w}-${s}`)),...['320x568','360x640','360x780','390x844','402x874','430x932'].flatMap(s=>phone.map(v=>`phone-${s}-${v}`)),...['320x568','402x874'].flatMap(s=>['connecting','full','version','token'].map(v=>`phone-${s}-${v}`)),'phone-874x402-rotate','phone-402x874-diagnostics'];
assert.equal(new Set(metrics.map(m=>m.name)).size,metrics.length,'撮影名が重複');
for(const name of required)assert(metrics.some(m=>m.name===name),`撮影不足: ${name}`);
function jpegSize(bytes){
  assert.equal(bytes.readUInt16BE(0),0xffd8,'JPEGの開始マーカー');
  let p=2;
  while(p<bytes.length){
    assert.equal(bytes[p++],0xff,'JPEGのセグメント');
    while(bytes[p]===0xff)p++;
    const marker=bytes[p++],length=bytes.readUInt16BE(p);
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(p+5),height:bytes.readUInt16BE(p+3)};
    p+=length;
  }
  throw Error('JPEGの寸法がありません');
}
for(const m of metrics){
  const size=jpegSize(fs.readFileSync(path.join(dir,m.name+'.jpg')));
  assert.equal(size.width,m.width,`JPEG幅: ${m.name}`);
  assert.equal(size.height,m.height,`JPEG高さ: ${m.name}`);
  assert(m.docWidth<=m.width&&m.docHeight<=m.height,`ページがはみ出す: ${m.name}`);
  if(!m.name.startsWith('phone-'))continue;
  for(const e of m.items.filter(e=>e.id.split(' ').some(c=>['key','cmd','wait-continue','startBtn','openGameBtn','endBtn','genPause'].includes(c)))){
    assert(e.width>=43.9&&e.height>=43.9,`44px未満: ${m.name} ${e.id}`);
    assert(e.x>=-1&&e.y>=-1&&e.x+e.width<=m.width+1&&e.y+e.height<=m.height+1,`操作が画面外: ${m.name} ${e.id}`);
  }
}
const anchors=[['pc-1920-join','stateBanner',[700,49,1034,269]],['pc-1920-game','games',[611,41,1274,982]],['pc-1920-roles','role-band',[616,52,1274,244]],['pc-1920-ready','stateBanner',[687,61,1102,269]],['phone-402x874-wait-p2','card wait-card',[45,286,312,402]]];
for(const [screen,id,expected]of anchors){
  const e=metrics.find(m=>m.name===screen)?.items.find(e=>e.id===id);assert(e,`採寸不足: ${screen} ${id}`);
  [e.x,e.y,e.width,e.height].forEach((v,i)=>assert(Math.abs(v-expected[i])<=2,`採寸差: ${screen} ${id} ${v} / ${expected[i]}`));
}
console.log(`合格: ${required.length}画面のJPEG寸法・網羅、ページ内表示、スマホ44pxと画面内操作、共通アンカー5箇所（視覚採点・実機互換性は対象外）`);
