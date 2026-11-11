import type {PhoneGame, Slot} from '../contracts.ts';
import type {ButtonInput, SequencedInput, StoragePort, Welcome} from './messages.ts';
export const PHONE_PROTOCOL_VERSION = 4;
interface SessionOptions {storage:StoragePort;createClientId():string;now():number}
type Connection = 'connecting'|'connected'|'disconnected'|'replaced'|'reset'|'version'|'token'|'closed'|'full';
export function createPhoneSession({storage,createClientId,now}:SessionOptions) {
  const read=(key:string)=>{try{return storage.getItem(key)}catch{return null}};
  const write=(key:string,value:string)=>{try{storage.setItem(key,value)}catch{}};
  let clientId=read('recooplay.clientId');
  if(!clientId){clientId=createClientId();write('recooplay.clientId',clientId)}
  let token=read('recooplay.token');
  let socket:WebSocket|null=null,seq=0,iseq=0,retry=0,stopped=false,lastServerMsg=0;
  let me:Slot|null=null,isHost=false,game:PhoneGame|null=null,connection:Connection='connecting',reconnected=false;
  function connecting(){connection='connecting'}
  function attach(next:WebSocket){socket=next}
  function current(candidate:WebSocket){return socket===candidate}
  function open(ua:string){retry=0;seq=0;lastServerMsg=now();return {type:'hello',protocolVersion:PHONE_PROTOCOL_VERSION,clientId,token,ua,nextIseq:iseq+1}}
  function received(){lastServerMsg=now()}
  function authenticate(message:Welcome){if(message.token&&message.token!==token){token=message.token;write('recooplay.token',token)}}
  function welcome(message:Welcome){me=message.slot;isHost=message.isHost;reconnected=message.reconnected===true;connection='connected'}
  function updateGame(next:PhoneGame){const changed=game?.epoch!==next.epoch;game=next;return changed}
  function stop(reason?:Connection){stopped=true;if(reason)connection=reason}
  function disconnected(code:number){
    const terminal:Record<number,Connection|undefined>={4000:'replaced',4001:'reset',4005:'version',4006:'token',4009:'closed'};
    const reason=terminal[code];if(reason){stop(reason);return null}
    // 満員などで先に止めた接続は、その後の切断で「再接続待ち」に戻さない (#308)
    if(stopped&&!['connecting','connected','disconnected'].includes(connection))return null;
    connection='disconnected';return Math.min(5000,250*2**retry++);
  }
  function detach(){const old=socket;socket=null;return old}
  function resetRetry(){retry=0}
  function isOpen(){return !stopped&&socket?.readyState===1}
  function silent(){return isOpen()&&now()-lastServerMsg>=3000}
  function sequenced<T extends object>(message:T){return {...message,seq:++seq}}
  function input(message:ButtonInput):SequencedInput{return {type:'input',...message,iseq:++iseq,epoch:game?.epoch,t:now()}}
  function send(message:object){if(stopped||!socket||socket.readyState!==1)return false;socket.send(JSON.stringify(message));return true}
  function view(){return {me,isHost,game}}
  function status():[string,string]{
    const states:Record<Connection,[string,string]>={connecting:['接続中','warn'],connected:[reconnected?'再接続OK':'接続OK','ok'],disconnected:['切断 — 再接続待ち','ng'],replaced:['別タブで接続中','ng'],reset:['リセットされました','ng'],version:['版が不一致','ng'],token:['参加できません','ng'],closed:['PCアプリが終了しました','ng'],full:['満員で参加できません','ng']};
    return states[connection];
  }
  return {connecting,attach,current,open,received,authenticate,welcome,updateGame,stop,disconnected,detach,resetRetry,isOpen,silent,sequenced,input,send,view,status,
    get socket(){return socket},get stopped(){return stopped},get me(){return me},get isHost(){return isHost},get game(){return game}};
}
