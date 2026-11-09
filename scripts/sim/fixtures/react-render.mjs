// 実製品TSXを既存Viteで変換し、ReactのHTML出力を検査する。
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {transformWithOxc} from '../../../apps/web/node_modules/vite/dist/node/index.js';
const requireWeb=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
export const {createElement}=await import(pathToFileURL(requireWeb.resolve('react')).href);
export const {renderToStaticMarkup}=await import(pathToFileURL(requireWeb.resolve('react-dom/server')).href);
export async function loadComponent(sourceUrl){
  let {code}=await transformWithOxc(fs.readFileSync(sourceUrl,'utf8'),fileURLToPath(sourceUrl),{jsx:{runtime:'automatic'}});
  code=code.replace(/from (["'])([^"']+)\1/g,(_,quote,spec)=>`from ${JSON.stringify(spec.startsWith('.')?new URL(/\.tsx?$/.test(spec)?spec:spec+'.ts',sourceUrl).href:pathToFileURL(requireWeb.resolve(spec)).href)}`);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
