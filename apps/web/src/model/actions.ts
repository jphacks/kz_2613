import type {PhoneGame,Slot} from '../contracts.ts';
// 描画と送信の両方が、サーバーの担当操作IDを参照する。出力キーはここで決めない。
export function myActions(game:PhoneGame|null, slot:Slot|null) {
  const profile=game?.profile;
  if(!profile||!game.assigned||!Object.keys(game.assigned).length)return null;
  return (slot ? game.assigned[slot] ?? [] : []).flatMap(id=>{
    const action=profile.actions.find(action=>action.id===id);
    return action ? [action] : [];
  });
}
export function generatedKey(game:PhoneGame, slot:Slot) {
  const actions=myActions(game,slot);
  return actions ? JSON.stringify([game.profile?.id,actions.map(a=>[a.id,a.type,a.group]),actions.map(a=>game.keys?.actions?.[a.id]?.label??null)]) : '';
}
