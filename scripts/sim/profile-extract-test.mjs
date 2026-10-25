// 個人のゲームを読まず、埋め込みInput Systemの小さなfixtureから下書きを検証する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {keyId,draft,unityInputActions} from '../profiles/extract.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recooplay-extract-'));
try {
  const data=path.join(dir,'Fixture_Data'); fs.mkdirSync(data);
  fs.writeFileSync(path.join(data,'resources.assets'),JSON.stringify({version:1,name:'Fixture',maps:[{name:'Player',actions:[{name:'Jump',expectedControlType:'Button'}],bindings:[{action:'Jump',path:'<Keyboard>/j'}]}]}));
  const found=unityInputActions(dir);
  assert.equal(found.actions[0].def,'KEY_J');
  const p=draft({id:'fixture',name:'試験',appid:'123',engine:'unity',source:found.source,suitability:'unknown',actions:found.actions});
  assert.equal(p.verification.status,'extracted');
  assert.equal(p.actions[0].default,'KEY_J');
  assert.equal(keyId('NumPad0'),null);
  assert.equal(keyId('<Mouse>/leftButton'),'MOUSE_L');
  console.log('合格: 埋め込み定義の静的抽出・未検証の下書き・未対応キー');
} finally { fs.rmSync(dir,{recursive:true}); }
