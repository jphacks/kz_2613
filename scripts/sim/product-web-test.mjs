// 参照版の試験を残したまま、製品TSの実モジュールへ同じ回帰試験を適用する。
import {spawnSync} from 'node:child_process';
const suites=['input-owners','phone-session','protocol-boundary','phone-lifecycle','ui-input','app-view','phone-skin','view-transition','product-lifetime','pc-boundary','product-module-graph','telemetry-publisher'];
for(const suite of suites){
  const result=spawnSync(process.execPath,['--experimental-strip-types',`scripts/sim/${suite}-test.mjs`],{stdio:'inherit',windowsHide:true,env:{...process.env,RECOOPLAY_TEST_TS:'1'}});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('合格: 製品TypeScriptの入力・接続・境界・表示・破棄・依存グラフ');
