// エンジンごとの操作の読み取り (#481) を、個人のゲームを読まずに小さな fixture で確かめる。
// ホストの apps/host-rs/src/engines/ の単体試験と同じ入力・同じ期待値にしている (読む範囲をそろえるため)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  keyName, vkKey, dikKey, keyMapper, actionsFromMapper, enabledPlugins, mapperAssignments, rpgmaker, wolf, cfgBindings, actionsFromBindings,
  quake, actionsFromVcfg, source2, actionsFromControlMap, creation, findAxes, actionsFromAxes, hasCustomAxes, unityLegacy, parseOverrides, applyOverrides, engineActions,
  godotKey, actionsFromGodotProject, godot, actionsFromUeIni, unreal, zipEntries, zipRead, actionsFromCryXml, cryengine, generic2d,
  ikKey, actionsFromMappings, actionsFromInputSettings, redengine, actionsFromControls, prism3d, actionsFromInputBinding, giants,
  actionsFromFactorioConfig, factorio, actionsFromZomboidKeys, zomboid,
} from '../profiles/engines.mjs';
import zlib from 'node:zlib';

const MV_CORE = `
Input.keyMapper = {
    9: 'tab',       // tab
    13: 'ok',       // enter
    16: 'shift',    // shift
    17: 'control',  // control
    18: 'control',  // alt
    27: 'escape',   // escape
    32: 'ok',       // space
    33: 'pageup',   // pageup
    34: 'pagedown', // pagedown
    37: 'left',     // left arrow
    38: 'up',       // up arrow
    39: 'right',    // right arrow
    40: 'down',     // down arrow
    45: 'escape',   // insert
    81: 'pageup',   // Q
    87: 'pagedown', // W
    88: 'escape',   // X
    90: 'ok',       // Z
    96: 'escape',   // numpad 0
    98: 'down',     // numpad 2
    100: 'left',    // numpad 4
    102: 'right',   // numpad 6
    104: 'up',      // numpad 8
    120: 'debug'    // F9
};`;

const VCFG = `"config"
{
	"bindings"
	{
		"MOUSE1"		"+attack"
		"MOUSE2"		"+attack2"
		"w"		"+forward"
		"s"		"+back"
		"a"		"+left"
		"d"		"+right"
		"SPACE"		"+jump"
		"CTRL"		"+duck"
		"SHIFT"		"+sprint"
		"e"		"+use"
		"r"		"+reload"
		"1"		"slot1"
		"TAB"		"+showscores"
		"\`"		"toggleconsole"
		"UPARROW"		"+forward"
	}
}
`;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-engines-'));
const put = (rel, data) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };

test('キー: 仮想キーコード・DirectInput・キー名', () => {
  assert.equal(vkKey(13), 'ENTER'); assert.equal(vkKey(90), 'KEY_Z'); assert.equal(vkKey(49), 'DIGIT_1'); assert.equal(vkKey(120), 'F9'); assert.equal(vkKey(96), null);
  assert.equal(dikKey(0x11), 'KEY_W'); assert.equal(dikKey(0xc8), 'ARROW_UP'); assert.equal(dikKey(0x38), 'LALT');
  assert.equal(keyName('mouse 0'), 'MOUSE_L'); assert.equal(keyName('mouse 2'), null); assert.equal(keyName('MOUSE2'), 'MOUSE_R'); assert.equal(keyName('left shift'), 'LSHIFT');
});

test('RPGツクール: keyMapper とプラグイン', () => {
  const m = keyMapper(MV_CORE);
  assert.equal(m.length, 24);
  const a = actionsFromMapper(m);
  assert.deepEqual(a.map((x) => x.id), ['rpgmaker/ok', 'rpgmaker/shift', 'rpgmaker/escape', 'rpgmaker/pageup', 'rpgmaker/pagedown', 'rpgmaker/left', 'rpgmaker/up', 'rpgmaker/right', 'rpgmaker/down']);
  assert.equal(a[0].def, 'ENTER'); assert.equal(a[0].label, '決定'); assert.equal(a[3].def, 'PAGE_UP');
  assert.deepEqual(enabledPlugins('var $plugins =\n[\n{"name":"KeyAdd","status":true},\n{"name":"Off","status":false}\n];'), ['KeyAdd']);
  assert.deepEqual(mapperAssignments("Input.keyMapper[65] = 'skill';\nif (Input.keyMapper[66] == 'x') {}\nInput.keyMapper[ 67 ]=\"item\";"), [[65, 'skill'], [67, 'item']]);
  put('mz/js/rmmz_core.js', MV_CORE);
  put('mz/js/plugins.js', 'var $plugins = [{"name":"K","status":true,"parameters":{}}];');
  put('mz/js/plugins/K.js', "Input.keyMapper[13] = 'menu';");
  const mz = rpgmaker(path.join(tmp, 'mz'));
  assert.match(mz.source, /MZ/);
  assert.equal(mz.actions.find((x) => x.id === 'rpgmaker/ok').def, 'SPACE');
  assert.equal(mz.actions.find((x) => x.id === 'rpgmaker/menu').def, 'ENTER');
  put('mv/www/js/rpg_core.js', MV_CORE);
  assert.match(rpgmaker(path.join(tmp, 'mv')).source, /MV/);
  put('ace/Game.ini', '[Game]\r\nLibrary=System\\RGSS301.dll\r\n');
  assert.equal(rpgmaker(path.join(tmp, 'ace')).actions.find((x) => x.id === 'rpgmaker/shift').label, 'ダッシュ');
  put('xp/Game.ini', '[Game]\r\nLibrary=RGSS104E.dll\r\n');
  assert.equal(rpgmaker(path.join(tmp, 'xp')).actions.find((x) => x.id === 'rpgmaker/shift').label, 'A ボタン');
  put('2k/RPG_RT.exe', 'MZ');
  assert.equal(rpgmaker(path.join(tmp, '2k')).actions.length, 6);
  fs.mkdirSync(path.join(tmp, 'other'), { recursive: true });
  assert.equal(rpgmaker(path.join(tmp, 'other')), null);
});

test('ウディタ: Game.exe と Data.wolf / Data/BasicData', () => {
  put('wa/Game.exe', 'MZ');
  assert.equal(wolf(path.join(tmp, 'wa')), null);
  put('wa/Data.wolf', '');
  assert.ok(wolf(path.join(tmp, 'wa')));
  put('wb/Game.exe', 'MZ'); fs.mkdirSync(path.join(tmp, 'wb/Data/BasicData'), { recursive: true });
  const a = wolf(path.join(tmp, 'wb')).actions;
  assert.equal(a.length, 7); assert.equal(a[4].def, 'KEY_Z');
});

test('Quake 系・Source 1: cfg', () => {
  const cfg = 'unbindall\nbind "w" "+forward"\nbind "s" "+back"\nbind a +moveleft\nbind d +moveright\nbind SPACE "+jump"\nbind MOUSE1 "+attack"\nbind "`" "toggleconsole"\nbind "TAB" "+showscores"\nbind "1" "slot1"; bind "2" "impulse 100"\n';
  const a = actionsFromBindings(cfgBindings(cfg), 'cfg');
  assert.deepEqual(a.map((x) => x.id), ['cfg/+forward', 'cfg/+back', 'cfg/+moveleft', 'cfg/+moveright', 'cfg/+jump', 'cfg/+attack', 'cfg/impulse 100', 'cfg/slot1', 'cfg/look']);
  assert.equal(a[0].def, 'KEY_W'); assert.equal(a[5].def, 'MOUSE_L'); assert.equal(a[6].label, 'ライト'); assert.equal(a[8].type, 'mouseDelta');
  put('q/id1/config.cfg', 'bind w +forward\n');
  assert.match(quake(path.join(tmp, 'q')).source, /^Quake/);
  put('s/mymod/gameinfo.txt', '"GameInfo" {}');
  put('s/mymod/cfg/config.cfg', 'bind "e" "+use"\n');
  const s = quake(path.join(tmp, 's'));
  assert.match(s.source, /^Source/);
  assert.deepEqual([s.actions[0].label, s.actions[0].def], ['使う・調べる', 'KEY_E']);
});

test('Source 2: .vcfg と appmanifest', () => {
  const a = actionsFromVcfg(VCFG);
  const f = a.find((x) => x.id === 'source2/+forward');
  assert.deepEqual([f.label, f.def], ['前進', 'KEY_W']);
  assert.ok(a.every((x) => x.id !== 'source2/+showscores' && x.id !== 'source2/toggleconsole'));
  assert.equal(a.find((x) => x.id === 'source2/+attack').def, 'MOUSE_L');
  assert.equal(a.find((x) => x.id === 'source2/+moveleft').def, 'KEY_A', 'CS2 の +left は横移動');
  assert.ok(a.some((x) => x.type === 'mouseDelta'));
  const game = path.join(tmp, 'steam/steamapps/common/Counter-Strike Global Offensive');
  fs.mkdirSync(path.join(game, 'game/bin/win64'), { recursive: true });
  put('steam/steamapps/appmanifest_730.acf', '"AppState"\n{\n\t"appid"\t\t"730"\n\t"installdir"\t\t"Counter-Strike Global Offensive"\n}\n');
  put('steam/userdata/123/730/local/cfg/cs2_user_keys_0_slot0.vcfg', VCFG);
  const found = source2(game);
  assert.match(found.source, /\.vcfg/);
  assert.ok(found.actions.some((x) => x.id === 'source2/+jump'));
});

test('Creation Engine: ControlMap_Custom.txt と Skyrim の既定', () => {
  const text = '// Main Gameplay\nForward\t0x11\t0xff\t0x0001\t1\t1\t0\t0x8\nBack\t0x1f\t0xff\t0x0002\t1\t1\t0\t0x8\nStrafe Left\t0x1e\t0xff\t0x0004\t1\t1\t0\t0x8\n'
    + 'Right Attack/Block\t0xff\t0x0\t0x0009\t1\t1\t0\t0x8\nJump\t0x39\t0xff\t0x8000\t1\t1\t0\t0x8\nConsole\t0x29\t0xff\t0xff\t0\t0\t0\t0x8\nActivate\t0x12,0x1c\t0xff\t0x1000\t1\t1\t0\t0x8\n\n// Menu Mode\nAccept\t0x1c\t0xff\t0x1000\t0\t0\t0\t0x8\n';
  const a = actionsFromControlMap(text);
  assert.deepEqual(a.map((x) => x.id), ['creation/Forward', 'creation/Back', 'creation/Strafe Left', 'creation/Right Attack/Block', 'creation/Jump', 'creation/Activate', 'creation/look']);
  assert.deepEqual(a.slice(0, 6).map((x) => x.def), ['KEY_W', 'KEY_S', 'KEY_A', 'MOUSE_L', 'SPACE', 'KEY_E']);
  put('sky/SkyrimSE.exe', 'MZ'); put('sky/Data/Skyrim.esm', '');
  const docs = path.join(tmp, 'docs');
  assert.equal(creation(path.join(tmp, 'sky'), docs).source, 'Skyrim の既定の割当');
  put('docs/My Games/Skyrim Special Edition/ControlMap_Custom.txt', text);
  assert.equal(creation(path.join(tmp, 'sky'), docs).source, 'Creation Engine の ControlMap_Custom.txt');
  put('fo/Fallout4.exe', 'MZ'); put('fo/Data/Fallout4.esm', '');
  assert.equal(creation(path.join(tmp, 'fo'), docs), null, 'Fallout 4 は ControlMap_Custom.txt がなければ読まない');
});

// Unity の旧 Input Manager の fixture (ホストの試験と同じ並び)
function axesFixture(custom) {
  const parts = [Buffer.alloc(40, 0xab)];
  const s = (v) => { const b = Buffer.from(v, 'latin1'); const n = Buffer.alloc(4); n.writeInt32LE(b.length); const pad = Buffer.alloc((4 - (b.length % 4)) % 4); parts.push(n, b, pad); };
  const axis = (name, keys, kind, ax) => {
    s(name); s(''); s(''); keys.forEach(s);
    const f = Buffer.alloc(12); [3, 0.001, 3].forEach((v, i) => f.writeFloatLE(v, i * 4)); parts.push(f, Buffer.from([1, 0, 0, 0]));
    const t = Buffer.alloc(12); t.writeInt32LE(kind, 0); t.writeInt32LE(ax, 4); parts.push(t);
  };
  const cnt = Buffer.alloc(4); cnt.writeInt32LE(8); parts.push(cnt);
  axis('Horizontal', ['left', 'right', 'a', 'd'], 0, 0);
  axis('Vertical', ['down', 'up', 's', 'w'], 0, 0);
  axis('Fire1', ['', 'left ctrl', '', 'mouse 0'], 0, 0);
  axis(custom ? 'Attack' : 'Jump', ['', 'mouse 0', '', 'joystick button 0'], 0, 0);
  axis('Mouse X', ['', '', '', ''], 1, 0);
  axis('Mouse Y', ['', '', '', ''], 1, 1);
  if (custom) axis('MouseButton0', ['', 'mouse 0', '', ''], 0, 0);
  axis('Horizontal', ['', '', '', ''], 2, 0);
  parts.push(Buffer.alloc(16));
  return Buffer.concat(parts);
}

test('Unity の旧 Input Manager: 型情報なしで軸を読む', () => {
  const axes = findAxes(axesFixture(true));
  assert.equal(axes.length, 8);
  const a = actionsFromAxes(axes);
  assert.deepEqual(a.map((x) => x.id), ['unity/Horizontal/left', 'unity/Horizontal/right', 'unity/Vertical/down', 'unity/Vertical/up', 'unity/Attack', 'unity/look']);
  assert.equal(a[0].def, 'ARROW_LEFT'); assert.equal(a[4].def, 'MOUSE_L');
  assert.equal(hasCustomAxes(findAxes(axesFixture(false))), false);
  const rnd = Buffer.from(Array.from({ length: 20000 }, (_, i) => (Math.imul(i, 2654435761) >>> 13) & 0xff));
  assert.equal(findAxes(rnd).length, 0);
  put('u/Game_Data/globalgamemanagers', axesFixture(true));
  assert.equal(unityLegacy(path.join(tmp, 'u')).source, 'Unity の旧 Input Manager の軸');
  assert.equal(engineActions(path.join(tmp, 'u')), null, 'Unity は engineActions では読まない (.NET との順番を extract.mjs が決める)');
});

test('Unity の PlayerPrefs: Input System の上書き', () => {
  const ov = parseOverrides('{"bindings":[{"action":"Player/Jump","id":"b-jump","path":"<Keyboard>/k","interactions":"","processors":""}]}\0');
  assert.deepEqual(ov, [['b-jump', '<Keyboard>/k']]);
  const assets = [{ maps: [{ name: 'Player', bindings: [{ id: 'b-jump', action: 'Jump', path: '<Keyboard>/space' }, { id: 'other', path: '<Gamepad>/a' }] }] }];
  applyOverrides(assets, ov);
  assert.equal(assets[0].maps[0].bindings[0].path, '<Keyboard>/k');
  assert.equal(assets[0].maps[0].bindings[1].path, '<Gamepad>/a');
  assert.deepEqual(parseOverrides('ja'), []);
});

// ---------- Godot (ホストの godot.rs の試験と同じ並び) ----------
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
function vstr(parts, s) { const b = Buffer.from(s, 'utf8'); parts.push(u32(4), u32(b.length), b, Buffer.alloc((4 - (b.length % 4)) % 4)); }
function vint(parts, v) { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(u32(2), b); }
function actionValue(events) {
  const p = [u32(18), u32(2)];
  vstr(p, 'deadzone'); p.push(u32(3)); const f = Buffer.alloc(4); f.writeFloatLE(0.5); p.push(f);
  vstr(p, 'events'); p.push(u32(19), u32(events.length));
  for (const [cls, props] of events) { p.push(u32(24)); vstr(p, cls); p.push(u32(props.length)); for (const [n, v] of props) { vstr(p, n); vint(p, v); } }
  return Buffer.concat(p);
}
function godotProject(entries) {
  const p = [Buffer.from('GDPC'), Buffer.alloc(92), Buffer.from('ECFG'), u32(entries.length)];
  for (const [k, v] of entries) { const kb = Buffer.from(k); p.push(u32(kb.length), kb, u32(v.length), v); }
  return Buffer.concat(p);
}

test('Godot: project.binary の InputMap (4 と 3)', () => {
  const name = []; vstr(name, 'Test');
  const b = godotProject([
    ['application/config/name', Buffer.concat(name)],
    ['input/move_left', actionValue([['InputEventKey', [['keycode', 0], ['physical_keycode', 65]]], ['InputEventKey', [['physical_keycode', (1 << 22) | 0x0f]]]])],
    ['input/jump', actionValue([['InputEventJoypadButton', [['button_index', 0]]], ['InputEventKey', [['physical_keycode', 32]]]])],
    ['input/shoot', actionValue([['InputEventMouseButton', [['button_index', 1]]]])],
    ['input/ui_accept', actionValue([['InputEventKey', [['physical_keycode', (1 << 22) | 0x05]]]])],
    ['input/dash', actionValue([['InputEventKey', [['scancode', (1 << 24) | 0x15]]]])],
  ]);
  const a = actionsFromGodotProject(b);
  assert.deepEqual(a.map((x) => [x.id, x.label, x.def]), [['godot/move_left', 'move left', 'KEY_A'], ['godot/jump', 'jump', 'SPACE'], ['godot/shoot', 'shoot', 'MOUSE_L'], ['godot/dash', 'dash', 'LSHIFT']]);
  assert.equal(godotKey(87), 'KEY_W'); assert.equal(godotKey((1 << 24) | 0x10), 'ARROW_UP'); assert.equal(godotKey((1 << 22) | 0x1c), 'F1'); assert.equal(godotKey(0x2a), null);
  assert.deepEqual(actionsFromGodotProject(Buffer.from('GDPC\0\0\0\0random bytes without the config')), []);
  put('gd/Game.exe', Buffer.concat([Buffer.from('MZ'), godotProject([['input/jump', actionValue([['InputEventKey', [['keycode', 32]]]])]]), Buffer.from('GDPC')]));
  assert.equal(godot(path.join(tmp, 'gd')).actions[0].def, 'SPACE', 'exe の末尾に埋め込んだ PCK');
});

// ---------- Unreal ----------
const DEFAULT_INPUT = '[/Script/Engine.InputSettings]\r\n'
  + '+ActionMappings=(ActionName="Jump",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=SpaceBar)\r\n'
  + '+ActionMappings=(ActionName="Jump",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=Gamepad_FaceButton_Bottom)\r\n'
  + '+ActionMappings=(ActionName="Fire",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=LeftMouseButton)\r\n'
  + '+AxisMappings=(AxisName="MoveForward",Scale=1.000000,Key=W)\r\n+AxisMappings=(AxisName="MoveForward",Scale=-1.000000,Key=S)\r\n'
  + '+AxisMappings=(AxisName="MoveRight",Scale=1.000000,Key=D)\r\n+AxisMappings=(AxisName="Turn",Scale=1.000000,Key=MouseX)\r\n'
  + '+AxisMappings=(AxisName="LookUp",Scale=-1.000000,Key=MouseY)\r\n\r\n[/Script/Engine.Other]\r\nfoo=bar\r\n';

test('Unreal: ActionMappings・AxisMappings と pak の中の DefaultInput.ini', () => {
  const a = actionsFromUeIni(DEFAULT_INPUT);
  assert.deepEqual(a.map((x) => [x.id, x.label, x.def ?? null]), [
    ['unreal/Fire', 'Fire', 'MOUSE_L'], ['unreal/Jump', 'Jump', 'SPACE'], ['unreal/MoveForward/+', 'MoveForward forward', 'KEY_W'],
    ['unreal/MoveForward/-', 'MoveForward back', 'KEY_S'], ['unreal/MoveRight/+', 'MoveRight right', 'KEY_D'], ['unreal/look', '視点', null],
  ]);
  const user = '[/Script/Engine.InputSettings]\n-ActionMappings=(ActionName="Jump",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=SpaceBar)\n+ActionMappings=(ActionName="Jump",bShift=False,bCtrl=False,bAlt=False,bCmd=False,Key=J)\n';
  assert.equal(actionsFromUeIni(`${DEFAULT_INPUT}\n${user}`).find((x) => x.id === 'unreal/Jump').def, 'KEY_J');
  fs.mkdirSync(path.join(tmp, 'ue/MyGame/Binaries/Win64'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'ue/Engine/Binaries/Win64'), { recursive: true });
  put('ue/MyGame/Content/Paks/MyGame-WindowsNoEditor.pak', Buffer.concat([Buffer.alloc(9 * 1024 * 1024 - 10, 0xcc), Buffer.from(DEFAULT_INPUT), Buffer.from([0]), Buffer.alloc(1000, 0xee)]));
  const found = unreal(path.join(tmp, 'ue'), path.join(tmp, 'nolocal'));
  assert.match(found.source, /DefaultInput\.ini/);
  assert.ok(found.actions.some((x) => x.id === 'unreal/Jump') && !found.actions.some((x) => x.id.includes('foo')), 'チャンクの境界をまたいでも見つける');
  put('ue/MyGame/Content/Paks/MyGame-WindowsNoEditor.pak', Buffer.alloc(4096, 0xab));
  assert.equal(unreal(path.join(tmp, 'ue'), path.join(tmp, 'nolocal')), null);
});

// ---------- CryEngine ----------
function makeZip(files, deflate) {
  const out = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const body = deflate ? zlib.deflateRawSync(data) : Buffer.from(data), method = deflate ? 8 : 0, nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    out.push(lh, nb, body); central.push(ch, nb); off += 30 + nb.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...out, cd, end]);
}
const CRY_XML = `<profile version="2">
 <actionmap name="player" version="22">
  <action name="moveforward" onPress="1" onRelease="1" keyboard="w" xboxpad="xi_thumbly" />
  <action name="moveleft" onPress="1" onRelease="1" keyboard="a" />
  <action name="jump" onPress="1" keyboard="space" />
  <action name="sprint" onPress="1" keyboard="lshift" />
  <action name="attack1" onPress="1" keyboard="mouse1" />
  <action name="rotateyaw" keyboard="maxis_x" />
  <action name="use">
   <keyboard input="f" />
  </action>
  <action name="voice" keyboard="" />
 </actionmap>
</profile>`;

test('CryEngine: zip と actionmaps', () => {
  for (const deflate of [false, true]) {
    const z = makeZip([['Libs/Config/a.xml', Buffer.from('<x/>')], ['b.txt', Buffer.from('hello hello hello')]], deflate);
    for (const b of [z, Buffer.concat([Buffer.from('MZ some exe bytes'), z])]) {
      const e = zipEntries(b);
      assert.equal(e.length, 2); assert.equal(e[0].name, 'Libs/Config/a.xml'); assert.equal(zipRead(b, e[1]).toString(), 'hello hello hello');
    }
  }
  assert.deepEqual(zipEntries(Buffer.from('not a zip')), []);
  const a = actionsFromCryXml(CRY_XML);
  assert.deepEqual(a.map((x) => [x.id, x.def ?? null]), [['cryengine/moveforward', 'KEY_W'], ['cryengine/moveleft', 'KEY_A'], ['cryengine/jump', 'SPACE'], ['cryengine/sprint', 'LSHIFT'], ['cryengine/attack1', 'MOUSE_L'], ['cryengine/use', 'KEY_F'], ['cryengine/look', null]]);
  fs.mkdirSync(path.join(tmp, 'cry/Bin64'), { recursive: true });
  put('cry/GameData/GameData.pak', makeZip([['Libs/Config/defaultProfile.xml', Buffer.from(CRY_XML)]], true));
  assert.equal(cryengine(path.join(tmp, 'cry')).actions[0].id, 'cryengine/moveforward');
  put('cry/GameData/GameData.pak', Buffer.alloc(2048, 0x5a));
  assert.equal(cryengine(path.join(tmp, 'cry')), null);
});

test('2D 向けの汎用の割当: GameMaker・LÖVE・HTML5 だけ', () => {
  for (const [sub, files, want] of [['gm', ['data.win'], 'GameMaker'], ['love', ['love.dll', 'lua51.dll'], 'LÖVE'], ['love-only', ['love.dll'], null],
    ['nw', ['nw.dll'], 'HTML5'], ['electron', ['resources/app.asar'], 'HTML5'], ['xna', ['MonoGame.Framework.dll'], null]]) {
    for (const f of files) put(`g2d/${sub}/${f}`, 'x');
    const got = generic2d(path.join(tmp, 'g2d', sub));
    if (want) { assert.ok(got.source.startsWith(want), sub); assert.equal(got.actions.length, 10); assert.ok(got.actions.every((a) => a.def)); }
    else assert.equal(got, null, sub);
  }
  put('g2d/mv/www/js/rpg_core.js', MV_CORE); put('g2d/mv/nw.dll', 'x');
  assert.match(engineActions(path.join(tmp, 'g2d', 'mv')).source, /MV/, 'ツクール MV (NW.js) はツクールとして読む');
});

// ---------- #505〜#509 (ホストの各 .rs の試験と同じ入力・期待値) ----------
const CP_XML = `<?xml version="1.0"?>
<bindings>
  <mapping name="LeftX_Axis" type="Axis">
    <button id="IK_A" val="-1.0" />
    <button id="IK_D" val="1.0" />
    <button id="IK_Pad_LeftAxisX" />
  </mapping>
  <mapping name="Jump_Button" type="Button">
    <button id="IK_Space" />
    <button id="IK_Pad_A_CROSS" />
  </mapping>
  <mapping name="Shoot_Button" type="Button">
    <button id="IK_LeftMouse" />
  </mapping>
  <mapping name="MouseX_Axis" type="Axis">
    <button id="IK_MouseX" />
  </mapping>
  <mapping name="PadOnly" type="Button">
    <button id="IK_Pad_B_CIRCLE" />
  </mapping>
</bindings>`;
const W3_SETTINGS = '[Exploration]\r\nIK_W=(Action=MoveForward)\r\nIK_Up=(Action=MoveForward)\r\nIK_S=(Action=MoveBackward)\r\nIK_Space=(Action=Jump)\r\nIK_LShift=(Action=Sprint)\r\nIK_MouseX=(Action=GI_MouseDampX,State=Axis,IdleTime=0)\r\nIK_Pad_A_CROSS=(Action=Interact)\r\n\r\n[Combat]\r\nIK_LeftMouse=(Action=AttackLight)\r\nIK_W=(Action=MoveForward)\r\n\r\n[Horse]\r\nIK_X=(Action=HorseDismount)\r\n';

test('REDengine: Cyberpunk 2077 の mappings と Witcher 3 の input.settings', () => {
  assert.deepEqual(actionsFromMappings(CP_XML).map((a) => [a.id, a.label, a.def ?? null]), [
    ['red/LeftX_Axis/-', 'LeftX -', 'KEY_A'], ['red/LeftX_Axis/+', 'LeftX +', 'KEY_D'], ['red/Jump_Button', 'Jump', 'SPACE'], ['red/Shoot_Button', 'Shoot', 'MOUSE_L'], ['red/look', '視点', null]]);
  assert.deepEqual(actionsFromInputSettings(W3_SETTINGS).map((a) => [a.id, a.def ?? null]), [
    ['red/MoveForward', 'KEY_W'], ['red/MoveBackward', 'KEY_S'], ['red/Jump', 'SPACE'], ['red/Sprint', 'LSHIFT'], ['red/AttackLight', 'MOUSE_L'], ['red/look', null]]);
  assert.equal(ikKey('IK_Pad_A_CROSS'), null); assert.equal(ikKey('IK_Escape'), 'ESC');
  put('cp/bin/x64/Cyberpunk2077.exe', 'MZ'); put('cp/r6/config/inputUserMappings.xml', CP_XML);
  assert.match(redengine(path.join(tmp, 'cp'), path.join(tmp, 'docs2')).source, /Cyberpunk/);
  put('w3/bin/x64_dx12/witcher3.exe', 'MZ'); put('docs2/The Witcher 3/input.settings', W3_SETTINGS);
  assert.match(redengine(path.join(tmp, 'w3'), path.join(tmp, 'docs2')).source, /Witcher/);
});

const CONTROLS_SII = 'SiiNunit\n{\ninput_config : .config {\n config_lines: 6\n config_lines[0]: "mix steerleft `keyboard.a?0`"\n config_lines[1]: "mix aforward `keyboard.w?0 | joy.b1?0`"\n config_lines[2]: "mix lblinker `keyboard.leftbracket?0`"\n config_lines[3]: "mix steering `joy.x?0`"\n config_lines[4]: "mix horn `keyboard.h?0`"\n config_lines[5]: "mix activate `mouse.button_left?0`"\n}\n}\n';
test('Prism3D: controls.sii', () => {
  assert.deepEqual(actionsFromControls(CONTROLS_SII).map((a) => [a.id, a.label, a.def]), [
    ['scs/steerleft', '左へハンドル', 'KEY_A'], ['scs/aforward', 'アクセル', 'KEY_W'], ['scs/lblinker', '左ウインカー', 'LBRACKET'], ['scs/horn', 'クラクション', 'KEY_H'], ['scs/activate', '使う・調べる', 'MOUSE_L']]);
  assert.deepEqual(actionsFromControls('ScsC\u0001\u0002encrypted'), []);
  put('ets/bin/win_x64/eurotrucks2.exe', 'MZ'); put('docs3/Euro Truck Simulator 2/profiles/4142/controls.sii', CONTROLS_SII);
  assert.equal(prism3d(path.join(tmp, 'ets'), path.join(tmp, 'docs3')).actions.length, 5);
});

const INPUT_BINDING = `<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<inputBinding>
    <actionBinding action="MENU_ACCEPT">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_return" index="1" />
    </actionBinding>
    <actionBinding action="AXIS_MOVE_FORWARD_PLAYER">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_s" axisComponent="-" neutralInput="0" index="1" />
        <binding device="KB_MOUSE_DEFAULT" input="KEY_w" axisComponent="+" neutralInput="0" index="1" />
        <binding device="0_XINPUT_GAMEPAD" input="AXIS_2" axisComponent="+" index="1" />
    </actionBinding>
    <actionBinding action="JUMP">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_space" index="1" />
    </actionBinding>
    <actionBinding action="AXIS_LOOK_LEFTRIGHT_PLAYER">
        <binding device="KB_MOUSE_DEFAULT" input="MOUSE_AXIS_X" axisComponent="+" index="1" />
    </actionBinding>
    <actionBinding action="IMPLEMENT_EXTRA">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_lctrl KEY_v" index="1" />
    </actionBinding>
    <actionBinding action="ENTER">
        <binding device="KB_MOUSE_DEFAULT" input="KEY_e" index="1" />
    </actionBinding>
</inputBinding>`;
test('GIANTS Engine: inputBinding.xml', () => {
  const a = actionsFromInputBinding(INPUT_BINDING);
  assert.deepEqual(a.map((x) => [x.id, x.def ?? null]), [
    ['giants/AXIS_MOVE_FORWARD_PLAYER/-', 'KEY_S'], ['giants/AXIS_MOVE_FORWARD_PLAYER/+', 'KEY_W'], ['giants/JUMP', 'SPACE'], ['giants/ENTER', 'KEY_E'], ['giants/MENU_ACCEPT', 'ENTER'], ['giants/look', null]]);
  assert.equal(a[0].label, 'move forward player -');
  put('fs/FarmingSimulator2025.exe', 'MZ'); put('docs4/My Games/FarmingSimulator2025/inputBinding.xml', INPUT_BINDING);
  assert.match(giants(path.join(tmp, 'fs'), path.join(tmp, 'docs4')).source, /GIANTS/);
});

test('Factorio: config.ini の controls と既定', () => {
  const a = actionsFromFactorioConfig('[path]\nread-data=__PATH__executable__/../../data\n\n[controls]\nmove-up=Up\nrotate=SHIFT + R\nmine=mouse-button-2\n');
  assert.equal(a.length, 14); assert.equal(a[0].def, 'ARROW_UP'); assert.equal(a[1].def, 'KEY_S');
  assert.equal(a.find((x) => x.id === 'factorio/rotate').def, null); assert.equal(a.find((x) => x.id === 'factorio/mine').def, 'MOUSE_R');
  assert.equal(actionsFromFactorioConfig('').length, 14);
  put('fac/bin/x64/factorio.exe', 'MZ');
  assert.equal(factorio(path.join(tmp, 'fac'), path.join(tmp, 'noappdata')).source, 'Factorio の既定のキー');
});

test('Project Zomboid: keys.ini (DirectInput と GLFW)', () => {
  const a = actionsFromZomboidKeys('VERSION=2\nForward=17\nBackward=31\nLeft=30\nRight=32\nRun=42\nMelee=57\nMain Menu=1\nUnbound=0\n');
  assert.deepEqual(a.map((x) => [x.id, x.def ?? null]), [
    ['zomboid/Forward', 'KEY_W'], ['zomboid/Backward', 'KEY_S'], ['zomboid/Left', 'KEY_A'], ['zomboid/Right', 'KEY_D'], ['zomboid/Run', 'LSHIFT'], ['zomboid/Melee', 'SPACE'], ['zomboid/look', null]]);
  const b = actionsFromZomboidKeys('Forward=87\nBackward=83\nRun=340\n');
  assert.equal(b[0].def, 'KEY_W'); assert.equal(b[2].def, 'LSHIFT');
  put('pz/ProjectZomboid64.exe', 'MZ'); fs.mkdirSync(path.join(tmp, 'pz/media'), { recursive: true }); put('home/Zomboid/Lua/keys.ini', 'Forward=17\n');
  assert.equal(zomboid(path.join(tmp, 'pz'), path.join(tmp, 'home')).actions[0].def, 'KEY_W');
});

try {
  let ok = 0;
  for (const [name, fn] of tests) { fn(); ok++; console.log(`  ok   ${name}`); }
  console.log(`\n${ok}/${tests.length} 合格 (profile-engines)`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
