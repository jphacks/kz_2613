// エンジンごとの操作の読み取り (#481) を、個人のゲームを読まずに小さな fixture で確かめる。
// ホストの apps/host-rs/src/engines/ の単体試験と同じ入力・同じ期待値にしている (読む範囲をそろえるため)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  keyName, vkKey, dikKey, keyMapper, actionsFromMapper, enabledPlugins, mapperAssignments, rpgmaker, wolf, cfgBindings, actionsFromBindings,
  quake, actionsFromVcfg, source2, actionsFromControlMap, creation, findAxes, actionsFromAxes, hasCustomAxes, unityLegacy, parseOverrides, applyOverrides, engineActions,
} from '../profiles/engines.mjs';

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

try {
  let ok = 0;
  for (const [name, fn] of tests) { fn(); ok++; console.log(`  ok   ${name}`); }
  console.log(`\n${ok}/${tests.length} 合格 (profile-engines)`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
