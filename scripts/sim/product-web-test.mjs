// 製品TSの実モジュールへ入力・接続・表示・破棄の回帰試験を適用する。
import {spawnSync} from 'node:child_process';
const suites=['input-owners','phone-session','protocol-boundary','phone-lifecycle','ui-input','app-view','phone-skin','view-transition','product-lifetime','pc-boundary','product-module-graph','telemetry-publisher','phone-view','controller-diagnostics','monitor','diagnostics','pseudo-game','burst-stats','phone-warning'];
for(const suite of suites){
  const result=spawnSync(process.execPath,['--experimental-strip-types',`scripts/sim/${suite}-test.mjs`],{stdio:'inherit',windowsHide:true,env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('合格: 製品TypeScriptの入力・接続・境界・表示・破棄・依存グラフ');
