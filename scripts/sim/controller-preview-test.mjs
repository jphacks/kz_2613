// 実際のTSXを既存Viteで変換し、Reactで描く。プレビューに入力用属性を出さない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {transformWithOxc} from '../../apps/web/node_modules/vite/dist/node/index.js';
import {controllerLayout} from '../../apps/web/src/shared/controller-layout.ts';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const {createElement} = await import(pathToFileURL(requireWeb.resolve('react')).href);
const {renderToStaticMarkup} = await import(pathToFileURL(requireWeb.resolve('react-dom/server')).href);
const sourceUrl = new URL('../../apps/web/src/phone/Controller.tsx', import.meta.url);
let {code} = await transformWithOxc(fs.readFileSync(sourceUrl, 'utf8'), fileURLToPath(sourceUrl), {jsx:{runtime:'automatic'}});
code = code.replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
  const url = specifier.startsWith('.')
    ? new URL(specifier === '../shared/controller-layout' ? '../shared/controller-layout.ts' : specifier, sourceUrl).href
    : pathToFileURL(requireWeb.resolve(specifier)).href;
  return `from ${JSON.stringify(url)}`;
});
const {Controller} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const game = {profile:{id:'preview',name:'試験',actions:[
  {id:'forward',type:'button',group:'move'}, {id:'right',type:'button',group:'move'},
  {id:'jump',type:'button',group:'move'}, {id:'look',type:'mouseDelta',group:'look'},
  {id:'wheel',type:'wheel',group:'look'},
]},assigned:{P1:['forward','right','jump','look','wheel']},keys:{actions:{jump:{label:'Space'}}}};
const html = renderToStaticMarkup(createElement(Controller, {groups:controllerLayout(game,'P1')}));
assert.match(html, /inert=""/);
assert.match(html, /class="stick gen-stick"/);
assert.match(html, /class="look-pad"/);
assert.match(html, /Spaceキー/);
assert.match(html, /ホイール↑/);
assert.match(html, /ホイール↓/);
assert(!/data-ctl=|data-cmd=|id="(?:pad|sens|sensVal)"/.test(html), 'プレビューに実入力の探索属性や重複IDを出さない');
assert(!/disabled=""/.test(html), '無効化の既定スタイルでプレイ時の見た目を変えない');
if (process.argv.includes('--write-preview')) {
  const out = new URL('../../data/local/react-migration/', import.meta.url);
  fs.mkdirSync(out, {recursive:true});
  const styles = ['colors','tokens','shared','mobile','improved-mobile','phone-skins'].map(name =>
    `<link rel="stylesheet" href="${new URL(`../../apps/web/src/styles/${name}.css`, import.meta.url).href}">`).join('');
  fs.writeFileSync(new URL('controller-preview.html',out), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body data-view="v-gen"><main><section class="view show" id="v-gen"><div id="genControls">${html}</div></section></main></body></html>`);
}
console.log('合格: 共通React部品のプレビューはボタン・スティック・視点を描き、実入力へ接続しない');
