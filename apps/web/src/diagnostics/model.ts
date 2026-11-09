import type {LogEntry} from '../shared/model/domain.ts';
export function ago(t:number|undefined,now:number){return t?((now-t)/1000).toFixed(1)+'s前':'-';}
export function device(ua:string|undefined){
  if(!ua)return '-';if(/iPhone|iPad/.test(ua))return 'iOS';const m=ua.match(/Android [\d.]+; ([^;)]+)/);
  return m?`Android ${m[1]}`:/Android/.test(ua)?'Android':ua.slice(0,30);
}
export function logText(entry:LogEntry){
  const time=new Date(entry.t).toLocaleTimeString('ja-JP',{hour12:false})+'.'+String(entry.t%1000).padStart(3,'0');
  const {t:_,kind,...rest}=entry;
  return `${time}  ${kind.padEnd(11)} ${Object.entries(rest).map(([k,v])=>`${k}=${Array.isArray(v)?'['+v.join(',')+']':String(v)}`).join(' ')}`;
}
