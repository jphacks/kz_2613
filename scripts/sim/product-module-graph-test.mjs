import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('apps/web/src');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const graph=new Map();
const config=JSON.parse(fs.readFileSync('apps/web/tsconfig.json','utf8'));
assert.equal(config.compilerOptions.strict,true);
assert.notEqual(config.compilerOptions.allowJs,true,'製品の型検査からJSを逃さない');
assert(!walk(root).some(file=>/\.[cm]?jsx?$/.test(file)),'ブラウザへ配るソースはTSだけにする');
const dependencies=JSON.parse(fs.readFileSync('apps/web/package.json','utf8')).dependencies;
for(const file of walk(root).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('.d.ts'))){
  const source=fs.readFileSync(file,'utf8');
  assert(!/@ts-(?:ignore|nocheck)|\bas\s+any\b|:\s*any\b/.test(source),`${file}: 型検査の回避`);
  const imports=[...source.matchAll(/^import\s+(?!type\b)[^\n]*?from\s*['"]([^'"]+)['"]/gm),...source.matchAll(/\bimport\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
  const owner=path.relative(root,file).split(path.sep)[0];
  for(const [,spec] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    if(!spec.startsWith('.'))continue;
    const targetOwner=path.relative(root,path.resolve(path.dirname(file),spec)).split(path.sep)[0];
    assert(owner!== 'shared'||targetOwner==='shared',`sharedから画面への依存: ${file} → ${spec}`);
    assert(['shared','styles',owner].includes(targetOwner),`画面間の依存: ${file} → ${spec}`);
  }
  const edges=[];
  for(const spec of imports){
    if(!spec.startsWith('.')){assert(dependencies[spec.split('/')[0]],`未宣言の依存: ${spec}`);continue;}
    const target=path.resolve(path.dirname(file),spec);
    const resolved=[target,target+'.ts',target+'.tsx'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
    assert(resolved,`import先がない: ${spec}`);
    assert(!path.relative(root,resolved).startsWith('..')&&/\.tsx?$/.test(resolved),`旧JSへの製品依存: ${spec}`);
    edges.push(resolved);
  }
  graph.set(file,edges);
}
const done=new Set(),visiting=new Set();
function visit(file){if(done.has(file))return;assert(!visiting.has(file),`製品の実行時循環参照: ${file}`);visiting.add(file);for(const edge of graph.get(file)??[])visit(edge);visiting.delete(file);done.add(file);}
for(const file of graph.keys())visit(file);
console.log(`合格: ${graph.size}製品TSモジュール、旧JS依存なし、実行時循環参照なし、strict検査の回避なし`);
