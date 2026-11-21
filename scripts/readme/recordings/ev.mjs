// node ev.mjs <port> <urlSubstring> <expression>  — 指定ページでJSを評価して結果を出す
const [port, sub, expr] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find(p => p.type === 'page' && p.url.includes(sub));
if (!page) { console.error('no page', list.map(p => p.url)); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { const r = d.result; console.log(r.exceptionDetails ? 'ERR ' + JSON.stringify(r.exceptionDetails) : typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value)); ws.close(); } };
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
