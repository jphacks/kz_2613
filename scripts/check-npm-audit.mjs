// apps/web のロックファイルを npm audit で監査する。
// apps/web/npm-audit-exceptions.json に理由と期限つきで書いた勧告だけを除外し、
// それ以外の勧告・期限切れの除外・修正版が出た除外は失敗にする。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');
const today = new Date().toISOString().slice(0, 10);

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--package-lock-only', '--json'], {
      cwd: webDir, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // 脆弱性があると npm audit は終了コード1を返す。出力のJSONで判定する。
    if (typeof error.stdout === 'string' && error.stdout.trim()) return error.stdout;
    throw error;
  }
}

const exceptions = JSON.parse(readFileSync(join(webDir, 'npm-audit-exceptions.json'), 'utf8')).exceptions;
for (const ex of exceptions) {
  if (!/^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/.test(ex.id) || !/^\d{4}-\d{2}-\d{2}$/.test(ex.expires) || !ex.reason) {
    throw new Error(`除外の書式が不正: ${JSON.stringify(ex)}`);
  }
}
const byId = new Map(exceptions.map((ex) => [ex.id, ex]));

const report = JSON.parse(runAudit());
if (report.error) throw new Error(`npm audit の実行に失敗: ${JSON.stringify(report.error)}`);

const failures = [];
const used = new Set();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  // via の文字列は他パッケージ経由の影響。元の勧告（オブジェクト）だけを判定すれば足りる。
  for (const via of vuln.via.filter((v) => typeof v === 'object')) {
    const id = via.url?.split('/').pop();
    const ex = byId.get(id);
    const label = `${name} ${via.severity} ${id}: ${via.title}`;
    if (!ex) failures.push(`未対応の勧告: ${label}`);
    else if (ex.expires < today) failures.push(`除外の期限切れ（${ex.expires}）: ${label}。修正版を確かめ、除外を外すか理由と期限を更新する。`);
    else if (vuln.fixAvailable === true) failures.push(`修正版あり: ${label}。npm audit fix で更新し、除外を外す。`);
    else {
      used.add(id);
      console.log(`除外（${ex.expires}まで）: ${label}`);
    }
  }
}
for (const id of byId.keys()) {
  if (!used.has(id)) console.log(`::warning::使われていない除外: ${id}。npm-audit-exceptions.json から外す。`);
}

if (failures.length) {
  for (const f of failures) console.error(`::error::${f}`);
  process.exit(1);
}
console.log(`npm audit: 除外以外の勧告なし（${report.metadata?.vulnerabilities?.total ?? 0}件中、除外 ${used.size}件の勧告）`);
