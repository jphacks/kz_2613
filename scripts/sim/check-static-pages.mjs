// 静的画面 (apps/web-static/*.html) のインラインスクリプトが構文として読めるかを確認する (ブラウザでの表示確認の代わりではない)
//   node scripts/sim/check-static-pages.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../apps/web-static/', import.meta.url);
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => new URL(f, dir));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-pages-'));
let failed = 0;
function checkModule(file) {
  try { execFileSync(process.execPath,['--check',fileURLToPath(file)],{stdio:'pipe'}); }
  catch (e) { failed++; console.log(`FAIL ${file}: ${String(e.stderr || e.message).split('\n').slice(0,3).join(' / ')}`); }
}
// 外部化した通信・入力・表示モジュールも対象に含める。
for (const entry of fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('.js'))) {
  checkModule(new URL(entry.replaceAll('\\','/'),dir));
  const source = fs.readFileSync(new URL(entry.replaceAll('\\','/'),dir),'utf8');
  for (const [,relative] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(new URL(relative,new URL(entry.replaceAll('\\','/'),dir)))) { failed++; console.log(`FAIL モジュールがありません: ${entry} → ${relative}`); }
  }
}
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  for (const [,asset] of html.matchAll(/(?:src|href)="(\/(?:styles|scripts|assets)\/[^"?#]+)"/g)) {
    if (!fs.existsSync(new URL(asset.slice(1),dir))) { failed++; console.log(`FAIL 素材がありません: ${asset}`); }
  }
  const scripts = [...html.matchAll(/<script( type="module")?>([\s\S]*?)<\/script>/g)];
  scripts.forEach(([, mod, js], i) => {
    // モジュールは import を含むので node --check で、通常のスクリプトは関数本体として構文を確認する
    try {
      if (mod) {
        const file = path.join(tmp, `${path.basename(String(f))}.${i}.mjs`);
        fs.writeFileSync(file, js);
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      } else new Function(js);
    } catch (e) {
      failed++;
      console.log(`FAIL ${f} script ${i}: ${String(e.stderr || e.message).split('\n').slice(0, 5).join(' / ')}`);
    }
  });
  console.log(`${path.basename(String(f))}: ${scripts.length} script(s)`);
}
console.log(failed ? `${failed} 件の構文エラー` : 'すべて構文OK');
process.exit(failed ? 1 : 0);
