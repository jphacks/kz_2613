// 配布zipをリポジトリ外へ展開し、同梱漏れ・改変とホストの起動を確認する。
// OS入力・PC設定変更・Tauriの画面操作は行わない。Node.js 22以上、Windows専用。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zip = path.resolve(process.argv[2] || 'dist/ReCooplay-0.1.0-windows-x64.zip');
assert.equal(process.platform, 'win32', 'Windowsで実行してください');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function inventory(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `リンクは同梱できません: ${entry.name}`);
    const relative = prefix + entry.name;
    return entry.isDirectory() ? inventory(path.join(dir, entry.name), relative + '/') : [relative];
  }).sort();
}
const expected = ['recooplay-desktop.exe', 'recooplay-host.exe', 'config.example.json',
  'allow-firewall.ps1', 'LICENSE', 'README.txt', ...['apps/web-static', 'apps/game-profiles']
    .flatMap(dir => inventory(path.join(root, dir)).map(file => `${dir}/${file}`))].sort();
function verify(dir) {
  const manifest = readJson(path.join(dir, 'package-manifest.json'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.platform, 'windows-x64');
  assert.equal(manifest.version, readJson(path.join(root, 'apps/desktop/tauri.conf.json')).version);
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof manifest.dirty, 'boolean');
  assert.deepEqual(manifest.files.map(file => file.path).sort(), expected, '同梱一覧が不足・重複しています');
  assert.deepEqual(inventory(dir), [...expected, 'package-manifest.json'].sort(), '実際の同梱物が一覧と異なります');
  for (const file of manifest.files) {
    // expectedとの一致を確認済みのパスだけを使う。
    const bytes = fs.readFileSync(path.join(dir, file.path));
    assert.equal(hash(bytes), file.sha256, `SHA-256不一致: ${file.path}`);
    if (file.path.startsWith('apps/') || ['config.example.json', 'LICENSE'].includes(file.path)) {
      assert.deepEqual(bytes, fs.readFileSync(path.join(root, file.path)), `ソースと不一致: ${file.path}`);
    }
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-package-'));
let child;
try {
  const checksum = fs.readFileSync(`${zip}.sha256`, 'utf8').trim().split(/\s+/);
  assert.equal(checksum[0], hash(fs.readFileSync(zip)), 'zipのSHA-256不一致');
  assert.equal(checksum[1], path.basename(zip));
  const expand = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive -LiteralPath $env:RECOOPLAY_TEST_ZIP -DestinationPath $env:RECOOPLAY_TEST_DEST'],
  { env: { ...process.env, RECOOPLAY_TEST_ZIP: zip, RECOOPLAY_TEST_DEST: temp }, encoding: 'utf8', windowsHide: true });
  assert.equal(expand.status, 0, expand.stderr || String(expand.error));
  const entries = fs.readdirSync(temp);
  assert.equal(entries.length, 1, 'zipのルートは配布フォルダ1つにしてください');
  const dir = path.join(temp, entries[0]);
  verify(dir);
  console.log('合格: 全同梱物・操作定義・画面・SHA-256を照合');

  // 欠落・改変が検査で検出されることを、展開したコピーだけで確認する。
  const sample = path.join(dir, 'apps/web-static/index.html');
  const bytes = fs.readFileSync(sample);
  fs.writeFileSync(sample, '破損した画面');
  assert.throws(() => verify(dir), /SHA-256不一致/);
  fs.unlinkSync(sample);
  assert.throws(() => verify(dir), /実際の同梱物/);
  fs.writeFileSync(sample, bytes);
  verify(dir);
  console.log('合格: 同梱ファイルの改変・欠落を拒否');

  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const env = { ...process.env };
  // 開発時の環境変数による元リポジトリへのフォールバックやログの混入を防ぐ。
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('RECOOPLAY_')) delete env[key];
  Object.assign(env, { PORT: String(port), RECOOPLAY_DRY_RUN: '1', RECOOPLAY_NO_CONFIG: '1', RECOOPLAY_STDIN_CONTROL: '1' });
  child = spawn(path.join(dir, 'recooplay-host.exe'), [], { cwd: dir, env, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  let outcome;
  const exited = new Promise(resolve => {
    child.once('exit', code => { outcome = code; resolve(code); });
    child.once('error', error => { outcome = error; resolve(error); });
  });
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100 && outcome === undefined; i++) {
    try { ready = (await fetch(`${url}/api/info`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (ready) break;
    await sleep(100);
  }
  assert(ready && outcome === undefined, `展開先で起動できません: ${outcome} ${stderr}`);
  for (const file of inventory(path.join(dir, 'apps/web-static'))) {
    const response = await fetch(`${url}/${file}`, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200, `配信失敗: ${file}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(dir, 'apps/web-static', file)), `配信内容不一致: ${file}`);
  }
  const app = await fetch(`${url}/app`, { signal: AbortSignal.timeout(3000) });
  assert.equal(app.status, 200, '/appを配信できません');
  child.stdin.end('quit\n');
  assert.equal(await Promise.race([exited, sleep(5000).then(() => 'timeout')]), 0, '正常終了しません');
  const events = inventory(path.join(dir, 'logs')).filter(file => file.endsWith('.jsonl'))
    .flatMap(file => fs.readFileSync(path.join(dir, 'logs', file), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse));
  assert(events.some(event => event.kind === 'shutdown'), '展開先に終了ログがありません');
  console.log('合格: リポジトリ外の配布ホストで全静的画面を配信し、正常終了（dry-run）');
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]);
  }
  // 削除先が、この試験で確保した一時フォルダ自身であることを確認する。
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert(path.basename(temp).startsWith('recooplay-package-'));
  assert(!fs.lstatSync(temp).isSymbolicLink());
  fs.rmSync(temp, { recursive: true, force: true });
}
