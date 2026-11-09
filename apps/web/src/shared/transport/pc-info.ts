import type {PcInfo} from '../../pc/model';
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string';
// ホスト由来でも、HTML挿入の前にQR用SVGの要素・属性だけを許可する。
// qrcode crateが返す図形以外やイベント属性・外部参照は受け付けない。
export function validQr(value:unknown):value is string {
  if(!text(value)||value.length>1_000_000||/<!DOCTYPE/i.test(value))return false;
  const document=new DOMParser().parseFromString(value,'image/svg+xml');
  const root=document.documentElement;
  if(root.localName!=='svg'||document.querySelector('parsererror'))return false;
  const tags=new Set(['svg','path','rect','g']);
  const attrs=new Set(['xmlns','version','width','height','viewBox','fill','d','x','y','shape-rendering','stroke','stroke-width']);
  return [root,...root.querySelectorAll('*')].every(el=>tags.has(el.localName)
    &&[...el.attributes].every(a=>attrs.has(a.name)&&!/(?:url\s*\(|javascript:|data:)/i.test(a.value)));
}
function isPcInfo(v:unknown):v is PcInfo {
  if(!object(v)||typeof v.port!=='number'||!Number.isInteger(v.port)||v.port<1||v.port>65535)return false;
  if(v.build!==undefined&&(!object(v.build)||!text(v.build.version)||(v.build.commit!==undefined&&v.build.commit!==null&&!text(v.build.commit))))return false;
  if(v.hotspot!==undefined&&v.hotspot!==null&&(!object(v.hotspot)||typeof v.hotspot.on!=='boolean'))return false;
  if(v.wifi!==undefined&&v.wifi!==null&&(!object(v.wifi)||!text(v.wifi.ssid)||!validQr(v.wifi.qr)))return false;
  if(v.urls!==undefined&&(!Array.isArray(v.urls)||!v.urls.every(v=>object(v)&&text(v.url)&&validQr(v.qr)
    &&(v.hotspot===undefined||typeof v.hotspot==='boolean'))))return false;
  return true;
}
export function decodePcInfo(v:unknown):PcInfo|null {return isPcInfo(v)?v:null;}
