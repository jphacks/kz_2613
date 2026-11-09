// 固定worktreeの独立試行を集約する。生データは端末/接続識別子を除いてgzip保存する。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {summarize} from './android-performance.mjs';
const output='docs/develop/acceptance/evidence/pr274-review';
fs.mkdirSync(output,{recursive:true});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const roots={A:'review-baseline-main',B:'review-baseline-pr',C:'review-baseline-pr',D:'review-engine-ts',E:'review-engine-async'};
const inventory=directory=>Object.fromEntries(fs.readdirSync(directory,{recursive:true}).filter(f=>fs.statSync(path.join(directory,f)).isFile()).sort().map(f=>[f.replaceAll('\\','/'),hash(fs.readFileSync(path.join(directory,f)))]));
const trials=[];
for(const [condition,folder] of Object.entries(roots)){
  const root=path.resolve('data/local',folder),dir=path.join(root,'data/local/device-acceptance');
  const candidates=fs.readdirSync(dir).map(name=>path.join(dir,name,'summary.json')).filter(f=>fs.existsSync(f)).map(file=>({file,report:JSON.parse(fs.readFileSync(file,'utf8'))}));
  const assets=inventory(path.join(root,'apps/web/static'));
  for(let trial=1;trial<=3;trial++){
    const matches=candidates.filter(({report:r})=>r.condition===condition+'-fixed'&&Number(r.trial)===trial&&r.performance?.workload.version===2&&!r.error);
    assert.equal(matches.length,1,`${condition}${trial}: 成功した独立試行が一つ必要`);
    const r=structuredClone(matches[0].report);
    assert.equal(r.performance.workload.cycles,48);assert.equal(r.lookPerformance.moves,1800);
    assert.equal(r.sourceDirty,false,'対象worktreeはクリーンであること');
    for(const [name,digest] of Object.entries(r.uiAssets??{}))assert.equal(assets['react/'+name],digest,'計測後にReact資産が変わっていないこと');
    delete r.hostPort;delete r.cdpPort;
    // 旧補助CLIの説明にはRTCをUSB経路とする表現があった。候補対を収集していないため訂正する。
    r.limitations=r.limitations.map(s=>s.replace('WebRTCはUSB経路の成立確認','HTTP/WSはADB reverse TCP。RTCは候補経路未収集で、USB/Wi-Fiの内訳を断定しない'));
    r.measurementNotes=['HTTP/WSはADB reverse TCP。RTCはローカルICE、STUN/TURNなしで成立したが選択候補対は未収集。純Wi-Fi比較・無線断試験ではない。'];
    r.uiInventory=assets;
    const ws=r.performance.raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
    const sequences=new Set(ws.map(s=>s.iseq));
    const accepted=r.performance.hostEvents.filter(m=>m.type==='log'&&m.entry.kind==='input'&&sequences.has(m.entry.iseq));
    const acceptedIds=new Set(accepted.map(m=>m.entry.iseq));
    const missing=ws.filter(s=>!acceptedIds.has(s.iseq)).length,duplicates=accepted.length-acceptedIds.size;
    assert.equal(missing,0);assert.equal(duplicates,0);
    const edgeSamples=(from,to)=>ws.filter(s=>s.state==='down'&&s.event?.kind==='pointerdown'&&s.at>=from&&s.at<to).map(s=>s.at-s.event.at);
    const started=r.performance.raw.started;
    const early=summarize(edgeSamples(started,started+15000)),late=summarize(edgeSamples(started+45000,started+60000));
    r.performance.delivery={logicalInputs:ws.length,accepted:accepted.length,missing,duplicates,orderBufferWait:'未測定：ホストに対応する公開計測点がない'};
    r.performance.trend={first15s:early,last15s:late};
    const safe=JSON.stringify(r);
    // 実アドレスの文字列表現を誤って共有しない。Chrome等の版数はこの形式に含めない。
    assert(!/"(?:ip|token|serial|hostPort|cdpPort)"\s*:/.test(safe),'接続識別子を含めない');
    const bytes=gzipSync(Buffer.from(safe+'\n'),{level:9});
    const filename=`${condition}-${trial}.json.gz`;
    fs.writeFileSync(path.join(output,filename),bytes);
    trials.push({condition,trial,sourceCommit:r.sourceCommit,binarySha256:r.binarySha256,device:r.device,connection:r.connection,
      workload:r.performance.workload,metrics:r.performance.summary,delivery:r.performance.delivery,trend:r.performance.trend,
      look:{moves:r.lookPerformance.moves,companionTaps:r.lookPerformance.companionTaps,...r.lookPerformance.summary,gaps200ms:r.lookPerformance.gaps200ms,longestGapMs:r.lookPerformance.longestGapMs,hostLookLost:r.lookPerformance.hostLookLost},
      tests:r.tests.map(t=>({id:t.id,result:t.result})),hostExit:r.hostExit,raw:filename,rawSha256:hash(bytes)});
  }
}
assert.equal(new Set(trials.map(t=>t.binarySha256)).size,1,'全条件のホストexeを揃える');
assert.equal(new Set(trials.map(t=>JSON.stringify(t.device))).size,1,'全条件のAndroid/Chromeを揃える');
fs.writeFileSync(path.join(output,'trials.json'),JSON.stringify({date:new Date().toISOString(),trials},null,2)+'\n');
for(const t of trials)console.log(`${t.condition}${t.trial}: down p95 ${t.metrics.downToSendMs.p95.toFixed(1)}ms / up ${t.metrics.upToSendMs.p95.toFixed(1)}ms / ACK ${t.metrics.ackRttMs.p95.toFixed(1)}ms / look ${t.look.p95.toFixed(1)}ms / missing ${t.delivery.missing} / duplicate ${t.delivery.duplicates}`);
