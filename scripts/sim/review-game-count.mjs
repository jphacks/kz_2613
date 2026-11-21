import assert from 'node:assert/strict';
import {gamesCountText} from '../../apps/web/src/shared/model/presentation.ts';
for(const list of [[{source:'minecraft'}],[{source:'minecraft'},{source:'registered'}]]){
 const shown=gamesCountText(list,false);console.log({tiles:list.length,shown});
 assert(shown.includes(`全 ${list.length} 件`),'自動検出0件でも、固定Minecraftと手動登録を含むタイル総数を表示する');
}
