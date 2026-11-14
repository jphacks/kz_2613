import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {PhoneGame} from '../shared/contracts.ts';
import type {HostState,InjectionState,SlotState,PcInfo,LogEntry} from '../shared/model/domain.ts';
import {decodePcInfo} from '../shared/transport/pc-info.ts';
import {createMonitor} from '../shared/transport/monitor.ts';
import {ago,device,logText} from './model.ts';
import {Icon} from '../shared/icons.ts';

function SlotCard({slot:s,now}:{slot:SlotState;now:number}){
  const c=s.clientStats;
  return <div className={`slot${s.assigned?s.connected?' on':' off':''}`} id={`slot-${s.name}`}>
    <div className="head"><span className="name">{s.name}</span><span className="role">{s.role}</span><span className="st" style={!s.assigned?{color:'var(--muted)'}:undefined}>{!s.assigned?'空き':s.connected?'接続中':'切断'}</span></div>
    {s.assigned&&<><dl>
      <dt>端末</dt><dd>{device(s.ua)} / {s.ip||'-'}</dd>
      <dt>最終受信</dt><dd>{ago(s.lastSeen,now)}</dd><dt>再接続</dt><dd>{s.reconnects}回</dd>
      <dt>受信</dt><dd>{s.events}件 (欠落 {s.lost} / 順序逆転 {s.outOfOrder})</dd>
      <dt>RTT</dt><dd>{c?`平均 ${c.avg} / p95 ${c.p95} / 最大 ${c.max} ms`:'-'}</dd><dt>未ACK</dt><dd>{c?c.unacked:'-'}</dd>
      <dt>経路</dt><dd>{{open:'WebRTC+WS',connecting:'RTC接続中',failed:'WSのみ（RTC失敗）',none:'WSのみ'}[s.rtcState as 'open'|'connecting'|'failed'|'none']||'-'}</dd>
      <dt>先着</dt><dd>RTC {s.via?.rtc??0} / WS {s.via?.ws??0}</dd><dt>RTC遅延</dt><dd>{c?.rtc?`平均 ${c.rtc.avg} / p95 ${c.rtc.p95} / 最大 ${c.rtc.max} ms`:'-'}</dd>
      <dt>視点欠落</dt><dd>{s.lookLost??0}件（累積値で補完）</dd>
    </dl><div className="keys">{(s.pressed??[]).map(k=><span key={k}>{k}</span>)}</div></>}
  </div>;
}

export function DiagnosticsApp(){
  const [info,setInfo]=useState<PcInfo|null>(null),[selected,setSelected]=useState('0');
  const [state,setState]=useState<HostState|null>(null),[game,setGame]=useState<PhoneGame|null>(null),[inject,setInject]=useState<InjectionState|null>(null);
  const [online,setOnline]=useState<boolean|null>(null),[entries,setEntries]=useState<LogEntry[]>([]);
  const monitor=useRef<ReturnType<typeof createMonitor>|null>(null),load=useRef<()=>void>(()=>{});
  const log=useRef<HTMLDivElement>(null),stick=useRef(true);
  useLayoutEffect(()=>{if(stick.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[entries]);
  useEffect(()=>{
    let disposed=false,currentInfo:PcInfo|null=null;
    const controller=new AbortController();
    load.current=()=>{void fetch('/api/info',{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('info');return response.json() as Promise<unknown>;}).then(value=>{
      if(disposed)return;const next=decodePcInfo(value);if(!next)return;currentInfo=next;setInfo(next);setSelected(prev=>Number(prev)<(next.urls?.length??0)?prev:'0');
    }).catch(()=>{});};
    load.current();const timer=setInterval(()=>{if(!currentInfo?.urls?.some(u=>u.hotspot))load.current();},5000);
    const connection=createMonitor({page:'host',onConnection:setOnline,onMessage:message=>{
      if(message.type==='state'){setState(message);setGame(message.game);setInject(message.inject);}
      else if(message.type==='game')setGame(message.game);
      else if(message.type==='log'&&!message.entry.burst){const el=log.current;stick.current=!el||el.scrollTop+el.clientHeight>=el.scrollHeight-10;setEntries(prev=>[...prev,message.entry].slice(-1000));}
    }});monitor.current=connection;
    return ()=>{disposed=true;controller.abort();clearInterval(timer);connection.dispose();monitor.current=null;load.current=()=>{};};
  },[]);
  const url=info?.urls?.[Number(selected)],tgt=inject?.target;
  const waiting=inject?.mode==='on'&&tgt&&!tgt.ok?`注入: 停止中（前面が入力先ではありません: ${tgt.process||'不明'}）`:'注入: 停止中（疑似ゲーム画面が非選択）';
  const modes=['off','test','on'] as const;
  return <>
    <h1>Re:Cooplay 通信テスト <small id="conn" style={{color:online===null?undefined:online?'var(--ok)':'var(--ng)'}}>{online===null?'サーバー接続中…':online?'サーバー接続OK':'サーバー切断 — 再接続中'}</small></h1>
    <div className="grid"><div className="panel qrs"><div><h2>① Wi-Fi に接続</h2><div id="wifi">{info?.wifi?<div className="qrbox"><div className="qr" dangerouslySetInnerHTML={{__html:info.wifi.qr}}/><div className="label">ネットワーク名</div><div className="url">{info.wifi.ssid}</div></div>:<div className="hint">config.json に SSID / パスワードを書くと Wi-Fi 接続用 QR を表示します。<br/>未設定の場合は Windows の「設定 → ネットワークとインターネット → モバイル ホットスポット」に表示される名前とパスワードで手動接続してください。</div>}</div></div>
      <div><h2>② 参加用 URL を開く</h2><div style={{marginBottom:8}}><select id="ifsel" value={selected} onChange={e=>setSelected(e.target.value)}>{info?.urls?.map((u,i)=><option key={i} value={i}>{u.address??u.url} ({u.name??''}{u.hotspot?' / ホットスポット':''})</option>)}</select> <button id="reload" onClick={()=>load.current()}>IP 再取得</button></div>
      <div id="urlqr">{url?<>{!url.hotspot&&<div className="warnbox" style={{marginBottom:8}}>選択中はホットスポット (192.168.137.x) ではありません。ホットスポットを ON にして「IP 再取得」を押してください。</div>}<div className="qrbox"><div className="qr" dangerouslySetInnerHTML={{__html:url.qr}}/><div className="url">{url.url}</div></div></>:<div className="warnbox">ネットワークが見つかりません。モバイル ホットスポットを ON にして「IP 再取得」を押してください。</div>}</div></div>
      <div className="hint">スマホが「インターネットなし」と表示しても Wi-Fi 接続を維持してください。<br/>Android はモバイルデータを OFF にすると確実です（自動でモバイル回線に逃げるのを防ぐ）。</div>
    </div><div><div className="panel" id="ctrl" style={{marginBottom:20}}>
      <div className="kbbar"><h2 style={{margin:0}}>進行・入力注入</h2><a href="/game" target="_blank" style={{color:'var(--accent)',fontSize:13,marginLeft:'auto'}}>疑似ゲーム画面を開く <Icon name="external" /></a></div>
      <div className="kbbar"><span style={{fontSize:12,color:'var(--muted)'}}>進行</span><span className={`pill ${game?.phase==='coop'?'ok':game?.phase==='paused'?'warn':''}`} id="phaseState">{game?`${{lobby:'ロビー（ホストのリモコン）',preparing:'準備中',coop:'協力プレイ中',paused:'一時停止中'}[game.phase]}${game.reason?'（'+game.reason+'）':''} / 接続 ${game.connected.length}人`:'-'}</span>
      <div className="seg" id="phaseSeg">{(['lobby','paused'] as const).map(phase=><button key={phase} data-phase={phase} className={game?.phase===phase?'sel':''} onClick={()=>monitor.current?.send({type:'phase',phase})}>{phase==='lobby'?'ロビー':'一時停止'}</button>)}</div>
      <span style={{fontSize:12,color:'var(--muted)'}}>参加人数：2〜4人（Readyの時点の接続人数）</span><label style={{fontSize:12,color:'var(--muted)',display:'flex',gap:4,alignItems:'center'}}><input type="checkbox" id="autoResume" checked={!!game?.autoResume} onChange={e=>monitor.current?.send({type:'auto_resume',on:e.target.checked})}/> 切断から戻ったら自動で再開</label></div>
      <div className="kbbar" style={{marginBottom:0}}><span style={{fontSize:12,color:'var(--muted)'}}>注入</span><div className="seg" id="modeSeg">{modes.map(mode=><button key={mode} data-mode={mode} className={inject?.mode===mode?'sel':''} onClick={()=>{if(mode==='on'&&!confirm('常時ONにすると、スマホの入力が「今選択されているウィンドウ」に送られます。よろしいですか？'))return;monitor.current?.send({type:'inject_mode',mode});}}>{{off:'OFF',test:'テスト（疑似ゲーム画面を選択中のみ）',on:'常時ON（実ゲーム用）'}[mode]}</button>)}</div><span id="injState" title={tgt?`常時ONの入力先: ${tgt.expect}`:''} className={`pill ${inject?.active?'ok':inject?.mode==='off'?'':'warn'}`}>{!inject?'-':!inject.available?`注入不可: ${inject.error}`:inject.active?'注入: 有効':inject.mode==='off'?'注入: OFF':waiting}</span></div>
      <div style={{fontSize:12,color:inject?.emergencyHotkeyError?'var(--ng)':'var(--muted)',marginTop:8}} id="hotkeyInfo">{inject?.emergencyHotkey?(inject.emergencyHotkeyError?<><Icon name="warning" /> {`緊急停止 ${inject.emergencyHotkey} を登録できません（${inject.emergencyHotkeyError}）`}</>:`緊急停止：${inject.emergencyHotkey}（どの画面からでも全キーを離して注入をOFF）`):''}</div>
    </div><div className="slots" id="slots">{state?.slots?.map(slot=><SlotCard key={slot.name} slot={slot} now={state.now??Date.now()}/>)}</div>
    <div className="panel"><div className="toolbar"><h2 style={{margin:0}}>ログ</h2><button id="clear" onClick={()=>setEntries([])}>クリア</button><button id="reset" style={{marginLeft:'auto'}} onClick={()=>{if(confirm('全スロットを解放します。接続中のスマホは切断されます。'))monitor.current?.send({type:'reset'});}}>スロットをリセット</button></div><div id="log" ref={log}>{entries.map((entry,i)=><div key={i} className={entry.kind}>{logText(entry)}</div>)}</div></div>
    </div></div>
  </>;
}
