// 実製品TSXを既存Viteで変換し、ReactのHTML出力を検査する。
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {transformWithOxc} from '../../../apps/web/node_modules/vite/dist/node/index.js';
const requireWeb=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
export const {createElement}=await import(pathToFileURL(requireWeb.resolve('react')).href);
export const {renderToStaticMarkup}=await import(pathToFileURL(requireWeb.resolve('react-dom/server')).href);
async function componentUrl(sourceUrl){
  let {code}=await transformWithOxc(fs.readFileSync(sourceUrl,'utf8'),fileURLToPath(sourceUrl),{jsx:{runtime:'automatic'}});
  // TSXから読み込むTSX (拡張子なしで.tsxがあるものを含む) は、同じ変換をしてから読み込む
  const nested=new Map();
  for(const [,,spec] of code.matchAll(/from (["'])([^"']+)\1/g)){
    if(!spec.startsWith('.')||nested.has(spec))continue;
    const url=new URL(/\.tsx?$/.test(spec)?spec:spec+'.tsx',sourceUrl);
    if(url.pathname.endsWith('.tsx')&&fs.existsSync(url))nested.set(spec,await componentUrl(url));
  }
  code=code.replace(/from (["'])([^"']+)\1/g,(_,quote,spec)=>`from ${JSON.stringify(nested.get(spec)??(spec.startsWith('.')?new URL(/\.tsx?$/.test(spec)?spec:spec+'.ts',sourceUrl).href:pathToFileURL(requireWeb.resolve(spec)).href))}`);
  return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
export async function loadComponent(sourceUrl){
  return import(await componentUrl(sourceUrl));
}
