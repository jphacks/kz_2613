// 静的画面 (apps/web-static/*.html) のインラインスクリプトが構文として読めるかを確認する (ブラウザでの表示確認の代わりではない)
//   node scripts/sim/check-static-pages.mjs
import fs from 'node:fs';
for (const f of (process.argv.length > 2 ? process.argv.slice(2) : ["index.html", "host.html", "game.html"].map((f) => new URL(`../../apps/web-static/${f}`, import.meta.url)))) {
  const html = fs.readFileSync(f, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const js of scripts) new Function(js);
  console.log(`${f}: ${scripts.length} script(s) parse OK`);
}
