// 認可済み端末と同じWi-Fi subnetにあるPC側アドレスを選ぶ。設定は変更しない。
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {privateIpv4} from './wifi-route.mjs';
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){assert(['--adb','--output'].includes(process.argv[i])&&process.argv[i+1],'引数は--adb/--output');assert(!args.has(process.argv[i]));args.set(process.argv[i],process.argv[i+1]);}
const adb=(...a)=>execFileSync(args.get('--adb')??'adb',a,{encoding:'utf8',windowsHide:true,timeout:10000});
const devices=adb('devices').trim().split(/\r?\n/).slice(1).filter(Boolean);assert(devices.length===1&&/\sdevice$/.test(devices[0]),'認可済みAndroid1台が必要');
const android=JSON.parse(adb('shell','ip','-j','address','show')).find(i=>i.ifname==='wlan0')?.addr_info.find(a=>a.family==='inet')?.local;
assert(privateIpv4(android),'AndroidのWi-Fi IPv4がない');
const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -eq 'Native 802.11' } | Select-Object InterfaceIndex,InterfaceDescription,Name) | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
const parsed=JSON.parse(raw),adapters=Array.isArray(parsed)?parsed:[parsed];
const toInt=ip=>ip.split('.').reduce((n,x)=>(n*256+Number(x))>>>0,0);
const matches=[];
for(const adapter of adapters){for(const a of Object.values(os.networkInterfaces()).flat()){
  if(!a||a.internal||!privateIpv4(a.address)||a.family!=='IPv4')continue;
  if((toInt(a.address)&toInt(a.netmask))!==(toInt(android)&toInt(a.netmask)))continue;
  const prefix=toInt(a.netmask).toString(2).split('1').length-1;
  // アドレスとInterfaceIndexの所属をCIMで再確認する。
  const has=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`[bool](Get-NetIPAddress -InterfaceIndex ${adapter.InterfaceIndex} -AddressFamily IPv4 | Where-Object IPAddress -eq '${a.address}')`],{encoding:'utf8',windowsHide:true}).trim();
  if(has==='True')matches.push({pc:{IPAddress:a.address,InterfaceIndex:adapter.InterfaceIndex,PrefixLength:prefix},adapter,androidAddress:android,androidInterface:'wlan0'});
}}
assert.equal(matches.length,1,'同じWi-Fi subnetの一意な候補を確認できない。既存設定は変更しない');
const output=path.resolve(args.get('--output')??'data/local/wifi-network.private.json');
assert(output.startsWith(path.resolve('data/local')+path.sep)&&output.endsWith('.private.json'),'接続情報はdata/localのprivate.jsonだけへ保存する');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(matches[0],null,2)+'\n');
console.log('Wi-Fi候補を1件検出。生アドレスはGit対象外のprivate.jsonへ保存しました。');
