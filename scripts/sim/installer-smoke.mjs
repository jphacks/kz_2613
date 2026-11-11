// Windowsインストーラー (#219) を一時フォルダへサイレント導入し、事前チェック・同梱物・更新・アンインストールを確かめる。
// サイレントでは同意を得られないため、ランタイムの取得・ファイアウォールの変更が起きないことも確かめる。
// HKCU のアンインストール情報とスタートメニューのショートカットを一時的に作り、最後に消す。
// 既に Re:Cooplay を導入済みのPCでは、その導入を壊さないよう実行しない。Node.js 22以上、Windows専用。
//   node scripts/sim/installer-smoke.mjs [dist/ReCooplay-<版>-windows-x64-setup.exe]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/tauri.conf.json'), 'utf8')).version;
const setup = path.resolve(process.argv[2] || `dist/ReCooplay-${version}-windows-x64-setup.exe`);
assert.equal(process.platform, 'win32', 'Windowsで実行してください');
const UNINST = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCooplay';
const SETTINGS = 'HKCU\\Software\\ReCooplay';
const shortcut = path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/ReCooplay.lnk');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let passed = 0;
const ok = message => { passed++; console.log(`合格: ${message}`); };

// NSIS の /D= は引用符で囲めず最後に置く決まりなので、コマンドラインをそのまま渡す。空白のないパスだけを使う。
function run(exe, args, timeout = 120000) {
  for (const arg of [exe, ...args]) assert(!/\s/.test(arg), `空白を含む引数・パスは使わない: ${arg}`);
  const result = spawnSync(exe, args, { windowsVerbatimArguments: true, windowsHide: true, timeout, encoding: 'utf8' });
  assert(!result.error, String(result.error));
  return result.status;
}
function regValues(key) {
  const result = spawnSync('reg.exe', ['query', key], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  return Object.fromEntries(result.stdout.split(/\r?\n/).map(line => line.trim().match(/^(\S+)\s+REG_\w+\s+(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));
}
function report(file) {
  return Object.fromEntries(fs.readFileSync(file, 'latin1').split(/\r?\n/).filter(Boolean).map(line => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1).trim()];
  }));
}
function firewallRules() {
  // 読むだけ (一般ユーザー権限で可)。Re:Cooplay の名前の規則の数
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-NetFirewallRule -DisplayName 'Re:Cooplay*' -ErrorAction SilentlyContinue).Count"], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}
function inventory(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    return entry.isDirectory() ? inventory(path.join(dir, entry.name), relative + '/') : [relative];
  }).sort();
}

assert.equal(regValues(UNINST), null, '既に Re:Cooplay が導入されています。導入済みのPCではこの試験を実行しません');
const checksum = fs.readFileSync(`${setup}.sha256`, 'utf8').trim().split(/\s+/);
assert.equal(checksum[0], hash(fs.readFileSync(setup)), 'インストーラーのSHA-256不一致');
assert.equal(checksum[1], path.basename(setup));
const stage = path.join(path.dirname(setup), `ReCooplay-${version}-windows-x64`);
const manifest = readJson(path.join(stage, 'package-manifest.json'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-installer-'));
assert(!/\s/.test(temp), `一時フォルダに空白があります: ${temp}`);
const dir = path.join(temp, 'ReCooplay');
let dummy;
const rulesBefore = firewallRules();
try {
  // 1. 事前チェックだけ (導入しない)
  const plain = path.join(temp, 'report.txt');
  assert.equal(run(setup, [`/REPORT=${plain}`]), 0);
  const r = report(plain);
  assert.equal(r.version, version);
  assert.match(r.osBuild, /^\d+$/);
  assert(['x64', 'arm64', 'x86'].includes(r.arch), r.arch);
  assert(['supported', 'unsupported', 'blocked'].includes(r.osVerdict), r.osVerdict);
  assert.equal(r.osVerdict, r.arch === 'x64' && Number(r.osBuild) >= 22000 && r.osType === 'Client' ? 'supported'
    : (r.arch === 'x64' && Number(r.osBuild) >= 17763) || (r.arch === 'arm64' && Number(r.osBuild) >= 22000) ? 'unsupported' : 'blocked');
  assert.equal(r.decisions, 'report-only');
  assert.equal(regValues(UNINST), null, '事前チェックだけでは何も導入しない');
  assert(!fs.existsSync(dir));
  ok(`事前チェック: Windows ${r.osBuild} ${r.osType} ${r.arch} → ${r.osVerdict}、WebView2=${r.webview2 || '(なし)'}、VC++=${r.vcredist || '(なし)'} (${r.vcredistDetail})`);

  const simulated = path.join(temp, 'report-missing.txt');
  assert.equal(run(setup, [`/REPORT=${simulated}`, '/SIMULATE_MISSING_WEBVIEW2', '/SIMULATE_MISSING_VCREDIST']), 0);
  const m = report(simulated);
  assert.equal(m.webview2, '');
  assert.equal(m.vcredist, '');
  ok('事前チェック: ランタイムの不足を検出結果として報告する (模擬)');

  // 2. 起動中は導入しない (同じ名前のダミーを起動して確かめる。OSの ping を複製して使う)
  const fake = path.join(temp, 'recooplay-host.exe');
  fs.copyFileSync(path.join(process.env.SystemRoot, 'System32', 'PING.EXE'), fake);
  dummy = spawn(fake, ['-n', '60', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
  await sleep(500);
  assert.equal(run(setup, ['/S', `/D=${dir}`]), 3, '起動中は終了コード3で中止する');
  assert(!fs.existsSync(dir) && regValues(UNINST) === null, '起動中は何も導入しない');
  dummy.kill();
  await new Promise(resolve => dummy.exitCode !== null ? resolve() : dummy.once('exit', resolve));
  await sleep(300);
  ok('起動中のアプリがあるときは導入を中止する');

  // 3. サイレント導入。不足を模擬しても、同意がないので取得・導入・ファイアウォール変更はしない
  assert.equal(run(setup, ['/S', '/SIMULATE_MISSING_WEBVIEW2', '/SIMULATE_MISSING_VCREDIST', `/D=${dir}`]), 0);
  const expected = [...manifest.files.map(file => file.path), 'package-manifest.json', 'uninstall.exe', 'install-report.txt'].sort();
  assert.deepEqual(inventory(dir), expected, '導入先の中身が配布フォルダと異なります');
  for (const file of manifest.files) {
    assert.equal(hash(fs.readFileSync(path.join(dir, file.path))), file.sha256, `SHA-256不一致: ${file.path}`);
  }
  const installed = report(path.join(dir, 'install-report.txt'));
  assert.equal(installed.silent, '1');
  for (const word of ['webview2:declined', 'vcredist:declined', 'runtime:missing', 'firewall:declined']) {
    assert(installed.decisions.split(' ').includes(word), `記録に ${word} がありません: ${installed.decisions}`);
  }
  assert(!/fetch|installed|added/.test(installed.decisions), `同意なしで取得・導入・変更をした: ${installed.decisions}`);
  const reg = regValues(UNINST);
  assert(reg, 'アンインストール情報がありません');
  assert.equal(reg.DisplayVersion, version);
  assert.equal(path.resolve(reg.InstallLocation), path.resolve(dir));
  assert.equal(reg.QuietUninstallString, `"${path.join(dir, 'uninstall.exe')}" /S`);
  assert(fs.existsSync(shortcut), 'スタートメニューのショートカットがありません');
  assert.equal(firewallRules(), rulesBefore, 'ファイアウォールの規則が変わりました');
  ok('サイレント導入: 配布フォルダと同じ全同梱物・SHA-256、アンインストール情報・ショートカット。同意なしの取得・PC設定変更なし');

  // 4. 上書き更新: 利用者の設定・ログは残し、前の版の画面の残骸は消す
  fs.writeFileSync(path.join(dir, 'config.json'), '{"port":9000}');
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'logs', 'old.jsonl'), '{}\n');
  fs.writeFileSync(path.join(dir, 'apps/web/dist/stale-old-build.js'), '');
  assert.equal(run(setup, ['/S', `/D=${dir}`]), 0);
  assert(!fs.existsSync(path.join(dir, 'apps/web/dist/stale-old-build.js')), '前の版の画面が残っています');
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), '{"port":9000}');
  assert(fs.existsSync(path.join(dir, 'logs', 'old.jsonl')));
  for (const file of manifest.files) {
    assert.equal(hash(fs.readFileSync(path.join(dir, file.path))), file.sha256, `更新後のSHA-256不一致: ${file.path}`);
  }
  ok('上書き更新: 設定・ログを残し、前の版の画面を消す');

  // 5. サイレントのアンインストール (_?= で完了まで待つ。その場合 uninstall.exe 自身は残る)
  assert.equal(run(path.join(dir, 'uninstall.exe'), ['/S', `_?=${dir}`]), 0);
  assert.equal(regValues(UNINST), null, 'アンインストール情報が残っています');
  assert.equal(regValues(SETTINGS), null, '設定のレジストリが残っています');
  assert(!fs.existsSync(shortcut), 'ショートカットが残っています');
  assert.deepEqual(inventory(dir), ['config.json', 'logs/old.jsonl', 'uninstall.exe'], 'アプリのファイルが残っている、または利用者のデータを消しました');
  assert.equal(firewallRules(), rulesBefore, 'ファイアウォールの規則が変わりました');
  ok('サイレントのアンインストール: アプリのファイル・レジストリ・ショートカットを消し、利用者の設定・ログは残す');
} finally {
  if (dummy && dummy.exitCode === null) dummy.kill();
  // 途中で失敗しても、試験で作った導入情報を残さない
  if (regValues(UNINST) && fs.existsSync(path.join(dir, 'uninstall.exe'))) run(path.join(dir, 'uninstall.exe'), ['/S', `_?=${dir}`]);
  // 削除先が、この試験で確保した一時フォルダ自身であることを確認する。
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert(path.basename(temp).startsWith('recooplay-installer-'));
  assert(!fs.lstatSync(temp).isSymbolicLink());
  await sleep(300);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(`${passed}/5 合格（インストーラー、OS設定の変更なし）`);
