// 公開カタログと同梱定義をオフラインで照合する。実ゲームの互換性試験ではない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/data/top500-games.json'),'utf8'));
const files=fs.readdirSync(path.join(root,'apps/game-profiles')).filter(f=>f.endsWith('.json'));
assert.equal(catalog.total,catalog.games.length); assert.equal(files.length,catalog.total);
const ids=new Set(),matches=new Set(),counts={};
for(const game of catalog.games){
  assert(!ids.has(game.id)); ids.add(game.id);
  const p=JSON.parse(fs.readFileSync(path.join(root,'apps/game-profiles',game.id+'.json'),'utf8'));
  assert.equal(p.id,game.id); assert.equal(p.name,game.name);
  assert.equal(p.verification.status,game.status); assert.equal(p.suitability,game.suitability);
  counts[game.status]=(counts[game.status]||0)+1;
  for(const id of p.match.ids){ assert(!matches.has(id),`一致条件の重複: ${id}`); matches.add(id); }
  if(game.appid) assert(p.match.steamAppIds.includes(game.appid));
  if(game.status==='template') assert(p.verification.sources.some(s=>s.includes('ジャンルの型')));
}
console.log(`合格: ${catalog.total}定義の一覧・識別条件・検証状態・出典の照合 ${JSON.stringify(counts)}`);
