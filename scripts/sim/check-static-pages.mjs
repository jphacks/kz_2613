// ビルド済み5画面とローカル資産の存在・構文を検査する。実機の代わりにはしない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('apps/web/dist');
for(const page of ['phone','pc','overlay','diagnostics','pseudo-game']){
  const html=fs.readFileSync(path.join(root,page,'index.html'),'utf8');
  assert.match(html,/<title>[^<]+<\/title>/);
  assert.match(html,/id="root"/);
  for(const [,asset]of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g))if(!['/','/app','/host','/game','/overlay'].includes(asset))assert(fs.existsSync(path.join(root,asset)),`${page}: ${asset}`);
  for(const [,body]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(body.trim())new Function(body);
}
for(const name of fs.readdirSync(path.join(root,'assets')).filter(n=>n.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(root,'assets',name)],{stdio:'pipe'});
const colors=fs.readFileSync('apps/web/src/styles/colors.css','utf8');
const game=fs.readFileSync(fs.existsSync('apps/web/src/pseudo-game/runtime.ts')?'apps/web/src/pseudo-game/runtime.ts':'apps/web/src/pseudo-game/index.html','utf8');
for(const [slot,name]of [['P1','blue'],['P2','green'],['P3','purple'],['P4','red']]){
  const hex=colors.match(new RegExp(`--color-character-${name}: (#[0-9A-Fa-f]{6})`))?.[1];
  assert(hex&&game.includes(`${slot}: '${hex}'`),`${slot}: 担当色を維持`);
}
const app=['PcApp.tsx','parts.tsx'].map(n=>fs.readFileSync(`apps/web/src/pc/${n}`,'utf8')).join('\n');
for(const word of ['Windows 11 x64','WebView2','Visual C++','2〜4台','Ctrl+Alt+F12','未検証'])assert(app.includes(word),`動作環境: ${word}`);
// フォントに頼る記号・絵文字を、製品の画面に出さない (#515)。アイコンは shared/icons.ts の SVG。
// 疑似ゲーム画面 (開発用) と、コメントの中、文中の「→」は対象外
const GLYPHS=/[▲▼◀▶⋯↶✦✧✥●↔⚠↗↑↓←]/u;
const sourceFiles=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='pseudo-game'?[]:sourceFiles(path.join(dir,e.name))):/\.(tsx?|css)$/.test(e.name)?[path.join(dir,e.name)]:[]);
for(const file of sourceFiles('apps/web/src')){
  const code=fs.readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').split('\n').map(line=>file.endsWith('.css')?line:line.replace(/(^|[^:])\/\/.*$/,'$1')).join('\n');
  const hit=code.match(GLYPHS);
  assert(!hit,`${file}: フォントの記号「${hit?.[0]}」を SVG のアイコンにする (#515)`);
}
console.log('合格: 5画面・ビルド済みJS構文・ローカル資産・担当色・動作環境の案内・フォントの記号なし');
