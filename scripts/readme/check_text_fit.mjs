// READMEの図（SVG）の文字が、閲覧者の端末のフォントで描いてもはみ出さないかを確かめる。
//
// 図の文字の多くは閲覧者の端末の日本語フォントで描く（.gh・.jp の指定。assets/readme/README.md の「フォント」）。
// 端末ごとに字幅が違うので、次のフォントに差し替えてヘッドレスChromeで描き、各 <text> の外枠を調べる。
//
//   windows：差し替えない（この検査を走らせる Windows の Segoe UI・Yu Gothic UI。基準にする）
//   android：Noto Sans ＋ Noto Sans JP（Android・Linux の標準に近い。data/local/readme-fonts の TTF を使う）
//   apple  ：Arial ＋ Noto Sans JP（macOS・iPhone の代わり。英字は SF Pro に近い Helvetica と同じ字幅の Arial、
//            日本語はヒラギノと同じく仮名・漢字が1字1em の Noto Sans JP。Windows の Yu Gothic UI は仮名が狭い）
//
// 調べること（基準の windows で起きていない、新しいものだけを数える）
//   1. 図の外（viewBox の外）へ1px以上はみ出す
//   2. 文字を囲む枠（その文字の中心を含むいちばん小さい <rect>）から1px以上はみ出す
//   3. ほかの文字と2px以上重なる
//
//   node scripts/readme/check_text_fit.mjs            # 問題があれば一覧にして終了コード1
//   node scripts/readme/check_text_fit.mjs --all      # 基準（windows）で起きているものも出す
//
// PC版・中間の版（*-mid-*）・スマホ版のうち、README が使うものをすべて調べる。
// 録画の図の切り絵（pieces/）は元の図（controllers-*.svg・focus-*.svg）を切り出したものなので、元の図で調べる。
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONTS = path.join(ROOT, 'data/local/readme-fonts');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9761;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOW_ALL = process.argv.includes('--all');

const fontUrl = f => pathToFileURL(path.join(FONTS, f)).href;
const PROFILES = {
  windows: '',
  android: `@font-face{font-family:TNotoSans;src:url(${fontUrl('NotoSans[wdth,wght].ttf')});font-weight:100 900}
@font-face{font-family:TNotoSansJP;src:url(${fontUrl('NotoSansJP[wght].ttf')});font-weight:100 900}
svg .gh,svg .jp{font-family:TNotoSans,TNotoSansJP,sans-serif!important}`,
  apple: `@font-face{font-family:TNotoSansJP;src:url(${fontUrl('NotoSansJP[wght].ttf')});font-weight:100 900}
svg .gh,svg .jp{font-family:Arial,TNotoSansJP,sans-serif!important}`,
};

function svgFiles() {
  const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const set = new Set();
  for (const [, s] of md.matchAll(/(?:src|srcset)="(assets\/readme\/[^"]+-light\.svg)"/g)) {
    set.add(s.includes('/pieces/') ? s.replace(/pieces\/([a-z]+)-(narrow|compact|mid|wide)-light-.*$/, (_, n, m) => `${n}-${m === 'wide' ? '' : m + '-'}light.svg`) : s);
  }
  return [...set].filter(s => fs.existsSync(path.join(ROOT, s))).sort();
}

const MEASURE = `(() => {
  const svg = document.querySelector('svg'); const vb = svg.viewBox.baseVal; const o = svg.getBoundingClientRect();
  const k = vb.width / o.width;
  const box = e => { const r = e.getBoundingClientRect(); return {x: vb.x + (r.left - o.left) * k, y: vb.y + (r.top - o.top) * k, w: r.width * k, h: r.height * k}; };
  const rects = [...svg.querySelectorAll('rect')].filter(r => !r.closest('defs,clipPath,mask,pattern,symbol')).map(box).filter(b => b.w > 4 && b.h > 4);
  const texts = [...svg.querySelectorAll('text')].filter(t => !t.closest('defs') && t.textContent.trim()).map((t, i) => ({i, s: t.textContent.trim().slice(0, 24), fixed: t.hasAttribute('textLength'), ...box(t)}));
  return {vb: {x: vb.x, y: vb.y, w: vb.width, h: vb.height}, rects, texts};
})()`;

function problems(m) {
  const out = new Map();
  const add = (t, kind, d) => out.set(`${t.i}:${kind}`, `${kind}（${d.toFixed(1)}px）「${t.s}」`);
  for (const t of m.texts) {
    if (t.fixed) continue;
    const over = Math.max(m.vb.x - t.x, t.x + t.w - (m.vb.x + m.vb.w));
    if (over >= 1) add(t, '図の外', over);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const inside = m.rects.filter(r => r.x <= cx && cx <= r.x + r.w && r.y <= cy && cy <= r.y + r.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (inside) {
      const o = Math.max(inside.x - t.x, t.x + t.w - (inside.x + inside.w));
      if (o >= 1) add(t, '枠の外', o);
    }
  }
  for (const a of m.texts) for (const b of m.texts) {
    if (a.i >= b.i) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    // 行の高さ（上下の余白）は字形より大きいので、縦の重なりが字の高さの半分を超えるときだけ同じ行とみなす
    if (ox >= 2 && oy > Math.min(a.h, b.h) / 2) add(a, `「${b.s}」と重なる`, ox);
  }
  return out;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recooplay-fit-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(dir, 'chrome')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--allow-file-access-from-files', 'about:blank'], {stdio: 'ignore'});
  let ws, id = 1; const pend = new Map();
  for (let i = 0; i < 100 && !ws; i++) {
    try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); } catch { await sleep(200); }
  }
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const call = (method, params = {}, sessionId) => new Promise(r => { const i = id++; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params, ...(sessionId ? {sessionId} : {})})); });
  const {result: {targetId}} = await call('Target.createTarget', {url: 'about:blank'});
  const {result: {sessionId}} = await call('Target.attachToTarget', {targetId, flatten: true});
  const ev = async expr => (await call('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}, sessionId)).result.result.value;

  let bad = 0;
  for (const file of svgFiles()) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^<\?xml[^>]*>/, '');
    const results = {};
    for (const [name, css] of Object.entries(PROFILES)) {
      const page = path.join(dir, `${name}.html`);
      fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>body{margin:0}${css}</style>${src}`);
      await call('Page.navigate', {url: pathToFileURL(page).href}, sessionId);
      await sleep(150);
      await ev('document.fonts.ready.then(() => true)');
      results[name] = problems(await ev(MEASURE));
    }
    const base = results.windows;
    const lines = [];
    for (const [name, found] of Object.entries(results)) {
      for (const [k, msg] of found) if (SHOW_ALL || (name !== 'windows' && !base.has(k))) lines.push(`  [${name}] ${msg}`);
    }
    if (lines.length) { bad += lines.length; console.log(file); console.log([...new Set(lines)].join('\n')); }
  }
  ws.close(); chrome.kill();
  if (bad) { console.log(`\nNG: ${bad} 件`); process.exit(1); }
  console.log('PASS: どのフォントでも、文字が図・枠の外へはみ出さず、重ならない');
}

main();
