import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),folder=path.join(root,'data/local/pr274-wifi');
const {summarize}=await import(pathToFileURL(path.join(root,'scripts/device/android-performance.mjs')));
const {analyzeHostInput}=await import(pathToFileURL(path.join(root,'scripts/device/wifi-host-analysis.mjs')));
const {validateSelectedPairs}=await import(pathToFileURL(path.join(root,'scripts/device/wifi-route.mjs')));
const {trialAcks}=await import(pathToFileURL(path.join(root,'scripts/device/wifi-trial-acks.mjs')));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const partial=process.argv.includes('--partial');
const supplement=process.argv.includes('--supplement');
const option=process.argv.indexOf('--out');
const output=path.resolve(option<0?'docs/develop/acceptance/evidence/pr274-wifi':process.argv[option+1]);
if(partial)assert(output.startsWith(path.join(root,'data/local')+path.sep),'部分集計を共有完了記録へ書かない');
if(supplement)assert(option>=0&&output!==path.resolve('docs/develop/acceptance/evidence/pr274-wifi'),'再試験は主21試行と別の保存先を指定する');
const batchOption=process.argv.indexOf('--batch');
const manifest=JSON.parse(fs.readFileSync(batchOption<0?path.join(folder,'batch.json'):process.argv[batchOption+1],'utf8'));
const conditions=supplement?[...new Set(manifest.order.map(j=>j.label))]:['A','B','C','D','E','A-ws','E-ws'];
if(!partial){assert.equal(manifest.status,'completed');assert.equal(manifest.results.length,conditions.length*3);}
fs.mkdirSync(output,{recursive:true});
const inventory=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).sort().map(f=>[f.replaceAll('\\','/'),sha(fs.readFileSync(path.join(dir,f)))]));
const trials=[];
for(const record of manifest.results){
  assert.equal(record.code,0,'失敗試行は別記し、本比較へ黙って混ぜない');
  const source=path.join(root,record.report),original=JSON.parse(fs.readFileSync(source,'utf8'));
  const r=structuredClone(original),sourceRoot=path.resolve(path.dirname(source),'../../../..');
  assert(!r.error&&!r.cleanupFailures?.length&&r.hostExit.code===0);
  assert.equal(r.sourceDirty,false);assert.equal(r.runner.dirty,false);
  assert.equal(r.runner.commit,manifest.runnerCommit);assert.equal(r.binarySha256,manifest.binarySha256);
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd:sourceRoot,encoding:'utf8'}).trim(),'');
  assert.equal(r.performance.workload.cycles,48);assert.equal(r.lookPerformance.moves,1800);
  const host=analyzeHostInput(r);assert.equal(host.logicalInputs,224);assert.equal(host.outputUnmatched,0);
  const sends=r.performance.raw.sends.filter(s=>s.type==='input'&&s.via==='ws');
  const ids=new Set(sends.map(s=>s.iseq));
  const {rows:ackRows,...scopedAck}=trialAcks(r.performance.raw);
  assert.equal(scopedAck.ackRttMs.n,224);assert.equal(scopedAck.unacked,0);
  const metrics={...r.performance.summary,...scopedAck};
  for(const [state,kind]of [['down','pointerdown'],['up','pointerup']]){
    const edges=sends.filter(s=>s.state===state&&s.event?.kind===kind);
    metrics[state+'ObservedToSendMs']=summarize(edges.map(s=>s.at-s.event.observed));
    metrics[state+'DispatchDelayMs']=summarize(edges.map(s=>s.event.observed-s.event.at));
  }
  metrics.ackByFirstVia=Object.fromEntries(['ws','rtc'].map(via=>[via,summarize(ackRows.filter(r=>r.via===via).map(r=>r.rttMs))]));
  assert.equal(Object.values(metrics.firstVia).reduce((a,b)=>a+b,0),224);
  const accepted=r.performance.hostEvents.filter(e=>e.type==='log'&&e.entry.kind==='input'&&ids.has(e.entry.iseq));
  assert.equal(accepted.length,224);assert.equal(new Set(accepted.map(e=>e.entry.iseq)).size,224);
  const privateProof=JSON.parse(fs.readFileSync(path.join(path.dirname(source),'network.private.json'),'utf8'));
  const proof=r.networkProof;
  assert(proof.pcWifiActive&&proof.androidWifiActive&&proof.androidRouteViaWlan&&!proof.usbTethering&&proof.adbReverseMappings===0);
  assert(proof.host.ownedHostEstablishedLanSocket&&proof.host.androidNonLoopbackPeer);
  const aliases=new Map();
  const candidates=stats=>validateSelectedPairs(stats,privateProof.network).map((value,i)=>{
    const s=stats[i],key=[s.pair.id,s.local.address,s.local.port,s.remote.address,s.remote.port].join('|');
    if(!aliases.has(key))aliases.set(key,'pair-'+(aliases.size+1));return {...value,pair:aliases.get(key)};
  });
  for(const sample of proof.samples){
    const raw=privateProof.samples.find(s=>s.label===sample.label);assert(raw,'経路生記録がない');
    assert(sample.http.networkResponse&&sample.webSocket.urlUsesLanAddress&&!sample.adbReverseUsed);
    if(!r.wsOnly){sample.selectedPairs=candidates(raw.stats);sample.pathHistory=raw.history.rows.map(h=>({at:h.at,selectedPairs:candidates(h.stats)}));}
    else {assert.equal(raw.stats.length,0);assert.equal(sample.selectedPairs.length,0);}
  }
  assert(proof.samples.some(s=>s.label==='input-end')&&proof.samples.some(s=>s.label==='look-end'));
  if(!r.wsOnly)assert(proof.samples.find(s=>s.label==='input-end').pathHistory.length>=10,'60秒間のICE履歴が不足');
  r.performance.summary=metrics;r.hostAnalysis=host;
  r.uiInventory=inventory(path.join(sourceRoot,'apps/web/dist'));
  for(const [name,digest]of Object.entries(r.uiAssets??{}))assert.equal(r.uiInventory['react/'+name],digest);
  delete r.hostPort;delete r.cdpPort;
  const safe=JSON.stringify(r);
  assert(!/"(?:ip|token|serial|clientId|hostPort|cdpPort|remoteIPAddress|address|url)"\s*:/.test(safe),'接続識別子を含めない');
  assert(!safe.includes(privateProof.network.pc)&&!safe.includes(privateProof.network.android),'生LANアドレスを含めない');
  const filename=`${record.label}-${record.trial}.json.gz`,bytes=gzipSync(Buffer.from(safe+'\n'),{level:9});
  fs.writeFileSync(path.join(output,filename),bytes);
  // 完全な5秒履歴はrawへ保全。索引は候補の辞書＋重複しない時系列で参照する。
  const pairCatalog=new Map(),pathHistory=new Map();
  const compactPair=p=>{
    if(!pairCatalog.has(p.pair))pairCatalog.set(p.pair,{pair:p.pair,selectedBy:p.selectedBy,local:p.local,remote:p.remote});
    return {pair:p.pair,connectionState:p.connectionState,dtlsState:p.dtlsState,iceState:p.iceState,state:p.state,nominated:p.nominated,bytesSent:p.bytesSent,bytesReceived:p.bytesReceived,currentRoundTripTimeMs:p.currentRoundTripTimeMs};
  };
  const samples=proof.samples.map(({pathHistory:history,...sample})=>{
    for(const item of history){const pairs=item.selectedPairs.map(compactPair);pathHistory.set(JSON.stringify([item.at,pairs.map(p=>p.pair)]),{at:item.at,pairs});}
    return {...sample,selectedPairs:sample.selectedPairs.map(compactPair),historySamples:history.length};
  });
  const reconnect=r.tests.find(t=>t.id.includes('保持中の通信切断'))?.observed;
  trials.push({condition:record.label,trial:record.trial,date:r.date,sourceCommit:r.sourceCommit,runner:r.runner,binarySha256:r.binarySha256,device:r.device,connection:r.connection,workload:r.performance.workload,metrics,delivery:{logicalInputs:224,accepted:224,missing:0,duplicateAccepted:0,unacked:0,outputMatched:host.outputMatched},
    host:{...host,rows:undefined},look:{...r.lookPerformance,times:undefined,gaps:undefined,companionPositions:undefined},
    network:{topology:proof.topology,pairCatalog:[...pairCatalog.values()],samples,pathHistory:[...pathHistory.values()],selectedPairGenerations:aliases.size},tests:r.tests.map(({id,result})=>({id,result})),reconnect,hostExit:r.hostExit,raw:filename,rawSha256:sha(bytes)});
  console.log(`${record.label}${record.trial}: ACK p95 ${metrics.ackRttMs.p95.toFixed(1)} / p99 ${metrics.ackRttMs.p99.toFixed(1)}ms; recv→accept p95 ${host.timing.receiveToAcceptMs.p95.toFixed(3)}ms; look recv≥200ms ${Object.values(host.look).reduce((n,v)=>n+v.gaps200ms,0)}`);
}
assert(new Set(trials.map(t=>t.binarySha256)).size<=1);
assert(new Set(trials.map(t=>JSON.stringify(t.device))).size<=1);
assert(new Set(trials.map(t=>JSON.stringify(t.runner.modules))).size<=1);
if(!partial)for(const condition of conditions)assert.deepEqual(trials.filter(t=>t.condition===condition).map(t=>t.trial).sort(),[1,2,3]);
const usb=JSON.parse(fs.readFileSync('docs/develop/acceptance/evidence/pr274-review/trials.json','utf8')).trials;
const summaries={};
for(const condition of conditions){
  const group=trials.filter(t=>t.condition===condition);if(!group.length)continue;
  const range=fn=>{const values=group.map(fn).filter(Number.isFinite);return {n:values.length,min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length}};
  summaries[condition]={trials:group.length,downP95:range(t=>t.metrics.downToSendMs.p95),upP95:range(t=>t.metrics.upToSendMs.p95),ackP95:range(t=>t.metrics.ackRttMs.p95),ackP99:range(t=>t.metrics.ackRttMs.p99),receiveToAcceptP95:range(t=>t.host.timing.receiveToAcceptMs.p95),acceptToDryOutputP95:range(t=>t.host.timing.acceptToDryOutputMs.p95),lookSendP95:range(t=>t.look.summary.p95),lookArrivalMax:range(t=>Math.max(...Object.values(t.host.look).map(v=>v.maxGapMs??0))),lookArrivalGaps200:group.reduce((n,t)=>n+Object.values(t.host.look).reduce((m,v)=>m+v.gaps200ms,0),0),orderGapCount:group.reduce((n,t)=>n+t.host.orderGapCount,0),usbAckP95:usb.filter(t=>t.condition===condition).map(t=>t.metrics.ackRttMs.p95)};
  for(const [name,fn]of Object.entries({ackMean:t=>t.metrics.ackRttMs.mean,ackP50:t=>t.metrics.ackRttMs.p50,ackMax:t=>t.metrics.ackRttMs.max,downHandlerP95:t=>t.metrics.downObservedToSendMs.p95,receiveToAcceptP99:t=>t.host.timing.receiveToAcceptMs.p99,outputP99:t=>t.host.timing.acceptToDryOutputMs.p99,wsJitterP95:t=>t.host.arrival.ws.absoluteIntervalVariationMs.p95,rtcJitterP95:t=>t.host.arrival.rtc.absoluteIntervalVariationMs.p95}))summaries[condition][name]=range(fn);
}
const value={version:1,complete:!partial,status:manifest.status,hostSourceCommit:manifest.hostSourceCommit,plannedOrder:manifest.order,trials,summaries,limitations:['CDP合成タッチ、dry-run、Android1台＋模擬参加者。実指/Minecraft/実OS入力/複数端末の受入ではない。','USB側RTC経路は不明。Wi-Fi側には選択経路observerと追加host traceがあり、同一計測負荷の純粋なUSB対Wi-Fi実験ではない。','到着間隔の差分変動は同期時計の片道遅延ではない。意図的な操作休止を含む。']};
fs.writeFileSync(path.join(output,'trials.json'),JSON.stringify(value,null,2)+'\n');
const csv=(name,header,rows)=>fs.writeFileSync(path.join(output,name),[header,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
const latency=[];
for(const t of trials){
  const measures={
    'pointerdown→送信':t.metrics.downToSendMs,'pointerup→送信':t.metrics.upToSendMs,'ACK観測':t.metrics.ackRttMs,
    'ACK観測_WS先着':t.metrics.ackByFirstVia.ws,'ACK観測_RTC先着':t.metrics.ackByFirstVia.rtc,
    'pointerdown観測→送信':t.metrics.downObservedToSendMs,'pointerup観測→送信':t.metrics.upObservedToSendMs,
    'pointerdown時刻→観測':t.metrics.downDispatchDelayMs,'pointerup時刻→観測':t.metrics.upDispatchDelayMs,
    'host受信→入力受理':t.host.timing.receiveToAcceptMs,'順序buffer→受理':t.host.timing.bufferToAcceptMs,
    '受理→dry-run出力':t.host.timing.acceptToDryOutputMs,'adapter呼出周辺の観測':t.host.timing.adapterCallMs,
    'WS到着間隔':t.host.arrival.ws.arrivalIntervalMs,'RTC到着間隔':t.host.arrival.rtc.arrivalIntervalMs,
    'WSの送信到着間隔差_絶対値':t.host.arrival.ws.absoluteIntervalVariationMs,'RTCの送信到着間隔差_絶対値':t.host.arrival.rtc.absoluteIntervalVariationMs,
    '視点送信間隔':t.look.summary,'視点WS到着間隔':t.host.look.ws.arrivalIntervalMs,'視点RTC到着間隔':t.host.look.rtc.arrivalIntervalMs,
  };
  for(const [name,m]of Object.entries(measures))latency.push([t.condition,t.trial,name,m.n,m.p50,m.p95,m.p99,m.mean,m.max,'ms']);
}
csv('latency.csv',['条件','試行','指標','標本数','p50','p95','p99','平均','最大','単位'],latency);
csv('delivery.csv',['条件','試行','論理送信','受理','欠落','重複適用','未ACK','出力照合','WS先着','RTC先着','順序gap待ち','視点送信空白200ms以上','視点WS到着空白200ms以上','視点RTC到着空白200ms以上','lookLost'],trials.map(t=>[t.condition,t.trial,224,t.delivery.accepted,t.delivery.missing,t.delivery.duplicateAccepted,t.delivery.unacked,t.delivery.outputMatched,t.metrics.firstVia.ws??0,t.metrics.firstVia.rtc??0,t.host.orderGapCount,t.look.gaps200ms,t.host.look.ws.gaps200ms,t.host.look.rtc.gaps200ms,t.look.hostLookLost]));
console.log(`独立Wi-Fi試行 ${trials.length}/${conditions.length*3} を照合（${partial?'非公開の途中集計':'共有用の最終集計'}）`);
if(!partial&&!supplement){
  const failures=[];
  const redact=value=>{
    if(Array.isArray(value))return value.map(redact);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['ip','token','serial','clientId','hostPort','cdpPort','remoteIPAddress','address','url'].includes(k)).map(([k,v])=>[k,redact(v)]));
    if(typeof value==='string')return value.replace(/https?:\/\/[^\s]+/g,'[private URL]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,ip=>ip.split('.').every(n=>Number(n)<=255)?'[private address]':ip);
    return value;
  };
  const sources=[];
  for(const name of ['review-standard','review-baseline-main']){
    const dir=path.join(root,'data/local',name,'data/local/device-acceptance');
    for(const entry of fs.readdirSync(dir)){
      const file=path.join(dir,entry,'summary.json');if(!fs.existsSync(file))continue;
      const report=JSON.parse(fs.readFileSync(file,'utf8'));
      if(['wifi-route-probe','wifi-pilot-E'].includes(report.condition))sources.push({file,report,kind:report.condition});
    }
  }
  for(const name of ['batch-attempt1.json','batch-attempt2.json']){
    const attempt=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
    for(const record of attempt.results){const file=path.join(root,record.report);sources.push({file,report:JSON.parse(fs.readFileSync(file,'utf8')),kind:'measurement startup / blocked copy path'});}
  }
  sources.sort((a,b)=>a.report.date.localeCompare(b.report.date));
  for(const [i,item]of sources.entries()){
    const report=redact(item.report),filename=`preparation-${i+1}.json.gz`,bytes=gzipSync(Buffer.from(JSON.stringify(report)+'\n'),{level:9});
    fs.writeFileSync(path.join(output,filename),bytes);
    failures.push({kind:item.kind,condition:report.condition,trial:report.trial,date:report.date,error:report.error??null,hostExit:report.hostExit,cleanupFailures:report.cleanupFailures??[],sourceCommit:report.sourceCommit,runner:report.runner??'当時の予備runnerはcommit/module hashを記録していない。最終比較には採用しない。',raw:filename,rawSha256:sha(bytes)});
  }
  fs.writeFileSync(path.join(output,'preparation.json'),JSON.stringify({scope:'予備/失敗記録。本比較21試行へ混ぜない。元のprivateログはローカル保持。',records:failures},null,2)+'\n');
  const radio=JSON.parse(fs.readFileSync(path.join(folder,'radio.private.json'),'utf8'));
  const initialFile=path.join(folder,'wifi-status.private.txt');radio.unshift({date:fs.statSync(initialFile).mtime.toISOString(),text:fs.readFileSync(initialFile,'utf8').replace(/^\uFEFF/,'')});
  const extract=re=>radio.map(r=>r.text.match(re)?.[1]).filter(Boolean);
  const identities=extract(/BSSID: ([0-9a-fA-F:]+)/),rssi=extract(/RSSI: (-?\d+)/).map(Number);
  const environment={topology:'Windows Wi-Fi Direct / mobile hotspot → Android wlan0',samples:radio.length,start:radio[0].date,end:radio.at(-1).date,
    frequencyMHz:[...new Set(extract(/Frequency: (\d+)/).map(Number))],rssiDbm:{...summarize(rssi),min:Math.min(...rssi)},linkSpeedMbps:[...new Set(extract(/Link speed: (\d+)/).map(Number))],
    accessPointIdentityCaptured:identities.length,allCapturedAccessPointIdentitiesEqual:identities.length===radio.length&&new Set(identities).size===1,
    note:'生SSID/BSSID/アドレスは公開しない。30秒間隔の読み取りと初期snapshot。距離/混雑/他機器の負荷は制御していない。'};
  fs.writeFileSync(path.join(output,'environment.json'),JSON.stringify(environment,null,2)+'\n');
  console.log(`準備記録${failures.length}件（成功/失敗を含む）と無線環境を匿名化して保存`);
}
